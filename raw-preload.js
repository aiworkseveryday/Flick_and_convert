const { contextBridge, ipcRenderer } = require('electron');
const fs = require('fs/promises');

contextBridge.exposeInMainWorld('rawApi', {
  read: async (file) => new Uint8Array(await fs.readFile(file)),
  onJob: (cb) => ipcRenderer.on('raw-job', (_e, job) => cb(job)),
  done: (id, result) => ipcRenderer.send('raw-result', { id, ...result }),
  ready: () => ipcRenderer.send('raw-ready'),
});
