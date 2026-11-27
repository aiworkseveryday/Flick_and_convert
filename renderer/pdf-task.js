// Draws each PDF page and saves it as a JPG (pdf.js). `scale` overrides the default 2 (144 dpi).
import * as pdfjs from '../node_modules/pdfjs-dist/build/pdf.mjs';

pdfjs.GlobalWorkerOptions.workerSrc = new URL('../node_modules/pdfjs-dist/build/pdf.worker.mjs', import.meta.url).href;

const SCALE = 2; // 144 dpi: sharp text without huge files

export async function run({ file, dir, base, scale }, progress) {
  let doc;
  const task = pdfjs.getDocument({ data: await window.helperApi.read(file), isEvalSupported: false });
  try {
    doc = await task.promise;
  } catch (e) {
    if (e && e.name === 'PasswordException') throw new Error('This PDF is password protected');
    throw e;
  }
  const pad = String(doc.numPages).length;
  const outputs = [];
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const viewport = page.getViewport({ scale: scale || SCALE });
      const canvas = new OffscreenCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff'; // PDFs assume white paper
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, canvas, viewport }).promise;
      const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.92 });
      const out = `${dir}\\${base} - page ${String(n).padStart(pad, '0')}.jpg`;
      await window.helperApi.write(out, new Uint8Array(await blob.arrayBuffer()));
      outputs.push(out);
      page.cleanup();
      progress(n / doc.numPages);
    }
  } finally {
    await task.destroy();
  }
  return { outputs };
}
