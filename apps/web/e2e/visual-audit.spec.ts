import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect, type Page, type Route } from '@playwright/test';
import { CookieConsentFixture } from './fixtures/cookieConsent';
import { FixedNowFixture } from './fixtures/fixedNow';
import { MockedApi } from './fixtures/mockedApi';
import { DEFAULT_SEEDED_USER, SeededUserFixture } from './fixtures/seededUser';
import { SignedEnvelopeFixture } from './fixtures/signedEnvelope';
import { SigningFillPage } from './pages/SigningFillPage';

/**
 * Visual-audit screenshot harness.
 *
 * Visits every screen of the SPA with realistic mocked data and saves a
 * full-page PNG at a phone (375x812) and a desktop (1440x900) width. It is
 * a review aid, not a regression gate: it only runs with VISUAL_AUDIT=1, so
 * CI never picks it up.
 *
 *   VISUAL_AUDIT=1 VISUAL_AUDIT_OUT=/abs/dir \
 *     npx playwright test e2e/visual-audit.spec.ts --project=chromium
 *
 * Files are named `<screen-id>--<375|1440>.png`. One test per screen, both
 * widths inside it, so one broken screen never stops the others. Every
 * `/api/*`, `/sign/*` and `/auth/v1/*` call goes through `MockedApi`; a
 * request nothing answers is logged as `[visual-audit] unmocked ...`.
 */

const ENABLED = process.env.VISUAL_AUDIT === '1';
const OUT_DIR =
  process.env.VISUAL_AUDIT_OUT ??
  resolve(dirname(fileURLToPath(import.meta.url)), '../visual-audit');

const HERE = dirname(fileURLToPath(import.meta.url));
const SAMPLE_PDF_PATH = resolve(HERE, './fixtures/sample-1page.pdf');
const SAMPLE_PDF = readFileSync(SAMPLE_PDF_PATH);

const VIEWPORTS = [
  { label: '375', width: 375, height: 812 },
  { label: '1440', width: 1440, height: 900 },
] as const;
type Viewport = (typeof VIEWPORTS)[number];

const NOW = '2026-10-27T10:00:00.000Z';
const OWNER_ID = DEFAULT_SEEDED_USER.id;
const ME_EMAIL = DEFAULT_SEEDED_USER.email;

const STABLE_CSS = `*,*::before,*::after{transition:none!important;animation:none!important;caret-color:transparent!important;scroll-behavior:auto!important}`;

/* ------------------------------------------------------------------ data */

function iso(daysAgo: number, hour = 10): string {
  const d = new Date(NOW);
  d.setUTCDate(d.getUTCDate() - daysAgo);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
}

const SHA_A = '7a8afa33b5b077e0486f08fc301e6865caf7b8ea0ea256505df80ea6034c1261';
const SHA_B = 'cafebabedeadbeef1234567890abcdef1234567890abcdef1234567890abcdef';

type SignerStatus = 'awaiting' | 'viewing' | 'completed' | 'declined';

interface PersonSeed {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly color: string;
}

const PEOPLE: Record<string, PersonSeed> = {
  maya: {
    id: 'a1000000-0000-4000-8000-000000000001',
    name: 'Maya Cohen',
    email: 'maya@acme.io',
    color: '#6366F1',
  },
  daniel: {
    id: 'a1000000-0000-4000-8000-000000000002',
    name: 'Daniel Park',
    email: 'daniel.park@northwind.com',
    color: '#10B981',
  },
  noa: {
    id: 'a1000000-0000-4000-8000-000000000003',
    name: 'Noa Levi',
    email: 'noa.levi@example.co.il',
    color: '#F59E0B',
  },
  sam: {
    id: 'a1000000-0000-4000-8000-000000000004',
    name: 'Sam Rivera',
    email: 'sam@riveralaw.com',
    color: '#EC4899',
  },
  alice: {
    id: 'a1000000-0000-4000-8000-000000000005',
    name: DEFAULT_SEEDED_USER.fullName,
    email: ME_EMAIL,
    color: '#0EA5E9',
  },
};

function snippet(p: PersonSeed, status: SignerStatus, signedAt: string | null = null) {
  return { id: p.id, name: p.name, email: p.email, color: p.color, status, signed_at: signedAt };
}

function listItem(o: {
  id: string;
  title: string;
  status: string;
  daysAgo: number;
  signers: ReadonlyArray<ReturnType<typeof snippet>>;
  tags?: ReadonlyArray<string>;
  completed?: boolean;
  archived?: boolean;
}) {
  return {
    id: o.id,
    title: o.title,
    short_code: `${o.id.slice(-6).toUpperCase()}ABCDEFG`.slice(0, 13),
    status: o.status,
    original_pages: 3,
    sent_at: o.status === 'draft' ? null : iso(o.daysAgo, 9),
    completed_at: o.completed ? iso(Math.max(o.daysAgo - 1, 0), 15) : null,
    expires_at: iso(o.daysAgo - 30),
    tags: o.tags ?? [],
    archived_at: o.archived ? iso(1, 12) : null,
    created_at: iso(o.daysAgo + 1, 8),
    updated_at: iso(o.daysAgo, 11),
    signers: o.signers,
  };
}

const HEBREW_TITLE = 'signed_(1) לחצנים למיכלי הדחה';
// Exactly 60 characters.
const LONG_TITLE = 'Commercial Lease Renewal Addendum — Suite 410, Dallas Office';

const ENV_AWAITING = 'e1000000-0000-4000-8000-000000000001';
const ENV_SEALED = 'e1000000-0000-4000-8000-000000000002';

const ENVELOPE_LIST = [
  listItem({
    id: ENV_AWAITING,
    title: 'Master Services Agreement — Acme Corp',
    status: 'awaiting_others',
    daysAgo: 1,
    tags: ['sales', 'q4'],
    signers: [snippet(PEOPLE.maya!, 'completed', iso(0, 8)), snippet(PEOPLE.daniel!, 'viewing')],
  }),
  listItem({
    id: 'e1000000-0000-4000-8000-000000000003',
    title: 'Mutual NDA — Northwind Traders',
    status: 'awaiting_others',
    daysAgo: 0,
    signers: [snippet(PEOPLE.alice!, 'awaiting'), snippet(PEOPLE.sam!, 'awaiting')],
  }),
  listItem({
    id: ENV_SEALED,
    title: HEBREW_TITLE,
    status: 'completed',
    daysAgo: 3,
    completed: true,
    tags: ['ops'],
    signers: [snippet(PEOPLE.noa!, 'completed', iso(2, 14))],
  }),
  listItem({
    id: 'e1000000-0000-4000-8000-000000000004',
    title: LONG_TITLE,
    status: 'awaiting_others',
    daysAgo: 5,
    tags: ['legal', 'real-estate', 'dallas', 'renewal'],
    signers: [
      snippet(PEOPLE.sam!, 'completed', iso(4, 10)),
      snippet(PEOPLE.daniel!, 'awaiting'),
      snippet(PEOPLE.noa!, 'awaiting'),
    ],
  }),
  listItem({
    id: 'e1000000-0000-4000-8000-000000000005',
    title: 'Offer letter — Jordan Lee',
    status: 'draft',
    daysAgo: 2,
    signers: [],
  }),
  listItem({
    id: 'e1000000-0000-4000-8000-000000000006',
    title: 'Vendor onboarding form 2026',
    status: 'declined',
    daysAgo: 8,
    signers: [snippet(PEOPLE.daniel!, 'declined')],
  }),
  listItem({
    id: 'e1000000-0000-4000-8000-000000000007',
    title: 'Contractor agreement Q3',
    status: 'expired',
    daysAgo: 45,
    signers: [snippet(PEOPLE.maya!, 'awaiting')],
  }),
  listItem({
    id: 'e1000000-0000-4000-8000-000000000008',
    title: 'Consulting SOW #12',
    status: 'completed',
    daysAgo: 20,
    completed: true,
    signers: [
      snippet(PEOPLE.maya!, 'completed', iso(19, 9)),
      snippet(PEOPLE.sam!, 'completed', iso(19, 16)),
    ],
  }),
  listItem({
    id: 'e1000000-0000-4000-8000-000000000009',
    title: 'Old office lease 2025',
    status: 'completed',
    daysAgo: 300,
    completed: true,
    archived: true,
    signers: [snippet(PEOPLE.noa!, 'completed', iso(299, 9))],
  }),
];

function fullSigner(p: PersonSeed, order: number, status: SignerStatus, signedAt: string | null) {
  return {
    id: p.id,
    email: p.email,
    name: p.name,
    color: p.color,
    role: 'signatory',
    signing_order: order,
    status,
    viewed_at: status === 'awaiting' ? null : iso(1, 9),
    tc_accepted_at: status === 'completed' ? iso(1, 9) : null,
    signed_at: signedAt,
    declined_at: null,
    invited_at: iso(1, 9),
    step: order,
    delivery_status: 'delivered',
  };
}

function fullEnvelope(o: {
  id: string;
  title: string;
  status: string;
  signers: ReadonlyArray<ReturnType<typeof fullSigner>>;
  sealed: boolean;
}) {
  return {
    id: o.id,
    owner_id: OWNER_ID,
    title: o.title,
    short_code: o.sealed ? 'SEALD7Q2K9XPA' : 'AWAIT4M8N2RTB',
    status: o.status,
    original_pages: 1,
    expires_at: iso(-29),
    tc_version: '1',
    privacy_version: '1',
    sent_at: iso(1, 9),
    completed_at: o.sealed ? iso(0, 8) : null,
    archived_at: null,
    signers: o.signers,
    fields: o.signers.map((s, i) => ({
      id: `f-${String(i)}-${s.id.slice(-4)}`,
      signer_id: s.id,
      kind: 'signature',
      page: 1,
      x: 0.12,
      y: 0.62 + i * 0.12,
      width: 0.3,
      height: 0.07,
      required: true,
      document_id: 'd1000000-0000-4000-8000-000000000001',
    })),
    tags: ['sales', 'q4'],
    delivery_mode: 'parallel',
    documents: [
      {
        id: 'd1000000-0000-4000-8000-000000000001',
        ord: 1,
        title: o.title,
        original_pages: 1,
        original_sha256: SHA_A,
        sealed_sha256: o.sealed ? SHA_B : null,
      },
    ],
    reminders_enabled: true,
    reminder_first_after_days: 2,
    reminder_interval_days: 3,
    reminder_max: 3,
    date_format: 'MMM d, yyyy',
    timezone: 'UTC',
    locale: 'en',
    created_at: iso(2, 8),
    updated_at: iso(0, 8),
    gdriveExport: { connected: true, lastFolder: null, lastPushedAt: null },
  };
}

const AWAITING_DETAIL = fullEnvelope({
  id: ENV_AWAITING,
  title: 'Master Services Agreement — Acme Corp',
  status: 'awaiting_others',
  sealed: false,
  signers: [
    fullSigner(PEOPLE.maya!, 1, 'completed', iso(0, 8)),
    fullSigner(PEOPLE.daniel!, 2, 'viewing', null),
  ],
});

const SEALED_DETAIL = fullEnvelope({
  id: ENV_SEALED,
  title: HEBREW_TITLE,
  status: 'completed',
  sealed: true,
  signers: [
    fullSigner(PEOPLE.noa!, 1, 'completed', iso(0, 7)),
    fullSigner(PEOPLE.sam!, 2, 'completed', iso(0, 8)),
  ],
});

function events(envId: string, sealed: boolean) {
  const rows: Array<[string, string, string | null, string]> = [
    ['created', 'sender', null, iso(2, 8)],
    ['pdf_uploaded', 'sender', null, iso(2, 8)],
    ['sent', 'sender', null, iso(1, 9)],
    ['viewed', 'signer', PEOPLE.maya!.id, iso(1, 10)],
    ['signed', 'signer', PEOPLE.maya!.id, iso(0, 8)],
    ['viewed', 'signer', PEOPLE.daniel!.id, iso(0, 9)],
  ];
  if (sealed) {
    rows.push(['all_signed', 'system', null, iso(0, 9)], ['sealed', 'system', null, iso(0, 9)]);
  }
  return {
    events: rows.map(([event_type, actor_kind, signer_id, created_at], i) => ({
      id: `ev-${String(i)}`,
      envelope_id: envId,
      signer_id,
      actor_kind,
      event_type,
      ip: '203.0.113.7',
      user_agent: 'Mozilla/5.0',
      metadata: {},
      created_at,
    })),
    chain_intact: true,
  };
}

function contact(p: PersonSeed, docs: number, lastDaysAgo: number | null) {
  return {
    id: `c-${p.id.slice(-4)}`,
    owner_id: OWNER_ID,
    name: p.name,
    email: p.email,
    color: p.color,
    created_at: iso(60),
    updated_at: iso(10),
    docs_count: docs,
    last_sent_at: lastDaysAgo === null ? null : iso(lastDaysAgo),
  };
}

const CONTACTS = [
  contact(PEOPLE.maya!, 6, 1),
  contact(PEOPLE.daniel!, 4, 1),
  contact(PEOPLE.noa!, 3, 3),
  contact(PEOPLE.sam!, 2, 5),
  contact(
    {
      id: 'a1000000-0000-4000-8000-00000000000a',
      name: 'Priya Raghunathan-Venkataraman',
      email: 'priya.raghunathan-venkataraman@globalholdings-international.com',
      color: '#8B5CF6',
    },
    0,
    null,
  ),
];

const TEMPLATE_ID = 't1000000-0000-4000-8000-000000000001';

function template(o: {
  id: string;
  title: string;
  description: string;
  cover: string;
  uses: number;
  lastUsedDaysAgo: number | null;
  tags: ReadonlyArray<string>;
  example: boolean;
}) {
  return {
    id: o.id,
    owner_id: OWNER_ID,
    title: o.title,
    description: o.description,
    cover_color: o.cover,
    field_layout: [
      { type: 'signature', pageRule: 1, x: 72, y: 600, signerIndex: 0, signerRoleId: 'role-1' },
      { type: 'date', pageRule: 1, x: 320, y: 600, signerIndex: 0, signerRoleId: 'role-1' },
      {
        type: 'text',
        pageRule: 1,
        x: 72,
        y: 520,
        label: 'Company',
        signerIndex: 0,
        signerRoleId: 'role-1',
      },
      { type: 'signature', pageRule: 1, x: 72, y: 680, signerIndex: 1, signerRoleId: 'role-2' },
    ],
    tags: o.tags,
    last_signers: [
      {
        id: 'role-1',
        name: 'Maya Cohen',
        email: 'maya@acme.io',
        color: '#6366F1',
        signing_order: 1,
      },
      {
        id: 'role-2',
        name: 'Daniel Park',
        email: 'daniel.park@northwind.com',
        color: '#10B981',
        signing_order: 2,
      },
    ],
    delivery_mode: 'parallel',
    has_example_pdf: o.example,
    uses_count: o.uses,
    last_used_at: o.lastUsedDaysAgo === null ? null : iso(o.lastUsedDaysAgo),
    created_at: iso(90),
    updated_at: iso(4),
  };
}

const TEMPLATES = [
  template({
    id: TEMPLATE_ID,
    title: 'Mutual NDA',
    description: 'Two-way confidentiality, 2 years.',
    cover: '#EEF2FF',
    uses: 14,
    lastUsedDaysAgo: 2,
    tags: ['legal'],
    example: true,
  }),
  template({
    id: 't1000000-0000-4000-8000-000000000002',
    title: 'Freelance contractor agreement',
    description: 'Scope, payment terms and IP assignment.',
    cover: '#ECFDF5',
    uses: 6,
    lastUsedDaysAgo: 9,
    tags: ['hr', 'contractors'],
    example: true,
  }),
  template({
    id: 't1000000-0000-4000-8000-000000000003',
    title: 'Residential lease — 12 months, unfurnished, Dallas TX',
    description: '',
    cover: '#FFF7ED',
    uses: 0,
    lastUsedDaysAgo: null,
    tags: [],
    example: false,
  }),
];

const SETTINGS = {
  display_name: DEFAULT_SEEDED_USER.fullName,
  signature: { type: 'typed', typed_text: DEFAULT_SEEDED_USER.fullName, image: null },
  initials: 'AE',
  notify: { signed: true, daily_summary: false },
  reminder_default: '3d',
  expiry_default_days: 30,
};

const GDRIVE_ACCOUNTS = [
  {
    id: 'g1000000-0000-4000-8000-000000000001',
    email: 'ops@nromomentum.com',
    connectedAt: iso(40),
    lastUsedAt: iso(2),
    tokenStatus: 'ok',
  },
];

const APPROVAL_ID = '11111111-1111-4111-8111-111111111111';
const APPROVAL_ENV_ID = '22222222-2222-4222-8222-222222222222';

function approvalSummary(title: string) {
  return {
    kind: 'envelope_send',
    action_label: 'Send for signature',
    title,
    recipients: [
      { name: 'Ada Lovelace', email: 'ada@example.org', is_new: false },
      { name: 'Grace Hopper', email: 'grace@example.org', is_new: false },
      { name: 'Linus Torvalds', email: 'linus@example.org', is_new: true },
    ],
    page_count: 3,
    key_name: 'Claude desktop',
    approver_email: ME_EMAIL,
    destination: null,
  };
}

function approvalDetail(id: string, title: string, status: string, hoursAgo: number) {
  return {
    id,
    kind: 'envelope_send',
    status,
    summary: approvalSummary(title),
    approve_requires: 'session',
    envelope_id: APPROVAL_ENV_ID,
    requested_at: new Date(Date.parse(NOW) - hoursAgo * 3600_000).toISOString(),
    expires_at: new Date(Date.parse(NOW) + 20 * 3600_000).toISOString(),
    decided_at: status === 'pending' ? null : new Date(Date.parse(NOW) - 3600_000).toISOString(),
    fields_updated_at: null,
    result_slug: null,
    result: null,
  };
}

const APPROVALS = {
  items: [
    approvalDetail(APPROVAL_ID, 'Services agreement — Globex', 'pending', 1),
    approvalDetail(
      '11111111-1111-4111-8111-111111111112',
      'Quarterly vendor renewal',
      'pending',
      5,
    ),
    approvalDetail(
      '11111111-1111-4111-8111-111111111113',
      'Board consent — October',
      'approved',
      30,
    ),
  ],
  next_cursor: null,
  pending_count: 2,
};

const API_KEYS = {
  items: [
    {
      id: '00000000-0000-4000-8000-000000000001',
      name: 'Claude desktop',
      prefix: 'seald_live_xxxxxxx1',
      scopes: ['envelopes:read', 'envelopes:send', 'templates:read'],
      status: 'active',
      require_owner_approval: true,
      allow_new_recipients: false,
      always_require_signin: false,
      created_at: iso(30),
      last_used_at: iso(0),
      expires_at: iso(-60),
      revoked_at: null,
    },
    {
      id: '00000000-0000-4000-8000-000000000002',
      name: 'Zapier sync',
      prefix: 'seald_live_xxxxxxx2',
      scopes: ['envelopes:read'],
      status: 'active',
      require_owner_approval: true,
      allow_new_recipients: false,
      always_require_signin: false,
      created_at: iso(80),
      last_used_at: null,
      expires_at: iso(-10),
      revoked_at: null,
    },
  ],
};

const CONNECTED_APPS = {
  items: [
    {
      id: '00000000-0000-4000-8000-0000000000c1',
      client_name: 'Claude',
      client_host: 'claude.ai',
      unverified: false,
      scopes: ['envelopes:read', 'envelopes:send'],
      created_at: iso(20),
      last_used_at: iso(1),
    },
  ],
};

const AUTOMATIONS = {
  items: [
    {
      id: '00000000-0000-4000-8000-0000000000a1',
      recipe: 'sealed_webhook',
      name: 'Send a webhook when sealed',
      enabled: true,
      status_word: null,
      trigger: 'envelope_sealed',
      action: 'webhook',
      scope: 'account',
      template_id: null,
      destination_host: 'hooks.example.com',
      payload_detail: 'ids',
      recipients: null,
      awaiting_approval: false,
      consecutive_failures: 0,
      created_at: iso(25),
      updated_at: iso(25),
      secret_set: true,
      last_run: null,
    },
    {
      id: '00000000-0000-4000-8000-0000000000a2',
      recipe: 'sealed_save_drive',
      name: 'Save sealed copies to Drive',
      enabled: false,
      status_word: null,
      trigger: 'envelope_sealed',
      action: 'gdrive_upload',
      scope: 'account',
      template_id: null,
      destination_host: null,
      payload_detail: null,
      recipients: null,
      awaiting_approval: false,
      consecutive_failures: 0,
      created_at: iso(12),
      updated_at: iso(3),
      secret_set: false,
      last_run: null,
    },
  ],
  next_cursor: null,
};

const VERIFY_CODE = 'SEALD7Q2K9XPA';

function verifyPayload() {
  return {
    envelope: {
      id: ENV_SEALED,
      title: 'Mutual NDA — 2026.pdf',
      short_code: VERIFY_CODE,
      status: 'completed',
      original_pages: 4,
      original_sha256: SHA_A,
      sealed_sha256: SHA_B,
      tc_version: '1',
      privacy_version: '1',
      sent_at: iso(3, 9),
      completed_at: iso(2, 15),
      expires_at: iso(-27),
    },
    signers: [
      {
        id: 's1',
        name: 'Ops Ops',
        email: 'ops@nromomentum.com',
        role: 'signer',
        status: 'completed',
        signed_at: iso(2, 14),
        declined_at: null,
      },
      {
        id: 's2',
        name: 'Maya Cohen',
        email: 'maya@acme.io',
        role: 'signer',
        status: 'completed',
        signed_at: iso(2, 15),
        declined_at: null,
      },
    ],
    events: [
      {
        id: 'e1',
        actor_kind: 'sender',
        event_type: 'created',
        signer_id: null,
        created_at: iso(3, 9),
      },
      {
        id: 'e2',
        actor_kind: 'sender',
        event_type: 'sent',
        signer_id: null,
        created_at: iso(3, 9),
      },
      {
        id: 'e3',
        actor_kind: 'signer',
        event_type: 'signed',
        signer_id: 's1',
        created_at: iso(2, 14),
      },
      {
        id: 'e4',
        actor_kind: 'signer',
        event_type: 'signed',
        signer_id: 's2',
        created_at: iso(2, 15),
      },
      {
        id: 'e5',
        actor_kind: 'system',
        event_type: 'sealed',
        signer_id: null,
        created_at: iso(2, 15),
      },
    ],
    chain_intact: true,
    sealed_url: 'https://signed.example/sealed.pdf?token=presigned',
    audit_url: 'https://signed.example/audit.pdf?token=presigned',
  };
}

/* --------------------------------------------------------------- harness */

interface Ctx {
  readonly page: Page;
  readonly api: MockedApi;
  readonly vp: Viewport;
}

async function setup(page: Page): Promise<MockedApi> {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await new CookieConsentFixture(page).disable();
  await new FixedNowFixture(page).install(NOW);
  await page.addInitScript((css) => {
    const add = () => {
      const style = document.createElement('style');
      style.setAttribute('data-visual-audit', '');
      style.textContent = css;
      document.head.appendChild(style);
    };
    if (document.head) add();
    else document.addEventListener('DOMContentLoaded', add);
  }, STABLE_CSS);
  // Health pings (offline bar, maintenance gate) and the signed-URL host.
  await page.route('**/health', (route) => route.fulfill({ status: 200, json: { status: 'ok' } }));
  await page.route('https://signed.example/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/pdf', body: SAMPLE_PDF }),
  );
  // Supabase REST is never reached by these screens; answer instead of hanging.
  await page.route('http://127.0.0.1:54321/rest/**', (route) =>
    route.fulfill({ status: 200, json: [] }),
  );
  page.on('response', (res) => {
    if (res.status() !== 404) return;
    const url = res.url();
    if (!/\/api\/|\/sign\/|\/auth\/v1\//.test(url)) return;
    console.warn(`[visual-audit] unmocked ${res.request().method()} ${url}`);
  });
  const api = new MockedApi(page);
  await api.install();
  api.on('GET', /\/pdf-fixture\.pdf/, { contentType: 'application/pdf', body: SAMPLE_PDF });
  return api;
}

/** The mocks every signed-in screen needs: lists, settings, Drive, the bell. */
async function signedIn(page: Page, api: MockedApi): Promise<void> {
  await new SeededUserFixture(page).signInAs();
  api.on('GET', /\/auth\/v1\/user/, {
    json: {
      id: OWNER_ID,
      email: ME_EMAIL,
      aud: 'authenticated',
      role: 'authenticated',
      user_metadata: { full_name: DEFAULT_SEEDED_USER.fullName },
    },
  });
  api.on('GET', /\/api\/envelopes(\?|$)/, { json: { items: ENVELOPE_LIST, next_cursor: null } });
  api.on('GET', /\/api\/contacts(\?|$)/, { json: CONTACTS });
  api.on('GET', /\/api\/templates(\?|$)/, { json: TEMPLATES });
  api.on('GET', /\/api\/templates\/[^/]+\/example/, {
    contentType: 'application/pdf',
    body: SAMPLE_PDF,
  });
  api.on('GET', /\/api\/me\/settings(\?|$)/, { json: SETTINGS });
  api.on('PATCH', /\/api\/me\/settings(\?|$)/, { json: SETTINGS });
  api.on('GET', /\/api\/integrations\/gdrive\/accounts(\?|$)/, { json: GDRIVE_ACCOUNTS });
  api.on('GET', /\/api\/integrations\/gdrive\/picker-credentials/, {
    json: { developerKey: 'test-key', appId: '123456789012' },
  });
  api.on('GET', /\/api\/approvals(\?|$)/, { json: APPROVALS });
  api.on('GET', /\/api\/agent-activity(\?|$)/, { json: { items: [], next_cursor: null } });
  api.on('GET', /\/api\/me\/api-keys(\?|$)/, { json: API_KEYS });
  api.on('GET', /\/api\/me\/connected-apps(\?|$)/, { json: CONNECTED_APPS });
  api.on('GET', /\/api\/automations(\?|$)/, { json: AUTOMATIONS });
  api.on('GET', /\/api\/me(\?|$)/, { json: { id: OWNER_ID, email: ME_EMAIL } });
}

async function settle(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => undefined);
  await page.evaluate(() => document.fonts.ready.then(() => undefined)).catch(() => undefined);
  // One more frame so lazy chunks and pdf.js canvases paint.
  await page.waitForTimeout(400);
}

/**
 * Most screens scroll inside an app-shell container, not the document, so
 * `fullPage` alone would stop at the fold. Grow the viewport by whatever the
 * tallest inner scroller hides (a few passes, since 100vh layouts grow with
 * it) and scroll everything back to the top.
 */
async function expandToContent(page: Page, vp: Viewport): Promise<void> {
  let height: number = vp.height;
  for (let pass = 0; pass < 4; pass += 1) {
    const hidden = await page.evaluate(() => {
      let max = 0;
      for (const el of Array.from(document.querySelectorAll<HTMLElement>('*'))) {
        if (el.scrollHeight <= el.clientHeight + 1) continue;
        const oy = getComputedStyle(el).overflowY;
        if (oy !== 'auto' && oy !== 'scroll' && el !== document.scrollingElement) continue;
        max = Math.max(max, el.scrollHeight - el.clientHeight);
        el.scrollTop = 0;
      }
      window.scrollTo(0, 0);
      return max;
    });
    if (hidden <= 1) break;
    height = Math.min(height + hidden, 8000);
    await page.setViewportSize({ width: vp.width, height });
    await page.waitForTimeout(250);
    if (height >= 8000) break;
  }
}

/**
 * Runs `prepare` and saves a full-page shot at each width. A failure at one
 * width is recorded and the other still runs; the test fails at the end.
 */
async function capture(
  page: Page,
  api: MockedApi,
  id: string,
  prepare: (ctx: Ctx) => Promise<void>,
  opts: { readonly fullPage?: boolean; readonly settleNetwork?: boolean } = {},
): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });
  const errors: string[] = [];
  for (const vp of VIEWPORTS) {
    try {
      rmSync(resolve(OUT_DIR, `_failed-${id}--${vp.label}.png`), { force: true });
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('about:blank');
      await prepare({ page, api, vp });
      if (opts.settleNetwork !== false) await settle(page);
      else await page.waitForTimeout(600);
      if (opts.fullPage !== false) await expandToContent(page, vp);
      // A resize can make pdf.js repaint a page; let it finish.
      await page
        .getByText(/^Loading document/i)
        .first()
        .waitFor({ state: 'hidden', timeout: 10_000 })
        .catch(() => undefined);
      await page.screenshot({
        path: resolve(OUT_DIR, `${id}--${vp.label}.png`),
        fullPage: opts.fullPage ?? true,
        animations: 'disabled',
        caret: 'hide',
      });
    } catch (err) {
      errors.push(`${vp.label}: ${err instanceof Error ? err.message : String(err)}`);
      await page
        .screenshot({ path: resolve(OUT_DIR, `_failed-${id}--${vp.label}.png`), fullPage: true })
        .catch(() => undefined);
    }
  }
  if (errors.length > 0) throw new Error(`${id} failed:\n${errors.join('\n')}`);
}

function heading(page: Page, name: string | RegExp) {
  return page.getByRole('heading', { name }).first();
}

const json = (route: Route, status: number, body: unknown) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

/* ----------------------------------------------------------------- tests */

// A fake camera, so the phone scan page reaches its capture screen.
test.use({
  permissions: ['camera'],
  launchOptions: {
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
  },
});

test.describe('visual audit', () => {
  test.skip(!ENABLED, 'Visual audit runs only with VISUAL_AUDIT=1');
  test.describe.configure({ mode: 'parallel' });
  test.setTimeout(120_000);

  /* ---------------------------------------------------------------- auth */

  test('signin', async ({ page }) => {
    const api = await setup(page);
    await capture(page, api, 'signin', async ({ page: p }) => {
      await p.goto('/signin');
      await expect(heading(p, 'Sign in or create account')).toBeVisible();
    });
  });

  test('signup', async ({ page }) => {
    const api = await setup(page);
    await capture(page, api, 'signup', async ({ page: p }) => {
      await p.goto('/signup');
      await expect(heading(p, /sign in or create account|create/i)).toBeVisible();
    });
  });

  test('check-email', async ({ page }) => {
    const api = await setup(page);
    await capture(page, api, 'check-email', async ({ page: p }) => {
      await p.goto(`/check-email?email=${encodeURIComponent('maya.cohen@acme.io')}`);
      await expect(heading(p, 'Check your email')).toBeVisible();
    });
  });

  test('welcome', async ({ page }) => {
    const api = await setup(page);
    await signedIn(page, api);
    // A second seed with no name wins: a brand-new account still owes /welcome.
    await new SeededUserFixture(page).signInAs({ ...DEFAULT_SEEDED_USER, fullName: '' });
    api.on('PUT', /\/auth\/v1\/user/, { json: { id: OWNER_ID } });
    await capture(page, api, 'welcome', async ({ page: p }) => {
      await p.goto('/welcome');
      await expect(heading(p, 'Welcome to Seald')).toBeVisible();
    });
  });

  test('not-found', async ({ page }) => {
    const api = await setup(page);
    await capture(page, api, 'not-found', async ({ page: p }) => {
      await p.goto('/this-page-does-not-exist');
      await expect(heading(p, 'Page not found')).toBeVisible();
    });
  });

  test('not-found-signed-in', async ({ page }) => {
    const api = await setup(page);
    await signedIn(page, api);
    await capture(page, api, 'not-found-signed-in', async ({ page: p }) => {
      await p.goto('/this-page-does-not-exist');
      await expect(heading(p, 'Page not found')).toBeVisible();
    });
  });

  test('maintenance', async ({ page }) => {
    const api = await setup(page);
    await signedIn(page, api);
    api.override('GET', /\/api\/envelopes(\?|$)/, {
      status: 503,
      headers: { 'x-maintenance': '1', 'retry-after': '900' },
      json: { error: 'maintenance' },
    });
    await capture(page, api, 'maintenance', async ({ page: p }) => {
      await p.goto('/documents');
      await expect(heading(p, /maintenance|be right back|back soon/i)).toBeVisible();
    });
  });

  /* ----------------------------------------------------------- documents */

  test('documents', async ({ page }) => {
    const api = await setup(page);
    await signedIn(page, api);
    await capture(page, api, 'documents', async ({ page: p }) => {
      await p.goto('/documents');
      await expect(p.getByTestId('doc-row').first()).toBeVisible();
    });
  });

  test('documents-archived', async ({ page }) => {
    const api = await setup(page);
    await signedIn(page, api);
    await capture(page, api, 'documents-archived', async ({ page: p }) => {
      await p.goto('/documents');
      await expect(p.getByTestId('doc-row').first()).toBeVisible();
      await p.getByRole('tab', { name: /^archived/i }).click();
      await expect(
        p.getByTestId('doc-row').filter({ hasText: 'Old office lease 2025' }),
      ).toBeVisible();
    });
  });

  test('documents-empty', async ({ page }) => {
    const api = await setup(page);
    await signedIn(page, api);
    api.override('GET', /\/api\/envelopes(\?|$)/, { json: { items: [], next_cursor: null } });
    await capture(page, api, 'documents-empty', async ({ page: p }) => {
      await p.goto('/documents');
      await expect(p.getByRole('main')).toBeVisible();
      await expect(p.getByTestId('doc-row')).toHaveCount(0);
    });
  });

  test('documents-bulk-select', async ({ page }) => {
    const api = await setup(page);
    await signedIn(page, api);
    await capture(page, api, 'documents-bulk-select', async ({ page: p, vp }) => {
      await p.goto('/documents');
      await expect(p.getByTestId('doc-row').first()).toBeVisible();
      if (vp.width < 640) {
        await p.getByRole('button', { name: 'Select', exact: true }).click();
      }
      await p
        .getByRole('checkbox', { name: 'Select Master Services Agreement — Acme Corp' })
        .check();
      await p.getByRole('checkbox', { name: `Select ${LONG_TITLE}` }).check();
      await expect(
        p.getByRole('toolbar', { name: /bulk actions|selection actions/i }).first(),
      ).toBeVisible();
    });
  });

  test('documents-row-actions', async ({ page }) => {
    const api = await setup(page);
    await signedIn(page, api);
    await capture(
      page,
      api,
      'documents-row-actions',
      async ({ page: p }) => {
        await p.goto('/documents');
        await expect(p.getByTestId('doc-row').first()).toBeVisible();
        await p
          .getByRole('button', { name: 'More actions for Master Services Agreement — Acme Corp' })
          .first()
          .click();
        await expect(p.getByRole('dialog').or(p.getByRole('menu')).first()).toBeVisible();
      },
      // An open overlay: keep the viewport-sized shot.
      { fullPage: false },
    );
  });

  /* ------------------------------------------------------ envelope detail */

  function envelopeMocks(api: MockedApi): void {
    for (const [id, detail, sealed] of [
      [ENV_AWAITING, AWAITING_DETAIL, false],
      [ENV_SEALED, SEALED_DETAIL, true],
    ] as const) {
      api.on('GET', new RegExp(`/api/envelopes/${id}$`), { json: detail });
      api.on('GET', new RegExp(`/api/envelopes/${id}/events`), { json: events(id, sealed) });
      api.on('GET', new RegExp(`/api/envelopes/${id}/documents$`), {
        json: { documents: detail.documents },
      });
      api.on('GET', new RegExp(`/api/envelopes/${id}/download`), {
        json: { url: '/pdf-fixture.pdf', kind: 'original' },
      });
    }
  }

  test('envelope-awaiting', async ({ page }) => {
    const api = await setup(page);
    await signedIn(page, api);
    envelopeMocks(api);
    await capture(page, api, 'envelope-awaiting', async ({ page: p }) => {
      await p.goto(`/document/${ENV_AWAITING}`);
      await expect(heading(p, 'Master Services Agreement — Acme Corp')).toBeVisible();
    });
  });

  test('envelope-sealed-download-menu', async ({ page }) => {
    const api = await setup(page);
    await signedIn(page, api);
    envelopeMocks(api);
    await capture(
      page,
      api,
      'envelope-sealed-download-menu',
      async ({ page: p }) => {
        await p.goto(`/document/${ENV_SEALED}`);
        await expect(heading(p, HEBREW_TITLE)).toBeVisible();
        await p.getByRole('button', { name: 'Download options' }).first().click();
        await expect(p.getByRole('menu').or(p.getByRole('dialog')).first()).toBeVisible();
      },
      // An open overlay: keep the viewport-sized shot.
      { fullPage: false },
    );
  });

  /* ------------------------------------------------------ upload + editor */

  test('upload', async ({ page }) => {
    const api = await setup(page);
    await signedIn(page, api);
    await capture(page, api, 'upload', async ({ page: p }) => {
      await p.goto('/document/new');
      await expect(p.getByLabel('Choose file')).toBeAttached();
      await expect(p.getByRole('main').first()).toBeVisible();
    });
  });

  test('editor', async ({ page }) => {
    const api = await setup(page);
    await signedIn(page, api);
    await capture(page, api, 'editor', async ({ page: p, vp }) => {
      await p.goto('/document/new');
      await p.getByLabel('Choose file').setInputFiles(SAMPLE_PDF_PATH);
      await p.waitForURL(/\/document\/[^/]+$/, { timeout: 15_000 });
      // Phones open on the Signers panel; the page canvas is a tab away.
      if (vp.width < 640) await expect(p.getByText('sample-1page').first()).toBeVisible();
      else await expect(p.locator('[data-page="1"]').first()).toBeVisible();
    });
  });

  /* ------------------------------------------------------------ templates */

  test('templates', async ({ page }) => {
    const api = await setup(page);
    await signedIn(page, api);
    await capture(page, api, 'templates', async ({ page: p }) => {
      await p.goto('/templates');
      await expect(heading(p, 'Templates')).toBeVisible();
      await expect(p.getByText('Mutual NDA').first()).toBeVisible();
    });
  });

  test('templates-empty', async ({ page }) => {
    const api = await setup(page);
    await signedIn(page, api);
    api.override('GET', /\/api\/templates(\?|$)/, { json: [] });
    await capture(page, api, 'templates-empty', async ({ page: p }) => {
      await p.goto('/templates');
      await expect(heading(p, 'Templates')).toBeVisible();
    });
  });

  test('template-editor', async ({ page }) => {
    const api = await setup(page);
    await signedIn(page, api);
    api.on('GET', new RegExp(`/api/templates/${TEMPLATE_ID}/example`), {
      contentType: 'application/pdf',
      body: SAMPLE_PDF,
    });
    api.on('GET', new RegExp(`/api/templates/${TEMPLATE_ID}$`), { json: TEMPLATES[0] });
    await capture(page, api, 'template-editor', async ({ page: p }) => {
      await p.goto(`/templates/${TEMPLATE_ID}/edit`);
      await expect(p.locator('[data-page="1"]').first()).toBeVisible({ timeout: 15_000 });
    });
  });

  // The editor as the Use dialog's "Review fields" opens it: signers from the
  // dialog, the saved layout placed on the page.
  test('template-review-fields', async ({ page }) => {
    const api = await setup(page);
    await signedIn(page, api);
    api.on('GET', new RegExp(`/api/templates/${TEMPLATE_ID}$`), { json: TEMPLATES[0] });
    api.on('POST', new RegExp(`/api/templates/${TEMPLATE_ID}/apply$`), {
      json: {
        fields: TEMPLATES[0]!.field_layout.map((f, i) => ({
          ...f,
          id: `tf-${String(i)}`,
          page: 1,
        })),
      },
    });
    await capture(page, api, 'template-review-fields', async ({ page: p, vp }) => {
      await p.goto(`/templates/${TEMPLATE_ID}/use`);
      await p.getByRole('dialog').getByRole('button', { name: 'Review fields' }).click();
      await p.waitForURL(/\/templates\/[^/]+\/edit/, { timeout: 15_000 });
      if (vp.width >= 640) {
        await expect(p.locator('[data-page="1"]').first()).toBeVisible({ timeout: 15_000 });
      }
    });
  });

  test('bulk-send', async ({ page }) => {
    const api = await setup(page);
    await signedIn(page, api);
    api.on('GET', new RegExp(`/api/templates/${TEMPLATE_ID}/bulk-schema`), {
      json: {
        template_id: TEMPLATE_ID,
        template_title: 'Mutual NDA',
        slots: [
          { slot: 1, label: 'Client', name_column: 'client_name', email_column: 'client_email' },
          { slot: 2, label: 'Witness', name_column: 'witness_name', email_column: 'witness_email' },
        ],
        optional_columns: ['title'],
        max_rows: 100,
        max_file_bytes: 524288,
      },
    });
    await capture(page, api, 'bulk-send', async ({ page: p }) => {
      await p.goto(`/templates/${TEMPLATE_ID}/bulk-send`);
      await expect(p.getByText('Mutual NDA').first()).toBeVisible();
    });
  });

  /* ------------------------------------------------------------- contacts */

  test('contacts', async ({ page }) => {
    const api = await setup(page);
    await signedIn(page, api);
    await capture(page, api, 'contacts', async ({ page: p }) => {
      await p.goto('/signers');
      await expect(heading(p, 'Contacts')).toBeVisible();
      await expect(p.getByText('Maya Cohen').first()).toBeVisible();
    });
  });

  test('contacts-empty', async ({ page }) => {
    const api = await setup(page);
    await signedIn(page, api);
    api.override('GET', /\/api\/contacts(\?|$)/, { json: [] });
    await capture(page, api, 'contacts-empty', async ({ page: p }) => {
      await p.goto('/signers');
      await expect(heading(p, 'Contacts')).toBeVisible();
    });
  });

  /* ------------------------------------------------------------- settings */

  // Desktop sections are a `region` named after the section; phones and the
  // flagged pages carry a heading instead.
  for (const [id, path, name] of [
    ['settings', '/settings', /settings|profile/i],
    ['settings-profile', '/settings/profile', /^profile$/i],
    ['settings-signature', '/settings/signature', /^signature$/i],
    ['settings-notifications', '/settings/notifications', /^notifications$/i],
    ['settings-integrations', '/settings/integrations', /^integrations$/i],
    ['settings-account', '/settings/account', /^account$/i],
    ['settings-developers', '/settings/developers', /developers/i],
    ['settings-automations', '/settings/automations', /automations/i],
    ['settings-approvals', '/settings/approvals', /approvals/i],
  ] as const) {
    test(id, async ({ page }) => {
      const api = await setup(page);
      await signedIn(page, api);
      await capture(page, api, id, async ({ page: p }) => {
        await p.goto(path);
        await expect(p.getByRole('region', { name }).or(heading(p, name)).first()).toBeVisible();
        if (id === 'settings-integrations') {
          await expect(p.getByText('ops@nromomentum.com').first()).toBeVisible();
        }
      });
    });
  }

  /* ------------------------------------------------------------ approvals */

  test('approve-email-link', async ({ page }) => {
    const api = await setup(page);
    const card = {
      state: 'pending',
      approval_id: APPROVAL_ID,
      summary: approvalSummary('Services agreement — Globex'),
      approve_requires: 'link',
      expires_at: new Date(Date.parse(NOW) + 23 * 3600_000).toISOString(),
      fields_updated_at: null,
      result_slug: null,
      review_url: `http://127.0.0.1:5173/approve/${APPROVAL_ID}/review`,
      csrf: 'C'.repeat(43),
    };
    api.on('POST', /\/api\/approvals\/from-email\/preview$/, { json: card });
    await capture(page, api, 'approve-email-link', async ({ page: p }) => {
      await p.goto(`/approve#${'T'.repeat(43)}`);
      await expect(
        p
          .getByRole('button', { name: 'Approve' })
          .or(p.getByRole('button', { name: /sign in to approve/i }))
          .first(),
      ).toBeVisible();
    });
  });

  test('approve-detail', async ({ page }) => {
    const api = await setup(page);
    await signedIn(page, api);
    api.on('GET', new RegExp(`/api/approvals/${APPROVAL_ID}$`), { json: APPROVALS.items[0] });
    await capture(page, api, 'approve-detail', async ({ page: p }) => {
      await p.goto(`/approve/${APPROVAL_ID}`);
      await expect(p.getByText('Services agreement — Globex').first()).toBeVisible();
    });
  });

  test('oauth-consent', async ({ page }) => {
    const api = await setup(page);
    await signedIn(page, api);
    api.on('POST', /\/api\/oauth\/consent\/describe$/, {
      json: {
        client_name: 'Claude',
        redirect_host: 'claude.ai',
        unverified: false,
        scopes: ['envelopes:read', 'envelopes:send', 'templates:read'],
        fresh_login_required: false,
      },
    });
    const q = new URLSearchParams({
      response_type: 'code',
      client_id: 'https://claude.ai/oauth/client.json',
      redirect_uri: 'https://claude.ai/api/mcp/auth_callback',
      code_challenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
      code_challenge_method: 'S256',
      scope: 'envelopes:read envelopes:send templates:read',
      state: 'xyz',
    });
    await capture(page, api, 'oauth-consent', async ({ page: p }) => {
      await p.goto(`/oauth/mcp/consent?${q.toString()}`);
      await expect(p.getByText('Claude').first()).toBeVisible();
    });
  });

  /* -------------------------------------------------------------- signing */

  test('sign-entry', async ({ page }) => {
    const api = await setup(page);
    // Hold /sign/start open so the entry screen stays on "Opening…".
    await page.route('**/sign/start', () => undefined);
    await capture(
      page,
      api,
      'sign-entry',
      async ({ page: p }) => {
        await p.goto('/sign/env_test_happy?t=tok_test');
        await expect(p.getByText(/opening your document/i).first()).toBeVisible();
      },
      { settleNetwork: false },
    );
  });

  test('sign-fill-consent', async ({ page }) => {
    const api = await setup(page);
    const id = new SignedEnvelopeFixture(api).seed('happy');
    await capture(page, api, 'sign-fill-consent', async ({ page: p }) => {
      await p.goto(`/sign/${id}?t=tok_test`);
      await p.waitForURL(/\/sign\/[^/]+\/fill/);
      await new SigningFillPage(p).expectConsentBar();
    });
  });

  test('sign-fill', async ({ page }) => {
    const api = await setup(page);
    const id = new SignedEnvelopeFixture(api).seed('happy');
    await capture(page, api, 'sign-fill', async ({ page: p }) => {
      await p.goto(`/sign/${id}?t=tok_test`);
      await p.waitForURL(/\/sign\/[^/]+\/fill/);
      const fill = new SigningFillPage(p);
      await fill.agreeAndStart();
      await expect(p.getByRole('button', { name: /^start$/i })).toHaveCount(0);
    });
  });

  test('sign-decline-sheet', async ({ page }) => {
    const api = await setup(page);
    const id = new SignedEnvelopeFixture(api).seed('happy');
    await capture(
      page,
      api,
      'sign-decline-sheet',
      async ({ page: p }) => {
        await p.goto(`/sign/${id}?t=tok_test`);
        await p.waitForURL(/\/sign\/[^/]+\/fill/);
        const fill = new SigningFillPage(p);
        await fill.openMenu();
        await p.getByRole('menuitem', { name: /^decline$/i }).click();
        await expect(p.getByRole('dialog', { name: /decline to sign/i })).toBeVisible();
      },
      // An open overlay: keep the viewport-sized shot.
      { fullPage: false },
    );
  });

  const DONE_SNAPSHOT = {
    envelope_id: 'env_test_happy',
    short_code: VERIFY_CODE,
    title: 'Master Services Agreement',
    sender_name: 'Eliran Azulay',
    recipient_email: 'bob@example.com',
    timestamp: NOW,
  };

  test('sign-done', async ({ page }) => {
    const api = await setup(page);
    await page.addInitScript(
      (s) => {
        window.sessionStorage.setItem('sealed.sign.last', JSON.stringify(s));
      },
      { ...DONE_SNAPSHOT, kind: 'submitted', signed_count: 2, total_count: 2 },
    );
    api.on('GET', /\/api\/verify\//, { json: verifyPayload() });
    await capture(page, api, 'sign-done', async ({ page: p }) => {
      await p.goto('/sign/env_test_happy/done');
      await expect(heading(p, /^signed$/i)).toBeVisible();
    });
  });

  test('sign-declined', async ({ page }) => {
    const api = await setup(page);
    await page.addInitScript(
      (s) => {
        window.sessionStorage.setItem('sealed.sign.last', JSON.stringify(s));
      },
      {
        ...DONE_SNAPSHOT,
        kind: 'declined',
        decline_reason: 'declined',
        reason_text: 'The start date is wrong.',
      },
    );
    await capture(page, api, 'sign-declined', async ({ page: p }) => {
      await p.goto('/sign/env_test_happy/declined');
      await expect(heading(p, /declined|withdrew consent|wrong recipient/i)).toBeVisible();
    });
  });

  for (const shape of ['expired', 'invalid', 'signed'] as const) {
    test(`sign-link-${shape}`, async ({ page }) => {
      const api = await setup(page);
      const id = new SignedEnvelopeFixture(api).seed(shape);
      await capture(page, api, `sign-link-${shape}`, async ({ page: p }) => {
        await p.goto(`/sign/${id}?t=tok_test`);
        await p.waitForURL(/\/sign\/[^/]+\/link\//);
        await expect(p.getByRole('heading').first()).toBeVisible();
      });
    });
  }

  /* --------------------------------------------------------------- public */

  test('verify-entry', async ({ page }) => {
    const api = await setup(page);
    await capture(page, api, 'verify-entry', async ({ page: p }) => {
      await p.goto('/verify');
      await expect(p.getByRole('heading').first()).toBeVisible();
    });
  });

  test('verify-result', async ({ page }) => {
    const api = await setup(page);
    api.on('GET', new RegExp(`/api/verify/${VERIFY_CODE}$`), { json: verifyPayload() });
    await capture(page, api, 'verify-result', async ({ page: p }) => {
      await p.goto(`/verify/${VERIFY_CODE}`);
      await expect(p.getByRole('heading', { level: 1, name: 'Authentic' })).toBeVisible();
    });
  });

  test('direct-link', async ({ page }) => {
    const api = await setup(page);
    const token = `dl_${'a'.repeat(43)}`;
    await page.route(`**/api/direct-links/${token}`, (route) =>
      json(route, 200, { template_title: 'Consulting agreement', sender_name: 'Olive Owner' }),
    );
    await capture(page, api, 'direct-link', async ({ page: p }) => {
      await p.goto(`/d/${token}`);
      await expect(heading(p, 'Consulting agreement')).toBeVisible();
    });
  });

  test('scan-phone', async ({ page }) => {
    const api = await setup(page);
    api.on('GET', /\/api\/scan-sessions\/[^/]+\/phone$/, {
      json: { status: 'pending', expires_at: new Date(Date.parse(NOW) + 9 * 60_000).toISOString() },
    });
    await capture(page, api, 'scan-phone', async ({ page: p }) => {
      await p.goto('/scan/ABCD2345');
      await expect(p.getByText(/fit the page in the frame/i)).toBeVisible();
    });
  });

  test('scan-phone-blocked', async ({ page }) => {
    const api = await setup(page);
    await page.addInitScript(() => {
      navigator.mediaDevices.getUserMedia = () =>
        Promise.reject(new DOMException('Permission denied', 'NotAllowedError'));
    });
    api.on('GET', /\/api\/scan-sessions\/[^/]+\/phone$/, {
      json: { status: 'pending', expires_at: new Date(Date.parse(NOW) + 9 * 60_000).toISOString() },
    });
    await capture(page, api, 'scan-phone-blocked', async ({ page: p }) => {
      await p.goto('/scan/ABCD2345');
      await expect(p.getByRole('heading').first()).toBeVisible();
    });
  });

  test('scan-desktop', async ({ page }) => {
    const api = await setup(page);
    await signedIn(page, api);
    const expires = new Date(Date.parse(NOW) + 9 * 60_000).toISOString();
    api.on('POST', /\/api\/scan-sessions$/, { json: { code: 'ABCD2345', expires_at: expires } });
    api.on('GET', /\/api\/scan-sessions\/ABCD2345$/, {
      json: { status: 'pending', expires_at: expires, page_count: null },
    });
    await capture(page, api, 'scan-desktop', async ({ page: p }) => {
      await p.goto('/scan');
      // A computer shows the QR dialog; a phone opens the camera.
      await expect(
        p
          .getByRole('dialog')
          .or(p.getByText(/fit the page in the frame/i))
          .first(),
      ).toBeVisible();
    });
  });

  test('templates-use-dialog', async ({ page }) => {
    const api = await setup(page);
    await signedIn(page, api);
    await capture(
      page,
      api,
      'templates-use-dialog',
      async ({ page: p }) => {
        await p.goto(`/templates/${TEMPLATE_ID}/use`);
        await expect(p.getByRole('dialog').first()).toBeVisible();
      },
      { fullPage: false },
    );
  });

  test('settings-automations-new', async ({ page }) => {
    const api = await setup(page);
    await signedIn(page, api);
    await capture(page, api, 'settings-automations-new', async ({ page: p }) => {
      await p.goto('/settings/automations/new');
      await expect(heading(p, /automation/i)).toBeVisible();
    });
  });

  test('settings-automation-detail', async ({ page }) => {
    const api = await setup(page);
    await signedIn(page, api);
    const first = AUTOMATIONS.items[0]!;
    api.on('GET', new RegExp(`/api/automations/${first.id}$`), {
      json: { ...first, last_run: null },
    });
    api.on('GET', new RegExp(`/api/automations/${first.id}/runs`), {
      json: {
        items: [
          {
            id: '00000000-0000-4000-8000-0000000000c1',
            automation_id: first.id,
            envelope_id: ENV_SEALED,
            trigger: 'envelope_sealed',
            action: 'webhook',
            status: 'done',
            status_word: 'Done',
            attempts: 1,
            failure_slug: null,
            failure_message: null,
            response_status: 200,
            retry_allowed: false,
            created_at: iso(1, 10),
            finished_at: iso(1, 10),
          },
          {
            id: '00000000-0000-4000-8000-0000000000c2',
            automation_id: first.id,
            envelope_id: ENV_SEALED,
            trigger: 'envelope_sealed',
            action: 'webhook',
            status: 'failed',
            status_word: 'Failed',
            attempts: 8,
            failure_slug: 'attempts_exhausted',
            failure_message:
              'Seald tried several times and the destination kept failing. Retry is safe.',
            response_status: 503,
            retry_allowed: true,
            created_at: iso(3, 10),
            finished_at: iso(3, 11),
          },
        ],
        next_cursor: null,
      },
    });
    await capture(page, api, 'settings-automation-detail', async ({ page: p }) => {
      await p.goto(`/settings/automations/${first.id}`);
      await expect(p.getByText('Send a webhook when sealed').first()).toBeVisible();
    });
  });
});
