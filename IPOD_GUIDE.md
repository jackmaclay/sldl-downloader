# iPod notes

Findings from 2026-11-06 on one iPod nano 4G (16 GB, USB id 0x1263, serial <usb-serial>).

## State
- Appeared as a plain HFS+ disk with `iPod_Control/Device/SysInfo` empty and no iTunesDB. Restores from Music did not fix it.
- At 03:41 something created `iTunesDB`, `iTunesControl`, `Music/F00-F49`, `Extras.itdb`. The Mac still mounts it as a disk and Music lists no iPod. `SysInfo` is still empty.

## Routes
1. Music app sync: Music has to list the iPod. It does not here.
2. Write the iTunesDB directly with pygpod (pure Python, LGPL). Works: tested 2026-11-25 on the nano 4G, a test track shows in Music and plays (sound not checked). Needs `FirewireGuid: 0x<usb serial>` in `SysInfo` first. The header scheme byte is 1 (hash58), so the database must be signed with hash58. pygpod's `save()` only refreshes hash72, and the iPod then shows an empty library. `tools/ipod_add.py` re-signs with `compute_hash58` after saving; that function reproduces iTunes' own signature byte for byte on the original database. FLAC and other unsupported formats are converted by pygpod with ffmpeg.
3. Custom firmware: wInd3x runs code on nano 3G/4G/5G through the bootrom, but only from Linux, only until reboot, and nothing is flashed. Rockbox's nano 4G port is listed as partial. Neither gives a persistent replacement OS.

## Removed
The 2026-02 AppleScript flow (`ef60796`) built `osascript -e '...'` strings with file names inside, called an undefined `event`, and assumed Music exposes iPods as sources.
