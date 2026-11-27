// Hidden helper page for work that needs a browser engine: RAW decoding (LibRaw WebAssembly)
// and drawing PDF pages (pdf.js). Each task module is loaded the first time it's needed.
const TASKS = {
  raw: () => import('./raw-task.js'),
  'pdf-images': () => import('./pdf-task.js'),
};

window.helperApi.onJob(async ({ id, type, payload }) => {
  try {
    const mod = await TASKS[type]();
    const result = await mod.run(payload, (fraction) => window.helperApi.progress(id, fraction));
    window.helperApi.done(id, result || {});
  } catch (err) {
    window.helperApi.done(id, { error: String((err && err.message) || err) });
  }
});

window.helperApi.ready();
