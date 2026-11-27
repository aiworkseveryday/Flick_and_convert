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
  const many = files.length > 1;

  switch (kind) {
    case 'image': {
      const actions = [];
      if (!sameFormat(files, ['jpg', 'jpeg'])) actions.push({ id: 'img-jpg', label: 'JPG' });
      if (!sameFormat(files, ['png'])) actions.push({ id: 'img-png', label: 'PNG' });
      if (!sameFormat(files, ['webp'])) actions.push({ id: 'img-webp', label: 'WEBP' });
      actions.push({ id: 'img-pdf', label: 'PDF', sub: many ? 'one file' : undefined });
      actions.push({ id: 'img-shrink', label: 'Shrink', children: IMAGE_SIZES });
      actions.push({ id: 'img-bg', label: 'No BG', soon: true });
      actions.push({ id: 'img-ocr', label: 'Text', soon: true });
      actions.push(ZIP_MENU);
      return { kind, actions };
    }
    case 'raw':
      return {
        kind,
        actions: [{ id: 'raw-jpg-full', label: 'JPG', sub: 'full' }, { id: 'raw-jpg-fast', label: 'JPG', sub: 'fast' }, ZIP_MENU],
      };
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
      return { kind, actions };
    }
    case 'audio': {
      const actions = [];
      if (!sameFormat(files, ['mp3'])) actions.push({ id: 'media-mp3', label: 'MP3' });
      if (!sameFormat(files, ['wav'])) actions.push({ id: 'media-wav', label: 'WAV' });
      if (!sameFormat(files, ['m4a', 'aac'])) actions.push({ id: 'media-aac', label: 'M4A' });
      actions.push(ZIP_MENU);
      return { kind, actions };
    }
    case 'word':
      return { kind, actions: [{ id: 'word-pdf', label: 'PDF' }, ZIP_MENU] };
    case 'pdf': {
      const actions = [{ id: 'pdf-word', label: 'Word' }, { id: 'pdf-images', label: 'Images' }];
      if (many) actions.push({ id: 'pdf-merge', label: 'Merge' });
      else actions.push({ id: 'pdf-split', label: 'Split' });
      actions.push({ id: 'pdf-lock', label: 'Lock' });
      actions.push({ id: 'pdf-shrink', label: 'Shrink', soon: true });
      actions.push(ZIP_MENU);
      return { kind, actions };
    }
    case 'archive':
      return { kind, actions: [{ id: 'unzip', label: 'Extract' }] };
    default:
      // folders, other files and mixed selections
      return { kind, actions: ZIP_OPTIONS };
  }
}

module.exports = { actionsFor, kindOf, extOf };
