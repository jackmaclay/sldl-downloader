'use strict';
const { app, BrowserWindow, ipcMain, dialog, shell, screen, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const conf = require('./src/conf');
const sldl = require('./src/sldl');
const devices = require('./src/devices');
const sync = require('./src/sync');
const ipod = require('./src/ipod');
const spotify = require('./src/spotify');
const prefs = require('./src/prefs');
const plan = require('./src/plan');
const dedupe = require('./src/dedupe');
const known = require('./src/known');
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
    title: 'myPod',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.loadFile(path.join(__dirname, 'index.html'));
}

// The Dock icon follows the Settings choice while the app runs. The icon in Finder and Applications is baked into the app and does not change.
function applyIcon() {
  if (process.platform !== 'darwin' || !app.dock) return;
  try {
    if (prefs.read().icon === 'alt') { app.dock.setIcon(nativeImage.createFromBuffer(fs.readFileSync(path.join(__dirname, 'assets', 'icon-alt.png')))); return; }
    const own = [path.join(process.resourcesPath || '', 'icon.icns'), path.join(__dirname, 'build', 'icon.icns')].find((p) => fs.existsSync(p)); // the app's own icon
    if (own) app.dock.setIcon(nativeImage.createFromPath(own));
  } catch { /* the icon is cosmetic */ }
}
app.whenReady().then(() => { createWindow(); applyIcon(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });

const push = (data) => { if (win && !win.isDestroyed()) win.webContents.send('dl:event', data); };

const appPrefs = () => { const p = prefs.read(); return { allowFlac: p.allowFlac, saveToLibrary: p.saveToLibrary, defaultFormat: p.defaultFormat, autoEject: p.autoEject, icon: p.icon }; };
ipcMain.handle('settings:get', () => ({ ...conf.redact(conf.read()), ...appPrefs() }));
ipcMain.handle('settings:save', (_e, values) => {
  const clean = {};
  for (const k of conf.KEYS) if (typeof values[k] === 'string') clean[k] = values[k].trim();
  if (clean.pass === '********') delete clean.pass; // unchanged
  conf.write(clean);
  const pv = {};
  for (const k of ['allowFlac', 'saveToLibrary', 'autoEject']) if (typeof values[k] === 'boolean') pv[k] = values[k];
  if (['mp3', 'flac'].includes(values.defaultFormat)) pv.defaultFormat = values.defaultFormat;
  if (['original', 'alt'].includes(values.icon)) pv.icon = values.icon;
  if (Object.keys(pv).length) prefs.write(pv);
  if (pv.icon) applyIcon();
  return { ...conf.redact(conf.read()), ...appPrefs() };
});
ipcMain.handle('dialog:folder', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'], buttonLabel: 'Choose' });
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.handle('devices:list', async () => {
  const list = await devices.list(); known.remember(list);
  const k = known.lastKnown();
  return list.map((d) => { const c = known.loadCatalog(d.serial); return { ...d, last: !d.volume && k[d.serial] ? k[d.serial] : null, catalog: c ? { at: c.at, count: c.tracks.length } : null }; }); // last seen free space and song list while ejected
});
// How much room the connected player has (or a 16 GB iPod's worth when none is mounted).
async function budgetInfo() {
  const list = await devices.list(); known.remember(list);
  const mounted = list.find((d) => d.volume && d.volume.free);
  if (mounted) return { budget: Math.floor(mounted.volume.free * 0.97), budgetFrom: `${mounted.model} (free space)`, rates: spotify.RATES };
  const k = known.lastKnown(); const seen = list.map((d) => k[d.serial]).filter(Boolean); // ejected iPods: the free space when last mounted
  if (seen.length) { const low = seen.reduce((m, x) => (x.free < m.free ? x : m)); return { budget: Math.floor(low.free * 0.97), budgetFrom: `${low.model} (last known free space)`, rates: spotify.RATES }; }
  return { budget: spotify.DEFAULT_BUDGET, budgetFrom: 'a 16 GB iPod', rates: spotify.RATES };
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
let batchIndex = null; let batchSerial = null;
const buildBatchIndex = async (serial) => { batchSerial = serial || null; batchIndex = await dedupe.buildIndex(indexDirs(), { catalog: serial ? known.loadCatalog(serial) : null }); return batchIndex; };
// For the planner: for each song, whether it is already on this Mac, already on the chosen iPod (from its stored song list), or repeats an
// earlier selected playlist. Also says how fresh the iPod's song list is.
ipcMain.handle('existing:check', async (_e, { playlists, serial }) => {
  const ix = await buildBatchIndex(serial);
  const seen = new Set();
  const items = playlists.map((list) => list.map((it) => {
    const key = dedupe.keyOf(it.title, it.artist);
    const have = !!ix.find(it.title, it.artist) || seen.has(key); seen.add(key);
    return { have, ipod: !!(serial && ix.onIpod(it.title, it.artist)) };
  }));
  const cat = serial ? known.loadCatalog(serial) : null;
  return { items, catalog: cat ? { model: cat.model, at: cat.at, count: cat.tracks.length } : null };
});
// Download one planned playlist: songs we already have are reused, the rest are fetched (see src/plan.js).
ipcMain.handle('download:run', async (_e, { name, items, saveToLibrary, first, serial }) => {
  if (job) throw new Error('A download is already running.');
  if (first || !batchIndex || batchSerial !== (serial || null)) await buildBatchIndex(serial);
  const ev = plan.runPlaylist({ name, items, saveToLibrary, index: batchIndex });
  job = ev;
  ev.on('line', (line) => push({ type: 'line', line }));
  for (const t of ['total', 'searching', 'progress', 'done', 'failed', 'reused', 'onipod']) ev.on(t, (e, counts) => push({ ...e, counts }));
  try { return await ev.done; } finally { job = null; }
});
let sending = 0; // a send to an iPod is in progress: do not eject or reset then
ipcMain.handle('ipod:ready', () => ipod.ready());
// Mount an iPod, refresh its stored song list, eject. Nothing is written.
ipcMain.handle('ipod:scan', async (_e, { serial }) => { if (job || sending) throw new Error('Wait for the current download or send to finish.'); await ipod.scan(serial); const c = known.loadCatalog(serial); return { count: c ? c.tracks.length : 0 }; });
ipcMain.handle('ipod:reconnect', async (_e, { serial }) => { if (job || sending) throw new Error('Wait for the current download or send to finish.'); const d = await ipod.reconnect(serial); return { model: d.model, mount: d.volume.mount }; });
ipcMain.handle('ipod:eject', async (_e, { serial }) => {
  if (job || sending) throw new Error('Wait for the current download or send to finish.');
  const d = (await devices.list()).find((x) => String(x.serial) === String(serial));
  if (!d || !d.volume) throw new Error('That iPod is not mounted.');
  await ipod.eject(d.volume.mount);
});
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

ipcMain.handle('send:run', async (_e, args) => { sending++; try { return await sendRun(args); } finally { sending--; } });
async function sendIpod({ folder, folders, name, serial }) {
  const dev = ipod.resolveDevice(await devices.list(), serial);
  const list = folders && folders.length ? folders : [folder];
  const sum = { added: 0, skipped: 0, linked: 0, missing: 0, total: 0 };
  const r = await ipod.withMounted(dev.serial, async (d) => {
    for (const f of list) {
      const tracks = sldl.listTracks(f);
      const res = await ipod.addToIpod({
        mount: d.volume.mount, guid: ipod.guidOf(d.serial), playlist: (list.length === 1 && name) || path.basename(f), files: tracks, folder: f,
        onEvent: (e) => { if (e.type === 'track') push({ type: 'copy', done: e.n, total: e.of }); },
      });
      sum.added += res.added; sum.skipped += res.skipped; sum.linked += res.linked || 0; sum.missing += res.missing || 0; sum.total = res.total;
    }
    return sum;
  }, { autoEject: prefs.read().autoEject });
  return { route: 'ipod', ...r, ejected: prefs.read().autoEject, model: dev.model };
}
async function sendRun({ folder, folders, route, dest, name, layout, force, serial }) {
  if (route === 'ipod') return sendIpod({ folder, folders, name, serial });
  const tracks = sldl.listTracks(folder);
  const plName = name || path.basename(folder);
  if (route === 'music') return { route, ...(await sync.addToMusic(plName, tracks)) };
  const refuse = sync.refuseStockIpod(dest);
  if (refuse && !force) throw new Error(refuse);
  return { route, ...(await sync.copyToPlayer({
    folder, dest, playlist: plName, layout,
    onProgress: (p) => push({ type: 'copy', ...p }),
  })) };
}
