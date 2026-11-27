// Makes a PDF smaller by recompressing its photos as smaller JPGs (pdf-lib + sharp).
// Text, vector drawings and fonts are left exactly as they are, so text stays sharp and selectable.
const fs = require('fs/promises');
const zlib = require('zlib');
const sharp = require('sharp');
const { PDFDocument, PDFName, PDFRawStream, PDFArray, PDFNumber, PDFDict, PDFRef } = require('pdf-lib');
const { isLocked } = require('./qpdf');
const { uniqueOutput } = require('./output');
const { cancelled } = require('../errors');

const LEVELS = {
  smaller: { maxSide: 2000, quality: 72, suffix: ' (smaller)' },
  smallest: { maxSide: 1300, quality: 50, suffix: ' (smallest)' },
};
const MIN_BYTES = 20 * 1024; // leave little images (logos, icons) alone

const nameOf = (v) => (v instanceof PDFName ? v.asString().replace(/^\//, '') : null);

function filters(dict) {
  const f = dict.get(PDFName.of('Filter'));
  if (!f) return [];
  if (f instanceof PDFArray) return f.asArray().map(nameOf);
  return [nameOf(f)];
}

// Number of colour channels for the colour spaces this handles; null for the rest (Indexed, Lab, ...).
function channelsOf(context, cs) {
  if (cs instanceof PDFRef) cs = context.lookup(cs);
  const n = nameOf(cs);
  if (n === 'DeviceRGB' || n === 'CalRGB') return 3;
  if (n === 'DeviceGray' || n === 'CalGray') return 1;
  if (n === 'DeviceCMYK') return 4;
  if (cs instanceof PDFArray && nameOf(cs.get(0)) === 'ICCBased') {
    const profile = context.lookup(cs.get(1));
    const N = profile && profile.dict ? profile.dict.get(PDFName.of('N')) : null;
    return N instanceof PDFNumber ? N.asNumber() : null;
  }
  return null;
}

// Decodes one image XObject to something sharp can read, or null if it's a kind left alone.
function sharpFor(context, stream) {
  const d = stream.dict;
  if (d.get(PDFName.of('ImageMask')) || d.get(PDFName.of('Decode')) || d.get(PDFName.of('Mask'))) return null;
  const bpc = d.get(PDFName.of('BitsPerComponent'));
  if (!(bpc instanceof PDFNumber) || bpc.asNumber() !== 8) return null;
  const f = filters(d);
  const channels = channelsOf(context, d.get(PDFName.of('ColorSpace')));
  if (!channels) return null;

  if (f.length === 1 && f[0] === 'DCTDecode') return sharp(Buffer.from(stream.contents));
  if (f.length === 1 && f[0] === 'FlateDecode' && !d.get(PDFName.of('DecodeParms')) && channels !== 4) {
    const w = d.get(PDFName.of('Width')).asNumber();
    const h = d.get(PDFName.of('Height')).asNumber();
    const raw = zlib.inflateSync(Buffer.from(stream.contents));
    if (raw.length < w * h * channels) return null;
    return sharp(raw.subarray(0, w * h * channels), { raw: { width: w, height: h, channels } });
  }
  return null;
}

async function shrinkPdf(file, level, { onProgress, signal } = {}) {
  const { maxSide, quality, suffix } = LEVELS[level];
  if (await isLocked(file)) throw new Error('This PDF is password protected');
  const original = await fs.readFile(file);
  const doc = await PDFDocument.load(original, { updateMetadata: false });
  const context = doc.context;

  // soft masks (transparency) are kept lossless: JPG noise would show as ragged edges
  const masks = new Set();
  const images = [];
  for (const [ref, obj] of context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream)) continue;
    const sm = obj.dict.get(PDFName.of('SMask'));
    if (sm instanceof PDFRef) masks.add(sm.toString());
    if (nameOf(obj.dict.get(PDFName.of('Subtype'))) === 'Image' && obj.contents.length >= MIN_BYTES) images.push([ref, obj]);
  }

  let changed = 0;
  for (let i = 0; i < images.length; i++) {
    if (signal && signal.aborted) throw cancelled();
    const [ref, stream] = images[i];
    if (!masks.has(ref.toString())) {
      try {
        const img = sharpFor(context, stream);
        if (img) {
          const meta = await img.metadata();
          const gray = meta.channels === 1 || meta.space === 'b-w';
          let out = img.resize(maxSide, maxSide, { fit: 'inside', withoutEnlargement: true });
          out = gray ? out.toColourspace('b-w') : out.toColourspace('srgb');
          const { data, info } = await out.jpeg({ quality, mozjpeg: true }).toBuffer({ resolveWithObject: true });
          if (data.length < stream.contents.length * 0.9) {
            const dict = PDFDict.withContext(context);
            for (const [k, v] of stream.dict.entries()) {
              const key = k.asString();
              if (!['/Filter', '/DecodeParms', '/Length', '/Width', '/Height', '/ColorSpace', '/BitsPerComponent'].includes(key))
                dict.set(k, v);
            }
            dict.set(PDFName.of('Filter'), PDFName.of('DCTDecode'));
            dict.set(PDFName.of('Width'), PDFNumber.of(info.width));
            dict.set(PDFName.of('Height'), PDFNumber.of(info.height));
            dict.set(PDFName.of('BitsPerComponent'), PDFNumber.of(8));
            dict.set(PDFName.of('ColorSpace'), PDFName.of(info.channels === 1 ? 'DeviceGray' : 'DeviceRGB'));
            context.assign(ref, PDFRawStream.of(dict, data));
            changed++;
          }
        }
      } catch {
        // an image Flick can't read is simply kept as it was
      }
    }
    if (onProgress) onProgress(((i + 1) / images.length) * 0.9);
  }

  const bytes = await doc.save({ useObjectStreams: true });
  if (bytes.length > original.length * 0.95) {
    throw new Error(changed ? 'Only a tiny saving was possible, so nothing was saved' : 'This PDF has no photos to shrink');
  }
  const out = await uniqueOutput(file, 'pdf', suffix);
  await fs.writeFile(out, bytes);
  return out;
}

module.exports = { shrinkPdf };
