import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { SignMeField } from '@/features/signing';

// Mock react-router-dom to avoid pulling in the full router context.
const navigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => navigate,
}));

// Build a SignMeField fixture with sensible defaults; tests override
// `id`, `page`, `kind`, and the value fields.
function makeField(
  partial: Partial<SignMeField> & Pick<SignMeField, 'id' | 'page' | 'kind'>,
): SignMeField {
  return {
    signer_id: 'me',
    x: 0.1,
    y: 0.1,
    required: true,
    ...partial,
  } as SignMeField;
}

// Mutable session double — each test sets `fields` before rendering
// the hook. `fillField` / `setSignature` flip the matching field's
// `value_text` / `value_boolean` on the mutable array so the
// auto-advance helper can find the next unfilled required field.
const session: {
  fields: SignMeField[];
  nextField: SignMeField | null;
  fillField: ReturnType<typeof vi.fn>;
  setSignature: ReturnType<typeof vi.fn>;
  decline: ReturnType<typeof vi.fn>;
  withdrawConsent: ReturnType<typeof vi.fn>;
} = {
  fields: [],
  nextField: null,
  fillField: vi.fn(),
  setSignature: vi.fn(),
  decline: vi.fn(),
  withdrawConsent: vi.fn(),
};
vi.mock('@/features/signing', async () => {
  const actual = (await vi.importActual('@/features/signing')) as Record<string, unknown>;
  return {
    ...actual,
    useSigningSession: () => session,
  };
});

// Track scrollIntoView calls per page selector so we can assert which
// field the controller advanced to.
const scrolledPages: number[] = [];
beforeEach(() => {
  scrolledPages.length = 0;
  navigate.mockReset();
  session.fields = [];
  session.nextField = null;
  session.fillField = vi.fn(
    async (id: string, value: { value_text?: string; value_boolean?: boolean }) => {
      const f = session.fields.find((x) => x.id === id);
      if (!f) return;
      const mutable = f as { value_text: string | null; value_boolean: boolean | null };
      if ('value_text' in value) mutable.value_text = value.value_text ?? null;
      if ('value_boolean' in value) mutable.value_boolean = value.value_boolean ?? null;
    },
  );
  session.setSignature = vi.fn(async (id: string) => {
    const f = session.fields.find((x) => x.id === id);
    if (f) (f as { value_text: string | null }).value_text = 'data:image/png;base64,xxx';
  });
  session.decline = vi.fn(async () => {});
  session.withdrawConsent = vi.fn(async () => {});

  // jsdom's querySelector finds nothing because we don't render the
  // PDF page nodes in this hook-only test. Stub it to return a fake
  // element whose scrollIntoView records the page being advanced to.
  const realQS = document.querySelector.bind(document);
  vi.spyOn(document, 'querySelector').mockImplementation((selector: string) => {
    const m = /\[data-r-page="(\d+)"\]/.exec(selector);
    if (m) {
      const page = Number(m[1]);
      return {
        scrollIntoView: () => {
          scrolledPages.push(page);
        },
      } as unknown as Element;
    }
    return realQS(selector);
  });
});

/* eslint-disable import/first -- we mock react-router-dom + @/features/signing
   above and only then import the SUT, mirroring the existing pattern. */
import {
  useSigningFillController,
  toUiKind,
  fieldIsFilled,
  fieldValue,
  fieldLabel,
} from './useSigningFillController';

describe('useSigningFillController auto-advance', () => {
  it('advances to the next required unfilled field after a text apply', async () => {
    session.fields = [
      makeField({ id: 'f1', page: 1, kind: 'text' }),
      makeField({ id: 'f2', page: 3, kind: 'signature' }),
    ];

    const { result } = renderHook(() => useSigningFillController({ envelopeId: 'env-1' }));

    // Open the text drawer for f1, then apply a value.
    await act(async () => {
      await result.current.handleFieldClick(session.fields[0]!);
    });
    expect(result.current.textDrawer?.field.id).toBe('f1');

    await act(async () => {
      await result.current.handleTextApply('hello');
    });

    // After the fill resolves the controller should have scrolled to
    // f2 (the next required unfilled field).
    await waitFor(() => {
      expect(scrolledPages).toContain(3);
    });
    expect(result.current.activeFieldId).toBe('f2');
  });

  it('advances after toggling a checkbox to filled, but not when un-toggling', async () => {
    session.fields = [
      makeField({ id: 'cb', page: 1, kind: 'checkbox', value_boolean: false }),
      makeField({ id: 'sig', page: 2, kind: 'signature' }),
    ];

    const { result } = renderHook(() => useSigningFillController({ envelopeId: 'env-1' }));

    await act(async () => {
      await result.current.handleFieldClick(session.fields[0]!);
    });
    await waitFor(() => {
      expect(scrolledPages).toContain(2);
    });

    // Now un-toggle the checkbox (it's filled in the mutable session).
    scrolledPages.length = 0;
    await act(async () => {
      await result.current.handleFieldClick(session.fields[0]!);
    });
    expect(scrolledPages).toEqual([]);
  });

  it('advances after a remembered-signature apply via field click', async () => {
    session.fields = [
      makeField({ id: 's1', page: 1, kind: 'signature' }),
      makeField({ id: 's2', page: 4, kind: 'signature' }),
    ];

    const { result } = renderHook(() => useSigningFillController({ envelopeId: 'env-1' }));

    // First click opens the drawer (no remembered signature yet).
    await act(async () => {
      await result.current.handleFieldClick(session.fields[0]!);
    });
    expect(result.current.sigDrawer?.field.id).toBe('s1');

    // Apply via the drawer to seed the remembered slot AND fill s1.
    await act(async () => {
      await result.current.handleSignatureApply({
        blob: new Blob(['png'], { type: 'image/png' }),
        format: 'drawn',
      });
    });

    // After s1 is filled the helper advances to s2.
    await waitFor(() => {
      expect(scrolledPages).toContain(4);
    });
  });

  it('does not advance when the apply throws', async () => {
    session.fields = [
      makeField({ id: 'f1', page: 1, kind: 'text' }),
      makeField({ id: 'f2', page: 2, kind: 'text' }),
    ];
    session.fillField = vi.fn(async () => {
      throw Object.assign(new Error('boom'), { status: 500 });
    });

    const { result } = renderHook(() => useSigningFillController({ envelopeId: 'env-1' }));

    await act(async () => {
      await result.current.handleFieldClick(session.fields[0]!);
    });
    await act(async () => {
      await result.current.handleTextApply('value');
    });

    expect(scrolledPages).toEqual([]);
    expect(result.current.error).toMatch(/boom|could not save/i);
  });
});

describe('useSigningFillController — drawers + navigation', () => {
  it('clicking a text field opens the text drawer with the matching field', async () => {
    session.fields = [makeField({ id: 't1', page: 1, kind: 'text' })];
    const { result } = renderHook(() => useSigningFillController({ envelopeId: 'env-1' }));
    await act(async () => {
      await result.current.handleFieldClick(session.fields[0]!);
    });
    expect(result.current.textDrawer?.field.id).toBe('t1');
    expect(result.current.textDrawer?.kind).toBe('text');
    // closeTextDrawer dismisses it (covers the closer used by Esc/cancel).
    act(() => result.current.closeTextDrawer());
    expect(result.current.textDrawer).toBeNull();
  });

  it('clicking a name-tagged text field opens the drawer with kind="name"', async () => {
    session.fields = [makeField({ id: 'n1', page: 1, kind: 'text', link_id: 'name' })];
    const { result } = renderHook(() => useSigningFillController({ envelopeId: 'env-1' }));
    await act(async () => {
      await result.current.handleFieldClick(session.fields[0]!);
    });
    expect(result.current.textDrawer?.kind).toBe('name');
  });

  it('clicking a signature field with no remembered mark opens the signature drawer', async () => {
    session.fields = [makeField({ id: 's1', page: 1, kind: 'signature' })];
    const { result } = renderHook(() => useSigningFillController({ envelopeId: 'env-1' }));
    await act(async () => {
      await result.current.handleFieldClick(session.fields[0]!);
    });
    expect(result.current.sigDrawer?.field.id).toBe('s1');
    expect(result.current.sigDrawer?.kind).toBe('signature');
    act(() => result.current.closeSigDrawer());
    expect(result.current.sigDrawer).toBeNull();
  });

  it('handleNext scrolls to nextField and sets activeFieldId; no-op when nextField is null', () => {
    const target = makeField({ id: 'next', page: 7, kind: 'text' });
    session.fields = [target];
    session.nextField = target;
    const { result } = renderHook(() => useSigningFillController({ envelopeId: 'env-1' }));
    act(() => result.current.handleNext());
    expect(scrolledPages).toContain(7);
    expect(result.current.activeFieldId).toBe('next');

    // Now wipe nextField — handleNext should bail without scrolling.
    scrolledPages.length = 0;
    session.nextField = null;
    const { result: r2 } = renderHook(() => useSigningFillController({ envelopeId: 'env-1' }));
    act(() => r2.current.handleNext());
    expect(scrolledPages).toEqual([]);
    expect(r2.current.activeFieldId).toBeNull();
  });

  it('handleReview navigates to /sign/:envelopeId/review', () => {
    const { result } = renderHook(() => useSigningFillController({ envelopeId: 'env-42' }));
    act(() => result.current.handleReview());
    expect(navigate).toHaveBeenCalledWith('/sign/env-42/review');
  });
});

describe('useSigningFillController — 401/410 token failures', () => {
  it('text apply that returns 401 navigates back to /sign/:envelopeId without setting an error banner', async () => {
    session.fields = [makeField({ id: 't1', page: 1, kind: 'text' })];
    session.fillField = vi.fn(async () => {
      throw Object.assign(new Error('expired'), { status: 401 });
    });
    const { result } = renderHook(() => useSigningFillController({ envelopeId: 'env-9' }));
    await act(async () => {
      await result.current.handleFieldClick(session.fields[0]!);
    });
    await act(async () => {
      await result.current.handleTextApply('x');
    });
    expect(navigate).toHaveBeenCalledWith('/sign/env-9', { replace: true });
    expect(result.current.error).toBeNull();
  });

  it('checkbox apply that returns 410 navigates back to /sign/:envelopeId', async () => {
    session.fields = [makeField({ id: 'c1', page: 1, kind: 'checkbox', value_boolean: false })];
    session.fillField = vi.fn(async () => {
      throw Object.assign(new Error('gone'), { status: 410 });
    });
    const { result } = renderHook(() => useSigningFillController({ envelopeId: 'env-9' }));
    await act(async () => {
      await result.current.handleFieldClick(session.fields[0]!);
    });
    expect(navigate).toHaveBeenCalledWith('/sign/env-9', { replace: true });
  });

  it('checkbox apply that fails with 500 surfaces an error banner and does not navigate', async () => {
    session.fields = [makeField({ id: 'c1', page: 1, kind: 'checkbox', value_boolean: false })];
    session.fillField = vi.fn(async () => {
      throw Object.assign(new Error('db down'), { status: 500 });
    });
    const { result } = renderHook(() => useSigningFillController({ envelopeId: 'env-9' }));
    await act(async () => {
      await result.current.handleFieldClick(session.fields[0]!);
    });
    expect(navigate).not.toHaveBeenCalled();
    expect(result.current.error).toMatch(/db down|could not save/i);
  });

  it('signature apply that returns 401 navigates back to /sign/:envelopeId', async () => {
    session.fields = [makeField({ id: 's1', page: 1, kind: 'signature' })];
    session.setSignature = vi.fn(async () => {
      throw Object.assign(new Error('expired'), { status: 401 });
    });
    const { result } = renderHook(() => useSigningFillController({ envelopeId: 'env-9' }));
    await act(async () => {
      await result.current.handleFieldClick(session.fields[0]!);
    });
    expect(result.current.sigDrawer?.field.id).toBe('s1');
    await act(async () => {
      await result.current.handleSignatureApply({
        blob: new Blob(['x']),
        format: 'drawn',
      });
    });
    expect(navigate).toHaveBeenCalledWith('/sign/env-9', { replace: true });
  });

  it('signature apply 413 surfaces a size-specific error message', async () => {
    session.fields = [makeField({ id: 's1', page: 1, kind: 'signature' })];
    session.setSignature = vi.fn(async () => {
      throw Object.assign(new Error('too big'), { status: 413 });
    });
    const { result } = renderHook(() => useSigningFillController({ envelopeId: 'env-9' }));
    await act(async () => {
      await result.current.handleFieldClick(session.fields[0]!);
    });
    await act(async () => {
      await result.current.handleSignatureApply({
        blob: new Blob(['x']),
        format: 'drawn',
      });
    });
    expect(result.current.error).toMatch(/too large|max 512 KB/i);
  });

  it('signature apply with no error.message uses the generic fallback', async () => {
    session.fields = [makeField({ id: 's1', page: 1, kind: 'signature' })];
    session.setSignature = vi.fn(async () => {
      // Intentionally throw an object that lacks a `message` so the
      // controller's `e.message ?? "Could not save your signature…"`
      // fallback fires.
      throw { status: 500 };
    });
    const { result } = renderHook(() => useSigningFillController({ envelopeId: 'env-9' }));
    await act(async () => {
      await result.current.handleFieldClick(session.fields[0]!);
    });
    await act(async () => {
      await result.current.handleSignatureApply({
        blob: new Blob(['x']),
        format: 'drawn',
      });
    });
    expect(result.current.error).toMatch(/could not save your signature/i);
  });

  it('remembered-signature reuse: a 401 from setSignature on a same-kind field navigates back', async () => {
    session.fields = [
      makeField({ id: 's1', page: 1, kind: 'signature' }),
      makeField({ id: 's2', page: 2, kind: 'signature' }),
    ];
    // Single mock that succeeds on the first call (so the remembered slot
    // gets seeded by handleSignatureApply) and rejects with 401 on every
    // subsequent call (the second click's remembered-reuse path). The
    // controller destructures `setSignature` at render time, so swapping
    // `session.setSignature` between awaits would not affect the captured
    // reference; this conditional preserves identity instead.
    let callIdx = 0;
    session.setSignature = vi.fn(async (id: string) => {
      callIdx += 1;
      if (callIdx === 1) {
        const f = session.fields.find((x) => x.id === id);
        if (f) (f as { value_text: string | null }).value_text = 'data:image/png;base64,xxx';
        return;
      }
      throw Object.assign(new Error('expired'), { status: 401 });
    });
    const { result } = renderHook(() => useSigningFillController({ envelopeId: 'env-9' }));
    await act(async () => {
      await result.current.handleFieldClick(session.fields[0]!);
    });
    await act(async () => {
      await result.current.handleSignatureApply({ blob: new Blob(['x']), format: 'drawn' });
    });
    navigate.mockReset();
    await act(async () => {
      await result.current.handleFieldClick(session.fields[1]!);
    });
    expect(navigate).toHaveBeenCalledWith('/sign/env-9', { replace: true });
  });

  it('remembered-signature reuse: a 500 from setSignature on a same-kind field surfaces an error', async () => {
    session.fields = [
      makeField({ id: 's1', page: 1, kind: 'signature' }),
      makeField({ id: 's2', page: 2, kind: 'signature' }),
    ];
    let callIdx = 0;
    session.setSignature = vi.fn(async (id: string) => {
      callIdx += 1;
      if (callIdx === 1) {
        const f = session.fields.find((x) => x.id === id);
        if (f) (f as { value_text: string | null }).value_text = 'data:image/png;base64,xxx';
        return;
      }
      throw Object.assign(new Error('upstream'), { status: 500 });
    });
    const { result } = renderHook(() => useSigningFillController({ envelopeId: 'env-9' }));
    await act(async () => {
      await result.current.handleFieldClick(session.fields[0]!);
    });
    await act(async () => {
      await result.current.handleSignatureApply({ blob: new Blob(['x']), format: 'drawn' });
    });
    await act(async () => {
      await result.current.handleFieldClick(session.fields[1]!);
    });
    expect(result.current.error).toMatch(/upstream|could not apply your signature/i);
  });

  it('remembered-initials auto-apply sends kind="initials" so it does not overwrite the signature path', async () => {
    // Scenario: 1 signature field + 2 initials fields (duplicated across pages).
    // The signer draws signature, then draws initials. The 2nd initials field
    // auto-applies the remembered initials — it MUST send kind='initials' so
    // the backend writes to the initials storage path, not the signature path.
    session.fields = [
      makeField({ id: 'sig1', page: 1, kind: 'signature' }),
      makeField({ id: 'ini1', page: 1, kind: 'initials' }),
      makeField({ id: 'ini2', page: 2, kind: 'initials' }),
    ];

    const calls: Array<{ id: string; input: Record<string, unknown> }> = [];
    session.setSignature = vi.fn(async (id: string, input: Record<string, unknown>) => {
      calls.push({ id, input });
      const f = session.fields.find((x) => x.id === id);
      if (f) (f as { value_text: string | null }).value_text = 'data:image/png;base64,xxx';
    });

    const { result } = renderHook(() => useSigningFillController({ envelopeId: 'env-dup' }));

    // 1. Click sig1 → opens sig drawer (no remembered signature)
    await act(async () => {
      await result.current.handleFieldClick(session.fields[0]!);
    });
    expect(result.current.sigDrawer?.kind).toBe('signature');

    // Apply signature via drawer
    await act(async () => {
      await result.current.handleSignatureApply({
        blob: new Blob(['sig-png'], { type: 'image/png' }),
        format: 'drawn',
      });
    });

    // 2. Click ini1 → opens sig drawer for initials (no remembered initials)
    await act(async () => {
      await result.current.handleFieldClick(session.fields[1]!);
    });
    expect(result.current.sigDrawer?.kind).toBe('initials');

    // Apply initials via drawer
    await act(async () => {
      await result.current.handleSignatureApply({
        blob: new Blob(['ini-png'], { type: 'image/png' }),
        format: 'typed',
        font: 'DancingScript',
      });
    });

    // 3. Click ini2 → should AUTO-apply remembered initials (no drawer)
    await act(async () => {
      await result.current.handleFieldClick(session.fields[2]!);
    });
    // The drawer should NOT have opened because the remembered slot is populated
    expect(result.current.sigDrawer).toBeNull();

    // Verify the auto-apply call passed kind='initials'
    const autoApplyCall = calls.find((c) => c.id === 'ini2');
    expect(autoApplyCall).toBeDefined();
    expect(autoApplyCall!.input).toHaveProperty('kind', 'initials');

    // Also verify the explicit drawer calls passed correct kinds
    const sigCall = calls.find((c) => c.id === 'sig1');
    expect(sigCall!.input).toHaveProperty('kind', 'signature');
    const iniCall = calls.find((c) => c.id === 'ini1');
    expect(iniCall!.input).toHaveProperty('kind', 'initials');
  });

  it('remembered-signature auto-apply sends kind="signature" for the 2nd signature field', async () => {
    session.fields = [
      makeField({ id: 'sig1', page: 1, kind: 'signature' }),
      makeField({ id: 'sig2', page: 2, kind: 'signature' }),
    ];

    const calls: Array<{ id: string; input: Record<string, unknown> }> = [];
    session.setSignature = vi.fn(async (id: string, input: Record<string, unknown>) => {
      calls.push({ id, input });
      const f = session.fields.find((x) => x.id === id);
      if (f) (f as { value_text: string | null }).value_text = 'data:image/png;base64,xxx';
    });

    const { result } = renderHook(() => useSigningFillController({ envelopeId: 'env-dup2' }));

    // Draw signature on first field via drawer
    await act(async () => {
      await result.current.handleFieldClick(session.fields[0]!);
    });
    await act(async () => {
      await result.current.handleSignatureApply({
        blob: new Blob(['sig-png'], { type: 'image/png' }),
        format: 'drawn',
      });
    });

    // Click second signature field — auto-applies
    await act(async () => {
      await result.current.handleFieldClick(session.fields[1]!);
    });

    const autoCall = calls.find((c) => c.id === 'sig2');
    expect(autoCall).toBeDefined();
    expect(autoCall!.input).toHaveProperty('kind', 'signature');
  });
});

describe('useSigningFillController — decline + withdraw consent', () => {
  it('decline: cancelled confirm is a no-op', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { result } = renderHook(() => useSigningFillController({ envelopeId: 'env-9' }));
    await act(async () => {
      await result.current.handleDecline();
    });
    expect(session.decline).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('decline: confirmed call POSTs decline + navigates to /declined', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { result } = renderHook(() => useSigningFillController({ envelopeId: 'env-9' }));
    await act(async () => {
      await result.current.handleDecline();
    });
    expect(session.decline).toHaveBeenCalledWith('declined-on-fill');
    expect(navigate).toHaveBeenCalledWith('/sign/env-9/declined', { replace: true });
  });

  it('decline: API failure unsticks busy and does NOT navigate', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    session.decline = vi.fn(async () => {
      throw new Error('boom');
    });
    const { result } = renderHook(() => useSigningFillController({ envelopeId: 'env-9' }));
    await act(async () => {
      await result.current.handleDecline();
    });
    expect(navigate).not.toHaveBeenCalled();
    expect(result.current.busy).toBe(false);
  });

  it('withdrawConsent: cancelled confirm is a no-op', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { result } = renderHook(() => useSigningFillController({ envelopeId: 'env-9' }));
    await act(async () => {
      await result.current.handleWithdrawConsent();
    });
    expect(session.withdrawConsent).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('withdrawConsent: confirmed call invokes session.withdrawConsent and navigates to /declined', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { result } = renderHook(() => useSigningFillController({ envelopeId: 'env-9' }));
    await act(async () => {
      await result.current.handleWithdrawConsent();
    });
    expect(session.withdrawConsent).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith('/sign/env-9/declined', { replace: true });
  });

  it('withdrawConsent: API failure unsticks busy', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    session.withdrawConsent = vi.fn(async () => {
      throw new Error('upstream');
    });
    const { result } = renderHook(() => useSigningFillController({ envelopeId: 'env-9' }));
    await act(async () => {
      await result.current.handleWithdrawConsent();
    });
    expect(navigate).not.toHaveBeenCalled();
    expect(result.current.busy).toBe(false);
  });

  it('busy guard: a second decline call while busy=true returns immediately', async () => {
    // Hold the decline promise open so busy stays true while we fire a
    // concurrent click.
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    session.decline = vi.fn(async () => {
      await held;
    });
    const { result } = renderHook(() => useSigningFillController({ envelopeId: 'env-9' }));
    let firstP: Promise<void> = Promise.resolve();
    act(() => {
      firstP = result.current.handleDecline();
    });
    // Second invocation while busy must be a no-op (decline still 1 call).
    await act(async () => {
      await result.current.handleDecline();
    });
    expect(session.decline).toHaveBeenCalledTimes(1);
    release();
    await act(async () => {
      await firstP;
    });
  });
});

describe('useSigningFillController — pure helpers', () => {
  it('toUiKind treats text+link_id="name" as the "name" field type', () => {
    const f = makeField({ id: 'x', page: 1, kind: 'text', link_id: 'name' });
    expect(toUiKind(f)).toBe('name');
    expect(toUiKind(makeField({ id: 'y', page: 1, kind: 'text' }))).toBe('text');
    expect(toUiKind(makeField({ id: 'z', page: 1, kind: 'signature' }))).toBe('signature');
  });

  it('fieldIsFilled distinguishes checkbox vs text fields', () => {
    expect(
      fieldIsFilled(makeField({ id: 'a', page: 1, kind: 'checkbox', value_boolean: true })),
    ).toBe(true);
    expect(
      fieldIsFilled(makeField({ id: 'a', page: 1, kind: 'checkbox', value_boolean: false })),
    ).toBe(false);
    expect(fieldIsFilled(makeField({ id: 'b', page: 1, kind: 'text', value_text: 'hi' }))).toBe(
      true,
    );
    expect(fieldIsFilled(makeField({ id: 'c', page: 1, kind: 'text', value_text: '' }))).toBe(
      false,
    );
  });

  it('fieldValue returns the right scalar per kind, null when empty', () => {
    expect(fieldValue(makeField({ id: 'a', page: 1, kind: 'checkbox', value_boolean: true }))).toBe(
      true,
    );
    expect(fieldValue(makeField({ id: 'b', page: 1, kind: 'text', value_text: 'x' }))).toBe('x');
    expect(fieldValue(makeField({ id: 'c', page: 1, kind: 'text' }))).toBeNull();
    expect(fieldValue(makeField({ id: 'd', page: 1, kind: 'checkbox' }))).toBeNull();
  });

  it('fieldLabel uses link_id (when not "name") as a label override, otherwise the kind default', () => {
    expect(
      fieldLabel(makeField({ id: 'a', page: 1, kind: 'text', link_id: 'company' }), 'text'),
    ).toBe('company');
    // link_id="name" must NOT win — name is the special-case kind label.
    expect(fieldLabel(makeField({ id: 'b', page: 1, kind: 'text', link_id: 'name' }), 'name')).toBe(
      'Print name',
    );
    expect(fieldLabel(makeField({ id: 'c', page: 1, kind: 'signature' }), 'signature')).toBe(
      'Sign here',
    );
  });
});
