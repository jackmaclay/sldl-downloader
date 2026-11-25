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
node cli.js download <spotify-url> [--out DIR] [--format mp3|m4a|flac] [--name NAME] [--music] [--to DEST] [--layout rockbox|flat]
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
