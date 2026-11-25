#!/usr/bin/env python3
"""Prints what is on a mounted iPod as JSON: every song with its title, artist, length and playlists. Read-only.
usage: ipod_catalog.py MOUNT
"""
import json
import sys
import warnings

warnings.filterwarnings("ignore")
import pygpod  # noqa: E402


def main():
    db = pygpod.Database(sys.argv[1])
    member = {}
    for p in db.playlists:
        if p is db.master_playlist:
            continue
        for t in p.tracks:
            member.setdefault(t.track_id, []).append(p.name)
    songs = [{"title": t.title or "", "artist": t.artist or "", "seconds": round((t.duration_ms or 0) / 1000), "playlists": member.get(t.track_id, [])}
             for t in db.tracks if not t.is_video]
    print(json.dumps({"tracks": songs, "films": [t.title for t in db.tracks if t.is_video]}))
    return 0


sys.exit(main())
