'use strict';
const { contextBridge, ipcRenderer } = require('electron');
const call = (channel) => (...args) => ipcRenderer.invoke(channel, ...args);

contextBridge.exposeInMainWorld('api', {
  getSettings: call('settings:get'),
  saveSettings: call('settings:save'),
  pickFolder: call('dialog:folder'),
  devices: call('devices:list'),
  profile: call('profile:list'),
  playlistPlan: call('playlist:plan'),
  checkExisting: call('existing:check'),
  runPlaylist: call('download:run'),
  ipodReady: call('ipod:ready'),
  ipodReconnect: call('ipod:reconnect'),
  ipodScan: call('ipod:scan'),
  ipodEject: call('ipod:eject'),
  ipodSetup: call('ipod:setup'),
  musicSources: call('devices:music'),
  startDownload: call('download:start'),
  cancelDownload: call('download:cancel'),
  send: call('send:run'),
  reveal: call('file:reveal'),
  openExternal: call('app:open-external'),
  onEvent: (cb) => ipcRenderer.on('dl:event', (_e, data) => cb(data)),
});
