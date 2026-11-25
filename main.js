'use strict';
const { app, BrowserWindow, ipcMain, dialog, shell, screen } = require('electron');
const path = require('path');
const conf = require('./src/conf');
const sldl = require('./src/sldl');
const devices = require('./src/devices');
const sync = require('./src/sync');
const ipod = require('./src/ipod');

let win;
let job = null;

function createWindow() {
  // Opens bottom-left of the screen the cursor is on, at the size Jack left it (2026-11-12).
  const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  const width = Math.min(671, area.width); const height = Math.min(535, area.height);
  win = new BrowserWindow({
    width, height, x: area.x, y: area.y + area.height - height,
    minWidth: 420, minHeight: 440,
    titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 18, y: 18 },
    vibrancy: 'under-window', visualEffectState: 'active', backgroundColor: '#00000000', transparent: true,
    title: 'SLDL Downloader',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });

const push = (data) => { if (win && !win.isDestroyed()) win.webContents.send('dl:event', data); };

ipcMain.handle('settings:get', () => conf.redact(conf.read()));
ipcMain.handle('settings:save', (_e, values) => {
  const clean = {};
  for (const k of conf.KEYS) if (typeof values[k] === 'string') clean[k] = values[k].trim();
  if (clean.pass === '********') delete clean.pass; // unchanged
  conf.write(clean);
  return conf.redact(conf.read());
});
ipcMain.handle('dialog:folder', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'], buttonLabel: 'Choose' });
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.handle('devices:list', () => devices.list());
ipcMain.handle('ipod:ready', () => ipod.ready());
ipcMain.handle('ipod:setup', () => ipod.setup());
ipcMain.handle('devices:music', () => devices.musicSources());
const EXTERNAL = new Set(['https://www.slsknet.org/']);
ipcMain.handle('app:open-external', (_e, url) => { if (EXTERNAL.has(url)) return shell.openExternal(url); });
ipcMain.handle('file:reveal', (_e, p) => { if (typeof p === 'string') shell.showItemInFolder(p); });

ipcMain.handle('download:start', async (_e, { input, format, name }) => {
  if (job) throw new Error('A download is already running.');
  const ev = sldl.download({ input, format: format || undefined, name: name || undefined });
  job = ev;
  ev.on('line', (line) => push({ type: 'line', line }));
  for (const t of ['total', 'searching', 'progress', 'done', 'failed']) ev.on(t, (e, counts) => push({ ...e, counts }));
  try {
    const r = await ev.done;
    push({ type: 'finished', ...r });
    return r;
  } finally { job = null; }
});
ipcMain.handle('download:cancel', () => { if (job && job.cancel) job.cancel(); });

ipcMain.handle('send:run', async (_e, { folder, route, dest, name, layout, force }) => {
  const tracks = sldl.listTracks(folder);
  const plName = name || path.basename(folder);
  if (route === 'ipod') {
    const d = (await devices.list()).find((x) => x.volume && x.status !== 'recovery');
    if (!d) throw new Error('No mounted iPod found. Plug it in and wait for it to mount.');
    const r = await ipod.addToIpod({
      mount: d.volume.mount, guid: ipod.guidOf(d.serial), playlist: plName, files: tracks,
      onEvent: (e) => { if (e.type === 'track') push({ type: 'copy', done: e.n, total: e.of }); },
    });
    return { route, ...r };
  }
  if (route === 'music') return { route, ...(await sync.addToMusic(plName, tracks)) };
  const refuse = sync.refuseStockIpod(dest);
  if (refuse && !force) throw new Error(refuse);
  return { route, ...(await sync.copyToPlayer({
    folder, dest, playlist: plName, layout,
    onProgress: (p) => push({ type: 'copy', ...p }),
  })) };
});
