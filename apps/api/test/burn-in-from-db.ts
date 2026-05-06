/**
 * Runs the REAL burnInField() on a real envelope's PDF + fields from the API.
 *
 * Usage: pnpm --filter api exec ts-node test/burn-in-from-db.ts
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { burnInField } from '../src/sealing/burn-in-fields';

const API = 'https://api.seald.nromomentum.com';
const ENV_ID = '08734d14-6331-4920-b7f9-b9d07ae05a62';

async function getJwt(): Promise<string> {
  // Generate a magic link via admin API and exchange it for a session
  const SERVICE_KEY =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhzamxpaGhjd3ZqdnlicHN6anNhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Njk0MDA5NSwiZXhwIjoyMDkyNTE2MDk1fQ.HOWd9NiyW2Xh2uBeohoqqB4tvk5fXvLyhiE04a9dYFA';
  const API_KEY = 'sb_publishable_5goJHraLJsJbmAGC7BnHdQ_Zyg_BiWH';
  const SUPABASE = 'https://hsjlihhcwvjvybpszjsa.supabase.co';

  // Generate link
  const linkRes = await fetch(`${SUPABASE}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: {
      apikey: API_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ type: 'magiclink', email: 'eliranazulay@gmail.com' }),
  });
  const linkData = (await linkRes.json()) as { action_link: string };
  const actionLink = linkData.action_link;

  // Follow the link to get the access token from the redirect URL fragment
  const redirectRes = await fetch(actionLink, { redirect: 'manual' });
  const location = redirectRes.headers.get('location') ?? '';
  const match = location.match(/access_token=([^&]+)/);
  if (!match) {
    // Try following the redirect
    const followRes = await fetch(actionLink, { redirect: 'follow' });
    const finalUrl = followRes.url;
    const match2 = finalUrl.match(/access_token=([^&]+)/);
    if (!match2) throw new Error(`No access_token in redirect: ${location || finalUrl}`);
    return match2[1]!;
  }
  return match[1]!;
}

async function run() {
  console.log('Getting JWT...');
  const jwt = await getJwt();
  console.log('JWT acquired');

  // 1. Get envelope data
  console.log('Fetching envelope...');
  const envRes = await fetch(`${API}/envelopes/${ENV_ID}`, {
    headers: { Authorization: `Bearer ${jwt}` },
  });
  const envelope = (await envRes.json()) as {
    fields: Array<{
      kind: string;
      page: number;
      x: number;
      y: number;
      width: number;
      height: number;
      value_text: string | null;
      value_boolean: boolean | null;
    }>;
  };
  console.log(`Fields: ${envelope.fields.length}`);

  // 2. Download original PDF
  console.log('Downloading original PDF...');
  const dlRes = await fetch(`${API}/envelopes/${ENV_ID}/download?kind=original`, {
    headers: { Authorization: `Bearer ${jwt}` },
  });
  const dlData = (await dlRes.json()) as { url: string };
  const pdfRes = await fetch(dlData.url);
  const pdfBytes = Buffer.from(await pdfRes.arrayBuffer());
  console.log(`PDF size: ${pdfBytes.length} bytes`);

  // 3. Load PDF and run burnInField for each field
  const pdf = await PDFDocument.load(pdfBytes);
  const helvetica = await pdf.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pages = pdf.getPages();
  console.log(
    `PDF pages: ${pages.length}, size: ${pages[0]!.getWidth()}x${pages[0]!.getHeight()} pt`,
  );

  // Create fake signature/initials images (green rectangles with text)
  const { createCanvas } = await import('canvas');
  const sigCanvas = createCanvas(400, 120);
  const sigCtx = sigCanvas.getContext('2d');
  sigCtx.fillStyle = '#22c55e';
  sigCtx.fillRect(0, 0, 400, 120);
  sigCtx.fillStyle = '#000';
  sigCtx.font = 'bold 40px sans-serif';
  sigCtx.fillText('Eliran Azulay', 20, 75);
  const sigImg = await pdf.embedPng(sigCanvas.toBuffer('image/png'));

  const iniCanvas = createCanvas(160, 120);
  const iniCtx = iniCanvas.getContext('2d');
  iniCtx.fillStyle = '#86efac';
  iniCtx.fillRect(0, 0, 160, 120);
  iniCtx.fillStyle = '#000';
  iniCtx.font = 'bold 48px sans-serif';
  iniCtx.fillText('EA', 30, 80);
  const initialsImg = await pdf.embedPng(iniCanvas.toBuffer('image/png'));

  // Fill in text values for fields that don't have them from DB
  const fieldsToRender = envelope.fields;
  for (const f of fieldsToRender) {
    if (f.kind === 'date') f.value_text = '2026-05-06';
    if (f.kind === 'text') f.value_text = 'sample text';
    if (f.kind === 'email') f.value_text = 'eliranazulay@gmail.com';
    if (f.kind === 'checkbox') f.value_boolean = true;
  }

  for (const f of fieldsToRender) {
    const pageIdx = Math.max(0, f.page - 1);
    if (pageIdx >= pages.length) continue;
    burnInField(pages[pageIdx]!, f, {
      sigImg,
      initialsImg,
      helvetica,
      helveticaBold,
    });
    console.log(`  Burned ${f.kind} on page ${f.page} at (${f.x}, ${f.y})`);
  }

  // 4. Save result
  const outPath = resolve(__dirname, '../../../Calibration-burned.pdf');
  writeFileSync(outPath, await pdf.save());
  console.log(`\nSaved: ${outPath}`);
}

run().catch(console.error);
