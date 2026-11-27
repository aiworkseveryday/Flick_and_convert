# Flick

Convert files with a flick, right where they are. A Windows tray app.

Hold **Shift** and start dragging a file in File Explorer: a sliced wheel appears under the cursor with the
options for that file. Drop the file on a slice and a small card shows the progress; the result is saved
next to the original (or in one folder you choose).

## Ways to open the wheel

- **Shift + drag** a file in File Explorer, then drop it on a slice
- **Ctrl + Alt + F** opens the wheel for the files selected in Explorer
- **Right-click** files or folders › *Show more options* › **Convert with Flick** (Shift + right-click goes straight there)
- Drop files on the **Settings** window (click the tray icon), or click its drop zone to pick files
- The **shelf**: a see-through basket for collecting files from different folders. Click a file (or
  *Convert all*) to open the wheel, or drag files back out into other apps. Finished files land there too.

Slices with `•••` (Shrink, ZIP) open a second wheel; rest on them while dragging, and on the hub to go back.
**Right-click a slice** to pin it as the favourite for that kind of file: it moves to the top with a ★
(a pinned size such as Shrink › 16 MB comes up to the main wheel). Pins are listed in Settings.
Everything follows the Windows light/dark theme.

## What it converts

- **Images:** JPG, PNG, WEBP (HEIC input), images to one PDF, shrink to 200 KB–2 MB
- **Remove the background** (BiRefNet AI model, offline, about 30–45 s on a laptop CPU) → transparent PNG
- **Copy the text** from images (Tesseract OCR, English) and PDFs (text layer, or OCR for scans): copied to the
  clipboard and saved as a .txt
- **Camera RAW** (Sony ARW and others): JPG from the full RAW or the built-in preview (LibRaw, WebAssembly)
- **Video / audio:** MP3, WAV, M4A, MP4, GIF, shrink video to 8/16/25/50 MB (FFmpeg)
- **Word ↔ PDF** through the installed Microsoft Word
- **PDF:** images, split, merge, lock with a password (qpdf, AES-256), shrink (recompresses the photos inside;
  text stays sharp and selectable)
- **Archives:** ZIP, ZIP with a password, extract ZIP / 7z / tar.gz (7-Zip) and RAR

Everything runs on the PC; nothing is uploaded.

## Run

```bash
npm install
npm start          # dev run
npm run dist       # Windows installer: release/Flick-Setup-<version>.exe (per user, no admin)
```

The background removal model isn't in git (162 MB); see [scripts/get-model.md](scripts/get-model.md) to build it into
`models/` before `npm run dist`.

Flick lives in the tray. Click the tray icon for settings; right-click it to open the shelf or quit.
