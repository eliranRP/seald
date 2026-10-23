import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { renderWithTheme } from '../../test/renderWithTheme';
import { Disclosure } from './Disclosure';

describe('Disclosure', () => {
  it('hides its content until the toggle is pressed', async () => {
    const user = userEvent.setup();
    renderWithTheme(
      <Disclosure label="Advanced">
        <p>Hidden note</p>
      </Disclosure>,
    );
    const toggle = screen.getByRole('button', { name: 'Advanced' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Hidden note')).not.toBeInTheDocument();
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Hidden note')).toBeInTheDocument();
    await user.click(toggle);
    expect(screen.queryByText('Hidden note')).not.toBeInTheDocument();
  });

  it('takes an accessible name that starts with the label', () => {
    renderWithTheme(
      <Disclosure label="Advanced" ariaLabel="Advanced options">
        <p>Hidden note</p>
      </Disclosure>,
    );
    expect(screen.getByRole('button', { name: 'Advanced options' })).toBeInTheDocument();
  });

  it('has no axe violations open or closed', async () => {
    const user = userEvent.setup();
    const { container } = renderWithTheme(
      <Disclosure label="Advanced">
        <p>Hidden note</p>
      </Disclosure>,
    );
    expect(await axe(container)).toHaveNoViolations();
    await user.click(screen.getByRole('button', { name: 'Advanced' }));
    expect(await axe(container)).toHaveNoViolations();
  });
});
