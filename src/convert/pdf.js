// PDF pages to JPGs (drawn by pdf.js in the helper window) and images to one PDF (pdf-lib).
const fs = require('fs/promises');
const path = require('path');
const sharp = require('sharp');
const heicConvert = require('heic-convert');
const { PDFDocument } = require('pdf-lib');
const helper = require('../helper');
const { uniqueOutput } = require('./output');
const { cancelled } = require('../errors');

async function newFolder(base) {
  for (let n = 0; ; n++) {
    const dir = n === 0 ? base : `${base} (${n})`;
    try {
      await fs.mkdir(dir);
      return dir;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
    }
  }
}

async function pdfToImages(file, { onProgress, signal } = {}) {
  const name = path.basename(file, path.extname(file));
  const dir = await newFolder(path.join(path.dirname(file), `${name} images`));
  try {
    await helper.call('pdf-images', { file, dir, base: name }, { onProgress, signal, timeoutMs: 10 * 60000 });
  } catch (e) {
    await fs.rm(dir, { recursive: true, force: true });
    throw e;
  }
  return dir;
}

const byName = (a, b) => path.basename(a).localeCompare(path.basename(b), undefined, { numeric: true, sensitivity: 'base' });
const A4_WIDTH = 595; // points

// One page per image, in name order. Each page is A4 width with the image's own proportions.
async function imagesToPdf(files, { onProgress, signal } = {}) {
  const sorted = [...files].sort(byName);
  const doc = await PDFDocument.create();
  for (let i = 0; i < sorted.length; i++) {
    if (signal && signal.aborted) throw cancelled();
    const f = sorted[i];
    const input = /\.(heic|heif)$/i.test(f)
      ? Buffer.from(await heicConvert({ buffer: await fs.readFile(f), format: 'JPEG', quality: 0.92 }))
      : f;
    const { data, info } = await sharp(input, { animated: false })
      .rotate()
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 90 })
      .toBuffer({ resolveWithObject: true });
    const img = await doc.embedJpg(data);
    const h = (A4_WIDTH * info.height) / info.width;
    doc.addPage([A4_WIDTH, h]).drawImage(img, { x: 0, y: 0, width: A4_WIDTH, height: h });
    if (onProgress) onProgress((i + 1) / sorted.length);
  }
  const out =
    sorted.length === 1 ? await uniqueOutput(sorted[0], 'pdf') : await uniqueOutput(sorted[0], 'pdf', ` (+${sorted.length - 1})`);
  await fs.writeFile(out, await doc.save());
  return out;
}

module.exports = { pdfToImages, imagesToPdf };
