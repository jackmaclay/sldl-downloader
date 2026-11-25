'use strict';
// Run with Electron by the CLI: electron tools/profile.js <user>. Prints "IDS:[...]" or "ERR:message".
const { app } = require('electron');
app.dock && app.dock.hide();
app.on('window-all-closed', () => {}); // stay alive until we print
app.whenReady().then(async () => {
  try {
    const ids = await require('../src/spotify').scrapeInElectron(process.argv[2]);
    console.log('IDS:' + JSON.stringify(ids));
    app.exit(0);
  } catch (e) { console.log('ERR:' + e.message); app.exit(1); }
});
