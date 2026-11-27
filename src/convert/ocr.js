// Text from images (Tesseract OCR, English, offline) and from PDFs (their text layer, or OCR for scans).
// Each result is saved as a .txt next to the file; the runner also copies it to the clipboard.
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { createWorker } = require('tesseract.js');
const helper = require('../helper');
const { sharpInput } = require('./image');
const { uniqueOutput } = require('./output');
const { cancelled } = require('../errors');

const LANG_PATH = path.join(path.dirname(require.resolve('@tesseract.js-data/eng/package.json')), '4.0.0_best_int');

async function withTesseract(signal, fn) {
  const worker = await createWorker('eng', 1, { langPath: LANG_PATH, gzip: true, cacheMethod: 'none' });
  const stop = () => worker.terminate();
  if (signal) signal.addEventListener('abort', stop, { once: true });
  try {
    return await fn(worker);
  } catch (e) {
    if (signal && signal.aborted) throw cancelled();
    throw e;
  } finally {
    if (signal) signal.removeEventListener('abort', stop);
    await worker.terminate().catch(() => {});
  }
}

// Tidies Tesseract's output: no trailing spaces, at most one blank line in a row.
const tidy = (text) =>
  text
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

async function readImage(worker, input) {
  // sharp reads every format Flick handles (HEIC included) and applies the EXIF rotation
  const png = await (await sharpInput(input)).rotate().flatten({ background: '#ffffff' }).png().toBuffer();
  const { data } = await worker.recognize(png);
  return tidy(data.text);
}

async function save(file, text) {
  const out = await uniqueOutput(file, 'txt');
  await fs.writeFile(out, text.replace(/\r?\n/g, '\r\n'), 'utf8');
  return out;
}

async function imageToText(file, { onProgress, signal } = {}) {
  const text = await withTesseract(signal, (w) => readImage(w, file));
  if (onProgress) onProgress(0.95);
  if (text.replace(/\W/g, '').length < 2) throw new Error('No text found in this image');
  return save(file, text);
}

async function pdfToText(file, { onProgress, signal } = {}) {
  const half = (f) => onProgress && onProgress(f * 0.5);
  const { pages } = await helper.call('pdf-text', { file }, { onProgress: half, signal });
  const letters = pages.join('').replace(/\W/g, '').length;
  let text;
  if (letters >= 20 * pages.length) {
    text = pages.map((p, i) => (pages.length > 1 ? `--- Page ${i + 1} ---\n${p}` : p)).join('\n\n');
  } else {
    // a scan: draw the pages at 216 dpi and read them with OCR
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'flick-ocr-'));
    try {
      const { outputs } = await helper.call(
        'pdf-images',
        { file, dir: tmp, base: 'page', scale: 3 },
        { onProgress: (f) => half(f * 0.3), signal, timeoutMs: 10 * 60000 },
      );
      text = await withTesseract(signal, async (w) => {
        const parts = [];
        for (let i = 0; i < outputs.length; i++) {
          if (signal && signal.aborted) throw cancelled();
          const t = await readImage(w, outputs[i]);
          parts.push(outputs.length > 1 ? `--- Page ${i + 1} ---\n${t}` : t);
          if (onProgress) onProgress(0.15 + (0.8 * (i + 1)) / outputs.length);
        }
        return parts.join('\n\n');
      });
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  }
  if (text.replace(/--- Page \d+ ---/g, '').replace(/\W/g, '').length < 2) throw new Error('No text found in this PDF');
  return save(file, text);
}

module.exports = { imageToText, pdfToText };
