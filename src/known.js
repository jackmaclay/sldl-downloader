'use strict';
// Remembers each iPod's free space the last time it was mounted, so the app still knows roughly how much room there is while the iPod is ejected.
const fs = require('fs');
const os = require('os');
const path = require('path');

const file = () => path.join(process.env.SLDL_HOME || path.join(os.homedir(), '.config', 'sldl'), 'ipods.json');
function lastKnown() { try { return JSON.parse(fs.readFileSync(file(), 'utf8')); } catch { return {}; } }
// list = devices.list(). Updates the entry of every mounted iPod.
function remember(list) {
  const known = lastKnown(); let changed = false;
  for (const d of list) {
    if (!d.volume || !d.volume.free || !d.serial) continue;
    known[d.serial] = { model: d.model, free: d.volume.free, total: d.volume.total, at: Date.now() }; changed = true;
  }
  if (changed) { try { fs.mkdirSync(path.dirname(file()), { recursive: true }); fs.writeFileSync(file(), JSON.stringify(known, null, 1)); } catch { /* not critical */ } }
  return known;
}
module.exports = { remember, lastKnown };
