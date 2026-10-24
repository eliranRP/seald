export const seald = {
  color: {
    ink: {
      900: '#0B1220',
      800: '#131A2B',
      700: '#1F2937',
      600: '#374151',
      500: '#64748B',
      400: '#94A3B8',
      300: '#CBD5E1',
      200: '#E2E8F0',
      150: '#EDF1F6',
      100: '#F3F6FA',
      50: '#F8FAFC',
    },
    paper: '#FFFFFF',
    indigo: {
      50: '#EEF2FF',
      100: '#E0E7FF',
      200: '#C7D2FE',
      300: '#A5B4FC',
      400: '#818CF8',
      500: '#6366F1',
      600: '#4F46E5',
      700: '#4338CA',
      800: '#3730A3',
      900: '#312E81',
    },
    success: { 50: '#ECFDF5', 200: '#A7F3D0', 400: '#34D399', 500: '#10B981', 700: '#047857' },
    warn: { 50: '#FFFBEB', 500: '#F59E0B', 700: '#B45309' },
    danger: { 50: '#FEF2F2', 200: '#FECACA', 500: '#EF4444', 700: '#B91C1C', 800: '#991B1B' },
    info: { 50: '#EFF6FF', 500: '#3B82F6', 700: '#1D4ED8' },
    /**
     * Categorical palette for tags and template accents only.
     * Never a status or UI-state color. Steps 50/500/700.
     * Documented in docs/agents/DESIGN_SYSTEM.md.
     */
    tag: {
      pink: { 50: '#FDF2F8', 500: '#EC4899', 700: '#BE185D' },
      violet: { 50: '#F5F3FF', 500: '#8B5CF6', 700: '#6D28D9' },
      cyan: { 50: '#ECFEFF', 500: '#06B6D4', 700: '#0E7490' },
    },
    /**
     * Signer colour palette. Every signer that is auto-assigned a colour
     * walks this list in order and takes the first entry not already in use
     * (`pickAvailableColor`). This is the only copy: the mock API, the
     * use-template wizard, the upload roster and the stories all read it.
     * Keep it duplicate-free, because two signers sharing a colour is the
     * F8 bug this token exists to prevent.
     */
    signer: ['#F472B6', '#7DD3FC', '#FBBF24', '#A78BFA', '#34D399', '#FB7185'],
    /** Brand marks. These are not theme accents — they stay the vendor colors. */
    brand: {
      google: {
        blue: '#4285F4',
        green: '#34A853',
        yellow: '#FBBC05',
        red: '#EA4335',
      },
      drive: {
        green: '#1FA463',
        yellow: '#FBBC04',
      },
    },
    fg: {
      1: 'var(--fg-1)',
      2: 'var(--fg-2)',
      3: 'var(--fg-3)',
      4: 'var(--fg-4)',
      inverse: '#FFFFFF',
    },
    bg: {
      app: 'var(--bg-app)',
      surface: 'var(--bg-surface)',
      sunken: 'var(--bg-sunken)',
      subtle: 'var(--bg-subtle)',
    },
    border: { 1: 'var(--border-1)', 2: 'var(--border-2)', focus: 'var(--border-focus)' },
    accent: {
      base: 'var(--accent)',
      hover: 'var(--accent-hover)',
      press: 'var(--accent-press)',
      subtle: 'var(--accent-subtle)',
      ink: '#FFFFFF',
    },
    /**
     * Modal backdrop / scrim token. Audit slice C #6 (MEDIUM) — promotes
     * the previously inline `rgba(15,23,42,0.45)` literal that lived in
     * DisconnectModal to a single source of truth shared by every
     * future overlay (drawer scrims, confirmation dialogs, image
     * lightboxes).
     */
    overlay: 'var(--overlay)',
    /** Text / icon colour on an indigo (accent) or dark fill. */
    fgOnAccent: '#FFFFFF',
  },
  font: {
    sans: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
    serif: "'Source Serif 4', 'Iowan Old Style', 'Palatino Linotype', Georgia, serif",
    mono: "'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace",
    script: "'Caveat', 'Segoe Script', cursive",
    /**
     * Type scale. The v2 redesign scale (canvas seald.css `--fs-*`) is
     * badge → code; the older heading keys (display/h1…h5/bodyLg) stay for
     * back-compat until every screen moves to the v2 keys.
     */
    size: {
      display: '64px',
      h1: '48px',
      h2: '36px',
      h3: '28px',
      h4: '22px',
      h5: '18px',
      bodyLg: '18px',
      /** Avatar initials and count badges only. */
      badge: '10px',
      micro: '11px',
      /** Eyebrows, mono, chips. */
      xs: '12px',
      caption: '13px',
      /** UI default. */
      bodySm: '14px',
      /** Paragraphs, email body. */
      bodyMd: '15px',
      /** Mobile inputs. */
      body: '16px',
      lg: '18px',
      /** Card titles. */
      xl: '20px',
      /** Section / email headline. */
      x2l: '24px',
      /** Mobile page title. */
      x3l: '28px',
      /** Desktop page title. */
      x4l: '32px',
      /** Verdict / display. */
      x5l: '44px',
      /** 404 numeral only. */
      code: '96px',
    },
    weight: { regular: 400, medium: 500, semibold: 600, bold: 700 },
    lineHeight: { tight: 1.1, snug: 1.25, normal: 1.5, relaxed: 1.65 },
    tracking: { tight: '-0.02em', normal: '0', wide: '0.04em', wider: '0.08em' },
  },
  space: {
    1: '4px',
    2: '8px',
    3: '12px',
    4: '16px',
    5: '20px',
    6: '24px',
    8: '32px',
    10: '40px',
    12: '48px',
    16: '64px',
    20: '80px',
    24: '96px',
  },
  radius: {
    /** Paper page corners. */
    hair: '2px',
    /** Tiny marks, checkbox. */
    xxs: '4px',
    xs: '6px',
    sm: '8px',
    md: '12px',
    lg: '16px',
    xl: '20px',
    '2xl': '28px',
    pill: '999px',
  },
  shadow: {
    xs: 'var(--shadow-xs)',
    sm: 'var(--shadow-sm)',
    md: 'var(--shadow-md)',
    lg: 'var(--shadow-lg)',
    xl: 'var(--shadow-xl)',
    focus: 'var(--shadow-focus)',
    paper: 'var(--shadow-paper)',
  },
  motion: {
    easeStandard: 'cubic-bezier(0.2, 0, 0, 1)',
    easeEmphasized: 'cubic-bezier(0.2, 0, 0, 1.15)',
    easeDecelerate: 'cubic-bezier(0, 0, 0.2, 1)',
    durFast: '120ms',
    durBase: '200ms',
    durSlow: '320ms',
    /** Press feedback. */
    durInstant: '80ms',
    /** Screens and overlays in. */
    durEnter: '280ms',
    /** Overlays out. */
    durExit: '160ms',
    /** Entering elements. */
    easeOut: 'cubic-bezier(0.16, 1, 0.3, 1)',
    /** Leaving elements. */
    easeIn: 'cubic-bezier(0.4, 0, 1, 1)',
    /** Success moments, pops. */
    easeSpring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
    /** List item step; lists cap the stagger at 8 items. */
    stagger: '35ms',
  },
  z: { nav: 20, sticky: 30, overlay: 80, modal: 90, toast: 100 },
} as const;

export type SealdTheme = typeof seald;

/** One entry of `seald.color.signer`. */
export type SignerColor = (typeof seald.color.signer)[number];
