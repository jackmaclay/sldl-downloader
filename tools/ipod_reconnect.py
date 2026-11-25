#!/usr/bin/env python3
"""Makes macOS re-detect an iPod that was ejected but is still on USB (the same as unplugging and replugging it).

usage: ipod_reconnect.py USB_SERIAL
Sends a USB reset. The device disappears and comes back, so libusb often reports "Entity not found" on success.
Only run this on an iPod with nothing mounted: a reset mid-write would interrupt it.
"""
import json
import sys

try:
    import usb.core
    import usb.backend.libusb1 as lb
    import libusb_package
except ImportError:
    print(json.dumps({"ok": False, "error": "The USB helper is not installed. Run: sldl-dl ipod-setup"}))
    sys.exit(1)


def main():
    serial = sys.argv[1].upper()
    be = lb.get_backend(find_library=libusb_package.find_library)
    dev = None
    for d in usb.core.find(find_all=True, idVendor=0x05AC, backend=be):
        try:
            if str(d.serial_number or "").upper() == serial:
                dev = d
        except Exception:
            continue
    if dev is None:
        print(json.dumps({"ok": False, "error": "That iPod is not on USB. Unplug it and plug it back in."}))
        return 1
    try:
        dev.reset()
    except usb.core.USBError as e:
        if e.errno not in (2, 19):  # 2/19: the device is already gone because it is re-enumerating, which is the goal
            print(json.dumps({"ok": False, "error": f"USB reset failed: {e}"}))
            return 1
    print(json.dumps({"ok": True}))
    return 0


sys.exit(main())
