// Reads the text layer of each PDF page (pdf.js). Scanned PDFs have none; the caller then uses OCR.
import * as pdfjs from '../node_modules/pdfjs-dist/build/pdf.mjs';

pdfjs.GlobalWorkerOptions.workerSrc = new URL('../node_modules/pdfjs-dist/build/pdf.worker.mjs', import.meta.url).href;

export async function run({ file }, progress) {
  let doc;
  const task = pdfjs.getDocument({ data: await window.helperApi.read(file), isEvalSupported: false });
  try {
    doc = await task.promise;
  } catch (e) {
    if (e && e.name === 'PasswordException') throw new Error('This PDF is password protected');
    throw e;
  }
  const pages = [];
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      let text = '';
      for (const item of content.items) {
        if (typeof item.str !== 'string') continue;
        text += item.str;
        if (item.hasEOL) text += '\n';
        else if (item.str && !item.str.endsWith(' ')) text += ' ';
      }
      pages.push(text.replace(/[ \t]+\n/g, '\n').trim());
      page.cleanup();
      progress(n / doc.numPages);
    }
  } finally {
    await task.destroy();
  }
  return { pages };
}
