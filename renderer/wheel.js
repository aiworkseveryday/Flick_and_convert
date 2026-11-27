// The sliced wheel.
//   drag mode:  opened by Shift + drag in Explorer. Hover a slice and drop the file on it.
//               Hovering a slice that has more options (Shrink, ZIP) opens them after a moment.
//   click mode: opened by the shortcut, the shelf, or after a drop on the hub. Click a slice.
// The layout comes from main: a full wheel, or a half wheel (fan) opening out of a shelf corner.
const SVG = 'http://www.w3.org/2000/svg';
const GAP = 16; // includes the 10px rounding stroke, so about 6px shows
const DWELL_MS = 550;

const stage = document.getElementById('stage');
const svgEl = document.getElementById('wheel');
const slicesEl = document.getElementById('slices');
const hubEl = document.getElementById('hub');
const hubPill = document.getElementById('hubPill');
const captionEl = document.getElementById('caption');

// sizes and angles of the current layout (see src/wheel.js); angles are SVG degrees, 0 = right, 90 = down
let L = null;
let state = null; // { mode, files, hub, levels: [{ actions, caption, parent }], hot, dropped }
let slices = [];
let dwellTimer = null;

// ---------- drawing ----------

const rad = (deg) => (deg * Math.PI) / 180;
const pt = (r, deg) => [L.cx + r * Math.cos(rad(deg)), L.cy + r * Math.sin(rad(deg))];

function sectorPath(a0, a1) {
  const { rIn, rOut } = L;
  const po = ((GAP / 2 / rOut) * 180) / Math.PI;
  const pi = ((GAP / 2 / rIn) * 180) / Math.PI;
  const [ox0, oy0] = pt(rOut, a0 + po);
  const [ox1, oy1] = pt(rOut, a1 - po);
  const [ix1, iy1] = pt(rIn, a1 - pi);
  const [ix0, iy0] = pt(rIn, a0 + pi);
  const largeO = a1 - a0 - 2 * po > 180 ? 1 : 0;
  const largeI = a1 - a0 - 2 * pi > 180 ? 1 : 0;
  return `M${ox0},${oy0} A${rOut},${rOut} 0 ${largeO} 1 ${ox1},${oy1} L${ix1},${iy1} A${rIn},${rIn} 0 ${largeI} 0 ${ix0},${iy0} Z`;
}

function ringPath() {
  // a single option fills the whole ring
  const { cx, cy } = L;
  const o = L.rOut - 5;
  const i = L.rIn + 5;
  return `M${cx - o},${cy} a${o},${o} 0 1 0 ${2 * o},0 a${o},${o} 0 1 0 ${-2 * o},0 Z M${cx - i},${cy} a${i},${i} 0 1 1 ${2 * i},0 a${i},${i} 0 1 1 ${-2 * i},0 Z`;
}

// a full circle, or for a fan the half facing away from the shelf
function discPath(r) {
  const { cx, cy } = L;
  if (L.kind === 'wheel') return `M${cx - r},${cy} a${r},${r} 0 1 0 ${2 * r},0 a${r},${r} 0 1 0 ${-2 * r},0 Z`;
  return `M${cx},${cy - r} A${r},${r} 0 0 ${L.side === 'left' ? 0 : 1} ${cx},${cy + r} Z`;
}

// The edge the first slice starts from, and which way round the slices go. The wheel's first slice
// is centred at the top; a fan's first slice starts at the top and the rest go down the far side.
const startAngle = (span) => (L.kind === 'wheel' ? -90 - span / 2 : L.start);
const dirOf = () => (L.kind === 'wheel' ? 1 : L.dir);

function applyLayout(layout) {
  L = layout;
  stage.classList.toggle('fan', L.kind === 'fan');
  Object.assign(stage.style, { width: `${L.w}px`, height: `${L.h}px`, transformOrigin: `${L.cx}px ${L.cy}px` });
  const svgH = L.captionY - 6;
  svgEl.setAttribute('width', L.w);
  svgEl.setAttribute('height', svgH);
  svgEl.setAttribute('viewBox', `0 0 ${L.w} ${svgH}`);
  for (const id of ['rim', 'rimGloss']) document.getElementById(id).setAttribute('d', discPath(L.rim));
  document.getElementById('hubWell').setAttribute('d', discPath(L.rHub));
  hubEl.setAttribute('d', discPath(L.hub));
  // a fan's hub pill sits in the visible half of its hub
  const pillX = L.kind === 'wheel' ? L.cx : L.cx + (L.side === 'left' ? -1 : 1) * (L.hub / 2 + 2);
  Object.assign(hubPill.style, { left: `${pillX}px`, top: `${L.cy}px` });
  // the caption sits under the wheel, or for a fan lines up with the shelf edge
  const cap = { top: `${L.captionY}px`, left: '', right: '' };
  if (L.kind === 'wheel') cap.left = `${L.cx}px`;
  else if (L.side === 'left') cap.right = '6px';
  else cap.left = '6px';
  Object.assign(captionEl.style, cap);
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
  const span = L.sweep / n;
  const first = startAngle(span);
  const ring = n === 1 && L.kind === 'wheel'; // a fan's single option is still a half ring
  level.actions.forEach((action, i) => {
    const mid = first + dirOf() * (i + 0.5) * span;
    const g = el('g', { class: 'slice' + (action.soon ? ' soon' : '') + (action.fav ? ' fav' : '') });
    const path = el('path', { d: ring ? ringPath() : sectorPath(mid - span / 2, mid + span / 2), 'fill-rule': 'evenodd' });
    g.appendChild(path);

    const rText = (L.rIn + L.rOut) / 2 + 4;
    const [tx, ty] = ring ? [L.cx, L.cy - rText] : pt(rText, mid);
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
      const [sx, sy] = ring ? [L.cx, L.cy - L.rOut + 14] : pt(L.rOut - 13, mid);
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
  const dx = x - L.cx;
  const dy = y - L.cy;
  const d = Math.hypot(dx, dy);
  if (d < L.rHub) return 'hub';
  const reach = state.mode === 'drag' ? L.rOut + 60 : L.rOut + 14;
  if (d > reach || !slices.length) return null;
  const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
  const span = slices[0].span;
  // how far round from the first slice's edge, going the way the slices go
  const along = (((dirOf() * (ang - startAngle(span))) % 360) + 360) % 360;
  if (along >= L.sweep) return null;
  return slices[Math.min(Math.floor(along / span), slices.length - 1)];
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
  applyLayout(payload.layout);
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
