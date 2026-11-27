// Decodes camera RAW files with LibRaw (WebAssembly).
import LibRaw from '../node_modules/libraw-wasm/dist/index.js';

const SETTINGS = {
  useCameraWb: true, // colours as the camera saw them
  outputColor: 1, // sRGB
  outputBps: 8,
  userQual: 3, // AHD demosaic: good quality, reasonable speed
  highlight: 0,
};

export async function run({ file, mode }) {
  const raw = new LibRaw();
  try {
    await raw.open(await window.helperApi.read(file), SETTINGS);
    if (mode === 'fast') {
      const meta = await raw.metadata();
      const thumb = await raw.thumbnailData();
      if (!thumb || !thumb.data || !thumb.data.length) throw new Error('This RAW file has no preview inside');
      return {
        kind: thumb.format,
        width: thumb.width,
        height: thumb.height,
        flip: meta && typeof meta.flip === 'number' ? meta.flip : 0,
        data: thumb.data,
      };
    }
    const img = await raw.imageData();
    if (!img || !img.data) throw new Error('Could not decode this RAW file');
    return { kind: 'pixels', width: img.width, height: img.height, colors: img.colors, bits: img.bits, data: img.data };
  } finally {
    raw.dispose();
  }
}
