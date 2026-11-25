'use strict';
// Finds iPods on USB and says what state they are in. Read-only: nothing here writes to a device.
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

const run = (cmd, args, opts = {}) => new Promise((resolve) => {
  execFile(cmd, args, { maxBuffer: 16e6, timeout: 20000, ...opts }, (err, stdout, stderr) => resolve({ err, stdout: stdout || '', stderr: stderr || '' }));
});

// USB product ids (Apple vendor 0x05ac). Names come from libgpod's tables; unknown ids still show as "iPod".
const MODELS = {
  0x1209: 'iPod 5G (video)', 0x1260: 'iPod nano 2G', 0x1261: 'iPod classic',
  0x1262: 'iPod nano 3G', 0x1263: 'iPod nano 4G', 0x1265: 'iPod nano 5G',
  0x1266: 'iPod nano 6G', 0x1267: 'iPod nano 7G',
};
// DFU and WTF recovery ids: the iPod's own firmware is not running.
const RECOVERY = { 0x1220: 'DFU (nano 2G)', 0x1223: 'DFU (S5L8702)', 0x1225: 'DFU (S5L8720/8730)', 0x1227: 'WTF recovery' };

function walk(node, out = []) {
  if (Array.isArray(node)) node.forEach((n) => walk(n, out));
  else if (node && typeof node === 'object') {
    if (node.vendor_id || node.USBDeviceKeyVendorID) out.push(node);
    for (const v of Object.values(node)) if (v && typeof v === 'object') walk(v, out);
  }
  return out;
}
const hex = (s) => { const m = String(s || '').match(/0x([0-9a-f]+)/i); return m ? parseInt(m[1], 16) : null; };

function usbApple(json) {
  const found = [];
  for (const n of walk(json)) {
    const vid = hex(n.USBDeviceKeyVendorID || n.vendor_id); const pid = hex(n.USBDeviceKeyProductID || n.product_id);
    if (vid !== 0x05ac || pid === null) continue;
    const name = String(n._name || '');
    if (MODELS[pid] || RECOVERY[pid] || /ipod/i.test(name)) found.push({ pid, name, serial: n.USBDeviceKeySerialNumber || n.serial_num || '' });
  }
  return found;
}

// Mounted volumes that carry an iPod_Control folder.
function mountedIpods(volumesDir = '/Volumes') {
  let names = [];
  try { names = fs.readdirSync(volumesDir); } catch { return []; }
  return names.map((n) => path.join(volumesDir, n)).filter((p) => fs.existsSync(path.join(p, 'iPod_Control')));
}

function inspectVolume(mount) {
  const ctl = path.join(mount, 'iPod_Control');
  const size = (f) => { try { return fs.statSync(f).size; } catch { return -1; } };
  const sysInfo = size(path.join(ctl, 'Device', 'SysInfo'));
  const hasDb = size(path.join(ctl, 'iTunes', 'iTunesDB')) > 0 || size(path.join(ctl, 'iTunes', 'iTunesCDB')) > 0;
  let free = null; let total = null;
  try { const s = fs.statfsSync(mount); free = s.bavail * s.bsize; total = s.blocks * s.bsize; } catch { /* ignore */ }
  const flags = [];
  if (sysInfo === 0) flags.push('SysInfo is empty');
  if (!hasDb) flags.push('no iTunesDB (library database missing)');
  return { mount, sysInfoBytes: sysInfo, hasDb, free, total, flags };
}

// One call for the UI and CLI. status: none | recovery | disk-mode | ready
async function list(opts = {}) {
  const sp = opts.profile || (await run('/usr/sbin/system_profiler', ['SPUSBHostDataType', '-json'])).stdout;
  let usb = [];
  try { usb = usbApple(JSON.parse(sp)); } catch { /* no USB data */ }
  const mounts = (opts.mounts || mountedIpods(opts.volumesDir)).map(inspectVolume);
  const devices = [];
  for (const u of usb) {
    const recovery = RECOVERY[u.pid];
    const vol = !recovery ? mounts.shift() : null;
    devices.push({
      model: MODELS[u.pid] || recovery || 'iPod',
      usbId: '0x' + u.pid.toString(16),
      serial: u.serial,
      status: recovery ? 'recovery' : vol ? (vol.hasDb ? 'ready' : 'disk-mode') : 'disk-mode',
      volume: vol || null,
      notes: recovery ? ['The iPod is in recovery/DFU: its own firmware is not running.']
        : vol && !vol.hasDb ? ['Mounted as a plain disk with no library database. A bricked iPod looks like this.'] : [],
    });
  }
  for (const m of mounts) devices.push({ model: 'iPod (volume only)', usbId: '', serial: '', status: m.hasDb ? 'ready' : 'disk-mode', volume: m, notes: [] });
  return devices;
}

// Music.app view of the same hardware. Read-only; opens Music if it is closed.
async function musicSources() {
  const r = await run('/usr/bin/osascript', ['-e', 'tell application "Music" to get name of every source']);
  if (r.err) return { ok: false, error: r.stderr.trim() || String(r.err.message), sources: [] };
  return { ok: true, sources: r.stdout.trim().split(/,\s*/).filter(Boolean) };
}

module.exports = { list, usbApple, mountedIpods, inspectVolume, musicSources, MODELS, RECOVERY };
