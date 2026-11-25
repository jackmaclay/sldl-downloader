'use strict';
// The two homes for music, shown in Settings and the Help page:
//   iPod folder  = iPod-ready files (MP3 or AAC): what goes on an iPod. It is sldl's download folder (the `path` key in sldl.conf).
//   Music folder = the user's own collection at the quality they chose (MP3 or FLAC). Pref `libraryDir`.
const os = require('os');
const path = require('path');
const conf = require('./conf');
const prefs = require('./prefs');

const DEFAULT_IPOD = path.join(os.homedir(), 'Music', 'myPod', 'For iPod');
const ipodDir = () => conf.read().path || DEFAULT_IPOD;
const libraryDir = () => prefs.read().libraryDir;

module.exports = { ipodDir, libraryDir, DEFAULT_IPOD };
