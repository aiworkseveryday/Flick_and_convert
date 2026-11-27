// Flick: a tray app. Shift + drag a file in Explorer to open the wheel, drop it on a slice to convert.
const { app, screen, Tray, Menu, nativeImage, protocol, net, globalShortcut, nativeTheme } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');

// flick://app/... serves the app's own files. The helper window (RAW and PDF work in
// WebAssembly/workers) needs a real origin to load its modules.
protocol.registerSchemesAsPrivileged([
  { scheme: 'flick', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
]);

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  start();
}

function start() {
  // self-tests keep their own settings so they never touch the real ones
  if (process.env.FLICK_SELFTEST) app.setPath('userData', path.join(process.env.FLICK_SELFTEST, 'userdata'));
  const settings = require('./src/settings');
  const explorer = require('./src/explorer');
  const hook = require('./src/hook');
  const wheel = require('./src/wheel');
  const card = require('./src/card');
  const runner = require('./src/runner');
  const settingsWindow = require('./src/settingsWindow');
  const shelf = require('./src/shelf');

  const SHORTCUT = 'Control+Alt+F';
  let tray = null;

  function applyTheme() {
    nativeTheme.themeSource = settings.get('theme');
  }

  function applyLogin() {
    const opts = { openAtLogin: !!settings.get('startWithWindows') };
    if (!app.isPackaged) opts.args = [app.getAppPath()];
    app.setLoginItemSettings(opts);
  }

  async function openWheelForSelection() {
    const files = await explorer.getSelection().catch(() => []);
    wheel.show(screen.getCursorScreenPoint(), { mode: 'click', files });
  }

  function trayMenu() {
    return Menu.buildFromTemplate([
      { label: 'Settings', click: () => settingsWindow.open() },
      { label: shelf.isOpen() ? 'Close shelf' : 'Open shelf', click: () => shelf.toggle() },
      { label: 'Wheel for Explorer selection', accelerator: SHORTCUT, click: openWheelForSelection },
      { type: 'separator' },
      { label: 'Quit Flick', click: () => app.quit() },
    ]);
  }

  function createTray() {
    tray = new Tray(nativeImage.createFromPath(path.join(__dirname, 'assets', 'tray.png')));
    tray.setToolTip('Flick: Shift + drag a file to convert it');
    tray.setContextMenu(trayMenu());
    tray.on('click', () => settingsWindow.open());
    settings.on('change', (key) => key === 'shelfOpen' && tray.setContextMenu(trayMenu()));
  }

  app.on('second-instance', () => tray && tray.displayBalloon && tray.displayBalloon({ title: 'Flick', content: 'Flick is already running in the tray.' }));
  app.on('window-all-closed', (e) => e.preventDefault()); // lives in the tray
  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
    hook.stop();
    explorer.stop();
  });

  app.whenReady().then(() => {
    settings.load(app.getPath('userData'));
    applyTheme();
    settings.on('change', (key) => {
      if (key === 'theme') applyTheme();
      if (key === 'startWithWindows') applyLogin();
    });

    const appRoot = path.resolve(__dirname);
    protocol.handle('flick', (req) => {
      const rel = decodeURIComponent(new URL(req.url).pathname).replace(/^\/+/, '');
      const file = path.resolve(appRoot, rel);
      if (!file.startsWith(appRoot + path.sep)) return new Response('Not found', { status: 404 });
      return net.fetch(pathToFileURL(file).toString());
    });

    wheel.create();
    card.create();
    wheel.setRunHandler((actionId, files, anchor) => runner.run(actionId, files, anchor));
    const openWheel = (files, anchor) => wheel.show(anchor || screen.getCursorScreenPoint(), { mode: 'click', files });
    settingsWindow.setWheelOpener(openWheel);
    settingsWindow.setShelfToggler(() => shelf.toggle());
    shelf.setWheelOpener(openWheel);
    // finished files land on the shelf when it's open, ready to drag somewhere
    runner.onFinished((outputs) => shelf.isOpen() && shelf.add(outputs));
    createTray();
    explorer.start();
    if (settings.get('shelfOpen')) shelf.open();
    // first run: show the settings window so it's clear Flick is running
    if (!settings.get('seenWelcome')) {
      settingsWindow.open();
      settings.set('seenWelcome', true);
    }

    // Shift + drag in Explorer: show the wheel under the cursor with options for the dragged files
    hook.on('drag', async (p) => {
      if (!settings.get('shiftDrag')) return;
      const dip = screen.screenToDipPoint({ x: p.x, y: p.y });
      const inExplorer = p.cls === 'CabinetWClass' || p.cls === 'ExploreWClass';
      const files = inExplorer ? await explorer.getSelection().catch(() => []) : [];
      wheel.show(dip, { mode: 'drag', files });
    });
    hook.on('up', () => wheel.pointerUp());
    hook.on('down', (p) => {
      if (wheel.isVisible() && !wheel.contains(screen.screenToDipPoint({ x: p.x, y: p.y }))) wheel.hide();
    });
    hook.start();

    globalShortcut.register(SHORTCUT, openWheelForSelection);

    if (process.env.FLICK_SELFTEST) require('./src/selftest')(process.env.FLICK_SELFTEST);
  });
}
