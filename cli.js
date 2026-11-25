#!/usr/bin/env node
'use strict';
// Command line for SLDL Downloader. Same code as the app: src/.
const path = require('path');
const conf = require('./src/conf');
const sldl = require('./src/sldl');
const devices = require('./src/devices');
const sync = require('./src/sync');
const ipod = require('./src/ipod');

const HELP = `sldl-dl: download Spotify playlists from Soulseek and put them on a player

Usage
  sldl-dl download <spotify-url|search> [--out DIR] [--format flac|mp3|m4a] [--name NAME]
                                         [--ipod] [--music] [--to DEST] [--layout rockbox|flat]
  sldl-dl devices                 list connected iPods and their state
  sldl-dl send <folder> [--ipod | --music | --to DEST] [--name NAME] [--layout rockbox|flat]
  sldl-dl config [get|set KEY VALUE]   keys: user, pass, path, pref-format, name-format
  sldl-dl ipod-setup              one-off: install the helper that writes to a stock iPod
  sldl-dl doctor                  check sldl, login, folder and device
  sldl-dl help

Flags
  --json     machine-readable output (one JSON object per line)
  --ipod     write the playlist into a connected stock iPod's library (writes to the iPod)
  --music    add the playlist to Music.app after downloading
  --to DEST  copy the playlist to a mounted player or folder
`;

function parseArgs(argv) {
  const flags = {}; const pos = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      if (['json', 'music', 'force', 'ipod'].includes(k)) flags[k] = true;
      else flags[k] = argv[++i];
    } else pos.push(a);
  }
  return { flags, pos };
}

function makeOut(json) {
  return {
    info: (msg, obj) => (json ? console.log(JSON.stringify({ type: 'info', msg, ...obj })) : console.log(msg)),
    data: (obj) => console.log(JSON.stringify(obj, null, json ? 0 : 2)),
    err: (msg) => (json ? console.log(JSON.stringify({ type: 'error', msg })) : console.error(`error: ${msg}`)),
  };
}

async function deliver(out, flags, folder, tracks, name) {
  if (flags.ipod) {
    const d = (await devices.list()).find((x) => x.volume && x.status !== 'recovery');
    if (!d) throw new Error('No mounted iPod found. Plug it in and wait for it to mount.');
    out.info(`Writing ${tracks.length} tracks to ${d.model} (${d.volume.mount})...`);
    const r = await ipod.addToIpod({
      mount: d.volume.mount, guid: ipod.guidOf(d.serial), playlist: name, files: tracks,
      onEvent: (e) => { if (e.type === 'track') out.info(`[${e.n}/${e.of}] ${e.status}: ${e.file}${e.msg ? ' (' + e.msg + ')' : ''}`, e); },
    });
    out.info(`iPod now has ${r.total} tracks (${r.added} added, ${r.skipped} already there). Eject it before unplugging.`, { type: 'ipod', ...r });
  }
  if (flags.music) {
    out.info('Adding to Music.app...');
    const r = await sync.addToMusic(name, tracks);
    out.info(`Added ${r.added} of ${r.of} tracks to the Music playlist "${name}".`, { type: 'music', ...r });
    const src = await devices.musicSources();
    if (src.ok && !src.sources.some((s) => /ipod/i.test(s))) {
      out.info('Note: Music does not list an iPod, so there is nothing for it to sync to.');
    }
  }
  if (flags.to) {
    const refuse = sync.refuseStockIpod(flags.to);
    if (refuse && !flags.force) throw new Error(refuse + ' (--force to copy anyway)');
    const r = await sync.copyToPlayer({
      folder, dest: flags.to, playlist: name, layout: flags.layout || 'rockbox',
      onProgress: (p) => { if (!flags.json) process.stdout.write(`\rCopying ${p.done}/${p.total}`); },
    });
    if (!flags.json) process.stdout.write('\n');
    out.info(`Copied ${r.copied} files to ${r.musicDir}`, { type: 'copy', ...r });
  }
}

async function main() {
  const [cmd = 'help', ...rest] = process.argv.slice(2);
  const { flags, pos } = parseArgs(rest);
  const out = makeOut(flags.json);

  if (cmd === 'help' || cmd === '--help' || cmd === '-h') return console.log(HELP);

  if (cmd === 'download') {
    const ev = sldl.download({ input: pos[0], outDir: flags.out, format: flags.format, name: flags.name });
    ev.on('line', (l) => { if (!flags.json && process.env.SLDL_VERBOSE) console.log(l); });
    ev.on('total', (e) => out.info(`Found ${e.total} tracks`, { type: 'total', total: e.total }));
    ev.on('done', (e, c) => out.info(`[${c.done}/${c.total}] ${e.track}`, { type: 'track', track: e.track, ...c }));
    ev.on('failed', (e) => out.info(`Failed: ${e.track}`, { type: 'failed', track: e.track }));
    const r = await ev.done;
    if (!r.ok) throw new Error(`sldl exited with code ${r.code}`);
    out.info(`Done: ${r.done} downloaded, ${r.failed} not found. Folder: ${r.folder || '(none)'}`, { type: 'finished', ...r });
    if (r.folder) await deliver(out, flags, r.folder, r.tracks, flags.name || path.basename(r.folder));
    return;
  }

  if (cmd === 'send') {
    const folder = pos[0];
    if (!folder) throw new Error('Give the playlist folder.');
    const tracks = sldl.listTracks(folder);
    return deliver(out, flags, folder, tracks, flags.name || path.basename(path.resolve(folder)));
  }

  if (cmd === 'devices') {
    const list = await devices.list();
    if (flags.json) return out.data(list);
    if (!list.length) return console.log('No iPod found. Plug it in and try again.');
    for (const d of list) {
      console.log(`${d.model}  [${d.status}]  usb ${d.usbId}  serial ${d.serial || '?'}`);
      if (d.volume) console.log(`  volume ${d.volume.mount}  ${(d.volume.free / 1e9).toFixed(1)} GB free of ${(d.volume.total / 1e9).toFixed(1)}`);
      for (const f of (d.volume && d.volume.flags) || []) console.log(`  ! ${f}`);
      for (const n of d.notes) console.log(`  ${n}`);
    }
    return;
  }

  if (cmd === 'config') {
    const [sub = 'get', key, ...val] = pos;
    if (sub === 'get') return out.data(conf.redact(conf.read()));
    if (sub === 'set') {
      if (!conf.KEYS.includes(key)) throw new Error(`Unknown key. Use one of: ${conf.KEYS.join(', ')}`);
      conf.write({ [key]: val.join(' ') });
      return console.log(`Saved ${key}.`);
    }
    throw new Error('Use: config get | config set KEY VALUE');
  }

  if (cmd === 'ipod-setup') {
    console.log('Installing the iPod helper (pygpod) into ' + ipod.VENV + ' ...');
    await ipod.setup(); return console.log('Done.');
  }

  if (cmd === 'doctor') {
    const c = conf.read(); const bin = sldl.findBinary();
    const checks = [
      ['sldl binary', bin],
      ['Soulseek user', c.user ? 'set' : 'missing (config set user NAME)'],
      ['Soulseek password', c.pass ? 'set' : 'missing (config set pass ...)'],
      ['Download folder', c.path || 'missing (config set path DIR)'],
    ];
    for (const [k, v] of checks) console.log(`${k.padEnd(20)} ${v}`);
    const list = await devices.list();
    console.log(`${'iPod'.padEnd(20)} ${list.length ? list.map((d) => `${d.model} (${d.status})`).join(', ') : 'not connected'}`);
    console.log(`${'iPod helper'.padEnd(20)} ${ipod.ready() ? 'installed' : 'missing (sldl-dl ipod-setup)'}`);
    const src = await devices.musicSources();
    console.log(`${'Music.app sees'.padEnd(20)} ${src.ok ? src.sources.join(', ') : src.error}`);
    return;
  }

  console.error(`Unknown command "${cmd}".\n\n${HELP}`); process.exitCode = 2;
}

main().catch((e) => { makeOut(process.argv.includes('--json')).err(e.message); process.exitCode = 1; });
