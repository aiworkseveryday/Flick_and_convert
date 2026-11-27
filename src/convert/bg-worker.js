// Background removal (BiRefNet, ONNX Runtime on the CPU). Runs in an Electron utility process so the
// heavy work never blocks the app, and Stop can simply end the process. The model stays loaded
// between jobs and the process exits on its own after a few idle minutes.
const fs = require('fs/promises');
const path = require('path');
const sharp = require('sharp');
const ort = require('onnxruntime-node');

const MODEL = path.join(__dirname, '..', '..', 'models', 'birefnet-lite-int8.onnx');
const SIZE = 1024; // the model's input size
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];
const IDLE_MS = 3 * 60000;

let session = null;
let idleTimer = null;
const send = (msg) => process.parentPort.postMessage(msg);

async function load() {
  if (!session) session = await ort.InferenceSession.create(MODEL, { executionProviders: ['cpu'], graphOptimizationLevel: 'all' });
  return session;
}

async function decode(file) {
  if (/\.(heic|heif)$/i.test(file)) {
    const heicConvert = require('heic-convert');
    return sharp(Buffer.from(await heicConvert({ buffer: await fs.readFile(file), format: 'PNG' })));
  }
  return sharp(file, { animated: false, limitInputPixels: false });
}

async function removeBackground({ file, out }) {
  send({ type: 'progress', fraction: 0.05, label: session ? 'Finding the subject' : 'Loading the model' });
  const s = await load();
  const img = (await decode(file)).rotate();
  const input = await img.clone().removeAlpha().resize(SIZE, SIZE, { fit: 'fill' }).raw().toBuffer();
  const plane = SIZE * SIZE;
  const tensor = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) for (let c = 0; c < 3; c++) tensor[c * plane + i] = (input[i * 3 + c] / 255 - MEAN[c]) / STD[c];

  send({ type: 'progress', fraction: 0.2, label: 'Finding the subject' });
  const result = await s.run({ [s.inputNames[0]]: new ort.Tensor('float32', tensor, [1, 3, SIZE, SIZE]) });
  const logits = result[s.outputNames[s.outputNames.length - 1]].data;
  const small = Buffer.alloc(plane);
  for (let i = 0; i < plane; i++) small[i] = Math.round(255 / (1 + Math.exp(-logits[i])));

  send({ type: 'progress', fraction: 0.9, label: 'Saving' });
  const { data, info } = await img.clone().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const mask = await sharp(small, { raw: { width: SIZE, height: SIZE, channels: 1 } })
    .resize(info.width, info.height, { fit: 'fill', kernel: 'cubic' })
    .extractChannel(0)
    .raw()
    .toBuffer();
  for (let i = 0, n = info.width * info.height; i < n; i++) {
    const a = mask[i];
    data[i * 4 + 3] = a;
    // hidden pixels keep no colour, which makes the PNG several times smaller
    if (a === 0) data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = 0;
  }
  await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png({ compressionLevel: 6 })
    .toFile(out);
  return out;
}

process.parentPort.on('message', async ({ data: job }) => {
  clearTimeout(idleTimer);
  try {
    send({ type: 'done', out: await removeBackground(job) });
  } catch (e) {
    send({ type: 'error', message: String((e && e.message) || e) });
  }
  idleTimer = setTimeout(() => process.exit(0), IDLE_MS);
});
