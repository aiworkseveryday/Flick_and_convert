// Dev only: FLICK_SELFTEST=<folder> drives the bubble with <folder>/sample.png and saves
// screenshots of each stage into that folder, then quits.
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = function selftest(win, dir) {
  const shot = async (name) => {
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(dir, `${name}.png`), img.toPNG());
  };
  const js = (code) => win.webContents.executeJavaScript(code);

  win.webContents.once('did-finish-load', async () => {
    try {
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
      console.log('SELFTEST OK', fs.readdirSync(dir).join(', '));
    } catch (e) {
      console.log('SELFTEST FAIL', e);
    }
    app.quit();
  });
};
