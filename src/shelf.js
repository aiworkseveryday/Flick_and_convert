// The shelf: a see-through basket for collecting files from different folders.
const fs = require('fs');
const path = require('path');
const { BrowserWindow, ipcMain, screen, nativeImage } = require('electron');
const settings = require('./settings');
const { extOf, kindOf } = require('./actions');

const W = 320;
const H = 300;

let win = null;
let openWheel = () => {};
const dragIcon = nativeImage.createFromPath(path.join(__dirname, '..', 'assets', 'icon.png')).resize({ width: 32, height: 32 });

const files = () => settings.get('shelfFiles') || [];

function save(list) {
  settings.set('shelfFiles', [...list]);
  send();
}

function describe() {
  return files().map((p) => ({
    path: p,
    name: path.basename(p),
    ext: kindOf(p) === 'folder' ? 'DIR' : extOf(p).toUpperCase().slice(0, 4) || 'FILE',
    missing: !fs.existsSync(p),
  }));
}

function send() {
  if (win && !win.isDestroyed()) win.webContents.send('shelf:files', describe());
}

function defaultPos() {
  const wa = screen.getPrimaryDisplay().workArea;
  return { x: wa.x + wa.width - W - 24, y: wa.y + Math.round(wa.height * 0.3) };
}

function open() {
  if (win && !win.isDestroyed()) {
    win.showInactive();
    return;
  }
  const pos = settings.get('shelfPos') || defaultPos();
  // keep it on a screen that still exists
  const wa = screen.getDisplayNearestPoint(pos).workArea;
  const x = Math.min(Math.max(pos.x, wa.x), wa.x + wa.width - W);
  const y = Math.min(Math.max(pos.y, wa.y), wa.y + wa.height - H);
  win = new BrowserWindow({
    width: W,
    height: H,
    x,
    y,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    backgroundColor: '#00000000',
    title: 'Flick shelf',
    webPreferences: { preload: path.join(__dirname, '..', 'ui-preload.js'), contextIsolation: true, sandbox: false },
  });
  win.once('ready-to-show', () => win.showInactive());
  win.on('moved', () => {
    const b = win.getBounds();
    settings.set('shelfPos', { x: b.x, y: b.y });
  });
  win.on('closed', () => {
    win = null;
    settings.set('shelfOpen', false);
  });
  win.loadFile(path.join(__dirname, '..', 'renderer', 'shelf.html'));
  settings.set('shelfOpen', true);
}

function close() {
  if (win && !win.isDestroyed()) win.close();
}

function toggle() {
  if (win && !win.isDestroyed()) close();
  else open();
}

function add(paths) {
  const list = files();
  for (const p of paths) if (p && !list.includes(p)) list.push(p);
  save(list);
}

ipcMain.handle('shelf:get', () => describe());
ipcMain.on('shelf:add', (_e, paths) => add(paths));
ipcMain.on('shelf:remove', (_e, p) => save(files().filter((f) => f !== p)));
ipcMain.on('shelf:clear', () => save([]));
ipcMain.on('shelf:close', () => close());
ipcMain.on('shelf:wheel', (_e, { paths, x, y }) => {
  const existing = paths.filter((p) => fs.existsSync(p));
  if (existing.length) openWheel(existing, { x, y });
});
// drag a parked file out of the shelf into Explorer, a browser upload, an email...
ipcMain.on('shelf:drag', (e, p) => {
  if (fs.existsSync(p)) e.sender.startDrag({ file: p, icon: dragIcon });
});

module.exports = {
  open,
  close,
  toggle,
  add,
  isOpen: () => !!(win && !win.isDestroyed()),
  setWheelOpener: (fn) => (openWheel = fn),
  window: () => win,
};
