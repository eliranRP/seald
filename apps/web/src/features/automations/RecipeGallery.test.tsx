import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { renderWithTheme } from '@/test/renderWithTheme';
import { RecipeGallery } from './RecipeGallery';
import type { RecipeCard } from './model';

const CARDS: readonly RecipeCard[] = [
  {
    id: 'sealed_save_drive',
    kind: 'drive',
    title: 'Save sealed copies to Drive',
    line: 'Every finished document lands in My Drive / Seald.',
  },
  {
    id: 'sealed_webhook',
    kind: 'webhook',
    title: 'Send a webhook when sealed',
    line: 'Post a signed message to your own address when a document is sealed.',
  },
];

describe('RecipeGallery', () => {
  it('shows one line and "Use this" per card, and hands back the chosen card', async () => {
    const user = userEvent.setup();
    const onUse = vi.fn();
    renderWithTheme(<RecipeGallery cards={CARDS} heading="Pick one to start" onUse={onUse} />);

    expect(screen.getByRole('region', { name: 'Pick one to start' })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: 'Use this: Send a webhook when sealed' }));
    expect(onUse).toHaveBeenCalledWith(CARDS[1]);
  });

  it('while one card saves, its button spins and the others wait', () => {
    renderWithTheme(
      <RecipeGallery cards={CARDS} heading="Pick one" busyId="sealed_save_drive" onUse={vi.fn()} />,
    );
    expect(
      screen.getByRole('button', { name: 'Use this: Save sealed copies to Drive' }),
    ).toHaveAttribute('aria-busy', 'true');
    expect(
      screen.getByRole('button', { name: 'Use this: Send a webhook when sealed' }),
    ).toBeDisabled();
  });

  it('has no axe violations', async () => {
    const { container } = renderWithTheme(
      <RecipeGallery cards={CARDS} heading="Pick one to start" onUse={vi.fn()} />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
