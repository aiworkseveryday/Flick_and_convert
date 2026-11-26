const { app, BrowserWindow, ipcMain, screen, shell, Tray, Menu, nativeImage, protocol, net } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');

// flick://app/... serves the app's own files. The RAW decoder (WebAssembly in a worker)
// needs a real origin to load its module and .wasm file.
protocol.registerSchemesAsPrivileged([
  { scheme: 'flick', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
]);
const explorer = require('./src/explorer');
const { actionsFor } = require('./src/actions');
const { runJob } = require('./src/jobs');

const SMALL = 72; // idle window: bubble + progress ring
const BIG = 360; // window while the ring menu is open
const MARGIN = 6;

let win = null;
let tray = null;
let mode = 'small';
let smallPos = null; // top-left of the small window, the bubble's "home"
let dragStart = null;
let lastOutput = null;

if (!app.requestSingleInstanceLock()) app.quit();

function workAreaAt(pt) {
  return screen.getDisplayNearestPoint(pt).workArea;
}

function createWindow() {
  const wa = screen.getPrimaryDisplay().workArea;
  smallPos = { x: wa.x + wa.width - SMALL - MARGIN, y: Math.round(wa.y + wa.height * 0.55) };
  win = new BrowserWindow({
    width: SMALL,
    height: SMALL,
    x: smallPos.x,
    y: smallPos.y,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false, // clicking the bubble must not steal focus from Explorer
    hasShadow: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: false,
    },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.loadFile(path.join(__dirname, 'renderer', 'bubble.html'));
}

function setSmall() {
  mode = 'small';
  win.setBounds({ x: smallPos.x, y: smallPos.y, width: SMALL, height: SMALL });
}

// Grow the window around the bubble so the ring has room; the bubble stays put on screen.
function setBig() {
  mode = 'big';
  const off = (BIG - SMALL) / 2;
  const b = { x: smallPos.x - off, y: smallPos.y - off, width: BIG, height: BIG };
  win.setBounds(b);
  const wa = workAreaAt({ x: smallPos.x + SMALL / 2, y: smallPos.y + SMALL / 2 });
  // visible part of the big window, in window coordinates
  return {
    left: Math.max(0, wa.x - b.x),
    top: Math.max(0, wa.y - b.y),
    right: Math.min(BIG, wa.x + wa.width - b.x),
    bottom: Math.min(BIG, wa.y + wa.height - b.y),
  };
}

function snap() {
  const c = { x: smallPos.x + SMALL / 2, y: smallPos.y + SMALL / 2 };
  const wa = workAreaAt(c);
  const toLeft = c.x < wa.x + wa.width / 2;
  const target = {
    x: toLeft ? wa.x + MARGIN : wa.x + wa.width - SMALL - MARGIN,
    y: Math.min(Math.max(smallPos.y, wa.y + MARGIN), wa.y + wa.height - SMALL - MARGIN),
  };
  const from = { ...smallPos };
  const steps = 8;
  let i = 0;
  const t = setInterval(() => {
    i++;
    const k = 1 - Math.pow(1 - i / steps, 3);
    smallPos = { x: Math.round(from.x + (target.x - from.x) * k), y: Math.round(from.y + (target.y - from.y) * k) };
    if (mode === 'small') win.setPosition(smallPos.x, smallPos.y);
    if (i >= steps) clearInterval(t);
  }, 14);
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'tray.png'));
  tray = new Tray(icon);
  tray.setToolTip('Flick');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Show / hide bubble', click: () => (win.isVisible() ? win.hide() : win.showInactive()) },
      { type: 'separator' },
      { label: 'Quit Flick', click: () => app.quit() },
    ]),
  );
  tray.on('click', () => (win.isVisible() ? win.hide() : win.showInactive()));
}

// ---------- IPC ----------

ipcMain.handle('selection', async () => {
  try {
    return await explorer.getSelection();
  } catch {
    return [];
  }
});

ipcMain.handle('actions', (_e, files) => actionsFor(files));

ipcMain.on('drag-start', () => {
  dragStart = { cursor: screen.getCursorScreenPoint(), pos: { ...smallPos } };
});
ipcMain.on('drag-move', () => {
  if (!dragStart) return;
  const c = screen.getCursorScreenPoint();
  smallPos = { x: dragStart.pos.x + c.x - dragStart.cursor.x, y: dragStart.pos.y + c.y - dragStart.cursor.y };
  win.setPosition(smallPos.x, smallPos.y);
});
ipcMain.on('drag-end', () => {
  dragStart = null;
  snap();
});

ipcMain.handle('ring-open', () => setBig());
ipcMain.on('ring-close', () => setSmall());

ipcMain.on('open-output', () => {
  if (lastOutput) shell.showItemInFolder(lastOutput);
});

let abort = null;

ipcMain.handle('run', async (_e, { actionId, files }) => {
  if (abort) return { ok: false, error: 'Already converting' };
  abort = new AbortController();
  try {
    const outputs = await runJob(actionId, files, abort.signal, (p) => {
      if (!win.isDestroyed()) win.webContents.send('progress', p);
    });
    lastOutput = outputs[outputs.length - 1] || null;
    return { ok: true, outputs };
  } catch (err) {
    if (abort.signal.aborted) return { ok: false, cancelled: true };
    return { ok: false, error: String(err && err.message ? err.message : err) };
  } finally {
    abort = null;
  }
});

ipcMain.on('cancel', () => abort && abort.abort());

app.whenReady().then(() => {
  const appRoot = path.resolve(__dirname);
  protocol.handle('flick', (req) => {
    const rel = decodeURIComponent(new URL(req.url).pathname).replace(/^\/+/, '');
    const file = path.resolve(appRoot, rel);
    if (!file.startsWith(appRoot + path.sep)) return new Response('Not found', { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });
  createWindow();
  createTray();
  explorer.start();
  if (process.env.FLICK_SELFTEST) require('./src/selftest')(win, process.env.FLICK_SELFTEST);
});

app.on('second-instance', () => win && win.showInactive());
app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => explorer.stop());
