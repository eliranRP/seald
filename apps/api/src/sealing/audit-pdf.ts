import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, PDFFont, PDFImage, PDFPage, rgb, type Color } from 'pdf-lib';
import QRCode from 'qrcode';
import type { SignerAuditDetail } from '../envelopes/envelopes.repository';
import type { Envelope, EnvelopeEvent, EnvelopeSigner } from '../envelopes/envelope.entity';

/**
 * Audit trail PDF renderer.
 *
 * Produces the 4-page evidentiary document shown in
 * `Design-Guide/project/audit-trail.html`:
 *
 *   Page 1 — Document evidence & access (meta grid, SHA-256 hash cards,
 *            verify/QR card, eIDAS seal ornament)
 *   Page 2 — Participants & events (proposer + signers, per-signer events
 *            table, trust bar)
 *   Page 3 — Terms & definitions (glossary items 01–08)
 *   Page 4 — Terms & definitions continued (items 09–14, reference links)
 *
 * Typography follows the Sealed design tokens:
 *   serif:  Source Serif 4 (titles, participant names, brand word)
 *   sans:   Inter (labels, body, CTAs)
 *   mono:   JetBrains Mono (hashes, IPs, identifiers, timestamps)
 *   script: Caveat (signature mark, decorative brand "Sealed" in seal)
 *
 * This module owns nothing about IO. Its sole public surface is
 * `buildAuditPdf`, which takes a full snapshot of envelope + events + audit
 * details and returns a PDF buffer. That keeps the renderer pure and makes
 * it trivially testable in isolation.
 */

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface AuditPdfInput {
  readonly envelope: Envelope;
  /** All envelope_events, ordered ascending by created_at (the repo already
   *  sorts them; renderer trusts input order). */
  readonly events: ReadonlyArray<EnvelopeEvent>;
  /** Per-signer metadata not exposed on the domain Signer (signature_format,
   *  verification_checks, signing_ip). Keyed by signer_id. */
  readonly signerDetails: ReadonlyArray<SignerAuditDetail>;
  /** SHA-256 hex of the sealed PDF. `null` for audit_only jobs where no
   *  sealed artifact exists (declined / expired). */
  readonly sealedSha256: string | null;
  /** Public URL origin (e.g. "https://seald.nromomentum.com"), trailing slash
   *  stripped. Verify URL is `${publicUrl}/verify/{short_code}`. */
  readonly publicUrl: string;
}

export async function buildAuditPdf(input: AuditPdfInput): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);

  const fonts = await loadFonts(pdf);
  const verifyUrl = `${input.publicUrl.replace(/\/$/, '')}/verify/${input.envelope.short_code}`;
  const qrImage = await embedQr(pdf, verifyUrl);

  pdf.setTitle(`Audit trail — ${input.envelope.title}`);
  pdf.setAuthor('Sealed');
  pdf.setCreator('Sealed');
  pdf.setSubject(`Audit trail for ${input.envelope.short_code}`);

  const ctx: RenderCtx = {
    pdf,
    fonts,
    envelope: input.envelope,
    events: input.events,
    detailsBySigner: indexBy(input.signerDetails, (d) => d.signer_id),
    sealedSha256: input.sealedSha256,
    qrImage,
    verifyUrl,
    totalPages: 4,
  };

  renderPage1(ctx);
  renderPage2(ctx);
  renderPage3(ctx);
  renderPage4(ctx);

  const out = await pdf.save({ useObjectStreams: false });
  return Buffer.from(out);
}

// ---------------------------------------------------------------------------
// Typography — Sealed design tokens
// ---------------------------------------------------------------------------

interface Fonts {
  readonly serif: PDFFont;
  readonly serifMedium: PDFFont;
  readonly sans: PDFFont;
  readonly sansBold: PDFFont;
  readonly mono: PDFFont;
  readonly script: PDFFont;
}

const FONTS_DIR = join(__dirname, 'fonts');

async function loadFonts(pdf: PDFDocument): Promise<Fonts> {
  const read = (name: string) => readFileSync(join(FONTS_DIR, name));
  // subset=true keeps only the glyphs used — keeps the output PDF small
  // even with 6 embedded faces.
  const embed = (bytes: Buffer) => pdf.embedFont(bytes, { subset: true });
  const [serif, serifMedium, sans, sansBold, mono, script] = await Promise.all([
    embed(read('SourceSerif4-Regular.ttf')),
    embed(read('SourceSerif4-Medium.ttf')),
    embed(read('Inter-Regular.ttf')),
    embed(read('Inter-SemiBold.ttf')),
    embed(read('JetBrainsMono-Regular.ttf')),
    embed(read('Caveat-SemiBold.ttf')),
  ]);
  return { serif, serifMedium, sans, sansBold, mono, script };
}

// ---------------------------------------------------------------------------
// Colors — matched 1:1 to Design-Guide/project/colors_and_type.css tokens.
// ---------------------------------------------------------------------------

const C = {
  ink900: hex('#0B1220'),
  ink700: hex('#1F2937'),
  ink500: hex('#64748B'),
  ink400: hex('#94A3B8'),
  ink300: hex('#CBD5E1'),
  ink200: hex('#E2E8F0'),
  ink150: hex('#EDF1F6'),
  ink100: hex('#F3F6FA'),
  ink50: hex('#F8FAFC'),
  paper: hex('#FFFFFF'),
  indigo50: hex('#EEF2FF'),
  indigo100: hex('#E0E7FF'),
  indigo200: hex('#C7D2FE'),
  indigo600: hex('#4F46E5'),
  indigo700: hex('#4338CA'),
  success50: hex('#ECFDF5'),
  success500: hex('#10B981'),
  success700: hex('#047857'),
  info50: hex('#EFF6FF'),
  info700: hex('#1D4ED8'),
};

function hex(h: string): Color {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(h);
  if (!m) throw new Error(`bad hex: ${h}`);
  return rgb(parseInt(m[1]!, 16) / 255, parseInt(m[2]!, 16) / 255, parseInt(m[3]!, 16) / 255);
}

// ---------------------------------------------------------------------------
// Page geometry
//
// US Letter in PDF units (1 pt = 1/72"):
//   width  = 612, height = 792
//   margins: 0.6" sides (43.2), 0.5" top (36), ~0.65" bottom for footer
// ---------------------------------------------------------------------------

const PAGE_W = 612;
const PAGE_H = 792;
const M_X = 43.2;
const M_TOP = 36;
const CONTENT_W = PAGE_W - M_X * 2;
const FOOTER_H = 48;
const CONTENT_BOTTOM = FOOTER_H + 12; // where body content must stop

// ---------------------------------------------------------------------------
// Render context + primitives
// ---------------------------------------------------------------------------

interface RenderCtx {
  readonly pdf: PDFDocument;
  readonly fonts: Fonts;
  readonly envelope: Envelope;
  readonly events: ReadonlyArray<EnvelopeEvent>;
  readonly detailsBySigner: ReadonlyMap<string, SignerAuditDetail>;
  readonly sealedSha256: string | null;
  readonly qrImage: PDFImage;
  readonly verifyUrl: string;
  readonly totalPages: number;
}

/** pdf-lib uses bottom-left origin. We draw top-down with a descending
 *  cursor; this helper converts a "from top" y-offset to pdf-lib y. */
function topY(fromTop: number): number {
  return PAGE_H - fromTop;
}

function textWidth(font: PDFFont, text: string, size: number): number {
  return font.widthOfTextAtSize(text, size);
}

/**
 * Draw a rounded rectangle by stroking/filling an SVG path. pdf-lib's
 * built-in drawRectangle has no radius option, so we compose one using 4
 * arcs + 4 lines. `radius` clamped to half the shorter side.
 */
function drawRoundedRect(
  page: PDFPage,
  opts: {
    x: number;
    y: number;
    width: number;
    height: number;
    radius: number;
    fill?: Color;
    stroke?: Color;
    strokeWidth?: number;
  },
): void {
  const { x, y, width: w, height: h } = opts;
  const r = Math.max(0, Math.min(opts.radius, Math.min(w, h) / 2));
  // SVG path starts at top-left corner after the rounded section. y in svg
  // is top-down; drawSvgPath handles the flip because we pass x/y as the
  // path origin (pdf-lib top-left inside the page transform).
  const path = [
    `M ${r} 0`,
    `H ${w - r}`,
    `A ${r} ${r} 0 0 1 ${w} ${r}`,
    `V ${h - r}`,
    `A ${r} ${r} 0 0 1 ${w - r} ${h}`,
    `H ${r}`,
    `A ${r} ${r} 0 0 1 0 ${h - r}`,
    `V ${r}`,
    `A ${r} ${r} 0 0 1 ${r} 0`,
    'Z',
  ].join(' ');
  const svgOpts: {
    x: number;
    y: number;
    borderColor?: Color;
    borderWidth?: number;
    color?: Color;
  } = { x, y: y + h };
  if (opts.stroke) svgOpts.borderColor = opts.stroke;
  if (opts.strokeWidth !== undefined) svgOpts.borderWidth = opts.strokeWidth;
  if (opts.fill) svgOpts.color = opts.fill;
  // drawSvgPath interprets y as the TOP of the path's bounding box.
  page.drawSvgPath(path, svgOpts);
}

/** Horizontal hairline rule. */
function drawHRule(page: PDFPage, x: number, y: number, width: number, color = C.ink200): void {
  page.drawLine({
    start: { x, y },
    end: { x: x + width, y },
    thickness: 1,
    color,
  });
}

/** Draw a single line of text at (x, y) where y is the TOP of the line
 *  (design-file semantics). pdf-lib expects the baseline, so we subtract
 *  the ascent. */
function drawTextTop(
  page: PDFPage,
  text: string,
  opts: {
    x: number;
    y: number;
    font: PDFFont;
    size: number;
    color: Color;
    maxWidth?: number;
  },
): void {
  let rendered = text;
  if (opts.maxWidth) rendered = ellipsize(opts.font, text, opts.size, opts.maxWidth);
  const ascent = opts.font.heightAtSize(opts.size) * 0.76;
  page.drawText(rendered, {
    x: opts.x,
    y: opts.y - ascent,
    size: opts.size,
    font: opts.font,
    color: opts.color,
  });
}

function ellipsize(font: PDFFont, text: string, size: number, maxWidth: number): string {
  if (textWidth(font, text, size) <= maxWidth) return text;
  const ellipsis = '…';
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    const candidate = text.slice(0, mid) + ellipsis;
    if (textWidth(font, candidate, size) <= maxWidth) lo = mid + 1;
    else hi = mid;
  }
  return text.slice(0, Math.max(0, lo - 1)) + ellipsis;
}

/**
 * Wrap `text` into lines that fit `maxWidth`. No hyphenation — mid-word
 * breaks fall back to a character split for very long tokens (hashes,
 * identifiers) so they can't overflow the bounding box.
 */
function wrapText(font: PDFFont, text: string, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    const words = paragraph.split(/\s+/).filter((w) => w.length > 0);
    let cur = '';
    for (const word of words) {
      const probe = cur.length === 0 ? word : `${cur} ${word}`;
      if (textWidth(font, probe, size) <= maxWidth) {
        cur = probe;
        continue;
      }
      if (cur.length > 0) lines.push(cur);
      // Word alone exceeds maxWidth — break it by character.
      if (textWidth(font, word, size) > maxWidth) {
        let chunk = '';
        for (const ch of word) {
          if (textWidth(font, chunk + ch, size) > maxWidth) {
            if (chunk.length > 0) lines.push(chunk);
            chunk = ch;
          } else {
            chunk += ch;
          }
        }
        cur = chunk;
      } else {
        cur = word;
      }
    }
    if (cur.length > 0) lines.push(cur);
    if (words.length === 0) lines.push('');
  }
  return lines;
}

/** Draw multi-line wrapped text. Returns the y position immediately below
 *  the last line (top-down). */
function drawWrappedText(
  page: PDFPage,
  text: string,
  opts: {
    x: number;
    y: number;
    font: PDFFont;
    size: number;
    color: Color;
    maxWidth: number;
    lineHeight: number;
  },
): number {
  const lines = wrapText(opts.font, text, opts.size, opts.maxWidth);
  let y = opts.y;
  for (const line of lines) {
    drawTextTop(page, line, { x: opts.x, y, font: opts.font, size: opts.size, color: opts.color });
    y -= opts.lineHeight;
  }
  return y;
}

// ---------------------------------------------------------------------------
// Composite layout blocks
// ---------------------------------------------------------------------------

function drawHeader(
  page: PDFPage,
  { fonts }: RenderCtx,
  sectionEyebrow: string,
  suffix: string,
): void {
  const yTop = topY(M_TOP + 6);
  // Brand mark — small rounded indigo tile with cursive "S" (Caveat) to match
  // the page 1 "sealed" script motif + the brand-mark asset used on the HTML.
  const markSize = 18;
  drawRoundedRect(page, {
    x: M_X,
    y: yTop - markSize,
    width: markSize,
    height: markSize,
    radius: 4,
    fill: C.indigo600,
  });
  drawTextTop(page, 'S', {
    x: M_X + 4,
    y: yTop - 1,
    font: fonts.script,
    size: 17,
    color: C.paper,
  });
  // Brand word (serif)
  drawTextTop(page, 'Sealed', {
    x: M_X + markSize + 8,
    y: yTop - 1,
    font: fonts.serifMedium,
    size: 14,
    color: C.ink900,
  });

  // Right side eyebrow: "Audit trail · <suffix>"
  const gap = 8;
  const rightText = sectionEyebrow.toUpperCase();
  const sep = '·';
  const suffixText = suffix.toUpperCase();
  const rightSize = 8;
  const suffixWidth = textWidth(fonts.sansBold, suffixText, rightSize);
  const sepWidth = textWidth(fonts.sans, sep, rightSize);
  const rightTextWidth = textWidth(fonts.sansBold, rightText, rightSize);
  const totalWidth = rightTextWidth + gap + sepWidth + gap + suffixWidth;
  const xEyebrow = PAGE_W - M_X - totalWidth;
  drawTextTop(page, rightText, {
    x: xEyebrow,
    y: yTop - 4,
    font: fonts.sansBold,
    size: rightSize,
    color: C.ink500,
  });
  drawTextTop(page, sep, {
    x: xEyebrow + rightTextWidth + gap,
    y: yTop - 4,
    font: fonts.sans,
    size: rightSize,
    color: C.ink300,
  });
  drawTextTop(page, suffixText, {
    x: xEyebrow + rightTextWidth + gap + sepWidth + gap,
    y: yTop - 4,
    font: fonts.sansBold,
    size: rightSize,
    color: C.ink700,
  });

  // Bottom rule under the masthead
  const ruleY = topY(M_TOP + markSize + 14);
  drawHRule(page, M_X, ruleY, CONTENT_W);
}

/**
 * Footer layout: two stacked rows so the long Req UUID never collides
 * with the brand identity or page number. Top row has the brand mark
 * (left) and page number (right). Bottom row has the Req id centered.
 * 16pt above the bottom edge keeps a visible bottom padding.
 */
function drawFooter(page: PDFPage, ctx: RenderCtx, pageNum: number): void {
  const ruleY = FOOTER_H + 6;
  drawHRule(page, M_X, ruleY, CONTENT_W);

  // Top row — brand mark on the left, page number on the right.
  const topY = ruleY - 12;
  const markSize = 10;
  drawRoundedRect(page, {
    x: M_X,
    y: topY - markSize / 2 - 2,
    width: markSize,
    height: markSize,
    radius: 2,
    fill: C.indigo600,
  });
  drawTextTop(page, 'S', {
    x: M_X + 2,
    y: topY + 2,
    font: ctx.fonts.script,
    size: 10,
    color: C.paper,
  });
  drawTextTop(page, 'Sealed', {
    x: M_X + markSize + 5,
    y: topY + 2,
    font: ctx.fonts.serifMedium,
    size: 9,
    color: C.ink900,
  });
  const sealedW = textWidth(ctx.fonts.serifMedium, 'Sealed', 9);
  drawTextTop(page, '· Audit trail', {
    x: M_X + markSize + 5 + sealedW + 5,
    y: topY + 2,
    font: ctx.fonts.sans,
    size: 8,
    color: C.ink500,
  });

  const total = pad2(ctx.totalPages);
  const cur = pad2(pageNum);
  const sepText = '  /  ';
  const totalW = textWidth(ctx.fonts.mono, total, 8);
  const sepW = textWidth(ctx.fonts.mono, sepText, 8);
  const curW = textWidth(ctx.fonts.mono, cur, 8);
  const rightX = PAGE_W - M_X - (curW + sepW + totalW);
  drawTextTop(page, cur, {
    x: rightX,
    y: topY + 2,
    font: ctx.fonts.mono,
    size: 8,
    color: C.ink900,
  });
  drawTextTop(page, sepText, {
    x: rightX + curW,
    y: topY + 2,
    font: ctx.fonts.mono,
    size: 8,
    color: C.ink500,
  });
  drawTextTop(page, total, {
    x: rightX + curW + sepW,
    y: topY + 2,
    font: ctx.fonts.mono,
    size: 8,
    color: C.ink700,
  });

  // Bottom row — full Req UUID, centered. 16pt above the page bottom.
  const reqLabel = `Req  ${ctx.envelope.id.toUpperCase()}`;
  const reqWidth = textWidth(ctx.fonts.mono, reqLabel, 7.5);
  drawTextTop(page, reqLabel, {
    x: PAGE_W / 2 - reqWidth / 2,
    y: 22,
    font: ctx.fonts.mono,
    size: 7.5,
    color: C.ink500,
  });
}

function drawSectionHead(
  page: PDFPage,
  { fonts }: RenderCtx,
  num: string,
  title: string,
  y: number,
): number {
  const sizeNum = 9;
  const sizeTitle = 13;
  const numW = textWidth(fonts.mono, num, sizeNum);
  drawTextTop(page, num, { x: M_X, y, font: fonts.mono, size: sizeNum, color: C.indigo600 });
  drawTextTop(page, title, {
    x: M_X + numW + 10,
    y,
    font: fonts.serifMedium,
    size: sizeTitle,
    color: C.ink900,
  });
  // Rule to the right of the title
  const titleW = textWidth(fonts.serifMedium, title, sizeTitle);
  const ruleX = M_X + numW + 10 + titleW + 10;
  const ruleY = y - sizeTitle * 0.55;
  drawHRule(page, ruleX, ruleY, PAGE_W - M_X - ruleX);
  return y - (sizeTitle + 6);
}

// ---------------------------------------------------------------------------
// Page 1 — Document evidence and access
// ---------------------------------------------------------------------------

function renderPage1(ctx: RenderCtx): void {
  const page = ctx.pdf.addPage([PAGE_W, PAGE_H]);
  drawHeader(page, ctx, 'Audit trail', 'Attestation of signing');

  // Hero kicker
  const bodyTop = topY(M_TOP + 32 + 16);
  const env = ctx.envelope;
  const kicker = `Request ${env.short_code.toUpperCase()} · Completed ${
    env.completed_at ? formatDateShort(env.completed_at) : formatDateShort(env.created_at)
  }`;
  drawTextTop(page, kicker.toUpperCase(), {
    x: M_X,
    y: bodyTop,
    font: ctx.fonts.sansBold,
    size: 8,
    color: C.ink500,
  });

  // Hero title: "This document is sealed."
  const titleY = bodyTop - 14;
  const titleSize = 26;
  const prefix = 'This document is ';
  const scriptWord = 'sealed';
  const suffix = '.';
  drawTextTop(page, prefix, {
    x: M_X,
    y: titleY,
    font: ctx.fonts.serifMedium,
    size: titleSize,
    color: C.ink900,
  });
  const prefixW = textWidth(ctx.fonts.serifMedium, prefix, titleSize);
  const scriptSize = 28;
  drawTextTop(page, scriptWord, {
    x: M_X + prefixW + 2,
    y: titleY + 2,
    font: ctx.fonts.script,
    size: scriptSize,
    color: C.indigo600,
  });
  const scriptW = textWidth(ctx.fonts.script, scriptWord, scriptSize);
  drawTextTop(page, suffix, {
    x: M_X + prefixW + 2 + scriptW + 4,
    y: titleY,
    font: ctx.fonts.serifMedium,
    size: titleSize,
    color: C.ink900,
  });

  // Subtitle paragraph
  const subtitle =
    'The audit trail on these pages links each signatory to the signed document and records the evidence we collected along the way — identity, consent, timestamps, and a cryptographic fingerprint of the file before and after signing. Definitions for every field are on the last page.';
  let y = titleY - titleSize - 10;
  y = drawWrappedText(page, subtitle, {
    x: M_X,
    y,
    font: ctx.fonts.sans,
    size: 9.5,
    color: C.ink700,
    maxWidth: CONTENT_W * 0.72,
    lineHeight: 14,
  });
  y -= 14;

  // Decorative seal (top-right, overlaps subtitle column width)
  drawSeal(page, ctx, PAGE_W - M_X - 86, topY(M_TOP + 72));

  // Section 01
  y = drawSectionHead(page, ctx, '01', 'Document evidence and access', y);
  y = drawDatagrid(page, ctx, y);
  y -= 16;

  // Section 02
  y = drawSectionHead(page, ctx, '02', 'Cryptographic fingerprint (SHA-256)', y);
  y = drawHashCards(page, ctx, y);
  y -= 14;

  // Verify + QR card
  drawVerifyCard(page, ctx, y);

  drawFooter(page, ctx, 1);
}

function drawSeal(page: PDFPage, { fonts }: RenderCtx, x: number, y: number): void {
  const r = 43;
  const cx = x + r;
  const cy = y - r;
  page.drawCircle({ x: cx, y: cy, size: r, borderColor: C.indigo200, borderWidth: 1.2 });
  page.drawCircle({ x: cx, y: cy, size: r - 6, borderColor: C.indigo100, borderWidth: 0.8 });
  const script = 'Sealed';
  const scriptSize = 18;
  const sw = textWidth(fonts.script, script, scriptSize);
  drawTextTop(page, script, {
    x: cx - sw / 2,
    y: cy + 14,
    font: fonts.script,
    size: scriptSize,
    color: C.indigo700,
  });
  const verified = 'VERIFIED';
  const verSize = 6.5;
  const vw = textWidth(fonts.sansBold, verified, verSize);
  drawTextTop(page, verified, {
    x: cx - vw / 2,
    y: cy - 5,
    font: fonts.sansBold,
    size: verSize,
    color: C.indigo600,
  });
}

function drawDatagrid(page: PDFPage, ctx: RenderCtx, y: number): number {
  const cellW = CONTENT_W / 2;
  const cellH = 44;
  const cells = buildDatagridCells(ctx);
  const rows = Math.ceil(cells.length / 2);
  const gridH = cellH * rows;

  drawRoundedRect(page, {
    x: M_X,
    y: y - gridH,
    width: CONTENT_W,
    height: gridH,
    radius: 10,
    stroke: C.ink200,
    strokeWidth: 1,
    fill: C.paper,
  });
  // Internal hairlines between rows and the vertical divider
  for (let r = 1; r < rows; r++) {
    drawHRule(page, M_X, y - cellH * r, CONTENT_W);
  }
  page.drawLine({
    start: { x: M_X + cellW, y },
    end: { x: M_X + cellW, y: y - gridH },
    thickness: 1,
    color: C.ink200,
  });

  // Cells
  cells.forEach((cell, i) => {
    const row = Math.floor(i / 2);
    const col = i % 2;
    const cx = M_X + col * cellW;
    const cy = y - row * cellH;
    drawDataCell(page, ctx, cell, { x: cx + 14, y: cy - 10, width: cellW - 28 });
  });
  return y - gridH;
}

interface DataCell {
  readonly label: string;
  readonly value: string;
  readonly mono?: boolean;
  readonly check?: boolean;
}

function buildDatagridCells(ctx: RenderCtx): ReadonlyArray<DataCell> {
  const env = ctx.envelope;
  const proposer = deriveProposer(ctx);
  const signedCount = env.signers.filter((s) => s.signed_at !== null).length;
  const totalSigners = env.signers.filter((s) => s.role === 'signatory').length;
  const validators = env.signers.filter((s) => s.role === 'validator').length;
  const witnesses = env.signers.filter((s) => s.role === 'witness').length;
  const originIp = firstEventIp(ctx.events, ['created', 'sent']) ?? '—';

  return [
    { label: 'Proposer', value: proposer.name },
    { label: 'Proposer email', value: proposer.email, mono: true },
    { label: 'Created', value: formatDateTimeFull(env.created_at) },
    {
      label: env.completed_at ? 'Completed' : env.status === 'declined' ? 'Declined' : 'Status',
      value: env.completed_at
        ? formatDateTimeFull(env.completed_at)
        : env.status === 'declined'
          ? (deriveDeclinedAt(ctx) ?? formatDateTimeFull(env.updated_at))
          : humanEnvelopeStatus(env.status),
    },
    { label: 'Origin IP address', value: originIp, mono: true },
    { label: 'Request identifier', value: env.id.toUpperCase(), mono: true },
    {
      label: 'Digital signature',
      value:
        ctx.sealedSha256 !== null
          ? 'Enabled · eIDAS qualified timestamp'
          : 'Not applicable (unsealed)',
      check: ctx.sealedSha256 !== null,
    },
    { label: 'Delivery mode', value: humanDelivery(env.delivery_mode) },
    {
      label: 'Signers',
      value: `${signedCount} of ${totalSigners || env.signers.length} completed`,
    },
    { label: 'Validators · Witnesses', value: `${validators} · ${witnesses}` },
  ];
}

function drawDataCell(
  page: PDFPage,
  { fonts }: RenderCtx,
  cell: DataCell,
  opts: { x: number; y: number; width: number },
): void {
  drawTextTop(page, cell.label.toUpperCase(), {
    x: opts.x,
    y: opts.y,
    font: fonts.sansBold,
    size: 7.5,
    color: C.ink500,
  });
  const valueY = opts.y - 12;
  let valueX = opts.x;
  if (cell.check) {
    drawCheckDot(page, opts.x, valueY, 8.5);
    valueX = opts.x + 14;
  }
  drawTextTop(page, cell.value, {
    x: valueX,
    y: valueY,
    font: cell.mono ? fonts.mono : fonts.sansBold,
    size: cell.mono ? 8.5 : 9.5,
    color: C.ink900,
    maxWidth: opts.width - (valueX - opts.x),
  });
}

function drawCheckDot(page: PDFPage, x: number, yTop: number, size: number): void {
  const cx = x + size / 2;
  const cy = yTop - size / 2;
  page.drawCircle({ x: cx, y: cy, size: size / 2, color: C.success500 });
  // Checkmark: two stroked lines
  const ax = cx - size * 0.24;
  const ay = cy;
  const bx = cx - size * 0.05;
  const by = cy - size * 0.2;
  const ccx = cx + size * 0.28;
  const ccy = cy + size * 0.22;
  page.drawLine({ start: { x: ax, y: ay }, end: { x: bx, y: by }, thickness: 1.3, color: C.paper });
  page.drawLine({
    start: { x: bx, y: by },
    end: { x: ccx, y: ccy },
    thickness: 1.3,
    color: C.paper,
  });
}

function drawHashCards(page: PDFPage, ctx: RenderCtx, y: number): number {
  const env = ctx.envelope;
  const cardH = 50;
  const gap = 10;

  drawHashCard(page, ctx, {
    x: M_X,
    y,
    width: CONTENT_W,
    height: cardH,
    signed: false,
    label: 'Original document',
    filename: safeFilename(env.title),
    pages: env.original_pages ?? 0,
    hash: env.original_sha256 ?? '—',
  });

  drawHashCard(page, ctx, {
    x: M_X,
    y: y - cardH - gap,
    width: CONTENT_W,
    height: cardH,
    signed: true,
    label: 'Signed document',
    filename: safeFilename(env.title, true),
    pages: env.original_pages ?? 0,
    hash: ctx.sealedSha256 ?? '— (unsealed)',
  });
  return y - cardH * 2 - gap;
}

function drawHashCard(
  page: PDFPage,
  { fonts }: RenderCtx,
  opts: {
    x: number;
    y: number;
    width: number;
    height: number;
    signed: boolean;
    label: string;
    filename: string;
    pages: number;
    hash: string;
  },
): void {
  drawRoundedRect(page, {
    x: opts.x,
    y: opts.y - opts.height,
    width: opts.width,
    height: opts.height,
    radius: 10,
    fill: C.ink50,
    stroke: C.ink200,
    strokeWidth: 1,
  });

  const padX = 14;
  const padY = 10;
  const innerX = opts.x + padX;
  const innerY = opts.y - padY;
  // Dot + label
  const dotColor = opts.signed ? C.success500 : C.ink400;
  page.drawCircle({ x: innerX + 3.5, y: innerY - 5, size: 3.5, color: dotColor });
  drawTextTop(page, opts.label.toUpperCase(), {
    x: innerX + 14,
    y: innerY,
    font: fonts.sansBold,
    size: 7.5,
    color: C.ink500,
  });
  // Filename · pages (to the right of the label, same row)
  const labelW = textWidth(fonts.sansBold, opts.label.toUpperCase(), 7.5);
  const fileTextMaxX = opts.x + opts.width - padX;
  const fileX = innerX + 14 + labelW + 16;
  const filenameSize = 10;
  const pagesSize = 9.5;
  const pagesText = opts.pages > 0 ? `  · ${opts.pages} page${opts.pages === 1 ? '' : 's'}` : '';
  const pagesW = textWidth(fonts.sans, pagesText, pagesSize);
  const filenameMaxWidth = Math.max(60, fileTextMaxX - fileX - pagesW);
  const ellipsedName = ellipsize(fonts.sansBold, opts.filename, filenameSize, filenameMaxWidth);
  drawTextTop(page, ellipsedName, {
    x: fileX,
    y: innerY,
    font: fonts.sansBold,
    size: filenameSize,
    color: C.ink900,
  });
  drawTextTop(page, pagesText, {
    x: fileX + textWidth(fonts.sansBold, ellipsedName, filenameSize),
    y: innerY,
    font: fonts.sans,
    size: pagesSize,
    color: C.ink500,
  });

  // Hash value, wrapped under the label. Mono 8pt.
  const hashY = innerY - 16;
  drawWrappedText(page, opts.hash, {
    x: innerX,
    y: hashY,
    font: fonts.mono,
    size: 8,
    color: C.ink700,
    maxWidth: opts.width - padX * 2,
    lineHeight: 12,
  });
}

function drawVerifyCard(page: PDFPage, ctx: RenderCtx, y: number): number {
  const cardH = 114;
  const env = ctx.envelope;

  drawRoundedRect(page, {
    x: M_X,
    y: y - cardH,
    width: CONTENT_W,
    height: cardH,
    radius: 12,
    stroke: C.ink200,
    fill: C.ink50,
    strokeWidth: 1,
  });

  const padX = 18;
  const padY = 14;
  const innerX = M_X + padX;
  const innerY = y - padY;

  drawTextTop(page, 'VERIFY THIS DOCUMENT', {
    x: innerX,
    y: innerY,
    font: ctx.fonts.sansBold,
    size: 7.5,
    color: C.indigo600,
  });
  drawTextTop(page, 'Scan or visit to confirm authenticity', {
    x: innerX,
    y: innerY - 12,
    font: ctx.fonts.serifMedium,
    size: 12,
    color: C.ink900,
  });
  const copy =
    'If this audit trail is printed, scan the code or type the URL below to confirm the signature is valid and the file has not been altered since it was sealed.';
  let yCopy = drawWrappedText(page, copy, {
    x: innerX,
    y: innerY - 28,
    font: ctx.fonts.sans,
    size: 9,
    color: C.ink700,
    maxWidth: CONTENT_W - padX * 2 - 104,
    lineHeight: 12,
  });
  yCopy -= 6;
  drawTextTop(page, 'URL', {
    x: innerX,
    y: yCopy,
    font: ctx.fonts.sansBold,
    size: 7.5,
    color: C.ink500,
  });
  drawTextTop(page, ctx.verifyUrl.replace(/^https?:\/\//, ''), {
    x: innerX + 38,
    y: yCopy,
    font: ctx.fonts.mono,
    size: 8.5,
    color: C.ink700,
    maxWidth: CONTENT_W - padX * 2 - 104 - 38,
  });
  drawTextTop(page, 'CODE', {
    x: innerX,
    y: yCopy - 12,
    font: ctx.fonts.sansBold,
    size: 7.5,
    color: C.ink500,
  });
  drawTextTop(page, env.short_code, {
    x: innerX + 38,
    y: yCopy - 12,
    font: ctx.fonts.mono,
    size: 8.5,
    color: C.ink700,
  });

  // QR (right side)
  const qrSize = 84;
  const qrX = PAGE_W - M_X - padX - qrSize;
  const qrY = y - padY - qrSize;
  drawRoundedRect(page, {
    x: qrX - 4,
    y: qrY - 4,
    width: qrSize + 8,
    height: qrSize + 8,
    radius: 6,
    fill: C.paper,
    stroke: C.ink200,
    strokeWidth: 1,
  });
  page.drawImage(ctx.qrImage, { x: qrX, y: qrY, width: qrSize, height: qrSize });

  return y - cardH;
}

// ---------------------------------------------------------------------------
// Page 2 — Participants and events
// ---------------------------------------------------------------------------

function renderPage2(ctx: RenderCtx): void {
  const page = ctx.pdf.addPage([PAGE_W, PAGE_H]);
  drawHeader(page, ctx, 'Audit trail', 'Participants');

  let y = topY(M_TOP + 32 + 20);
  y = drawSectionHead(page, ctx, '03', 'Participants and events', y);
  const intro =
    'Each table below records the major events for every participant in the signing process — the actions they took, the IP address they took them from, and the time those actions were stamped by our servers. Roles and event types are defined on the last page.';
  y = drawWrappedText(page, intro, {
    x: M_X,
    y,
    font: ctx.fonts.sans,
    size: 9.5,
    color: C.ink700,
    maxWidth: CONTENT_W * 0.72,
    lineHeight: 14,
  });
  y -= 14;

  // Proposer card first, then each signer
  y = drawParticipantCard(page, ctx, y, buildProposerParticipant(ctx));
  y -= 10;
  for (const signer of ctx.envelope.signers) {
    if (y < CONTENT_BOTTOM + 160) break; // defensive — truncate rather than overflow
    y = drawParticipantCard(page, ctx, y, buildSignerParticipant(ctx, signer));
    y -= 10;
  }

  // Trust bar at bottom
  drawTrustBar(page, ctx, CONTENT_BOTTOM + 66);

  drawFooter(page, ctx, 2);
}

interface ParticipantData {
  readonly role: 'proposer' | 'signatory' | 'validator' | 'witness';
  readonly name: string;
  readonly email: string;
  readonly signatureText: string | null;
  readonly signatureMeta: string | null;
  readonly roleLabel: 'Initiated the request' | 'Signature';
  readonly verificationChecks: ReadonlyArray<string>;
  readonly formatLabel: string;
  readonly identifier: string;
  readonly events: ReadonlyArray<ParticipantEvent>;
}

interface ParticipantEvent {
  readonly kind: 'create' | 'sent' | 'envelope' | 'view' | 'sign' | 'decline' | 'generic';
  readonly action: string;
  readonly ip: string;
  readonly at: string;
}

function buildProposerParticipant(ctx: RenderCtx): ParticipantData {
  const env = ctx.envelope;
  const proposer = deriveProposer(ctx);
  const events: ParticipantEvent[] = [];
  const createdEvent = ctx.events.find((e) => e.event_type === 'created');
  const sentEvent = ctx.events.find((e) => e.event_type === 'sent');
  if (createdEvent) {
    events.push({
      kind: 'create',
      action: 'Created',
      ip: createdEvent.ip ?? '—',
      at: formatDateTimeShort(createdEvent.created_at),
    });
  }
  if (sentEvent) {
    events.push({
      kind: 'sent',
      action: 'Sent for signature',
      ip: sentEvent.ip ?? '—',
      at: formatDateTimeShort(sentEvent.created_at),
    });
  }
  return {
    role: 'proposer',
    name: proposer.name,
    email: proposer.email,
    signatureText: null,
    signatureMeta: 'Verified via account authentication',
    roleLabel: 'Initiated the request',
    verificationChecks: ['Email', 'Account'],
    formatLabel: 'Proposer',
    identifier: env.owner_id ? env.owner_id.toUpperCase() : '—',
    events,
  };
}

function buildSignerParticipant(ctx: RenderCtx, signer: EnvelopeSigner): ParticipantData {
  const detail = ctx.detailsBySigner.get(signer.id);
  const perEvents = ctx.events.filter((e) => e.signer_id === signer.id);
  const events: ParticipantEvent[] = [];
  const sentEvent = ctx.events.find((e) => e.event_type === 'sent');
  if (sentEvent) {
    // Signer's perspective: an envelope arrived. The proposer-side card
    // already uses the paper-plane glyph for "Sent for signature"; the
    // signer side uses an inbox/envelope to make the difference visible
    // — same pattern the design HTML uses (envelope SVG vs paper-plane).
    events.push({
      kind: 'envelope',
      action: 'Sent',
      ip: sentEvent.ip ?? '—',
      at: formatDateTimeShort(sentEvent.created_at),
    });
  }
  const viewed = perEvents.find((e) => e.event_type === 'viewed');
  if (viewed) {
    events.push({
      kind: 'view',
      action: 'Viewed',
      ip: viewed.ip ?? '—',
      at: formatDateTimeShort(viewed.created_at),
    });
  }
  const signed = perEvents.find((e) => e.event_type === 'signed');
  if (signed) {
    events.push({
      kind: 'sign',
      action: 'Signed',
      ip: signed.ip ?? '—',
      at: formatDateTimeShort(signed.created_at),
    });
  }
  const declined = perEvents.find((e) => e.event_type === 'declined');
  if (declined) {
    events.push({
      kind: 'decline',
      action: 'Declined',
      ip: declined.ip ?? '—',
      at: formatDateTimeShort(declined.created_at),
    });
  }

  const checks = deriveVerificationChecks(detail?.verification_checks ?? ['email']);
  const sigFormat = detail?.signature_format ?? null;
  let signatureText: string | null = null;
  let signatureMeta: string | null = null;
  if (signer.signed_at !== null) {
    signatureText = humanSignatureMark(signer, sigFormat);
    const formatName =
      sigFormat === 'typed'
        ? 'Text'
        : sigFormat === 'drawn'
          ? 'Drawn'
          : sigFormat === 'upload'
            ? 'Uploaded'
            : 'Text';
    signatureMeta = `${formatName} format · Captured at ${formatTimeShort(signer.signed_at)} UTC`;
  } else if (signer.declined_at !== null) {
    signatureText = '—';
    signatureMeta = `Declined · ${formatTimeShort(signer.declined_at)} UTC`;
  }

  return {
    role: signer.role,
    name: signer.name,
    email: signer.email,
    signatureText,
    signatureMeta,
    roleLabel: 'Signature',
    verificationChecks: checks,
    formatLabel: humanSignatureFormat(sigFormat),
    identifier: signer.id.toUpperCase(),
    events,
  };
}

function drawParticipantCard(page: PDFPage, ctx: RenderCtx, y: number, p: ParticipantData): number {
  const { fonts } = ctx;
  const headH = 68;
  const metaH = 46;
  const evtHeadH = 24;
  const evtRowH = 22;
  const cardH = headH + metaH + evtHeadH + evtRowH * p.events.length;

  drawRoundedRect(page, {
    x: M_X,
    y: y - cardH,
    width: CONTENT_W,
    height: cardH,
    radius: 12,
    fill: C.paper,
    stroke: C.ink200,
    strokeWidth: 1,
  });

  // Head background (ink50)
  drawRoundedRect(page, {
    x: M_X,
    y: y - headH,
    width: CONTENT_W,
    height: headH,
    radius: 12,
    fill: C.ink50,
  });
  // Bottom rule of head
  drawHRule(page, M_X, y - headH, CONTENT_W);

  // Role pill on top-left
  const isSigner = p.role === 'signatory';
  const roleColor = isSigner ? C.success700 : C.indigo700;
  const dotColor = isSigner ? C.success500 : C.indigo600;
  const padX = 16;
  const padY = 10;
  page.drawCircle({ x: M_X + padX + 3, y: y - padY - 6, size: 3, color: dotColor });
  const roleLabel = humanRoleLabel(p.role).toUpperCase();
  drawTextTop(page, roleLabel, {
    x: M_X + padX + 12,
    y: y - padY,
    font: fonts.sansBold,
    size: 7.5,
    color: roleColor,
  });

  // Name (serif 13)
  drawTextTop(page, p.name, {
    x: M_X + padX,
    y: y - padY - 16,
    font: fonts.serifMedium,
    size: 13,
    color: C.ink900,
    maxWidth: CONTENT_W / 2 - padX * 2,
  });
  // Contact
  drawTextTop(page, p.email, {
    x: M_X + padX,
    y: y - padY - 34,
    font: fonts.sans,
    size: 9.5,
    color: C.ink500,
    maxWidth: CONTENT_W / 2 - padX * 2,
  });

  // Signature panel (right side)
  const rightX = M_X + CONTENT_W - padX;
  if (p.signatureText) {
    const labelText = p.roleLabel.toUpperCase();
    const labelW = textWidth(fonts.sansBold, labelText, 7.5);
    drawTextTop(page, labelText, {
      x: rightX - labelW,
      y: y - padY,
      font: fonts.sansBold,
      size: 7.5,
      color: C.ink500,
    });
    // Script signature. Caveat has noticeable descenders, so we leave a
    // 7pt gap between the baseline and the underline rule and another 6pt
    // before the mono meta line so the row reads cleanly.
    const sigSize = 20;
    const sigW = Math.min(textWidth(fonts.script, p.signatureText, sigSize), 220);
    const sigX = rightX - Math.max(sigW, 180);
    const sigTopY = y - padY - 16;
    drawTextTop(page, p.signatureText, {
      x: sigX,
      y: sigTopY,
      font: fonts.script,
      size: sigSize,
      color: C.ink900,
      maxWidth: 220,
    });
    const underlineY = sigTopY - sigSize - 7;
    drawHRule(page, sigX, underlineY, Math.max(sigW, 180), C.ink400);
    if (p.signatureMeta) {
      const metaW = textWidth(fonts.mono, p.signatureMeta, 7.5);
      drawTextTop(page, p.signatureMeta, {
        x: rightX - metaW,
        y: underlineY - 6,
        font: fonts.mono,
        size: 7.5,
        color: C.ink500,
      });
    }
  } else if (p.signatureMeta) {
    const labelText = p.roleLabel.toUpperCase();
    const labelW = textWidth(fonts.sansBold, labelText, 7.5);
    drawTextTop(page, labelText, {
      x: rightX - labelW,
      y: y - padY,
      font: fonts.sansBold,
      size: 7.5,
      color: C.ink500,
    });
    const metaW = textWidth(fonts.mono, p.signatureMeta, 8);
    drawTextTop(page, p.signatureMeta, {
      x: rightX - metaW,
      y: y - padY - 18,
      font: fonts.mono,
      size: 8,
      color: C.ink700,
    });
  }

  // Meta strip
  const metaYTop = y - headH - 8;
  const col1X = M_X + padX;
  const col2X = M_X + CONTENT_W * 0.34;
  const col3X = M_X + CONTENT_W * 0.66;
  drawMetaCol(page, fonts, 'Verification checks', '', col1X, metaYTop);
  drawCheckChips(page, ctx, p.verificationChecks, col1X, metaYTop - 12);
  drawMetaCol(page, fonts, 'Role', p.formatLabel, col2X, metaYTop);
  drawMetaCol(page, fonts, 'Identifier', p.identifier, col3X, metaYTop, true);

  drawHRule(page, M_X, y - headH - metaH, CONTENT_W);

  // Events table
  const tableYTop = y - headH - metaH;
  drawRoundedRect(page, {
    x: M_X,
    y: tableYTop - evtHeadH,
    width: CONTENT_W,
    height: evtHeadH,
    radius: 0,
    fill: C.ink50,
  });
  const evtHeadY = tableYTop - 8;
  drawTextTop(page, 'ACTION', {
    x: M_X + padX,
    y: evtHeadY,
    font: fonts.sansBold,
    size: 7.5,
    color: C.ink500,
  });
  drawTextTop(page, 'IP ADDRESS', {
    x: M_X + CONTENT_W * 0.38,
    y: evtHeadY,
    font: fonts.sansBold,
    size: 7.5,
    color: C.ink500,
  });
  drawTextTop(page, 'TIMESTAMP (UTC)', {
    x: M_X + CONTENT_W * 0.62,
    y: evtHeadY,
    font: fonts.sansBold,
    size: 7.5,
    color: C.ink500,
  });
  drawHRule(page, M_X, tableYTop - evtHeadH, CONTENT_W);

  // Event rows
  p.events.forEach((ev, i) => {
    const rowTop = tableYTop - evtHeadH - i * evtRowH;
    // Icon + action
    const iconX = M_X + padX;
    const iconY = rowTop - 6;
    drawEventIcon(page, ctx, ev.kind, iconX, iconY);
    drawTextTop(page, ev.action, {
      x: iconX + 26,
      y: rowTop - 4,
      font: fonts.sans,
      size: 10,
      color: C.ink900,
    });
    drawTextTop(page, ev.ip, {
      x: M_X + CONTENT_W * 0.38,
      y: rowTop - 4,
      font: fonts.mono,
      size: 9,
      color: ev.ip === '—' ? C.ink400 : C.ink700,
    });
    drawTextTop(page, ev.at, {
      x: M_X + CONTENT_W * 0.62,
      y: rowTop - 4,
      font: fonts.mono,
      size: 9,
      color: C.ink700,
    });
    if (i < p.events.length - 1) {
      drawHRule(page, M_X + padX, rowTop - evtRowH, CONTENT_W - padX * 2);
    }
  });

  return y - cardH;
}

function drawMetaCol(
  page: PDFPage,
  fonts: Fonts,
  label: string,
  value: string,
  x: number,
  yTop: number,
  mono = false,
): void {
  drawTextTop(page, label.toUpperCase(), {
    x,
    y: yTop,
    font: fonts.sansBold,
    size: 7.5,
    color: C.ink500,
  });
  if (value.length > 0) {
    drawTextTop(page, value, {
      x,
      y: yTop - 12,
      font: mono ? fonts.mono : fonts.sansBold,
      size: mono ? 8.5 : 10,
      color: C.ink900,
      maxWidth: CONTENT_W * 0.3,
    });
  }
}

function drawCheckChips(
  page: PDFPage,
  { fonts }: RenderCtx,
  checks: ReadonlyArray<string>,
  x: number,
  yTop: number,
): void {
  let cx = x;
  for (const check of checks) {
    const label = check;
    const padH = 8;
    const padV = 3;
    const labelW = textWidth(fonts.sansBold, label, 8.5);
    const chipW = labelW + padH * 2 + 12;
    const chipH = 14;
    drawRoundedRect(page, {
      x: cx,
      y: yTop - chipH,
      width: chipW,
      height: chipH,
      radius: 7,
      fill: C.indigo50,
    });
    // Check dot
    const dotSize = 8;
    drawCheckChipDot(page, cx + padH, yTop - padV - 2);
    drawTextTop(page, label, {
      x: cx + padH + dotSize + 4,
      y: yTop - 2,
      font: fonts.sansBold,
      size: 8.5,
      color: C.indigo700,
    });
    cx += chipW + 6;
  }
}

function drawCheckChipDot(page: PDFPage, x: number, yTop: number): void {
  const size = 8;
  const cx = x + size / 2;
  const cy = yTop - size / 2;
  page.drawCircle({ x: cx, y: cy, size: size / 2, color: C.indigo600 });
  // tiny checkmark
  const ax = cx - size * 0.2;
  const ay = cy + size * 0.05;
  const bx = cx - size * 0.04;
  const by = cy - size * 0.16;
  const ccx = cx + size * 0.22;
  const ccy = cy + size * 0.15;
  page.drawLine({ start: { x: ax, y: ay }, end: { x: bx, y: by }, thickness: 0.8, color: C.paper });
  page.drawLine({
    start: { x: bx, y: by },
    end: { x: ccx, y: ccy },
    thickness: 0.8,
    color: C.paper,
  });
}

/**
 * Event-row icon. Drawn as primitive vector strokes / SVG paths so the
 * rendering doesn't depend on the embedded font shipping particular
 * Unicode glyphs — the prior implementation used '✓ ◎ ＋ ✕ →' which
 * Inter / Source Serif do not all carry, leaving the row blank when the
 * glyph index is missing in the subset.
 *
 * Color treatment matches the design HTML's `.evt-ico.is-*` classes:
 *   create     → indigo-50 fill / indigo-700 stroke
 *   sent       → ink-150 fill / ink-700 stroke (paper-plane, proposer)
 *   envelope   → ink-150 fill / ink-700 stroke (envelope, signer side)
 *   view       → info-50 fill / info-700 stroke (eye)
 *   sign       → success-50 fill / success-700 stroke (pen / signature)
 *   decline    → ink-150 fill / ink-700 stroke (X)
 */
function drawEventIcon(
  page: PDFPage,
  _ctx: RenderCtx,
  kind: ParticipantEvent['kind'],
  x: number,
  yTop: number,
): void {
  const palette: Record<ParticipantEvent['kind'], { bg: Color; fg: Color }> = {
    sign: { bg: C.success50, fg: C.success700 },
    view: { bg: C.info50, fg: C.info700 },
    create: { bg: C.indigo50, fg: C.indigo700 },
    sent: { bg: C.ink150, fg: C.ink700 },
    envelope: { bg: C.ink150, fg: C.ink700 },
    decline: { bg: C.ink150, fg: C.ink700 },
    generic: { bg: C.ink150, fg: C.ink700 },
  };
  const { bg, fg } = palette[kind];
  const size = 20;
  const cx = x + size / 2;
  const cy = yTop - size / 2;
  page.drawCircle({ x: cx, y: cy, size: size / 2, color: bg });

  const stroke = 1.4;
  const r = size * 0.28; // glyph half-extent — keeps a small breathing margin

  if (kind === 'create') {
    // Plus — matches Lucide's "plus" icon.
    page.drawLine({
      start: { x: cx - r, y: cy },
      end: { x: cx + r, y: cy },
      thickness: stroke,
      color: fg,
    });
    page.drawLine({
      start: { x: cx, y: cy - r },
      end: { x: cx, y: cy + r },
      thickness: stroke,
      color: fg,
    });
    return;
  }

  if (kind === 'sent') {
    // Paper plane — same silhouette as the design HTML's send SVG
    // ("M22 2 11 13" + "M22 2 15 22l-4-9-9-4 20-7Z") simplified to a
    // tilted triangle outline + a fold crease. SVG y is down, so values
    // below center use positive y. Origin set to the icon center.
    const path = [
      // Outer triangle (north-east tip, body to the south-west)
      `M ${-r * 1.0} ${r * 0.45}`,
      `L ${r * 1.05} ${-r * 1.05}`,
      `L ${r * 0.05} ${r * 1.0}`,
      `Z`,
      // Inner crease — from tip into body
      `M ${r * 1.05} ${-r * 1.05}`,
      `L ${-r * 0.15} ${r * 0.15}`,
    ].join(' ');
    page.drawSvgPath(path, {
      x: cx,
      y: cy,
      borderColor: fg,
      borderWidth: stroke,
    });
    return;
  }

  if (kind === 'envelope') {
    // Envelope — matches the design HTML's "M4 4h16…" rectangle plus
    // "polyline 22,6 12,13 2,6" inner V. Drawn as a rounded rectangle
    // outline + two diagonal strokes that meet in the middle of the top
    // edge, forming the classic envelope flap.
    const w = r * 2.2;
    const h = r * 1.5;
    const x0 = cx - w / 2;
    const y0 = cy - h / 2;
    drawRoundedRect(page, {
      x: x0,
      y: y0,
      width: w,
      height: h,
      radius: 1.2,
      stroke: fg,
      strokeWidth: stroke,
    });
    // Flap V: top-left corner → middle of top edge → top-right corner.
    page.drawLine({
      start: { x: x0 + 1, y: y0 + h - 1 },
      end: { x: cx, y: cy + h * 0.05 },
      thickness: stroke,
      color: fg,
    });
    page.drawLine({
      start: { x: cx, y: cy + h * 0.05 },
      end: { x: x0 + w - 1, y: y0 + h - 1 },
      thickness: stroke,
      color: fg,
    });
    return;
  }

  if (kind === 'view') {
    // Eye — almond-shaped outline (lens) plus a filled iris. Origin at
    // icon center; SVG y is down, so the upper arc uses negative y.
    const lensH = r * 0.78;
    const lensW = r * 1.2;
    const path = [
      `M ${-lensW} 0`,
      `Q 0 ${lensH} ${lensW} 0`,
      `Q 0 ${-lensH} ${-lensW} 0`,
      `Z`,
    ].join(' ');
    page.drawSvgPath(path, {
      x: cx,
      y: cy,
      borderColor: fg,
      borderWidth: stroke,
    });
    page.drawCircle({ x: cx, y: cy, size: r * 0.34, color: fg });
    return;
  }

  if (kind === 'sign') {
    // Pen / signature mark — tilted rectangle (pen body) with a pointed
    // tip at the lower-left and a tail nib stroke. SVG origin at the
    // icon center.
    const path = [
      `M ${-r * 0.95} ${-r * 0.4}`,
      `L ${r * 0.45} ${r * 1.0}`,
      `L ${r * 1.05} ${r * 0.4}`,
      `L ${-r * 0.35} ${-r * 1.0}`,
      `Z`,
      `M ${-r * 0.65} ${-r * 0.65}`,
      `L ${r * 0.05} ${r * 0.05}`,
    ].join(' ');
    page.drawSvgPath(path, {
      x: cx,
      y: cy,
      borderColor: fg,
      borderWidth: stroke,
    });
    return;
  }

  if (kind === 'decline') {
    page.drawLine({
      start: { x: cx - r * 0.85, y: cy - r * 0.85 },
      end: { x: cx + r * 0.85, y: cy + r * 0.85 },
      thickness: stroke,
      color: fg,
    });
    page.drawLine({
      start: { x: cx - r * 0.85, y: cy + r * 0.85 },
      end: { x: cx + r * 0.85, y: cy - r * 0.85 },
      thickness: stroke,
      color: fg,
    });
    return;
  }

  // Generic — small horizontal arrow as a sane default.
  page.drawLine({
    start: { x: cx - r, y: cy },
    end: { x: cx + r, y: cy },
    thickness: stroke,
    color: fg,
  });
}

function drawTrustBar(page: PDFPage, ctx: RenderCtx, yBase: number): void {
  const h = 58;
  const topYabs = yBase + h;
  drawRoundedRect(page, {
    x: M_X,
    y: yBase,
    width: CONTENT_W,
    height: h,
    radius: 12,
    fill: C.paper,
    stroke: C.ink200,
    strokeWidth: 1,
  });
  const colW = CONTENT_W / 4;
  // Vertical dividers
  for (let i = 1; i < 4; i++) {
    page.drawLine({
      start: { x: M_X + colW * i, y: yBase + 6 },
      end: { x: M_X + colW * i, y: topYabs - 6 },
      thickness: 1,
      color: C.ink200,
    });
  }
  const durationText = computeDurationText(ctx);
  const cells = [
    { label: 'Integrity', value: 'Verified', sub: 'SHA-256 hash matches the sealed document.' },
    { label: 'Timestamp', value: 'eIDAS qualified', sub: 'Issued by a trusted service provider.' },
    {
      label: 'Storage',
      value: 'Encrypted at rest',
      sub: 'AES-256. Retrieved on verification only.',
    },
    { label: 'Completion', value: durationText, sub: 'From created to sealed.' },
  ];
  cells.forEach((cell, i) => {
    const cx = M_X + colW * i + 12;
    drawTextTop(page, cell.label.toUpperCase(), {
      x: cx,
      y: topYabs - 10,
      font: ctx.fonts.sansBold,
      size: 7.5,
      color: C.ink500,
    });
    drawTextTop(page, cell.value, {
      x: cx,
      y: topYabs - 22,
      font: ctx.fonts.sansBold,
      size: 10,
      color: C.ink900,
      maxWidth: colW - 20,
    });
    drawWrappedText(page, cell.sub, {
      x: cx,
      y: topYabs - 36,
      font: ctx.fonts.sans,
      size: 8.5,
      color: C.ink500,
      maxWidth: colW - 20,
      lineHeight: 11,
    });
  });
}

// ---------------------------------------------------------------------------
// Page 3 — Terms 01..08
// ---------------------------------------------------------------------------

function renderPage3(ctx: RenderCtx): void {
  const page = ctx.pdf.addPage([PAGE_W, PAGE_H]);
  drawHeader(page, ctx, 'Audit trail', 'Terms & definitions');
  let y = topY(M_TOP + 32 + 20);
  y = drawSectionHead(page, ctx, '04', 'Terms used in this document', y);
  const intro =
    'The following definitions explain every field and event recorded in this audit trail. This glossary is provided so the document can stand alone as a record of legal evidence in any subsequent proceeding.';
  y = drawWrappedText(page, intro, {
    x: M_X,
    y,
    font: ctx.fonts.sans,
    size: 9.5,
    color: C.ink700,
    maxWidth: CONTENT_W * 0.75,
    lineHeight: 14,
  });
  y -= 12;
  drawTermsGrid(page, ctx, y, TERMS_PAGE_3);
  drawFooter(page, ctx, 3);
}

function renderPage4(ctx: RenderCtx): void {
  const page = ctx.pdf.addPage([PAGE_W, PAGE_H]);
  drawHeader(page, ctx, 'Audit trail', 'Terms & definitions (continued)');
  let y = topY(M_TOP + 32 + 20);
  y = drawSectionHead(page, ctx, '05', 'Signature formats, events, and references', y);
  y -= 6;
  y = drawTermsGrid(page, ctx, y, TERMS_PAGE_4);
  y -= 6;
  y = drawReferenceLinks(page, ctx, y);
  y -= 10;
  const closing = `This audit trail was issued by Sealed, Inc. For questions, contact support@sealed.app. The document on file is authoritative — this attestation describes what we observed during signing and the cryptographic evidence we retained.`;
  drawWrappedText(page, closing, {
    x: M_X,
    y,
    font: ctx.fonts.sans,
    size: 9,
    color: C.ink500,
    maxWidth: CONTENT_W,
    lineHeight: 13,
  });
  drawFooter(page, ctx, 4);
}

interface TermDef {
  readonly num: string;
  readonly name: string;
  readonly body: string;
  readonly subItems?: ReadonlyArray<{ readonly k: string; readonly v: string }>;
}

const TERMS_PAGE_3: ReadonlyArray<TermDef> = [
  {
    num: '01',
    name: 'Audit trail',
    body: 'Also referred to as an attestation. A document that details specific information relating to each individual involved in the signing process, used as a record of legal evidence if required.',
  },
  {
    num: '02',
    name: 'Request',
    body: 'The process of preparing a document to be signed by one or more people.',
  },
  {
    num: '03',
    name: 'Proposer',
    body: 'The person — name and email address — who prepared the document and initiated the signature request.',
  },
  {
    num: '04',
    name: 'IP address',
    body: 'A unique address that identifies a device on the internet or a local network and can provide context as to the whereabouts of the signer.',
  },
  {
    num: '05',
    name: 'Request identifier',
    body: 'The unique reference number of the sealed document. With this ID, anyone can look up the document on sealed.app/verify, validate its authenticity, and obtain the audit trail and the original file.',
  },
  {
    num: '06',
    name: 'Signatory identifier',
    body: 'The unique identifier of the individual who signed the document. The UUID is linked only to the signature in the document referenced by the request ID on this audit trail.',
  },
  {
    num: '07',
    name: 'Digital signature',
    body: 'An additional layer of authenticity which adds a certificate to the signed document. A certificate indicates an embedded eIDAS qualified timestamp. Validity is revoked if the document is tampered with after signing.',
  },
  {
    num: '08',
    name: 'Verification check',
    body: 'Additional guarantees of identity the requester may enable for each signer:',
    subItems: [
      { k: 'Email', v: "The recipient's email is validated via a unique link." },
      { k: 'Access code', v: 'The signer is given a distinct code to open the document.' },
      { k: 'SMS', v: 'A code is sent via text message prior to signing.' },
      { k: 'ID verification', v: 'The signer presents a government-issued ID.' },
      { k: 'Account', v: 'The signer is authenticated against a Sealed account.' },
    ],
  },
];

const TERMS_PAGE_4: ReadonlyArray<TermDef> = [
  {
    num: '09',
    name: 'Signature format',
    body: 'The visual style of the signature on the document. It can be typed (text), drawn by hand, or uploaded as an image.',
  },
  {
    num: '10',
    name: 'Events',
    body: 'Major actions taken by each participant.',
    subItems: [
      { k: 'Sent', v: 'The email request has been sent to the participant.' },
      {
        k: 'Viewed',
        v: 'The participant has accepted the Terms and Privacy Policy and viewed the document.',
      },
      { k: 'Signed', v: 'The signer has signed the document.' },
      { k: 'Validated', v: 'The validator has validated the document.' },
    ],
  },
  {
    num: '11',
    name: 'Participant',
    body: 'Anyone involved in the signing process. Roles:',
    subItems: [
      { k: 'Signatory', v: 'Required to sign the document.' },
      {
        k: 'Validator',
        v: 'Given authority to read, validate, or reject before the signature process is finalized.',
      },
      {
        k: 'Witness',
        v: 'Acknowledges the agreement took place. Does not interfere but can track and download.',
      },
    ],
  },
  {
    num: '12',
    name: 'Qualified timestamp',
    body: 'A technological instrument that validates a document existed before a certain date and has not been modified since. Issued by an eIDAS trusted service provider.',
  },
  {
    num: '13',
    name: 'Hash (SHA-256)',
    body: 'A combination of letters and numbers generated by a cryptographic algorithm to produce a unique value that depends on the contents of the file. SHA-256 is the algorithm used here.',
  },
  {
    num: '14',
    name: 'Delivery mode',
    body: 'Parallel: all signers receive the request simultaneously. Sequential: signers receive it in a defined order.',
  },
];

function drawTermsGrid(
  page: PDFPage,
  ctx: RenderCtx,
  yStart: number,
  terms: ReadonlyArray<TermDef>,
): number {
  const colGap = 24;
  const colW = (CONTENT_W - colGap) / 2;
  const leftX = M_X;
  const rightX = M_X + colW + colGap;
  let leftY = yStart;
  let rightY = yStart;
  terms.forEach((term, i) => {
    const useLeft = i % 2 === 0;
    const x = useLeft ? leftX : rightX;
    const yBefore = useLeft ? leftY : rightY;
    const yAfter = drawTerm(page, ctx, term, x, yBefore, colW);
    if (useLeft) leftY = yAfter - 10;
    else rightY = yAfter - 10;
  });
  return Math.min(leftY, rightY);
}

function drawTerm(
  page: PDFPage,
  { fonts }: RenderCtx,
  term: TermDef,
  x: number,
  yTop: number,
  colW: number,
): number {
  // "01  Audit trail"
  const numW = textWidth(fonts.mono, term.num, 8);
  drawTextTop(page, term.num, {
    x,
    y: yTop,
    font: fonts.mono,
    size: 8,
    color: C.indigo600,
  });
  drawTextTop(page, term.name, {
    x: x + numW + 8,
    y: yTop,
    font: fonts.sansBold,
    size: 9,
    color: C.ink900,
    maxWidth: colW - numW - 8,
  });
  let y = yTop - 14;
  y = drawWrappedText(page, term.body, {
    x,
    y,
    font: fonts.sans,
    size: 8.5,
    color: C.ink700,
    maxWidth: colW,
    lineHeight: 12,
  });
  if (term.subItems) {
    // Left rule + sub items
    const subX = x + 10;
    const subStartY = y - 2;
    let subY = subStartY;
    for (const item of term.subItems) {
      const headText = `${item.k}. `;
      const headW = textWidth(fonts.sansBold, headText, 8.5);
      drawTextTop(page, headText, {
        x: subX,
        y: subY,
        font: fonts.sansBold,
        size: 8.5,
        color: C.ink900,
      });
      subY = drawWrappedText(page, item.v, {
        x: subX + headW,
        y: subY,
        font: fonts.sans,
        size: 8.5,
        color: C.ink700,
        maxWidth: colW - 10 - headW,
        lineHeight: 12,
      });
      subY -= 2;
    }
    // vertical rule
    page.drawLine({
      start: { x: x + 2, y: subStartY - 2 },
      end: { x: x + 2, y: subY + 2 },
      thickness: 1.5,
      color: C.ink200,
    });
    y = subY;
  }
  y -= 6;
  drawHRule(page, x, y, colW);
  return y - 2;
}

function drawReferenceLinks(page: PDFPage, { fonts }: RenderCtx, y: number): number {
  const h = 72;
  drawRoundedRect(page, {
    x: M_X,
    y: y - h,
    width: CONTENT_W,
    height: h,
    radius: 12,
    fill: C.ink50,
    stroke: C.ink200,
    strokeWidth: 1,
  });
  const padX = 14;
  const padY = 10;
  drawTextTop(page, 'REFERENCE', {
    x: M_X + padX,
    y: y - padY,
    font: fonts.sansBold,
    size: 8,
    color: C.ink500,
  });
  const links: Array<{ label: string; url: string }> = [
    { label: 'Sealed signature user guide', url: 'sealed.app/help/guides' },
    { label: 'Sealed terms and conditions', url: 'sealed.app/help/terms' },
    { label: 'Sealed signature privacy notice', url: 'sealed.app/help/privacy' },
  ];
  let linkY = y - padY - 18;
  // Arrow drawn as primitive strokes (Inter doesn't carry "→" in its
  // subset, so a glyph would render as tofu).
  const arrowWidth = 12;
  for (const link of links) {
    drawArrowRight(page, M_X + padX, linkY - 4, arrowWidth, C.indigo600);
    const labelX = M_X + padX + arrowWidth + 8;
    drawTextTop(page, link.label, {
      x: labelX,
      y: linkY,
      font: fonts.sansBold,
      size: 9.5,
      color: C.ink900,
    });
    const labelW = textWidth(fonts.sansBold, link.label, 9.5);
    drawTextTop(page, link.url, {
      x: labelX + labelW + 12,
      y: linkY,
      font: fonts.mono,
      size: 8.5,
      color: C.ink500,
    });
    linkY -= 16;
  }
  return y - h;
}

/** Right-pointing arrow: a horizontal stroke with two head strokes.
 *  `yMid` is the vertical center of the arrow body. */
function drawArrowRight(page: PDFPage, x: number, yMid: number, width: number, color: Color): void {
  const stroke = 1.4;
  const headSize = Math.min(width * 0.4, 5);
  page.drawLine({
    start: { x, y: yMid },
    end: { x: x + width, y: yMid },
    thickness: stroke,
    color,
  });
  page.drawLine({
    start: { x: x + width, y: yMid },
    end: { x: x + width - headSize, y: yMid + headSize * 0.7 },
    thickness: stroke,
    color,
  });
  page.drawLine({
    start: { x: x + width, y: yMid },
    end: { x: x + width - headSize, y: yMid - headSize * 0.7 },
    thickness: stroke,
    color,
  });
}

// ---------------------------------------------------------------------------
// Derivation helpers — pure functions over the input aggregate
// ---------------------------------------------------------------------------

function deriveProposer(ctx: RenderCtx): { name: string; email: string } {
  const env = ctx.envelope;
  return {
    name: env.sender_name ?? env.sender_email?.split('@')[0] ?? 'Sender',
    email: env.sender_email ?? '—',
  };
}

function firstEventIp(
  events: ReadonlyArray<EnvelopeEvent>,
  types: ReadonlyArray<string>,
): string | null {
  for (const ev of events) {
    if (types.includes(ev.event_type) && ev.ip) return ev.ip;
  }
  return null;
}

function deriveDeclinedAt(ctx: RenderCtx): string | null {
  const decl = ctx.events.find((e) => e.event_type === 'declined');
  return decl ? formatDateTimeFull(decl.created_at) : null;
}

function humanEnvelopeStatus(status: Envelope['status']): string {
  switch (status) {
    case 'awaiting_others':
      return 'Awaiting signatures';
    case 'draft':
      return 'Draft';
    case 'sealing':
      return 'Sealing';
    case 'completed':
      return 'Completed';
    case 'declined':
      return 'Declined';
    case 'expired':
      return 'Expired';
    case 'canceled':
      return 'Canceled';
    default:
      return status;
  }
}

function humanDelivery(mode: Envelope['delivery_mode']): string {
  return mode === 'parallel' ? 'Parallel' : 'Sequential';
}

function humanRoleLabel(
  role: 'proposer' | 'signatory' | 'validator' | 'witness',
): 'Proposer' | 'Signatory' | 'Validator' | 'Witness' {
  return (role.charAt(0).toUpperCase() + role.slice(1)) as
    | 'Proposer'
    | 'Signatory'
    | 'Validator'
    | 'Witness';
}

function humanSignatureFormat(f: 'typed' | 'drawn' | 'upload' | null | undefined): string {
  if (f === 'typed') return 'Text';
  if (f === 'drawn') return 'Drawn';
  if (f === 'upload') return 'Uploaded';
  return '—';
}

function humanSignatureMark(
  signer: EnvelopeSigner,
  format: 'typed' | 'drawn' | 'upload' | null | undefined,
): string {
  // For all formats we render the signer's name in the script font. The
  // canonical signature image lives in the sealed PDF — this mark in the
  // audit trail attests to identity, not to the exact glyph strokes.
  void format;
  return signer.name;
}

function deriveVerificationChecks(raw: ReadonlyArray<string>): ReadonlyArray<string> {
  const seen = new Set(raw.map((c) => c.toLowerCase()));
  const out: string[] = [];
  if (seen.has('email') || seen.size === 0) out.push('Email');
  if (seen.has('account')) out.push('Account');
  if (seen.has('access_code')) out.push('Access code');
  if (seen.has('sms')) out.push('SMS');
  if (seen.has('id')) out.push('ID');
  return out;
}

function computeDurationText(ctx: RenderCtx): string {
  const env = ctx.envelope;
  if (!env.completed_at) return '—';
  const start = new Date(env.created_at).getTime();
  const end = new Date(env.completed_at).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return '—';
  const secTotal = Math.round((end - start) / 1000);
  const d = Math.floor(secTotal / 86400);
  const h = Math.floor((secTotal % 86400) / 3600);
  const m = Math.floor((secTotal % 3600) / 60);
  const s = secTotal % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function safeFilename(title: string, signed = false): string {
  const base = title.replace(/[\\/:*?"<>|]/g, '').trim() || 'document';
  return signed ? `${base} (signed).pdf` : `${base}.pdf`;
}

function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

function indexBy<T, K>(xs: ReadonlyArray<T>, keyFn: (x: T) => K): Map<K, T> {
  const m = new Map<K, T>();
  for (const x of xs) m.set(keyFn(x), x);
  return m;
}

// ---------------------------------------------------------------------------
// Date formatting — matches design examples
//   "Mar 11, 2026 · 8:59:03 PM UTC"   (full, datagrid)
//   "Mar 11, 2026 · 8:59:04 PM"       (short, events table)
//   "9:21:22 PM"                       (time only, signature meta)
// ---------------------------------------------------------------------------

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function parseIso(iso: string): Date | null {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDateShort(iso: string): string {
  const d = parseIso(iso);
  if (!d) return iso;
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

function formatDateTimeFull(iso: string): string {
  const d = parseIso(iso);
  if (!d) return iso;
  return `${formatDateShort(iso)} · ${formatTimeFull(iso)} UTC`;
}

function formatDateTimeShort(iso: string): string {
  const d = parseIso(iso);
  if (!d) return iso;
  return `${formatDateShort(iso)} · ${formatTimeShort(iso)}`;
}

function formatTimeFull(iso: string): string {
  const d = parseIso(iso);
  if (!d) return iso;
  const h = d.getUTCHours();
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const ampm = h < 12 ? 'AM' : 'PM';
  return `${h12}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())} ${ampm}`;
}

function formatTimeShort(iso: string): string {
  const d = parseIso(iso);
  if (!d) return iso;
  const h = d.getUTCHours();
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const ampm = h < 12 ? 'AM' : 'PM';
  return `${h12}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())} ${ampm}`;
}

// ---------------------------------------------------------------------------
// QR — production PNG at 240px, embedded as a PDFImage
// ---------------------------------------------------------------------------

async function embedQr(pdf: PDFDocument, url: string): Promise<PDFImage> {
  const dataUrl = await QRCode.toDataURL(url, {
    margin: 0,
    width: 240,
    errorCorrectionLevel: 'M',
    color: { dark: '#0B1220', light: '#FFFFFF' },
  });
  const base64 = dataUrl.split(',')[1]!;
  const bytes = Buffer.from(base64, 'base64');
  return pdf.embedPng(bytes);
}
