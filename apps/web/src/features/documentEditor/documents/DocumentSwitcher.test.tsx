import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { renderWithTheme } from '../../../test/renderWithTheme';
import { DocumentSwitcher } from './DocumentSwitcher';

const DOCS = [
  { id: 'a', title: 'Master agreement', meta: '2 fields' },
  { id: 'b', title: 'Side letter', meta: '0 fields' },
];

describe('DocumentSwitcher', () => {
  it('names each document by position and marks the current one', () => {
    renderWithTheme(<DocumentSwitcher documents={DOCS} activeId="b" onSelect={vi.fn()} />);
    expect(screen.getByRole('navigation', { name: 'Switch document' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /1\. master agreement/i })).not.toHaveAttribute(
      'aria-current',
    );
    expect(screen.getByRole('button', { name: /2\. side letter/i })).toHaveAttribute(
      'aria-current',
      'true',
    );
    expect(screen.getByText('2 fields')).toBeInTheDocument();
  });

  it('reports the document that was picked', () => {
    const onSelect = vi.fn();
    renderWithTheme(<DocumentSwitcher documents={DOCS} activeId="a" onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: /side letter/i }));
    expect(onSelect).toHaveBeenCalledWith('b');
  });

  it('has no axe violations', async () => {
    const { container } = renderWithTheme(
      <DocumentSwitcher documents={DOCS} activeId="a" onSelect={vi.fn()} />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
