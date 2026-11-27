// Small password window. The bubble can't take keyboard focus (so Explorer keeps its selection),
// so typing happens here.
const path = require('path');
const { BrowserWindow, ipcMain, screen } = require('electron');

let current = null;

ipcMain.on('prompt-result', (e, value) => {
  if (current && e.sender === current.win.webContents) current.finish(value);
});
ipcMain.handle('prompt-info', (e) => (current && e.sender === current.win.webContents ? current.info : null));

// info: { title, message, confirm } -> resolves to the password, or null if cancelled
function askPassword(info, near) {
  if (current) current.finish(null);
  return new Promise((resolve) => {
    const W = 360;
    const H = info.confirm ? 268 : 214;
    const pt = near || screen.getCursorScreenPoint();
    const wa = screen.getDisplayNearestPoint(pt).workArea;
    const win = new BrowserWindow({
      width: W,
      height: H,
      x: Math.round(Math.min(Math.max(pt.x - W / 2, wa.x + 8), wa.x + wa.width - W - 8)),
      y: Math.round(Math.min(Math.max(pt.y - H / 2, wa.y + 8), wa.y + wa.height - H - 8)),
      frame: false,
      transparent: true,
      resizable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      alwaysOnTop: true,
      show: false,
      title: 'Flick',
      backgroundColor: '#00000000',
      webPreferences: { preload: path.join(__dirname, '..', 'prompt-preload.js'), contextIsolation: true, sandbox: true },
    });
    win.setAlwaysOnTop(true, 'screen-saver');
    const entry = {
      win,
      info,
      finish(value) {
        if (current !== entry) return;
        current = null;
        resolve(typeof value === 'string' && value.length ? value : null);
        if (!win.isDestroyed()) win.destroy();
      },
    };
    current = entry;
    win.on('closed', () => entry.finish(null));
    win.once('ready-to-show', () => {
      win.show();
      win.focus();
      win.webContents.focus();
    });
    win.loadFile(path.join(__dirname, '..', 'renderer', 'prompt.html'));
  });
}

module.exports = { askPassword };
