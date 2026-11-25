#!/bin/bash
# Prepares the Python that ships inside myPod (resources/python), so the iPod helper needs no Python or internet on the user's Mac.
#   Source: a relocatable standalone CPython (the python-build-standalone builds that uv manages). Apple Silicon.
#   Adds pygpod (iPod database), mutagen (tags), Pillow (album art), pyusb + libusb-package (reconnect). Pure copy plus pip: no compiling.
# Needs: uv (brew install uv) and a managed Python (uv python install 3.15). Output: resources/python (about 25 MB), git-ignored.
set -euo pipefail
cd "$(dirname "$0")/.."
SRC_BIN=$(uv python find --no-project 3.15)
SRC=$(cd "$(dirname "$SRC_BIN")/.." && pwd -P)
case "$SRC" in */cpython-*-macos-aarch64-*) ;; *) echo "Not a standalone macOS arm64 CPython: $SRC" >&2; exit 1;; esac
VER=$("$SRC_BIN" -c 'import sys; print("%d.%d" % sys.version_info[:2])')

rm -rf resources/python
mkdir -p resources/python
cp -R "$SRC/bin" "$SRC/lib" resources/python/
cd resources/python
SP=lib/python$VER/site-packages

# one real executable (copies of symlinks would duplicate 40 MB), no extra scripts
mv "bin/python$VER" bin/python3
find bin -mindepth 1 ! -name python3 -exec rm -rf {} +

# what the helper does not need
rm -rf lib/python$VER/{test,idlelib,tkinter,turtledemo,ensurepip,pydoc_data,lib2to3,config-*,EXTERNALLY-MANAGED}
rm -rf lib/{tcl*,tk*,itcl*,thread*,pkgconfig} lib/python$VER/lib-dynload/{_tkinter,_test,_xxtestfuzz}*.so
rm -f lib/*.dylib lib/*.a                             # the executable is self-contained: no libpython or Tcl/Tk libraries needed
rm -rf lib/python$VER/{profiling,unittest}
rm -rf "$SP"/{pip*,setuptools*,pkg_resources*,_distutils_hack*,distutils-precedence.pth}
find . -name __pycache__ -prune -exec rm -rf {} +   # Python must never write these into the signed app
find . -name '*.pyi' -delete

cd ../..
uv pip install --python resources/python/bin/python3 --target "resources/python/$SP" --no-cache "pygpod[tags,artwork]" pyusb libusb-package >/dev/null
rm -rf "resources/python/$SP"/bin "resources/python/$SP"/share
find resources/python -name __pycache__ -prune -exec rm -rf {} +

PYTHONDONTWRITEBYTECODE=1 resources/python/bin/python3 -c "import pygpod, mutagen, PIL, usb, libusb_package; print('python', __import__('sys').version.split()[0], '| pygpod', pygpod.__version__, '| Pillow', PIL.__version__)"
du -sh resources/python | cut -f1
