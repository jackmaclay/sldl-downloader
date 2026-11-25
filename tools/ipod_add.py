#!/usr/bin/env python3
"""Adds audio files to a stock iPod's library database with pygpod.

usage: ipod_add.py MOUNT PLAYLIST GUID FILE...
Prints one JSON object per line: {"type":"track",...} then {"type":"done",...}.
Writes to the iPod: SysInfo (FirewireGuid, only if missing), the track files, iTunesDB.
"""
import json
import os
import sys
import warnings

warnings.filterwarnings("ignore")
import pygpod  # noqa: E402
from pygpod.hash.hash58 import compute_hash58  # noqa: E402


def emit(**o):
    print(json.dumps(o), flush=True)


def main():
    mount, playlist, guid, *files = sys.argv[1:]
    if not os.path.isdir(os.path.join(mount, "iPod_Control")):
        emit(type="error", msg="Not an iPod volume: " + mount)
        return 1

    # Without the GUID the iPod's database signature cannot be computed.
    sysinfo = os.path.join(mount, "iPod_Control", "Device", "SysInfo")
    if not (os.path.exists(sysinfo) and "FirewireGuid" in open(sysinfo).read()):
        with open(sysinfo, "a") as f:
            f.write("FirewireGuid: 0x%s\n" % guid)

    db = pygpod.Database(mount)
    existing = {(t.title, t.artist, t.album) for t in db.tracks}
    pl = db.get_playlist(playlist) if playlist else None
    if playlist and pl is None:
        pl = db.create_playlist(playlist)

    added = skipped = 0
    for i, path in enumerate(files, 1):
        try:
            t = db.add_track(path, convert=True)
            key = (t.title, t.artist, t.album)
            if key in existing:  # same song already on the iPod
                db.remove_track(t)
                skipped += 1
                emit(type="track", n=i, of=len(files), file=os.path.basename(path), status="already there")
                continue
            existing.add(key)
            if pl is not None:
                db.add_track_to_playlist(pl, t)
            added += 1
            emit(type="track", n=i, of=len(files), file=os.path.basename(path), status="added")
        except Exception as e:  # one bad file should not stop the rest
            emit(type="track", n=i, of=len(files), file=os.path.basename(path), status="failed", msg=str(e))
    db.save()

    # The iPod checks the hash58 signature; pygpod's save only refreshes hash72.
    p = os.path.join(mount, "iPod_Control", "iTunes", "iTunesDB")
    data = open(p, "rb").read()
    open(p, "wb").write(compute_hash58(data, guid))
    emit(type="done", added=added, skipped=skipped, total=len(db.tracks))
    return 0


sys.exit(main())
