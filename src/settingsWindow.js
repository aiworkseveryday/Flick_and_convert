// The settings window (opened from the tray).
const path = require('path');
const { BrowserWindow, ipcMain, dialog, nativeTheme } = require('electron');
const settings = require('./settings');

let win = null;
let openWheel = () => {};
let toggleShelf = () => {};

function bg() {
  return nativeTheme.shouldUseDarkColors ? '#0f0d0c' : '#f6f4f1';
}

function open() {
  if (win && !win.isDestroyed()) {
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
    return;
  }
  win = new BrowserWindow({
    width: 540,
    height: 800,
    minWidth: 460,
    minHeight: 560,
    title: 'Flick',
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    autoHideMenuBar: true,
    show: false,
    backgroundColor: bg(),
    webPreferences: { preload: path.join(__dirname, '..', 'ui-preload.js'), contextIsolation: true, sandbox: false },
  });
  win.removeMenu();
  win.once('ready-to-show', () => win.show());
  win.on('closed', () => (win = null));
  win.loadFile(path.join(__dirname, '..', 'renderer', 'settings.html'));
}

function send(channel, ...args) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, ...args);
}

settings.on('change', () => send('settings:changed', settings.all()));
nativeTheme.on('updated', () => win && !win.isDestroyed() && win.setBackgroundColor(bg()));

ipcMain.handle('settings:get', () => settings.all());
ipcMain.on('settings:set', (_e, key, value) => settings.set(key, value));
ipcMain.handle('settings:pick-folder', async () => {
  const r = await dialog.showOpenDialog(win, { title: 'Save converted files to', properties: ['openDirectory', 'createDirectory'] });
  if (r.canceled || !r.filePaths[0]) return null;
  settings.set('outputDir', r.filePaths[0]);
  return r.filePaths[0];
});
ipcMain.on('settings:pick-files', async () => {
  const r = await dialog.showOpenDialog(win, { title: 'Pick files to convert', properties: ['openFile', 'multiSelections'] });
  if (!r.canceled && r.filePaths.length) openWheel(r.filePaths, centre());
});
ipcMain.on('settings:dropped', (_e, files) => files && files.length && openWheel(files, centre()));
ipcMain.on('settings:toggle-shelf', () => toggleShelf());

function centre() {
  if (!win) return undefined;
  const b = win.getBounds();
  return { x: b.x + b.width / 2, y: b.y + 200 };
}

module.exports = {
  open,
  setWheelOpener: (fn) => (openWheel = fn),
  setShelfToggler: (fn) => (toggleShelf = fn),
  notify: send,
  window: () => win,
};
