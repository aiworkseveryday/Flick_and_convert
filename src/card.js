// Small progress card shown near where the file was dropped.
const path = require('path');
const { BrowserWindow, screen } = require('electron');

const W = 340;
const H = 96;

let win = null;
let loaded = null;
let hideTimer = null;

function create() {
  win = new BrowserWindow({
    width: W,
    height: H,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,
    hasShadow: false,
    backgroundColor: '#00000000',
    webPreferences: { preload: path.join(__dirname, '..', 'ui-preload.js'), contextIsolation: true, sandbox: false },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  loaded = new Promise((r) => win.webContents.once('did-finish-load', r));
  win.loadFile(path.join(__dirname, '..', 'renderer', 'card.html'));
}

// Places the card just below the wheel's spot, or bottom-right when there is no spot.
function place(anchor) {
  const pt = anchor || screen.getCursorScreenPoint();
  const wa = screen.getDisplayNearestPoint(pt).workArea;
  let x;
  let y;
  if (anchor) {
    x = anchor.x - W / 2;
    y = anchor.y + 150;
    if (y + H > wa.y + wa.height) y = anchor.y - 150 - H;
  } else {
    x = wa.x + wa.width - W - 16;
    y = wa.y + wa.height - H - 16;
  }
  x = Math.round(Math.min(Math.max(x, wa.x + 8), wa.x + wa.width - W - 8));
  y = Math.round(Math.min(Math.max(y, wa.y + 8), wa.y + wa.height - H - 8));
  win.setBounds({ x, y, width: W, height: H });
}

async function update(data, anchor) {
  await loaded;
  clearTimeout(hideTimer);
  if (anchor !== undefined) place(anchor);
  win.webContents.send('card:update', data);
  if (!win.isVisible()) win.showInactive();
  if (data.state === 'done' || data.state === 'error' || data.state === 'info') {
    hideTimer = setTimeout(hide, data.state === 'done' ? 7000 : 8000);
  }
}

function hide() {
  clearTimeout(hideTimer);
  if (!win || !win.isVisible()) return;
  win.webContents.send('card:update', { state: 'leaving' });
  setTimeout(() => win.hide(), 160);
}

function bounds() {
  return win && win.isVisible() ? win.getBounds() : null;
}

module.exports = { create, update, hide, bounds, window: () => win };
