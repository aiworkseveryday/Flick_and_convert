// ZIP (optionally with a password) and extracting ZIP / 7z / tar / gz with 7-Zip, RAR with unrar (WebAssembly).
const { spawn } = require('child_process');
const fs = require('fs/promises');
const path = require('path');
const { uniqueOutput, uniqueFolder } = require('./output');
const { needPassword, wrongPassword, cancelled } = require('../errors');

const SEVEN_ZIP = require('7zip-bin').path7za.replace('app.asar', 'app.asar.unpacked');
const NO_PASSWORD = 'flick-no-password'; // makes 7-Zip fail on a locked archive instead of prompting

function run7z(args, { cwd, onProgress, signal } = {}) {
  return new Promise((resolve, reject) => {
    if (signal && signal.aborted) return reject(cancelled());
    const proc = spawn(SEVEN_ZIP, [...args, '-bsp1', '-bb0', '-y'], { cwd, windowsHide: true });
    let all = '';
    const kill = () => proc.kill('SIGKILL');
    if (signal) signal.addEventListener('abort', kill, { once: true });
    const onData = (d) => {
      const s = d.toString();
      all = (all + s).slice(-4000);
      const pcts = s.match(/(\d{1,3})%/g);
      if (pcts && onProgress) onProgress(Math.min(1, parseInt(pcts[pcts.length - 1], 10) / 100));
    };
    proc.stdout.on('data', onData);
    proc.stderr.on('data', onData);
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (signal) signal.removeEventListener('abort', kill);
      if (signal && signal.aborted) return reject(cancelled());
      if (code === 0) return resolve();
      if (/wrong password/i.test(all)) return reject(wrongPassword());
      const line = all
        .split(/\r?\n/)
        .map((l) => l.replace(/[\b]/g, '').trim())
        .filter((l) => l && !/^\d+%/.test(l))
        .pop();
      reject(new Error(line || `7-Zip failed (${code})`));
    });
  });
}

async function zip(files, { password, onProgress, signal } = {}) {
  const dir = path.dirname(files[0]);
  const sameDir = files.every((f) => path.dirname(f) === dir);
  // one item: name it after the item; several: after their folder
  const nameFrom = files.length === 1 ? files[0] : path.join(dir, path.basename(dir) || 'Archive');
  const out = await uniqueOutput(nameFrom, 'zip');
  const items = sameDir ? files.map((f) => path.basename(f)) : files;
  const pw = password ? [`-p${password}`, '-mem=AES256'] : [];
  try {
    await run7z(['a', '-tzip', '-mx=5', ...pw, out, ...items], { cwd: dir, onProgress, signal });
  } catch (e) {
    await fs.rm(out, { force: true });
    throw e;
  }
  return out;
}

async function newFolderFor(file) {
  const base = path.basename(file).replace(/\.(tar\.gz|tar\.bz2|tar\.xz|tgz|zip|rar|7z|tar|gz)$/i, '');
  return uniqueFolder(file, base || 'Extracted');
}

async function extract7z(file, dir, password, opts) {
  await run7z(['x', file, `-o${dir}`, `-p${password || NO_PASSWORD}`], opts);
  // .tar.gz comes out as a single .tar: unpack that too
  const inside = await fs.readdir(dir);
  if (inside.length === 1 && /\.tar$/i.test(inside[0]) && /\.(gz|tgz|bz2|xz)$/i.test(file)) {
    const tar = path.join(dir, inside[0]);
    await run7z(['x', tar, `-o${dir}`], { signal: opts.signal });
    await fs.rm(tar, { force: true });
  }
}

async function extractRar(file, dir, password, { onProgress, signal } = {}) {
  const { createExtractorFromFile } = require('node-unrar-js');
  try {
    const list = await createExtractorFromFile({ filepath: file, password });
    const total = [...list.getFileList().fileHeaders].length || 1;
    const extractor = await createExtractorFromFile({ filepath: file, targetPath: dir, password });
    let done = 0;
    for (const _ of extractor.extract().files) {
      if (signal && signal.aborted) throw cancelled();
      done++;
      if (onProgress) onProgress(done / total);
    }
  } catch (e) {
    if (e.reason === 'ERAR_MISSING_PASSWORD') throw password ? wrongPassword() : needPassword();
    if (e.reason === 'ERAR_BAD_PASSWORD') throw password ? wrongPassword() : needPassword();
    throw e;
  }
}

// ask(info) -> password string, or null if the user cancelled
async function extract(file, { ask, onProgress, signal } = {}) {
  const dir = await newFolderFor(file);
  const isRar = /\.rar$/i.test(file);
  let password = null;
  for (let attempt = 0; ; attempt++) {
    try {
      if (isRar) await extractRar(file, dir, password || undefined, { onProgress, signal });
      else await extract7z(file, dir, password, { onProgress, signal });
      return dir;
    } catch (e) {
      // clear out anything half-extracted before retrying or giving up
      for (const f of await fs.readdir(dir).catch(() => [])) await fs.rm(path.join(dir, f), { recursive: true, force: true });
      const locked = e.code === 'NEED_PASSWORD' || e.code === 'WRONG_PASSWORD';
      if (!locked || !ask || attempt >= 4) {
        await fs.rm(dir, { recursive: true, force: true });
        throw e;
      }
      password = await ask({
        title: 'This archive is locked',
        message: password ? 'That password was wrong. Try again.' : `Enter the password for ${path.basename(file)}`,
      });
      if (password == null) {
        await fs.rm(dir, { recursive: true, force: true });
        throw cancelled();
      }
    }
  }
}

module.exports = { zip, extract };
