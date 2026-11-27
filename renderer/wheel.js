// The sliced wheel.
//   drag mode:  opened by Shift + drag in Explorer. Hover a slice and drop the file on it.
//               Hovering a slice that has more options (Shrink, ZIP) opens them after a moment.
//   click mode: opened by the shortcut, the shelf, or after a drop on the hub. Click a slice.
const SVG = 'http://www.w3.org/2000/svg';
const C = 180; // wheel centre
const R_OUT = 152;
const R_IN = 66;
const R_HUB = 60;
const GAP = 16; // includes the 10px rounding stroke, so about 6px shows
const DWELL_MS = 550;

const stage = document.getElementById('stage');
const slicesEl = document.getElementById('slices');
const hubEl = document.getElementById('hub');
const hubPill = document.getElementById('hubPill');
const captionEl = document.getElementById('caption');

let state = null; // { mode, files, hub, levels: [{ actions, caption, parent }], hot, dropped }
let slices = [];
let dwellTimer = null;

// ---------- drawing ----------

const rad = (deg) => (deg * Math.PI) / 180;
const pt = (r, deg) => [C + r * Math.cos(rad(deg)), C + r * Math.sin(rad(deg))];

function sectorPath(a0, a1) {
  const po = ((GAP / 2 / R_OUT) * 180) / Math.PI;
  const pi = ((GAP / 2 / R_IN) * 180) / Math.PI;
  const [ox0, oy0] = pt(R_OUT, a0 + po);
  const [ox1, oy1] = pt(R_OUT, a1 - po);
  const [ix1, iy1] = pt(R_IN, a1 - pi);
  const [ix0, iy0] = pt(R_IN, a0 + pi);
  const largeO = a1 - a0 - 2 * po > 180 ? 1 : 0;
  const largeI = a1 - a0 - 2 * pi > 180 ? 1 : 0;
  return `M${ox0},${oy0} A${R_OUT},${R_OUT} 0 ${largeO} 1 ${ox1},${oy1} L${ix1},${iy1} A${R_IN},${R_IN} 0 ${largeI} 0 ${ix0},${iy0} Z`;
}

function ringPath() {
  // a single option fills the whole ring
  const o = R_OUT - 5;
  const i = R_IN + 5;
  return `M${C - o},${C} a${o},${o} 0 1 0 ${2 * o},0 a${o},${o} 0 1 0 ${-2 * o},0 Z M${C - i},${C} a${i},${i} 0 1 1 ${2 * i},0 a${i},${i} 0 1 1 ${-2 * i},0 Z`;
}

function el(tag, attrs) {
  const e = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, v);
  return e;
}

function draw() {
  const level = currentLevel();
  slicesEl.innerHTML = '';
  slices = [];
  const n = level.actions.length;
  if (!n) {
    updateLabels();
    return;
  }
  const span = 360 / n;
  level.actions.forEach((action, i) => {
    const mid = -90 + i * span;
    const g = el('g', { class: 'slice' + (action.soon ? ' soon' : '') + (action.fav ? ' fav' : '') });
    const path = el('path', { d: n === 1 ? ringPath() : sectorPath(mid - span / 2, mid + span / 2), 'fill-rule': 'evenodd' });
    g.appendChild(path);

    const rText = (R_IN + R_OUT) / 2 + 4;
    const [tx, ty] = n === 1 ? [C, C - rText] : pt(rText, mid);
    // "soon", a short note like "full", or three dots when the slice opens more options
    const sub = action.soon ? 'soon' : action.sub || (action.children ? '•••' : '');
    const label = el('text', { x: tx, y: sub ? ty - 6 : ty });
    label.textContent = action.label;
    g.appendChild(label);
    if (sub) {
      const s = el('text', { x: tx, y: ty + 9, class: 'sub' });
      s.textContent = sub;
      g.appendChild(s);
    }
    if (action.fav) {
      const [sx, sy] = n === 1 ? [C, C - R_OUT + 14] : pt(R_OUT - 13, mid);
      const star = el('text', { x: sx, y: sy, class: 'star' });
      star.textContent = '★';
      g.appendChild(star);
    }
    slicesEl.appendChild(g);
    slices.push({ g, action, mid, span });
  });
  updateLabels();
}

function currentLevel() {
  return state.levels[state.levels.length - 1];
}

function updateLabels() {
  const level = currentLevel();
  const hot = state.hot;
  const inChild = state.levels.length > 1;
  hubEl.classList.toggle('hot', hot === 'hub' && inChild);

  if (hot && hot !== 'hub') {
    hubPill.textContent = hot.action.sub && !hot.action.soon ? `${hot.action.label} ${hot.action.sub}` : hot.action.label;
    captionEl.textContent = hot.action.caption;
    captionEl.classList.add('hot');
    return;
  }
  captionEl.classList.remove('hot');
  if (inChild) {
    hubPill.textContent = hot === 'hub' ? '‹ Back' : state.hub;
    captionEl.textContent = hot === 'hub' ? 'Back' : state.note || level.caption;
    return;
  }
  hubPill.textContent = state.hub;
  if (!level.actions.length) {
    captionEl.textContent = state.files.length
      ? "Flick can't convert this yet"
      : state.mode === 'drag'
        ? 'Drop here'
        : 'Select a file in Explorer first';
  }
  else captionEl.textContent = state.note || (state.mode === 'drag' ? 'Drop on a slice' : 'Click an option · right-click pins it');
}

// ---------- hit testing ----------

function hitTest(x, y) {
  const dx = x - C;
  const dy = y - C;
  const d = Math.hypot(dx, dy);
  if (d < R_HUB) return 'hub';
  const reach = state.mode === 'drag' ? R_OUT + 60 : R_OUT + 14;
  if (d > reach || !slices.length) return null;
  if (slices.length === 1) return slices[0];
  const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
  const span = slices[0].span;
  const idx = Math.floor((((ang + 90 + span / 2) % 360) + 360) % 360 / span) % slices.length;
  return slices[idx];
}

function setHot(hot) {
  if (!state || hot === state.hot) return;
  if (state.hot && state.hot !== 'hub') state.hot.g.classList.remove('hot');
  state.hot = hot;
  if (hot && hot !== 'hub') hot.g.classList.add('hot');
  updateLabels();

  // in drag mode you can't click, so resting on a slice with more options (or on Back) opens it
  clearTimeout(dwellTimer);
  if (state.mode === 'drag' && hot) {
    if (hot !== 'hub' && hot.action.children) dwellTimer = setTimeout(() => openChildren(hot.action), DWELL_MS);
    else if (hot === 'hub' && state.levels.length > 1) dwellTimer = setTimeout(goBack, DWELL_MS);
  }
}

function openChildren(action) {
  state.levels.push({ actions: action.children, caption: action.caption, parent: action });
  state.hot = null;
  draw();
}

function goBack() {
  if (state.levels.length < 2) return;
  state.levels.pop();
  state.hot = null;
  draw();
}

// ---------- choosing ----------

function choose(slice, files) {
  const { action } = slice;
  if (action.soon) {
    captionEl.textContent = action.caption;
    return;
  }
  if (action.children) {
    openChildren(action);
    return;
  }
  window.flick.send('wheel:run', { actionId: action.id, files });
}

function close() {
  window.flick.send('wheel:close');
}

// ---------- events from main ----------

window.flick.on('wheel:show', (payload) => {
  clearTimeout(dwellTimer);
  state = {
    mode: payload.mode,
    files: payload.files || [],
    hub: payload.hub,
    levels: [{ actions: payload.actions || [], caption: '', parent: null }],
    hot: null,
    dropped: false,
  };
  draw();
  stage.classList.remove('open');
  requestAnimationFrame(() => requestAnimationFrame(() => stage.classList.add('open')));
  // nothing to offer in click mode: show the hint briefly, then go away
  if (state.mode === 'click' && !state.levels[0].actions.length) {
    const mine = state;
    setTimeout(() => state === mine && close(), 2200);
  }
});

window.flick.on('wheel:hide', () => {
  clearTimeout(dwellTimer);
  stage.classList.remove('open');
  state = null;
});

// The mouse button was released somewhere. If nothing was dropped on the wheel, the drag ended
// elsewhere, so the wheel goes away.
window.flick.on('wheel:pointer-up', () => {
  setTimeout(() => {
    if (state && state.mode === 'drag' && !state.dropped) close();
  }, 350);
});

// ---------- drag and drop ----------

document.addEventListener('dragenter', (e) => e.preventDefault());
document.addEventListener('dragover', (e) => {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy'; // never "move": the original file stays where it is
  if (state) setHot(hitTest(e.clientX, e.clientY));
});
document.addEventListener('dragleave', (e) => {
  if (state && (e.clientX <= 0 || e.clientY <= 0 || e.clientX >= innerWidth || e.clientY >= innerHeight)) setHot(null);
});
document.addEventListener('drop', async (e) => {
  e.preventDefault();
  if (!state) return;
  clearTimeout(dwellTimer);
  state.dropped = true;
  const files = [...e.dataTransfer.files].map((f) => window.flick.pathForFile(f)).filter(Boolean);
  if (!files.length) return close();

  const hot = hitTest(e.clientX, e.clientY);
  const known = state.files.length > 0;
  if (known && hot && hot !== 'hub' && !hot.action.soon && !hot.action.children) {
    // main checks the dropped files really match what the wheel was showing
    window.flick.send('wheel:run', { actionId: hot.action.id, files, fromDrop: true });
    return;
  }

  // Not dropped on a usable slice: keep the wheel open so an option can be clicked.
  const info = await window.flick.invoke('wheel:info', files);
  const keepLevel = known && hot && hot !== 'hub' && hot.action.children ? hot.action : null;
  state = { mode: 'click', files, hub: info.hub, levels: [{ actions: info.actions, caption: '', parent: null }], hot: null, dropped: true };
  draw();
  if (keepLevel) {
    const same = info.actions.find((a) => a.id === keepLevel.id);
    if (same) openChildren(same);
  }
  window.flick.send('wheel:sticky');
});

// ---------- mouse (click mode) ----------

document.addEventListener('mousemove', (e) => {
  if (state && state.mode === 'click') setHot(hitTest(e.clientX, e.clientY));
});
document.addEventListener('mouseleave', () => {
  if (state && state.mode === 'click') setHot(null);
});
document.addEventListener('click', (e) => {
  if (!state || state.mode !== 'click') return;
  const hot = hitTest(e.clientX, e.clientY);
  if (hot === 'hub') {
    if (state.levels.length > 1) goBack();
    else close();
  } else if (hot) choose(hot, state.files);
  else close();
});
// Right-click a slice to pin it to the top of the wheel for this kind of file; anywhere else closes.
document.addEventListener('contextmenu', async (e) => {
  e.preventDefault();
  if (!state) return;
  const hot = hitTest(e.clientX, e.clientY);
  if (!hot || hot === 'hub' || hot.action.soon || hot.action.children) {
    if (!hot) close();
    return;
  }
  const mine = state;
  const { pinned, kindName, info } = await window.flick.invoke('wheel:fav', { actionId: hot.action.id, files: state.files });
  if (state !== mine) return;
  state.levels[0].actions = info.actions;
  if (state.levels.length > 1) {
    const parent = info.actions.find((a) => a.id === state.levels[1].parent.id);
    if (parent) state.levels[1].actions = parent.children;
  }
  state.hot = null;
  state.note = pinned ? `★ Pinned for ${kindName}` : `Unpinned for ${kindName}`;
  draw();
  setTimeout(() => {
    if (state !== mine) return;
    state.note = null;
    updateLabels();
  }, 1800);
});
