import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import { axe } from 'vitest-axe';
import type { EnvelopeDocument } from 'shared';
import { renderWithTheme } from '../../../test/renderWithTheme';
import { EnvelopeDocumentsCard } from './EnvelopeDocumentsCard';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const SEALED_A = 'c'.repeat(64);

const DOCS: ReadonlyArray<EnvelopeDocument> = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    ord: 1,
    title: 'Master agreement',
    original_pages: 3,
    original_sha256: HASH_A,
    sealed_sha256: SEALED_A,
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    ord: 2,
    title: 'Side letter',
    original_pages: 1,
    original_sha256: HASH_B,
    sealed_sha256: null,
  },
];

describe('EnvelopeDocumentsCard', () => {
  it('lists each document with its page count and hashes', () => {
    renderWithTheme(<EnvelopeDocumentsCard documents={DOCS} sealed onDownload={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Documents (2)' })).toBeInTheDocument();
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(within(items[0]!).getByText('Master agreement')).toBeInTheDocument();
    expect(within(items[0]!).getByText('3 pages')).toBeInTheDocument();
    expect(screen.getByLabelText('Original SHA-256 of Master agreement')).toHaveTextContent(HASH_A);
    expect(screen.getByLabelText('Sealed SHA-256 of Master agreement')).toHaveTextContent(SEALED_A);
    expect(screen.getByLabelText('Original SHA-256 of Side letter')).toHaveTextContent(HASH_B);
    // No sealed hash yet for the second one.
    expect(screen.queryByLabelText('Sealed SHA-256 of Side letter')).not.toBeInTheDocument();
  });

  it('downloads one document, sealed once sealed and original before that', () => {
    const onDownload = vi.fn();
    const { rerender } = renderWithTheme(
      <EnvelopeDocumentsCard documents={DOCS} sealed={false} onDownload={onDownload} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Download original Side letter' }));
    expect(onDownload).toHaveBeenLastCalledWith(DOCS[1]);
    rerender(<EnvelopeDocumentsCard documents={DOCS} sealed onDownload={onDownload} />);
    fireEvent.click(screen.getByRole('button', { name: 'Download sealed Master agreement' }));
    expect(onDownload).toHaveBeenLastCalledWith(DOCS[0]);
  });

  it('offers "Download all (zip)" only once sealed', () => {
    const onDownloadAll = vi.fn();
    const { rerender } = renderWithTheme(
      <EnvelopeDocumentsCard
        documents={DOCS}
        sealed={false}
        onDownload={vi.fn()}
        onDownloadAll={onDownloadAll}
      />,
    );
    expect(screen.queryByRole('button', { name: /download all/i })).not.toBeInTheDocument();
    rerender(
      <EnvelopeDocumentsCard
        documents={DOCS}
        sealed
        onDownload={vi.fn()}
        onDownloadAll={onDownloadAll}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /download all \(zip\)/i }));
    expect(onDownloadAll).toHaveBeenCalledTimes(1);
  });

  it('reorders and removes on a draft', () => {
    const onMove = vi.fn();
    const onRemove = vi.fn();
    renderWithTheme(
      <EnvelopeDocumentsCard
        documents={DOCS}
        sealed={false}
        onDownload={vi.fn()}
        onMove={onMove}
        onRemove={onRemove}
      />,
    );
    expect(screen.getByRole('button', { name: 'Move Master agreement up' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Move Side letter up' }));
    expect(onMove).toHaveBeenCalledWith(DOCS[1]!.id, 'up');
    fireEvent.click(screen.getByRole('button', { name: 'Remove Side letter' }));
    expect(onRemove).toHaveBeenCalledWith(DOCS[1]!.id);
  });

  it('has no reorder or remove controls without handlers', () => {
    renderWithTheme(<EnvelopeDocumentsCard documents={DOCS} sealed onDownload={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /move/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument();
  });

  it('has no axe violations', async () => {
    const { container } = renderWithTheme(
      <EnvelopeDocumentsCard
        documents={DOCS}
        sealed
        onDownload={vi.fn()}
        onDownloadAll={vi.fn()}
      />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
