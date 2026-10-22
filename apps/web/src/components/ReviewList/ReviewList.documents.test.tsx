import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithTheme } from '../../test/renderWithTheme';
import { ReviewList } from './ReviewList';
import type { ReviewItem } from './ReviewList.types';

describe('ReviewList with documents', () => {
  const items: ReadonlyArray<ReviewItem> = [
    {
      id: 'a',
      kind: 'signature',
      label: 'Signature',
      page: 1,
      documentTitle: 'Master agreement',
      valuePreview: 'Maya',
      onEdit: () => {},
    },
    {
      id: 'b',
      kind: 'signature',
      label: 'Signature',
      page: 1,
      documentTitle: 'Side letter',
      valuePreview: 'Maya',
      onEdit: () => {},
    },
  ];

  it('names the document next to the page and tells the Edit buttons apart', () => {
    renderWithTheme(<ReviewList items={items} />);
    expect(screen.getByText('Page 1 · Master agreement')).toBeInTheDocument();
    expect(screen.getByText('Page 1 · Side letter')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Edit Signature in Master agreement' }),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Edit Signature in Side letter' })).toBeVisible();
  });

  it('is unchanged when no row names a document', () => {
    renderWithTheme(
      <ReviewList
        items={[
          { id: 'x', kind: 'text', label: 'Text', page: 2, valuePreview: 'v', onEdit: () => {} },
        ]}
      />,
    );
    expect(screen.getByText('Page 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit Text' })).toBeVisible();
  });
});
