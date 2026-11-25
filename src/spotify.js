'use strict';
// Spotify profile support without an API login: the profile page is rendered in a hidden Electron window to
// list public playlists, and each playlist's track list and length come from its public embed page.
const path = require('path');
const { spawn } = require('child_process');

// Typical bitrates (kbit/s) for sizing before anything is downloaded. FLAC varies; 900 is a safe middle.
const RATES = { mp3: 320, m4a: 256, aac: 256, ogg: 160, opus: 160, flac: 900 };
const DEFAULT_FORMAT = 'mp3';
// A 16 GB iPod formats to about 15 GB usable; keep a little back for the database.
const DEFAULT_BUDGET = 14.5e9;

// "https://open.spotify.com/user/ID?si=..." or "spotify:user:ID" -> "ID", else null.
function parseProfile(input) {
  const s = String(input || '').trim();
  let m = s.match(/^https?:\/\/open\.spotify\.com\/(?:intl-[a-z]+\/)?user\/([^/?#\s]+)/i);
  if (!m) m = s.match(/^spotify:user:([^:\s]+)/i);
  return m ? decodeURIComponent(m[1]) : null;
}

const bytesFor = (seconds, format) => Math.round(seconds * (RATES[String(format || DEFAULT_FORMAT).toLowerCase()] || RATES[DEFAULT_FORMAT]) * 125);

// The embed page ships its data as JSON in __NEXT_DATA__.
function parseEmbed(html) {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s);
  if (!m) throw new Error('Spotify changed its embed page; could not read the playlist.');
  const e = JSON.parse(m[1]).props.pageProps.state.data.entity;
  const list = e.trackList || [];
  return { name: String(e.name || e.title || '').trim(), tracks: list.length, seconds: Math.round(list.reduce((n, t) => n + (t.duration || 0), 0) / 1000) };
}

// Full embed read: track list for a CSV hand-off to sldl, plus the playlist's cover image.
const parseEmbedFull = (html) => {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s);
  if (!m) throw new Error('Spotify changed its embed page; could not read the playlist.');
  const e = JSON.parse(m[1]).props.pageProps.state.data.entity;
  const list = e.trackList || [];
  const art = ((e.coverArt && e.coverArt.sources) || []).slice().sort((a, b) => (b.width || 0) - (a.width || 0))[0];
  return {
    name: String(e.name || e.title || '').trim(),
    tracks: list.map((t) => ({ title: t.title, artist: t.subtitle, seconds: Math.round((t.duration || 0) / 1000) })),
    cover: art ? art.url : null,
    capped: list.length >= 100, // the embed lists at most 100 tracks
  };
};
async function playlistTracks(id, fetchFn = fetch) {
  const r = await fetchFn(`https://open.spotify.com/embed/playlist/${id}`, { headers: { 'user-agent': 'Mozilla/5.0' } });
  if (!r.ok) throw new Error(`Spotify returned ${r.status} for playlist ${id}.`);
  return { id, ...parseEmbedFull(await r.text()) };
}
const playlistId = (s) => { const m = String(s || '').match(/open\.spotify\.com\/(?:intl-[a-z]+\/)?playlist\/([A-Za-z0-9]+)/i) || String(s || '').match(/^spotify:playlist:([A-Za-z0-9]+)/i); return m ? m[1] : null; };
const csvCell = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
// Columns sldl reads by default.
const toCsv = (tracks) => 'Artist,Album,Title,Length\n' + tracks.map((t) => [t.artist, '', t.title, t.seconds].map(csvCell).join(',')).join('\n') + '\n';

async function playlistInfo(id, fetchFn = fetch) {
  const r = await fetchFn(`https://open.spotify.com/embed/playlist/${id}`, { headers: { 'user-agent': 'Mozilla/5.0' } });
  if (!r.ok) throw new Error(`Spotify returned ${r.status} for playlist ${id}.`);
  return { id, url: `https://open.spotify.com/playlist/${id}`, ...parseEmbed(await r.text()) };
}

// Runs inside Electron. Returns the ids of the profile's public playlists, in page order.
async function scrapeInElectron(user) {
  const { BrowserWindow } = require('electron');
  const win = new BrowserWindow({ show: false, width: 1000, height: 1400, webPreferences: { sandbox: true, contextIsolation: true, backgroundThrottling: false } });
  // Spotify serves a bare page to the default Electron user agent.
  win.webContents.setUserAgent(win.webContents.userAgent.replace(/\s*Electron\/\S+/, ''));
  const js = `(() => {
    const main = document.querySelector('main'); if (!main) return null;
    const m = main.innerText.match(/(\\d+)\\s+Public Playlists?/i); if (!m) return null;
    const ids = [...main.querySelectorAll('a[href*="/playlist/"]')].map((a) => (a.href.match(/playlist\\/([A-Za-z0-9]+)/) || [])[1]).filter(Boolean);
    return { count: +m[1], ids: [...new Set(ids)] };
  })()`;
  const wait = (ms) => new Promise((res) => setTimeout(res, ms));
  const read = async () => {
    for (let i = 0; i < 40; i++) {
      const r = await win.webContents.executeJavaScript(js);
      if (r && (r.count === 0 || r.ids.length)) { await wait(1000); return win.webContents.executeJavaScript(js); }
      await wait(500);
    }
    return null;
  };
  try {
    const base = `https://open.spotify.com/user/${encodeURIComponent(user)}`;
    await win.loadURL(base);
    let r = await read();
    if (!r) throw new Error('Could not read that profile. It may not exist, or Spotify changed its page.');
    if (r.ids.length < r.count) { // the profile page only shows a handful; the full list is on /playlists
      await win.loadURL(`${base}/playlists`);
      const full = await read();
      if (full && full.ids.length > r.ids.length) r = full;
    }
    return r.ids.slice(0, r.count);
  } finally { win.destroy(); }
}

// From the CLI (plain node) this launches Electron with tools/profile.js; in the app it runs in-process.
function scrapeIds(user) {
  if (process.versions.electron) return scrapeInElectron(user);
  return new Promise((resolve, reject) => {
    let bin; try { bin = require('electron'); } catch { return reject(new Error('Profile download needs Electron (npm install).')); }
    const p = spawn(bin, [path.join(__dirname, '..', 'tools', 'profile.js'), user], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = ''; let err = '';
    p.stdout.on('data', (d) => { out += d; }); p.stderr.on('data', (d) => { err += d; });
    p.on('close', (code) => {
      const line = out.split('\n').find((l) => l.startsWith('IDS:'));
      if (code === 0 && line) resolve(JSON.parse(line.slice(4)));
      else reject(new Error((out.split('\n').find((l) => l.startsWith('ERR:')) || err || 'profile lookup failed').replace(/^ERR:/, '').trim()));
    });
  });
}

// One playlist with its songs, for the download planner: { id, url, name, tracks: count, seconds, items:[{title, artist, seconds}], capped }.
async function playlistPlan(id, fetchFn = fetch) {
  const pl = await playlistTracks(id, fetchFn);
  return { id, url: `https://open.spotify.com/playlist/${id}`, name: pl.name, tracks: pl.tracks.length, seconds: pl.tracks.reduce((n, t) => n + t.seconds, 0), items: pl.tracks, capped: pl.capped, cover: pl.cover };
}

async function profilePlaylists(user, { fetchFn, items = false } = {}) {
  const ids = await scrapeIds(user);
  const out = [];
  for (const id of ids) out.push(items ? await playlistPlan(id, fetchFn) : await playlistInfo(id, fetchFn));
  return out;
}

// Greedy check used by CLI and tests: do these playlists fit, and which would push it over?
function fit(infos, format, budget) {
  const sizes = infos.map((p) => bytesFor(p.seconds, format));
  const total = sizes.reduce((a, b) => a + b, 0);
  return { sizes, total, fits: total <= budget };
}

module.exports = { playlistPlan, playlistTracks, playlistId, toCsv, parseEmbedFull, scrapeInElectron, parseProfile, parseEmbed, playlistInfo, profilePlaylists, bytesFor, fit, RATES, DEFAULT_BUDGET, DEFAULT_FORMAT };
