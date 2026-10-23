import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { renderWithTheme } from '../../test/renderWithTheme';
import type { SignMeDocument, SignMeField } from '@/features/signing';
import { DocumentRail, summarizeDocuments } from './DocumentRail';

const DOCS: ReadonlyArray<SignMeDocument> = [
  { id: 'a', ord: 1, title: 'Master agreement', original_pages: 3 },
  { id: 'b', ord: 2, title: 'Side letter', original_pages: 1 },
  { id: 'c', ord: 3, title: 'Cover note', original_pages: 1 },
];

function field(
  partial: Partial<SignMeField> & Pick<SignMeField, 'id' | 'document_id'>,
): SignMeField {
  return {
    signer_id: 's',
    kind: 'text',
    page: 1,
    x: 0.1,
    y: 0.1,
    required: true,
    value_text: null,
    ...partial,
  } as SignMeField;
}

const isFilled = (f: SignMeField): boolean => Boolean(f.value_text);

describe('summarizeDocuments', () => {
  it('counts the required fields still empty on each document', () => {
    const fields = [
      field({ id: '1', document_id: 'a' }),
      field({ id: '2', document_id: 'a', value_text: 'x' }),
      field({ id: '3', document_id: 'a', required: false }),
      field({ id: '4', document_id: 'b', value_text: 'y' }),
    ];
    expect(summarizeDocuments(DOCS, fields, isFilled)).toEqual([
      { id: 'a', title: 'Master agreement', remaining: 1, total: 3 },
      { id: 'b', title: 'Side letter', remaining: 0, total: 1 },
      { id: 'c', title: 'Cover note', remaining: 0, total: 0 },
    ]);
  });
});

describe('DocumentRail', () => {
  const items = [
    { id: 'a', title: 'Master agreement', remaining: 2, total: 3 },
    { id: 'b', title: 'Side letter', remaining: 0, total: 1 },
    { id: 'c', title: 'Cover note', remaining: 0, total: 0 },
  ];

  it('names each document with its position and what is left on it', () => {
    renderWithTheme(<DocumentRail documents={items} activeId="a" onSelect={vi.fn()} />);
    expect(screen.getByRole('navigation', { name: 'Documents to sign' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Master agreement, document 1 of 3, 2 left' }),
    ).toHaveAttribute('aria-current', 'true');
    expect(
      screen.getByRole('button', { name: 'Side letter, document 2 of 3, Done' }),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Cover note, document 3 of 3, Nothing to fill' }),
    ).toBeVisible();
  });

  it('moves between documents', () => {
    const onSelect = vi.fn();
    renderWithTheme(<DocumentRail documents={items} activeId="a" onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: /side letter/i }));
    expect(onSelect).toHaveBeenCalledWith('b');
  });

  it('has no axe violations', async () => {
    const { container } = renderWithTheme(
      <DocumentRail documents={items} activeId="a" onSelect={vi.fn()} />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
