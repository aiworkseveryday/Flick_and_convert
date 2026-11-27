// Decides which options the smart ring shows for the selected files.
const fs = require('fs');
const path = require('path');
const settings = require('./settings');

const KINDS = {
  image: ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'gif', 'tif', 'tiff', 'avif'],
  raw: ['arw', 'cr2', 'cr3', 'nef', 'dng', 'raf', 'orf', 'rw2'],
  video: ['mp4', 'mkv', 'mov', 'avi', 'webm', 'm4v', 'wmv', 'flv'],
  audio: ['mp3', 'wav', 'aac', 'm4a', 'flac', 'ogg', 'opus', 'wma'],
  word: ['doc', 'docx', 'rtf', 'odt'],
  pdf: ['pdf'],
  archive: ['zip', 'rar', '7z', 'tar', 'gz'],
};

function extOf(file) {
  return path.extname(file).slice(1).toLowerCase();
}

function kindOf(file) {
  try {
    if (fs.statSync(file).isDirectory()) return 'folder';
  } catch {
    return 'missing';
  }
  const ext = extOf(file);
  for (const [kind, exts] of Object.entries(KINDS)) if (exts.includes(ext)) return kind;
  return 'other';
}

const sameFormat = (files, exts) => files.every((f) => exts.includes(extOf(f)));

const VIDEO_SIZES = [
  { id: 'video-shrink-8', label: '8 MB', sub: 'Discord' },
  { id: 'video-shrink-16', label: '16 MB', sub: 'WhatsApp' },
  { id: 'video-shrink-25', label: '25 MB', sub: 'Email' },
  { id: 'video-shrink-50', label: '50 MB' },
];
const IMAGE_SIZES = [
  { id: 'img-shrink-200', label: '200 KB' },
  { id: 'img-shrink-500', label: '500 KB' },
  { id: 'img-shrink-1024', label: '1 MB' },
  { id: 'img-shrink-2048', label: '2 MB' },
];
const PDF_SIZES = [
  { id: 'pdf-shrink-smaller', label: 'Smaller', sub: 'good quality' },
  { id: 'pdf-shrink-smallest', label: 'Smallest', sub: 'lower quality' },
];
const ZIP_OPTIONS = [
  { id: 'zip', label: 'ZIP' },
  { id: 'zip-lock', label: 'ZIP', sub: 'password' },
];
const ZIP_MENU = { id: 'zip-menu', label: 'ZIP', children: ZIP_OPTIONS };

function actionsFor(files) {
  if (!files || files.length === 0) return { kind: 'none', actions: [] };
  const kinds = [...new Set(files.map(kindOf))].filter((k) => k !== 'missing');
  if (kinds.length === 0) return { kind: 'none', actions: [] };
  const kind = kinds.length > 1 ? 'mixed' : kinds[0];
  return { kind, actions: optionsFor(kind, files) };
}

// The options for one kind of file. Only the files' names and count matter here.
function optionsFor(kind, files) {
  const many = files.length > 1;

  switch (kind) {
    case 'image': {
      const actions = [];
      if (!sameFormat(files, ['jpg', 'jpeg'])) actions.push({ id: 'img-jpg', label: 'JPG' });
      if (!sameFormat(files, ['png'])) actions.push({ id: 'img-png', label: 'PNG' });
      if (!sameFormat(files, ['webp'])) actions.push({ id: 'img-webp', label: 'WEBP' });
      actions.push({ id: 'img-pdf', label: 'PDF', sub: many ? 'one file' : undefined });
      actions.push({ id: 'img-shrink', label: 'Shrink', children: IMAGE_SIZES });
      actions.push({ id: 'img-bg', label: 'No BG' });
      actions.push({ id: 'img-ocr', label: 'Text' });
      actions.push(ZIP_MENU);
      return actions;
    }
    case 'raw':
      return [{ id: 'raw-jpg-full', label: 'JPG', sub: 'full' }, { id: 'raw-jpg-fast', label: 'JPG', sub: 'fast' }, ZIP_MENU];
    case 'video': {
      const actions = [
        { id: 'media-mp3', label: 'MP3' },
        { id: 'media-wav', label: 'WAV' },
        { id: 'media-aac', label: 'M4A' },
        { id: 'video-gif', label: 'GIF' },
      ];
      if (!sameFormat(files, ['mp4'])) actions.push({ id: 'video-mp4', label: 'MP4' });
      actions.push({ id: 'video-shrink', label: 'Shrink', children: VIDEO_SIZES });
      actions.push(ZIP_MENU);
      return actions;
    }
    case 'audio': {
      const actions = [];
      if (!sameFormat(files, ['mp3'])) actions.push({ id: 'media-mp3', label: 'MP3' });
      if (!sameFormat(files, ['wav'])) actions.push({ id: 'media-wav', label: 'WAV' });
      if (!sameFormat(files, ['m4a', 'aac'])) actions.push({ id: 'media-aac', label: 'M4A' });
      actions.push(ZIP_MENU);
      return actions;
    }
    case 'word':
      return [{ id: 'word-pdf', label: 'PDF' }, ZIP_MENU];
    case 'pdf': {
      const actions = [{ id: 'pdf-word', label: 'Word' }, { id: 'pdf-images', label: 'Images' }];
      if (many) actions.push({ id: 'pdf-merge', label: 'Merge' });
      else actions.push({ id: 'pdf-split', label: 'Split' });
      actions.push({ id: 'pdf-lock', label: 'Lock' });
      actions.push({ id: 'pdf-shrink', label: 'Shrink', children: PDF_SIZES });
      actions.push({ id: 'pdf-text', label: 'Text' });
      actions.push(ZIP_MENU);
      return actions;
    }
    case 'archive':
      return [{ id: 'unzip', label: 'Extract' }];
    default:
      // folders, other files and mixed selections
      return ZIP_OPTIONS;
  }
}

// Text for the caption pill under the wheel.
const CAPTIONS = {
  'img-pdf': 'Make a PDF',
  'img-shrink': 'Shrink to a size',
  'video-shrink': 'Shrink to a size',
  'zip-menu': 'Make a ZIP',
  zip: 'Make a ZIP',
  'zip-lock': 'ZIP with a password',
  'pdf-images': 'Save pages as images',
  'pdf-split': 'One PDF per page',
  'pdf-merge': 'Merge into one PDF',
  'pdf-lock': 'Add a password',
  unzip: 'Extract here',
  'raw-jpg-full': 'JPG from the full RAW',
  'raw-jpg-fast': 'JPG from the built-in preview',
  'img-bg': 'Remove the background',
  'img-ocr': 'Copy the text',
  'pdf-text': 'Copy the text',
  'pdf-shrink': 'Make the PDF smaller',
  'pdf-shrink-smaller': 'Smaller, photos stay sharp',
  'pdf-shrink-smallest': 'Smallest file',
};

function captionFor(action) {
  if (action.fav) return `★ ${captionFor({ ...action, fav: false })}`;
  if (action.soon) return `${action.label} is coming soon`;
  if (CAPTIONS[action.id]) return CAPTIONS[action.id];
  if (/-shrink-/.test(action.id)) return `Shrink to ${action.label}`;
  return `Convert to ${action.label}`;
}

// Adds captions to a tree of actions.
function withCaptions(actions) {
  return actions.map((a) => ({ ...a, caption: captionFor(a), children: a.children ? withCaptions(a.children) : undefined }));
}

// Short label for the wheel's hub: "ARW", "PDF", "3 JPG", "3 files", "FOLDER".
function hubLabel(files) {
  if (!files || !files.length) return 'Drop';
  const exts = [...new Set(files.map((f) => (kindOf(f) === 'folder' ? 'FOLDER' : extOf(f).toUpperCase() || 'FILE')))];
  if (exts.length === 1) return files.length > 1 ? `${files.length} ${exts[0]}` : exts[0];
  return `${files.length} files`;
}

// Names for each kind of file, used in Settings and the pin message.
const KIND_NAMES = {
  image: 'images',
  raw: 'RAW photos',
  video: 'videos',
  audio: 'audio files',
  word: 'Word files',
  pdf: 'PDFs',
  archive: 'archives',
  folder: 'folders',
  other: 'other files',
  mixed: 'mixed files',
};

function findAction(list, id, parent = null) {
  for (const a of list) {
    if (a.id === id && !a.children) return { action: a, parent };
    if (a.children) {
      const found = findAction(a.children, id, a);
      if (found) return found;
    }
  }
  return null;
}

// The pinned option for this kind of file goes first (the top slot) with a star. A pinned size
// such as Shrink > 16 MB is copied up to the main wheel so it's one move away.
function withFavourite(kind, actions) {
  const id = (settings.get('favourites') || {})[kind];
  const found = id && findAction(actions, id);
  if (!found || found.action.soon) return actions;
  const { action, parent } = found;
  if (!parent) return [{ ...action, fav: true }, ...actions.filter((a) => a !== action)];
  const sub = parent.id === 'zip-menu' ? action.sub : parent.label;
  return [{ ...action, sub, fav: true }, ...actions];
}

// Pins actionId for the kind of these files, or unpins it if it was already pinned.
function toggleFavourite(actionId, files) {
  const { kind } = actionsFor(files);
  const favs = { ...(settings.get('favourites') || {}) };
  const pinned = favs[kind] !== actionId;
  if (pinned) favs[kind] = actionId;
  else delete favs[kind];
  settings.set('favourites', favs);
  return { pinned, kindName: KIND_NAMES[kind] || 'these files' };
}

// Pinned options for the Settings list: [{ kind, kindName, label }]
function favouriteList() {
  const labels = {};
  const walk = (list, parent) =>
    list.forEach((a) => {
      if (a.children) walk(a.children, a);
      else labels[a.id] = parent && parent.id !== 'zip-menu' ? `${parent.label} ${a.label}` : a.sub ? `${a.label} (${a.sub})` : a.label;
    });
  const SAMPLES = { image: 'a.png', raw: 'a.arw', video: 'a.mkv', audio: 'a.flac', word: 'a.docx', pdf: 'a.pdf', archive: 'a.zip', other: 'a' };
  for (const [kind, name] of Object.entries(SAMPLES)) {
    walk(optionsFor(kind, [name]), null);
    walk(optionsFor(kind, [name, name]), null); // options for several files, such as Merge
  }
  return Object.entries(settings.get('favourites') || {}).map(([kind, id]) => ({
    kind,
    kindName: KIND_NAMES[kind] || kind,
    label: labels[id] || id,
  }));
}

function wheelFor(files) {
  const { kind, actions } = actionsFor(files);
  return { kind, actions: withCaptions(withFavourite(kind, actions)), hub: hubLabel(files) };
}

module.exports = { actionsFor, wheelFor, hubLabel, kindOf, extOf, toggleFavourite, favouriteList };
