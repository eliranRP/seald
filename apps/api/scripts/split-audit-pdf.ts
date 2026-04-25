import { readFileSync, writeFileSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';
async function main(): Promise<void> {
  const input = process.argv[2] ?? '/tmp/audit-sample/completed.pdf';
  const src = await PDFDocument.load(readFileSync(input));
  const dir = input.replace(/\.pdf$/, '');
  for (let i = 0; i < src.getPageCount(); i++) {
    const out = await PDFDocument.create();
    const [page] = await out.copyPages(src, [i]);
    out.addPage(page);
    writeFileSync(`${dir}-p${i + 1}.pdf`, Buffer.from(await out.save()));
    console.log(`${dir}-p${i + 1}.pdf`);
  }
}
void main();
