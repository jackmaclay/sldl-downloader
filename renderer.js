'use strict';
const $ = (id) => document.getElementById(id);

/* ---------- resizable sidebar ---------- */
// Narrower than SIDE_RAIL shows icons only. SIDE_MIN keeps the three window buttons inside the sidebar. A narrow window always uses the rail.
const SIDE_MIN = 92; const SIDE_MAX = 360; const SIDE_RAIL = 150; const SIDE_DEFAULT = 220;
let sideW = SIDE_DEFAULT;
try { sideW = Math.max(SIDE_MIN, Math.min(SIDE_MAX, +localStorage.getItem('sideW') || SIDE_DEFAULT)); } catch { /* no storage */ }
function applySide() {
  const w = window.innerWidth < 620 ? SIDE_MIN : sideW;
  document.documentElement.style.setProperty('--side-w', `${w}px`);
  document.body.classList.toggle('rail', w < SIDE_RAIL);
}
const saveSide = () => { try { localStorage.setItem('sideW', String(sideW)); } catch { /* no storage */ } };
applySide(); window.addEventListener('resize', applySide);
$('split').addEventListener('mousedown', (e) => {
  e.preventDefault(); $('split').classList.add('drag'); document.body.classList.add('resizing');
  const move = (ev) => { sideW = Math.max(SIDE_MIN, Math.min(SIDE_MAX, ev.clientX + 4)); applySide(); };
  const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); $('split').classList.remove('drag'); document.body.classList.remove('resizing'); saveSide(); };
  window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
});
$('split').addEventListener('dblclick', () => { sideW = SIDE_DEFAULT; applySide(); saveSide(); });
const BLOCKS = 40;
const blocksEl = $('blocks');
for (let i = 0; i < BLOCKS; i++) blocksEl.appendChild(document.createElement('i'));

const TITLES = { download: 'Download', player: 'Player', help: 'Help', settings: 'Settings' };
function show(page) {
  document.querySelectorAll('.page').forEach((p) => p.classList.toggle('on', p.id === `page-${page}`));
  document.querySelectorAll('.nav').forEach((n) => n.classList.toggle('on', n.dataset.page === page));
  $('title').textContent = TITLES[page];
  if (page === 'player') loadDevices();
  if (page === 'settings') loadSettings();
}
document.querySelectorAll('.nav').forEach((n) => n.addEventListener('click', () => show(n.dataset.page)));

// Eject a mounted iPod, or reconnect an ejected one (no unplugging). Used by the sidebar and the Player page.
async function ipodToggle(d) { return d.volume ? window.api.ipodEject({ serial: d.serial }) : window.api.ipodReconnect({ serial: d.serial }); }
const text = (tag, cls, str) => { const e = document.createElement(tag); if (cls) e.className = cls; e.textContent = str; return e; };

/* ---------- download ---------- */
let state = { total: 0, done: 0, failed: 0, folder: null, folders: [], dest: null };

function paint(frac, fail) {
  const on = Math.round(Math.max(0, Math.min(1, frac)) * BLOCKS);
  [...blocksEl.children].forEach((b, i) => b.classList.toggle('on', i < on));
  blocksEl.classList.toggle('fail', !!fail);
}
function resetRun() {
  $('run').hidden = false;
  state = { ...state, total: 0, done: 0, failed: 0, folder: null, folders: [] };
  paint(0); $('tracks').replaceChildren(text('div', 'empty', 'Searching...')); $('log').textContent = '';
  $('stat-main').textContent = 'Starting...'; $('stat-count').textContent = ''; $('send-card').hidden = true;
}
function addTrack(name, fail, note) {
  const box = $('tracks'); if (box.firstChild && box.firstChild.className === 'empty') box.replaceChildren();
  const row = text('div', fail ? 'trk fail' : 'trk', ''); row.append(text('span', 't', name), text('span', 'dim', fail ? 'not found' : (note || 'done')));
  box.appendChild(row); box.scrollTop = box.scrollHeight;
}

window.api.onEvent((e) => {
  if (e.type === 'line') { const log = $('log'); log.textContent += e.line + '\n'; log.scrollTop = log.scrollHeight; return; }
  if (e.type === 'total') { state.total = e.total; $('stat-main').textContent = `Found ${e.total} tracks`; }
  if (e.type === 'searching') $('stat-main').textContent = `Searching: ${e.track}`;
  if (e.type === 'progress') $('stat-main').textContent = `Downloading: ${e.track}`;
  if (e.type === 'done') { state.done = e.counts.done; addTrack(e.track, false); }
  if (e.type === 'failed') { state.failed = e.counts.failed; addTrack(e.track, true); }
  if (e.type === 'reused') addTrack(e.track, false, 'already had it');
  if (e.type === 'onipod') addTrack(e.track, false, 'already on the iPod');
  if (e.type === 'copy') { $('send-note').className = 'note'; $('send-note').textContent = `Copying ${e.done}/${e.total}`; }
  if (['done', 'failed', 'total'].includes(e.type) && state.total) {
    paint((state.done + state.failed) / state.total);
    $('stat-count').textContent = `${state.done} of ${state.total}${state.failed ? `, ${state.failed} not found` : ''}`;
  }
});

const isProfile = (u) => /^https?:\/\/open\.spotify\.com\/(intl-[a-z]+\/)?user\//i.test(u) || /^spotify:user:/i.test(u);
const isPlaylist = (u) => /open\.spotify\.com\/(intl-[a-z]+\/)?playlist\//i.test(u) || /^spotify:playlist:/i.test(u);
let cancelled = false;

function setStatus(msg, kind) { const n = $('status'); n.textContent = msg; n.className = 'note' + (kind ? ' ' + kind : ''); }
const clean = (err) => String(err && err.message || err).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
const GB = (n) => (n / 1e9).toFixed(1);

function finishUi(results) {
  const done = results.reduce((n, r) => n + r.done, 0); const failed = results.reduce((n, r) => n + r.failed, 0);
  const reused = results.reduce((n, r) => n + (r.reused || 0) + (r.onIpod || 0), 0);
  state.folders = results.filter((r) => r.folder && (r.tracks.length || r.onIpod)).map((r) => r.folder); state.folder = state.folders[0] || null;
  $('stat-main').textContent = (done || reused) ? (cancelled ? 'Stopped' : 'Finished') : 'Finished, nothing downloaded';
  const bits = [`${done} downloaded`]; if (reused) bits.push(`${reused} already had`); if (failed) bits.push(`${failed} not found`);
  setStatus(state.folders.length ? `${bits.join(', ')}${results.length > 1 ? `, ${state.folders.length} playlists` : ''}.` : 'No folder was created.', (done || reused) ? 'ok' : 'err');
  $('send-card').hidden = !state.folders.length;
  if (!$('send-card').hidden) syncRouteUi();
}

/* ---------- planner: playlists, formats, and what we already have ---------- */
let plan = null; // { playlists:[{ name, items, seconds, on, open, format, ... }], budget, budgetFrom, rates }
const fmtOf = (p, it) => it.format || p.format || $('format').value || 'mp3';
const sizeOf = (p) => p.seconds * (plan.rates.mp3 || 320) * 125; // the iPod only ever gets MP3, so the limit counts MP3 sizes
const usedBytes = () => plan.playlists.filter((p) => p.on).reduce((n, p) => n + sizeOf(p), 0);

function fmtSelect(value, inherit) {
  const sel = document.createElement('select');
  for (const [v, label] of [['', inherit], ['mp3', 'MP3'], ['flac', 'FLAC']]) { const o = new Option(label, v); o.selected = v === value; sel.appendChild(o); }
  return sel;
}

async function fillForIpod() {
  const sel = $('for-ipod'); const keep = sel.value; const list = (await window.api.devices()).filter((d) => d.status !== 'recovery');
  sel.replaceChildren(new Option('None, Mac only', ''), ...list.map((d) => { const o = new Option(d.model.replace(/^iPod /, ''), d.serial); o.selected = d.serial === keep; return o; }));
  if (!keep && list.length === 1) sel.value = list[0].serial; // only one iPod plugged in: assume it is the one
}
fillForIpod().catch(() => {});
$('for-ipod').addEventListener('change', async () => { if (plan && !$('pick').hidden) { await markExisting(); refreshPlanner(''); } });

async function markExisting() {
  const r = await window.api.checkExisting({ serial: $('for-ipod').value || null, playlists: plan.playlists.map((p) => p.items.map((i) => ({ title: i.title, artist: i.artist }))) });
  plan.playlists.forEach((p, i) => p.items.forEach((it, j) => { it.have = r.items[i][j].have; it.ipod = r.items[i][j].ipod; }));
  plan.catalog = r.catalog;
}

async function openPlanner(input) {
  setStatus(isProfile(input) ? 'Reading profile...' : 'Reading playlist...'); $('start').disabled = true;
  try {
    plan = isProfile(input) ? await window.api.profile({ input }) : await window.api.playlistPlan({ input });
    if (!plan.playlists.length) { setStatus('There are no public playlists there.', 'err'); return; }
    setStatus('Checking what you already have...');
    await fillForIpod(); await markExisting();
    plan.playlists.forEach((p) => { p.format = ''; p.open = false; });
    const total = plan.playlists.reduce((n, p) => n + sizeOf(p), 0);
    plan.playlists.forEach((p) => { p.on = total <= plan.budget; });
    if (plan.playlists.length === 1) plan.playlists[0].on = true;
    renderPlanner();
    $('pick').hidden = false; setStatus('');
    const capped = plan.playlists.some((p) => p.capped);
    refreshPlanner(total <= plan.budget ? (capped ? 'Spotify lists only the first 100 songs of a long playlist without a login.' : '')
      : `${GB(total)} GB is more than the ${GB(plan.budget)} GB available on ${plan.budgetFrom}. Choose which playlists to take.`);
  } catch (err) { setStatus(clean(err), 'err'); } finally { $('start').disabled = false; }
}

let metas = []; let boxes = [];
function renderPlanner() {
  const list = $('pick-list'); list.replaceChildren(); metas = []; boxes = [];
  plan.playlists.forEach((p, i) => {
    const head = text('div', 'pl-head', '');
    const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = p.on;
    cb.addEventListener('change', () => { p.on = cb.checked; if (usedBytes() > plan.budget) { p.on = false; cb.checked = false; refreshPlanner('That one would not fit.'); } else refreshPlanner(''); });
    const meta = text('span', 'dim', ''); metas.push(meta); boxes.push(cb);
    const info = text('div', 'pl-info', ''); info.append(text('span', 't', p.name || 'Untitled'), meta);
    const sel = fmtSelect(p.format, 'Default'); sel.title = 'Format for this playlist';
    sel.addEventListener('change', () => { p.format = sel.value; if (sel.value === 'flac') $('save-lib').checked = true; refreshPlanner(''); });
    const tog = text('button', 'link', p.open ? 'Hide' : 'Songs'); tog.addEventListener('click', () => { p.open = !p.open; renderPlanner(); });
    head.append(cb, info, sel, tog);
    list.appendChild(head);
    if (p.open) {
      const wrap = text('div', 'pick-songs', '');
      p.items.forEach((it) => {
        const row = text('div', (it.have || it.ipod) ? 'song-row have' : 'song-row', '');
        const s = fmtSelect(it.format, 'Playlist'); s.title = 'Format for this song';
        s.addEventListener('change', () => { it.format = s.value; if (s.value === 'flac') $('save-lib').checked = true; refreshPlanner(''); });
        row.append(text('span', 't', `${it.title}${it.artist ? ' - ' + it.artist : ''}`), text('span', 'dim', it.ipod ? `already on ${$('for-ipod').selectedOptions[0].textContent}` : (it.have ? 'already have it' : '')), s);
        wrap.appendChild(row);
      });
      list.appendChild(wrap);
    }
  });
}

function refreshPlanner(msg) {
  const used = usedBytes();
  plan.playlists.forEach((p, i) => {
    const have = p.items.filter((it) => it.have || it.ipod).length; const flac = p.items.filter((it) => fmtOf(p, it) === 'flac').length;
    metas[i].textContent = `${p.items.length} songs${have ? `, ${have} already here` : ''}${flac ? `, ${flac} FLAC` : ''}, ${GB(sizeOf(p))} GB`;
    const blocked = !p.on && used + sizeOf(p) > plan.budget; // never let the selection go over the iPod's limit
    boxes[i].disabled = blocked; boxes[i].parentElement.classList.toggle('off', blocked);
  });
  const sel = plan.playlists.filter((p) => p.on);
  const fresh = sel.reduce((n, p) => n + p.items.filter((it) => !it.have && !it.ipod).length, 0);
  $('pick-cap').textContent = `Playlists: ${GB(used)} of ${GB(plan.budget)} GB on the iPod (MP3)`;
  $('pick-go').textContent = fresh ? `Download ${fresh} new song${fresh > 1 ? 's' : ''}` : 'Add to folders';
  $('pick-go').disabled = !sel.length;
  const serial = $('for-ipod').value; const age = plan.catalog ? Math.round((Date.now() - plan.catalog.at) / 86400000) : null;
  const hint = !serial ? '' : (plan.catalog ? `Song list of ${$('for-ipod').selectedOptions[0].textContent}: ${plan.catalog.count} songs, ${age < 1 ? 'saved today' : `${age} day${age > 1 ? 's' : ''} old`}.` : 'No song list for this iPod yet: use Scan on the Player page so downloads can skip what it already has.');
  $('pick-note').className = 'note'; $('pick-note').textContent = [msg, hint].filter(Boolean).join(' ');
}
$('format').addEventListener('change', () => { if ($('format').value === 'flac') $('save-lib').checked = true; saveDownloadPrefs(); if (plan && !$('pick').hidden) refreshPlanner(''); });
$('save-lib').addEventListener('change', () => { if (!$('save-lib').checked && plan && plan.playlists.some((p) => p.on && p.items.some((it) => fmtOf(p, it) === 'flac'))) { $('save-lib').checked = true; refreshPlanner('FLAC is kept in your Music folder, so that stays on.'); } saveDownloadPrefs(); });
function saveDownloadPrefs() { window.api.saveSettings({ saveToLibrary: $('save-lib').checked, defaultFormat: $('format').value }).catch(() => {}); }

async function runMany(list) {
  resetRun(); setStatus(''); cancelled = false;
  $('start').disabled = true; $('pick-go').disabled = true; $('cancel').hidden = false;
  const results = [];
  try {
    for (let i = 0; i < list.length && !cancelled; i++) {
      const p = list[i];
      state = { ...state, total: 0, done: 0, failed: 0 }; paint(0);
      $('stat-main').textContent = `${list.length > 1 ? `Playlist ${i + 1} of ${list.length}: ` : ''}${p.name}`; $('stat-count').textContent = '';
      const r = await window.api.runPlaylist({
        name: (list.length === 1 && $('name').value.trim()) || p.name, saveToLibrary: $('save-lib').checked, first: i === 0, serial: $('for-ipod').value || null,
        items: p.items.map((it) => ({ title: it.title, artist: it.artist, seconds: it.seconds, format: fmtOf(p, it) })),
      });
      paint(r.total ? (r.done + r.failed) / r.total : 1, r.failed && !r.done);
      results.push(r);
    }
    finishUi(results);
  } catch (err) {
    $('stat-main').textContent = 'Stopped'; setStatus(clean(err), 'err'); paint(state.total ? (state.done + state.failed) / state.total : 0, true);
    if (results.length) finishUi(results);
  } finally { $('start').disabled = false; $('pick-go').disabled = false; $('cancel').hidden = true; }
}

$('start').addEventListener('click', async () => {
  const input = $('url').value.trim();
  if (!input) { setStatus('Paste a Spotify playlist or profile link first.', 'err'); return; }
  $('pick').hidden = true;
  if (isProfile(input) || isPlaylist(input)) return openPlanner(input);
  // anything else (a search, a CSV path) goes straight to sldl in the iPod folder
  resetRun(); setStatus(''); cancelled = false; $('start').disabled = true; $('cancel').hidden = false;
  try { finishUi([await window.api.startDownload({ input, format: $('format').value, name: $('name').value.trim() })]); }
  catch (err) { $('stat-main').textContent = 'Stopped'; setStatus(clean(err), 'err'); }
  finally { $('start').disabled = false; $('cancel').hidden = true; }
});
$('pick-go').addEventListener('click', () => { const list = plan.playlists.filter((p) => p.on); if (list.length) runMany(list); });
$('cancel').addEventListener('click', () => { cancelled = true; window.api.cancelDownload(); });
window.api.getSettings().then((c) => { $('save-lib').checked = !!c.saveToLibrary; $('format').value = c.defaultFormat || 'mp3'; showWhere(); }).catch(() => {});

/* ---------- send ---------- */
async function syncRouteUi() {
  const route = $('route').value; const copy = route === 'copy';
  $('dest-row').hidden = !copy; $('layout-row').hidden = !copy; $('ipod-row').hidden = route !== 'ipod';
  if (route === 'ipod') { // every iPod on USB, mounted or not: the app mounts the chosen one only for the upload
    const keep = $('ipod-pick').value || $('for-ipod').value; const list = (await window.api.devices()).filter((d) => d.status !== 'recovery');
    $('ipod-pick').replaceChildren(...list.map((d) => { const o = new Option(`${d.model}${d.volume ? '' : ' (ejected, will mount for the upload)'}`, d.serial); o.selected = d.serial === keep; return o; }));
    if (!list.length) $('ipod-pick').appendChild(new Option('No iPod plugged in', ''));
  }
}
$('route').addEventListener('change', syncRouteUi);
$('pick-dest').addEventListener('click', async () => {
  const p = await window.api.pickFolder(); if (!p) return;
  state.dest = p; $('pick-dest').textContent = p.split('/').slice(-2).join('/');
});
$('reveal').addEventListener('click', () => state.folder && window.api.reveal(state.folder));
$('send').addEventListener('click', async () => {
  const note = $('send-note'); note.className = 'note'; note.textContent = '';
  const route = $('route').value;
  if (route === 'copy' && !state.dest) { note.className = 'note err'; note.textContent = 'Choose a destination first.'; return; }
  $('send').disabled = true;
  try {
    if (route === 'ipod' && !(await window.api.ipodReady())) {
      note.textContent = 'Installing the iPod helper (one-off, needs internet)...';
      await window.api.ipodSetup(); note.textContent = '';
    }
    const folders = state.folders.length ? state.folders : [state.folder];
    const sum = { added: 0, skipped: 0, of: 0, copied: 0 };
    if (route === 'ipod') { // one mount for the whole batch, then it is ejected again
      note.textContent = 'Mounting the iPod...';
      const r = await window.api.send({ folders, route, serial: $('ipod-pick').value, name: $('name').value.trim() || undefined });
      note.className = 'note ok'; note.textContent = `${r.model} updated: ${r.added} added, ${r.linked || 0} linked from what it already had, ${r.skipped} already there${r.missing ? `, ${r.missing} no longer on it (download them again)` : ''}. ${r.ejected ? 'Ejected, safe to unplug.' : 'Still mounted: eject it before unplugging.'}`;
      return;
    }
    for (const folder of folders) {
      const r = await window.api.send({ folder, route, dest: state.dest, name: folders.length === 1 ? ($('name').value.trim() || undefined) : undefined, layout: $('layout').value });
      for (const k of Object.keys(sum)) sum[k] += r[k] || 0;
    }
    note.className = 'note ok';
    note.textContent = route === 'music' ? `Added ${sum.added} of ${sum.of} tracks to Music.` : `Copied ${sum.copied} files.`;
  } catch (err) { note.className = 'note err'; note.textContent = clean(err); }
  finally { $('send').disabled = false; }
});

/* ---------- player ---------- */
const STATUS = { ready: 'Ready', unmounted: 'Not mounted', 'disk-mode': 'Disk mode, no library', recovery: 'Recovery mode' };
const EXPLAIN = {
  unmounted: 'The iPod is connected but its disk is not mounted, usually because it was ejected. Nothing is wrong. Press Reconnect to mount it again without unplugging it.',
  'disk-mode': 'The iPod shows up as a plain drive and its own software is not running. A restore from Music or Finder normally fixes this. If restores fail, the flash is usually damaged and no app can write music the iPod will play.',
  recovery: 'The iPod is in DFU or recovery mode, so its firmware is not running. Restore it from Music or Finder.',
};
async function loadDevices() {
  const box = $('devices'); box.replaceChildren(text('div', 'empty-dev', 'Looking...'));
  const [list, music] = await Promise.all([window.api.devices(), window.api.musicSources()]);
  box.replaceChildren();
  if (!list.length) box.appendChild(text('div', 'empty-dev', 'No iPod found. Plug it in and press Refresh.'));
  for (const d of list) {
    const card = text('div', 'dev', ''); const h = text('h2', '', d.model);
    const dot = text('span', `dot ${d.status}`, ''); h.prepend(dot);
    card.append(h, text('div', 'sub', `${STATUS[d.status] || d.status}${d.serial ? `  ·  ${d.serial}` : ''}`));
    if (d.volume) {
      const gb = (n) => (n / 1e9).toFixed(1);
      card.append(text('div', '', `${d.volume.mount}  ·  ${gb(d.volume.free)} GB free of ${gb(d.volume.total)} GB`));
      if (d.volume.flags.length) { const ul = document.createElement('ul'); d.volume.flags.forEach((f) => ul.appendChild(text('li', 'warn', f))); card.appendChild(ul); }
    }
    if (d.catalog) card.append(text('div', '', `Song list: ${d.catalog.count} songs, saved ${new Date(d.catalog.at).toLocaleDateString()}`));
    if (d.last) card.append(text('div', '', `Last seen: ${GB(d.last.free)} GB free of ${GB(d.last.total)} GB`));
    if (EXPLAIN[d.status]) card.appendChild(text('div', 'explain', EXPLAIN[d.status]));
    if (d.status !== 'recovery') { // mounted: Eject. Ejected but still on USB: Reconnect (no unplugging).
      const b = text('button', 'btn', d.volume ? 'Eject' : 'Reconnect');
      b.addEventListener('click', async () => {
        b.disabled = true; b.textContent = d.volume ? 'Ejecting...' : 'Reconnecting...';
        try { await ipodToggle(d); $('music-note').textContent = ''; }
        catch (err) { $('music-note').textContent = clean(err); }
        loadDevices();
      });
      card.appendChild(b);
      const sc = text('button', 'btn', 'Scan songs'); sc.title = 'Mount it, read what is on it, eject it. Nothing is written. Lets downloads skip songs it already has.';
      sc.addEventListener('click', async () => { sc.disabled = true; sc.textContent = 'Scanning...'; try { await window.api.ipodScan({ serial: d.serial }); $('music-note').textContent = ''; } catch (err) { $('music-note').textContent = clean(err); } loadDevices(); });
      card.appendChild(sc);
    }
    box.appendChild(card);
  }
  $('music-note').textContent = music.ok
    ? `Music app sees: ${music.sources.join(', ')}${music.sources.some((s) => /ipod/i.test(s)) ? '' : ' (no iPod)'}`
    : 'Music app could not be queried.';
  updateChip(list);
}
$('refresh').addEventListener('click', loadDevices);
function updateChip(list) {
  const box = $('chips'); box.replaceChildren();
  if (!list.length) { const row = text('div', 'chip', ''); row.append(text('span', 'dot', ''), text('span', 'chip-text', 'No player')); box.appendChild(row); return; }
  for (const d of list) {
    const row = text('div', 'chip', '');
    const name = text('button', 'chip-text', d.model.replace(/^iPod /, ''));
    name.title = `${STATUS[d.status] || d.status}. Open the Player page`; name.addEventListener('click', () => show('player'));
    row.append(text('span', `dot ${d.status}`, ''), name);
    if (d.status !== 'recovery') {
      const act = text('button', 'chip-act', d.volume ? 'Eject' : 'Reconnect');
      act.addEventListener('click', async () => {
        act.disabled = true; act.textContent = d.volume ? 'Ejecting...' : 'Reconnecting...';
        try { await ipodToggle(d); } catch (err) { name.textContent = clean(err).slice(0, 60); }
        window.api.devices().then(updateChip).catch(() => {});
        if (!$('page-player').classList.contains('on')) return;
        loadDevices();
      });
      row.appendChild(act);
    }
    box.appendChild(row);
  }
}
window.api.devices().then(updateChip).catch(() => {});
setInterval(() => window.api.devices().then(updateChip).catch(() => {}), 15000);

/* ---------- settings ---------- */
// MP3 is the default. FLAC (and flac,mp3) only appear once "Allow FLAC" is on.
function applyFlac(allowed) {
  const sel = $('s-format');
  [...sel.options].filter((o) => o.value.startsWith('flac')).forEach((o) => o.remove());
  if (allowed) for (const v of ['flac', 'flac,mp3']) sel.appendChild(new Option(v, v));
  else if (sel.value.startsWith('flac')) sel.value = 'mp3';
}
window.api.getSettings().then((c) => applyFlac(c.allowFlac)).catch(() => {});
$('s-flac').addEventListener('change', () => applyFlac($('s-flac').checked));
// The two folders: iPod folder (MP3 only) and Music folder (best quality).
const S = { home: '', ipod: '', lib: '' };
const tilde = (p) => (S.home && p.startsWith(S.home) ? '~' + p.slice(S.home.length) : p);
function showFolders() {
  for (const [id, key] of [['s-ipod-path', 'ipod'], ['s-lib-path', 'lib']]) { $(id).textContent = tilde(S[key]); $(id).title = S[key]; }
}
// "Where files go" under the Download options, and the first-run card.
const lastName = (p) => String(p).split('/').filter(Boolean).pop() || p;
function showWhere() {
  const w = $('where'); w.replaceChildren();
  const b = (t) => { const e = document.createElement('b'); e.textContent = t; return e; };
  w.append('MP3s for your iPod are saved in ', b(lastName(S.ipod)));
  if ($('save-lib').checked) w.append(', and a best-quality copy in ', b(lastName(S.lib)));
  w.append('. You can change these in Settings.');
}
async function refreshFolders() {
  const c = await window.api.getSettings();
  S.home = c.home; S.ipod = c.ipodDir; S.lib = c.libraryDir;
  showFolders(); showWhere();
  $('firstrun').hidden = !!(c.user && c.pass); // no Soulseek login yet: show the welcome card
  return c;
}
async function loadSettings() {
  const c = await refreshFolders();
  $('s-user').value = c.user || ''; $('s-pass').value = c.pass || '';
  applyFlac(c.allowFlac); $('s-flac').checked = !!c.allowFlac; $('s-eject').checked = c.autoEject !== false;
  $('s-format').value = c['pref-format'] || 'mp3'; if (!$('s-format').value) $('s-format').value = 'mp3';
  $('s-namefmt').value = c['name-format'] || ''; $('s-note').textContent = '';
}
$('s-ipod-btn').addEventListener('click', async () => { const p = await window.api.pickFolder(); if (p) { S.ipod = p; showFolders(); } });
$('s-lib-btn').addEventListener('click', async () => { const p = await window.api.pickFolder(); if (p) { S.lib = p; showFolders(); } });
$('s-save').addEventListener('click', async () => {
  if (S.ipod === S.lib) { $('s-note').className = 'note err'; $('s-note').textContent = 'Pick two different folders for the iPod folder and the Music folder.'; return; }
  await window.api.saveSettings({
    user: $('s-user').value, pass: $('s-pass').value, path: S.ipod, libraryDir: S.lib,
    'pref-format': $('s-format').value, 'name-format': $('s-namefmt').value, allowFlac: $('s-flac').checked, autoEject: $('s-eject').checked,
  });
  $('s-note').className = 'note ok'; $('s-note').textContent = 'Saved.';
  refreshFolders().catch(() => {});
});
$('support').addEventListener('click', () => window.api.openSupport());
$('help-slsk').addEventListener('click', () => window.api.openExternal('https://www.slsknet.org/'));
$('go-help').addEventListener('click', () => show('help'));
$('go-settings').addEventListener('click', () => show('settings'));
$('save-lib').addEventListener('change', showWhere);
refreshFolders().catch(() => {});
// App icon: the sidebar logo changes here, the Dock icon in main.js (saved when picked, no Save needed).
function applyIconUi(kind) {
  const alt = kind === 'alt'; const img = document.querySelector('.brand img');
  img.src = alt ? 'assets/icon-alt.png' : 'assets/icon.png'; img.classList.toggle('smooth', alt);
  document.querySelectorAll('.iconbtn').forEach((b) => b.classList.toggle('on', b.dataset.icon === kind));
}
document.querySelectorAll('.iconbtn').forEach((b) => b.addEventListener('click', () => { applyIconUi(b.dataset.icon); window.api.saveSettings({ icon: b.dataset.icon }).catch(() => {}); }));
window.api.getSettings().then((c) => applyIconUi(c.icon || 'original')).catch(() => {});
$('slsk-link').addEventListener('click', () => window.api.openExternal('https://www.slsknet.org/'));
