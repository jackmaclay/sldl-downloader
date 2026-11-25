#!/usr/bin/env python3
"""Adds audio files to a stock iPod's library database with pygpod.

usage: ipod_add.py MOUNT PLAYLIST GUID FILE...
Prints one JSON object per line: {"type":"track",...} then {"type":"done",...}.
Writes to the iPod: SysInfo (FirewireGuid, only if missing), the track files, iTunesDB.
"""
import json
import os
import re
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
    if os.path.exists(sysinfo):
        m = re.search(r"FirewireGuid:\s*0x([0-9A-Fa-f]+)", open(sysinfo).read())
        if m and m.group(1).upper() != guid.upper():  # a wrong GUID would sign the database for a different iPod
            emit(type="error", msg="This volume's iPod GUID (%s) does not match the device (%s). Refusing to write." % (m.group(1).upper(), guid.upper()))
            return 1
    if not (os.path.exists(sysinfo) and "FirewireGuid" in open(sysinfo).read()):
        with open(sysinfo, "a") as f:
            f.write("FirewireGuid: 0x%s\n" % guid)

    db = pygpod.Database(mount)
    norm = lambda x: " ".join(str(x or "").lower().split())
    index = {(norm(t.title), norm(t.artist)): t for t in db.tracks}  # songs already on the iPod
    pl = db.get_playlist(playlist) if playlist else None
    if playlist and pl is None:
        pl = db.create_playlist(playlist)
    in_pl = {t.track_id for t in pl.tracks} if pl is not None else set()

    def tags(path):
        try:
            from mutagen import File
            m = File(path, easy=True)
            return (m.get("title") or [""])[0], (m.get("artist") or [""])[0]
        except Exception:
            return "", ""

    # <folder>/.tags.json (written by the app) holds the proper title and artist for each file, from Spotify.
    side = {}
    try:
        import json as _j
        folder0 = os.environ.get("SLDL_FOLDER") or (os.path.dirname(files[0]) if files else "")
        side = _j.load(open(os.path.join(folder0, ".tags.json"))) if folder0 and os.path.exists(os.path.join(folder0, ".tags.json")) else {}
    except Exception:
        side = {}
    # Songs the iPod already has (found before downloading, from its stored song list): link them into this playlist, no file needed.
    import re as _re, unicodedata as _u
    def _fold(x): return _u.normalize("NFKD", str(x or "")).encode("ascii", "ignore").decode().lower().replace("'", "")
    def _loose(title, artist):   # same idea as the app's check: "Imagine - Remastered 2010" is the song "Imagine"; artist = first word
        t = _re.sub(r"\(.*?\)|\[.*?\]", " ", _fold(title)); t = _re.split(r"\s-\s", t)[0]
        t = _re.sub(r"\b(remaster(ed)?|version|mix|edit|live|feat|ft)\b.*$", " ", t)
        w = _re.sub(r"[^a-z0-9 ]", " ", _fold(artist)).split()
        return " ".join(_re.sub(r"[^a-z0-9 ]", " ", t).split()), (w[0] if w else "")
    loose = {}
    for _t in db.tracks:
        if not _t.is_video: loose.setdefault(_loose(_t.title, _t.artist), _t)
    linked = missing = 0
    try:
        links = _j.load(open(os.path.join(folder0, ".links.json"))) if folder0 and os.path.exists(os.path.join(folder0, ".links.json")) else []
    except Exception:
        links = []
    for it in links:
        k = _loose(it.get("title"), it.get("artist"))
        t = loose.get(k) or loose.get((k[0], ""))
        if t is None:
            missing += 1
            emit(type="track", n=0, of=len(links), file=it.get("title", ""), status="not on the iPod any more", msg="download it again")
            continue
        if pl is not None and t.track_id not in in_pl:
            db.add_track_to_playlist(pl, t); in_pl.add(t.track_id); linked += 1
    added = skipped = 0
    for i, path in enumerate(files, 1):
        name = os.path.basename(path)
        try:
            meta = side.get(os.path.splitext(os.path.basename(path))[0], {})
            title, artist = (meta.get("title"), meta.get("artist")) if meta.get("title") else tags(path)
            t = index.get((norm(title), norm(artist))) if title else None
            if t is not None:  # already on the iPod: reuse it, and make sure it is in this playlist
                if pl is not None and t.track_id not in in_pl:
                    db.add_track_to_playlist(pl, t); in_pl.add(t.track_id)
                skipped += 1
                emit(type="track", n=i, of=len(files), file=name, status="already there")
                continue
            t = db.add_track(path, convert=True, **({"title": meta["title"], "artist": meta.get("artist", "")} if meta.get("title") else {}))
            index[(norm(t.title), norm(t.artist))] = t
            if pl is not None:
                db.add_track_to_playlist(pl, t); in_pl.add(t.track_id)
            added += 1
            emit(type="track", n=i, of=len(files), file=name, status="added")
        except Exception as e:  # one bad file should not stop the rest
            emit(type="track", n=i, of=len(files), file=name, status="failed", msg=str(e))
    db.save()

    # The iPod checks the hash58 signature; pygpod's save only refreshes hash72.
    p = os.path.join(mount, "iPod_Control", "iTunes", "iTunesDB")
    data = open(p, "rb").read()
    assert len(data) > 1000, "iTunesDB is empty, refusing to sign"
    open(p, "wb").write(compute_hash58(data, guid))
    emit(type="done", added=added, skipped=skipped, linked=linked, missing=missing, total=len(db.tracks))
    return 0


sys.exit(main())
