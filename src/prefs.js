'use strict';
// App-only preferences (not sldl's): ~/.config/sldl/app.json.
//   allowFlac     legacy switch for the Settings page.
//   saveToLibrary also keep a copy (an APFS clone where possible) in the Mac music library.
//   libraryDir    the Mac music library, one folder per playlist.
//   defaultFormat mp3 or flac, the "format for all" on the Download page.
//   autoEject     eject an iPod right after sending to it (it is only mounted for the upload).
const fs = require('fs');
const os = require('os');
const path = require('path');

const file = () => path.join(process.env.SLDL_HOME || path.join(os.homedir(), '.config', 'sldl'), 'app.json');
const DEFAULTS = { allowFlac: false, saveToLibrary: true, libraryDir: path.join(os.homedir(), 'Music', 'Playlists'), defaultFormat: 'mp3', autoEject: true };

function read() {
  try { return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(file(), 'utf8')) }; } catch { return { ...DEFAULTS }; }
}
function write(values) {
  const next = { ...read(), ...values };
  for (const k of ['allowFlac', 'saveToLibrary', 'autoEject']) next[k] = !!next[k];
  if (!['mp3', 'flac'].includes(next.defaultFormat)) next.defaultFormat = 'mp3';
  fs.mkdirSync(path.dirname(file()), { recursive: true });
  fs.writeFileSync(file(), JSON.stringify(next, null, 2) + '\n');
  return next;
}

// mp3 unless something else was asked for; flac only counts when allowed.
function resolveFormat(requested, confFormat, prefs = read()) {
  const f = String(requested || confFormat || 'mp3').toLowerCase();
  return f === 'flac' && !prefs.allowFlac ? 'mp3' : f;
}

module.exports = { read, write, resolveFormat, file, DEFAULTS };
