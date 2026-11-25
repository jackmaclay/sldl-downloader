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
let state = { total: 0, done: 0, failed: 0, folder: null, dest: null };

function paint(frac, fail) {
  const on = Math.round(Math.max(0, Math.min(1, frac)) * BLOCKS);
  [...blocksEl.children].forEach((b, i) => b.classList.toggle('on', i < on));
  blocksEl.classList.toggle('fail', !!fail);
}
function resetRun() {
  $('run').hidden = false;
  state = { ...state, total: 0, done: 0, failed: 0, folder: null };
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

$('start').addEventListener('click', async () => {
  const input = $('url').value.trim();
  if (!input) { setStatus('Paste a Spotify playlist URL first.', 'err'); return; }
  resetRun(); setStatus('');
  $('start').disabled = true; $('cancel').hidden = false;
  try {
    const r = await window.api.startDownload({ input, format: $('format').value, name: $('name').value.trim() });
    if (!r.ok) throw new Error(`sldl stopped with code ${r.code}. Check your Soulseek login in Settings.`);
    paint(r.total ? (r.done + r.failed) / r.total : 1, r.failed && !r.done);
    $('stat-main').textContent = r.done ? 'Finished' : 'Finished, nothing downloaded';
    state.folder = r.folder;
    setStatus(r.folder ? `${r.done} downloaded${r.failed ? `, ${r.failed} not found` : ''}.` : 'No folder was created.', r.done ? 'ok' : 'err');
    $('send-card').hidden = !(r.folder && r.tracks.length);
    if (!$('send-card').hidden) syncRouteUi();
  } catch (err) {
    $('stat-main').textContent = 'Stopped'; setStatus(clean(err), 'err'); paint(state.total ? (state.done + state.failed) / state.total : 0, true);
  } finally { $('start').disabled = false; $('cancel').hidden = true; }
});
$('cancel').addEventListener('click', () => window.api.cancelDownload());
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
    const r = await window.api.send({ folder: state.folder, route, dest: state.dest, name: $('name').value.trim() || undefined, layout: $('layout').value });
    note.className = 'note ok';
    note.textContent = route === 'ipod' ? `iPod updated: ${r.added} added, ${r.skipped} already there. Eject it before unplugging.` : route === 'music' ? `Added ${r.added} of ${r.of} tracks to Music.` : `Copied ${r.copied} files.`;
  } catch (err) { note.className = 'note err'; note.textContent = clean(err); }
  finally { $('send').disabled = false; }
});

/* ---------- player ---------- */
const STATUS = { ready: 'Ready', 'disk-mode': 'Disk mode, no library', recovery: 'Recovery mode' };
const EXPLAIN = {
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
async function loadSettings() {
  const c = await window.api.getSettings();
  $('s-user').value = c.user || ''; $('s-pass').value = c.pass || '';
  $('s-path').textContent = c.path || 'Not set'; $('s-format').value = c['pref-format'] || 'mp3';
  $('s-namefmt').value = c['name-format'] || ''; $('s-note').textContent = '';
}
$('s-path-btn').addEventListener('click', async () => { const p = await window.api.pickFolder(); if (p) $('s-path').textContent = p; });
$('s-save').addEventListener('click', async () => {
  const path = $('s-path').textContent;
  await window.api.saveSettings({
    user: $('s-user').value, pass: $('s-pass').value, path: path === 'Not set' ? '' : path,
    'pref-format': $('s-format').value, 'name-format': $('s-namefmt').value,
  });
  $('s-note').className = 'note ok'; $('s-note').textContent = 'Saved.';
});
$('slsk-link').addEventListener('click', () => window.api.openExternal('https://www.slsknet.org/'));
