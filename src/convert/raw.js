// Camera RAW (Sony ARW and others) to JPG.
//   full: LibRaw decodes the sensor data at full resolution (a few seconds per photo)
//   fast: pulls out the JPG preview the camera stored inside the RAW
const sharp = require('sharp');
const helper = require('../helper');
const { uniqueOutput } = require('./output');

const toBuffer = (u8) => Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength);
// LibRaw flip values -> clockwise rotation
const FLIP_DEG = { 3: 180, 5: 270, 6: 90 };

async function convertRaw(file, mode, { signal } = {}) {
  const r = await helper.call('raw', { file, mode }, { signal, timeoutMs: 180000 });
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
