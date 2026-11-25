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
// Python cannot read inside app.asar; electron-builder unpacks tools/ next to it.
const SCRIPT = path.join(__dirname, '..', 'tools', 'ipod_add.py').replace('app.asar', 'app.asar.unpacked');
const RECONNECT = path.join(__dirname, '..', 'tools', 'ipod_reconnect.py').replace('app.asar', 'app.asar.unpacked');

const ready = () => fs.existsSync(PY);

const sh = (cmd, args) => new Promise((resolve, reject) => {
  execFile(cmd, args, { maxBuffer: 16e6, timeout: 10 * 60 * 1000 }, (err, out, errOut) => (err ? reject(new Error(errOut.trim() || err.message)) : resolve(out)));
});

// One-off: private Python env with pygpod. Needs network once.
async function setup() {
  if (!ready()) await sh('/usr/bin/python3', ['-m', 'venv', VENV]);
  await sh(PY, ['-m', 'pip', 'install', '-q', 'pygpod[tags]', 'pyusb', 'libusb-package']);
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Make an ejected iPod that is still on USB mount again, without unplugging it. serial = its USB serial (its FireWire GUID).
async function reconnect(serial, { waitMs = 25000, list } = {}) {
  const devices = require('./devices');
  const find = async () => (await (list || devices.list)()).find((d) => String(d.serial).toUpperCase() === String(serial).toUpperCase());
  const d = await find();
  if (!d) throw new Error('That iPod is not on USB. Unplug it and plug it back in.');
  if (d.volume) return d; // already mounted
  if (!ready()) throw new Error('The iPod helper is not installed. Run: sldl-dl ipod-setup');
  const out = await new Promise((resolve) => execFile(PY, [RECONNECT, String(serial)], { timeout: 30000 }, (err, so) => resolve(so || '')));
  let r = {}; try { r = JSON.parse(out.trim().split('\n').pop()); } catch { /* none */ }
  if (!r.ok) throw new Error(r.error || 'The USB reset did not work. Unplug it and plug it back in.');
  for (const t0 = Date.now(); Date.now() - t0 < waitMs;) { await sleep(1500); const cur = await find(); if (cur && cur.volume) return cur; }
  throw new Error('The iPod did not mount within 25 seconds. Unplug it and plug it back in.');
}

// Eject (unmount and detach) a mounted iPod volume. Reconnect brings it back.
function eject(mount) {
  return new Promise((resolve, reject) => {
    if (!mount || !String(mount).startsWith('/Volumes/')) return reject(new Error('Not an iPod volume.'));
    execFile('/usr/sbin/diskutil', ['eject', mount], { timeout: 60000 }, (err, so, se) => (err ? reject(new Error((se || so || err.message).trim())) : resolve(so.trim())));
  });
}

module.exports = { setup, addToIpod, reconnect, eject, ready, guidOf, VENV };
