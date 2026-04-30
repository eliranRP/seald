import { describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { ThemeProvider } from 'styled-components';
import { DocumentPage } from './DocumentPage';
import type { DocumentPageProps, DocumentPageSigner } from './DocumentPage.types';
import type { AddSignerContact } from '../../components/AddSignerDropdown/AddSignerDropdown.types';
import type { PlacedFieldValue } from '../../components/PlacedField/PlacedField.types';
import { seald } from '../../styles/theme';

const DEFAULT_SIGNERS: ReadonlyArray<DocumentPageSigner> = [
  { id: 'a', name: 'Ada Byron', email: 'ada@analytical.co', color: '#F472B6' },
  { id: 'b', name: 'Alan Turing', email: 'alan@bombe.gov.uk', color: '#7DD3FC' },
];

const DEFAULT_FIELDS: ReadonlyArray<PlacedFieldValue> = [
  { id: 'field-1', page: 1, type: 'signature', x: 60, y: 100, signerIds: ['a'] },
  { id: 'field-2', page: 2, type: 'date', x: 80, y: 200, signerIds: ['b'] },
];

const DEFAULT_CONTACTS: ReadonlyArray<AddSignerContact> = [
  { id: 'a', name: 'Ada Byron', email: 'ada@analytical.co', color: '#F472B6' },
  { id: 'b', name: 'Alan Turing', email: 'alan@bombe.gov.uk', color: '#7DD3FC' },
  { id: 'c', name: 'Grace Hopper', email: 'grace@cobol.dev', color: '#10B981' },
];

type HarnessOverrides = Partial<Omit<DocumentPageProps, 'fields' | 'onFieldsChange'>> & {
  readonly initialFields?: ReadonlyArray<PlacedFieldValue>;
  readonly onFieldsChangeSpy?: (next: ReadonlyArray<PlacedFieldValue>) => void;
};

function Harness({ overrides }: { readonly overrides: HarnessOverrides }) {
  const [fields, setFields] = useState<ReadonlyArray<PlacedFieldValue>>(
    overrides.initialFields ?? DEFAULT_FIELDS,
  );
  const pageProps: Partial<DocumentPageProps> = { ...overrides };
  delete (pageProps as { initialFields?: unknown }).initialFields;
  delete (pageProps as { onFieldsChangeSpy?: unknown }).onFieldsChangeSpy;
  return (
    <DocumentPage
      totalPages={4}
      signers={DEFAULT_SIGNERS}
      contacts={DEFAULT_CONTACTS}
      onSend={() => {}}
      {...pageProps}
      fields={fields}
      onFieldsChange={(next) => {
        overrides.onFieldsChangeSpy?.(next);
        setFields(next);
      }}
    />
  );
}

function renderPage(overrides: HarnessOverrides = {}) {
  return render(
    <ThemeProvider theme={seald}>
      <Harness overrides={overrides} />
    </ThemeProvider>,
  );
}

describe('DocumentPage', () => {
  it('renders workspace rails, toolbar, canvas, and send footer', () => {
    renderPage();
    expect(screen.getByRole('region', { name: /field palette/i })).toBeInTheDocument();
    expect(screen.getByRole('document', { name: /page 1 of 4/i })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: /page navigation/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send to sign/i })).toBeInTheDocument();
  });

  it('navigates between pages via the toolbar and restricts PlacedFields to the current page', () => {
    renderPage();
    const groupOnPage1 = screen.getAllByRole('group', { name: /signature field for/i });
    expect(groupOnPage1).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: /next page/i }));
    const groupOnPage2 = screen.getAllByRole('group', { name: /date field for/i });
    expect(groupOnPage2).toHaveLength(1);
    expect(screen.getByRole('document', { name: /page 2 of 4/i })).toBeInTheDocument();
  });

  it('jumps to a field and highlights it when clicking the summary list', () => {
    renderPage();
    // Find the FieldsPlacedList row for page 2 and click it.
    const section = screen.getByRole('region', { name: /fields placed/i });
    const row = within(section)
      .getAllByRole('button')
      .find((b) => /page 2/i.test(b.getAttribute('aria-label') ?? ''));
    expect(row).toBeDefined();
    if (row) fireEvent.click(row);
    expect(screen.getByRole('document', { name: /page 2 of 4/i })).toBeInTheDocument();
  });

  it('drops one field pre-selected with all signers and opens the popover when 2+ signers', () => {
    // Multi-signer drop: a single field is dropped pre-selected with
    // every signer, and the Select-signers popover opens so the user
    // explicitly picks who the field is for. If they pick 2+ in the
    // popover, `applySignerSelection` (covered separately below) splits
    // it into N side-by-side ungrouped tiles. Previously the drop
    // silently produced N tiles with no popover, leaving no path to
    // assign a single field to just one of the signers.
    const onFieldsChangeSpy = vi.fn<(next: ReadonlyArray<PlacedFieldValue>) => void>();
    renderPage({ onFieldsChangeSpy, initialFields: [] });

    const signatureRow = screen.getByRole('button', { name: 'Signature' });
    const canvas = screen.getByRole('document', { name: /page 1 of 4/i });

    // HTML5 DnD in jsdom — dataTransfer is a POJO.
    const dataTransfer = {
      setData: vi.fn(),
      getData: vi.fn().mockReturnValue('signature'),
      effectAllowed: '',
      dropEffect: '',
      files: [],
      items: [],
      types: ['text/plain'],
    };
    act(() => {
      fireEvent.dragStart(signatureRow, { dataTransfer });
      fireEvent.dragOver(canvas, { dataTransfer });
      fireEvent.drop(canvas, { dataTransfer, clientX: 300, clientY: 400 });
    });

    expect(onFieldsChangeSpy).toHaveBeenCalledTimes(1);
    const firstCall = onFieldsChangeSpy.mock.calls[0];
    const next = firstCall ? firstCall[0] : undefined;
    // One field, pre-selected with both signers ("a" and "b").
    expect(next?.length).toBe(1);
    expect(next?.[0]?.type).toBe('signature');
    expect(next?.[0]?.signerIds).toEqual(['a', 'b']);
    // Popover is open with both signers pre-checked — the user can now
    // confirm both, narrow to one, or cancel.
    const dialog = screen.getByRole('dialog', { name: /select signers/i });
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByRole('checkbox', { name: /ada byron/i })).toBeChecked();
  });

  it('drops a palette field with a single signer as one field, opening the popover for adjustment', () => {
    // Single-signer drops still surface the Select-signers popover so
    // the user can adjust the assignment before moving on. Only the
    // multi-signer path skips the popover (the split already captures
    // intent).
    const SINGLE_SIGNER: ReadonlyArray<DocumentPageSigner> = [DEFAULT_SIGNERS[0]!];
    renderPage({ initialFields: [], signers: SINGLE_SIGNER });

    const dateRow = screen.getByRole('button', { name: 'Date' });
    const canvas = screen.getByRole('document', { name: /page 1 of 4/i });
    const dataTransfer = {
      setData: vi.fn(),
      getData: vi.fn().mockReturnValue('date'),
      effectAllowed: '',
      dropEffect: '',
      files: [],
      items: [],
      types: ['text/plain'],
    };

    expect(screen.queryByRole('dialog', { name: /select signers/i })).not.toBeInTheDocument();
    act(() => {
      fireEvent.dragStart(dateRow, { dataTransfer });
      fireEvent.dragOver(canvas, { dataTransfer });
      fireEvent.drop(canvas, { dataTransfer, clientX: 200, clientY: 150 });
    });
    // Single-signer drop → popover opens with the lone signer pre-checked.
    const dialog = screen.getByRole('dialog', { name: /select signers/i });
    expect(dialog).toBeInTheDocument();
    const ada = within(dialog).getByRole('checkbox', { name: /ada byron/i });
    expect(ada).toBeChecked();
  });

  it('each successive multi-signer palette drop opens the popover for that drop', () => {
    // Each drop on a multi-signer document funnels through the
    // Select-signers popover so the user is asked who the field is
    // for every time. Cancelling the first popover leaves the dropped
    // placeholder in place (with both signers); the second drop then
    // adds another placeholder and re-opens the popover keyed to the
    // new field.
    const onFieldsChangeSpy = vi.fn<(next: ReadonlyArray<PlacedFieldValue>) => void>();
    renderPage({ onFieldsChangeSpy, initialFields: [] });

    const signatureRow = screen.getByRole('button', { name: 'Signature' });
    const canvas = screen.getByRole('document', { name: /page 1 of 4/i });
    const dataTransfer = {
      setData: vi.fn(),
      getData: vi.fn().mockReturnValue('signature'),
      effectAllowed: '',
      dropEffect: '',
      files: [],
      items: [],
      types: ['text/plain'],
    };

    // First drop → 1 placeholder field, popover opens.
    act(() => {
      fireEvent.dragStart(signatureRow, { dataTransfer });
      fireEvent.dragOver(canvas, { dataTransfer });
      fireEvent.drop(canvas, { dataTransfer, clientX: 150, clientY: 150 });
    });
    expect(screen.getByRole('dialog', { name: /select signers/i })).toBeInTheDocument();
    // Cancel — the placeholder stays, popover closes.
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(screen.queryByRole('dialog', { name: /select signers/i })).not.toBeInTheDocument();

    // Second drop → another placeholder, popover re-opens for it.
    act(() => {
      fireEvent.dragStart(signatureRow, { dataTransfer });
      fireEvent.dragOver(canvas, { dataTransfer });
      fireEvent.drop(canvas, { dataTransfer, clientX: 300, clientY: 200 });
    });
    expect(screen.getByRole('dialog', { name: /select signers/i })).toBeInTheDocument();

    const { calls } = onFieldsChangeSpy.mock;
    const last = calls[calls.length - 1];
    const next = last ? last[0] : undefined;
    // 2 placeholders total (one per drop) — each carries every signer
    // id until the user narrows the assignment via the popover.
    expect(next?.length).toBe(2);
    expect(next?.every((f) => f.type === 'signature')).toBe(true);
    expect(next?.every((f) => f.signerIds.length === 2)).toBe(true);
  });

  it('clears the selection when the canvas background is clicked', () => {
    renderPage();
    const field = screen.getByRole('group', { name: /signature field for/i });
    fireEvent.click(field);
    // The selection overlay ("Assign signers") is visible only while selected.
    expect(screen.getByRole('button', { name: /assign signers/i })).toBeInTheDocument();

    const canvas = screen.getByRole('document', { name: /page 1 of 4/i });
    fireEvent.click(canvas);

    expect(screen.queryByRole('button', { name: /assign signers/i })).not.toBeInTheDocument();
  });

  it('multi-selects fields with shift-click (forming a group) so controls hide', () => {
    const fields: ReadonlyArray<PlacedFieldValue> = [
      { id: 'f1', page: 1, type: 'signature', x: 20, y: 20, signerIds: ['a'] },
      { id: 'f2', page: 1, type: 'date', x: 220, y: 20, signerIds: ['b'] },
    ];
    renderPage({ initialFields: fields });

    const sig = screen.getByRole('group', { name: /signature field for/i });
    const date = screen.getByRole('group', { name: /date field for/i });
    fireEvent.click(sig);
    // First click selects single → overlay visible.
    expect(screen.getByRole('button', { name: /assign signers/i })).toBeInTheDocument();
    // Shift-click extends selection into a group → per-field overlay hidden.
    fireEvent.click(date, { shiftKey: true });
    expect(screen.queryByRole('button', { name: /assign signers/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /delete field/i })).not.toBeInTheDocument();
  });

  it('drags a grouped field and moves every other group member by the same delta', () => {
    const fields: ReadonlyArray<PlacedFieldValue> = [
      { id: 'f1', page: 1, type: 'signature', x: 20, y: 20, signerIds: ['a'] },
      { id: 'f2', page: 1, type: 'date', x: 220, y: 50, signerIds: ['b'] },
    ];
    const onFieldsChangeSpy = vi.fn<(next: ReadonlyArray<PlacedFieldValue>) => void>();
    renderPage({ initialFields: fields, onFieldsChangeSpy });

    const sig = screen.getByRole('group', { name: /signature field for/i });
    const date = screen.getByRole('group', { name: /date field for/i });
    fireEvent.click(sig);
    fireEvent.click(date, { shiftKey: true });

    // Mouse down on one group member (anchor) and drag.
    fireEvent.mouseDown(sig, { clientX: 100, clientY: 100, button: 0 });
    act(() => {
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 140, clientY: 120 }));
    });
    act(() => {
      window.dispatchEvent(new MouseEvent('mouseup'));
    });

    const { calls } = onFieldsChangeSpy.mock;
    const last = calls[calls.length - 1];
    const next = last ? last[0] : undefined;
    const f1 = next?.find((f) => f.id === 'f1');
    const f2 = next?.find((f) => f.id === 'f2');
    // Both fields shifted by the same delta (+40, +20).
    expect(f1?.x).toBe(20 + 40);
    expect(f1?.y).toBe(20 + 20);
    expect(f2?.x).toBe(220 + 40);
    expect(f2?.y).toBe(50 + 20);
  });

  it('plain click on a grouped field isolates it to a single selection (breaks the group)', () => {
    const fields: ReadonlyArray<PlacedFieldValue> = [
      { id: 'f1', page: 1, type: 'signature', x: 20, y: 20, signerIds: ['a'] },
      { id: 'f2', page: 1, type: 'date', x: 220, y: 50, signerIds: ['b'] },
    ];
    renderPage({ initialFields: fields });
    const sig = screen.getByRole('group', { name: /signature field for/i });
    const date = screen.getByRole('group', { name: /date field for/i });
    fireEvent.click(sig);
    fireEvent.click(date, { shiftKey: true });
    // Both selected — they share the grouped overlay, overlay controls hidden.
    expect(screen.queryByRole('button', { name: /assign signers/i })).not.toBeInTheDocument();
    // A plain click on one of them must isolate that field. The overlay
    // controls reappear because the clicked field is now a single selection.
    fireEvent.click(sig);
    expect(screen.getByRole('button', { name: /assign signers/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /delete field/i })).toBeInTheDocument();
  });

  it('preserves the group while dragging a member even though plain clicks isolate', () => {
    const fields: ReadonlyArray<PlacedFieldValue> = [
      { id: 'f1', page: 1, type: 'signature', x: 20, y: 20, signerIds: ['a'] },
      { id: 'f2', page: 1, type: 'date', x: 220, y: 50, signerIds: ['b'] },
    ];
    const onFieldsChangeSpy = vi.fn<(next: ReadonlyArray<PlacedFieldValue>) => void>();
    renderPage({ initialFields: fields, onFieldsChangeSpy });
    const sig = screen.getByRole('group', { name: /signature field for/i });
    const date = screen.getByRole('group', { name: /date field for/i });
    fireEvent.click(sig);
    fireEvent.click(date, { shiftKey: true });

    // Mousedown + drag past the threshold on a group member keeps the group
    // together. The final mouseup does NOT isolate because a drag happened.
    fireEvent.mouseDown(sig, { clientX: 100, clientY: 100, button: 0 });
    act(() => {
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 140, clientY: 120 }));
    });
    act(() => {
      window.dispatchEvent(new MouseEvent('mouseup'));
    });
    // A native click event on the underlying element after the drag must not
    // collapse the group either (suppressed by the drag-end flag).
    fireEvent.click(sig);
    // Overlay controls still hidden → group preserved.
    expect(screen.queryByRole('button', { name: /assign signers/i })).not.toBeInTheDocument();
    // And both fields moved together.
    const { calls } = onFieldsChangeSpy.mock;
    const last = calls[calls.length - 1];
    const next = last ? last[0] : undefined;
    expect(next?.find((f) => f.id === 'f1')?.x).toBe(20 + 40);
    expect(next?.find((f) => f.id === 'f2')?.x).toBe(220 + 40);
  });

  it('marquee-drags across the canvas to lasso-select every field it intersects into a group', () => {
    const fields: ReadonlyArray<PlacedFieldValue> = [
      { id: 'f1', page: 1, type: 'signature', x: 20, y: 20, signerIds: ['a'] },
      { id: 'f2', page: 1, type: 'date', x: 220, y: 50, signerIds: ['b'] },
    ];
    renderPage({ initialFields: fields });
    const canvas = screen.getByRole('document', { name: /page 1 of 4/i });
    // Force a deterministic canvas rect so clientX/Y map predictably into
    // canvas-local coordinates.
    canvas.getBoundingClientRect = () =>
      ({
        top: 0,
        left: 0,
        right: 800,
        bottom: 600,
        width: 800,
        height: 600,
        x: 0,
        y: 0,
      }) as DOMRect;

    // Start a drag at (0, 0) on the background and sweep to (400, 200) which
    // covers both fields.
    fireEvent.mouseDown(canvas, { clientX: 0, clientY: 0, button: 0 });
    act(() => {
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 400, clientY: 200 }));
    });
    // The live marquee rectangle renders during the drag.
    // no semantic role: decorative selection rectangle overlay (rule 4.6 escape hatch)
    expect(screen.getByTestId('canvas-marquee')).toBeInTheDocument();
    act(() => {
      window.dispatchEvent(new MouseEvent('mouseup'));
    });
    // The marquee is removed once the drag completes.
    expect(screen.queryByTestId('canvas-marquee')).not.toBeInTheDocument();
    // Both fields are selected as a group — grouped selection hides per-field
    // overlay controls, so neither Assign signers nor Delete field is visible.
    expect(screen.queryByRole('button', { name: /assign signers/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /delete field/i })).not.toBeInTheDocument();
  });

  it('shows a group toolbar when 2+ fields are selected and bulk-deletes on click', () => {
    const fields: ReadonlyArray<PlacedFieldValue> = [
      { id: 'f1', page: 1, type: 'signature', x: 20, y: 20, signerIds: ['a'] },
      { id: 'f2', page: 1, type: 'date', x: 220, y: 50, signerIds: ['b'] },
    ];
    const onFieldsChange = vi.fn();
    renderPage({ initialFields: fields, onFieldsChangeSpy: onFieldsChange });
    const sig = screen.getByRole('group', { name: /signature field for/i });
    const date = screen.getByRole('group', { name: /date field for/i });
    fireEvent.click(sig);
    fireEvent.click(date, { shiftKey: true });
    // Group toolbar appears with the selection count + bulk actions.
    // no semantic role: floating overlay div (rule 4.6 escape hatch)
    expect(screen.getByTestId('group-toolbar')).toBeInTheDocument();
    expect(screen.getByText(/2 selected/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /delete selected fields/i }));
    // Both fields are removed in a single change.
    const next = onFieldsChange.mock.calls.at(-1)?.[0] as ReadonlyArray<PlacedFieldValue>;
    expect(next).toHaveLength(0);
  });

  it('opens the Place-on-pages popover when the group Duplicate button is clicked and clones the group across target pages', () => {
    const fields: ReadonlyArray<PlacedFieldValue> = [
      { id: 'f1', page: 1, type: 'signature', x: 20, y: 20, signerIds: ['a'] },
      { id: 'f2', page: 1, type: 'date', x: 220, y: 50, signerIds: ['b'] },
    ];
    const onFieldsChange = vi.fn();
    renderPage({ initialFields: fields, onFieldsChangeSpy: onFieldsChange, totalPages: 4 });
    const sig = screen.getByRole('group', { name: /signature field for/i });
    const date = screen.getByRole('group', { name: /date field for/i });
    fireEvent.click(sig);
    fireEvent.click(date, { shiftKey: true });
    fireEvent.click(screen.getByRole('button', { name: /duplicate selected fields/i }));
    // The Place-on-pages dialog opens instead of doing an in-place paste.
    const dialog = screen.getByRole('dialog', { name: /place on/i });
    expect(dialog).toBeInTheDocument();
    // "All pages" is the default for multi-page docs; click Apply.
    fireEvent.click(within(dialog).getByRole('button', { name: /apply/i }));
    const next = onFieldsChange.mock.calls.at(-1)?.[0] as ReadonlyArray<PlacedFieldValue>;
    // Originals (2) plus 2 clones per target page × 3 target pages (2,3,4) = 8.
    expect(next).toHaveLength(2 + 2 * 3);
    // Clones land on pages 2, 3, 4 — one per original per target.
    const clonePages = next.slice(2).map((f) => f.page);
    expect(new Set(clonePages)).toEqual(new Set([2, 3, 4]));
    // Each clone preserves its original's signer assignment + coordinates.
    const cloneOnP2 = next.slice(2).filter((f) => f.page === 2);
    expect(cloneOnP2.map((f) => f.signerIds)).toEqual([['a'], ['b']]);
    expect(cloneOnP2.map((f) => f.x)).toEqual([20, 220]);
  });

  it('clicking background after a group click breaks the group; a subsequent click selects one', () => {
    const fields: ReadonlyArray<PlacedFieldValue> = [
      { id: 'f1', page: 1, type: 'signature', x: 20, y: 20, signerIds: ['a'] },
      { id: 'f2', page: 1, type: 'date', x: 220, y: 50, signerIds: ['b'] },
    ];
    renderPage({ initialFields: fields });
    const sig = screen.getByRole('group', { name: /signature field for/i });
    const date = screen.getByRole('group', { name: /date field for/i });
    fireEvent.click(sig);
    fireEvent.click(date, { shiftKey: true });
    // Still grouped — controls hidden.
    expect(screen.queryByRole('button', { name: /assign signers/i })).not.toBeInTheDocument();

    const canvas = screen.getByRole('document', { name: /page 1 of 4/i });
    fireEvent.click(canvas);
    // Now select a single previously-grouped field — it should behave as single.
    fireEvent.click(sig);
    expect(screen.getByRole('button', { name: /assign signers/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /delete field/i })).toBeInTheDocument();
  });

  it('each successive single-signer palette drop re-opens the Select signers popover for the new field', () => {
    // Regression: with a single signer on the document, every drop still
    // surfaces the popover so the user can adjust the assignment before
    // continuing. Multi-signer drops take the split-into-N-fields path
    // (covered by the dedicated test above) and skip the popover.
    const SINGLE_SIGNER: ReadonlyArray<DocumentPageSigner> = [DEFAULT_SIGNERS[0]!];
    const onFieldsChangeSpy = vi.fn<(next: ReadonlyArray<PlacedFieldValue>) => void>();
    renderPage({ onFieldsChangeSpy, initialFields: [], signers: SINGLE_SIGNER });

    const signatureRow = screen.getByRole('button', { name: 'Signature' });
    const canvas = screen.getByRole('document', { name: /page 1 of 4/i });
    const dataTransfer = {
      setData: vi.fn(),
      getData: vi.fn().mockReturnValue('signature'),
      effectAllowed: '',
      dropEffect: '',
      files: [],
      items: [],
      types: ['text/plain'],
    };

    // First drop with one signer → single field + popover opens.
    act(() => {
      fireEvent.dragStart(signatureRow, { dataTransfer });
      fireEvent.dragOver(canvas, { dataTransfer });
      fireEvent.drop(canvas, { dataTransfer, clientX: 150, clientY: 150 });
    });
    const firstDialog = screen.getByRole('dialog', { name: /select signers/i });
    fireEvent.click(within(firstDialog).getByRole('button', { name: /apply/i }));

    // Second drop → second field + popover re-opens for it.
    act(() => {
      fireEvent.dragStart(signatureRow, { dataTransfer });
      fireEvent.dragOver(canvas, { dataTransfer });
      fireEvent.drop(canvas, { dataTransfer, clientX: 300, clientY: 200 });
    });
    expect(screen.getByRole('dialog', { name: /select signers/i })).toBeInTheDocument();

    const { calls } = onFieldsChangeSpy.mock;
    const last = calls[calls.length - 1];
    const next = last ? last[0] : undefined;
    // Two fields total — one per drop — each carrying the lone signer.
    expect(next?.length).toBe(2);
    expect(next?.every((f) => f.type === 'signature')).toBe(true);
    expect(next?.every((f) => f.signerIds.length === 1)).toBe(true);
  });

  it('removes a signer from the right-rail panel when the remove button is clicked', () => {
    const onRemoveSigner = vi.fn<(id: string) => void>();
    renderPage({ onRemoveSigner });
    const removeAda = screen.getByRole('button', { name: /remove signer ada byron/i });
    fireEvent.click(removeAda);
    expect(onRemoveSigner).toHaveBeenCalledWith('a');
  });

  it('fields default to required and show a visible required badge', () => {
    renderPage();
    // Default fields omit `required`; PlacedField treats missing as required.
    const field = screen.getByRole('group', { name: /signature field for/i });
    expect(within(field).getByLabelText(/required field/i)).toBeInTheDocument();
  });

  it('toggles a field between required and optional via the overlay button', () => {
    const onFieldsChangeSpy = vi.fn<(next: ReadonlyArray<PlacedFieldValue>) => void>();
    renderPage({ onFieldsChangeSpy });

    const field = screen.getByRole('group', { name: /signature field for/i });
    fireEvent.click(field);

    // Initial state: required → button aria-pressed=true → clicking marks optional.
    const toggle = screen.getByRole('button', { name: /mark field optional/i });
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(toggle);

    const firstCall = onFieldsChangeSpy.mock.calls[0];
    const next = firstCall ? firstCall[0] : undefined;
    const updated = next?.find((f) => f.id === 'field-1');
    expect(updated?.required).toBe(false);

    // After re-render, toggle label flips to "Mark field required" and the
    // tile-level required badge disappears.
    const refreshedField = screen.getByRole('group', { name: /signature field for/i });
    expect(within(refreshedField).queryByLabelText(/required field/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /mark field required/i })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('respects an explicit required: false without showing the required badge', () => {
    const fields: ReadonlyArray<PlacedFieldValue> = [
      { id: 'opt', page: 1, type: 'text', x: 20, y: 20, signerIds: ['a'], required: false },
    ];
    renderPage({ initialFields: fields });
    const field = screen.getByRole('group', { name: /text field for/i });
    expect(within(field).queryByLabelText(/required field/i)).not.toBeInTheDocument();
  });

  it('resizes a selected field via its corner handle and emits the new size', () => {
    const onFieldsChangeSpy = vi.fn<(next: ReadonlyArray<PlacedFieldValue>) => void>();
    renderPage({ onFieldsChangeSpy });

    const field = screen.getByRole('group', { name: /signature field for/i });
    fireEvent.click(field);

    const handle = screen.getByRole('button', { name: /resize bottom-right/i });
    fireEvent.mouseDown(handle, { clientX: 200, clientY: 200, button: 0 });
    act(() => {
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 260, clientY: 230 }));
    });
    act(() => {
      window.dispatchEvent(new MouseEvent('mouseup'));
    });

    expect(onFieldsChangeSpy).toHaveBeenCalled();
    const { calls } = onFieldsChangeSpy.mock;
    const last = calls[calls.length - 1];
    const next = last ? last[0] : undefined;
    const updated = next?.find((f) => f.id === 'field-1');
    expect(updated?.width).toBe(132 + 60);
    expect(updated?.height).toBe(54 + 30);
  });

  it('applies a 2-signer selection by splitting the source field into two ungrouped single-signer fields', () => {
    // Issue #2 v2: applying multiple signers via the popover replaces
    // the source field with N independent fields (each with one
    // signerId), placed side-by-side starting at the source's
    // coordinates. The user can position each individually, or
    // marquee-select them and click Group to bind them together.
    const onFieldsChangeSpy = vi.fn<(next: ReadonlyArray<PlacedFieldValue>) => void>();
    renderPage({ onFieldsChangeSpy });

    // Select the field on page 1 to reveal the overlay controls.
    const field = screen.getByRole('group', { name: /signature field for/i });
    fireEvent.click(field);

    const signersButton = screen.getByRole('button', { name: /assign signers/i });
    fireEvent.click(signersButton);

    const dialog = screen.getByRole('dialog', { name: /select signers/i });
    // Toggle Alan Turing on (Ada is already selected).
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /alan turing/i }));
    fireEvent.click(within(dialog).getByRole('button', { name: /apply/i }));

    const { calls } = onFieldsChangeSpy.mock;
    const last = calls[calls.length - 1];
    const next = last ? last[0] : undefined;
    // Original field-1 is removed; two fresh single-signer fields take
    // its place. field-2 (on a different page) is untouched.
    const onPage1 = next?.filter((f) => f.page === 1) ?? [];
    expect(onPage1).toHaveLength(2);
    expect(onPage1.map((f) => f.signerIds)).toEqual([['a'], ['b']]);
    // The originals' coordinates are preserved on the first split; the
    // second is offset by SPLIT_TILE_WIDTH + SPLIT_TILE_GAP (140 px).
    expect((onPage1[1]?.x ?? 0) - (onPage1[0]?.x ?? 0)).toBe(140);
    // Splits are NOT grouped — that is opt-in via the GroupToolbar.
    expect(onPage1[0]?.groupId).toBeUndefined();
    expect(onPage1[1]?.groupId).toBeUndefined();
  });

  it('duplicates a field to all pages via the place-on-pages popover', () => {
    const onFieldsChangeSpy = vi.fn<(next: ReadonlyArray<PlacedFieldValue>) => void>();
    renderPage({ onFieldsChangeSpy });

    const field = screen.getByRole('group', { name: /signature field for/i });
    fireEvent.click(field);
    fireEvent.click(screen.getByRole('button', { name: /duplicate field to pages/i }));

    const dialog = screen.getByRole('dialog', { name: /^place on/i });
    fireEvent.click(within(dialog).getByRole('radio', { name: /^all pages$/i }));
    fireEvent.click(within(dialog).getByRole('button', { name: /apply/i }));

    const firstCall = onFieldsChangeSpy.mock.calls[0];
    const next = firstCall ? firstCall[0] : undefined;
    // Original 2 fields + 3 new clones (pages 2, 3, 4 — excluding source page 1).
    expect(next?.length).toBe(5);
  });

  it('removes a field when its remove control is activated', () => {
    const onFieldsChangeSpy = vi.fn<(next: ReadonlyArray<PlacedFieldValue>) => void>();
    renderPage({ onFieldsChangeSpy });

    const field = screen.getByRole('group', { name: /signature field for/i });
    fireEvent.click(field);
    fireEvent.click(screen.getByRole('button', { name: /delete field/i }));

    const firstCall = onFieldsChangeSpy.mock.calls[0];
    const next = firstCall ? firstCall[0] : undefined;
    expect(next?.some((f) => f.id === 'field-1')).toBe(false);
    expect(next?.length).toBe(1);
  });

  it('opens AddSignerDropdown and fires onAddSignerFromContact on pick', () => {
    const onAddSignerFromContact = vi.fn<(c: AddSignerContact) => void>();
    renderPage({ onAddSignerFromContact });

    fireEvent.click(screen.getByRole('button', { name: /add signer/i }));
    const searchbox = screen.getByRole('searchbox', { name: /search contacts/i });
    fireEvent.change(searchbox, { target: { value: 'grace' } });
    fireEvent.click(screen.getByRole('option', { name: /grace hopper/i }));

    expect(onAddSignerFromContact).toHaveBeenCalledTimes(1);
    const firstCall = onAddSignerFromContact.mock.calls[0];
    expect(firstCall ? firstCall[0].id : undefined).toBe('c');
  });

  it('fires onSend when the send CTA is clicked', () => {
    const onSend = vi.fn();
    renderPage({ onSend });
    fireEvent.click(screen.getByRole('button', { name: /send to sign/i }));
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it('fires onBack when the back button is clicked', () => {
    const onBack = vi.fn();
    renderPage({ onBack });
    fireEvent.click(screen.getByRole('button', { name: /^back$/i }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('Delete key removes every selected field', () => {
    const fields: ReadonlyArray<PlacedFieldValue> = [
      { id: 'f1', page: 1, type: 'signature', x: 20, y: 20, signerIds: ['a'] },
      { id: 'f2', page: 1, type: 'date', x: 220, y: 20, signerIds: ['b'] },
    ];
    const onFieldsChange = vi.fn();
    renderPage({ initialFields: fields, onFieldsChangeSpy: onFieldsChange });
    fireEvent.click(screen.getByRole('group', { name: /signature field for/i }));
    fireEvent.click(screen.getByRole('group', { name: /date field for/i }), { shiftKey: true });
    fireEvent.keyDown(window, { key: 'Delete' });
    const next = onFieldsChange.mock.calls.at(-1)?.[0] as ReadonlyArray<PlacedFieldValue>;
    expect(next).toHaveLength(0);
  });

  it('Cmd+C then Cmd+V clones selected fields onto the current page with new ids', () => {
    const fields: ReadonlyArray<PlacedFieldValue> = [
      { id: 'f1', page: 1, type: 'signature', x: 20, y: 20, signerIds: ['a'] },
    ];
    const onFieldsChange = vi.fn();
    renderPage({ initialFields: fields, onFieldsChangeSpy: onFieldsChange });
    fireEvent.click(screen.getByRole('group', { name: /signature field for/i }));
    fireEvent.keyDown(window, { key: 'c', metaKey: true });
    fireEvent.keyDown(window, { key: 'v', metaKey: true });
    const next = onFieldsChange.mock.calls.at(-1)?.[0] as ReadonlyArray<PlacedFieldValue>;
    // Original + 1 clone = 2 fields, and the clone has a different id.
    expect(next).toHaveLength(2);
    expect(next[1]?.id).not.toBe('f1');
    expect(next[1]?.type).toBe('signature');
  });

  it('Cmd+Z restores the previous fields snapshot after a deletion', () => {
    const fields: ReadonlyArray<PlacedFieldValue> = [
      { id: 'f1', page: 1, type: 'signature', x: 20, y: 20, signerIds: ['a'] },
    ];
    const onFieldsChange = vi.fn();
    renderPage({ initialFields: fields, onFieldsChangeSpy: onFieldsChange });
    fireEvent.click(screen.getByRole('group', { name: /signature field for/i }));
    fireEvent.keyDown(window, { key: 'Delete' });
    fireEvent.keyDown(window, { key: 'z', metaKey: true });
    const next = onFieldsChange.mock.calls.at(-1)?.[0] as ReadonlyArray<PlacedFieldValue>;
    // Undo should restore the original single field.
    expect(next).toHaveLength(1);
    expect(next[0]?.id).toBe('f1');
  });

  it('left palette shows a per-kind usage count reflecting how many fields of that kind are placed', () => {
    const fields: ReadonlyArray<PlacedFieldValue> = [
      { id: 'f1', page: 1, type: 'signature', x: 20, y: 20, signerIds: ['a'] },
      { id: 'f2', page: 1, type: 'signature', x: 200, y: 20, signerIds: ['b'] },
      { id: 'f3', page: 1, type: 'date', x: 20, y: 120, signerIds: ['a'] },
    ];
    renderPage({ initialFields: fields });
    const palette = screen.getByRole('region', { name: /field palette/i });
    // Per-kind badge sits next to the row label and is only rendered when >0.
    expect(
      within(palette).getByLabelText(/2 signature fields placed in document/i),
    ).toBeInTheDocument();
    expect(within(palette).getByLabelText(/1 date field placed in document/i)).toBeInTheDocument();
    // Unplaced kinds do not get a badge rendered at all.
    expect(within(palette).queryByLabelText(/0 .* fields placed/i)).not.toBeInTheDocument();
  });

  it('side-rail selected row exposes inline Duplicate/Remove actions that act on that field only', () => {
    const fields: ReadonlyArray<PlacedFieldValue> = [
      { id: 'f1', page: 1, type: 'signature', x: 20, y: 20, signerIds: ['a'] },
      { id: 'f2', page: 1, type: 'signature', x: 200, y: 20, signerIds: ['b'] },
    ];
    const onFieldsChange = vi.fn();
    renderPage({ initialFields: fields, onFieldsChangeSpy: onFieldsChange });
    const listSection = screen.getByRole('region', { name: /fields placed/i });
    // Inline actions only appear for the selected row — click the first
    // canvas field to select it, then invoke Remove from the side rail.
    fireEvent.click(screen.getAllByRole('group', { name: /signature field for/i })[0] as Element);
    const removeButtons = within(listSection).getAllByRole('button', { name: /remove field/i });
    expect(removeButtons.length).toBe(1);
    fireEvent.click(removeButtons[0] as Element);
    const next = onFieldsChange.mock.calls.at(-1)?.[0] as ReadonlyArray<PlacedFieldValue>;
    expect(next).toHaveLength(1);
    expect(next[0]?.id).toBe('f2');
  });

  it('draws a dashed group-boundary rectangle around a multi-field selection', () => {
    const fields: ReadonlyArray<PlacedFieldValue> = [
      { id: 'f1', page: 1, type: 'signature', x: 20, y: 20, signerIds: ['a'] },
      { id: 'f2', page: 1, type: 'date', x: 220, y: 80, signerIds: ['b'] },
    ];
    renderPage({ initialFields: fields });
    // No boundary with just one field selected.
    fireEvent.click(screen.getByRole('group', { name: /signature field for/i }));
    // no semantic role: dashed bounding-box overlay is decorative (rule 4.6 escape hatch)
    expect(screen.queryByTestId('group-boundary')).not.toBeInTheDocument();
    // Shift-click adds the second field — now the boundary appears.
    fireEvent.click(screen.getByRole('group', { name: /date field for/i }), { shiftKey: true });
    expect(screen.getByTestId('group-boundary')).toBeInTheDocument();
  });

  it('zooms the canvas via toolbar +/- buttons and resets via the percentage chip', () => {
    renderPage();
    // Default zoom is 100%.
    expect(screen.getByRole('button', { name: /zoom 100%/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    // Single step = 25% → 125%.
    expect(screen.getByRole('button', { name: /zoom 125%/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(screen.getByRole('button', { name: /zoom 150%/i })).toBeInTheDocument();
    // Clicking the percentage chip resets to 100%.
    fireEvent.click(screen.getByRole('button', { name: /zoom 150%/i }));
    expect(screen.getByRole('button', { name: /zoom 100%/i })).toBeInTheDocument();
    // Zoom out below 100%.
    fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }));
    expect(screen.getByRole('button', { name: /zoom 75%/i })).toBeInTheDocument();
  });

  it('Cmd+click toggling a single field keeps it selected (mousedown+mouseup+click should not double-toggle)', () => {
    // Guard against a regression where both PlacedField's mousedown AND the
    // browser's trailing click both called onSelect — under Cmd+click that
    // toggled the field on then immediately off, leaving no selection.
    const fields: ReadonlyArray<PlacedFieldValue> = [
      { id: 'f1', page: 1, type: 'signature', x: 20, y: 20, signerIds: ['a'] },
    ];
    renderPage({ initialFields: fields });
    const sig = screen.getByRole('group', { name: /signature field for/i });
    // Simulate a full native click sequence: mousedown → mouseup → click.
    fireEvent.mouseDown(sig, { button: 0, metaKey: true });
    fireEvent.mouseUp(sig, { button: 0, metaKey: true });
    fireEvent.click(sig, { metaKey: true });
    // After Cmd+click the field must still be selected — proven by the
    // selection-only "Assign signers" pill being visible.
    expect(screen.getByRole('button', { name: /assign signers/i })).toBeInTheDocument();
  });

  // Regression: in continuous-scroll mode `currentPage` tracks scroll, not the
  // selection's page. The group "duplicate to pages" handler used to filter
  // source fields by `currentPage`, so scrolling away from the group before
  // applying silently dropped every clone. The fix anchors on `groupRect.page`
  // instead — the page where the selected fields actually live.
  it('duplicates a group to all pages even when the user scrolled away from the group before applying', () => {
    const fields: ReadonlyArray<PlacedFieldValue> = [
      { id: 'f1', page: 1, type: 'signature', x: 20, y: 20, signerIds: ['a'] },
      { id: 'f2', page: 1, type: 'date', x: 220, y: 50, signerIds: ['b'] },
    ];
    const onFieldsChange = vi.fn();
    renderPage({ initialFields: fields, onFieldsChangeSpy: onFieldsChange, totalPages: 4 });
    const sig = screen.getByRole('group', { name: /signature field for/i });
    const date = screen.getByRole('group', { name: /date field for/i });
    fireEvent.click(sig);
    fireEvent.click(date, { shiftKey: true });
    // Advance current page via the toolbar — this is what reproduced the bug:
    // clicking "Next page" sets currentPage=3 while the group stays on page 1.
    fireEvent.click(screen.getByRole('button', { name: /next page/i }));
    fireEvent.click(screen.getByRole('button', { name: /next page/i }));
    expect(screen.getByRole('document', { name: /page 3 of 4/i })).toBeInTheDocument();
    // The group toolbar stays pinned to the group's page in the DOM tree and
    // is still accessible via testing-library.
    fireEvent.click(screen.getByRole('button', { name: /duplicate selected fields/i }));
    const dialog = screen.getByRole('dialog', { name: /place on/i });
    fireEvent.click(within(dialog).getByRole('button', { name: /apply/i }));
    const next = onFieldsChange.mock.calls.at(-1)?.[0] as ReadonlyArray<PlacedFieldValue>;
    // Two originals on page 1 + two clones per target page × three target
    // pages (2, 3, 4) = eight fields total. Before the fix this was just 2.
    expect(next).toHaveLength(8);
    expect(next.filter((f) => f.page === 1)).toHaveLength(2);
    expect(next.filter((f) => f.page === 2)).toHaveLength(2);
    expect(next.filter((f) => f.page === 3)).toHaveLength(2);
    expect(next.filter((f) => f.page === 4)).toHaveLength(2);
    // Each page's clone row preserves the originals' coordinates + signers.
    const clonesOnP4 = next.filter((f) => f.page === 4);
    expect(clonesOnP4.map((f) => f.x).sort()).toEqual([20, 220]);
    expect(clonesOnP4.flatMap((f) => f.signerIds).sort()).toEqual(['a', 'b']);
  });

  it('renders the Save-as-template affordance only when the route opts in via onSaveAsTemplate', () => {
    // Without the prop the page hides the affordance entirely — the
    // legacy callers (sign-only flows, demo views) never see it.
    const { unmount } = renderPage();
    expect(screen.queryByRole('button', { name: /save current layout as a template/i })).toBeNull();
    unmount();

    // With the prop wired the route shows the dashed quiet button.
    const onSaveAsTemplate = vi.fn();
    renderPage({ onSaveAsTemplate });
    const btn = screen.getByRole('button', { name: /save current layout as a template/i });
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(onSaveAsTemplate).toHaveBeenCalledOnce();
  });

  it('disables the Save-as-template button when no fields have been placed', () => {
    const onSaveAsTemplate = vi.fn();
    renderPage({ onSaveAsTemplate, initialFields: [] });
    const btn = screen.getByRole('button', { name: /save current layout as a template/i });
    expect(btn).toBeDisabled();
  });
});

// Persistent groups (issue #2): the GroupToolbar exposes a Group / Ungroup
// affordance so the user can bind 2+ selected fields together (so they
// move and duplicate as one) and later release them to position
// individually. These tests assert each piece of the round trip:
//  (1) the affordance is the correct one for the current selection state,
//  (2) clicking Group writes a shared groupId on every selected field,
//  (3) clicking any group member auto-expands the selection back to the
//      whole group (so a single click → drag-as-one),
//  (4) clicking Ungroup strips the groupId off every selected field.
describe('DocumentPage — persistent group / ungroup', () => {
  it('shows the Group button while two ungrouped fields are selected, and writes a shared groupId on click', () => {
    const fields: ReadonlyArray<PlacedFieldValue> = [
      { id: 'f1', page: 1, type: 'signature', x: 20, y: 20, signerIds: ['a'] },
      { id: 'f2', page: 1, type: 'date', x: 220, y: 50, signerIds: ['b'] },
    ];
    const onFieldsChange = vi.fn();
    renderPage({ initialFields: fields, onFieldsChangeSpy: onFieldsChange });
    fireEvent.click(screen.getByRole('group', { name: /signature field for/i }));
    fireEvent.click(screen.getByRole('group', { name: /date field for/i }), { shiftKey: true });
    // Group affordance is visible; Ungroup is NOT (no groupId yet).
    const groupBtn = screen.getByRole('button', { name: /group selected fields/i });
    expect(groupBtn).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /ungroup selected fields/i })).toBeNull();
    fireEvent.click(groupBtn);
    const next = onFieldsChange.mock.calls.at(-1)?.[0] as ReadonlyArray<PlacedFieldValue>;
    expect(next).toHaveLength(2);
    // Both fields share the same fresh groupId (`g_…`).
    const ids = new Set(next.map((f) => f.groupId));
    expect(ids.size).toBe(1);
    expect([...ids][0]).toMatch(/^g_/);
  });

  it('auto-expands a single click on any group member to select the whole group, then ungroups them', () => {
    // Pre-grouped fixture: both fields already share `g_a`, simulating
    // a session that had previously hit the Group action.
    const fields: ReadonlyArray<PlacedFieldValue> = [
      { id: 'f1', page: 1, type: 'signature', x: 20, y: 20, signerIds: ['a'], groupId: 'g_a' },
      { id: 'f2', page: 1, type: 'date', x: 220, y: 50, signerIds: ['b'], groupId: 'g_a' },
    ];
    const onFieldsChange = vi.fn();
    renderPage({ initialFields: fields, onFieldsChangeSpy: onFieldsChange });
    // Single click on ONE member should expand to both → group toolbar
    // shows "2 selected" and offers Ungroup (not Group, because the
    // selection is already fully grouped).
    fireEvent.click(screen.getByRole('group', { name: /signature field for/i }));
    expect(screen.getByText(/2 selected/i)).toBeInTheDocument();
    const ungroupBtn = screen.getByRole('button', { name: /ungroup selected fields/i });
    expect(ungroupBtn).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^group selected fields$/i })).toBeNull();
    fireEvent.click(ungroupBtn);
    const next = onFieldsChange.mock.calls.at(-1)?.[0] as ReadonlyArray<PlacedFieldValue>;
    expect(next).toHaveLength(2);
    // groupId is removed (not just set to undefined) so subsequent
    // selections behave as if the fields had never been grouped.
    for (const f of next) {
      expect('groupId' in f).toBe(false);
    }
  });

  it('does not include the Group button when the selection is already fully grouped', () => {
    const fields: ReadonlyArray<PlacedFieldValue> = [
      { id: 'f1', page: 1, type: 'signature', x: 20, y: 20, signerIds: ['a'], groupId: 'g_a' },
      { id: 'f2', page: 1, type: 'date', x: 220, y: 50, signerIds: ['b'], groupId: 'g_a' },
    ];
    renderPage({ initialFields: fields });
    fireEvent.click(screen.getByRole('group', { name: /signature field for/i }));
    // Ungroup is the only group/ungroup affordance shown.
    expect(screen.getByRole('button', { name: /ungroup selected fields/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^group selected fields$/i })).toBeNull();
  });
});
