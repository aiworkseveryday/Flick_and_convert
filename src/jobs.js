// Runs a ring action over the selected files and reports progress.
const { convertImage, shrinkImage } = require('./convert/image');
const { convertRaw } = require('./convert/raw');
const { toAudio, toMp4, toGif, shrinkVideo } = require('./convert/media');
const { wordToPdf, pdfToWord } = require('./convert/word');
const { lockPdf, mergePdfs, splitPdf } = require('./convert/qpdf');
const { pdfToImages, imagesToPdf } = require('./convert/pdf');
const { zip, extract } = require('./convert/archive');
const { removeBackground } = require('./convert/bg');
const { imageToText, pdfToText } = require('./convert/ocr');
const { shrinkPdf } = require('./convert/pdfshrink');
const { cancelled } = require('./errors');

async function askNewPassword(ask, title, message) {
  const pw = await ask({ title, message, confirm: true });
  if (!pw) throw cancelled();
  return pw;
}

// Actions that take all the selected files at once: handler(files, opts) -> output path
const COMBINED = {
  zip: (files, o) => zip(files, o),
  'zip-lock': async (files, o) => {
    const password = await askNewPassword(o.ask, 'Lock the ZIP', "Choose a password. You'll need it to open the ZIP.");
    return zip(files, { ...o, password });
  },
  'pdf-merge': (files) => mergePdfs(files),
  'img-pdf': (files, o) => imagesToPdf(files, o),
  'pdf-lock': async (files, o) => {
    const password = await askNewPassword(
      o.ask,
      files.length > 1 ? `Lock ${files.length} PDFs` : 'Lock the PDF',
      "Choose a password. You'll need it to open the PDF.",
    );
    let last;
    for (let i = 0; i < files.length; i++) {
      if (o.signal.aborted) throw cancelled();
      last = await lockPdf(files[i], password);
      o.onProgress((i + 1) / files.length);
    }
    return last;
  },
};

// Actions applied to each file in turn: handler(file, opts) -> output path
function perFile(actionId) {
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
    'word-pdf': (f, o) => wordToPdf(f, o),
    'pdf-word': (f, o) => pdfToWord(f, o),
    'pdf-images': (f, o) => pdfToImages(f, o),
    'pdf-split': (f) => splitPdf(f),
    unzip: (f, o) => extract(f, o),
    'img-bg': (f, o) => removeBackground(f, o),
    'img-ocr': (f, o) => imageToText(f, o),
    'pdf-text': (f, o) => pdfToText(f, o),
    'pdf-shrink-smaller': (f, o) => shrinkPdf(f, 'smaller', o),
    'pdf-shrink-smallest': (f, o) => shrinkPdf(f, 'smallest', o),
  }[actionId];
  if (fixed) return fixed;
  let m = /^video-shrink-(\d+)$/.exec(actionId);
  if (m) return (f, o) => shrinkVideo(f, Number(m[1]), o);
  m = /^img-shrink-(\d+)$/.exec(actionId);
  if (m) return (f, o) => shrinkImage(f, Number(m[1]), o);
  return null;
}

// ask(info) -> password or null (opens the password window)
async function runJob(actionId, files, signal, report, ask) {
  if (COMBINED[actionId]) {
    let precise = false;
    const send = (f) => report({ fraction: f, indeterminate: !precise, label: precise ? `${Math.floor(f * 100)}%` : '' });
    send(0);
    const out = await COMBINED[actionId](files, {
      signal,
      ask,
      onProgress: (f) => {
        precise = true;
        send(f);
      },
    });
    return [out];
  }

  const handler = perFile(actionId);
  if (!handler) throw new Error('Not available yet');
  const total = files.length;
  const outputs = [];
  const errors = [];

  for (let i = 0; i < total; i++) {
    if (signal.aborted) throw cancelled();
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
          ask,
          onProgress: (f) => {
            precise = true;
            send(f);
          },
        }),
      );
    } catch (err) {
      if (signal.aborted || (err && err.code === 'CANCELLED')) throw err;
      errors.push(err);
    }
    send(1);
  }
  if (outputs.length === 0 && errors.length) throw errors[0];
  return outputs;
}

module.exports = { runJob };
