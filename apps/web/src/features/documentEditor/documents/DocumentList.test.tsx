import { describe, expect, it, vi } from 'vitest';
import { createEvent, fireEvent, screen, within } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { renderWithTheme } from '../../../test/renderWithTheme';
import { DocumentList } from './DocumentList';
import type { DocumentListItem } from './DocumentList';

const DOCS: ReadonlyArray<DocumentListItem> = [
  { id: 'd1', title: 'Master agreement', pages: 3 },
  { id: 'd2', title: 'Side letter', pages: 1 },
  { id: 'd3', title: 'Schedule A', pages: 2 },
];

function pdf(name: string, size = 1024): File {
  const file = new File(['x'], name, { type: 'application/pdf' });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

function rowNames(): string[] {
  const list = screen.getByRole('list');
  return within(list)
    .getAllByRole('listitem')
    .map((li) => within(li).getAllByRole('button')[0]?.getAttribute('aria-label') ?? '');
}

describe('DocumentList', () => {
  it('lists the documents in order with page counts and marks the current one', () => {
    renderWithTheme(<DocumentList documents={DOCS} activeId="d2" />);
    expect(screen.getByRole('region', { name: 'Documents' })).toBeInTheDocument();
    expect(rowNames()).toEqual([
      'Master agreement, document 1 of 3',
      'Side letter, document 2 of 3',
      'Schedule A, document 3 of 3',
    ]);
    expect(screen.getByText('3 pages')).toBeInTheDocument();
    expect(screen.getByText('1 page')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /side letter, document 2 of 3/i })).toHaveAttribute(
      'aria-current',
      'true',
    );
    expect(
      screen.getByRole('button', { name: /master agreement, document 1/i }),
    ).not.toHaveAttribute('aria-current');
  });

  it('selects a document on click', () => {
    const onSelect = vi.fn();
    renderWithTheme(<DocumentList documents={DOCS} activeId="d1" onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: /schedule a, document 3/i }));
    expect(onSelect).toHaveBeenCalledWith('d3');
  });

  it('reorders from the keyboard with the Move buttons and announces it', () => {
    const onReorder = vi.fn();
    renderWithTheme(<DocumentList documents={DOCS} onReorder={onReorder} />);

    fireEvent.click(screen.getByRole('button', { name: 'Move Side letter up' }));
    expect(onReorder).toHaveBeenLastCalledWith(['d2', 'd1', 'd3']);
    expect(screen.getByRole('status')).toHaveTextContent('Moved Side letter to position 1 of 3.');

    fireEvent.click(screen.getByRole('button', { name: 'Move Master agreement down' }));
    expect(onReorder).toHaveBeenLastCalledWith(['d2', 'd1', 'd3']);
  });

  it('disables Move up on the first row and Move down on the last', () => {
    renderWithTheme(<DocumentList documents={DOCS} onReorder={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Move Master agreement up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move Schedule A down' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move Side letter up' })).toBeEnabled();
  });

  it('reorders by dragging a row onto another', () => {
    const onReorder = vi.fn();
    renderWithTheme(<DocumentList documents={DOCS} onReorder={onReorder} />);
    const items = screen.getAllByRole('listitem');
    const data = { effectAllowed: '', dropEffect: '', setData: vi.fn() };
    const start = createEvent.dragStart(items[2]!);
    Object.defineProperty(start, 'dataTransfer', { value: data });
    fireEvent(items[2]!, start);
    const over = createEvent.dragOver(items[0]!);
    Object.defineProperty(over, 'dataTransfer', { value: data });
    fireEvent(items[0]!, over);
    const drop = createEvent.drop(items[0]!);
    Object.defineProperty(drop, 'dataTransfer', { value: data });
    fireEvent(items[0]!, drop);
    expect(onReorder).toHaveBeenCalledWith(['d3', 'd1', 'd2']);
  });

  it('has no reorder controls when there is nothing to reorder', () => {
    renderWithTheme(<DocumentList documents={[DOCS[0]!]} onReorder={vi.fn()} onRemove={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /move/i })).not.toBeInTheDocument();
    // The last document cannot be removed.
    expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument();
  });

  it('removes a document', () => {
    const onRemove = vi.fn();
    renderWithTheme(<DocumentList documents={DOCS} onRemove={onRemove} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove Side letter' }));
    expect(onRemove).toHaveBeenCalledWith('d2');
  });

  it('passes valid PDFs to onAddFiles and reports the ones it rejects', () => {
    const onAddFiles = vi.fn();
    renderWithTheme(<DocumentList documents={DOCS.slice(0, 1)} onAddFiles={onAddFiles} />);
    const input = screen.getByLabelText(/choose pdf files to add/i);
    expect(input).toHaveAttribute('multiple');
    const good = pdf('exhibit.pdf');
    fireEvent.change(input, {
      target: {
        files: [
          good,
          new File(['x'], 'notes.txt', { type: 'text/plain' }),
          pdf('huge.pdf', 26 * 1024 * 1024),
        ],
      },
    });
    expect(onAddFiles).toHaveBeenCalledWith([good]);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('notes.txt is not a PDF.');
    expect(alert).toHaveTextContent('huge.pdf is larger than 25 MB.');
  });

  it('caps the list at the maximum and says so', () => {
    const onAddFiles = vi.fn();
    renderWithTheme(
      <DocumentList documents={DOCS.slice(0, 2)} maxDocuments={2} onAddFiles={onAddFiles} />,
    );
    expect(screen.getByRole('button', { name: 'Add document' })).toBeDisabled();
    expect(screen.getByText(/holds up to 2 documents/i)).toBeInTheDocument();
  });

  it('offers Google Drive only when asked to', () => {
    const onAddFromDrive = vi.fn();
    const { rerender } = renderWithTheme(<DocumentList documents={DOCS} onAddFiles={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /google drive/i })).not.toBeInTheDocument();
    rerender(
      <DocumentList documents={DOCS} onAddFiles={vi.fn()} onAddFromDrive={onAddFromDrive} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /add from google drive/i }));
    expect(onAddFromDrive).toHaveBeenCalledTimes(1);
  });

  it('has no axe violations', async () => {
    const { container } = renderWithTheme(
      <DocumentList
        documents={DOCS}
        activeId="d1"
        onSelect={vi.fn()}
        onReorder={vi.fn()}
        onRemove={vi.fn()}
        onAddFiles={vi.fn()}
      />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
