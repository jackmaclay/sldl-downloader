'use strict';
const $ = (id) => document.getElementById(id);
const BLOCKS = 40;
const blocksEl = $('blocks');
for (let i = 0; i < BLOCKS; i++) blocksEl.appendChild(document.createElement('i'));

const TITLES = { download: 'Download', player: 'Player', settings: 'Settings' };
function show(page) {
  document.querySelectorAll('.page').forEach((p) => p.classList.toggle('on', p.id === `page-${page}`));
  document.querySelectorAll('.nav').forEach((n) => n.classList.toggle('on', n.dataset.page === page));
  $('title').textContent = TITLES[page];
  if (page === 'player') loadDevices();
  if (page === 'settings') loadSettings();
}
document.querySelectorAll('.nav').forEach((n) => n.addEventListener('click', () => show(n.dataset.page)));
$('chip').addEventListener('click', () => show('player'));

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
function addTrack(name, fail) {
  const box = $('tracks'); if (box.firstChild && box.firstChild.className === 'empty') box.replaceChildren();
  const row = text('div', fail ? 'trk fail' : 'trk', ''); row.append(text('span', 't', name), text('span', 'dim', fail ? 'not found' : 'done'));
  box.appendChild(row); box.scrollTop = box.scrollHeight;
}

window.api.onEvent((e) => {
  if (e.type === 'line') { const log = $('log'); log.textContent += e.line + '\n'; log.scrollTop = log.scrollHeight; return; }
  if (e.type === 'total') { state.total = e.total; $('stat-main').textContent = `Found ${e.total} tracks`; }
  if (e.type === 'searching') $('stat-main').textContent = `Searching: ${e.track}`;
  if (e.type === 'progress') $('stat-main').textContent = `Downloading: ${e.track}`;
  if (e.type === 'done') { state.done = e.counts.done; addTrack(e.track, false); }
  if (e.type === 'failed') { state.failed = e.counts.failed; addTrack(e.track, true); }
  if (e.type === 'copy') { $('send-note').className = 'note'; $('send-note').textContent = `Copying ${e.done}/${e.total}`; }
  if (['done', 'failed', 'total'].includes(e.type) && state.total) {
    paint((state.done + state.failed) / state.total);
    $('stat-count').textContent = `${state.done} of ${state.total}${state.failed ? `, ${state.failed} not found` : ''}`;
  }
});

const isProfile = (u) => /^https?:\/\/open\.spotify\.com\/(intl-[a-z]+\/)?user\//i.test(u) || /^spotify:user:/i.test(u);
let cancelled = false;

// Runs one sldl download and updates the progress UI. Returns the result, or throws.
async function runOne({ input, name, format, label }) {
  state = { ...state, total: 0, done: 0, failed: 0 };
  paint(0); $('stat-main').textContent = `${label}Starting...`; $('stat-count').textContent = '';
  const r = await window.api.startDownload({ input, format, name });
  if (!r.ok && !cancelled) throw new Error(`sldl stopped with code ${r.code}. Check your Soulseek login in Settings.`);
  paint(r.total ? (r.done + r.failed) / r.total : 1, r.failed && !r.done);
  return r;
}
function finishUi(results) {
  const done = results.reduce((n, r) => n + r.done, 0); const failed = results.reduce((n, r) => n + r.failed, 0);
  state.folders = results.filter((r) => r.folder && r.tracks.length).map((r) => r.folder); state.folder = state.folders[0] || null;
  $('stat-main').textContent = done ? (cancelled ? 'Stopped' : 'Finished') : 'Finished, nothing downloaded';
  setStatus(state.folders.length ? `${done} downloaded${failed ? `, ${failed} not found` : ''}${results.length > 1 ? `, ${state.folders.length} playlists` : ''}.` : 'No folder was created.', done ? 'ok' : 'err');
  $('send-card').hidden = !state.folders.length;
  if (!$('send-card').hidden) syncRouteUi();
}
async function runMany(list, format) {
  resetRun(); setStatus(''); cancelled = false;
  $('start').disabled = true; $('pick-go').disabled = true; $('cancel').hidden = false;
  const results = [];
  try {
    for (let i = 0; i < list.length && !cancelled; i++) {
      const p = list[i];
      results.push(await runOne({ input: p.url, name: p.name, format, label: list.length > 1 ? `Playlist ${i + 1} of ${list.length}, ` : '' }));
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
  if (isProfile(input)) return openPicker(input);
  await runMany([{ url: input, name: $('name').value.trim() }], $('format').value);
});

/* ---------- profile picker ---------- */
let prof = null;
const GB = (n) => (n / 1e9).toFixed(1);
const profileFormat = async () => $('format').value || prof.format;
function sizeOf(p, fmt) { return p.seconds * (prof.rates[fmt] || prof.rates.mp3) * 125; }

async function openPicker(input) {
  setStatus('Reading profile...'); $('start').disabled = true;
  try {
    prof = await window.api.profile({ input });
    prof.fmt = await profileFormat();
    if (!prof.playlists.length) { setStatus('That profile has no public playlists.', 'err'); return; }
    const total = prof.playlists.reduce((n, p) => n + sizeOf(p, prof.fmt), 0);
    prof.fits = total <= prof.budget;
    const box = $('pick-list'); box.replaceChildren();
    prof.playlists.forEach((p, i) => {
      const row = text('label', 'pick-row', ''); const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = prof.fits; cb.dataset.i = i;
      row.append(cb, text('span', 't', p.name || 'Untitled'), text('span', 'dim', ''));
      cb.addEventListener('change', () => togglePick(cb));
      box.appendChild(row);
    });
    $('pick').hidden = false; setStatus('');
    refreshPicker(prof.fits ? `Everything fits (${GB(total)} GB of ${GB(prof.budget)} GB), so all ${prof.playlists.length} playlists are selected.`
      : `${GB(total)} GB is more than the ${GB(prof.budget)} GB available on ${prof.budgetFrom}. Choose which playlists to take.`);
  } catch (err) { setStatus(clean(err), 'err'); } finally { $('start').disabled = false; }
}
const picked = () => [...$('pick-list').querySelectorAll('input')].filter((c) => c.checked).map((c) => prof.playlists[+c.dataset.i]);
function refreshPicker(msg) {
  const used = picked().reduce((n, p) => n + sizeOf(p, prof.fmt), 0);
  [...$('pick-list').children].forEach((row, i) => {
    const cb = row.querySelector('input'); const p = prof.playlists[i]; const sz = sizeOf(p, prof.fmt);
    row.lastChild.textContent = `${p.tracks} tracks, ${GB(sz)} GB`;
    const blocked = !cb.checked && used + sz > prof.budget; // never let the selection go over the limit
    cb.disabled = blocked; row.classList.toggle('off', blocked);
  });
  $('pick-cap').textContent = `Playlists: ${GB(used)} of ${GB(prof.budget)} GB`;
  $('pick-go').disabled = !picked().length;
  $('pick-note').className = 'note'; $('pick-note').textContent = msg || '';
}
function togglePick(cb) {
  const used = picked().reduce((n, p) => n + sizeOf(p, prof.fmt), 0);
  if (used > prof.budget) { cb.checked = false; refreshPicker('That one would not fit.'); return; }
  refreshPicker('');
}
$('format').addEventListener('change', async () => {
  if (!prof || $('pick').hidden) return;
  prof.fmt = await profileFormat();
  const checked = () => [...$('pick-list').querySelectorAll('input')].filter((c) => c.checked);
  while (picked().reduce((n, p) => n + sizeOf(p, prof.fmt), 0) > prof.budget) checked().pop().checked = false; // a bigger format may no longer fit
  refreshPicker('Sizes updated for the new format.');
});
$('pick-go').addEventListener('click', () => { const list = picked(); if (list.length) runMany(list, $('format').value); });
$('cancel').addEventListener('click', () => { cancelled = true; window.api.cancelDownload(); });
function setStatus(msg, kind) { const n = $('status'); n.textContent = msg; n.className = 'note' + (kind ? ' ' + kind : ''); }
const clean = (err) => String(err && err.message || err).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');

/* ---------- send ---------- */
function syncRouteUi() {
  const copy = $('route').value === 'copy';
  $('dest-row').hidden = !copy; $('layout-row').hidden = !copy;
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
    for (const folder of folders) {
      const r = await window.api.send({ folder, route, dest: state.dest, name: folders.length === 1 ? ($('name').value.trim() || undefined) : undefined, layout: $('layout').value });
      for (const k of Object.keys(sum)) sum[k] += r[k] || 0;
    }
    note.className = 'note ok';
    note.textContent = route === 'ipod' ? `iPod updated: ${sum.added} added, ${sum.skipped} already there. Eject it before unplugging.`
      : route === 'music' ? `Added ${sum.added} of ${sum.of} tracks to Music.` : `Copied ${sum.copied} files.`;
  } catch (err) { note.className = 'note err'; note.textContent = clean(err); }
  finally { $('send').disabled = false; }
});

/* ---------- player ---------- */
const STATUS = { ready: 'Ready', unmounted: 'Not mounted', 'disk-mode': 'Disk mode, no library', recovery: 'Recovery mode' };
const EXPLAIN = {
  unmounted: 'The iPod is connected but its disk is not mounted, usually because it was ejected. Nothing is wrong. Unplug it and plug it back in.',
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
    if (EXPLAIN[d.status]) card.appendChild(text('div', 'explain', EXPLAIN[d.status]));
    box.appendChild(card);
  }
  $('music-note').textContent = music.ok
    ? `Music app sees: ${music.sources.join(', ')}${music.sources.some((s) => /ipod/i.test(s)) ? '' : ' (no iPod)'}`
    : 'Music app could not be queried.';
  updateChip(list);
}
$('refresh').addEventListener('click', loadDevices);
function updateChip(list) {
  const d = list[0];
  $('chip-dot').className = `dot ${d ? d.status : ''}`;
  $('chip-text').textContent = d ? `${d.model}, ${STATUS[d.status] || d.status}` : 'No player';
}
window.api.devices().then(updateChip).catch(() => {});
setInterval(() => window.api.devices().then(updateChip).catch(() => {}), 15000);

/* ---------- settings ---------- */
// MP3 is the default. FLAC (and flac,mp3) only appear once "Allow FLAC" is on.
function applyFlac(allowed) {
  for (const [sel, extra] of [[$('format'), ['flac']], [$('s-format'), ['flac', 'flac,mp3']]]) {
    [...sel.options].filter((o) => o.value.startsWith('flac')).forEach((o) => o.remove());
    if (allowed) for (const v of extra) sel.appendChild(new Option(v, v));
    else if (sel.value.startsWith('flac')) sel.value = sel.id === 'format' ? '' : 'mp3';
  }
}
window.api.getSettings().then((c) => applyFlac(c.allowFlac)).catch(() => {});
$('s-flac').addEventListener('change', () => applyFlac($('s-flac').checked));
async function loadSettings() {
  const c = await window.api.getSettings();
  $('s-user').value = c.user || ''; $('s-pass').value = c.pass || '';
  applyFlac(c.allowFlac); $('s-flac').checked = !!c.allowFlac;
  $('s-path').textContent = c.path || 'Not set'; $('s-format').value = c['pref-format'] || 'mp3';
  if (!$('s-format').value) $('s-format').value = 'mp3';
  $('s-namefmt').value = c['name-format'] || ''; $('s-note').textContent = '';
}
$('s-path-btn').addEventListener('click', async () => { const p = await window.api.pickFolder(); if (p) $('s-path').textContent = p; });
$('s-save').addEventListener('click', async () => {
  const path = $('s-path').textContent;
  await window.api.saveSettings({
    user: $('s-user').value, pass: $('s-pass').value, path: path === 'Not set' ? '' : path,
    'pref-format': $('s-format').value, 'name-format': $('s-namefmt').value, allowFlac: $('s-flac').checked,
  });
  $('s-note').className = 'note ok'; $('s-note').textContent = 'Saved.';
});
$('slsk-link').addEventListener('click', () => window.api.openExternal('https://www.slsknet.org/'));
