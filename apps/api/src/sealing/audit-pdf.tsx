/* eslint-disable react/no-unknown-property */
import { join } from 'node:path';
import {
  Document,
  Font,
  Image,
  Page,
  Path,
  StyleSheet,
  Svg,
  Text,
  View,
  renderToBuffer,
} from '@react-pdf/renderer';
import * as React from 'react';
import QRCode from 'qrcode';
import type { Envelope, EnvelopeEvent, EnvelopeSigner } from '../envelopes/envelope.entity';
import type { SignerAuditDetail } from '../envelopes/envelopes.repository';

/**
 * React-PDF–based audit-trail renderer.
 *
 * Replaces the imperative pdf-lib / drawing-primitives implementation with
 * a declarative React component tree. The advantage for this document
 * specifically:
 *
 *   - Lucide icons render from real SVG paths via <Svg><Path/></Svg>, so
 *     the result matches the design system 1:1 (no missing-glyph fallback,
 *     no hand-traced shapes that drift from the source SVGs).
 *   - Spacing / typography lives in StyleSheet.create maps that read like
 *     CSS, which makes pixel-perfect tweaks against the design HTML
 *     trivial — no manual coordinate math.
 *   - Page break / wrap behavior is handled by the framework, so long
 *     titles, big signer rosters, and overflow no longer require ad-hoc
 *     truncation logic.
 *
 * Public surface is unchanged: `buildAuditPdf(input): Promise<Buffer>`.
 * The sealing service calls this for both `seal` and `audit_only` jobs.
 */

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface AuditPdfInput {
  readonly envelope: Envelope;
  /** All envelope_events ordered ascending by created_at. The repo already
   *  sorts; renderer trusts input order. */
  readonly events: ReadonlyArray<EnvelopeEvent>;
  /** Per-signer metadata not exposed on the public Signer wire shape
   *  (signature_format, verification_checks, signing_ip). */
  readonly signerDetails: ReadonlyArray<SignerAuditDetail>;
  /** SHA-256 hex of the sealed PDF; null for audit_only jobs (declined,
   *  expired). */
  readonly sealedSha256: string | null;
  /** Page count of the sealed PDF (after burn-in + PAdES). The sealed file
   *  has its own page count distinct from `envelope.original_pages`. Null
   *  for audit_only jobs where there is no sealed file. */
  readonly sealedPages: number | null;
  /** Public origin like "https://seald.nromomentum.com" — trailing slash
   *  is stripped. Verify URL is derived as `${publicUrl}/verify/{short_code}`. */
  readonly publicUrl: string;
}

export async function buildAuditPdf(input: AuditPdfInput): Promise<Buffer> {
  registerFontsOnce();

  const verifyUrl = `${input.publicUrl.replace(/\/$/, '')}/verify/${input.envelope.short_code}`;
  const qrDataUrl = await QRCode.toDataURL(verifyUrl, {
    margin: 0,
    width: 240,
    errorCorrectionLevel: 'M',
    color: { dark: '#0B1220', light: '#FFFFFF' },
  });

  const buf = await renderToBuffer(
    <AuditDocument
      envelope={input.envelope}
      events={input.events}
      signerDetails={input.signerDetails}
      sealedSha256={input.sealedSha256}
      sealedPages={input.sealedPages}
      verifyUrl={verifyUrl}
      qrDataUrl={qrDataUrl}
    />,
  );
  // renderToBuffer returns Buffer in Node; widen the type for the call
  // site which uses Buffer.
  return Buffer.from(buf);
}

// ---------------------------------------------------------------------------
// Fonts — register once per process. The TTFs ship in apps/api/dist/src/sealing/fonts/
// (assets entry in nest-cli.json), so __dirname resolves correctly in
// both ts-node (src/) and the compiled artifact (dist/src/).
// ---------------------------------------------------------------------------

let fontsRegistered = false;
function registerFontsOnce(): void {
  if (fontsRegistered) return;
  const fontsDir = join(__dirname, 'fonts');
  // For each family register all weight + style combinations the layout
  // engine might request — react-pdf falls through to italic asks even
  // for plain text under some flex layouts, so we point italic to the
  // upright file as a fallback to avoid "Could not resolve font" throws.
  Font.register({
    family: 'Inter',
    fonts: [
      { src: join(fontsDir, 'Inter-Regular.ttf'), fontWeight: 400 },
      { src: join(fontsDir, 'Inter-Regular.ttf'), fontWeight: 400, fontStyle: 'italic' },
      { src: join(fontsDir, 'Inter-SemiBold.ttf'), fontWeight: 600 },
      { src: join(fontsDir, 'Inter-SemiBold.ttf'), fontWeight: 600, fontStyle: 'italic' },
      { src: join(fontsDir, 'Inter-SemiBold.ttf'), fontWeight: 700 },
    ],
  });
  Font.register({
    family: 'SourceSerif4',
    fonts: [
      { src: join(fontsDir, 'SourceSerif4-Regular.ttf'), fontWeight: 400 },
      { src: join(fontsDir, 'SourceSerif4-Regular.ttf'), fontWeight: 400, fontStyle: 'italic' },
      { src: join(fontsDir, 'SourceSerif4-Medium.ttf'), fontWeight: 500 },
      { src: join(fontsDir, 'SourceSerif4-Medium.ttf'), fontWeight: 500, fontStyle: 'italic' },
    ],
  });
  Font.register({
    family: 'JetBrainsMono',
    fonts: [
      { src: join(fontsDir, 'JetBrainsMono-Regular.ttf'), fontWeight: 400 },
      { src: join(fontsDir, 'JetBrainsMono-Regular.ttf'), fontWeight: 400, fontStyle: 'italic' },
    ],
  });
  Font.register({
    family: 'Caveat',
    fonts: [
      { src: join(fontsDir, 'Caveat-SemiBold.ttf'), fontWeight: 600 },
      { src: join(fontsDir, 'Caveat-SemiBold.ttf'), fontWeight: 600, fontStyle: 'italic' },
    ],
  });
  // Disable hyphenation — for our copy it just looks weird in glossary
  // bodies. We trust word boundaries to wrap.
  Font.registerHyphenationCallback((word) => [word]);
  fontsRegistered = true;
}

// ---------------------------------------------------------------------------
// Color tokens — pulled from Design-Guide/project/colors_and_type.css
// ---------------------------------------------------------------------------

const C = {
  ink900: '#0B1220',
  ink800: '#131A2B',
  ink700: '#1F2937',
  ink600: '#374151',
  ink500: '#64748B',
  ink400: '#94A3B8',
  ink300: '#CBD5E1',
  ink200: '#E2E8F0',
  ink150: '#EDF1F6',
  ink100: '#F3F6FA',
  ink50: '#F8FAFC',
  paper: '#FFFFFF',
  indigo50: '#EEF2FF',
  indigo100: '#E0E7FF',
  indigo200: '#C7D2FE',
  indigo600: '#4F46E5',
  indigo700: '#4338CA',
  success50: '#ECFDF5',
  success500: '#10B981',
  success700: '#047857',
  info50: '#EFF6FF',
  info500: '#3B82F6',
  info700: '#1D4ED8',
};

// ---------------------------------------------------------------------------
// Lucide icon set — exact `d` strings from lucide-static so the audit PDF
// uses the same glyphs as the design system. stroke-width / cap / join
// applied via <Path> attributes; viewBox is always 24×24.
// ---------------------------------------------------------------------------

const ICONS = {
  plus: ['M12 5v14', 'M5 12h14'],
  send: ['m22 2-7 20-4-9-9-4Z', 'M22 2 11 13'],
  inbox: [
    'M22 12h-6l-2 3h-4l-2-3H2',
    'M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z',
  ],
  eye: ['M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z', 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z'],
  signature: ['M20 19c-2.8 0-5-2.2-5-5s2.2-5 5-5'],
  signatureFull: [
    'M3 17c1.5 0 4-2 5.5-3 1.5-1 4-3 4-3',
    'M9 11c0 .5 0 1 .5 1.5C10.5 13.5 12 14 12 14',
    'M14 14s2.5 1 5 0',
    'M3 21h18',
  ],
  pen: [
    'M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z',
    'm15 5 4 4',
  ],
  x: ['M18 6 6 18', 'm6 6 12 12'],
  shieldCheck: [
    'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z',
    'm9 12 2 2 4-4',
  ],
  clock: ['M12 6v6l4 2'],
  clockCircle: ['M12 6v6l4 2', 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Z'],
  lock: [
    'M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2Z',
    'M7 11V7a5 5 0 0 1 10 0v4',
  ],
  check: ['M20 6 9 17l-5-5'],
  arrowRight: ['M5 12h14', 'm12 5 7 7-7 7'],
};

interface IconProps {
  paths: ReadonlyArray<string>;
  /** Pixel size (square). Default 14 — sized for the 22pt event-row chip. */
  size?: number;
  color: string;
  /** Stroke width in viewBox units (1 unit = 1/24 of the icon size). */
  strokeWidth?: number;
  fill?: string;
}

function Icon({
  paths,
  size = 14,
  color,
  strokeWidth = 2,
  fill = 'none',
}: IconProps): React.ReactElement {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {paths.map((d, i) => (
        <Path
          key={i}
          d={d}
          stroke={color}
          strokeWidth={strokeWidth}
          fill={fill}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </Svg>
  );
}

// ---------------------------------------------------------------------------
// Stylesheet — design tokens mapped to react-pdf's CSS-subset styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  page: {
    backgroundColor: C.paper,
    color: C.ink900,
    fontFamily: 'Inter',
    fontSize: 10,
    lineHeight: 1.5,
    paddingTop: 36,
    paddingBottom: 50,
    paddingHorizontal: 43.2, // 0.6"
    flexDirection: 'column',
  },

  // ---- Header / footer ----
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.ink200,
    borderBottomStyle: 'solid',
  },
  brand: { flexDirection: 'row', alignItems: 'center' },
  // Wraps the SealdMark SVG so we can apply spacing without mutating
  // the SVG's own intrinsic size.
  brandMarkWrap: { width: 18, height: 18, marginRight: 8 },
  brandWord: {
    fontFamily: 'SourceSerif4',
    fontWeight: 500,
    fontSize: 14,
    color: C.ink900,
    letterSpacing: -0.2,
  },
  eyebrow: {
    fontFamily: 'Inter',
    fontWeight: 600,
    fontSize: 8,
    color: C.ink500,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  eyebrowSep: { color: C.ink300, marginHorizontal: 6, fontSize: 8 },
  eyebrowSuffix: { color: C.ink700 },

  footerWrap: {
    position: 'absolute',
    left: 43.2,
    right: 43.2,
    bottom: 18,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: C.ink200,
    borderTopStyle: 'solid',
  },
  footerBrand: { flexDirection: 'row', alignItems: 'center' },
  footerBrandMarkWrap: { width: 10, height: 10, marginRight: 6 },
  footerBrandWord: { fontFamily: 'SourceSerif4', fontWeight: 500, fontSize: 9, color: C.ink900 },
  footerCaption: { fontFamily: 'Inter', fontSize: 8, color: C.ink500, marginLeft: 5 },
  footerPagenumWrap: { flexDirection: 'row' },
  footerPagenumCur: { fontFamily: 'JetBrainsMono', fontSize: 8, color: C.ink900 },
  footerPagenumSep: { fontFamily: 'JetBrainsMono', fontSize: 8, color: C.ink500 },
  footerPagenumTotal: { fontFamily: 'JetBrainsMono', fontSize: 8, color: C.ink700 },
  footerReq: {
    marginTop: 6,
    textAlign: 'center',
    fontFamily: 'JetBrainsMono',
    fontSize: 7.5,
    color: C.ink500,
  },

  // ---- Hero (page 1) ----
  // Tightened mt 14 → 10 to give page-1 ~8pt of vertical headroom so
  // the verify card stays anchored at the bottom of the same page.
  hero: { marginTop: 10 },
  heroKicker: {
    fontFamily: 'Inter',
    fontWeight: 600,
    fontSize: 8,
    color: C.ink500,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  heroTitleRow: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap' },
  heroTitle: {
    fontFamily: 'SourceSerif4',
    fontWeight: 500,
    fontSize: 24,
    color: C.ink900,
    letterSpacing: -0.5,
    lineHeight: 1.1,
  },
  heroScript: {
    fontFamily: 'Caveat',
    fontWeight: 600,
    fontSize: 28,
    color: C.indigo600,
    marginHorizontal: 6,
    lineHeight: 1.05,
  },
  heroSubtitle: {
    fontFamily: 'Inter',
    fontSize: 9.5,
    color: C.ink700,
    lineHeight: 1.45,
    maxWidth: '72%',
    marginTop: 8,
  },

  seal: {
    position: 'absolute',
    right: 0,
    top: -4,
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 1.4,
    borderColor: C.indigo200,
    borderStyle: 'solid',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sealInner: {
    position: 'absolute',
    left: 5,
    top: 5,
    right: 5,
    bottom: 5,
    borderRadius: 32,
    borderWidth: 1,
    borderColor: C.indigo100,
    borderStyle: 'solid',
  },
  sealScript: {
    fontFamily: 'Caveat',
    fontWeight: 600,
    fontSize: 17,
    color: C.indigo700,
    lineHeight: 1,
  },
  sealLabel: {
    fontFamily: 'Inter',
    fontWeight: 600,
    fontSize: 6,
    color: C.indigo600,
    letterSpacing: 1.2,
    marginTop: 2,
    textTransform: 'uppercase',
  },

  // ---- Section heads ----
  // Tightened from mt:14/mb:8 → mt:11/mb:6 so page 1 (4 stacked
  // sections + datagrid + hash cards + verify card) fits on one
  // physical page.
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 11,
    marginBottom: 6,
  },
  sectionNum: { fontFamily: 'JetBrainsMono', fontSize: 9, color: C.indigo600, marginRight: 8 },
  sectionTitle: {
    fontFamily: 'SourceSerif4',
    fontWeight: 500,
    fontSize: 13,
    color: C.ink900,
    letterSpacing: -0.2,
  },
  sectionRule: { flex: 1, height: 1, backgroundColor: C.ink200, marginLeft: 10 },

  // ---- Datagrid (page 1, section 01) ----
  datagrid: {
    borderWidth: 1,
    borderColor: C.ink200,
    borderStyle: 'solid',
    borderRadius: 10,
    overflow: 'hidden',
  },
  datagridRow: { flexDirection: 'row' },
  datagridRowDivider: {
    borderTopWidth: 1,
    borderTopColor: C.ink200,
    borderTopStyle: 'solid',
  },
  datacell: {
    flex: 1,
    paddingVertical: 7,
    paddingHorizontal: 14,
    minHeight: 34,
    justifyContent: 'center',
  },
  datacellDivider: {
    borderRightWidth: 1,
    borderRightColor: C.ink200,
    borderRightStyle: 'solid',
  },
  dcLabel: {
    fontFamily: 'Inter',
    fontWeight: 600,
    fontSize: 7.5,
    color: C.ink500,
    letterSpacing: 0.9,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  dcValue: { fontFamily: 'Inter', fontWeight: 600, fontSize: 9.5, color: C.ink900 },
  dcValueMono: {
    fontFamily: 'JetBrainsMono',
    fontWeight: 400,
    fontSize: 8.5,
    color: C.ink900,
  },
  dcCheckRow: { flexDirection: 'row', alignItems: 'center' },
  dcCheckDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: C.success500,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },

  // ---- Hash cards (page 1, section 02) ----
  // Spec: Design-Guide/project/audit-trail.html lines 232-282.
  // border-radius r-md=12, padding 9/14, ink-50 bg, ink-200 border.
  hashBlock: { flexDirection: 'column' },
  hashCard: {
    borderWidth: 1,
    borderColor: C.ink200,
    borderStyle: 'solid',
    borderRadius: 12,
    backgroundColor: C.ink50,
    paddingVertical: 9,
    paddingHorizontal: 14,
    marginBottom: 6,
  },
  hashRow: { flexDirection: 'row', alignItems: 'center' },
  hashDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: C.ink400, marginRight: 8 },
  hashDotSigned: { backgroundColor: C.success500 },
  hashType: {
    fontFamily: 'Inter',
    fontWeight: 600,
    fontSize: 7.5,
    color: C.ink500,
    // 0.12em on a 7.5pt font ≈ 0.9pt of letter-spacing.
    letterSpacing: 0.9,
    textTransform: 'uppercase',
    marginRight: 16,
  },
  // .hash-filename: font-weight 500 per design (was 600). Pages span
  // inherits 10pt size; only color + weight differ on `.pages`.
  hashFilename: { fontFamily: 'Inter', fontWeight: 500, fontSize: 10, color: C.ink900, flex: 1 },
  hashPages: { fontFamily: 'Inter', fontWeight: 400, fontSize: 10, color: C.ink500 },
  hashValue: {
    marginTop: 4,
    fontFamily: 'JetBrainsMono',
    fontSize: 8,
    color: C.ink700,
    lineHeight: 1.4,
  },

  // ---- Verify card ----
  // Spec: Design-Guide/project/audit-trail.html lines 285-350.
  // border-radius r-lg=16, padding 12/18, ink-200 border, gap 18 to QR.
  // Design uses linear-gradient(180deg, ink-50, paper); react-pdf does
  // not support gradients so we use ink-50 (the gradient's top color)
  // — matches the perceived hue in the design preview within ~3% L*.
  verifyCard: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: C.ink200,
    borderStyle: 'solid',
    borderRadius: 16,
    backgroundColor: C.ink50,
    // Design has paddingVertical 12 but the page-1 budget can't fit
    // it once the evidence + hash sections are above. 9pt vertical
    // keeps the card visually balanced and on the same page.
    paddingVertical: 9,
    paddingHorizontal: 18,
    marginTop: 8,
  },
  verifyBody: { flex: 1 },
  // Vertical metrics compressed slightly vs design (mb 6→4, copy
  // lh 1.45→1.35, copy size 9→8.5, mb-after-copy 6→5) so the
  // verify card stays on page 1. Visual treatments (color, weight,
  // letter-spacing, radius, padding) match design exactly.
  verifyEyebrow: {
    fontFamily: 'Inter',
    fontWeight: 600,
    fontSize: 7.5,
    color: C.indigo600,
    // 0.12em × 7.5pt ≈ 0.9pt
    letterSpacing: 0.9,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  verifyTitle: {
    fontFamily: 'SourceSerif4',
    fontWeight: 500,
    fontSize: 12,
    color: C.ink900,
    // -0.01em × 12pt ≈ -0.12pt
    letterSpacing: -0.12,
    marginBottom: 3,
  },
  verifyCopy: {
    fontFamily: 'Inter',
    fontSize: 8.5,
    color: C.ink700,
    lineHeight: 1.35,
    marginBottom: 5,
  },
  verifyFieldRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 1 },
  verifyKey: {
    fontFamily: 'Inter',
    fontWeight: 600,
    fontSize: 7.5,
    color: C.ink500,
    // 0.06em × 7.5pt ≈ 0.45pt
    letterSpacing: 0.45,
    textTransform: 'uppercase',
    width: 40,
  },
  verifyVal: {
    fontFamily: 'JetBrainsMono',
    fontSize: 8.5,
    color: C.ink700,
    flex: 1,
  },
  // Design spec: 88×88 outer with 6 inner padding + r-sm=8 corner +
  // gap 18 to body. We hold size at 84 (vs design 88) so the QR card
  // height matches the compressed body height — the row uses default
  // alignment (stretch) so a taller QR would otherwise stretch the
  // card beyond the body's height and waste vertical budget on
  // page 1. Visual perception: 84 vs 88 is sub-pixel at print scale.
  qrWrap: {
    width: 84,
    height: 84,
    backgroundColor: C.paper,
    borderWidth: 1,
    borderColor: C.ink200,
    borderStyle: 'solid',
    borderRadius: 8,
    padding: 6,
    marginLeft: 18,
  },
  qrImg: { width: '100%', height: '100%' },

  // ---- Page 2 — participants ----
  // Tightened intro line-height + bottom margin so 3 participant
  // cards + a TrustBar fit on one Letter page (was lh:1.5/mb:14).
  p2Intro: {
    fontFamily: 'Inter',
    fontSize: 9.5,
    color: C.ink700,
    lineHeight: 1.4,
    maxWidth: '72%',
    marginBottom: 10,
  },
  participant: {
    borderWidth: 1,
    borderColor: C.ink200,
    borderStyle: 'solid',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 8,
  },
  pHead: {
    flexDirection: 'row',
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: C.ink50,
    borderBottomWidth: 1,
    borderBottomColor: C.ink200,
    borderBottomStyle: 'solid',
  },
  pIdentity: { flex: 1 },
  pSig: { width: 240, alignItems: 'flex-end' },
  pRole: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  pRoleDot: { width: 6, height: 6, borderRadius: 3, marginRight: 6 },
  pRoleLabel: {
    fontFamily: 'Inter',
    fontWeight: 600,
    fontSize: 7.5,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  pName: {
    fontFamily: 'SourceSerif4',
    fontWeight: 500,
    fontSize: 13,
    color: C.ink900,
    letterSpacing: -0.2,
    lineHeight: 1.2,
  },
  pContact: { fontFamily: 'Inter', fontSize: 9.5, color: C.ink500, marginTop: 2 },

  pSigEyebrow: {
    fontFamily: 'Inter',
    fontWeight: 600,
    fontSize: 7.5,
    color: C.ink500,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  pSigMark: {
    fontFamily: 'Caveat',
    fontWeight: 600,
    fontSize: 22,
    color: C.ink900,
    paddingHorizontal: 4,
    minWidth: 180,
    textAlign: 'left',
    lineHeight: 1.05,
  },
  pSigUnderline: {
    width: 200,
    borderBottomWidth: 1,
    borderBottomColor: C.ink400,
    borderBottomStyle: 'solid',
    marginTop: 4,
  },
  pSigMeta: {
    fontFamily: 'JetBrainsMono',
    fontSize: 7.5,
    color: C.ink500,
    marginTop: 4,
  },
  pSigMetaInline: {
    fontFamily: 'JetBrainsMono',
    fontSize: 8,
    color: C.ink700,
    marginTop: 6,
  },

  pMeta: {
    flexDirection: 'row',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: C.ink200,
    borderBottomStyle: 'solid',
  },
  pMetaCol: { flex: 1, marginRight: 14 },
  pMetaColLast: { marginRight: 0 },
  pMetaLabel: {
    fontFamily: 'Inter',
    fontWeight: 600,
    fontSize: 7.5,
    color: C.ink500,
    letterSpacing: 0.9,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  pMetaValue: { fontFamily: 'Inter', fontWeight: 600, fontSize: 10, color: C.ink900 },
  pMetaValueMono: {
    fontFamily: 'JetBrainsMono',
    fontSize: 8.5,
    color: C.ink900,
    fontWeight: 400,
  },
  checkChips: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 0 },
  checkChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.indigo50,
    borderRadius: 12,
    paddingVertical: 3,
    paddingHorizontal: 8,
    marginRight: 6,
    marginBottom: 4,
  },
  checkChipDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: C.indigo600,
    marginRight: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkChipLabel: {
    fontFamily: 'Inter',
    fontWeight: 600,
    fontSize: 8.5,
    // Tight line height so flex `alignItems: center` aligns the optical
    // glyph centre with the icon dot. Default lineHeight inflates the
    // text bounding box and pushes the visible text above the dot.
    lineHeight: 1,
    color: C.indigo700,
  },

  evtHead: {
    flexDirection: 'row',
    paddingVertical: 7,
    paddingHorizontal: 16,
    backgroundColor: C.ink50,
    borderBottomWidth: 1,
    borderBottomColor: C.ink200,
    borderBottomStyle: 'solid',
  },
  evtHeadLabel: {
    fontFamily: 'Inter',
    fontWeight: 600,
    fontSize: 7.5,
    color: C.ink500,
    letterSpacing: 0.9,
    textTransform: 'uppercase',
  },
  evtRow: {
    flexDirection: 'row',
    paddingVertical: 6,
    paddingHorizontal: 16,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: C.ink200,
    borderBottomStyle: 'solid',
  },
  evtRowLast: { borderBottomWidth: 0 },
  evtAction: { flex: 1.5, flexDirection: 'row', alignItems: 'center' },
  evtIco: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  evtActionText: { fontFamily: 'Inter', fontSize: 10, color: C.ink900, fontWeight: 500 },
  evtIp: { flex: 1.4, fontFamily: 'JetBrainsMono', fontSize: 9, color: C.ink700 },
  evtIpDim: { color: C.ink400 },
  evtTs: { flex: 1.6, fontFamily: 'JetBrainsMono', fontSize: 9, color: C.ink700 },

  // ---- Trust bar ----
  // marginTop tightened from 14 to 8 + smaller paddings so the bar
  // fits at the bottom of the participants page instead of
  // orphaning onto its own physical page.
  trustBar: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: C.ink200,
    borderStyle: 'solid',
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 8,
  },
  trustCell: {
    flex: 1,
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRightWidth: 1,
    borderRightColor: C.ink200,
    borderRightStyle: 'solid',
  },
  trustCellLast: { borderRightWidth: 0 },
  trustLabel: {
    fontFamily: 'Inter',
    fontWeight: 600,
    fontSize: 7.5,
    color: C.ink500,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  trustValue: {
    fontFamily: 'Inter',
    fontWeight: 600,
    fontSize: 10,
    color: C.ink900,
    marginBottom: 2,
  },
  trustSub: { fontFamily: 'Inter', fontSize: 8.5, color: C.ink500, lineHeight: 1.4 },

  // ---- Terms (pages 3 & 4) ----
  termsIntro: {
    fontFamily: 'Inter',
    fontSize: 9.5,
    color: C.ink700,
    lineHeight: 1.5,
    maxWidth: '76%',
    marginBottom: 8,
  },
  termsGrid: { flexDirection: 'row', columnGap: 24 },
  termsCol: { flex: 1 },
  term: {
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: C.ink200,
    borderBottomStyle: 'solid',
  },
  termHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 2 },
  termNum: { fontFamily: 'JetBrainsMono', fontSize: 8, color: C.indigo600, marginRight: 8 },
  termName: { fontFamily: 'Inter', fontWeight: 700, fontSize: 9, color: C.ink900 },
  termBody: { fontFamily: 'Inter', fontSize: 8.5, color: C.ink700, lineHeight: 1.5 },
  subItems: {
    marginTop: 4,
    paddingLeft: 10,
    borderLeftWidth: 2,
    borderLeftColor: C.ink200,
    borderLeftStyle: 'solid',
  },
  subItem: { fontFamily: 'Inter', fontSize: 8.5, color: C.ink700, lineHeight: 1.5 },
  subItemKey: { fontFamily: 'Inter', fontWeight: 700, color: C.ink900 },

  refsCard: {
    marginTop: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: C.ink200,
    borderStyle: 'solid',
    borderRadius: 12,
    backgroundColor: C.ink50,
  },
  refsHead: {
    fontFamily: 'Inter',
    fontWeight: 600,
    fontSize: 8,
    color: C.ink500,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  refRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  refIcon: { marginRight: 8 },
  refLabel: { fontFamily: 'Inter', fontWeight: 600, fontSize: 9.5, color: C.ink900 },
  refUrl: {
    fontFamily: 'JetBrainsMono',
    fontSize: 8.5,
    color: C.ink500,
    marginLeft: 12,
  },
  closing: {
    fontFamily: 'Inter',
    fontSize: 9,
    color: C.ink500,
    lineHeight: 1.5,
    marginTop: 14,
    fontStyle: 'italic',
  },
});

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

interface DocumentRenderProps {
  envelope: Envelope;
  events: ReadonlyArray<EnvelopeEvent>;
  signerDetails: ReadonlyArray<SignerAuditDetail>;
  sealedSha256: string | null;
  sealedPages: number | null;
  verifyUrl: string;
  qrDataUrl: string;
}

function AuditDocument(props: DocumentRenderProps): React.ReactElement {
  const detailsBySigner = new Map(props.signerDetails.map((d) => [d.signer_id, d]));
  const ctx: RenderCtx = { ...props, detailsBySigner };
  return (
    <Document
      title={`Audit trail — ${props.envelope.title}`}
      author="Seald"
      creator="Seald"
      subject={`Audit trail for ${props.envelope.short_code}`}
    >
      <Page size="LETTER" style={styles.page}>
        <PageHeader suffix="Attestation of signing" />
        <Hero envelope={props.envelope} />
        <Section num="01" title="Document evidence and access" />
        <Datagrid ctx={ctx} />
        <Section num="02" title="Cryptographic fingerprint (SHA-256)" />
        <HashCards ctx={ctx} />
        <VerifyCard
          verifyUrl={props.verifyUrl}
          qrDataUrl={props.qrDataUrl}
          shortCode={props.envelope.short_code}
        />
        <PageFooter ctx={ctx} />
      </Page>

      <Page size="LETTER" style={styles.page}>
        <PageHeader suffix="Participants" />
        <Section num="03" title="Participants and events" />
        <Text style={styles.p2Intro}>
          Each table below records the major events for every participant in the signing process —
          the actions they took, the IP address they took them from, and the time those actions were
          stamped by our servers. Roles and event types are defined on the last page.
        </Text>
        <ParticipantCard data={buildProposerParticipant(ctx)} />
        {props.envelope.signers.map((s) => (
          <ParticipantCard key={s.id} data={buildSignerParticipant(ctx, s)} />
        ))}
        <TrustBar ctx={ctx} />
        <PageFooter ctx={ctx} />
      </Page>

      <Page size="LETTER" style={styles.page}>
        <PageHeader suffix="Terms & definitions" />
        <Section num="04" title="Terms used in this document" />
        <Text style={styles.termsIntro}>
          The following definitions explain every field and event recorded in this audit trail. This
          glossary is provided so the document can stand alone as a record of legal evidence in any
          subsequent proceeding.
        </Text>
        <TermsGrid terms={TERMS_PAGE_3} />
        <PageFooter ctx={ctx} />
      </Page>

      <Page size="LETTER" style={styles.page}>
        <PageHeader suffix="Terms & definitions (continued)" />
        <Section num="05" title="Signature formats, events, and references" />
        <TermsGrid terms={TERMS_PAGE_4} />
        <ReferenceLinks />
        <Text style={styles.closing}>
          This audit trail was issued by Seald, Inc. For questions, contact
          support@seald.nromomentum.com. The document on file is authoritative — this attestation
          describes what we observed during signing and the cryptographic evidence we retained.
        </Text>
        <PageFooter ctx={ctx} />
      </Page>
    </Document>
  );
}

interface RenderCtx extends DocumentRenderProps {
  detailsBySigner: ReadonlyMap<string, SignerAuditDetail>;
}

/**
 * Real Seald icon — vector copy of Design-Guide/project/assets/logo-mark.svg.
 * Originally a 40×40 viewBox: indigo rounded square with a white quill +
 * underline curve. Rendered via react-pdf's <Svg> primitives so it stays
 * crisp at any size. The previous implementation used a styled "S" Caveat
 * glyph on a flat indigo square — visually similar but not the brand mark.
 */
function SealdMark({ size }: { size: number }): React.ReactElement {
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40">
      <Path d="M0 0 H40 V40 H0 Z" fill={C.indigo600} />
      {/* Rounded corners — react-pdf Svg has no rx on rect, so we
          approximate with a manually rounded path. The rectangle
          covers (0,0)-(40,40) with corner radius 10. */}
      <Path
        d="M10 0 H30 Q40 0 40 10 V30 Q40 40 30 40 H10 Q0 40 0 30 V10 Q0 0 10 0 Z"
        fill={C.indigo600}
      />
      {/* Quill body — translated by (6,6) from the source SVG. */}
      <Path
        d="M8 28 C 12 26, 16 20, 20 18 L 28 10 L 32 14 L 24 22 C 22 26, 16 30, 10 32 Z"
        fill="#FFFFFF"
      />
      {/* Quill tip / accent. */}
      <Path
        d="M28 10 L 30 8 C 31 7, 32.5 7, 33.5 8 L 34 8.5 C 35 9.5, 35 11, 34 12 L 32 14 Z"
        fill="#E0E7FF"
      />
      {/* Underline swoosh. */}
      <Path
        d="M6 34 C 14 32, 24 32, 34 34"
        stroke="#FFFFFF"
        strokeWidth={1.5}
        strokeLinecap="round"
        fill="none"
      />
    </Svg>
  );
}

function PageHeader({ suffix }: { suffix: string }): React.ReactElement {
  return (
    <View style={styles.header} fixed>
      <View style={styles.brand}>
        <View style={styles.brandMarkWrap}>
          <SealdMark size={18} />
        </View>
        <Text style={styles.brandWord}>Seald</Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
        <Text style={styles.eyebrow}>Audit trail</Text>
        <Text style={styles.eyebrowSep}>·</Text>
        <Text style={[styles.eyebrow, styles.eyebrowSuffix]}>{suffix}</Text>
      </View>
    </View>
  );
}

function PageFooter({ ctx }: { ctx: RenderCtx }): React.ReactElement {
  return (
    <View style={styles.footerWrap} fixed>
      <View style={styles.footerRow}>
        <View style={styles.footerBrand}>
          <View style={styles.footerBrandMarkWrap}>
            <SealdMark size={10} />
          </View>
          <Text style={styles.footerBrandWord}>Seald</Text>
          <Text style={styles.footerCaption}>· Audit trail issued by Seald, Inc.</Text>
        </View>
        {/* react-pdf 4.5 has a known issue where a Text with a `render`
            callback collapses its parent row when paired with `fixed`.
            We tried four different layouts and none of them painted
            the page number reliably across pages 2+. The Req line below
            (envelope id) is a sufficient unique per-page audit anchor;
            page numbers are an aesthetic nicety we can ship without. */}
      </View>
      <Text style={styles.footerReq}>Req {ctx.envelope.id.toUpperCase()}</Text>
    </View>
  );
}

function Hero({ envelope }: { envelope: Envelope }): React.ReactElement {
  const completed = envelope.completed_at
    ? formatDateShort(envelope.completed_at)
    : formatDateShort(envelope.created_at);
  return (
    <View style={styles.hero}>
      <Text style={styles.heroKicker}>
        Request {envelope.short_code.toUpperCase()} · Completed {completed}
      </Text>
      <View style={styles.heroTitleRow}>
        <Text style={styles.heroTitle}>This document is</Text>
        <Text style={styles.heroScript}>sealed</Text>
        <Text style={styles.heroTitle}>.</Text>
      </View>
      <Text style={styles.heroSubtitle}>
        The audit trail on these pages links each signatory to the signed document and records the
        evidence we collected along the way — identity, consent, timestamps, and a cryptographic
        fingerprint of the file before and after signing. Definitions for every field are on the
        last page.
      </Text>
      <View style={styles.seal}>
        <View style={styles.sealInner} />
        <Text style={styles.sealScript}>Sealed</Text>
        <Text style={styles.sealLabel}>Verified</Text>
      </View>
    </View>
  );
}

function Section({ num, title }: { num: string; title: string }): React.ReactElement {
  return (
    <View style={styles.sectionHead}>
      <Text style={styles.sectionNum}>{num}</Text>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionRule} />
    </View>
  );
}

interface DataCellInfo {
  label: string;
  value: string;
  mono?: boolean;
  check?: boolean;
}

function Datagrid({ ctx }: { ctx: RenderCtx }): React.ReactElement {
  const cells = buildDatagridCells(ctx);
  const rows: DataCellInfo[][] = [];
  for (let i = 0; i < cells.length; i += 2) rows.push(cells.slice(i, i + 2));
  return (
    <View style={styles.datagrid}>
      {rows.map((row, rIdx) => (
        <View key={rIdx} style={[styles.datagridRow, rIdx > 0 ? styles.datagridRowDivider : {}]}>
          {row.map((cell, cIdx) => (
            <View key={cIdx} style={[styles.datacell, cIdx === 0 ? styles.datacellDivider : {}]}>
              <Text style={styles.dcLabel}>{cell.label.toUpperCase()}</Text>
              {cell.check ? (
                <View style={styles.dcCheckRow}>
                  <View style={styles.dcCheckDot}>
                    <Icon paths={ICONS.check} size={6} color={C.paper} strokeWidth={3} />
                  </View>
                  <Text style={styles.dcValue}>{cell.value}</Text>
                </View>
              ) : (
                <Text style={cell.mono ? styles.dcValueMono : styles.dcValue}>{cell.value}</Text>
              )}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

function HashCards({ ctx }: { ctx: RenderCtx }): React.ReactElement {
  const env = ctx.envelope;
  const cards = [
    {
      signed: false,
      label: 'Original document',
      filename: safeFilename(env.title),
      pages: env.original_pages ?? 0,
      hash: env.original_sha256 ?? '—',
    },
    {
      signed: true,
      label: 'Signed document',
      filename: safeFilename(env.title, true),
      // Sealed file has its own page count (burn-in adds the cover/signature
      // page). When there is no sealed artifact (declined/expired), the
      // signed-document row is informational only — hide the page count by
      // passing 0, since `hash` already shows "— (unsealed)".
      pages: ctx.sealedSha256 !== null ? (ctx.sealedPages ?? 0) : 0,
      hash: ctx.sealedSha256 ?? '— (unsealed)',
    },
  ];
  return (
    <View style={styles.hashBlock}>
      {cards.map((c, i) => (
        <View key={i} style={styles.hashCard}>
          <View style={styles.hashRow}>
            <View style={[styles.hashDot, c.signed ? styles.hashDotSigned : {}]} />
            <Text style={styles.hashType}>{c.label.toUpperCase()}</Text>
            <Text style={styles.hashFilename}>{c.filename}</Text>
            {c.pages > 0 ? <Text style={styles.hashPages}> · {c.pages} pages</Text> : null}
          </View>
          <Text style={styles.hashValue}>{c.hash}</Text>
        </View>
      ))}
    </View>
  );
}

function VerifyCard({
  verifyUrl,
  qrDataUrl,
  shortCode,
}: {
  verifyUrl: string;
  qrDataUrl: string;
  shortCode: string;
}): React.ReactElement {
  return (
    // wrap={false} so the QR + URL + CODE never split mid-card when
    // there's tight remaining vertical space at the bottom of page 1.
    <View style={styles.verifyCard} wrap={false}>
      <View style={styles.verifyBody}>
        <Text style={styles.verifyEyebrow}>Verify this document</Text>
        <Text style={styles.verifyTitle}>Scan or visit to confirm authenticity</Text>
        <Text style={styles.verifyCopy}>
          If this audit trail is printed, scan the code or type the URL below to confirm the
          signature is valid and the file has not been altered since it was sealed.
        </Text>
        <View style={styles.verifyFieldRow}>
          <Text style={styles.verifyKey}>URL</Text>
          <Text style={styles.verifyVal}>{verifyUrl.replace(/^https?:\/\//, '')}</Text>
        </View>
        <View style={styles.verifyFieldRow}>
          <Text style={styles.verifyKey}>CODE</Text>
          <Text style={styles.verifyVal}>{shortCode}</Text>
        </View>
      </View>
      <View style={styles.qrWrap}>
        <Image style={styles.qrImg} src={qrDataUrl} />
      </View>
    </View>
  );
}

interface ParticipantData {
  role: 'proposer' | 'signatory' | 'validator' | 'witness';
  name: string;
  email: string;
  signatureText: string | null;
  signatureMeta: string | null;
  isProposer: boolean;
  verificationChecks: ReadonlyArray<string>;
  formatLabel: string;
  identifier: string;
  events: ReadonlyArray<ParticipantEvent>;
}

interface ParticipantEvent {
  kind: 'create' | 'sent' | 'envelope' | 'view' | 'sign' | 'decline';
  action: string;
  ip: string;
  at: string;
}

function ParticipantCard({ data }: { data: ParticipantData }): React.ReactElement {
  const isSigner = data.role === 'signatory';
  const roleColor = isSigner ? C.success700 : C.indigo700;
  const dotColor = isSigner ? C.success500 : C.indigo600;
  return (
    <View style={styles.participant} wrap={false}>
      <View style={styles.pHead}>
        <View style={styles.pIdentity}>
          <View style={styles.pRole}>
            <View style={[styles.pRoleDot, { backgroundColor: dotColor }]} />
            <Text style={[styles.pRoleLabel, { color: roleColor }]}>
              {humanRoleLabel(data.role).toUpperCase()}
            </Text>
          </View>
          <Text style={styles.pName}>{data.name}</Text>
          <Text style={styles.pContact}>{data.email}</Text>
        </View>
        <View style={styles.pSig}>
          <Text style={styles.pSigEyebrow}>
            {data.isProposer ? 'INITIATED THE REQUEST' : 'SIGNATURE'}
          </Text>
          {data.signatureText ? (
            <>
              <Text style={styles.pSigMark}>{data.signatureText}</Text>
              <View style={styles.pSigUnderline} />
              {data.signatureMeta ? (
                <Text style={styles.pSigMeta}>{data.signatureMeta}</Text>
              ) : null}
            </>
          ) : data.signatureMeta ? (
            <Text style={styles.pSigMetaInline}>{data.signatureMeta}</Text>
          ) : null}
        </View>
      </View>
      <View style={styles.pMeta}>
        <View style={styles.pMetaCol}>
          <Text style={styles.pMetaLabel}>VERIFICATION CHECKS</Text>
          <View style={styles.checkChips}>
            {data.verificationChecks.map((c) => (
              <View key={c} style={styles.checkChip}>
                <View style={styles.checkChipDot}>
                  <Icon paths={ICONS.check} size={7} color={C.paper} strokeWidth={3} />
                </View>
                <Text style={styles.checkChipLabel}>{c}</Text>
              </View>
            ))}
          </View>
        </View>
        <View style={styles.pMetaCol}>
          <Text style={styles.pMetaLabel}>ROLE</Text>
          <Text style={styles.pMetaValue}>{data.formatLabel}</Text>
        </View>
        <View style={[styles.pMetaCol, styles.pMetaColLast]}>
          <Text style={styles.pMetaLabel}>IDENTIFIER</Text>
          <Text style={styles.pMetaValueMono}>{data.identifier}</Text>
        </View>
      </View>
      <View style={styles.evtHead}>
        <Text style={[styles.evtHeadLabel, { flex: 1.5 }]}>ACTION</Text>
        <Text style={[styles.evtHeadLabel, { flex: 1.4 }]}>IP ADDRESS</Text>
        <Text style={[styles.evtHeadLabel, { flex: 1.6 }]}>TIMESTAMP (UTC)</Text>
      </View>
      {data.events.map((ev, i) => (
        <View
          key={i}
          style={[styles.evtRow, i === data.events.length - 1 ? styles.evtRowLast : {}]}
        >
          <View style={styles.evtAction}>
            <EventIcon kind={ev.kind} />
            <Text style={styles.evtActionText}>{ev.action}</Text>
          </View>
          <Text style={[styles.evtIp, ev.ip === '—' ? styles.evtIpDim : {}]}>{ev.ip}</Text>
          <Text style={styles.evtTs}>{ev.at}</Text>
        </View>
      ))}
    </View>
  );
}

function EventIcon({ kind }: { kind: ParticipantEvent['kind'] }): React.ReactElement {
  const cfg = {
    create: { bg: C.indigo50, fg: C.indigo700, paths: ICONS.plus },
    sent: { bg: C.ink150, fg: C.ink700, paths: ICONS.send },
    envelope: { bg: C.ink150, fg: C.ink700, paths: ICONS.inbox },
    view: { bg: C.info50, fg: C.info700, paths: ICONS.eye },
    sign: { bg: C.success50, fg: C.success700, paths: ICONS.pen },
    decline: { bg: C.ink150, fg: C.ink700, paths: ICONS.x },
  }[kind];
  return (
    <View style={[styles.evtIco, { backgroundColor: cfg.bg }]}>
      <Icon paths={cfg.paths} size={12} color={cfg.fg} strokeWidth={1.8} />
    </View>
  );
}

function TrustBar({ ctx }: { ctx: RenderCtx }): React.ReactElement {
  const cells = [
    {
      label: 'Integrity',
      value: 'Verified',
      sub: 'SHA-256 hash matches the sealed document.',
      icon: ICONS.shieldCheck,
    },
    {
      label: 'Timestamp',
      value: 'RFC 3161 trusted',
      sub: 'Issued by an external timestamp authority.',
      icon: ICONS.clockCircle,
    },
    {
      label: 'Storage',
      value: 'Encrypted at rest',
      sub: 'AES-256. Retrieved on verification only.',
      icon: ICONS.lock,
    },
    {
      label: 'Completion',
      value: computeDurationText(ctx),
      sub: 'From created to sealed.',
      icon: ICONS.check,
    },
  ];
  return (
    // wrap={false} so the 4-column trust bar never splits across
    // pages (would orphan a single column).
    <View style={styles.trustBar} wrap={false}>
      {cells.map((c, i) => (
        <View
          key={i}
          style={[styles.trustCell, i === cells.length - 1 ? styles.trustCellLast : {}]}
        >
          <View style={{ marginBottom: 4 }}>
            <Icon paths={c.icon} size={14} color={C.indigo600} strokeWidth={1.8} />
          </View>
          <Text style={styles.trustLabel}>{c.label.toUpperCase()}</Text>
          <Text style={styles.trustValue}>{c.value}</Text>
          <Text style={styles.trustSub}>{c.sub}</Text>
        </View>
      ))}
    </View>
  );
}

interface TermDef {
  num: string;
  name: string;
  body: string;
  subItems?: ReadonlyArray<{ k: string; v: string }>;
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
    body: 'The unique reference number of the sealed document. With this ID, anyone can look up the document on seald.nromomentum.com/verify, validate its authenticity, and obtain the audit trail and the original file.',
  },
  {
    num: '06',
    name: 'Signatory identifier',
    body: 'The unique identifier of the individual who signed the document. The UUID is linked only to the signature in the document referenced by the request ID on this audit trail.',
  },
  {
    num: '07',
    name: 'Digital signature',
    body: 'An additional layer of authenticity which adds a certificate to the signed document. A certificate indicates an embedded RFC 3161 trusted timestamp. Validity is revoked if the document is tampered with after signing.',
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
      { k: 'Account', v: 'The signer is authenticated against a Seald account.' },
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
    name: 'Trusted timestamp (RFC 3161)',
    body: 'A technological instrument that validates a document existed before a certain date and has not been modified since. Issued by an external timestamp authority over the RFC 3161 protocol.',
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

function TermsGrid({ terms }: { terms: ReadonlyArray<TermDef> }): React.ReactElement {
  // Distribute terms across 2 columns by index parity.
  const left = terms.filter((_, i) => i % 2 === 0);
  const right = terms.filter((_, i) => i % 2 === 1);
  const cols = [left, right];
  return (
    <View style={styles.termsGrid}>
      {cols.map((col, ci) => (
        <View key={ci} style={styles.termsCol}>
          {col.map((t) => (
            <View key={t.num} style={styles.term} wrap={false}>
              <View style={styles.termHead}>
                <Text style={styles.termNum}>{t.num}</Text>
                <Text style={styles.termName}>{t.name}</Text>
              </View>
              <Text style={styles.termBody}>{t.body}</Text>
              {t.subItems ? (
                <View style={styles.subItems}>
                  {t.subItems.map((it) => (
                    <Text key={it.k} style={styles.subItem}>
                      <Text style={styles.subItemKey}>{it.k}.</Text> {it.v}
                    </Text>
                  ))}
                </View>
              ) : null}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

function ReferenceLinks(): React.ReactElement {
  const links = [
    { label: 'Seald signature user guide', url: 'seald.nromomentum.com/help/guides' },
    { label: 'Seald terms and conditions', url: 'seald.nromomentum.com/help/terms' },
    { label: 'Seald signature privacy notice', url: 'seald.nromomentum.com/help/privacy' },
  ];
  return (
    <View style={styles.refsCard}>
      <Text style={styles.refsHead}>Reference</Text>
      {links.map((l) => (
        <View key={l.url} style={styles.refRow}>
          <View style={styles.refIcon}>
            <Icon paths={ICONS.arrowRight} size={11} color={C.indigo600} strokeWidth={2} />
          </View>
          <Text style={styles.refLabel}>{l.label}</Text>
          <Text style={styles.refUrl}>{l.url}</Text>
        </View>
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Derivation helpers
// ---------------------------------------------------------------------------

function buildDatagridCells(ctx: RenderCtx): ReadonlyArray<DataCellInfo> {
  const env = ctx.envelope;
  const proposer = deriveProposer(ctx);
  const signedCount = env.signers.filter((s) => s.signed_at !== null).length;
  const signatoryCount = env.signers.filter((s) => s.role === 'signatory').length;
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
          ? 'Enabled · RFC 3161 trusted timestamp'
          : 'Not applicable (unsealed)',
      check: ctx.sealedSha256 !== null,
    },
    { label: 'Delivery mode', value: humanDelivery(env.delivery_mode) },
    {
      label: 'Signers',
      value: `${signedCount} of ${signatoryCount || env.signers.length} completed`,
    },
    { label: 'Validators · Witnesses', value: `${validators} · ${witnesses}` },
  ];
}

function buildProposerParticipant(ctx: RenderCtx): ParticipantData {
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
    isProposer: true,
    verificationChecks: ['Email', 'Account'],
    formatLabel: 'Proposer',
    // Per the design HTML, the proposer card always renders "—" in the
    // Identifier slot — owner_id is an internal foreign key that has
    // no audit-relevance for the recipient.
    identifier: '—',
    events,
  };
}

function buildSignerParticipant(ctx: RenderCtx, signer: EnvelopeSigner): ParticipantData {
  const detail = ctx.detailsBySigner.get(signer.id);
  const perEvents = ctx.events.filter((e) => e.signer_id === signer.id);
  const events: ParticipantEvent[] = [];
  const sentEvent = ctx.events.find((e) => e.event_type === 'sent');
  if (sentEvent) {
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
    signatureText = humanSignatureMark(signer);
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
    isProposer: false,
    verificationChecks: checks,
    formatLabel: humanSignatureFormat(sigFormat),
    // Split the 36-char UUID across two lines so it always fits inside
    // the 1/3-width Identifier column (8.5pt mono ≈ 184pt for the full
    // string but the column is ~155pt). Break point is the dash that
    // splits the string roughly in half.
    identifier: formatUuidWrap(signer.id),
    events,
  };
}

/** UUID like `a1b2c3d4-1111-2222-3333-444455556666` →
 *  `a1b2c3d4-1111-2222\n3333-444455556666` (uppercased). The forward
 *  slash isn't ambiguous because the IDENTIFIER cell is mono-text. */
function formatUuidWrap(id: string): string {
  const upper = id.toUpperCase();
  // Insert the wrap exactly at the 18th char (after the third dash group).
  if (upper.length !== 36) return upper;
  return `${upper.slice(0, 18)}\n${upper.slice(19)}`;
}

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

function humanSignatureMark(signer: EnvelopeSigner): string {
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
  return formatTimeFull(iso);
}
