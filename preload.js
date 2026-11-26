const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('flick', {
  selection: () => ipcRenderer.invoke('selection'),
  actions: (files) => ipcRenderer.invoke('actions', files),
  run: (actionId, files) => ipcRenderer.invoke('run', { actionId, files }),
  cancel: () => ipcRenderer.send('cancel'),
  ringOpen: () => ipcRenderer.invoke('ring-open'),
  ringClose: () => ipcRenderer.send('ring-close'),
  dragStart: () => ipcRenderer.send('drag-start'),
  dragMove: () => ipcRenderer.send('drag-move'),
  dragEnd: () => ipcRenderer.send('drag-end'),
  openOutput: () => ipcRenderer.send('open-output'),
  pathForFile: (file) => webUtils.getPathForFile(file),
  onProgress: (cb) => ipcRenderer.on('progress', (_e, p) => cb(p)),
});
