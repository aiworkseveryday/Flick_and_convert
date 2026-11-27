// Runs a chosen action and drives the progress card.
const path = require('path');
const { ipcMain, shell } = require('electron');
const card = require('./card');
const settings = require('./settings');
const { runJob } = require('./jobs');
const { askPassword } = require('./prompt');
const { isCancelled } = require('./errors');
const { wheelFor } = require('./actions');

let abort = null;
let lastOutput = null;
const finishedListeners = [];

function captionOf(actionId, files) {
  let found = null;
  const walk = (list) => list.forEach((a) => (a.id === actionId ? (found = a) : a.children && walk(a.children)));
  walk(wheelFor(files).actions);
  return found ? found.caption : 'Working';
}

async function run(actionId, files, anchor) {
  if (abort) {
    card.update({ state: 'info', title: 'Still working', detail: 'Flick is finishing the last job first.' }, anchor);
    return;
  }
  abort = new AbortController();
  const signal = abort.signal;
  card.update(
    {
      state: 'running',
      title: captionOf(actionId, files),
      detail: files.length > 1 ? `${files.length} files` : path.basename(files[0]),
      indeterminate: true,
      label: '',
    },
    anchor || null,
  );
  // the password window opens just above the card
  const ask = (info) => {
    const b = card.bounds();
    return askPassword(info, b ? { x: b.x + b.width / 2, y: b.y - 110 } : anchor);
  };
  try {
    const outputs = await runJob(actionId, files, signal, (p) => card.update({ state: 'running', ...p }), ask);
    lastOutput = outputs[outputs.length - 1] || null;
    card.update({
      state: 'done',
      title: 'Done',
      detail: outputs.length > 1 ? `Saved ${outputs.length} files` : `Saved ${path.basename(lastOutput)}`,
    });
    if (settings.get('reveal') && lastOutput) shell.showItemInFolder(lastOutput);
    finishedListeners.forEach((fn) => fn(outputs));
  } catch (err) {
    if (signal.aborted || isCancelled(err)) card.hide();
    else card.update({ state: 'error', title: "Couldn't finish", detail: String((err && err.message) || err) });
  } finally {
    abort = null;
  }
}

ipcMain.on('card:stop', () => abort && abort.abort());
ipcMain.on('card:show', () => {
  if (lastOutput) shell.showItemInFolder(lastOutput);
  card.hide();
});
ipcMain.on('card:close', () => card.hide());

module.exports = {
  run,
  isBusy: () => !!abort,
  onFinished: (fn) => finishedListeners.push(fn),
};
