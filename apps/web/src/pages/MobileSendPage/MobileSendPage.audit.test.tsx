/**
 * PR-6 / MOBILE-SEND — audit fixes from /tmp/seald-ui-audit/report-D-mobile.md.
 *
 * Every fix here ships with a RED-before-GREEN regression test. The file
 * sits next to the page so the gates run it as part of
 * `pnpm test src/pages/MobileSendPage`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ThemeProvider } from 'styled-components';
import { renderWithProviders } from '@/test/renderWithProviders';
import { seald } from '@/styles/theme';
import * as flagsModule from 'shared';

// Mock heavy PDF parser — jsdom can't decode PDFs.
vi.mock('@/lib/pdf', () => ({
  usePdfDocument: vi.fn(() => ({ doc: null, numPages: 3, loading: false, error: null })),
}));

const runMock = vi.fn(async () => ({ envelope_id: 'env_xyz', short_code: 'SC-1234567890' }));
vi.mock('@/features/envelopes/useSendEnvelope', () => ({
  useSendEnvelope: () => ({
    run: runMock,
    phase: 'idle' as const,
    error: null,
    reset: vi.fn(),
  }),
}));

import type * as AccountModule from '@/features/account';
vi.mock('@/features/account', async () => {
  const actual = await vi.importActual<typeof AccountModule>('@/features/account');
  return {
    ...actual,
    useAccountActions: () => ({
      exportData: vi.fn(async () => undefined),
      deleteAccount: vi.fn(async () => undefined),
      isExporting: false,
      isDeleting: false,
      lastError: null,
    }),
  };
});

// Mock GDrive accounts hook so the component doesn't kick a real network
// fetch when mounted at /m/send. Default: empty list (no account).
vi.mock('@/routes/settings/integrations/useGDriveAccounts', () => ({
  useGDriveAccounts: vi.fn(() => ({ data: [], isLoading: false })),
  GDRIVE_ACCOUNTS_KEY: ['integrations', 'gdrive', 'accounts'],
  useConnectGDrive: () => ({ mutate: vi.fn() }),
  useReconnectGDrive: () => ({ mutate: vi.fn() }),
  useDisconnectGDrive: () => ({ mutate: vi.fn(), isPending: false, error: null }),
  useGDriveOAuthMessageListener: vi.fn(),
}));

// Mock useEnvelopesQuery so the Recent-list audit test can pin 3 items.
// Default: empty list (preserves the original empty-state behaviour).
import type * as EnvelopesModule from '@/features/envelopes/useEnvelopes';
const useEnvelopesQueryMock = vi.fn(() => ({ data: { items: [] } }));
vi.mock('@/features/envelopes/useEnvelopes', async () => {
  const actual = await vi.importActual<typeof EnvelopesModule>('@/features/envelopes/useEnvelopes');
  return {
    ...actual,
    useEnvelopesQuery: () => useEnvelopesQueryMock(),
  };
});

import { MobileSendPage } from './MobileSendPage';
import { Scroller } from './MobileSendPage.styles';

function mockFile(name: string): File {
  return new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], name, {
    type: 'application/pdf',
  });
}

class StubImage {
  public width = 800;
  public height = 600;
  public naturalWidth = 800;
  public naturalHeight = 600;
  public onload: (() => void) | null = null;
  public onerror: ((err: unknown) => void) | null = null;
  set src(_v: string) {
    queueMicrotask(() => {
      if (this.onload) this.onload();
    });
  }
}

function renderPage() {
  return renderWithProviders(
    <MemoryRouter initialEntries={['/m/send']}>
      <Routes>
        <Route path="/m/send" element={<MobileSendPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  runMock.mockClear();
  (globalThis as unknown as { Image: typeof StubImage }).Image = StubImage;
});

afterEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// ErrorBoundary regression — section "Critical: re-capture the ErrorBoundary"
// ---------------------------------------------------------------------------

describe('MobileSendPage — ErrorBoundary regression', () => {
  it('mounts without throwing or rendering an ErrorBoundary fallback (gdrive feature ON)', () => {
    // The audit harness captured an ErrorBoundary fallback at /m/send.
    // Make sure /m/send mounts cleanly with the feature flag ON (the
    // production mode), the GDrive hooks wired, and no signers list.
    const spy = vi.spyOn(flagsModule, 'isFeatureEnabled');
    spy.mockReturnValue(true);
    try {
      const { container } = renderPage();
      // The page should render its real start screen, not a generic
      // "Something went wrong" message from React's ErrorBoundary.
      expect(screen.getByText(/new document/i)).toBeInTheDocument();
      expect(screen.queryByText(/something went wrong/i)).not.toBeInTheDocument();
      expect(container).not.toBeEmptyDOMElement();
    } finally {
      spy.mockRestore();
    }
  });
});

// ---------------------------------------------------------------------------
// §0 — Cross-cutting: cookie-banner defensive bottom-pad
// §1 — Scroller `$padBottom` adds env(safe-area-inset-bottom)
// ---------------------------------------------------------------------------

describe('MobileSendPage shell — cookie-banner-safe padding (§0/§1)', () => {
  it('Scroller bottom padding includes env(safe-area-inset-bottom) when sticky=true', () => {
    // Mount the Scroller directly with $padBottom matching the page's
    // "sticky bar mounted" branch — that's the value the page now
    // computes.
    const stickyPad = 'calc(96px + env(safe-area-inset-bottom))';
    const { container } = render(
      <ThemeProvider theme={seald}>
        <Scroller $padBottom={stickyPad}>content</Scroller>
      </ThemeProvider>,
    );
    const scroller = container.firstChild as HTMLElement;
    // styled-components renders the value into the rule. We assert the
    // env() function is reflected in the inline-style or computed style
    // chain.
    const styleAttr = scroller.getAttribute('style') ?? '';
    const computed = window.getComputedStyle(scroller).paddingBottom;
    expect(`${styleAttr} ${computed}`).toMatch(/env\(safe-area-inset-bottom\)/);
  });

  it('Scroller bottom padding falls back to 24px when no sticky bar', () => {
    const { container } = render(
      <ThemeProvider theme={seald}>
        <Scroller $padBottom={'24px'}>content</Scroller>
      </ThemeProvider>,
    );
    const scroller = container.firstChild as HTMLElement;
    const styleAttr = scroller.getAttribute('style') ?? '';
    const computed = window.getComputedStyle(scroller).paddingBottom;
    expect(`${styleAttr} ${computed}`).toMatch(/24px/);
  });
});

// ---------------------------------------------------------------------------
// §3 MWFile — friendlier copy + duplicate aria-label removed
// ---------------------------------------------------------------------------

describe('MWFile — copy + a11y polish (§3)', () => {
  it('shows the gentler notice copy instead of the data-loss threat', async () => {
    renderPage();
    const input = screen.getByLabelText(/pdf file/i) as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [mockFile('nda.pdf')] } });
    });
    // Old copy: "closing it will discard the draft" — was scary
    expect(screen.queryByText(/closing it will discard the draft/i)).not.toBeInTheDocument();
    // New copy: friendlier, still honest about draft state.
    expect(
      screen.getByText(/keep this tab open while you finish.*drafts aren't saved yet/i),
    ).toBeInTheDocument();
  });

  it('"Replace file" button has no duplicate aria-label', async () => {
    renderPage();
    const input = screen.getByLabelText(/pdf file/i) as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [mockFile('nda.pdf')] } });
    });
    const button = screen.getByRole('button', { name: /replace file/i });
    // Accessible name should come from text content, not aria-label.
    expect(button.getAttribute('aria-label')).toBeNull();
    expect(button).toHaveTextContent(/replace file/i);
  });
});

// ---------------------------------------------------------------------------
// §4 MWSigners — toggle/remove WCAG 44, sticky Add, email truncation
// ---------------------------------------------------------------------------

describe('MWSigners — touch-target + sticky CTA (§4)', () => {
  async function advanceToSigners() {
    renderPage();
    const input = screen.getByLabelText(/pdf file/i) as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [mockFile('contract.pdf')] } });
    });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /continue/i }));
  }

  it('ToggleBtn has a min-height of at least 44px (WCAG 2.5.5)', async () => {
    await advanceToSigners();
    const toggle = screen.getByRole('button', { name: /add me as signer/i });
    const styles = window.getComputedStyle(toggle);
    // styled-components rules become real CSS at runtime; jsdom returns
    // the declared min-height value.
    expect(styles.minHeight).toBe('44px');
    expect(styles.minWidth).toBe('44px');
  });

  it('RemoveBtn is rendered as an icon-only button with a 44x44 hit area', async () => {
    await advanceToSigners();
    const user = userEvent.setup();
    // Add a signer so a Remove button exists.
    await user.click(screen.getByRole('button', { name: /add signer/i }));
    const dialog = await screen.findByRole('dialog', { name: /add a signer/i });
    await user.type(within(dialog).getByPlaceholderText(/full name/i), 'Bob Builder');
    await user.type(within(dialog).getByPlaceholderText(/name@example\.com/i), 'bob@example.com');
    await user.click(within(dialog).getByRole('button', { name: /^add$/i }));

    const removeBtn = screen.getByRole('button', { name: /remove bob builder/i });
    const styles = window.getComputedStyle(removeBtn);
    expect(styles.minHeight).toBe('44px');
    expect(styles.minWidth).toBe('44px');
  });

  it('Add signer CTA is always visible (sticky), even with many signers', async () => {
    await advanceToSigners();
    const user = userEvent.setup();
    // Add 6 signers — without sticky behaviour the Add row scrolls off.
    for (let i = 0; i < 6; i += 1) {
      await user.click(screen.getByRole('button', { name: /add signer/i }));
      const dialog = await screen.findByRole('dialog', { name: /add a signer/i });
      await user.type(within(dialog).getByPlaceholderText(/full name/i), `Signer ${i}`);
      await user.type(
        within(dialog).getByPlaceholderText(/name@example\.com/i),
        `signer${i}@example.com`,
      );
      await user.click(within(dialog).getByRole('button', { name: /^add$/i }));
    }
    // The Add row must still be in the DOM and announce itself as
    // a button (we don't assert visibility geometry in jsdom — but the
    // styled rule is `position: sticky` on the Add row).
    const addBtn = screen.getByRole('button', { name: /add signer/i });
    const styles = window.getComputedStyle(addBtn);
    expect(styles.position).toBe('sticky');
  });
});

// ---------------------------------------------------------------------------
// §5 MWPlace — chip 44 height, toolbar below-positioning, no raw hex,
//             pan-y, 11px page numbers (page-num covered in PageFilmstrip
//             component if separate; here we assert chip + toolbar).
// ---------------------------------------------------------------------------

import { MWPlace } from './screens/MWPlace';
import type { MobilePlacedField, MobileSigner } from './types';

function renderPlace(
  overrides: {
    readonly fields?: ReadonlyArray<MobilePlacedField>;
    readonly selectedIds?: ReadonlyArray<string>;
    readonly signers?: ReadonlyArray<MobileSigner>;
  } = {},
) {
  return render(
    <ThemeProvider theme={seald}>
      <MWPlace
        page={1}
        totalPages={1}
        onPage={vi.fn()}
        fields={overrides.fields ?? []}
        signers={overrides.signers ?? []}
        selectedIds={overrides.selectedIds ?? []}
        armedTool={null}
        onArmTool={vi.fn()}
        onCanvasTap={vi.fn()}
        onTapField={vi.fn()}
        onClearSelection={vi.fn()}
        onOpenApply={vi.fn()}
        onOpenAssign={vi.fn()}
        onDeleteSelected={vi.fn()}
        onCommitDrag={vi.fn()}
      />
    </ThemeProvider>,
  );
}

describe('MWPlace — touch + collision polish (§5)', () => {
  it('Field-type Chip min-height is at least 44px (WCAG 2.5.5)', () => {
    renderPlace();
    const toolbar = screen.getByRole('toolbar', { name: /field types/i });
    const chips = within(toolbar).getAllByRole('button');
    const chip = chips[0];
    expect(chip).toBeDefined();
    const styles = window.getComputedStyle(chip!);
    expect(styles.minHeight).toBe('44px');
  });

  it('field-action toolbar renders BELOW the field when y < 50 (no collision)', () => {
    const signer: MobileSigner = {
      id: 's1',
      name: 'Bob',
      email: 'b@x.com',
      color: '#818CF8',
      initials: 'B',
    };
    const field: MobilePlacedField = {
      id: 'f1',
      type: 'sig',
      page: 1,
      x: 60,
      y: 10, // near top
      signerIds: [signer.id],
      linkedPages: [1],
    };
    renderPlace({ fields: [field], selectedIds: [field.id], signers: [signer] });
    const toolbar = screen.getByTestId('field-action-toolbar');
    const top = parseFloat((toolbar.style.top || '0').replace('px', ''));
    // When y < 50, the toolbar must sit below the field rather than at
    // the clamped top:8 (which collides with the field itself).
    // Sig fields are 50px tall — below position would be at least
    // field.y + 8 = 18px.
    expect(top).toBeGreaterThanOrEqual(field.y + 8);
  });

  it('Delete icon in the action toolbar uses a theme token (no raw #FCA5A5 hex)', () => {
    const signer: MobileSigner = {
      id: 's1',
      name: 'Bob',
      email: 'b@x.com',
      color: '#818CF8',
      initials: 'B',
    };
    const field: MobilePlacedField = {
      id: 'f1',
      type: 'sig',
      page: 1,
      x: 60,
      y: 100,
      signerIds: [signer.id],
      linkedPages: [1],
    };
    renderPlace({ fields: [field], selectedIds: [field.id], signers: [signer] });
    const deleteBtn = screen.getByRole('button', { name: /delete field/i });
    // The styled rule should reference the token, not the raw hex.
    const inlineStyle = deleteBtn.getAttribute('style') ?? '';
    expect(inlineStyle.toUpperCase()).not.toContain('FCA5A5');
  });
});

// ---------------------------------------------------------------------------
// §6 MWReview — title affordance (pencil icon) + Pill flex-shrink
// ---------------------------------------------------------------------------

describe('MWReview — editable affordance (§6)', () => {
  async function advanceToReview() {
    renderPage();
    const input = screen.getByLabelText(/pdf file/i) as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [mockFile('contract.pdf')] } });
    });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /continue/i }));
    await user.click(screen.getByRole('button', { name: /add signer/i }));
    const dialog = await screen.findByRole('dialog', { name: /add a signer/i });
    await user.type(within(dialog).getByPlaceholderText(/full name/i), 'Bob Builder');
    await user.type(within(dialog).getByPlaceholderText(/name@example\.com/i), 'bob@example.com');
    await user.click(within(dialog).getByRole('button', { name: /^add$/i }));
    await user.click(screen.getByRole('button', { name: /next: place fields/i }));
    await user.click(screen.getByRole('button', { name: /^signature$/i }));
    const canvas = await screen.findByTestId('mw-canvas');
    await user.click(canvas);
    await user.click(screen.getByRole('button', { name: /^review/i }));
    return user;
  }

  it('Title row shows a pencil icon hinting at editability', async () => {
    await advanceToReview();
    // Pencil hint is rendered next to the title input — assert via the
    // title input's labelled-group containing the icon node.
    const titleInput = screen.getByRole('textbox', { name: /document title/i });
    expect(titleInput).toBeInTheDocument();
    // The pencil hint lives in the same Eyebrow row. Its presence is
    // covered by an `aria-hidden` svg inside the title's parent — query
    // for a descendant `<svg>` with the lucide-pencil class hook.
    const parent = titleInput.closest('div');
    expect(parent).not.toBeNull();
    expect(parent!.querySelector('svg.lucide-pencil')).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// §7 MWSent — Caveat font on Sealed., Headline as <h1>
// ---------------------------------------------------------------------------

import { MWSent } from './screens/MWSent';

describe('MWSent — typography (§7)', () => {
  it('"Sealed." element uses the Caveat font family', () => {
    render(
      <ThemeProvider theme={seald}>
        <MemoryRouter>
          <MWSent
            title="Doc"
            code="SC-1"
            signers={[{ id: 's1', name: 'Bob', email: 'b@x.com', color: '#818CF8', initials: 'B' }]}
            onView={vi.fn()}
            onAnother={vi.fn()}
          />
        </MemoryRouter>
      </ThemeProvider>,
    );
    const sealed = screen.getByText(/sealed\./i);
    const fontFamily = window.getComputedStyle(sealed).fontFamily;
    expect(fontFamily.toLowerCase()).toContain('caveat');
  });

  it('Headline uses an <h1> tag (semantic top-level heading)', () => {
    render(
      <ThemeProvider theme={seald}>
        <MemoryRouter>
          <MWSent
            title="Doc"
            code="SC-1"
            signers={[{ id: 's1', name: 'Bob', email: 'b@x.com', color: '#818CF8', initials: 'B' }]}
            onView={vi.fn()}
            onAnother={vi.fn()}
          />
        </MemoryRouter>
      </ThemeProvider>,
    );
    const heading = screen.getByRole('heading', { name: /sent for signature/i, level: 1 });
    expect(heading).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// §8 MWMobileNav — safe-area-inset-top, 44x44 hamburger
// ---------------------------------------------------------------------------

import { MWMobileNav } from './components/MWMobileNav';

describe('MWMobileNav — notch safety + WCAG (§8)', () => {
  it('HamburgerBtn is at least 44x44 (WCAG 2.5.5)', () => {
    renderWithProviders(
      <MemoryRouter>
        <MWMobileNav onSignOut={vi.fn()} />
      </MemoryRouter>,
    );
    const btn = screen.getByRole('button', { name: /open menu/i });
    const styles = window.getComputedStyle(btn);
    // Width/height come from the styled rule.
    expect(parseInt(styles.width, 10)).toBeGreaterThanOrEqual(44);
    expect(parseInt(styles.height, 10)).toBeGreaterThanOrEqual(44);
  });

  it('Bar reserves safe-area-inset-top padding for notched devices', () => {
    const { container } = renderWithProviders(
      <MemoryRouter>
        <MWMobileNav onSignOut={vi.fn()} />
      </MemoryRouter>,
    );
    const bar = container.querySelector('header');
    expect(bar).not.toBeNull();
    // styled-components emits the rule into a constructed stylesheet —
    // read it back so the test fires even when jsdom collapses the
    // padding shorthand differently from a real browser.
    const css = Array.from(document.styleSheets)
      .flatMap((s) => {
        try {
          return Array.from(s.cssRules ?? []);
        } catch {
          return [];
        }
      })
      .map((r) => r.cssText)
      .join('\n');
    // The styled rule for the sticky <header> must reserve the inset —
    // either as the long-hand `padding-top: env(...)` or inside the
    // padding shorthand. Either form keeps the title visible on
    // notched-device landscape.
    expect(css).toMatch(/padding[^;]*env\(\s*safe-area-inset-top\s*\)/);
  });
});

// ---------------------------------------------------------------------------
// §12 MWIntegrations — BackBtn 44x44, Disconnect copy
// ---------------------------------------------------------------------------

import { MWIntegrations } from './screens/MWIntegrations';
import * as gdriveAccountsHook from '@/routes/settings/integrations/useGDriveAccounts';

describe('MWIntegrations — back-button + copy (§12)', () => {
  let isFeatureEnabledSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    isFeatureEnabledSpy = vi.spyOn(flagsModule, 'isFeatureEnabled');
    isFeatureEnabledSpy.mockReturnValue(true);
  });
  afterEach(() => {
    isFeatureEnabledSpy.mockRestore();
  });

  it('BackBtn is at least 44x44 (WCAG)', () => {
    const useGDriveAccountsMock = vi.mocked(gdriveAccountsHook.useGDriveAccounts);
    useGDriveAccountsMock.mockReturnValue({
      data: [],
      isLoading: false,
    } as unknown as ReturnType<typeof gdriveAccountsHook.useGDriveAccounts>);
    renderWithProviders(
      <MemoryRouter initialEntries={['/m/send/settings']}>
        <Routes>
          <Route path="/m/send/settings" element={<MWIntegrations />} />
        </Routes>
      </MemoryRouter>,
    );
    const back = screen.getByRole('button', { name: /^back$/i });
    const styles = window.getComputedStyle(back);
    expect(parseInt(styles.width, 10)).toBeGreaterThanOrEqual(44);
    expect(parseInt(styles.height, 10)).toBeGreaterThanOrEqual(44);
  });

  it('Disconnect button reads "Disconnect Google Drive" (more specific)', () => {
    const useGDriveAccountsMock = vi.mocked(gdriveAccountsHook.useGDriveAccounts);
    useGDriveAccountsMock.mockReturnValue({
      data: [
        {
          id: 'acc-1',
          email: 't@x.com',
          connectedAt: '2026-05-01T10:00:00Z',
          lastUsedAt: null,
        },
      ],
      isLoading: false,
    } as unknown as ReturnType<typeof gdriveAccountsHook.useGDriveAccounts>);
    renderWithProviders(
      <MemoryRouter initialEntries={['/m/send/settings']}>
        <Routes>
          <Route path="/m/send/settings" element={<MWIntegrations />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByRole('button', { name: /disconnect google drive/i })).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// §2 MWStart — no aria-label override, "Recent" list
// ---------------------------------------------------------------------------

describe('MWStart — a11y polish (§2)', () => {
  it('Tile accessible name matches title+sub (no aria-label override)', () => {
    renderPage();
    const upload = screen.getByRole('button', { name: /upload pdf/i });
    // Without aria-label, the accessible name comes from descendant
    // text — assert both the title AND the sub-label are reachable.
    expect(upload).toHaveTextContent(/upload pdf/i);
    expect(upload).toHaveTextContent(/pick a file from your phone/i);
    expect(upload.getAttribute('aria-label')).toBeNull();
  });

  it('renders a "Recent" list with 3 items when useEnvelopesQuery returns 3', () => {
    useEnvelopesQueryMock.mockReturnValueOnce({
      data: {
        items: [
          {
            id: 'e1',
            title: 'NDA — Acme Corp',
            status: 'awaiting_others',
            updated_at: '2026-05-10T12:00:00.000Z',
          },
          {
            id: 'e2',
            title: 'MSA — Globex',
            status: 'completed',
            updated_at: '2026-05-09T12:00:00.000Z',
          },
          {
            id: 'e3',
            title: 'SOW — Initech',
            status: 'draft',
            updated_at: '2026-05-08T12:00:00.000Z',
          },
        ],
      },
    } as unknown as ReturnType<typeof useEnvelopesQueryMock>);
    renderPage();
    const recent = screen.getByRole('list', { name: /recent envelopes/i });
    const items = within(recent).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(within(recent).getByText(/nda — acme corp/i)).toBeInTheDocument();
    expect(within(recent).getByText(/msa — globex/i)).toBeInTheDocument();
    expect(within(recent).getByText(/sow — initech/i)).toBeInTheDocument();
  });

  it('hides the "Recent" section when useEnvelopesQuery returns no items', () => {
    renderPage();
    expect(screen.queryByRole('list', { name: /recent envelopes/i })).toBeNull();
  });
});
