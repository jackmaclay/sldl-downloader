'use strict';
// Renders each page to PNG in the folder given as argv[2]. Run: npx electron test/shot.js <dir>
const { app, BrowserWindow } = require('electron');
const path = require('path'); const fs = require('fs');
const dir = process.argv[2] || path.join(__dirname, 'shots');
fs.mkdirSync(dir, { recursive: true });
process.env.SLDL_CONF = path.join(dir, 'sldl.conf');
process.env.SLDL_HOME = dir; // app.json and the iPod venv stay out of the real config
require('../main.js');
setTimeout(() => { console.error('shot timeout'); process.exit(1); }, 90000).unref();
app.whenReady().then(async () => {
  await new Promise((r) => setTimeout(r, 1200));
  const win = BrowserWindow.getAllWindows()[0];
  const snap = async (name) => { await new Promise((r) => setTimeout(r, 500)); const img = await win.webContents.capturePage(); fs.writeFileSync(path.join(dir, `${name}.png`), img.toPNG()); };
  const js = (c) => win.webContents.executeJavaScript(c);
  await snap('0-throwaway');
  await js(`document.getElementById('url').value='https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M'`);
  await snap('1-download');
  await js(`document.getElementById('url').value='${process.env.SHOT_URL || 'https://open.spotify.com/user/spotify'}'; document.getElementById('start').click()`);
  await new Promise((r) => setTimeout(r, 25000)); await snap('1b-profile');
  await js(`(() => { const b = document.querySelector('.pl-head .link'); if (b) b.click(); })()`); await snap('1c-songs');
  await js(`document.querySelector('[data-page=player]').click()`); await new Promise((r)=>setTimeout(r,1500)); await snap('2-player');
  await js(`document.querySelector('[data-page=settings]').click()`); await snap('3-settings');
  await js('sideW = 92; applySide();'); await snap('4-rail');
  await js('sideW = 300; applySide();'); await snap('5-wide');
  // a real drag on the divider: press, move left, release; the sidebar width must follow and be remembered
  await js('sideW = 220; applySide();'); await new Promise((r) => setTimeout(r, 300));
  const wc = win.webContents; const x0 = 220 - 4 + 4; // the divider sits at the sidebar's right edge
  wc.sendInputEvent({ type: 'mouseMove', x: x0, y: 300 }); wc.sendInputEvent({ type: 'mouseDown', x: x0, y: 300, button: 'left', clickCount: 1 });
  for (const x of [200, 160, 120, 100]) { wc.sendInputEvent({ type: 'mouseMove', x, y: 300 }); await new Promise((r) => setTimeout(r, 40)); }
  wc.sendInputEvent({ type: 'mouseUp', x: 100, y: 300, button: 'left', clickCount: 1 }); await new Promise((r) => setTimeout(r, 300));
  console.log('drag test: sideW =', await js('sideW'), '| rail =', await js("document.body.classList.contains('rail')"), '| saved =', await js("localStorage.getItem('sideW')"));
  await js('sideW = 220; applySide();');
  app.quit();
}).catch((e) => { console.error(e); process.exit(1); });
