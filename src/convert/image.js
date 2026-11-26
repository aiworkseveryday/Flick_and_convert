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

module.exports = { convertImage };
