// Main-process side of the hidden helper window (renderer/helper.html).
const path = require('path');
const { BrowserWindow, ipcMain } = require('electron');
const { cancelled } = require('./errors');

let win = null;
let ready = null;
let nextId = 1;
const pending = new Map();

ipcMain.on('helper-result', (_e, { id, ...result }) => {
  const p = pending.get(id);
  if (!p) return;
  pending.delete(id);
  clearTimeout(p.timer);
  if (result.error) p.reject(new Error(result.error));
  else p.resolve(result);
});

ipcMain.on('helper-progress', (_e, { id, fraction }) => {
  const p = pending.get(id);
  if (p && p.onProgress) p.onProgress(fraction);
});

function ensureWindow() {
  if (win && !win.isDestroyed()) return ready;
  win = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'helper-preload.js'),
      contextIsolation: true,
      sandbox: false,
      backgroundThrottling: false,
    },
  });
  ready = new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Helper did not start')), 15000);
    ipcMain.once('helper-ready', () => {
      clearTimeout(t);
      resolve();
    });
  });
  const thisWin = win;
  win.on('closed', () => {
    if (win === thisWin) win = null;
    for (const [id, p] of pending) {
      clearTimeout(p.timer);
      p.reject(p.aborted ? cancelled() : new Error('Helper stopped'));
      pending.delete(id);
    }
  });
  win.loadURL('flick://app/renderer/helper.html');
  return ready;
}

// Runs a task in the helper window. Cancelling restarts the helper, since WebAssembly work
// can't be interrupted part-way.
async function call(type, payload, { onProgress, signal, timeoutMs = 300000 } = {}) {
  if (signal && signal.aborted) throw cancelled();
  await ensureWindow();
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const entry = { resolve, reject, onProgress, aborted: false };
    entry.timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error('This took too long and was stopped'));
      if (win) win.destroy();
    }, timeoutMs);
    pending.set(id, entry);
    if (signal)
      signal.addEventListener(
        'abort',
        () => {
          entry.aborted = true;
          if (win) win.destroy();
        },
        { once: true },
      );
    win.webContents.send('helper-job', { id, type, payload });
  });
}

module.exports = { call };
