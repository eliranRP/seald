import { describe, it, expect, vi } from 'vitest';
import { within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import type { TemplateSummary } from '@/features/templates';
import { renderWithTheme } from '../../test/renderWithTheme';
import { TemplateCard, templateMenuEntries, templateUsageText } from './TemplateCard';

const NOW = new Date('2026-10-23T12:00:00.000Z');
const daysAgo = (d: number): string => new Date(NOW.getTime() - d * 86_400_000).toISOString();

const TEMPLATE: TemplateSummary = {
  id: 'tpl-nda',
  name: 'NDA — standard',
  pages: 3,
  fieldCount: 4,
  lastUsed: '10/20/2026',
  lastUsedAt: daysAgo(3),
  uses: 12,
  cover: '#EEF2FF',
  exampleFile: '',
  fields: [],
  tags: ['Legal'],
  lastSigners: [
    { id: 'c1', name: 'Hannah Wills', email: 'hannah@quill.vc', color: '#7DD3FC' },
    { id: 'c2', name: 'You', email: 'you@seald.app', color: '#F472B6' },
  ],
};

describe('templateUsageText', () => {
  it('reads "Used 12× · 3d ago" for a used template', () => {
    expect(templateUsageText(TEMPLATE, NOW)).toBe('Used 12× · 3d ago');
  });
  it('reads "Not used yet" for a template nobody has sent', () => {
    expect(templateUsageText({ ...TEMPLATE, uses: 0, lastUsedAt: null }, NOW)).toBe('Not used yet');
  });
  it('drops the age when the last use time is unknown', () => {
    expect(templateUsageText({ ...TEMPLATE, lastUsedAt: undefined }, NOW)).toBe('Used 12×');
  });
});

describe('templateMenuEntries', () => {
  it('lists the actions the host supplied, with Delete last behind a separator', () => {
    const run = vi.fn();
    const entries = templateMenuEntries(TEMPLATE, {
      onEdit: run,
      onDuplicate: run,
      onEditTags: run,
      onBulkSend: run,
      onDirectLink: run,
      onDelete: run,
    });
    expect(entries.map((e) => e.id)).toEqual([
      'edit',
      'duplicate',
      'tags',
      'bulk',
      'link',
      'sep',
      'delete',
    ]);
    const del = entries[entries.length - 1];
    expect(del && 'danger' in del ? del.danger : false).toBe(true);
  });

  it('leaves out actions that were not supplied, and the separator with no other action', () => {
    expect(templateMenuEntries(TEMPLATE, { onDelete: vi.fn() }).map((e) => e.id)).toEqual([
      'delete',
    ]);
    expect(templateMenuEntries(TEMPLATE, {})).toEqual([]);
  });
});

describe('TemplateCard', () => {
  it('is one button named by the template, with usage as its description', () => {
    const { getByRole } = renderWithTheme(<TemplateCard template={TEMPLATE} onUse={vi.fn()} />);
    const card = getByRole('button', { name: 'NDA — standard' });
    expect(card).toHaveAccessibleDescription(/Used 12×/);
  });

  it('clicking the card uses the template', async () => {
    const onUse = vi.fn();
    const { getByRole } = renderWithTheme(<TemplateCard template={TEMPLATE} onUse={onUse} />);
    await userEvent.click(getByRole('button', { name: 'NDA — standard' }));
    expect(onUse).toHaveBeenCalledWith(TEMPLATE);
  });

  it('opens the ⋯ menu without using the template, and runs the chosen action', async () => {
    const onUse = vi.fn();
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    const { getByRole } = renderWithTheme(
      <TemplateCard template={TEMPLATE} onUse={onUse} onEdit={onEdit} onDelete={onDelete} />,
    );
    await userEvent.click(getByRole('button', { name: 'More for NDA — standard' }));
    const menu = getByRole('menu');
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((i) => i.textContent),
    ).toEqual(['Edit', 'Delete']);
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Edit' }));
    expect(onEdit).toHaveBeenCalledWith(TEMPLATE);
    expect(onUse).not.toHaveBeenCalled();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('has no ⋯ button when there are no actions', () => {
    const { queryByRole } = renderWithTheme(<TemplateCard template={TEMPLATE} onUse={vi.fn()} />);
    expect(queryByRole('button', { name: /^More for/ })).toBeNull();
  });

  it('compact: the ⋯ asks the host to open its sheet instead of a menu', async () => {
    const onMore = vi.fn();
    const { getByRole, queryByRole } = renderWithTheme(
      <TemplateCard template={TEMPLATE} onUse={vi.fn()} onEdit={vi.fn()} compact onMore={onMore} />,
    );
    await userEvent.click(getByRole('button', { name: 'More for NDA — standard' }));
    expect(onMore).toHaveBeenCalledWith(TEMPLATE);
    expect(queryByRole('menu')).toBeNull();
  });

  it('has no axe violations', async () => {
    const { container } = renderWithTheme(
      <TemplateCard template={TEMPLATE} onUse={vi.fn()} onEdit={vi.fn()} />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
