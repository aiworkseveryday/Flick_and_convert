// User settings, saved as JSON in the app's data folder.
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

const DEFAULTS = {
  shiftDrag: true, // Shift + drag in Explorer opens the wheel
  reveal: false, // open Explorer on finished files
  saveNextToOriginal: true, // otherwise everything goes to outputDir
  outputDir: null,
  startWithWindows: false,
  theme: 'system', // system | light | dark
  shelfOpen: false,
  shelfFiles: [],
  shelfPos: null, // { x, y } of the shelf window
  seenWelcome: false,
  favourites: {}, // kind of file -> pinned action id (top slot of the wheel)
  contextMenu: true, // "Convert with Flick" in Explorer's right-click menu
};

class Settings extends EventEmitter {
  constructor() {
    super();
    this.values = { ...DEFAULTS };
    this.file = null;
  }
  load(dir) {
    this.file = path.join(dir, 'settings.json');
    try {
      this.values = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(this.file, 'utf8')) };
    } catch {
      this.values = { ...DEFAULTS };
    }
  }
  get(key) {
    return this.values[key];
  }
  all() {
    return { ...this.values };
  }
  set(key, value) {
    if (!(key in DEFAULTS) || this.values[key] === value) return;
    this.values[key] = value;
    if (this.file) {
      try {
        fs.mkdirSync(path.dirname(this.file), { recursive: true });
        fs.writeFileSync(this.file, JSON.stringify(this.values, null, 2));
      } catch {}
    }
    this.emit('change', key, value);
  }
}

module.exports = new Settings();
