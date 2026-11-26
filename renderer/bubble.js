const bubble = document.getElementById('bubble');
const ringEl = document.getElementById('ring');
const hintEl = document.getElementById('hint');
const pctEl = document.getElementById('pct');
const bar = document.querySelector('#progress .bar');
const CIRC = 2 * Math.PI * 32;

const HOLD_MS = 200; // hold this long to open the ring for a flick
const DRAG_PX = 6; // move this far before the ring opens to drag the bubble instead
const CHIP_R = 28;
const COLORS = ['#5b8cff', '#f97316', '#22c55e', '#e11d48', '#a855f7', '#0ea5e9', '#eab308', '#14b8a6'];

let state = 'idle'; // idle | pressing | dragging | ring | running | done | error
let press = null; // { x, y, timer, selection: Promise }
let ring = null; // { files, chips: [{el, action, angle}], held, hot }
let fadeTimer = null;
let resultTimer = null;
let job = null; // set while a conversion runs (the Stop ring can be open on top of it)

// ---------- helpers ----------

function setClass(name) {
  bubble.className = name;
}

function wakeUp() {
  bubble.classList.remove('faded');
  clearTimeout(fadeTimer);
  fadeTimer = setTimeout(() => {
    if (state === 'idle') bubble.classList.add('faded');
  }, 3000);
}

function center() {
  return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
}

function waitForResize(expected) {
  return new Promise((resolve) => {
    if (window.innerWidth === expected) return resolve();
    const done = () => {
      window.removeEventListener('resize', done);
      clearTimeout(t);
      resolve();
    };
    const t = setTimeout(done, 150);
    window.addEventListener('resize', done);
  });
}

// ---------- ring layout ----------

// Find the biggest open arc around the bubble whose chips stay on screen.
function layoutAngles(n, vis, radius) {
  const c = center();
  const pad = CHIP_R + 4;
  const ok = [];
  for (let deg = 0; deg < 360; deg += 5) {
    const a = (deg * Math.PI) / 180;
    const x = c.x + Math.cos(a) * radius;
    const y = c.y + Math.sin(a) * radius;
    ok.push(x - pad >= vis.left && x + pad <= vis.right && y - pad >= vis.top && y + pad <= vis.bottom);
  }
  const minGap = ((2 * Math.asin((CHIP_R + 4) / radius)) * 180) / Math.PI;

  if (ok.every(Boolean)) {
    const step = 360 / n;
    if (n > 1 && step < minGap) return null;
    return Array.from({ length: n }, (_, i) => -90 + i * step);
  }

  // longest circular run of on-screen angles
  let best = { start: 0, len: 0 };
  for (let s = 0; s < 72; s++) {
    if (!ok[s] || ok[(s + 71) % 72]) continue;
    let len = 0;
    while (len < 72 && ok[(s + len) % 72]) len++;
    if (len > best.len) best = { start: s, len };
  }
  if (best.len === 0) return null;
  const span = (best.len - 1) * 5;
  const mid = best.start * 5 + span / 2;
  if (n === 1) return [mid];
  const step = Math.min(span / (n - 1), 48);
  if (step < minGap) return null;
  return Array.from({ length: n }, (_, i) => mid + (i - (n - 1) / 2) * step);
}

function buildRing(actions, vis) {
  ringEl.innerHTML = '';
  ringEl.classList.remove('open');
  const c = center();
  let radius = 96;
  let angles = null;
  while (radius <= 150 && !(angles = layoutAngles(actions.length, vis, radius))) radius += 8;
  if (!angles) angles = actions.map((_, i) => -90 + (i * 360) / actions.length);

  const chips = actions.map((action, i) => {
    const a = (angles[i] * Math.PI) / 180;
    const x = c.x + Math.cos(a) * radius;
    const y = c.y + Math.sin(a) * radius;
    const el = document.createElement('div');
    el.className = 'chip' + (action.soon ? ' soon' : '');
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.setProperty('--c', action.color || COLORS[i % COLORS.length]);
    el.style.setProperty('--fx', `${c.x - x}px`);
    el.style.setProperty('--fy', `${c.y - y}px`);
    el.style.transitionDelay = `${i * 18}ms`;
    el.innerHTML = `<span></span>${action.soon ? '<small>soon</small>' : action.sub ? '<small></small>' : ''}`;
    el.querySelector('span').textContent = action.label;
    if (!action.soon && action.sub) el.querySelector('small').textContent = action.sub;
    el.addEventListener('pointerup', (e) => {
      if (ring && !ring.held) {
        e.stopPropagation();
        choose({ el, action });
      }
    });
    return { el, action, angle: angles[i] };
  });
  chips.forEach((ch) => ringEl.appendChild(ch.el));
  requestAnimationFrame(() => requestAnimationFrame(() => ringEl.classList.add('open')));
  return chips;
}

function showHint(text, vis) {
  const c = center();
  const v = vis || { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
  const vc = { x: (v.left + v.right) / 2, y: (v.top + v.bottom) / 2 };
  let dx = vc.x - c.x;
  let dy = vc.y - c.y;
  const len = Math.hypot(dx, dy);
  if (len < 10) {
    dx = 0;
    dy = 1;
  } else {
    dx /= len;
    dy /= len;
  }
  const x = Math.min(Math.max(c.x + dx * 100, v.left + 115), v.right - 115);
  const y = Math.min(Math.max(c.y + dy * 80, v.top + 30), v.bottom - 30);
  hintEl.style.left = `${x}px`;
  hintEl.style.top = `${y}px`;
  hintEl.textContent = text;
  hintEl.hidden = false;
}

// ---------- open / close ----------

// preset: show these options instead of asking main (the Stop button, or a message with no options)
async function openRing(files, held, preset) {
  state = 'ring';
  const my = (ring = { files, chips: [], held, hot: null, vis: null });
  const vis = await window.flick.ringOpen();
  await waitForResize(360);
  if (ring !== my) return;
  my.vis = vis;
  if (preset && preset.message) {
    showHint(preset.message, vis);
    my.timer = setTimeout(closeRing, preset.ms || 3500);
    return;
  }
  const actions = preset ? preset.actions : (await window.flick.actions(files)).actions;
  if (ring !== my) return;

  if (!preset && !files.length) {
    showHint('Select a file in File Explorer, or drop one on me', vis);
    my.timer = setTimeout(closeRing, 2200);
    return;
  }
  if (!actions.length) {
    showHint("Flick can't convert this file type yet", vis);
    my.timer = setTimeout(closeRing, 2200);
    return;
  }
  my.chips = buildRing(actions, vis);
  if (files.length > 1) showHint(`${files.length} files`, { ...vis, top: center().y - 30, bottom: center().y + 30 });
}

function closeRing() {
  if (ring && ring.timer) clearTimeout(ring.timer);
  ring = null;
  ringEl.classList.remove('open');
  ringEl.innerHTML = '';
  hintEl.hidden = true;
  window.flick.ringClose();
  if (state === 'ring') {
    if (job) {
      state = 'running'; // closed the Stop ring: keep showing progress
    } else {
      state = 'idle';
      setClass('idle');
      bubble.title = '';
      wakeUp();
    }
  }
}

function showMessage(text, ms) {
  if (ring) closeRing();
  openRing([], false, { message: text, ms });
}

function updateHot(clientX, clientY) {
  if (!ring || !ring.chips.length) return;
  const c = center();
  const dx = clientX - c.x;
  const dy = clientY - c.y;
  let hot = null;
  if (Math.hypot(dx, dy) > 36) {
    const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
    let bestDiff = 40;
    for (const ch of ring.chips) {
      let d = Math.abs(((ang - ch.angle + 540) % 360) - 180);
      if (d < bestDiff) {
        bestDiff = d;
        hot = ch;
      }
    }
  }
  if (hot !== ring.hot) {
    if (ring.hot) ring.hot.el.classList.remove('hot');
    if (hot) hot.el.classList.add('hot');
    ring.hot = hot;
  }
}

// ---------- running ----------

async function choose(chip) {
  if (!ring) return;
  const files = ring.files;
  const { action } = chip;

  if (action.id === '__stop') {
    window.flick.cancel();
    closeRing();
    return;
  }
  if (action.soon) {
    showHint(`${action.label}${action.sub ? ' (' + action.sub + ')' : ''} is coming in a later update`, ring.vis);
    clearTimeout(ring.timer);
    ring.timer = setTimeout(closeRing, 1800);
    return;
  }
  if (action.children) {
    // second ring, e.g. Shrink -> 8 MB / 16 MB / 25 MB; pick one with a click
    ring.held = false;
    ring.hot = null;
    hintEl.hidden = true;
    ring.chips = buildRing(action.children, ring.vis);
    return;
  }

  closeRing();
  job = { files };
  state = 'running';
  setClass(files.length > 1 ? 'running' : 'running indeterminate');
  pctEl.textContent = files.length > 1 ? `0/${files.length}` : '';
  bar.style.strokeDashoffset = CIRC;

  const res = await window.flick.run(action.id, files);
  job = null;
  if (ring) closeRing();
  clearTimeout(resultTimer);
  if (res.ok) {
    state = 'done';
    setClass('done');
    bubble.title = `Saved ${res.outputs.length} file${res.outputs.length > 1 ? 's' : ''}. Click to show.`;
    resultTimer = setTimeout(resetIdle, 6000);
  } else if (res.cancelled) {
    state = 'idle';
    setClass('idle');
    wakeUp();
  } else {
    state = 'error';
    setClass('error');
    bubble.title = res.error;
    showMessage(res.error, 4000); // closing the message returns the bubble to idle
  }
}

function resetIdle() {
  if (state !== 'done' && state !== 'error') return;
  state = 'idle';
  setClass('idle');
  bubble.title = '';
  wakeUp();
}

window.flick.onProgress((p) => {
  if (!job) return;
  bubble.classList.toggle('indeterminate', !!p.indeterminate);
  pctEl.textContent = p.label;
  if (!p.indeterminate) bar.style.strokeDashoffset = CIRC * (1 - p.fraction);
});

// ---------- pointer input ----------

bubble.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  wakeUp();
  bubble.setPointerCapture(e.pointerId);

  if (state === 'ring') {
    closeRing();
    return;
  }
  if (state === 'done') {
    window.flick.openOutput();
    clearTimeout(resultTimer);
    state = 'idle';
    setClass('idle');
    bubble.title = '';
    return;
  }
  if (state === 'running' || state === 'error') {
    press = { x: e.screenX, y: e.screenY, dragOnly: true };
    return;
  }

  // Ask Explorer for its selection right away, while it is still the foreground window.
  const selection = window.flick.selection();
  bubble.classList.add('pressed');
  state = 'pressing';
  const p = { x: e.screenX, y: e.screenY, selection, released: false };
  p.timer = setTimeout(async () => {
    if (state !== 'pressing') return;
    state = 'opening';
    bubble.classList.remove('pressed');
    const files = await selection;
    if (state === 'opening') openRing(files, !p.released);
  }, HOLD_MS);
  press = p;
});

bubble.addEventListener('pointermove', (e) => {
  if (state === 'ring') {
    if (ring && ring.held) updateHot(e.clientX, e.clientY);
    return;
  }
  if (!press) return;
  const moved = Math.hypot(e.screenX - press.x, e.screenY - press.y);
  if ((state === 'pressing' || press.dragOnly) && moved > DRAG_PX) {
    clearTimeout(press.timer);
    bubble.classList.remove('pressed');
    if (state === 'pressing') state = 'dragging';
    press.dragging = true;
    bubble.style.cursor = 'grabbing';
    window.flick.dragStart();
  }
  if (press.dragging) window.flick.dragMove();
});

bubble.addEventListener('pointerup', async (e) => {
  bubble.classList.remove('pressed');
  bubble.style.cursor = '';
  const p = press;
  press = null;

  if (p && p.dragging) {
    window.flick.dragEnd();
    if (state === 'dragging') state = 'idle';
    wakeUp();
    return;
  }
  if (p && p.dragOnly && state === 'running' && job) {
    // tap while converting: offer a Stop button
    openRing([], false, { actions: [{ id: '__stop', label: 'Stop', color: '#dc2626' }] });
    return;
  }
  if (state === 'opening' && p) {
    p.released = true; // ring is still loading: open it in click mode
    return;
  }
  if (state === 'ring' && ring && !ring.vis) {
    ring.held = false; // released while the window was still growing
    return;
  }
  if (state === 'pressing' && p) {
    // quick tap: open the ring and let the user click an option
    clearTimeout(p.timer);
    openRing(await p.selection, false);
    return;
  }
  if (state === 'ring' && ring && ring.held) {
    const hot = ring.hot;
    if (hot) choose(hot);
    else ring.held = false; // released in the middle: keep the ring open for clicking
  }
});

bubble.addEventListener('pointercancel', () => {
  if (press && press.dragging) window.flick.dragEnd();
  press = null;
  if (state === 'pressing' || state === 'dragging') state = 'idle';
  if (ring) ring.held = false;
});

// While the ring is held, the pointer is captured by the bubble, so moves anywhere arrive here.
// Clicking empty space around an open ring closes it.
document.addEventListener('pointerdown', (e) => {
  if (state === 'ring' && !bubble.contains(e.target) && !e.target.closest('.chip')) closeRing();
});

// ---------- drag a file onto the bubble ----------

let dragDepth = 0;
document.addEventListener('dragenter', (e) => {
  e.preventDefault();
  dragDepth++;
  bubble.classList.add('droptarget');
  wakeUp();
});
document.addEventListener('dragover', (e) => {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy';
});
document.addEventListener('dragleave', () => {
  dragDepth = Math.max(0, dragDepth - 1);
  if (!dragDepth) bubble.classList.remove('droptarget');
});
document.addEventListener('drop', (e) => {
  e.preventDefault();
  dragDepth = 0;
  bubble.classList.remove('droptarget');
  if (state === 'running') return;
  const files = [...e.dataTransfer.files].map((f) => window.flick.pathForFile(f)).filter(Boolean);
  if (state === 'ring') closeRing();
  if (state === 'done' || state === 'error') {
    clearTimeout(resultTimer);
    state = 'idle';
    setClass('idle');
  }
  if (files.length) openRing(files, false);
});

wakeUp();
