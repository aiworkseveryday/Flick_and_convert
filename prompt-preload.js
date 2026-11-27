const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('flickPrompt', {
  info: () => ipcRenderer.invoke('prompt-info'),
  done: (value) => ipcRenderer.send('prompt-result', value),
});
