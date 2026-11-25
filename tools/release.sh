#!/bin/bash
# Signed, notarised, stapled DMG + zip in dist/. Needs the Developer ID cert and a keychain profile named "notary"
# (xcrun notarytool store-credentials notary --apple-id <id> --team-id <team-id>).
set -euo pipefail
cd "$(dirname "$0")/.."
APP="dist/mac-arm64/myPod.app"
rm -rf dist
[ -x resources/python/bin/python3 ] || tools/make-python.sh
npx electron-builder --mac dir --arm64
ditto -c -k --keepParent "$APP" dist/app.zip
xcrun notarytool submit dist/app.zip --keychain-profile notary --wait
xcrun stapler staple "$APP"
rm dist/app.zip
npx electron-builder --mac dmg zip --arm64 --prepackaged "$APP"
DMG=$(ls dist/*.dmg)
xcrun notarytool submit "$DMG" --keychain-profile notary --wait
xcrun stapler staple "$DMG"
spctl -a -vv "$APP" 2>&1 | head -3
echo "RELEASE OK: $DMG"
