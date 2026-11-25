'use strict';
// Where downloaded music lives (Jack, 2026-11-25).
//   iPod folder = sldl's download folder (~/Music/New Downloads/<playlist>): iPod-ready files only (MP3 or AAC), laid out for the iPods.
//   Mac library = ~/Music/Playlists/<playlist>: the format Jack chose. When it is the same file as the iPod one it is an
//                 APFS clone (no second copy on disk); when it is FLAC the iPod folder gets a 256 kbps AAC copy instead.
//   "only" = a single folder and nowhere else (Lily's playlists).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { AUDIO } = require('./sldl');

const IPOD_OK = /\.(mp3|m4a|aac)$/i;
const expand = (p) => (p && p.startsWith('~') ? path.join(os.homedir(), p.slice(1)) : p);
const listAudio = (dir) => { try { return fs.readdirSync(dir).filter((f) => AUDIO.test(f) && !f.startsWith('.')).map((f) => path.join(dir, f)); } catch { return []; } };

// Copy-on-write clone where the filesystem allows it (APFS, same volume), else an ordinary copy. Returns 'clone' | 'copy'.
function clone(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  try { fs.copyFileSync(src, dest, fs.constants.COPYFILE_FICLONE_FORCE); return 'clone'; } catch { /* not cloneable here */ }
  fs.copyFileSync(src, dest); return 'copy';
}

// The iPod copy of a lossless file (FLAC, WAV, AIFF, OGG...): 256 kbps AAC at 44.1 kHz in an .m4a, made with macOS's own converter,
// so nothing extra has to be installed. iPods play AAC natively and 44.1 kHz is within what they support. Returns null off macOS.
const AFCONVERT = '/usr/bin/afconvert';
function macConverter() {
  if (process.platform !== 'darwin' || !fs.existsSync(AFCONVERT)) return null;
  const run = (src, out) => execFileSync(AFCONVERT, ['-f', 'm4af', '-d', 'aac@44100', '-b', '256000', '-s', '0', '-q', '127', src, out], { stdio: 'ignore' });
  run.ext = '.m4a'; // the file the iPod gets; a converter without .ext makes .mp3 (tests use that)
  return run;
}

const safeName = (x) => String(x || '').replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim();

// sldl writes <folder>/_index.csv: which requested song each downloaded file is. Returns { 'file name': { title, artist } } for the files it got.
function readIndex(folder) {
  let txt = ''; try { txt = fs.readFileSync(path.join(folder, '_index.csv'), 'utf8'); } catch { return {}; }
  const rows = []; let row = []; let cell = ''; let q = false;
  for (let i = 0; i < txt.length; i++) {
    const c = txt[i];
    if (q) { if (c === '"' && txt[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true; else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && txt[i + 1] === '\n') i++; row.push(cell); cell = ''; if (row.length > 1 || row[0]) rows.push(row); row = []; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const head = rows.shift() || []; const col = (n) => head.indexOf(n);
  const out = {};
  for (const r of rows) if (r[col('state')] === '1' && r[col('filepath')]) out[path.basename(r[col('filepath')])] = { title: r[col('title')], artist: r[col('artist')] };
  return out;
}

const unique = (p) => { if (!fs.existsSync(p)) return p; const e = path.extname(p); const b = p.slice(0, -e.length); let i = 2; while (fs.existsSync(`${b} (${i})${e}`)) i++; return `${b} (${i})${e}`; };

// Files one finished sldl run. staging = the folder sldl made. Returns { ipodFolder, libraryFolder, ipod:[files], cloned, copied, converted, notes }.
//   saveToLibrary false: files go to the iPod folder only (lossless files are converted and the original dropped).
//   saveToLibrary true:  MP3/m4a go to the iPod folder and are cloned into the library; FLAC and other formats go to the library
//                        and a converted AAC copy goes to the iPod folder.
//   meta: { 'file name': { title, artist, album, genre, year, track } } for the files we know. The iPod gets these names, not the file's own tags.
function fileGroup({ staging, name, ipodDir, libraryDir, saveToLibrary, convert, meta = {} }) {
  const out = { ipodFolder: path.join(ipodDir, name), libraryFolder: libraryDir ? path.join(libraryDir, name) : null, ipod: [], cloned: 0, copied: 0, converted: 0, notes: [], tags: {} };
  fs.mkdirSync(out.ipodFolder, { recursive: true });
  const lib = saveToLibrary && out.libraryFolder;
  if (lib) fs.mkdirSync(out.libraryFolder, { recursive: true });
  const count = (how) => (how === 'clone' ? out.cloned++ : out.copied++);
  for (const f of listAudio(staging)) {
    // Name the file "Title - Artist" from the Spotify data when we know which song it is, whatever the uploader called it.
    const m = meta[path.basename(f)];
    const ext = path.extname(f);
    const base = m && m.title ? `${safeName(m.title)}${m.artist ? ' - ' + safeName(m.artist) : ''}${ext}` : path.basename(f);
    if (m && m.title) out.tags[path.basename(base, ext)] = { title: m.title, artist: m.artist || '', album: m.album || '', genre: m.genre || '', year: m.year || 0, track: m.track || 0 };
    if (IPOD_OK.test(f)) {
      const dest = path.join(out.ipodFolder, base);
      if (fs.existsSync(dest)) { fs.unlinkSync(f); out.ipod.push(dest); } else { fs.renameSync(f, dest); out.ipod.push(dest); }
      if (lib) { const t = path.join(out.libraryFolder, base); if (!fs.existsSync(t)) count(clone(dest, t)); }
      continue;
    }
    // FLAC, ogg, wav...: the iPod gets an AAC copy (the library keeps the original)
    const stem = path.basename(base, path.extname(base)); const outExt = (convert && convert.ext) || '.mp3';
    const copy = path.join(out.ipodFolder, stem + outExt);
    if (!convert) { out.notes.push(`${base}: no converter available, so no iPod copy was made`); if (lib) fs.renameSync(f, unique(path.join(out.libraryFolder, base))); continue; }
    const source = lib ? unique(path.join(out.libraryFolder, base)) : f;
    if (lib) fs.renameSync(f, source);                         // the library keeps the lossless original
    try { if (!fs.existsSync(copy)) { convert(source, copy); out.converted++; } }
    catch (e) { out.notes.push(`${base}: could not make an iPod copy (${String(e.message).split('\n')[0]})`); if (fs.existsSync(copy)) fs.unlinkSync(copy); if (!lib) fs.unlinkSync(f); continue; }
    if (!lib) fs.unlinkSync(f);
    out.ipod.push(copy);
  }
  // The iPod writer reads this so a blank or odd tag in the file never becomes a blank or odd name on the screen.
  if (Object.keys(out.tags).length) {
    const side = path.join(out.ipodFolder, '.tags.json'); let cur = {}; try { cur = JSON.parse(fs.readFileSync(side, 'utf8')); } catch { /* new */ }
    fs.writeFileSync(side, JSON.stringify({ ...cur, ...out.tags }, null, 1));
  }
  return out;
}

// A playlist that lives in ONE folder only (for example Lily's): move it there, merging if it exists.
function moveOnly(folder, only) {
  const dest = path.join(expand(only), path.basename(folder));
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (!fs.existsSync(dest)) { fs.renameSync(folder, dest); return dest; }
  for (const f of fs.readdirSync(folder)) { const t = path.join(dest, f); if (!fs.existsSync(t)) fs.renameSync(path.join(folder, f), t); }
  return dest;
}

module.exports = { readIndex, unique, clone, fileGroup, moveOnly, macConverter, listAudio, expand, IPOD_OK };
