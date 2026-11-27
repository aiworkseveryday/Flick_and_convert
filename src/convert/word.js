// Word <-> PDF through the installed Microsoft Word (see word.ps1).
const { spawn, execFile } = require('child_process');
const fs = require('fs/promises');
const path = require('path');
const { uniqueOutput } = require('./output');
const { isLocked } = require('./qpdf');

const SCRIPT = path.join(__dirname, 'word.ps1').replace('app.asar', 'app.asar.unpacked');
const OPT_KEY = 'HKCU\\Software\\Microsoft\\Office\\16.0\\Word\\Options';
const WARN = 'DisableConvertPdfWarning';
const TIMEOUT_MS = 5 * 60 * 1000;

const reg = (args) =>
  new Promise((resolve) => execFile('reg.exe', args, { windowsHide: true }, (err, stdout) => resolve(err ? null : stdout)));

// Word shows a "Word will now convert your PDF" notice even when hidden, and it waits forever.
// Switch it off only while converting, then put the user's own setting back.
async function withPdfNoticeOff(fn) {
  const before = await reg(['query', OPT_KEY, '/v', WARN]);
  const m = before && /REG_DWORD\s+0x([0-9a-f]+)/i.exec(before);
  await reg(['add', OPT_KEY, '/v', WARN, '/t', 'REG_DWORD', '/d', '1', '/f']);
  try {
    return await fn();
  } finally {
    if (m) await reg(['add', OPT_KEY, '/v', WARN, '/t', 'REG_DWORD', '/d', String(parseInt(m[1], 16)), '/f']);
    else await reg(['delete', OPT_KEY, '/v', WARN, '/f']);
  }
}

function runWord(input, output, mode, signal) {
  return new Promise((resolve, reject) => {
    if (signal && signal.aborted) return reject(new Error('Cancelled'));
    const proc = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', SCRIPT], {
      windowsHide: true,
      env: { ...process.env, FLICK_IN: input, FLICK_OUT: output, FLICK_MODE: mode },
    });
    const wordPids = [];
    let err = '';
    let reason = null;
    const stop = (why) => {
      reason = why;
      for (const pid of wordPids) {
        try {
          process.kill(pid);
        } catch {}
      }
      proc.kill();
    };
    const onAbort = () => stop('Cancelled');
    if (signal) signal.addEventListener('abort', onAbort, { once: true });
    const timer = setTimeout(() => stop('Word took too long and was stopped'), TIMEOUT_MS);

    proc.stdout.on('data', (d) => {
      for (const m of d.toString().matchAll(/PID (\d+)/g)) wordPids.push(Number(m[1]));
    });
    proc.stderr.on('data', (d) => (err += d.toString()));
    proc.on('error', reject);
    proc.on('close', (code) => {
      clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', onAbort);
      if (reason) return reject(new Error(reason));
      if (code === 0) return resolve();
      const line = err.trim().split(/\r?\n/).filter(Boolean)[0];
      reject(new Error(line || 'Word could not convert this file'));
    });
  });
}

async function wordToPdf(file, { signal } = {}) {
  const out = await uniqueOutput(file, 'pdf');
  try {
    await runWord(file, out, 'pdf', signal);
  } catch (e) {
    await fs.rm(out, { force: true });
    throw e;
  }
  return out;
}

async function pdfToWord(file, { signal } = {}) {
  if (await isLocked(file)) throw new Error('This PDF is password protected');
  const out = await uniqueOutput(file, 'docx');
  try {
    await withPdfNoticeOff(() => runWord(file, out, 'docx', signal));
  } catch (e) {
    await fs.rm(out, { force: true });
    throw e;
  }
  return out;
}

module.exports = { wordToPdf, pdfToWord };
