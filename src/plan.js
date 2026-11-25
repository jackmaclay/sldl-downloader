'use strict';
// Runs one playlist the way the Download page plans it: each song has a format (mp3 or flac).
//   1. Songs we already have (found by title + artist in `opts.index`: the iPod folder, the Mac library, other playlists in this
//      batch) are NOT downloaded again: the existing file is cloned and filed into this playlist.
//   2. The rest are downloaded per format, then filed by library.js (iPod folder MP3, Mac library in the chosen format, clones
//      where the files match).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { EventEmitter } = require('events');
const sldl = require('./sldl');
const spotify = require('./spotify');
const library = require('./library');
const conf = require('./conf');
const prefs = require('./prefs');

const slug = (s) => String(s || '').replace(/[\\/:*?"<>|]/g, '_').trim() || 'Playlist';

// opts: { name, items:[{title, artist, seconds, format}], saveToLibrary, libraryDir, ipodDir, only, index, bin, convert, download }
// Returns an EventEmitter with .cancel() and .done (a promise of the result). Events: line, total, searching, progress, done, failed, reused.
function runPlaylist(opts) {
  const ev = new EventEmitter();
  let current = null; let cancelled = false;
  ev.cancel = () => { cancelled = true; if (current && current.cancel) current.cancel(); };
  ev.done = (async () => {
    const c = conf.read(); const p = prefs.read();
    const ipodDir = library.expand(opts.ipodDir || c.path);
    if (!ipodDir) throw new Error('No download folder set. Choose one in Settings.');
    const libraryDir = library.expand(opts.libraryDir !== undefined ? opts.libraryDir : p.libraryDir);
    const saveToLibrary = !opts.only && !!(opts.saveToLibrary !== undefined ? opts.saveToLibrary : p.saveToLibrary) && !!libraryDir; // an "only" playlist lives in one folder
    const download = opts.download || sldl.download;
    const items = (opts.items || []).filter((i) => i && i.title);
    if (!items.length) throw new Error('Nothing to download.');
    const groups = { mp3: items.filter((i) => i.format !== 'flac'), flac: items.filter((i) => i.format === 'flac') };
    if (groups.flac.length && !saveToLibrary) throw new Error('FLAC is kept in your Music folder. Turn on "Also save to my Music folder" to use it.');
    let convert = opts.convert;
    if (convert === undefined) { const bin = library.findFfmpeg(); convert = bin ? library.ffmpegToMp3(bin) : null; }
    const name = slug(opts.name);
    const totals = { total: 0, done: 0, failed: 0 }; const sum = { cloned: 0, copied: 0, converted: 0, reused: 0, notes: [] };
    const absorb = (f) => { sum.cloned += f.cloned; sum.copied += f.copied; sum.converted += f.converted; sum.notes.push(...f.notes); };
    for (const [fmt, list] of Object.entries(groups)) {
      if (!list.length || cancelled) continue;
      const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'sldl-stage-'));
      try {
        // 1. songs we already have
        let todo = list;
        if (opts.index) {
          const reuseDir = path.join(staging, 'reuse'); const have = []; todo = [];
          for (const i of list) { const f = opts.index.find(i.title, i.artist, fmt === 'flac'); if (f && fs.existsSync(f)) have.push([i, f]); else todo.push(i); }
          if (have.length) {
            fs.mkdirSync(reuseDir);
            for (const [i, f] of have) { library.clone(f, library.unique(path.join(reuseDir, path.basename(f)))); ev.emit('reused', { type: 'reused', track: `${i.artist} - ${i.title}`, from: f }); }
            absorb(library.fileGroup({ staging: reuseDir, name, ipodDir, libraryDir, saveToLibrary, convert }));
            sum.reused += have.length;
          }
        }
        // 2. the rest
        if (todo.length && !cancelled) {
          fs.mkdirSync(path.join(staging, 'csv'));
          const csv = path.join(staging, 'csv', `${name}.csv`);
          fs.writeFileSync(csv, spotify.toCsv(todo.map((i) => ({ title: i.title, artist: i.artist, seconds: i.seconds }))));
          current = download({ input: csv, outDir: path.join(staging, 'out'), format: fmt === 'flac' ? 'flac,mp3' : 'mp3', rawFormat: true, csvFallback: false, bin: opts.bin });
          for (const t of ['line', 'total', 'searching', 'progress', 'done', 'failed']) current.on(t, (e, counts) => ev.emit(t, t === 'line' ? e : { ...e, group: fmt }, counts));
          const r = await current.done;
          totals.total += r.total; totals.done += r.done; totals.failed += r.failed;
          if (r.folder) absorb(library.fileGroup({ staging: r.folder, name, ipodDir, libraryDir, saveToLibrary, convert, meta: library.readIndex(r.folder) }));
        }
      } finally { fs.rmSync(staging, { recursive: true, force: true }); }
    }
    let folder = path.join(ipodDir, name);
    if (opts.only && fs.existsSync(folder)) folder = library.moveOnly(folder, opts.only);
    const libraryFolder = saveToLibrary && !opts.only ? path.join(libraryDir, name) : null;
    // What was filed now counts as "already have" for the next playlist in the batch.
    if (opts.index) for (const d of [folder, libraryFolder]) for (const f of library.listAudio(d || '')) await opts.index.addFile(f);
    return { ok: !cancelled, ...totals, ...sum, folder: fs.existsSync(folder) ? folder : null, libraryFolder,
      tracks: fs.existsSync(folder) ? library.listAudio(folder).filter((f) => library.IPOD_OK.test(f)).sort() : [] };
  })();
  return ev;
}

module.exports = { runPlaylist, slug };
