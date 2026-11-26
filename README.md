# Flick

A floating bubble for Windows that converts files with a flick, inspired by the iPhone's AssistiveTouch.

Select a file in File Explorer (or drop it on the bubble), hold the bubble, and a ring of options opens
around it. Slide towards a format and let go. The bubble shows the progress and turns green when the
new file is saved next to the original.

## Status

**Phase 1 (done):** bubble with edge snapping, smart ring that faces away from the screen edge,
Explorer selection, drag-and-drop, image conversion (JPG, PNG, WEBP, HEIC input), progress ring.

**Coming next:**
- Phase 2: video to audio and other video conversions (FFmpeg), Sony ARW to JPG (full or fast), compress to size
- Phase 3: Word to PDF (via MS Word), PDF to Word, PDF merge/split/images, ZIP and unzip, passwords
- Phase 4: OCR copy text, background removal, favourites slot, keyboard shortcut, right-click menu, installer

## Run

```bash
npm install
npm start
```

Right-click the tray icon to hide the bubble or quit.
