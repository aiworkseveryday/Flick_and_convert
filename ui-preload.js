// Bridge shared by Flick's windows (wheel, progress card, settings, shelf).
const { contextBridge, ipcRenderer, webUtils } = require('electron');

const ALLOWED = /^(wheel|card|settings|shelf):/;
const check = (channel) => {
  if (!ALLOWED.test(channel)) throw new Error(`Blocked channel ${channel}`);
};

contextBridge.exposeInMainWorld('flick', {
  invoke: (channel, ...args) => (check(channel), ipcRenderer.invoke(channel, ...args)),
  send: (channel, ...args) => (check(channel), ipcRenderer.send(channel, ...args)),
  on: (channel, cb) => {
    check(channel);
    ipcRenderer.on(channel, (_e, ...args) => cb(...args));
  },
  pathForFile: (file) => webUtils.getPathForFile(file),
});
