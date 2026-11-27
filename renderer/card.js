const card = document.getElementById('card');
const bar = document.querySelector('#ring .bar');
const pct = document.getElementById('pct');
const title = document.getElementById('title');
const detail = document.getElementById('detail');
const action = document.getElementById('action');
const CIRC = 2 * Math.PI * 20;
let state = 'idle';

// data: { state: running|done|error|info|leaving, title, detail, fraction, indeterminate, label }
window.flick.on('card:update', (d) => {
  if (d.state === 'leaving') {
    card.classList.remove('shown');
    return;
  }
  state = d.state;
  card.className = `shown ${d.state}${d.state === 'running' && d.indeterminate ? ' spin' : ''}`;
  if (d.title !== undefined) title.textContent = d.title;
  if (d.detail !== undefined) detail.textContent = d.detail;
  if (d.state === 'running') {
    pct.textContent = d.label || '';
    bar.style.strokeDashoffset = d.indeterminate ? '' : CIRC * (1 - (d.fraction || 0));
    action.textContent = 'Stop';
  } else if (d.state === 'done') {
    action.textContent = 'Show';
  } else {
    action.textContent = '';
  }
});

action.addEventListener('click', () => {
  if (state === 'running') window.flick.send('card:stop');
  else if (state === 'done') window.flick.send('card:show');
});
document.getElementById('close').addEventListener('click', () => window.flick.send('card:close'));
