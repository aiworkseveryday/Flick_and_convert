# Flick

A floating bubble for Windows that converts files with a flick, inspired by the iPhone's AssistiveTouch.

Select a file in File Explorer (or drop it on the bubble), hold the bubble, and a ring of options opens
around it. Slide towards a format and let go. The bubble shows the progress and turns green when the
new file is saved next to the original.

## Status

**Phase 1 (done):** bubble with edge snapping, smart ring that faces away from the screen edge,
Explorer selection, drag-and-drop, image conversion (JPG, PNG, WEBP, HEIC input), progress ring.

**Phase 2 (done):** video to MP3/WAV/M4A, video to MP4/GIF, audio conversions (FFmpeg, real progress),
camera RAW (Sony ARW and others) to JPG in full or fast mode (LibRaw via WebAssembly), shrink video to
8/16/25/50 MB and images to 200 KB–2 MB, tap the bubble while converting to Stop.

**Coming next:**
- Phase 3: Word to PDF (via MS Word), PDF to Word, PDF merge/split/images, ZIP and unzip, passwords
- Phase 4: OCR copy text, background removal, favourites slot, keyboard shortcut, right-click menu, installer

## Run

```bash
npm install
npm start
```

Right-click the tray icon to hide the bubble or quit.
