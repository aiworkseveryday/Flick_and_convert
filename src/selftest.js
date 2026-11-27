// Dev only.
//   FLICK_SELFTEST=<folder>                screenshots of the wheel and card (light and dark) into <folder>,
//                                          using <folder>/sample.png and <folder>/test.pdf
//   + FLICK_SELFTEST_JOBS=<json file>      instead runs [{ action, file | files, passwords? }] through the
//                                          real converters and prints timings
const fs = require('fs');
const path = require('path');
const { app, nativeTheme, screen } = require('electron');
const { runJob } = require('./jobs');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function jobs(listFile) {
  const list = JSON.parse(fs.readFileSync(listFile, 'utf8'));
  for (const { action, file, files, passwords = [] } of list) {
    const t = Date.now();
    let last = 0;
    const answers = [...passwords];
    const ask = async () => (answers.length ? answers.shift() : null);
    try {
      const out = await runJob(action, files || [file], new AbortController().signal, (p) => (last = p.fraction), ask);
      const st = fs.statSync(out[0]);
      const what = st.isDirectory() ? `${fs.readdirSync(out[0]).length} items` : `${(st.size / 1024).toFixed(0)} KB`;
      console.log(`OK   ${action.padEnd(16)} ${((Date.now() - t) / 1000).toFixed(1)}s  ${what}  progress=${last.toFixed(2)}  ${path.basename(out[0])}`);
    } catch (e) {
      console.log(`FAIL ${action.padEnd(16)} ${e.message}`);
    }
  }
}

async function ui(dir) {
  const wheel = require('./wheel');
  const card = require('./card');
  const runner = require('./runner');
  const shot = async (w, name) => fs.writeFileSync(path.join(dir, `${name}.png`), (await w.webContents.capturePage()).toPNG());
  const wjs = (code) => wheel.window().webContents.executeJavaScript(code);
  const wa = screen.getPrimaryDisplay().workArea;
  const anchor = { x: wa.x + wa.width / 2, y: wa.y + wa.height / 2 - 80 };
  const png = path.join(dir, 'sample.png');
  const pdf = path.join(dir, 'test.pdf');

  // hover the slice whose label is `label` (or the hub)
  const hover = (label) =>
    wjs(`(() => {
      const s = ${label === 'hub' ? "'hub'" : `slices.find((s) => s.action.label === ${JSON.stringify(label)})`};
      if (s === 'hub') return setHot('hub');
      const [x, y] = pt((R_IN + R_OUT) / 2, s.mid);
      setHot(hitTest(x, y));
    })()`);

  for (const theme of ['light', 'dark']) {
    nativeTheme.themeSource = theme;
    await wait(300);
    await wheel.show(anchor, { mode: 'drag', files: [png] });
    await wait(500);
    await shot(wheel.window(), `${theme}-1-wheel`);
    await hover('PDF');
    await wait(250);
    await shot(wheel.window(), `${theme}-2-hover`);
    await hover('Shrink');
    await wait(900); // dwell opens the sizes
    await shot(wheel.window(), `${theme}-3-children`);
    await hover('hub');
    await wait(250);
    await shot(wheel.window(), `${theme}-4-back`);
    await wheel.show(anchor, { mode: 'click', files: [pdf] });
    await wait(500);
    await shot(wheel.window(), `${theme}-5-pdf`);
    wheel.hide();

    // a running card, shown directly since real jobs on small files finish too fast to catch
    await card.update({ state: 'running', title: 'Shrink to 16 MB', detail: 'holiday-video.mp4', fraction: 0.42, label: '42%' }, anchor);
    await wait(400);
    await shot(card.window(), `${theme}-6-card-running`);
    runner.run('img-jpg', [png], anchor);
    await wait(1500);
    await shot(card.window(), `${theme}-7-card-done`);
    await runner.run('pdf-split', [path.join(dir, 'one-page.pdf')], anchor);
    await wait(300);
    await shot(card.window(), `${theme}-8-card-error`);
    card.hide();
    await wait(300);

    const settingsWindow = require('./settingsWindow');
    const shelf = require('./shelf');
    settingsWindow.open();
    await wait(1200);
    await shot(settingsWindow.window(), `${theme}-9-settings`);
    shelf.add([png, pdf, path.join(dir, 'one-page.pdf'), dir]);
    shelf.open();
    await wait(1200);
    await shot(shelf.window(), `${theme}-10-shelf`);
    shelf.close();
    settingsWindow.window().close();
    await wait(300);
  }
}

module.exports = function selftest(dir) {
  setTimeout(async () => {
    try {
      if (process.env.FLICK_SELFTEST_JOBS) await jobs(process.env.FLICK_SELFTEST_JOBS);
      else await ui(dir);
      console.log('SELFTEST OK');
    } catch (e) {
      console.log('SELFTEST FAIL', e);
    }
    app.quit();
  }, 1200);
};
