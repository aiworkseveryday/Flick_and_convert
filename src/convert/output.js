const fs = require('fs/promises');
const path = require('path');
const settings = require('../settings');

// Where results go: next to the original, or the one folder chosen in Settings.
function outDir(file) {
  const custom = settings.get('outputDir');
  return !settings.get('saveNextToOriginal') && custom ? custom : path.dirname(file);
}

// photo.png -> photo.jpg; photo (1).jpg if that already exists.
// suffix: clip.mp4 + ' (16MB)' -> clip (16MB).mp4
async function uniqueOutput(file, ext, suffix = '') {
  const dir = outDir(file);
  const base = path.basename(file, path.extname(file)) + suffix;
  for (let n = 0; ; n++) {
    const candidate = path.join(dir, n === 0 ? `${base}.${ext}` : `${base} (${n}).${ext}`);
    try {
      await fs.access(candidate);
    } catch {
      return candidate;
    }
  }
}

// Creates a new folder named `name` (or "name (1)", ...) in the output location for `file`.
async function uniqueFolder(file, name) {
  const base = path.join(outDir(file), name);
  for (let n = 0; ; n++) {
    const dir = n === 0 ? base : `${base} (${n})`;
    try {
      await fs.mkdir(dir);
      return dir;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
    }
  }
}

module.exports = { uniqueOutput, uniqueFolder, outDir };
