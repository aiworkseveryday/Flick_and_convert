// Dev only.
//   FLICK_SELFTEST=<folder>  drives the bubble with <folder>/sample.png, saves screenshots of each stage
//                            into that folder, then quits.
//   FLICK_SELFTEST_JOBS=<json file>  runs [{ action, file }] through the real converters (including the
//                            RAW decoder window) and prints timings, then quits.
const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const { runJob } = require('./jobs');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function jobs(listFile) {
  const list = JSON.parse(fs.readFileSync(listFile, 'utf8'));
  // entries: { action, file | files, passwords?: [answers the password window would give] }
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

module.exports = function selftest(win, dir) {
  const shot = async (name) => {
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(dir, `${name}.png`), img.toPNG());
  };
  const js = (code) => win.webContents.executeJavaScript(code);

  win.webContents.once('did-finish-load', async () => {
    try {
      if (process.env.FLICK_SELFTEST_JOBS) {
        await jobs(process.env.FLICK_SELFTEST_JOBS);
        app.quit();
        return;
      }
      if (process.env.FLICK_SELFTEST_RINGS) {
        // FLICK_SELFTEST_RINGS=<file>|<file>|...: screenshot the ring for each, then the password window
        const list = process.env.FLICK_SELFTEST_RINGS.split('|');
        for (let i = 0; i < list.length; i++) {
          await js(`closeRing(); openRing([${JSON.stringify(list[i])}], false)`);
          await wait(800);
          await shot(`ring-${i + 1}`);
        }
        await js('closeRing()');
        const { askPassword } = require('./prompt');
        const { BrowserWindow } = require('electron');
        const answer = askPassword({ title: 'Lock the ZIP', message: "Choose a password. You'll need it to open the ZIP.", confirm: true });
        await wait(1200);
        const pw = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().endsWith('prompt.html'));
        fs.writeFileSync(path.join(dir, 'prompt.png'), (await pw.webContents.capturePage()).toPNG());
        console.log('prompt focused:', pw.isFocused());
        pw.webContents.executeJavaScript(`document.getElementById('pw').value='abc'; document.getElementById('pw2').value='abc'; document.getElementById('ok').click()`);
        console.log('prompt answer:', await answer);
        app.quit();
        return;
      }
      await wait(800);
      await shot('1-idle');
      await js(`openRing([${JSON.stringify(path.join(dir, 'sample.png'))}], true)`);
      await wait(700);
      await shot('2-ring');
      await js(`(() => {
        const r = ring.chips[0].el.getBoundingClientRect();
        updateHot(r.left + r.width / 2, r.top + r.height / 2);
      })()`);
      await wait(300);
      await shot('3-hot');
      await js(`choose(ring.hot)`);
      await wait(1500);
      await shot('4-done');
      if (process.env.FLICK_SELFTEST_VIDEO) {
        await js(`state = 'idle'; setClass('idle'); openRing([${JSON.stringify(process.env.FLICK_SELFTEST_VIDEO)}], false)`);
        await wait(700);
        await shot('5-video-ring');
        await js(`choose(ring.chips.find((c) => c.action.children))`);
        await wait(500);
        await shot('6-shrink-ring');
        await js(`choose(ring.chips[1])`);
        await wait(2500);
        await shot('7-progress');
        await js(`openRing([], false, { actions: [{ id: '__stop', label: 'Stop', color: '#dc2626' }] })`);
        await wait(600);
        await shot('8-stop');
        await js(`choose(ring.chips[0])`);
        await wait(1200);
        await shot('9-stopped');
      }
      console.log('SELFTEST OK', fs.readdirSync(dir).join(', '));
    } catch (e) {
      console.log('SELFTEST FAIL', e);
    }
    app.quit();
  });
};
