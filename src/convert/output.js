const fs = require('fs/promises');
const path = require('path');

// photo.png -> photo.jpg next to the original; photo (1).jpg if that already exists.
// suffix: clip.mp4 + ' (16MB)' -> clip (16MB).mp4
async function uniqueOutput(file, ext, suffix = '') {
  const dir = path.dirname(file);
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

module.exports = { uniqueOutput };
