const fs = require('fs/promises');
const path = require('path');
const sharp = require('sharp');
const heicConvert = require('heic-convert');
const { uniqueOutput } = require('./output');

const HEIC = ['.heic', '.heif'];

// Returns something sharp can read. sharp's bundled libvips cannot decode HEIC (HEVC),
// so iPhone photos go through heic-convert first.
async function sharpInput(file) {
  if (HEIC.includes(path.extname(file).toLowerCase())) {
    const buffer = await heicConvert({ buffer: await fs.readFile(file), format: 'PNG' });
    return sharp(Buffer.from(buffer));
  }
  return sharp(file, { animated: false, limitInputPixels: false });
}

async function convertImage(file, format) {
  const out = await uniqueOutput(file, format);
  let img = (await sharpInput(file)).rotate(); // apply EXIF orientation
  if (format === 'jpg') {
    img = img.flatten({ background: '#ffffff' }).jpeg({ quality: 92, mozjpeg: true });
  } else if (format === 'png') {
    img = img.png({ compressionLevel: 8 });
  } else if (format === 'webp') {
    img = img.webp({ quality: 90 });
  }
  await img.keepExif().toFile(out);
  return out;
}

// Highest-quality JPG that fits under targetKB; shrinks the dimensions if quality alone isn't enough.
async function shrinkImage(file, targetKB, { onProgress } = {}) {
  const limit = targetKB * 1024;
  const stat = await fs.stat(file);
  if (stat.size <= limit) throw new Error(`Already smaller than ${label(targetKB)}`);

  const decoded = await (await sharpInput(file)).rotate().flatten({ background: '#ffffff' }).raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = decoded.info;
  const encode = (scale, quality) => {
    let img = sharp(decoded.data, { raw: { width, height, channels } });
    if (scale < 1) img = img.resize(Math.max(1, Math.round(width * scale)));
    // plain libjpeg is several times faster than mozjpeg, which matters inside the search loop
    return img.jpeg({ quality, optimiseCoding: true, chromaSubsampling: '4:2:0' }).toBuffer();
  };

  let best = null;
  for (let scale = 1, step = 0; scale > 0.05 && !best; scale *= 0.8, step++) {
    let lo = 40;
    let hi = 92;
    while (lo <= hi) {
      const q = Math.floor((lo + hi) / 2);
      const buf = await encode(scale, q);
      if (buf.length <= limit) {
        best = buf;
        lo = q + 1;
      } else hi = q - 1;
    }
    if (onProgress) onProgress(Math.min(0.95, (step + 1) * 0.2));
  }
  if (!best) throw new Error(`Couldn't get it under ${label(targetKB)}`);
  const out = await uniqueOutput(file, 'jpg', ` (${label(targetKB).replace(' ', '')})`);
  await fs.writeFile(out, best);
  return out;
}

const label = (kb) => (kb >= 1024 ? `${kb / 1024} MB` : `${kb} KB`);

module.exports = { convertImage, shrinkImage };
