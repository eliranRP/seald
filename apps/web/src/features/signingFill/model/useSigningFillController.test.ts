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
} = {
  fields: [],
  nextField: null,
  fillField: vi.fn(),
  setSignature: vi.fn(),
  decline: vi.fn(),
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

// eslint-disable-next-line import/first
import { useSigningFillController } from './useSigningFillController';

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
