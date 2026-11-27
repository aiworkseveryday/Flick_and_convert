const $ = (id) => document.getElementById(id);
const shelf = $('shelf');
const list = $('list');
let items = [];

function render(next) {
  items = next;
  const n = items.length;
  $('count').textContent = n ? `${n} file${n > 1 ? 's' : ''}` : '';
  $('empty').hidden = n > 0;
  list.hidden = n === 0;
  $('all').disabled = n === 0;
  $('clear').disabled = n === 0;
  list.innerHTML = '';
  for (const it of items) {
    const li = document.createElement('li');
    li.className = 'item' + (it.missing ? ' missing' : '');
    li.title = it.missing ? `${it.path}\n(no longer there)` : `${it.path}\nClick to convert, or drag it out`;
    li.draggable = !it.missing;
    li.innerHTML = `<span class="badge"></span><span class="name"></span>
      <button class="icon" title="Remove from shelf"><svg viewBox="0 0 24 24"><path d="M7 7l10 10M17 7L7 17" /></svg></button>`;
    li.querySelector('.badge').textContent = it.ext;
    li.querySelector('.name').textContent = it.name;
    li.querySelector('button').addEventListener('click', (e) => {
      e.stopPropagation();
      window.flick.send('shelf:remove', it.path);
    });
    li.addEventListener('click', (e) => {
      if (!it.missing) window.flick.send('shelf:wheel', { paths: [it.path], x: e.screenX, y: e.screenY });
    });
    li.addEventListener('dragstart', (e) => {
      e.preventDefault();
      window.flick.send('shelf:drag', it.path);
    });
    list.appendChild(li);
  }
}

window.flick.invoke('shelf:get').then(render);
window.flick.on('shelf:files', render);

$('all').addEventListener('click', (e) => {
  const paths = items.filter((it) => !it.missing).map((it) => it.path);
  if (paths.length) window.flick.send('shelf:wheel', { paths, x: e.screenX, y: e.screenY });
});
$('clear').addEventListener('click', () => window.flick.send('shelf:clear'));
$('close').addEventListener('click', () => window.flick.send('shelf:close'));

// dropping files onto the shelf parks them
let depth = 0;
document.addEventListener('dragenter', (e) => {
  e.preventDefault();
  depth++;
  shelf.classList.add('over');
});
document.addEventListener('dragleave', () => {
  depth = Math.max(0, depth - 1);
  if (!depth) shelf.classList.remove('over');
});
document.addEventListener('dragover', (e) => {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy';
});
document.addEventListener('drop', (e) => {
  e.preventDefault();
  depth = 0;
  shelf.classList.remove('over');
  const paths = [...e.dataTransfer.files].map((f) => window.flick.pathForFile(f)).filter(Boolean);
  if (paths.length) window.flick.send('shelf:add', paths);
});
