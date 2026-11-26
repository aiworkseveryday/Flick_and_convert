// Camera RAW (Sony ARW and others) to JPG.
//   full: LibRaw decodes the sensor data at full resolution (a few seconds per photo)
//   fast: pulls out the JPG preview the camera stored inside the RAW (instant, smaller)
const path = require('path');
const { BrowserWindow, ipcMain } = require('electron');
const sharp = require('sharp');
const { uniqueOutput } = require('./output');

let rawWin = null;
let ready = null;
let nextId = 1;
const pending = new Map();

ipcMain.on('raw-result', (_e, { id, ...result }) => {
  const p = pending.get(id);
  if (!p) return;
  pending.delete(id);
  clearTimeout(p.timer);
  if (result.error) p.reject(new Error(result.error));
  else p.resolve(result);
});

function ensureWindow() {
  if (rawWin && !rawWin.isDestroyed()) return ready;
  rawWin = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', '..', 'raw-preload.js'),
      contextIsolation: true,
      sandbox: false,
      backgroundThrottling: false,
    },
  });
  ready = new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('RAW decoder did not start')), 15000);
    ipcMain.once('raw-ready', () => {
      clearTimeout(t);
      resolve();
    });
  });
  rawWin.on('closed', () => {
    rawWin = null;
    for (const p of pending.values()) p.reject(new Error('RAW decoder stopped'));
    pending.clear();
  });
  rawWin.loadURL('flick://app/renderer/raw.html');
  return ready;
}

async function decode(file, mode, signal) {
  await ensureWindow();
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error('RAW decoding took too long'));
    }, 180000);
    pending.set(id, { resolve, reject, timer });
    if (signal)
      signal.addEventListener('abort', () => {
        // the decode can't be interrupted mid-way; restart the helper so it stops working
        if (rawWin) rawWin.destroy();
      }, { once: true });
    rawWin.webContents.send('raw-job', { id, file, mode });
  });
}

const toBuffer = (u8) => Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength);
// LibRaw flip values -> clockwise rotation
const FLIP_DEG = { 3: 180, 5: 270, 6: 90 };

async function convertRaw(file, mode, { signal } = {}) {
  const r = await decode(file, mode, signal);
  const out = await uniqueOutput(file, 'jpg');
  let img;
  if (r.kind === 'pixels') {
    // LibRaw already applied the camera's rotation
    img = sharp(toBuffer(r.data), { raw: { width: r.width, height: r.height, channels: r.colors } });
  } else {
    img = r.kind === 'jpeg' ? sharp(toBuffer(r.data)) : sharp(toBuffer(r.data), { raw: { width: r.width, height: r.height, channels: 3 } });
    const deg = FLIP_DEG[r.flip];
    if (deg) img = img.rotate(deg);
  }
  await img.jpeg({ quality: 93, mozjpeg: true }).toFile(out);
  return out;
}

module.exports = { convertRaw };
