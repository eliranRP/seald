import { describe, it, expect } from 'vitest';
import { axe } from 'vitest-axe';
import { screen } from '@testing-library/react';
import { renderWithTheme } from '../../test/renderWithTheme';
import { FieldTile } from './FieldTile';
import type { FieldTileSigner } from './FieldTile.types';

const ANA: FieldTileSigner = { name: 'Ana Torres', color: '#F472B6' };

describe('FieldTile', () => {
  it('exposes kind, owner and required flag in one group name', () => {
    renderWithTheme(<FieldTile kind="signature" signer={ANA} />);
    const tile = screen.getByRole('group', { name: 'Signature field for Ana Torres, required' });
    expect(tile).toHaveTextContent('Signature');
    expect(tile).toHaveTextContent('Ana Torres');
  });

  it('marks an optional field in its accessible name', () => {
    renderWithTheme(<FieldTile kind="text" signer={ANA} required={false} />);
    expect(
      screen.getByRole('group', { name: 'Text field for Ana Torres, optional' }),
    ).toBeInTheDocument();
  });

  it('defaults required to true when the prop is omitted', () => {
    renderWithTheme(<FieldTile kind="date" signer={ANA} />);
    expect(
      screen.getByRole('group', { name: 'Date field for Ana Torres, required' }),
    ).toBeInTheDocument();
  });

  it('names an unassigned field as unassigned and shows the placeholder owner', () => {
    renderWithTheme(<FieldTile kind="initials" />);
    const tile = screen.getByRole('group', {
      name: 'Initials field, unassigned, required',
    });
    expect(tile).toHaveTextContent('Unassigned');
  });

  it('renders the required asterisk as decorative, not as text in the name', () => {
    renderWithTheme(<FieldTile kind="email" signer={ANA} />);
    const tile = screen.getByRole('group', { name: 'Email field for Ana Torres, required' });
    expect(tile).toHaveTextContent('*');
    expect(screen.queryByText('*')).toHaveAttribute('aria-hidden', 'true');
  });

  it('is read-only: it exposes no interactive control', () => {
    const { container } = renderWithTheme(<FieldTile kind="checkbox" signer={ANA} />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(
      container.querySelector('button, input, select, textarea, a[href], [tabindex]'),
    ).toBeNull();
  });

  it('paints the signer colour as the left swatch', () => {
    renderWithTheme(<FieldTile kind="signature" signer={ANA} />);
    const tile = screen.getByRole('group', { name: 'Signature field for Ana Torres, required' });
    expect(tile).toHaveStyle({ borderLeft: `3px solid ${ANA.color}` });
  });

  it('has no axe violations', async () => {
    const { container } = renderWithTheme(<FieldTile kind="signature" signer={ANA} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
