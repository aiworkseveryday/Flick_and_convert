// The wheel window: a full wheel at the cursor for a Shift-drag, the shortcut or the right-click menu,
// or a half wheel (fan) opening out of a shelf corner for files clicked on the shelf.
const path = require('path');
const { BrowserWindow, ipcMain, screen } = require('electron');
const { wheelFor, toggleFavourite } = require('./actions');

// All sizes in DIPs. cx/cy is the centre inside the window; angles are SVG degrees (0 = right, 90 = down).
const WHEEL = { kind: 'wheel', w: 360, h: 410, cx: 180, cy: 180, rIn: 66, rOut: 152, rHub: 60, rim: 166, hub: 52, sweep: 360, captionY: 372 };
// side 'left': the fan opens to the left of its centre (the shelf is on its right), and the reverse.
function fanLayout(side) {
  const w = 280;
  return {
    kind: 'fan',
    side,
    w,
    h: 494,
    cx: side === 'left' ? w : 0,
    cy: 224,
    rIn: 82,
    rOut: 206,
    rHub: 76,
    rim: 220,
    hub: 68,
    sweep: 180,
    start: side === 'left' ? 270 : -90, // the first option sits at the top
    dir: side === 'left' ? -1 : 1,
    captionY: 454,
  };
}

let win = null;
let loaded = null;
let visible = false;
let shown = null; // { mode, files, anchor }
let onRun = () => {};

function create() {
  win = new BrowserWindow({
    width: WHEEL.w,
    height: WHEEL.h,
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

// anchor: DIP point the wheel (or the fan's flat edge) centres on, moved inward if it would go off screen.
// fan: { side } to open a half wheel to that side of the anchor instead of a full wheel.
async function show(anchor, { mode, files, fan }) {
  await loaded;
  const L = fan ? fanLayout(fan.side) : WHEEL;
  const wa = screen.getDisplayNearestPoint(anchor).workArea;
  const x = Math.round(Math.min(Math.max(anchor.x - L.cx, wa.x), wa.x + wa.width - L.w));
  const y = Math.round(Math.min(Math.max(anchor.y - L.cy, wa.y), wa.y + wa.height - L.h));
  const info = files.length ? wheelFor(files) : { actions: [], hub: 'Drop' };
  // the progress card opens under the middle of the fan, clear of the shelf
  const cardAt = fan ? { x: x + L.cx + (fan.side === 'left' ? -1 : 1) * 120, y: y + L.cy } : anchor;
  shown = { mode, files, anchor, fan, layout: L, cardAt };
  win.webContents.send('wheel:show', { mode, files, hub: info.hub, actions: info.actions, layout: L });
  win.setBounds({ x, y, width: L.w, height: L.h });
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
  if (!visible || !shown) return false;
  const L = shown.layout;
  const b = win.getBounds();
  const dx = dipPoint.x - (b.x + L.cx);
  const dy = dipPoint.y - (b.y + L.cy);
  const onSide = L.kind === 'wheel' || (L.side === 'left' ? dx <= 0 : dx >= 0);
  if (Math.hypot(dx, dy) <= L.rim && onSide) return true;
  // the caption under it
  const inX = L.kind === 'wheel' ? Math.abs(dx) < 120 : dipPoint.x >= b.x && dipPoint.x <= b.x + L.w;
  return inX && dipPoint.y >= b.y + L.captionY - 6 && dipPoint.y <= b.y + L.h;
}

// The wheel was showing actions for one set of files; make sure a drop carried the same kind of
// files and that the action is offered for them.
function actionAllowed(actionId, files) {
  const walk = (list) => list.some((a) => (a.id === actionId && !a.soon && !a.children) || (a.children && walk(a.children)));
  return walk(wheelFor(files).actions);
}

ipcMain.handle('wheel:info', (_e, files) => wheelFor(files));
// right-click on a slice pins it to the top slot for this kind of file (or unpins it)
ipcMain.handle('wheel:fav', (_e, { actionId, files }) => ({ ...toggleFavourite(actionId, files), info: wheelFor(files) }));
ipcMain.on('wheel:close', () => hide());
ipcMain.on('wheel:sticky', () => {
  if (shown) shown.mode = 'click';
});
ipcMain.on('wheel:run', async (_e, { actionId, files }) => {
  const anchor = shown ? shown.anchor : screen.getCursorScreenPoint();
  const cardAt = shown ? shown.cardAt : anchor;
  if (!actionAllowed(actionId, files)) {
    // dropped something different from what the wheel expected: offer the right options
    await show(anchor, { mode: 'click', files, fan: shown && shown.fan });
    return;
  }
  hide();
  onRun(actionId, files, cardAt);
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
