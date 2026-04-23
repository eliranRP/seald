import { describe, it, expect, vi } from 'vitest';
import { fireEvent } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { createRef } from 'react';
import { renderWithTheme } from '../../test/renderWithTheme';
import { DocumentCanvas } from './DocumentCanvas';

describe('DocumentCanvas', () => {
  it('renders title, docId, and page info', () => {
    const { getByRole, getByText } = renderWithTheme(
      <DocumentCanvas currentPage={1} totalPages={4} />,
    );
    const root = getByRole('document');
    expect(root.getAttribute('aria-label')).toBe('Master Services Agreement — page 1 of 4');
    expect(getByText('Master Services Agreement')).toBeDefined();
    expect(getByText(/DOC-8F3A-4291/)).toBeDefined();
    expect(getByText(/Page 1 of 4/)).toBeDefined();
  });

  it('renders signature lines on last page by default', () => {
    const { getByText } = renderWithTheme(<DocumentCanvas currentPage={4} totalPages={4} />);
    expect(getByText('CLIENT SIGNATURE')).toBeDefined();
    expect(getByText('COUNTERPARTY SIGNATURE')).toBeDefined();
  });

  it('hides signature lines when showSignatureLines=false, even on last page', () => {
    const { queryByText } = renderWithTheme(
      <DocumentCanvas currentPage={4} totalPages={4} showSignatureLines={false} />,
    );
    expect(queryByText('CLIENT SIGNATURE')).toBeNull();
    expect(queryByText('COUNTERPARTY SIGNATURE')).toBeNull();
  });

  it('uses custom signatureLineLabels override', () => {
    const { getByText, queryByText } = renderWithTheme(
      <DocumentCanvas currentPage={2} totalPages={2} signatureLineLabels={['SELLER', 'BUYER']} />,
    );
    expect(getByText('SELLER')).toBeDefined();
    expect(getByText('BUYER')).toBeDefined();
    expect(queryByText('CLIENT SIGNATURE')).toBeNull();
  });

  it('renders children inside the paper', () => {
    const { getByTestId, getByRole } = renderWithTheme(
      <DocumentCanvas currentPage={1} totalPages={3}>
        <div data-testid="child-field">field</div>
      </DocumentCanvas>,
    );
    const root = getByRole('document');
    const child = getByTestId('child-field');
    expect(root.contains(child)).toBe(true);
  });

  it('passes through onDragOver and onDrop', () => {
    const onDragOver = vi.fn();
    const onDrop = vi.fn();
    const { getByRole } = renderWithTheme(
      <DocumentCanvas currentPage={1} totalPages={2} onDragOver={onDragOver} onDrop={onDrop} />,
    );
    const root = getByRole('document');
    fireEvent.dragOver(root);
    fireEvent.drop(root);
    expect(onDragOver).toHaveBeenCalledTimes(1);
    expect(onDrop).toHaveBeenCalledTimes(1);
  });

  it('forwards ref to the root paper element', () => {
    const ref = createRef<HTMLDivElement>();
    renderWithTheme(<DocumentCanvas ref={ref} currentPage={1} totalPages={1} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(ref.current?.getAttribute('role')).toBe('document');
  });

  it('has no axe violations', async () => {
    const { container } = renderWithTheme(
      <DocumentCanvas currentPage={3} totalPages={3} title="Contract" docId="DOC-ABCD" />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
