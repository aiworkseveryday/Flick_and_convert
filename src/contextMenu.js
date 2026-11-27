// "Convert with Flick" in Explorer's right-click menu, for files and folders (current user only).
// On Windows 11 it sits under "Show more options" (or Shift + right-click), like other classic entries.
// Explorer starts Flick once per selected file; the running Flick collects them into one wheel.
const { app } = require('electron');
const { execFile } = require('child_process');

const KEYS = ['HKCU\\Software\\Classes\\*\\shell\\Flick', 'HKCU\\Software\\Classes\\Directory\\shell\\Flick'];
const FLAG = '--flick-open';

const reg = (args) =>
  new Promise((resolve) => execFile('reg.exe', args, { windowsHide: true }, (err) => resolve(!err)));

async function register() {
  const exe = process.execPath;
  // a dev run starts electron.exe with the app folder; the installed app is just Flick.exe
  const command = app.isPackaged ? `"${exe}" ${FLAG} "%1"` : `"${exe}" "${app.getAppPath()}" ${FLAG} "%1"`;
  for (const key of KEYS) {
    await reg(['add', key, '/v', 'MUIVerb', '/d', 'Convert with Flick', '/f']);
    await reg(['add', key, '/v', 'Icon', '/d', `"${exe}",0`, '/f']);
    await reg(['add', key, '/v', 'MultiSelectModel', '/d', 'Player', '/f']); // allow any number of files
    await reg(['add', `${key}\\command`, '/ve', '/d', command, '/f']);
  }
}

async function unregister() {
  for (const key of KEYS) await reg(['delete', key, '/f']);
}

// Files passed by the right-click menu in a command line, or [] if it wasn't one.
function filesFromArgs(argv) {
  if (!argv.includes(FLAG)) return [];
  const fs = require('fs');
  const path = require('path');
  const skip = new Set([process.execPath, app.getAppPath()].map((p) => path.resolve(p).toLowerCase()));
  return argv.filter((a) => {
    if (!a || a.startsWith('-') || !path.isAbsolute(a) || skip.has(path.resolve(a).toLowerCase())) return false;
    return fs.existsSync(a);
  });
}

module.exports = { register, unregister, filesFromArgs };
