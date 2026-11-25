'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const conf = require('../src/conf');
const sldl = require('../src/sldl');
const devices = require('../src/devices');
const sync = require('../src/sync');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'sldl-test-'));

test('conf.write keeps unknown lines and comments', () => {
  const f = path.join(tmp(), 'sldl.conf');
  fs.writeFileSync(f, '# mine\nuser = a\nextra = keep\n');
  conf.write({ user: 'b', pass: 'x' }, f);
  const text = fs.readFileSync(f, 'utf8');
  assert.match(text, /# mine/); assert.match(text, /extra = keep/); assert.match(text, /user = b/); assert.match(text, /pass = x/);
  assert.deepStrictEqual(conf.redact({ pass: 'x', user: 'b' }), { pass: '********', user: 'b' });
});

test('parseLine understands sldl output', () => {
  assert.deepStrictEqual(sldl.parseLine('Downloading 12 tracks:'), { type: 'total', total: 12 });
  assert.strictEqual(sldl.parseLine('Succeeded: Artist - Song').type, 'done');
  assert.strictEqual(sldl.parseLine('NotFound: Artist - Song').type, 'failed');
  assert.strictEqual(sldl.parseLine('random noise'), null);
});

test('organise moves loose audio into the named playlist folder', () => {
  const d = tmp(); fs.writeFileSync(path.join(d, 'old.mp3'), '');
  const before = new Set(fs.readdirSync(d));
  fs.writeFileSync(path.join(d, 'a.flac'), ''); fs.writeFileSync(path.join(d, 'b.mp3'), ''); fs.writeFileSync(path.join(d, 'note.txt'), '');
  const r = sldl.organise(d, before, 'My Mix');
  assert.strictEqual(r.moved, 2);
  assert.deepStrictEqual(fs.readdirSync(r.folder).sort(), ['a.flac', 'b.mp3']);
  assert.ok(fs.existsSync(path.join(d, 'old.mp3')) && fs.existsSync(path.join(d, 'note.txt')));
});

test('download() runs a fake sldl end to end', async () => {
  const d = tmp(); const bin = path.join(tmp(), 'fake-sldl');
  fs.writeFileSync(bin, `#!/bin/sh\necho "Downloading 2 tracks:"\necho "Succeeded: A - One"\necho "NotFound: B - Two"\nmkdir -p "$3/Fake Playlist"\ntouch "$3/Fake Playlist/A - One.mp3"\n`, { mode: 0o755 });
  const ev = sldl.download({ input: 'https://open.spotify.com/playlist/x', outDir: d, bin });
  const r = await ev.done;
  assert.ok(r.ok); assert.strictEqual(r.total, 2); assert.strictEqual(r.done, 1); assert.strictEqual(r.failed, 1);
  assert.strictEqual(path.basename(r.folder), 'Fake Playlist'); assert.strictEqual(r.tracks.length, 1);
});

test('usbApple finds an iPod in system_profiler JSON', () => {
  const json = { SPUSBHostDataType: [{ _items: [{ _name: 'iPod', USBDeviceKeyVendorID: '0x05ac', USBDeviceKeyProductID: '0x1263', USBDeviceKeySerialNumber: 'ABC' }, { _name: 'Hub', USBDeviceKeyVendorID: '0x2109', USBDeviceKeyProductID: '0x2817' }] }] };
  const found = devices.usbApple(json);
  assert.strictEqual(found.length, 1); assert.strictEqual(devices.MODELS[found[0].pid], 'iPod nano 4G');
});

test('inspectVolume flags an empty SysInfo and missing iTunesDB', () => {
  const v = tmp(); fs.mkdirSync(path.join(v, 'iPod_Control', 'Device'), { recursive: true });
  fs.writeFileSync(path.join(v, 'iPod_Control', 'Device', 'SysInfo'), '');
  const i = devices.inspectVolume(v);
  assert.strictEqual(i.hasDb, false); assert.ok(i.flags.length === 2);
});

test('copyToPlayer writes files and an m3u8 with Rockbox paths', async () => {
  const src = tmp(); fs.writeFileSync(path.join(src, 'One.mp3'), 'x'); fs.writeFileSync(path.join(src, 'Two.flac'), 'y');
  const dest = tmp();
  const r = await sync.copyToPlayer({ folder: src, dest, playlist: 'Mix' });
  assert.strictEqual(r.copied, 2);
  assert.ok(fs.existsSync(path.join(dest, 'Music', 'Mix', 'One.mp3')));
  assert.match(fs.readFileSync(r.playlistFile, 'utf8'), /\/Music\/Mix\/One\.mp3/);
});

test('refuseStockIpod blocks a volume with iPod_Control and no Rockbox', () => {
  const v = tmp(); fs.mkdirSync(path.join(v, 'iPod_Control'));
  assert.ok(sync.refuseStockIpod(v));
  fs.mkdirSync(path.join(v, '.rockbox'));
  assert.strictEqual(sync.refuseStockIpod(v), null);
});
