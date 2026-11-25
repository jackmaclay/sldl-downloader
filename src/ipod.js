'use strict';
// Writes tracks into a stock iPod's library database (tools/ipod_add.py, pygpod in a private venv).
// This is the only code that writes to an iPod. Callers must have Jack's say-so (see CLAUDE.md).
const { execFile, spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { AUDIO } = require('./sldl');

const VENV = path.join(process.env.SLDL_HOME || path.join(os.homedir(), '.config', 'sldl'), 'venv');
const PY = path.join(VENV, 'bin', 'python');
const SCRIPT = path.join(__dirname, '..', 'tools', 'ipod_add.py');

const ready = () => fs.existsSync(PY);

const sh = (cmd, args) => new Promise((resolve, reject) => {
  execFile(cmd, args, { maxBuffer: 16e6, timeout: 10 * 60 * 1000 }, (err, out, errOut) => (err ? reject(new Error(errOut.trim() || err.message)) : resolve(out)));
});

// One-off: private Python env with pygpod. Needs network once.
async function setup() {
  if (!ready()) await sh('/usr/bin/python3', ['-m', 'venv', VENV]);
  await sh(PY, ['-m', 'pip', 'install', '-q', 'pygpod[tags]']);
  return { venv: VENV };
}

// The GUID is the USB serial of a nano; the iPod signs its database with it.
const guidOf = (serial) => String(serial || '').toUpperCase().replace(/[^0-9A-F]/g, '');

// onEvent gets each JSON line the script prints. Resolves with the final "done" object.
function addToIpod({ mount, guid, playlist, files, onEvent = () => {} }) {
  return new Promise((resolve, reject) => {
    if (!ready()) return reject(new Error('The iPod helper is not installed. Run: sldl-dl ipod-setup'));
    if (!/^[0-9A-F]{16}$/.test(guid)) return reject(new Error('Could not read the iPod serial (FireWire GUID) from USB.'));
    const list = files.filter((f) => AUDIO.test(f));
    if (!list.length) return reject(new Error('No audio files to add.'));
    const p = spawn(PY, [SCRIPT, mount, playlist || '', guid, ...list]);
    let done = null; let errText = ''; let buf = '';
    p.stdout.on('data', (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 1);
        try { const o = JSON.parse(line); onEvent(o); if (o.type === 'done') done = o; if (o.type === 'error') errText = o.msg; } catch { /* not ours */ }
      }
    });
    p.stderr.on('data', (d) => { errText += d; });
    p.on('close', (code) => (code === 0 && done ? resolve(done) : reject(new Error(errText.trim() || `iPod helper exited with code ${code}`))));
  });
}

module.exports = { setup, addToIpod, ready, guidOf, VENV };
