'use strict';
// "Do we already have this song?" Scans the iPod folder, the Mac library and any other folders, and answers by title + artist
// (not file name), so a song is never downloaded twice and never stored twice. The same song in two places is cloned, not copied.
const fs = require('fs');
const path = require('path');
const { AUDIO } = require('./sldl');

const LOSSLESS = /\.(flac|wav|aif|aiff|alac)$/i;
const fold = (s) => String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/['’`]/g, '');
const words = (s) => fold(s).replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(Boolean);

// "Imagine - Remastered 2010 (Live)" -> "imagine"; version words and brackets are dropped so a remaster still counts as the song.
function baseTitle(title) {
  let s = fold(title).replace(/\(.*?\)|\[.*?\]/g, ' ').split(/\s-\s/)[0];
  s = s.replace(/\b(remaster(ed)?|version|mix|edit|live|feat|ft)\b.*$/, ' ');
  return words(s).join(' ');
}
const keyOf = (title, artist) => `${baseTitle(title)}|${words(artist)[0] || ''}`;

// Title and artist from the file name when there are no tags: "01 - Candy.mp3", "Candy - Paolo Nutini.mp3".
function fromName(file) {
  const b = path.basename(file, path.extname(file));
  if (/ - /.test(b)) { const i = b.lastIndexOf(' - '); const a = b.slice(i + 3); const t = b.slice(0, i).replace(/^\d+[\s.\-]+/, ''); return { title: t, artist: a }; }
  return { title: b.replace(/^\d+[\s.\-]+/, ''), artist: '' };
}

let mm = null;
async function readTags(file) {
  try {
    mm = mm || (await import('music-metadata'));
    const r = await mm.parseFile(file, { duration: false, skipCovers: true });
    if (r.common.title) return { title: r.common.title, artist: r.common.artist || (r.common.artists || [])[0] || '' };
  } catch { /* unreadable or no tags: fall back to the name */ }
  return fromName(file);
}

function walk(dir, out = []) {
  let names = [];
  try { names = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of names) {
    if (e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else if (AUDIO.test(e.name)) out.push(p);
  }
  return out;
}

// Index of every song in `dirs`. opts.tags=false uses file names only (fast, for tests).
async function buildIndex(dirs, opts = {}) {
  const map = new Map(); // key -> [{ file, lossless }]
  const index = {
    map,
    add(file, title, artist) {
      if (!baseTitle(title)) return;
      const k = keyOf(title, artist);
      const list = map.get(k) || []; if (!list.some((x) => x.file === file)) list.push({ file, lossless: LOSSLESS.test(file) }); map.set(k, list);
    },
    // wantLossless: only a lossless file satisfies the request. Returns the best existing file or null. An artist-less file still matches by title.
    find(title, artist, wantLossless = false) {
      const t = baseTitle(title); const a = words(artist)[0] || '';
      let hits = map.get(`${t}|${a}`) || [];
      if (!hits.length && a) hits = (map.get(`${t}|`) || []);       // file had no artist
      if (!hits.length) return null;
      const pick = wantLossless ? hits.filter((x) => x.lossless) : hits.slice().sort((x, y) => Number(x.lossless) - Number(y.lossless)); // MP3 preferred when MP3 is wanted
      return pick[0] ? pick[0].file : null;
    },
    async addFile(file) { const { title, artist } = await readTags(file); index.add(file, title, artist); },
    size: () => map.size,
  };
  for (const dir of dirs.filter(Boolean)) {
    for (const f of walk(dir)) {
      const { title, artist } = opts.tags === false ? fromName(f) : await readTags(f);
      index.add(f, title, artist);
    }
  }
  return index;
}

module.exports = { buildIndex, keyOf, baseTitle, fromName, LOSSLESS };
