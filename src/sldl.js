'use strict';
// Runs the sldl binary, turns its output into events, then files the download into a playlist folder.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const conf = require('./conf');

const AUDIO = /\.(flac|mp3|m4a|aac|ogg|opus|wav|alac)$/i;

function findBinary() {
  const cands = [
    process.env.SLDL_BIN,
    process.resourcesPath && path.join(process.resourcesPath, 'sldl'),
    path.join(__dirname, '..', 'resources', 'sldl'),
  ].filter(Boolean);
  for (const c of cands) { try { fs.accessSync(c, fs.constants.X_OK); return c; } catch { /* next */ } }
  return 'sldl'; // on PATH
}

// One line of sldl output -> a small event, or null for noise.
function parseLine(line) {
  let m;
  if ((m = line.match(/Downloading (\d+) tracks?/i))) return { type: 'total', total: +m[1] };
  if ((m = line.match(/^\s*Searching:\s*(.+)/))) return { type: 'searching', track: m[1].trim() };
  if ((m = line.match(/^\s*InProgress:\s*(.+)/))) return { type: 'progress', track: m[1].trim() };
  if ((m = line.match(/^\s*Succeeded:\s*(.+)/))) return { type: 'done', track: m[1].trim() };
  if ((m = line.match(/^\s*(NotFound|Failed):\s*(.+)/))) return { type: 'failed', reason: m[1], track: m[2].trim() };
  return null;
}

const looksLikeUrl = (s) => /^https?:\/\//i.test(s);
const slug = (s) => String(s).replace(/[\\/:*?"<>|]/g, '_').trim();

// The folder sldl made for this download, found by diffing the output dir.
function snapshot(dir) { try { return new Set(fs.readdirSync(dir)); } catch { return new Set(); } }

function organise(dir, before, name) {
  const after = fs.readdirSync(dir).filter((f) => !before.has(f) && !f.startsWith('.'));
  const folders = after.filter((f) => fs.statSync(path.join(dir, f)).isDirectory());
  const loose = after.filter((f) => fs.statSync(path.join(dir, f)).isFile() && AUDIO.test(f));
  let target = folders[0] ? path.join(dir, folders[0]) : null;
  if (name) {
    const wanted = path.join(dir, slug(name));
    if (target && target !== wanted && !fs.existsSync(wanted)) { fs.renameSync(target, wanted); target = wanted; }
    else if (!target && loose.length) { fs.mkdirSync(wanted, { recursive: true }); target = wanted; }
    else if (!target) target = null;
  } else if (!target && loose.length) {
    target = path.join(dir, `Playlist ${new Date().toISOString().slice(0, 10)}`);
    fs.mkdirSync(target, { recursive: true });
  }
  let moved = 0;
  if (target) for (const f of loose) { fs.renameSync(path.join(dir, f), path.join(target, f)); moved++; }
  return { folder: target, moved };
}

function listTracks(folder) {
  return fs.readdirSync(folder).filter((f) => AUDIO.test(f)).sort().map((f) => path.join(folder, f));
}

// download(): returns an EventEmitter with a .done promise. Events: line, total, searching, progress, done, failed.
function download({ input, outDir, format, name, bin = findBinary() }) {
  const ev = new EventEmitter();
  const c = conf.read();
  const dir = outDir || c.path;
  ev.done = new Promise((resolve, reject) => {
    if (!input) return reject(new Error('Nothing to download: give a Spotify URL or a search.'));
    if (!dir) return reject(new Error('No download folder set. Choose one in Settings or pass --out.'));
    fs.mkdirSync(dir, { recursive: true });
    const before = snapshot(dir);
    const args = [input, '--path', dir, '--no-progress'];
    if (format) args.push('--pref-format', format);
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    ev.cancel = () => child.kill('SIGTERM');
    const counts = { total: 0, done: 0, failed: 0 };
    let buf = '';
    const feed = (chunk) => {
      buf += chunk.toString().replace(/\r/g, '\n');
      const lines = buf.split('\n'); buf = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        ev.emit('line', line);
        const e = parseLine(line);
        if (!e) continue;
        if (e.type === 'total') counts.total = e.total;
        if (e.type === 'done') counts.done++;
        if (e.type === 'failed') counts.failed++;
        ev.emit(e.type, e, { ...counts });
      }
    };
    child.stdout.on('data', feed); child.stderr.on('data', feed);
    child.on('error', (err) => reject(err.code === 'ENOENT'
      ? new Error('sldl was not found. Install it or set SLDL_BIN.') : err));
    child.on('close', (code) => {
      if (buf.trim()) feed('\n');
      let org = { folder: null, moved: 0 };
      try { org = organise(dir, before, name); } catch (err) { ev.emit('line', `Could not organise: ${err.message}`); }
      resolve({ code, ok: code === 0, ...counts, ...org, tracks: org.folder ? listTracks(org.folder) : [] });
    });
  });
  return ev;
}

module.exports = { findBinary, parseLine, organise, listTracks, download, looksLikeUrl, AUDIO };
