// Runs a ring action over the selected files and reports progress.
const { convertImage, shrinkImage } = require('./convert/image');
const { convertRaw } = require('./convert/raw');
const { toAudio, toMp4, toGif, shrinkVideo } = require('./convert/media');

// handler(file, { onProgress(0..1), signal }) -> output path
function handlerFor(actionId) {
  const fixed = {
    'img-jpg': (f) => convertImage(f, 'jpg'),
    'img-png': (f) => convertImage(f, 'png'),
    'img-webp': (f) => convertImage(f, 'webp'),
    'raw-jpg-full': (f, o) => convertRaw(f, 'full', o),
    'raw-jpg-fast': (f, o) => convertRaw(f, 'fast', o),
    'media-mp3': (f, o) => toAudio(f, 'mp3', o),
    'media-wav': (f, o) => toAudio(f, 'wav', o),
    'media-aac': (f, o) => toAudio(f, 'aac', o),
    'video-mp4': (f, o) => toMp4(f, o),
    'video-gif': (f, o) => toGif(f, o),
  }[actionId];
  if (fixed) return fixed;
  let m = /^video-shrink-(\d+)$/.exec(actionId);
  if (m) return (f, o) => shrinkVideo(f, Number(m[1]), o);
  m = /^img-shrink-(\d+)$/.exec(actionId);
  if (m) return (f, o) => shrinkImage(f, Number(m[1]), o);
  return null;
}

async function runJob(actionId, files, signal, report) {
  const handler = handlerFor(actionId);
  if (!handler) throw new Error('Not available yet');
  const total = files.length;
  const outputs = [];
  const errors = [];

  for (let i = 0; i < total; i++) {
    if (signal.aborted) throw new Error('Cancelled');
    let precise = false;
    const send = (inner) => {
      const fraction = (i + inner) / total;
      report({
        fraction,
        indeterminate: total === 1 && !precise,
        label: total > 1 ? `${i + (inner >= 1 ? 1 : 0)}/${total}` : precise ? `${Math.floor(fraction * 100)}%` : '',
      });
    };
    send(0);
    try {
      outputs.push(
        await handler(files[i], {
          signal,
          onProgress: (f) => {
            precise = true;
            send(f);
          },
        }),
      );
    } catch (err) {
      if (signal.aborted) throw err;
      errors.push(err);
    }
    send(1);
  }
  if (outputs.length === 0 && errors.length) throw errors[0];
  return outputs;
}

module.exports = { runJob };
