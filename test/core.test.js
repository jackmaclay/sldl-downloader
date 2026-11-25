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
  const ev = sldl.download({ input: 'https://open.spotify.com/playlist/x', outDir: d, bin, csvFallback: false });
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

test('spotify: profile links, embed parsing, size estimates', () => {
  const sp = require('../src/spotify');
  assert.equal(sp.parseProfile('https://open.spotify.com/user/abc?si=1'), 'abc');
  assert.equal(sp.parseProfile('https://open.spotify.com/intl-en/user/abc'), 'abc');
  assert.equal(sp.parseProfile('spotify:user:abc'), 'abc');
  assert.equal(sp.parseProfile('https://open.spotify.com/playlist/xyz'), null);
  const html = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: { state: { data: { entity: { name: ' Mix ', trackList: [{ duration: 180000 }, { duration: 120000 }] } } } } } })}</script>`;
  assert.deepEqual(sp.parseEmbed(html), { name: 'Mix', tracks: 2, seconds: 300 });
  assert.equal(sp.bytesFor(3600, 'mp3'), 3600 * 320 * 125); // one hour of 320 kbit/s
  const lists = [{ seconds: 3600 }, { seconds: 3600 }];
  assert.equal(sp.fit(lists, 'mp3', 2.8e8).fits, false);
  assert.equal(sp.fit(lists, 'mp3', 2.9e8).fits, true);
});

test('prefs: mp3 by default, flac only when allowed', () => {
  const prefs = require('../src/prefs');
  assert.equal(prefs.resolveFormat(undefined, undefined, { allowFlac: false }), 'mp3');
  assert.equal(prefs.resolveFormat('flac', undefined, { allowFlac: false }), 'mp3');
  assert.equal(prefs.resolveFormat(undefined, 'flac', { allowFlac: false }), 'mp3');
  assert.equal(prefs.resolveFormat('flac', undefined, { allowFlac: true }), 'flac');
  assert.equal(prefs.resolveFormat('m4a', 'flac', { allowFlac: false }), 'm4a');
});

test('conf: an empty value removes the key (sldl cannot parse "key =")', () => {
  const f = path.join(os.tmpdir(), `sldl-empty-${process.pid}.conf`);
  fs.writeFileSync(f, 'user = a\nname-format = {artist}\npref-format = mp3\n');
  conf.write({ 'name-format': '', 'new-empty': '' }, f);
  const txt = fs.readFileSync(f, 'utf8');
  assert.ok(!/name-format|new-empty/.test(txt));
  assert.match(txt, /user = a/); assert.match(txt, /pref-format = mp3/);
  fs.rmSync(f);
});

test('spotify: playlist ids and the CSV handed to sldl', () => {
  const sp = require('../src/spotify');
  assert.equal(sp.playlistId('https://open.spotify.com/playlist/6l0w7poa85QLRw3VZNcsNU?si=x'), '6l0w7poa85QLRw3VZNcsNU');
  assert.equal(sp.playlistId('spotify:playlist:abc123'), 'abc123');
  assert.equal(sp.playlistId('https://open.spotify.com/user/abc'), null);
  const csv = sp.toCsv([{ title: 'Say "Hi"', artist: 'A, B', seconds: 200 }]);
  assert.equal(csv, 'Artist,Album,Title,Length\n"A, B","","Say ""Hi""","200"\n');
});

test('devices.list pairs a volume with its own iPod by GUID, not by order', async () => {
  const item = (pid, serial) => ({ _name: 'iPod', USBDeviceKeyVendorID: '0x05ac', USBDeviceKeyProductID: pid, USBDeviceKeySerialNumber: serial });
  const profile = JSON.stringify({ SPUSBHostDataType: [{ _items: [item('0x1261', '1111111111111111'), item('0x1263', '2222222222222222')] }] });
  // Only the nano is mounted; the classic is ejected but still on USB.
  const vol = { mount: '/Volumes/iPod', hasDb: true, free: 1, total: 2, flags: [], guid: '2222222222222222' };
  const list = await devices.list({ profile, mounts: [vol] });
  const classic = list.find((d) => d.usbId === '0x1261'); const nano = list.find((d) => d.usbId === '0x1263');
  assert.strictEqual(classic.volume, null);
  assert.strictEqual(classic.status, 'unmounted'); // ejected, not a fault
  assert.strictEqual(nano.volume.mount, '/Volumes/iPod');
  assert.strictEqual(nano.status, 'ready');
});

test('inspectVolume reads the FireWire GUID from SysInfo', () => {
  const v = tmp(); fs.mkdirSync(path.join(v, 'iPod_Control', 'Device'), { recursive: true });
  fs.writeFileSync(path.join(v, 'iPod_Control', 'Device', 'SysInfo'), 'FirewireGuid: 0x2222222222222222\n');
  assert.strictEqual(devices.inspectVolume(v).guid, '2222222222222222');
});

test('guard: no real device serials, Apple IDs or team ids in tracked files (the repo is public)', () => {
  const { execFileSync } = require('child_process');
  const root = path.join(__dirname, '..');
  let files; try { files = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean); } catch { return; }
  // Apple FireWire GUIDs start with the 000A27 vendor prefix; also the signing team and Apple ID.
  const bad = new RegExp(['000A' + '27[0-9A-F]{10}', 'N3TQLP' + '6JGY', 'wildpack' + 'app', 'YM' + '8[0-9A-Z]{9}'].join('|'), 'i'); // built from parts so this file does not match itself
  const hits = files.filter((f) => !/\.(png|icns|ico|webp|jpg)$/i.test(f) && f !== 'package-lock.json' && !f.startsWith('resources/'))
    .filter((f) => { try { return bad.test(fs.readFileSync(path.join(root, f), 'utf8')); } catch { return false; } });
  assert.deepStrictEqual(hits, []);
});

test('dedupe: a remaster or a different file name still counts as the same song', async () => {
  const dedupe = require('../src/dedupe');
  assert.strictEqual(dedupe.keyOf('Imagine - Remastered 2010', 'John Lennon'), dedupe.keyOf('Imagine', 'John Lennon'));
  assert.strictEqual(dedupe.keyOf("I'm On Fire", 'Bruce Springsteen'), dedupe.keyOf('Im On Fire (Live)', 'Bruce Springsteen, X'));
  const d = tmp(); fs.mkdirSync(path.join(d, 'a'));
  fs.writeFileSync(path.join(d, 'a', 'Candy - Paolo Nutini.mp3'), 'x'); fs.writeFileSync(path.join(d, 'a', '01 - Wild Thing - The Troggs.flac'), 'y');
  const ix = await dedupe.buildIndex([d], { tags: false });
  assert.ok(ix.find('Candy', 'Paolo Nutini'));
  assert.ok(ix.find('Wild Thing', 'The Troggs', true));   // lossless asked for, lossless exists
  assert.strictEqual(ix.find('Candy', 'Paolo Nutini', true), null); // only an mp3 exists, so a FLAC request is not satisfied
  assert.strictEqual(ix.find('Nothing Here', 'Nobody'), null);
});

test('library.fileGroup: iPod folder gets MP3, library gets a clone or the FLAC, iPod gets a converted MP3', () => {
  const library = require('../src/library');
  const stage = tmp(); const ipod = tmp(); const lib = tmp();
  fs.writeFileSync(path.join(stage, 'A - One.mp3'), 'mp3data'); fs.writeFileSync(path.join(stage, 'B - Two.flac'), 'flacdata');
  const convert = (src, out) => fs.writeFileSync(out, 'converted:' + fs.readFileSync(src, 'utf8'));
  const r = library.fileGroup({ staging: stage, name: 'List', ipodDir: ipod, libraryDir: lib, saveToLibrary: true, convert });
  assert.strictEqual(fs.readFileSync(path.join(ipod, 'List', 'A - One.mp3'), 'utf8'), 'mp3data');
  assert.strictEqual(fs.readFileSync(path.join(lib, 'List', 'A - One.mp3'), 'utf8'), 'mp3data');   // same song in both: cloned
  assert.strictEqual(fs.readFileSync(path.join(lib, 'List', 'B - Two.flac'), 'utf8'), 'flacdata');  // library keeps the FLAC
  assert.strictEqual(fs.readFileSync(path.join(ipod, 'List', 'B - Two.mp3'), 'utf8'), 'converted:flacdata'); // iPod gets MP3
  assert.ok(!fs.existsSync(path.join(ipod, 'List', 'B - Two.flac')));
  assert.strictEqual(r.cloned + r.copied, 1); assert.strictEqual(r.converted, 1);
  // not saving to the library: only the iPod folder, and the FLAC is converted and dropped
  const stage2 = tmp(); const ipod2 = tmp(); fs.writeFileSync(path.join(stage2, 'C - Three.flac'), 'f');
  library.fileGroup({ staging: stage2, name: 'X', ipodDir: ipod2, libraryDir: lib, saveToLibrary: false, convert });
  assert.deepStrictEqual(fs.readdirSync(path.join(ipod2, 'X')), ['C - Three.mp3']); assert.ok(!fs.existsSync(path.join(lib, 'X')));
});

test('runPlaylist: songs already on the Mac are reused, not downloaded again; formats split mp3/flac', async () => {
  const plan = require('../src/plan'); const dedupe = require('../src/dedupe'); const { EventEmitter } = require('events');
  const ipod = tmp(); const lib = tmp(); const asked = [];
  // a song we already have, in another playlist's folder
  fs.mkdirSync(path.join(lib, 'Old')); fs.writeFileSync(path.join(lib, 'Old', 'Have It - Band.mp3'), 'existing');
  const index = await dedupe.buildIndex([lib], { tags: false });
  const download = ({ input, outDir, format }) => {
    const ev = new EventEmitter(); const rows = fs.readFileSync(input, 'utf8').trim().split('\n').slice(1); asked.push({ format, rows: rows.length });
    const folder = path.join(outDir, path.basename(input, '.csv')); fs.mkdirSync(folder, { recursive: true });
    for (const r of rows) { const [, , title] = r.split('","'); fs.writeFileSync(path.join(folder, `${title.replace(/"/g, '')} - Band.${format.startsWith('flac') ? 'flac' : 'mp3'}`), 'new'); }
    ev.done = Promise.resolve({ code: 0, ok: true, total: rows.length, done: rows.length, failed: 0, folder, tracks: [] });
    return ev;
  };
  const items = [{ title: 'Have It', artist: 'Band', seconds: 1, format: 'mp3' }, { title: 'New One', artist: 'Band', seconds: 1, format: 'mp3' }, { title: 'Lossless', artist: 'Band', seconds: 1, format: 'flac' }];
  const convert = (src, out) => fs.writeFileSync(out, 'converted');
  const r = await plan.runPlaylist({ name: 'Mine', items, saveToLibrary: true, libraryDir: lib, ipodDir: ipod, index, download, convert }).done;
  assert.deepStrictEqual(asked, [{ format: 'mp3', rows: 1 }, { format: 'flac,mp3', rows: 1 }]); // "Have It" was NOT requested
  assert.strictEqual(r.reused, 1); assert.strictEqual(r.done, 2);
  assert.deepStrictEqual(fs.readdirSync(path.join(ipod, 'Mine')).filter((f) => !f.startsWith('.')).sort(), ['Have It - Band.mp3', 'Lossless - Band.mp3', 'New One - Band.mp3']);
  assert.deepStrictEqual(fs.readdirSync(path.join(lib, 'Mine')).sort(), ['Have It - Band.mp3', 'Lossless - Band.flac', 'New One - Band.mp3']);
  // a second playlist wanting the same songs downloads nothing
  asked.length = 0;
  const r2 = await plan.runPlaylist({ name: 'Again', items: items.slice(0, 2), saveToLibrary: true, libraryDir: lib, ipodDir: ipod, index, download, convert }).done;
  assert.deepStrictEqual(asked, []); assert.strictEqual(r2.reused, 2);
  // FLAC without a library to keep it in is refused
  await assert.rejects(plan.runPlaylist({ name: 'N', items: [items[2]], saveToLibrary: false, libraryDir: lib, ipodDir: ipod, download, convert }).done, /FLAC is kept in your Music folder/);
});

test('files are named from Spotify data, and the iPod gets proper title and artist even when the file has none', () => {
  const library = require('../src/library');
  const stage = tmp(); const ipod = tmp(); const lib = tmp();
  fs.writeFileSync(path.join(stage, '_index.csv'),
    'filepath,artist,album,title,length,tracktype,state,failurereason\n' +
    './04 - junk name.mp3,"Maribou State, Holly Walker",,"Spooky - Recorded at RAK Studios, London",222,0,1,0\n' +
    ',Nobody,,Not Found Song,100,0,2,3\n');
  const meta = library.readIndex(stage);
  assert.deepStrictEqual(Object.keys(meta), ['04 - junk name.mp3']);
  assert.strictEqual(meta['04 - junk name.mp3'].title, 'Spooky - Recorded at RAK Studios, London');
  fs.writeFileSync(path.join(stage, '04 - junk name.mp3'), 'audio');
  library.fileGroup({ staging: stage, name: 'P', ipodDir: ipod, libraryDir: lib, saveToLibrary: true, meta });
  const want = 'Spooky - Recorded at RAK Studios, London - Maribou State, Holly Walker.mp3';
  assert.ok(fs.existsSync(path.join(ipod, 'P', want)) && fs.existsSync(path.join(lib, 'P', want)));
  const side = JSON.parse(fs.readFileSync(path.join(ipod, 'P', '.tags.json'), 'utf8'));
  assert.deepStrictEqual(side[path.basename(want, '.mp3')], { title: 'Spooky - Recorded at RAK Studios, London', artist: 'Maribou State, Holly Walker', album: '', genre: '', year: 0, track: 0 });
});

test('ipod.reconnect: returns an already mounted iPod untouched, and refuses one that is not on USB', async () => {
  const ipod = require('../src/ipod');
  const mounted = { model: 'iPod classic', serial: 'ABC123', volume: { mount: '/Volumes/iPod' } };
  assert.strictEqual(await ipod.reconnect('abc123', { list: async () => [mounted] }), mounted);   // no USB reset when it is already mounted
  await assert.rejects(ipod.reconnect('ZZZ', { list: async () => [mounted] }), /not on USB/);
  await assert.rejects(ipod.eject('/etc'), /Not an iPod volume/);                                   // never ejects anything outside /Volumes
});

test('ipod.withMounted: mounts an ejected iPod, runs, then ejects, even when the work fails', async () => {
  const ipod = require('../src/ipod'); const calls = [];
  let mounted = false;
  const dev = () => ({ model: 'iPod classic', serial: 'S1', volume: mounted ? { mount: '/Volumes/iPod' } : null });
  const opts = { list: async () => [dev()], reconnectFn: async () => { calls.push('mount'); mounted = true; return dev(); }, ejectFn: async (m) => { calls.push('eject ' + m); mounted = false; } };
  assert.strictEqual(await ipod.withMounted('s1', async (d) => { calls.push('work ' + d.volume.mount); return 42; }, opts), 42);
  assert.deepStrictEqual(calls, ['mount', 'work /Volumes/iPod', 'eject /Volumes/iPod']);
  calls.length = 0;
  await assert.rejects(ipod.withMounted('S1', async () => { throw new Error('boom'); }, opts), /boom/);
  assert.deepStrictEqual(calls, ['mount', 'eject /Volumes/iPod']);                    // still ejected after a failure
  calls.length = 0;
  await ipod.withMounted('S1', async () => 1, { ...opts, autoEject: false });
  assert.deepStrictEqual(calls, ['mount']);                                            // setting off: stays mounted
});

test('ipod.resolveDevice: one iPod is picked automatically, two need a choice', () => {
  const ipod = require('../src/ipod');
  const c = { model: 'iPod classic', serial: 'A1', status: 'unmounted' }; const n = { model: 'iPod nano 4G', serial: 'B2', status: 'ready' };
  assert.strictEqual(ipod.resolveDevice([c], ''), c);
  assert.throws(() => ipod.resolveDevice([c, n], ''), /More than one iPod/);
  assert.strictEqual(ipod.resolveDevice([c, n], 'nano'), n); assert.strictEqual(ipod.resolveDevice([c, n], 'a1'), c);
  assert.throws(() => ipod.resolveDevice([], ''), /No iPod is plugged in/);
});

test('known: remembers free space of a mounted iPod', () => {
  process.env.SLDL_HOME = tmp(); const known = require('../src/known');
  known.remember([{ serial: 'S1', model: 'iPod nano 4G', volume: { free: 5e9, total: 16e9 } }, { serial: 'S2', model: 'x', volume: null }]);
  const k = known.lastKnown(); assert.strictEqual(k.S1.free, 5e9); assert.strictEqual(k.S2, undefined);
  delete process.env.SLDL_HOME;
});

test('dedupe + plan: a song the iPod already has is not downloaded, only linked at upload', async () => {
  const dedupe = require('../src/dedupe'); const plan = require('../src/plan'); const { EventEmitter } = require('events');
  const ipod = tmp(); const lib = tmp(); const asked = [];
  const catalog = { tracks: [{ title: 'Start Me Up', artist: 'The Rolling Stones' }, { title: 'Only On Ipod', artist: 'Band' }] };
  const index = await dedupe.buildIndex([], { catalog });
  assert.ok(index.onIpod('Start Me Up - Remastered 2009', 'The Rolling Stones'));    // a remaster label does not matter
  assert.ok(!index.onIpod('Something Else', 'Band'));
  const download = ({ input, outDir }) => {
    const ev = new EventEmitter(); const rows = fs.readFileSync(input, 'utf8').trim().split('\n').slice(1); asked.push(rows.length);
    const folder = path.join(outDir, path.basename(input, '.csv')); fs.mkdirSync(folder, { recursive: true });
    for (const r of rows) fs.writeFileSync(path.join(folder, r.split('","')[2].replace(/"/g, '') + '.mp3'), 'x');
    ev.done = Promise.resolve({ code: 0, ok: true, total: rows.length, done: rows.length, failed: 0, folder, tracks: [] }); return ev;
  };
  const items = [{ title: 'Start Me Up - Remastered 2009', artist: 'The Rolling Stones', seconds: 1, format: 'mp3' }, { title: 'Brand New', artist: 'Band', seconds: 1, format: 'mp3' }];
  const r = await plan.runPlaylist({ name: 'New List', items, saveToLibrary: false, libraryDir: lib, ipodDir: ipod, index, download }).done;
  assert.deepStrictEqual(asked, [1]);                                                  // only "Brand New" was requested
  assert.strictEqual(r.onIpod, 1);
  const links = JSON.parse(fs.readFileSync(path.join(ipod, 'New List', '.links.json'), 'utf8'));
  assert.deepStrictEqual(links, [{ title: 'Start Me Up - Remastered 2009', artist: 'The Rolling Stones' }]);
  assert.deepStrictEqual(fs.readdirSync(path.join(ipod, 'New List')).filter((f) => f.endsWith('.mp3')), ['Brand New.mp3']);
  // a playlist made only of songs the iPod has still gets a folder (with the links) so the upload can link them
  const r2 = await plan.runPlaylist({ name: 'All Have', items: [items[0]], saveToLibrary: false, libraryDir: lib, ipodDir: ipod, index, download }).done;
  assert.strictEqual(r2.onIpod, 1); assert.ok(fs.existsSync(path.join(ipod, 'All Have', '.links.json'))); assert.strictEqual(r2.tracks.length, 0);
  // FLAC wanted for the library is NOT skipped just because the iPod has an MP3
  asked.length = 0;
  fs.mkdirSync(path.join(lib, 'x'), { recursive: true });
  await assert.rejects(plan.runPlaylist({ name: 'F', items: [{ ...items[0], format: 'flac' }], saveToLibrary: false, libraryDir: lib, ipodDir: ipod, index, download }).done, /FLAC is kept/);
});

test('withMounted refreshes the iPod song list before ejecting', async () => {
  const ipod = require('../src/ipod'); const known = require('../src/known'); process.env.SLDL_HOME = tmp(); const order = [];
  let mounted = false; const dev = () => ({ model: 'iPod nano 4G', serial: 'S9', volume: mounted ? { mount: '/Volumes/iPod 1' } : null });
  await ipod.withMounted('S9', async () => order.push('work'), { list: async () => [dev()], reconnectFn: async () => { mounted = true; return dev(); },
    catalogFn: async () => { order.push('catalog'); return { tracks: [{ title: 'A', artist: 'B' }] }; }, ejectFn: async () => order.push('eject') });
  assert.deepStrictEqual(order, ['work', 'catalog', 'eject']);
  assert.strictEqual(known.loadCatalog('S9').tracks.length, 1); delete process.env.SLDL_HOME;
});

test('prefs: the icon choice is saved and only original or alt are accepted', () => {
  process.env.SLDL_HOME = tmp(); const prefs = require('../src/prefs');
  assert.strictEqual(prefs.read().icon, 'original');
  assert.strictEqual(prefs.write({ icon: 'alt' }).icon, 'alt'); assert.strictEqual(prefs.read().icon, 'alt');
  assert.strictEqual(prefs.write({ icon: 'rainbow' }).icon, 'original');           // anything else falls back
  delete process.env.SLDL_HOME;
});

test('folders: iPod folder from sldl.conf or a friendly default, Music folder from prefs or its default', () => {
  const old = { conf: process.env.SLDL_CONF, home: process.env.SLDL_HOME };
  const d = tmp(); process.env.SLDL_HOME = d; process.env.SLDL_CONF = path.join(d, 'sldl.conf');
  delete require.cache[require.resolve('../src/folders')];
  const folders = require('../src/folders'); const prefs = require('../src/prefs');
  assert.strictEqual(folders.ipodDir(), folders.DEFAULT_IPOD);                          // nothing set: the default
  assert.match(folders.DEFAULT_IPOD, /myPod[\\/]For iPod$/);
  assert.strictEqual(folders.libraryDir(), prefs.DEFAULT_LIBRARY); assert.match(prefs.DEFAULT_LIBRARY, /myPod[\\/]Music \(best quality\)$/);
  fs.writeFileSync(process.env.SLDL_CONF, 'path = /somewhere/ipod\n'); prefs.write({ libraryDir: '/somewhere/music' });
  assert.strictEqual(folders.ipodDir(), '/somewhere/ipod'); assert.strictEqual(folders.libraryDir(), '/somewhere/music');   // chosen folders win
  if (old.conf === undefined) delete process.env.SLDL_CONF; else process.env.SLDL_CONF = old.conf;
  if (old.home === undefined) delete process.env.SLDL_HOME; else process.env.SLDL_HOME = old.home;
});

test('macOS converter: a lossless file becomes a 256 kbps, 44.1 kHz AAC .m4a for the iPod', { skip: process.platform !== 'darwin' }, () => {
  const { execFileSync } = require('child_process'); const library = require('../src/library');
  const conv = library.macConverter(); assert.ok(conv); assert.strictEqual(conv.ext, '.m4a');
  const d = tmp(); const wav = path.join(d, 'in.wav'); const n = 44100 * 2; const buf = Buffer.alloc(44 + n * 4);   // 2 s of 96 kHz stereo silence
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 4, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(96000, 24); buf.writeUInt32LE(96000 * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 4, 40);
  fs.writeFileSync(wav, buf); const out = path.join(d, 'out.m4a'); conv(wav, out);
  assert.ok(fs.statSync(out).size > 1000);
  const info = execFileSync('/usr/bin/afinfo', [out], { encoding: 'utf8' });
  assert.match(info, /aac/i); assert.match(info, /44100/);                           // AAC, and never above what iPods play
});

test('fileGroup with an AAC converter: the iPod gets Title - Artist.m4a and its details, the library keeps the FLAC', () => {
  const library = require('../src/library'); const stage = tmp(); const ipod = tmp(); const lib = tmp();
  fs.writeFileSync(path.join(stage, 'junk name.flac'), 'flacdata');
  const convert = (src, out) => fs.writeFileSync(out, 'aac:' + fs.readFileSync(src, 'utf8')); convert.ext = '.m4a';
  const meta = { 'junk name.flac': { title: 'Don\'t Let Go', artist: 'SuperShy', album: 'Single', genre: 'Dance', year: 2022, track: 1 } };
  const r = library.fileGroup({ staging: stage, name: 'P', ipodDir: ipod, libraryDir: lib, saveToLibrary: true, convert, meta });
  assert.deepStrictEqual(fs.readdirSync(path.join(ipod, 'P')).filter((f) => !f.startsWith('.')), ["Don't Let Go - SuperShy.m4a"]);
  assert.strictEqual(fs.readFileSync(path.join(lib, 'P', "Don't Let Go - SuperShy.flac"), 'utf8'), 'flacdata');
  assert.strictEqual(r.converted, 1);
  const side = JSON.parse(fs.readFileSync(path.join(ipod, 'P', '.tags.json'), 'utf8'));
  assert.deepStrictEqual(side["Don't Let Go - SuperShy"], { title: "Don't Let Go", artist: 'SuperShy', album: 'Single', genre: 'Dance', year: 2022, track: 1 });
  // a converter that fails keeps the library original and reports, instead of losing the song
  const stage2 = tmp(); fs.writeFileSync(path.join(stage2, 'x.flac'), 'f');
  const bad = () => { throw new Error('boom'); }; bad.ext = '.m4a';
  const r2 = library.fileGroup({ staging: stage2, name: 'Q', ipodDir: ipod, libraryDir: lib, saveToLibrary: true, convert: bad });
  assert.ok(fs.existsSync(path.join(lib, 'Q', 'x.flac'))); assert.match(r2.notes[0], /could not make an iPod copy/);
});
