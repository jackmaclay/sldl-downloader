# SLDL Downloader

Mac app and CLI. Paste a Spotify playlist URL, sldl downloads it from Soulseek, the files go into a playlist folder, and you can send them to a player.

## App

```bash
npm install
npm start
```

Pages: Download (URL, progress, track list, send), Player (connected iPods and their state), Settings (Soulseek login, folder, format).

## CLI

```bash
node cli.js download <spotify-url> [--out DIR] [--format mp3|flac] [--name NAME] [--no-library] [--only DIR] [--music] [--to DEST] [--layout rockbox|flat]
node cli.js send <folder> [--music | --to DEST] [--name NAME]
node cli.js devices
node cli.js config get | set KEY VALUE
node cli.js doctor
```

`--json` prints one JSON object per line. `npm link` installs it as `sldl-dl`.

## Settings

Stored in sldl's own file, `~/.config/sldl/sldl.conf` (override with `SLDL_CONF`). Keys: `user`, `pass`, `path`, `pref-format`, `name-format`. The password is plain text in that file, which is how sldl works. The app and CLI never print it.

`resources/sldl` is the sldl binary (v2.5, arm64). `SLDL_BIN` overrides it.

## Sending to a player

- Profile links: paste `open.spotify.com/user/...` to take every public playlist. Sizes are estimated from track lengths (mp3 320 kbit/s, m4a 256, flac 900) against the space on the connected iPod, or 14.5 GB if none is connected. If it all fits, everything is selected. If not, the app shows a picker that will not let the selection go over the limit; the CLI downloads nothing and asks for `--playlists 1,3`. Profile lookup renders the page in a hidden Electron window, since Spotify has no login-free list endpoint.
- iPods stay unmounted: sending to an iPod mounts it (a USB reset, no unplugging), writes everything in one go, and ejects it again, so it is exposed to an accidental unplug for as short a time as possible (Settings, Eject iPod after sending, on by default). With two iPods plugged in the Send card asks which; the CLI takes `--device classic|nano`. The last free space of each iPod is remembered for the size check while it is ejected. The iPod must be plugged in; the app cannot mount one that is unplugged.
- Eject and reconnect: `sldl-dl eject [classic|nano]` ejects an iPod; `sldl-dl reconnect [classic|nano]` mounts an ejected one again without unplugging it (the Player page has Eject and Reconnect buttons). Reconnect sends a USB reset (`tools/ipod_reconnect.py`, pyusb), the same as replugging; it only runs on an iPod with nothing mounted. Needs `sldl-dl ipod-setup` once.
- Planner: a playlist or profile link opens a list of playlists. Set a format for all (MP3 or FLAC), then per playlist and per song. "Also save to my Music folder" keeps a copy in the Mac library. Songs already in the iPod folder, the library or an earlier selected playlist are not downloaded again; they show as "already have it" and the existing file is cloned.
- Naming: each downloaded file is renamed `Title - Artist.ext` from Spotify's data (sldl's `_index.csv` says which song each file is), and a `.tags.json` beside the iPod folder's files gives the iPod the proper title and artist, so a file with no or odd tags never shows up as `-` or a file name.
- Where files go: `New Downloads/<playlist>` is the iPod folder (always MP3). `~/Music/Playlists/<playlist>` is the Mac library, in the chosen format. The same file in both is an APFS clone (no second copy on disk). FLAC goes only to the library and the iPod folder gets a converted MP3 (needs ffmpeg). `--only DIR` keeps a playlist in one folder and nowhere else (Lily's: `--only ~/Music/Lily`). `--no-library` skips the library copy.
- The Allow FLAC switch in Settings now only affects the Settings page format and the CLI's search downloads; the Download page offers FLAC directly. Settings are in `~/.config/sldl/app.json`, not `sldl.conf`.
- iPod: `sldl-dl send <folder> --ipod` (or Send, Write to a connected iPod) adds the tracks and a playlist to a stock iPod's library. First use needs `sldl-dl ipod-setup` (pygpod, once, needs internet). ffmpeg converts FLAC.
- Copy: files to `<dest>/Music/<playlist>/` and `<dest>/Playlists/<playlist>.m3u8`. For Rockbox and other mass-storage players. Refuses a stock iPod volume, which ignores files not in its iTunesDB.
- Music: adds the files to a Music app playlist. Music must list the iPod as a device to sync it; on this Mac it does not.

Stock iPod support is described in `IPOD_GUIDE.md`.

## Layout

`main.js`, `preload.js`, `index.html`, `app.css`, `renderer.js`: app. `cli.js`: CLI. `src/`: shared code (`conf`, `sldl`, `devices`, `sync`).

## Tests

```bash
npm test
npx electron test/shot.js <dir>   # screenshots of each page
```
