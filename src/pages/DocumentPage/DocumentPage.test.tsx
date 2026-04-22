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

  it('emits onFieldsChange with a new field when a palette drag is dropped on the canvas', () => {
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
    expect(next?.length).toBe(1);
    expect(next?.[0]?.type).toBe('signature');
    expect(next?.[0]?.page).toBe(1);
    expect(next?.[0]?.signerIds).toEqual(['a']);
  });

  it('opens the signer popover from a PlacedField and applies selection', () => {
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

    const firstCall = onFieldsChangeSpy.mock.calls[0];
    const next = firstCall ? firstCall[0] : undefined;
    expect(next?.[0]?.signerIds).toEqual(['a', 'b']);
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
});
