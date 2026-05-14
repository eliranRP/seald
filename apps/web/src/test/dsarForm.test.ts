/**
 * Unit coverage for the DSAR intake form's inline submit handler
 * (`apps/landing/src/pages/dsar.astro`).
 *
 * The handler serializes the form into a structured `mailto:` URL pointed at
 * privacy@seald.nromomentum.com. It is the only client-side validation gate
 * on the page, so a regression here would either:
 *   - Silently drop fields from the DSAR submission, or
 *   - Allow the user to submit an empty/malformed request that lands in
 *     the privacy queue without enough info to action.
 *
 * Both are CCPA §7027 / GDPR Art. 12 violations. These tests exercise the
 * handler in isolation against a mocked DOM + a stubbed `window.location`
 * so we can assert the exact mailto URL it produces and the alert messages
 * it surfaces.
 *
 * Approach: the handler is an IIFE shipped as `apps/landing/public/scripts/
 * dsar.js` (externalized in F-002 so the landing site can ship a strict
 * CSP without `'unsafe-inline'` in script-src). We read the file from
 * disk and eval it after staging a minimal DOM that mirrors the form's
 * structure. That keeps the production code untouched while still
 * asserting the user contract.
 *
 * As a side regression for F-002, this test also asserts that the
 * `dsar.astro` page references the external script (and does NOT carry
 * an inline `<script is:inline>` block any more) — if someone re-inlines
 * the handler, the CSP gate would silently break in production.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';

const SCRIPT_PATH = resolvePath(process.cwd(), '../landing/public/scripts/dsar.js');
const SCRIPT = readFileSync(SCRIPT_PATH, 'utf8');
const ASTRO_PATH = resolvePath(process.cwd(), '../landing/src/pages/dsar.astro');
const ASTRO_SRC = readFileSync(ASTRO_PATH, 'utf8');

interface FormFieldsInput {
  readonly name?: string;
  readonly email?: string;
  readonly jurisdiction?: string;
  readonly details?: string;
  readonly agent?: string;
  readonly types?: ReadonlyArray<string>;
}

function buildFormDom(fields: FormFieldsInput): HTMLFormElement {
  const form = document.createElement('form');
  form.id = 'dsar-form';

  function addInput(name: string, value: string): void {
    const i = document.createElement('input');
    i.name = name;
    i.value = value;
    form.appendChild(i);
  }
  addInput('name', fields.name ?? '');
  addInput('email', fields.email ?? '');
  addInput('jurisdiction', fields.jurisdiction ?? '');
  addInput('details', fields.details ?? '');
  addInput('agent', fields.agent ?? 'No');
  for (const t of fields.types ?? []) {
    const c = document.createElement('input');
    c.type = 'checkbox';
    c.name = 'type';
    c.value = t;
    c.checked = true;
    form.appendChild(c);
  }
  document.body.appendChild(form);
  return form;
}

let alertSpy: ReturnType<typeof vi.spyOn> | null = null;
let assignedHref = '';

beforeEach(() => {
  document.body.innerHTML = '';
  assignedHref = '';
  alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => undefined);
  // jsdom's window.location is locked down — replace it with a plain object
  // for the duration of the test so we can capture the assignment. The
  // current dsar.js calls `window.location.assign(...)` rather than
  // setting `.href = …` directly so we capture that too.
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: {
      get href(): string {
        return assignedHref;
      },
      set href(v: string) {
        assignedHref = v;
      },
      assign(v: string) {
        assignedHref = v;
      },
    },
  });
});

afterEach(() => {
  alertSpy?.mockRestore();
  document.body.innerHTML = '';
});

function loadAndSubmit(): void {
  // The IIFE binds a submit handler when it runs; eval here, then dispatch.
  // eslint-disable-next-line no-eval
  (0, eval)(SCRIPT);
  const form = document.getElementById('dsar-form') as HTMLFormElement | null;
  if (!form) throw new Error('Form was not staged before loading the script');
  form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
}

/**
 * The handler renders validation feedback inline via a `#dsar-status`
 * panel (PR-7 / Audit E · dsar.astro H — mailto fallback + inline
 * errors). The previous `alert()` path was replaced with this
 * accessible status node so screen readers + clipboard-fallback paths
 * work for users without a default mail client.
 */
function statusText(): string {
  return document.getElementById('dsar-status')?.textContent ?? '';
}

describe('DSAR form submit handler — required-field validation', () => {
  it('shows the inline error and does not navigate when the name is missing', () => {
    buildFormDom({
      email: 'a@b.com',
      jurisdiction: 'GDPR (European Union)',
      types: ['access'],
    });
    loadAndSubmit();
    expect(statusText()).toMatch(/please fill in your name, email, and jurisdiction/i);
    expect(assignedHref).toBe('');
  });

  it('shows the inline error when the email is missing', () => {
    buildFormDom({
      name: 'Jane',
      jurisdiction: 'GDPR (European Union)',
      types: ['access'],
    });
    loadAndSubmit();
    expect(statusText()).toMatch(/please fill in your name, email, and jurisdiction/i);
    expect(assignedHref).toBe('');
  });

  it('shows the inline error when the jurisdiction is missing', () => {
    buildFormDom({
      name: 'Jane',
      email: 'a@b.com',
      types: ['access'],
    });
    loadAndSubmit();
    expect(statusText()).toMatch(/please fill in your name, email, and jurisdiction/i);
    expect(assignedHref).toBe('');
  });

  it('shows the inline error when no request type is selected', () => {
    buildFormDom({
      name: 'Jane',
      email: 'a@b.com',
      jurisdiction: 'GDPR (European Union)',
      types: [],
    });
    loadAndSubmit();
    expect(statusText()).toMatch(/at least one .* must be checked/i);
    expect(assignedHref).toBe('');
  });

  it('treats whitespace-only inputs as empty (no implicit trust on padded values)', () => {
    buildFormDom({
      name: '   ',
      email: '   ',
      jurisdiction: '   ',
      types: ['access'],
    });
    loadAndSubmit();
    expect(statusText()).toMatch(/please fill in your name, email, and jurisdiction/i);
    expect(assignedHref).toBe('');
  });

  it('renders a copy-to-clipboard fallback after a successful submission', () => {
    buildFormDom({
      name: 'Jane Doe',
      email: 'jane@example.com',
      jurisdiction: 'GDPR (European Union)',
      types: ['access'],
    });
    loadAndSubmit();
    // Inline success status surfaces with the email address + a copy button.
    const status = document.getElementById('dsar-status');
    expect(status).not.toBeNull();
    expect(status?.textContent).toMatch(/privacy@seald\.nromomentum\.com/);
    expect(document.querySelector('[data-dsar-copy]')).not.toBeNull();
  });
});

describe('DSAR form submit handler — mailto generation', () => {
  it('routes the submission to privacy@seald.nromomentum.com with a structured subject', () => {
    buildFormDom({
      name: 'Jane Doe',
      email: 'jane@example.com',
      jurisdiction: 'GDPR (European Union)',
      types: ['access', 'delete'],
    });
    loadAndSubmit();
    expect(assignedHref).toMatch(/^mailto:privacy@seald\.nromomentum\.com\?/);
    const url = new URL(assignedHref);
    expect(url.searchParams.get('subject')).toBe('DSAR — access, delete');
  });

  it('encodes the body with the structured fields the privacy team relies on', () => {
    buildFormDom({
      name: 'Jane Doe',
      email: 'jane@example.com',
      jurisdiction: 'CCPA / CPRA (California, USA)',
      details: 'Account linked to ops@example.com.',
      agent: 'Yes',
      types: ['access', 'opt-out'],
    });
    loadAndSubmit();
    const url = new URL(assignedHref);
    const body = url.searchParams.get('body') ?? '';
    expect(body).toContain('Name: Jane Doe');
    expect(body).toContain('Email: jane@example.com');
    expect(body).toContain('Jurisdiction: CCPA / CPRA (California, USA)');
    expect(body).toContain('Authorized agent: Yes');
    expect(body).toContain('Request type(s): access, opt-out');
    expect(body).toContain('Account linked to ops@example.com.');
    expect(body).toContain('https://seald.nromomentum.com/dsar');
  });

  it('records "(none provided)" when the optional details textarea is left blank', () => {
    buildFormDom({
      name: 'Jane Doe',
      email: 'jane@example.com',
      jurisdiction: 'GDPR (European Union)',
      types: ['portability'],
    });
    loadAndSubmit();
    const url = new URL(assignedHref);
    const body = url.searchParams.get('body') ?? '';
    expect(body).toContain('Details:\n(none provided)');
  });

  it('preserves multi-byte characters (emoji + RTL) in the encoded mailto', () => {
    buildFormDom({
      name: 'יוסף Cohen 👋',
      email: 'yosef@example.com',
      jurisdiction: 'UK GDPR (United Kingdom)',
      details: 'Please delete account "abc / 123" — שלום.',
      types: ['delete'],
    });
    loadAndSubmit();
    const url = new URL(assignedHref);
    const body = url.searchParams.get('body') ?? '';
    expect(body).toContain('יוסף Cohen 👋');
    expect(body).toContain('Please delete account "abc / 123" — שלום.');
    // The subject is also URL-encoded but decodes back cleanly.
    expect(url.searchParams.get('subject')).toBe('DSAR — delete');
  });

  it('survives a name with leading/trailing whitespace by trimming before sending', () => {
    buildFormDom({
      name: '  Jane Doe  ',
      email: '  jane@example.com  ',
      jurisdiction: '  GDPR (European Union)  ',
      details: '  some detail  ',
      types: ['access'],
    });
    loadAndSubmit();
    const url = new URL(assignedHref);
    const body = url.searchParams.get('body') ?? '';
    expect(body).toContain('Name: Jane Doe');
    expect(body).toContain('Email: jane@example.com');
    expect(body).toContain('Jurisdiction: GDPR (European Union)');
    expect(body).toContain('some detail');
  });
});

describe('DSAR page CSP posture (F-002)', () => {
  it('references the externalized handler and carries no inline <script> block', () => {
    // Strict CSP (script-src 'self' only) blocks `<script is:inline>`.
    // The handler must live at /scripts/dsar.js and be loaded by URL.
    expect(ASTRO_SRC).toContain('src="/scripts/dsar.js"');
    expect(ASTRO_SRC).not.toMatch(/<script\s+is:inline\s*>/);
  });
});
