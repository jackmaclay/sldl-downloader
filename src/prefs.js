'use strict';
// App-only preferences (not sldl's): ~/.config/sldl/app.json. FLAC is off unless Jack turns it on in Settings.
const fs = require('fs');
const os = require('os');
const path = require('path');

const file = () => path.join(process.env.SLDL_HOME || path.join(os.homedir(), '.config', 'sldl'), 'app.json');

function read() {
  try { return { allowFlac: false, ...JSON.parse(fs.readFileSync(file(), 'utf8')) }; } catch { return { allowFlac: false }; }
}
function write(values) {
  const next = { ...read(), ...values, allowFlac: !!(values.allowFlac ?? read().allowFlac) };
  fs.mkdirSync(path.dirname(file()), { recursive: true });
  fs.writeFileSync(file(), JSON.stringify(next, null, 2) + '\n');
  return next;
}

// mp3 unless something else was asked for; flac only counts when allowed.
function resolveFormat(requested, confFormat, prefs = read()) {
  const f = String(requested || confFormat || 'mp3').toLowerCase();
  return f === 'flac' && !prefs.allowFlac ? 'mp3' : f;
}

module.exports = { read, write, resolveFormat, file };
