const fs = require('fs/promises');
const path = require('path');

// photo.png -> photo.jpg next to the original; photo (1).jpg if that already exists.
async function uniqueOutput(file, ext) {
  const dir = path.dirname(file);
  const base = path.basename(file, path.extname(file));
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
