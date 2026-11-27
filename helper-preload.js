const { contextBridge, ipcRenderer } = require('electron');
const fs = require('fs/promises');

contextBridge.exposeInMainWorld('helperApi', {
  read: async (file) => new Uint8Array(await fs.readFile(file)),
  write: (file, data) => fs.writeFile(file, data, { flag: 'wx' }), // never overwrite
  onJob: (cb) => ipcRenderer.on('helper-job', (_e, job) => cb(job)),
  progress: (id, fraction) => ipcRenderer.send('helper-progress', { id, fraction }),
  done: (id, result) => ipcRenderer.send('helper-result', { id, ...result }),
  ready: () => ipcRenderer.send('helper-ready'),
});
