// The wheel window: shown at the cursor for a Shift-drag, the shortcut or the shelf.
const path = require('path');
const { BrowserWindow, ipcMain, screen } = require('electron');
const { wheelFor } = require('./actions');

const W = 360;
const H = 410;
const CENTER = 180;

let win = null;
let loaded = null;
let visible = false;
let shown = null; // { mode, files, anchor }
let onRun = () => {};

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
    focusable: false, // Explorer keeps focus and its selection
    hasShadow: false,
    backgroundColor: '#00000000',
    webPreferences: { preload: path.join(__dirname, '..', 'ui-preload.js'), contextIsolation: true, sandbox: false },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  loaded = new Promise((r) => win.webContents.once('did-finish-load', r));
  win.loadFile(path.join(__dirname, '..', 'renderer', 'wheel.html'));
}

// anchor: DIP point the wheel centres on (moved inward if it would go off screen)
async function show(anchor, { mode, files }) {
  await loaded;
  const wa = screen.getDisplayNearestPoint(anchor).workArea;
  const x = Math.round(Math.min(Math.max(anchor.x - CENTER, wa.x), wa.x + wa.width - W));
  const y = Math.round(Math.min(Math.max(anchor.y - CENTER, wa.y), wa.y + wa.height - H));
  const info = files.length ? wheelFor(files) : { actions: [], hub: 'Drop' };
  shown = { mode, files, anchor };
  win.webContents.send('wheel:show', { mode, files, hub: info.hub, actions: info.actions });
  win.setBounds({ x, y, width: W, height: H });
  if (!visible) win.showInactive();
  visible = true;
}

function hide() {
  if (!visible) return;
  visible = false;
  shown = null;
  win.webContents.send('wheel:hide');
  setTimeout(() => {
    if (!visible) win.hide();
  }, 120);
}

function isVisible() {
  return visible;
}

function contains(dipPoint) {
  if (!visible) return false;
  const b = win.getBounds();
  const dx = dipPoint.x - (b.x + CENTER);
  const dy = dipPoint.y - (b.y + CENTER);
  return Math.hypot(dx, dy) <= CENTER || (dipPoint.y >= b.y + 360 && dipPoint.y <= b.y + H && Math.abs(dx) < 120);
}

// The wheel was showing actions for one set of files; make sure a drop carried the same kind of
// files and that the action is offered for them.
function actionAllowed(actionId, files) {
  const walk = (list) => list.some((a) => (a.id === actionId && !a.soon && !a.children) || (a.children && walk(a.children)));
  return walk(wheelFor(files).actions);
}

ipcMain.handle('wheel:info', (_e, files) => wheelFor(files));
ipcMain.on('wheel:close', () => hide());
ipcMain.on('wheel:sticky', () => {
  if (shown) shown.mode = 'click';
});
ipcMain.on('wheel:run', async (_e, { actionId, files }) => {
  const anchor = shown ? shown.anchor : screen.getCursorScreenPoint();
  if (!actionAllowed(actionId, files)) {
    // dropped something different from what the wheel expected: offer the right options
    await show(anchor, { mode: 'click', files });
    return;
  }
  hide();
  onRun(actionId, files, anchor);
});

// Called by main when the mouse button goes up anywhere.
function pointerUp() {
  if (visible) win.webContents.send('wheel:pointer-up');
}

module.exports = {
  create,
  show,
  hide,
  isVisible,
  contains,
  pointerUp,
  setRunHandler: (fn) => (onRun = fn),
  window: () => win,
};
