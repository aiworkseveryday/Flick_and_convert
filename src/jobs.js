// Runs a ring action over the selected files and reports progress (0..1).
const { convertImage } = require('./convert/image');

const HANDLERS = {
  'img-jpg': (file) => convertImage(file, 'jpg'),
  'img-png': (file) => convertImage(file, 'png'),
  'img-webp': (file) => convertImage(file, 'webp'),
};

async function runJob(actionId, files, onProgress) {
  const handler = HANDLERS[actionId];
  if (!handler) throw new Error('Not available yet');
  const outputs = [];
  const errors = [];
  onProgress({ done: 0, total: files.length, fraction: 0 });
  for (let i = 0; i < files.length; i++) {
    try {
      outputs.push(await handler(files[i]));
    } catch (err) {
      errors.push(err);
    }
    onProgress({ done: i + 1, total: files.length, fraction: (i + 1) / files.length });
  }
  if (outputs.length === 0 && errors.length) throw errors[0];
  return outputs;
}

module.exports = { runJob };
