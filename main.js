'use strict';
const { app, BrowserWindow, ipcMain, dialog, shell, screen } = require('electron');
const path = require('path');
const conf = require('./src/conf');
const sldl = require('./src/sldl');
const devices = require('./src/devices');
const sync = require('./src/sync');
const ipod = require('./src/ipod');
const spotify = require('./src/spotify');
const prefs = require('./src/prefs');
const plan = require('./src/plan');
const dedupe = require('./src/dedupe');
const os = require('os');

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

const appPrefs = () => { const p = prefs.read(); return { allowFlac: p.allowFlac, saveToLibrary: p.saveToLibrary, defaultFormat: p.defaultFormat }; };
ipcMain.handle('settings:get', () => ({ ...conf.redact(conf.read()), ...appPrefs() }));
ipcMain.handle('settings:save', (_e, values) => {
  const clean = {};
  for (const k of conf.KEYS) if (typeof values[k] === 'string') clean[k] = values[k].trim();
  if (clean.pass === '********') delete clean.pass; // unchanged
  conf.write(clean);
  const pv = {};
  for (const k of ['allowFlac', 'saveToLibrary']) if (typeof values[k] === 'boolean') pv[k] = values[k];
  if (['mp3', 'flac'].includes(values.defaultFormat)) pv.defaultFormat = values.defaultFormat;
  if (Object.keys(pv).length) prefs.write(pv);
  return { ...conf.redact(conf.read()), ...appPrefs() };
});
ipcMain.handle('dialog:folder', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'], buttonLabel: 'Choose' });
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.handle('devices:list', () => devices.list());
// How much room the connected player has (or a 16 GB iPod's worth when none is mounted).
async function budgetInfo() {
  const dev = (await devices.list()).find((d) => d.volume && d.volume.free);
  return { budget: dev ? Math.floor(dev.volume.free * 0.97) : spotify.DEFAULT_BUDGET, budgetFrom: dev ? `${dev.model} (free space)` : 'a 16 GB iPod', rates: spotify.RATES };
}
// A profile URL: its public playlists with their songs and size estimates.
ipcMain.handle('profile:list', async (_e, { input }) => {
  const user = spotify.parseProfile(input);
  if (!user) throw new Error('That is not a Spotify profile link.');
  return { user, playlists: await spotify.profilePlaylists(user, { items: true }), ...(await budgetInfo()) };
});
// One playlist link, in the same shape, so the Download page plans it the same way.
ipcMain.handle('playlist:plan', async (_e, { input }) => {
  const id = spotify.playlistId(input);
  if (!id) throw new Error('That is not a Spotify playlist link.');
  return { playlists: [await spotify.playlistPlan(id)], ...(await budgetInfo()) };
});
// The folders searched for "do we already have this song": the iPod folder, the Mac library and Lily's folder.
const indexDirs = () => [conf.read().path, prefs.read().libraryDir, path.join(os.homedir(), 'Music', 'Lily')];
let batchIndex = null;
// For the planner: which songs already exist on this Mac, and which repeat an earlier selected playlist.
ipcMain.handle('existing:check', async (_e, { playlists }) => {
  batchIndex = await dedupe.buildIndex(indexDirs());
  const seen = new Set();
  return playlists.map((items) => items.map((it) => {
    const key = dedupe.keyOf(it.title, it.artist);
    const have = !!batchIndex.find(it.title, it.artist) || seen.has(key); seen.add(key);
    return have;
  }));
});
// Download one planned playlist: songs we already have are reused, the rest are fetched (see src/plan.js).
ipcMain.handle('download:run', async (_e, { name, items, saveToLibrary, first }) => {
  if (job) throw new Error('A download is already running.');
  if (first || !batchIndex) batchIndex = await dedupe.buildIndex(indexDirs());
  const ev = plan.runPlaylist({ name, items, saveToLibrary, index: batchIndex });
  job = ev;
  ev.on('line', (line) => push({ type: 'line', line }));
  for (const t of ['total', 'searching', 'progress', 'done', 'failed', 'reused']) ev.on(t, (e, counts) => push({ ...e, counts }));
  try { return await ev.done; } finally { job = null; }
});
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
