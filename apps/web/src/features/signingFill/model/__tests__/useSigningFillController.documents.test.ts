import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { SignMeField } from '@/features/signing';

const navigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => navigate,
}));

function makeField(
  partial: Partial<SignMeField> & Pick<SignMeField, 'id' | 'page' | 'kind'>,
): SignMeField {
  return { signer_id: 'me', x: 0.1, y: 0.1, required: true, ...partial } as SignMeField;
}

const session: {
  fields: SignMeField[];
  documents: Array<{ id: string; ord: number; title: string; original_pages: number }>;
  signer: { name: string; email: string };
  nextField: SignMeField | null;
  fillField: ReturnType<typeof vi.fn>;
  setSignature: ReturnType<typeof vi.fn>;
  decline: ReturnType<typeof vi.fn>;
  withdrawConsent: ReturnType<typeof vi.fn>;
} = {
  fields: [],
  documents: [
    { id: 'doc-a', ord: 0, title: 'A', original_pages: 3 },
    { id: 'doc-b', ord: 1, title: 'B', original_pages: 3 },
  ],
  signer: { name: 'Maya Raskin', email: 'maya@example.com' },
  nextField: null,
  fillField: vi.fn(),
  setSignature: vi.fn(),
  decline: vi.fn(),
  withdrawConsent: vi.fn(),
};
vi.mock('@/features/signing', async () => {
  const actual = (await vi.importActual('@/features/signing')) as Record<string, unknown>;
  return { ...actual, useSigningSession: () => session };
});

const scrolledPages: number[] = [];
beforeEach(() => {
  scrolledPages.length = 0;
  navigate.mockReset();
  session.fields = [];
  session.nextField = null;
  session.fillField = vi.fn(async (id: string, value: { value_text?: string }) => {
    const f = session.fields.find((x) => x.id === id);
    if (f && 'value_text' in value) {
      (f as { value_text: string | null }).value_text = value.value_text ?? null;
    }
  });
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

import { useSigningFillController } from '../useSigningFillController';

describe('useSigningFillController across documents', () => {
  it('"Next field" on another document switches to it, then scrolls once it is on screen', async () => {
    const onActiveDocumentChange = vi.fn();
    session.fields = [
      makeField({ id: 'a1', page: 1, kind: 'text', document_id: 'doc-a', value_text: 'done' }),
      makeField({ id: 'b1', page: 2, kind: 'signature', document_id: 'doc-b' }),
    ];
    session.nextField = session.fields[1]!;

    const { result, rerender } = renderHook(
      ({ active }: { active: string }) =>
        useSigningFillController({
          envelopeId: 'env-1',
          activeDocumentId: active,
          onActiveDocumentChange,
        }),
      { initialProps: { active: 'doc-a' } },
    );

    act(() => {
      result.current.goTo(session.nextField!);
    });
    // The switch is requested first; no scroll happens against the wrong document.
    expect(onActiveDocumentChange).toHaveBeenCalledWith('doc-b');
    expect(scrolledPages).toEqual([]);
    expect(result.current.activeFieldId).toBe('b1');

    // The page switches document; the pending scroll then runs.
    rerender({ active: 'doc-b' });
    await waitFor(() => {
      expect(scrolledPages).toEqual([2]);
    });
  });

  it('scrolls straight away when the target is on the document already on screen', () => {
    const onActiveDocumentChange = vi.fn();
    session.fields = [makeField({ id: 'a1', page: 3, kind: 'text', document_id: 'doc-a' })];
    session.nextField = session.fields[0]!;

    const { result } = renderHook(() =>
      useSigningFillController({
        envelopeId: 'env-1',
        activeDocumentId: 'doc-a',
        onActiveDocumentChange,
      }),
    );
    act(() => {
      result.current.goTo(session.nextField!);
    });
    expect(onActiveDocumentChange).not.toHaveBeenCalled();
    expect(scrolledPages).toEqual([3]);
  });

  it('auto-advance after a fill crosses into the next document', async () => {
    const onActiveDocumentChange = vi.fn();
    session.fields = [
      makeField({ id: 'a1', page: 1, kind: 'text', document_id: 'doc-a' }),
      makeField({ id: 'b1', page: 1, kind: 'text', document_id: 'doc-b' }),
    ];

    const { result } = renderHook(() =>
      useSigningFillController({
        envelopeId: 'env-1',
        activeDocumentId: 'doc-a',
        onActiveDocumentChange,
      }),
    );

    await act(async () => {
      await result.current.handleFieldClick(session.fields[0]!);
    });
    await act(async () => {
      await result.current.handleTextApply('hello');
    });
    expect(onActiveDocumentChange).toHaveBeenCalledWith('doc-b');
    expect(result.current.activeFieldId).toBe('b1');
  });

  it('behaves as before without document props (single-document envelope)', () => {
    session.fields = [makeField({ id: 'f1', page: 4, kind: 'text' })];
    session.nextField = session.fields[0]!;
    const { result } = renderHook(() => useSigningFillController({ envelopeId: 'env-1' }));
    act(() => {
      result.current.goTo(session.nextField!);
    });
    expect(scrolledPages).toEqual([4]);
  });
});
