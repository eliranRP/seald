import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument, PageSizes, degrees } from 'pdf-lib';

const dir = join(dirname(fileURLToPath(import.meta.url)), '../src/sealing/__tests__/fixtures');
mkdirSync(dir, { recursive: true });

async function save(name, build) {
  const doc = await PDFDocument.create();
  build(doc);
  writeFileSync(join(dir, name), await doc.save());
}

await save('letter.pdf', (doc) => {
  doc.addPage(PageSizes.Letter);
});
await save('a4.pdf', (doc) => {
  doc.addPage(PageSizes.A4);
});
await save('mixed-letter-a4-legal.pdf', (doc) => {
  doc.addPage(PageSizes.Letter);
  doc.addPage(PageSizes.A4);
  doc.addPage(PageSizes.Legal);
});
await save('letter-rotate-90.pdf', (doc) => {
  const page = doc.addPage(PageSizes.Letter);
  page.setRotation(degrees(90));
});
await save('letter-rotate-270.pdf', (doc) => {
  const page = doc.addPage(PageSizes.Letter);
  page.setRotation(degrees(270));
});
await save('letter-crop-36.pdf', (doc) => {
  const page = doc.addPage(PageSizes.Letter);
  const [width, height] = PageSizes.Letter;
  page.setCropBox(36, 36, width - 72, height - 72);
});
