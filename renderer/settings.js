const $ = (id) => document.getElementById(id);
const switches = [...document.querySelectorAll('.switch')];
const themeButtons = [...document.querySelectorAll('#theme button')];

function render(v) {
  for (const s of switches) s.checked = !!v[s.dataset.key];
  for (const b of themeButtons) b.classList.toggle('on', b.dataset.theme === v.theme);
  $('folderRow').hidden = !!v.saveNextToOriginal;
  $('folderPath').textContent = v.outputDir || 'Not chosen yet';
  $('folderPath').title = v.outputDir || '';
  $('shelf').textContent = v.shelfOpen ? 'Close shelf' : 'Open shelf';
}

window.flick.invoke('settings:get').then(render);
window.flick.on('settings:changed', render);

for (const s of switches) {
  s.addEventListener('change', async () => {
    window.flick.send('settings:set', s.dataset.key, s.checked);
    // turning off "next to original" needs a folder: ask for one right away
    if (s.dataset.key === 'saveNextToOriginal' && !s.checked) {
      const v = await window.flick.invoke('settings:get');
      if (!v.outputDir && !(await window.flick.invoke('settings:pick-folder'))) {
        window.flick.send('settings:set', 'saveNextToOriginal', true);
      }
    }
  });
}
for (const b of themeButtons) b.addEventListener('click', () => window.flick.send('settings:set', 'theme', b.dataset.theme));

$('pickFolder').addEventListener('click', () => window.flick.invoke('settings:pick-folder'));
$('shelf').addEventListener('click', () => window.flick.send('settings:toggle-shelf'));

// drop zone: dropped or picked files open the wheel
const drop = $('drop');
drop.addEventListener('click', () => window.flick.send('settings:pick-files'));
drop.addEventListener('dragover', (e) => {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy';
  drop.classList.add('over');
});
drop.addEventListener('dragleave', () => drop.classList.remove('over'));
drop.addEventListener('drop', (e) => {
  e.preventDefault();
  drop.classList.remove('over');
  const files = [...e.dataTransfer.files].map((f) => window.flick.pathForFile(f)).filter(Boolean);
  window.flick.send('settings:dropped', files);
});
// dropping anywhere else in the window shouldn't navigate away
document.addEventListener('dragover', (e) => e.preventDefault());
document.addEventListener('drop', (e) => e.preventDefault());
