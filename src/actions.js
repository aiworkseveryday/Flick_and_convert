// Decides which options the smart ring shows for the selected files.
const fs = require('fs');
const path = require('path');

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

// soon: shown greyed out on the ring until a later phase builds it
const SOON = {
  raw: [
    { id: 'raw-jpg-full', label: 'JPG', sub: 'full' },
    { id: 'raw-jpg-fast', label: 'JPG', sub: 'fast' },
  ],
  video: [
    { id: 'video-mp3', label: 'MP3' },
    { id: 'video-wav', label: 'WAV' },
    { id: 'video-gif', label: 'GIF' },
    { id: 'video-mp4', label: 'MP4' },
    { id: 'video-compress', label: 'Shrink' },
  ],
  audio: [
    { id: 'audio-mp3', label: 'MP3' },
    { id: 'audio-wav', label: 'WAV' },
    { id: 'audio-aac', label: 'AAC' },
  ],
  word: [{ id: 'word-pdf', label: 'PDF' }],
  pdf: [
    { id: 'pdf-word', label: 'Word' },
    { id: 'pdf-images', label: 'Images' },
    { id: 'pdf-merge', label: 'Merge' },
    { id: 'pdf-compress', label: 'Shrink' },
  ],
  archive: [{ id: 'unzip', label: 'Extract' }],
  folder: [{ id: 'zip', label: 'ZIP' }],
  other: [{ id: 'zip', label: 'ZIP' }],
};

function actionsFor(files) {
  if (!files || files.length === 0) return { kind: 'none', actions: [] };
  const kinds = [...new Set(files.map(kindOf))].filter((k) => k !== 'missing');
  if (kinds.length === 0) return { kind: 'none', actions: [] };
  if (kinds.length > 1) {
    return { kind: 'mixed', actions: [{ id: 'zip', label: 'ZIP', soon: true }] };
  }
  const kind = kinds[0];

  if (kind === 'image') {
    const actions = [];
    if (!sameFormat(files, ['jpg', 'jpeg'])) actions.push({ id: 'img-jpg', label: 'JPG' });
    if (!sameFormat(files, ['png'])) actions.push({ id: 'img-png', label: 'PNG' });
    if (!sameFormat(files, ['webp'])) actions.push({ id: 'img-webp', label: 'WEBP' });
    actions.push({ id: 'img-bg', label: 'No BG', soon: true });
    actions.push({ id: 'img-ocr', label: 'Text', soon: true });
    actions.push({ id: 'zip', label: 'ZIP', soon: true });
    return { kind, actions };
  }

  return { kind, actions: (SOON[kind] || []).map((a) => ({ ...a, soon: true })) };
}

module.exports = { actionsFor, kindOf, extOf };
