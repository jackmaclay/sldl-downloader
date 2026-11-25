'use strict';
// Two ways to get a downloaded playlist onto a player.
//   music: add to Music.app and make a playlist (the iPod then syncs from Music, if Music can see it).
//   copy:  copy the files and an .m3u8 to a mounted player or any folder (Rockbox and other mass-storage players).
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const { AUDIO } = require('./sldl');

// Paths go in as argv, never into the script text, so quotes in a title cannot break it.
const MUSIC_SCRIPT = `on run argv
  set pl to item 1 of argv
  tell application "Music"
    if not (exists user playlist pl) then make new user playlist with properties {name:pl}
    set n to 0
    repeat with i from 2 to count of argv
      try
        add (POSIX file (item i of argv) as alias) to user playlist pl
        set n to n + 1
      end try
    end repeat
    return n
  end tell
end run`;

function addToMusic(playlist, files) {
  return new Promise((resolve, reject) => {
    if (!files.length) return reject(new Error('No tracks to add.'));
    execFile('/usr/bin/osascript', ['-e', MUSIC_SCRIPT, '--', playlist, ...files], { timeout: 10 * 60 * 1000 }, (err, out, errOut) => {
      if (err) return reject(new Error(errOut.trim() || err.message));
      resolve({ added: parseInt(out, 10) || 0, of: files.length });
    });
  });
}

const safe = (s) => String(s).replace(/[\\/:*?"<>|]/g, '_').trim() || 'Playlist';

// onProgress({ done, total, file }) per file.
async function copyToPlayer({ folder, dest, playlist, layout = 'rockbox', onProgress = () => {} }) {
  const files = fs.readdirSync(folder).filter((f) => AUDIO.test(f)).sort();
  if (!files.length) throw new Error(`No audio files in ${folder}`);
  if (!fs.existsSync(dest)) throw new Error(`Destination not found: ${dest}`);
  const name = safe(playlist || path.basename(folder));
  const musicDir = layout === 'flat' ? dest : path.join(dest, 'Music', name);
  fs.mkdirSync(musicDir, { recursive: true });
  let done = 0;
  for (const f of files) {
    await fs.promises.copyFile(path.join(folder, f), path.join(musicDir, f));
    onProgress({ done: ++done, total: files.length, file: f });
  }
  const plDir = layout === 'flat' ? dest : path.join(dest, 'Playlists');
  fs.mkdirSync(plDir, { recursive: true });
  const rel = (f) => (layout === 'flat' ? f : `/Music/${name}/${f}`);
  const m3u = '#EXTM3U\n' + files.map((f) => `#EXTINF:-1,${path.parse(f).name}\n${rel(f)}`).join('\n') + '\n';
  fs.writeFileSync(path.join(plDir, `${name}.m3u8`), m3u);
  return { copied: done, musicDir, playlistFile: path.join(plDir, `${name}.m3u8`) };
}

// A stock iPod ignores files that are not in its iTunesDB, so copying to one would silently do nothing.
function refuseStockIpod(dest) {
  if (fs.existsSync(path.join(dest, 'iPod_Control')) && !fs.existsSync(path.join(dest, '.rockbox'))) {
    return 'That volume is a stock iPod. Files copied into it will not appear without a library database. Use the Music route, or install Rockbox first.';
  }
  return null;
}

module.exports = { addToMusic, copyToPlayer, refuseStockIpod, MUSIC_SCRIPT };
