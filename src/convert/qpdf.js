// PDF password, merge and split with qpdf (WebAssembly build, runs inside Node).
const fs = require('fs/promises');
const path = require('path');
const createModule = require('@neslinesli93/qpdf-wasm');
const { uniqueOutput, uniqueFolder } = require('./output');

// A fresh module per call keeps the virtual file system clean and frees memory afterwards.
// This build ignores the print/printErr hooks and writes straight to the console, so capture that.
// The module binds the console when it is created, so the capture starts before that.
async function qpdf(args, inputs = {}, dirs = []) {
  let log = '';
  const savedExitCode = process.exitCode; // the module sets process.exitCode; don't let it leak into the app
  const saved = { log: console.log, error: console.error, warn: console.warn };
  const grab = (...a) => (log += a.join(' ') + '\n');
  console.log = console.error = console.warn = grab;
  let code;
  let q;
  try {
    q = await createModule({ noInitialRun: true });
    for (const d of dirs) q.FS.mkdir(d);
    for (const [vpath, data] of Object.entries(inputs)) q.FS.writeFile(vpath, data);
    code = q.callMain([...args]); // callMain modifies the array it is given
  } catch (e) {
    code = typeof e.status === 'number' ? e.status : 2;
  } finally {
    Object.assign(console, saved);
    process.exitCode = savedExitCode;
  }
  return { q, code, log };
}

const lastLine = (log) => log.trim().split(/\r?\n/).filter(Boolean).pop() || 'qpdf failed';

// A PDF that needs a password to open fails --check with "invalid password".
async function isLocked(file) {
  const { log } = await qpdf(['--check', '/in.pdf'], { '/in.pdf': await fs.readFile(file) });
  return /invalid password/i.test(log);
}

async function lockPdf(file, password) {
  if (await isLocked(file)) throw new Error('This PDF already has a password');
  const { q, code, log } = await qpdf(['--encrypt', password, password, '256', '--', '/in.pdf', '/out.pdf'], {
    '/in.pdf': await fs.readFile(file),
  });
  if (code !== 0 && code !== 3) throw new Error(lastLine(log)); // 3 = finished with warnings
  const out = await uniqueOutput(file, 'pdf', ' (locked)');
  await fs.writeFile(out, q.FS.readFile('/out.pdf'));
  return out;
}

const byName = (a, b) => path.basename(a).localeCompare(path.basename(b), undefined, { numeric: true, sensitivity: 'base' });

async function mergePdfs(files) {
  const sorted = [...files].sort(byName);
  const inputs = {};
  const pages = [];
  for (let i = 0; i < sorted.length; i++) {
    if (await isLocked(sorted[i])) throw new Error(`${path.basename(sorted[i])} is password protected`);
    inputs[`/in${i}.pdf`] = await fs.readFile(sorted[i]);
    pages.push(`/in${i}.pdf`, '1-z'); // every page
  }
  const { q, code, log } = await qpdf(['--empty', '--pages', ...pages, '--', '/out.pdf'], inputs);
  if (code !== 0 && code !== 3) throw new Error(lastLine(log));
  const out = await uniqueOutput(path.join(path.dirname(sorted[0]), 'Merged.pdf'), 'pdf');
  await fs.writeFile(out, q.FS.readFile('/out.pdf'));
  return out;
}

// One PDF per page, in a "<name> pages" folder next to the original.
async function splitPdf(file) {
  if (await isLocked(file)) throw new Error('This PDF is password protected');
  const { q, code, log } = await qpdf(['/in.pdf', '--split-pages', '/out/page-%d.pdf'], { '/in.pdf': await fs.readFile(file) }, ['/out']);
  if (code !== 0 && code !== 3) throw new Error(lastLine(log));
  const names = q.FS.readdir('/out').filter((n) => n.endsWith('.pdf'));
  if (names.length < 2) throw new Error('This PDF has only one page');
  const dir = await uniqueFolder(file, `${path.basename(file, path.extname(file))} pages`);
  for (const n of names) await fs.writeFile(path.join(dir, n), q.FS.readFile(`/out/${n}`));
  return dir;
}

module.exports = { isLocked, lockPdf, mergePdfs, splitPdf };
