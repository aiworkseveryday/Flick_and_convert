// Main-process side of background removal (see bg-worker.js).
const fs = require('fs/promises');
const path = require('path');
const { utilityProcess } = require('electron');
const { uniqueOutput } = require('./output');
const { cancelled } = require('../errors');

let worker = null;

function ensureWorker() {
  if (worker) return worker;
  const proc = utilityProcess.fork(path.join(__dirname, 'bg-worker.js'), [], { serviceName: 'Flick background removal' });
  proc.on('exit', () => {
    if (worker === proc) worker = null;
    if (proc.job) proc.job.reject(proc.job.aborted ? cancelled() : new Error('Background removal stopped unexpectedly'));
  });
  proc.on('message', (msg) => {
    const job = proc.job;
    if (!job) return;
    if (msg.type === 'progress') return job.onProgress && job.onProgress(msg.fraction, msg.label);
    proc.job = null;
    if (msg.type === 'done') job.resolve(msg.out);
    else job.reject(new Error(msg.message));
  });
  worker = proc;
  return proc;
}

// photo.jpg -> "photo (no bg).png" with a transparent background.
async function removeBackground(file, { onProgress, signal } = {}) {
  if (signal && signal.aborted) throw cancelled();
  const out = await uniqueOutput(file, 'png', ' (no bg)');
  const proc = ensureWorker();
  // the model gives no progress of its own, so creep towards 90% while it works (about 30 s)
  let shown = 0;
  let creep = null;
  const report = (f) => {
    shown = Math.max(shown, f);
    if (onProgress) onProgress(shown);
  };
  try {
    return await new Promise((resolve, reject) => {
      proc.job = {
        resolve,
        reject,
        aborted: false,
        onProgress: (f) => {
          report(f);
          if (f >= 0.2 && f < 0.9 && !creep) creep = setInterval(() => report(shown + (0.88 - shown) * 0.03), 500);
          if (f >= 0.9) clearInterval(creep);
        },
      };
      if (signal)
        signal.addEventListener(
          'abort',
          () => {
            if (!proc.job) return;
            proc.job.aborted = true;
            proc.kill(); // the model can't be interrupted part-way
          },
          { once: true },
        );
      proc.postMessage({ file, out });
    });
  } catch (e) {
    await fs.rm(out, { force: true });
    throw e;
  } finally {
    clearInterval(creep);
  }
}

function stop() {
  if (worker) worker.kill();
}

module.exports = { removeBackground, stop };
