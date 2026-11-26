// Video and audio conversions with FFmpeg, reporting real progress.
const { spawn } = require('child_process');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { uniqueOutput } = require('./output');

// inside a packaged app the binary lives in app.asar.unpacked
const FFMPEG = require('ffmpeg-static').replace('app.asar', 'app.asar.unpacked');

function run(args, { duration, onProgress, signal } = {}) {
  return new Promise((resolve, reject) => {
    if (signal && signal.aborted) return reject(new Error('Cancelled'));
    const proc = spawn(FFMPEG, ['-hide_banner', '-y', '-nostats', '-progress', 'pipe:1', ...args], { windowsHide: true });
    let errTail = '';
    let outBuf = '';
    const kill = () => proc.kill('SIGKILL');
    if (signal) signal.addEventListener('abort', kill, { once: true });

    proc.stdout.on('data', (d) => {
      outBuf += d.toString();
      let nl;
      while ((nl = outBuf.indexOf('\n')) >= 0) {
        const line = outBuf.slice(0, nl).trim();
        outBuf = outBuf.slice(nl + 1);
        const m = /^out_time_(?:us|ms)=(\d+)/.exec(line);
        if (m && duration && onProgress) onProgress(Math.min(1, Number(m[1]) / 1e6 / duration));
      }
    });
    proc.stderr.on('data', (d) => {
      errTail = (errTail + d.toString()).slice(-3000);
    });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (signal) signal.removeEventListener('abort', kill);
      if (signal && signal.aborted) return reject(new Error('Cancelled'));
      if (code === 0) return resolve();
      const lines = errTail.trim().split(/\r?\n/).filter(Boolean);
      reject(new Error(lines[lines.length - 1] || `FFmpeg failed (${code})`));
    });
  });
}

// Reads duration and which streams exist from FFmpeg's banner.
function probe(file) {
  return new Promise((resolve, reject) => {
    const proc = spawn(FFMPEG, ['-hide_banner', '-i', file], { windowsHide: true });
    let err = '';
    proc.stderr.on('data', (d) => (err += d.toString()));
    proc.on('error', reject);
    proc.on('close', () => {
      const d = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(err);
      const v = /Stream #\S+.*?Video:.*?(\d{2,5})x(\d{2,5})/.exec(err.replace(/Video: (mjpeg|png).*attached pic.*/g, ''));
      resolve({
        duration: d ? Number(d[1]) * 3600 + Number(d[2]) * 60 + Number(d[3]) : 0,
        hasAudio: /Stream #\S+.*Audio:/.test(err),
        hasVideo: !!v,
        width: v ? Number(v[1]) : 0,
        height: v ? Number(v[2]) : 0,
      });
    });
  });
}

async function cleanupOnFail(out, fn) {
  try {
    return await fn();
  } catch (err) {
    await fs.rm(out, { force: true });
    throw err;
  }
}

const AUDIO = {
  mp3: { ext: 'mp3', args: ['-c:a', 'libmp3lame', '-q:a', '2'] },
  wav: { ext: 'wav', args: ['-c:a', 'pcm_s16le'] },
  aac: { ext: 'm4a', args: ['-c:a', 'aac', '-b:a', '192k'] },
};

async function toAudio(file, format, { onProgress, signal } = {}) {
  const info = await probe(file);
  if (!info.hasAudio) throw new Error('This file has no sound to extract');
  const spec = AUDIO[format];
  const out = await uniqueOutput(file, spec.ext);
  await cleanupOnFail(out, () =>
    run(['-i', file, '-vn', '-map', '0:a:0', ...spec.args, out], { duration: info.duration, onProgress, signal }),
  );
  return out;
}

async function toMp4(file, { onProgress, signal } = {}) {
  const info = await probe(file);
  const out = await uniqueOutput(file, 'mp4');
  await cleanupOnFail(out, () =>
    run(
      ['-i', file, '-c:v', 'libx264', '-preset', 'medium', '-crf', '21', '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', out],
      { duration: info.duration, onProgress, signal },
    ),
  );
  return out;
}

async function toGif(file, { onProgress, signal } = {}) {
  const info = await probe(file);
  const out = await uniqueOutput(file, 'gif');
  const filter = 'fps=12,scale=480:-2:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4';
  await cleanupOnFail(out, () =>
    run(['-i', file, '-vf', filter, '-loop', '0', out], { duration: info.duration, onProgress, signal }),
  );
  return out;
}

// Two-pass H.264 aimed at a file size, e.g. 16 MB for WhatsApp.
async function shrinkVideo(file, targetMB, { onProgress, signal } = {}) {
  const info = await probe(file);
  if (!info.duration) throw new Error("Couldn't read the video length");
  const targetBytes = targetMB * 1024 * 1024;
  const stat = await fs.stat(file);
  if (stat.size <= targetBytes) throw new Error(`Already smaller than ${targetMB} MB`);

  const totalKbps = (targetBytes * 8 * 0.95) / info.duration / 1000; // 5% for container overhead
  const audioKbps = info.hasAudio ? (totalKbps > 800 ? 128 : totalKbps > 300 ? 96 : 64) : 0;
  const videoKbps = Math.floor(totalKbps - audioKbps);
  if (videoKbps < 60) throw new Error(`Too long to fit in ${targetMB} MB`);

  // lower bitrates look better at a smaller resolution
  const maxH = videoKbps < 400 ? 480 : videoKbps < 1000 ? 720 : videoKbps < 2500 ? 1080 : 0;
  const vf = maxH && info.height > maxH ? ['-vf', `scale=-2:${maxH}`] : [];
  const out = await uniqueOutput(file, 'mp4', ` (${targetMB}MB)`);
  const passlog = path.join(os.tmpdir(), `flick-pass-${process.pid}-${Date.now()}`);
  const common = ['-c:v', 'libx264', '-preset', 'medium', '-b:v', `${videoKbps}k`, '-pix_fmt', 'yuv420p', ...vf, '-passlogfile', passlog];
  const half = (offset) => (f) => onProgress && onProgress(offset + f / 2);

  try {
    await cleanupOnFail(out, async () => {
      await run(['-i', file, ...common, '-pass', '1', '-an', '-f', 'null', 'NUL'], { duration: info.duration, onProgress: half(0), signal });
      await run(
        ['-i', file, ...common, '-pass', '2', ...(info.hasAudio ? ['-c:a', 'aac', '-b:a', `${audioKbps}k`] : ['-an']), '-movflags', '+faststart', out],
        { duration: info.duration, onProgress: half(0.5), signal },
      );
    });
  } finally {
    const dir = path.dirname(passlog);
    const base = path.basename(passlog);
    for (const f of await fs.readdir(dir).catch(() => [])) if (f.startsWith(base)) await fs.rm(path.join(dir, f), { force: true });
  }
  return out;
}

module.exports = { toAudio, toMp4, toGif, shrinkVideo, probe };
