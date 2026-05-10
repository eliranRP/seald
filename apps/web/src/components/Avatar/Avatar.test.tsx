import { describe, it, expect } from 'vitest';
import { act } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { renderWithTheme } from '../../test/renderWithTheme';
import { Avatar } from './Avatar';

describe('Avatar', () => {
  it('renders initials fallback with role="img" aria-label', () => {
    const { getByRole } = renderWithTheme(<Avatar name="Jamie Okonkwo" />);
    expect(getByRole('img', { name: 'Jamie Okonkwo' })).toBeInTheDocument();
  });

  it('renders an <img> pointing at imageUrl when provided', () => {
    const { getByRole, container } = renderWithTheme(
      <Avatar name="Jamie" imageUrl="https://example.com/a.png" />,
    );
    // The AvatarRoot owns the accessible name; the <img> itself is decorative
    // (empty alt + aria-hidden) so a broken URL doesn't surface alt text as a
    // fallback inside the 32px circle.
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('src')).toBe('https://example.com/a.png');
    expect(img?.getAttribute('alt')).toBe('');
    expect(getByRole('img', { name: 'Jamie' })).toBeInTheDocument();
  });

  it('falls back to initials when the image fails to load', () => {
    const { getByText, container, getByRole } = renderWithTheme(
      <Avatar name="Jamie Okonkwo" imageUrl="https://example.com/broken.png" />,
    );
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    act(() => {
      img?.dispatchEvent(new Event('error'));
    });
    // Initials take over once onError fires.
    expect(getByText('JO')).toBeInTheDocument();
    expect(getByRole('img', { name: 'Jamie Okonkwo' })).toBeInTheDocument();
  });

  it('derives initials from first and last char of words', () => {
    const { getByText } = renderWithTheme(<Avatar name="Jamie Okonkwo" />);
    expect(getByText('JO')).toBeInTheDocument();
  });

  it('has no axe violations', async () => {
    const { container } = renderWithTheme(<Avatar name="JO" />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('forwards ref to the root div', () => {
    const ref = { current: null as HTMLDivElement | null };
    renderWithTheme(<Avatar name="X" ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });

  it('forwards rest props (data-*, className) to the root div', () => {
    const { getByRole } = renderWithTheme(
      <Avatar name="X" data-testid="avatar" className="custom" />,
    );
    const el = getByRole('img');
    expect(el).toHaveAttribute('data-testid', 'avatar');
    expect(el).toHaveClass('custom');
  });

  // Bug 2026-05-10 (user report on Contacts page): three contacts named
  // "Top", "Eliran NRO", "Eliran Azulay" all rendered the same dark
  // (slate) avatar because the previous pickTone hashed only the first
  // character of the name (`name.charCodeAt(0) % 5`). Hashing the full
  // string makes names that share a first letter fall onto distinct
  // tones in almost every realistic case.
  it('renders distinct background tones for names that share their first character', () => {
    const names = ['Top', 'Eliran NRO', 'Eliran Azulay'];
    const { getByRole } = renderWithTheme(
      <>
        {names.map((n) => (
          <Avatar key={n} name={n} />
        ))}
      </>,
    );
    const colors = names.map(
      (n) => window.getComputedStyle(getByRole('img', { name: n })).backgroundColor,
    );
    expect(colors.every((c) => c.length > 0)).toBe(true);
    expect(new Set(colors).size).toBe(colors.length);
  });
});
