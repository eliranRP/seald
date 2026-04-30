import { describe, it, expect, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { SAMPLE_TEMPLATES as TEMPLATES } from '@/test/templateFixtures';
import { renderWithTheme } from '../../test/renderWithTheme';
import { TemplateCard } from './TemplateCard';

const TEMPLATE = TEMPLATES[0]!;

describe('TemplateCard', () => {
  it('renders the template name, page count chip, and stats', () => {
    const onUse = vi.fn();
    const { getByRole, getByText } = renderWithTheme(
      <TemplateCard template={TEMPLATE} onUse={onUse} />,
    );
    expect(getByRole('heading', { level: 3, name: TEMPLATE.name })).toBeInTheDocument();
    // The MiniThumb pages chip ("6p") sits inside the thumbnail.
    expect(getByText(`${TEMPLATE.pages}p`)).toBeInTheDocument();
    // Stats row mentions field count + use count + last-used date.
    expect(getByText(String(TEMPLATE.fieldCount))).toBeInTheDocument();
    expect(getByText(`Used ${TEMPLATE.uses}×`)).toBeInTheDocument();
    expect(getByText(TEMPLATE.lastUsed)).toBeInTheDocument();
  });

  it('clicking the card root fires onUse with the template', async () => {
    const onUse = vi.fn();
    const { getByRole } = renderWithTheme(<TemplateCard template={TEMPLATE} onUse={onUse} />);
    // Whole card is keyboard-actionable as a button labelled by the name.
    await userEvent.click(getByRole('button', { name: TEMPLATE.name }));
    expect(onUse).toHaveBeenCalledWith(TEMPLATE);
  });

  it('clicking the hover overlay Use button fires onUse without bubbling twice', async () => {
    const onUse = vi.fn();
    const { getByRole } = renderWithTheme(<TemplateCard template={TEMPLATE} onUse={onUse} />);
    await userEvent.click(getByRole('button', { name: `Use ${TEMPLATE.name}` }));
    expect(onUse).toHaveBeenCalledTimes(1);
    expect(onUse).toHaveBeenCalledWith(TEMPLATE);
  });

  it('clicking Edit fires onEdit and does not bubble to onUse', async () => {
    const onUse = vi.fn();
    const onEdit = vi.fn();
    const { getByRole } = renderWithTheme(
      <TemplateCard template={TEMPLATE} onUse={onUse} onEdit={onEdit} />,
    );
    await userEvent.click(getByRole('button', { name: `Edit ${TEMPLATE.name}` }));
    expect(onEdit).toHaveBeenCalledWith(TEMPLATE);
    expect(onUse).not.toHaveBeenCalled();
  });

  it('clicking Delete fires onDelete and does not bubble to onUse', async () => {
    const onUse = vi.fn();
    const onDelete = vi.fn();
    const { getByRole } = renderWithTheme(
      <TemplateCard template={TEMPLATE} onUse={onUse} onDelete={onDelete} />,
    );
    await userEvent.click(getByRole('button', { name: `Delete ${TEMPLATE.name}` }));
    expect(onDelete).toHaveBeenCalledWith(TEMPLATE);
    expect(onUse).not.toHaveBeenCalled();
  });

  it('clicking a tag pill fires onTagClick with the tag', async () => {
    const onUse = vi.fn();
    const onTagClick = vi.fn();
    const tagged = { ...TEMPLATE, tags: ['Legal', 'Sales'] };
    const { getByRole } = renderWithTheme(
      <TemplateCard template={tagged} onUse={onUse} onTagClick={onTagClick} />,
    );
    await userEvent.click(getByRole('button', { name: 'Legal' }));
    expect(onTagClick).toHaveBeenCalledWith('Legal');
    expect(onUse).not.toHaveBeenCalled();
  });

  it('Tags overlay action fires onEditTags', async () => {
    const onUse = vi.fn();
    const onEditTags = vi.fn();
    const { getByRole } = renderWithTheme(
      <TemplateCard template={TEMPLATE} onUse={onUse} onEditTags={onEditTags} />,
    );
    await userEvent.click(getByRole('button', { name: `Edit tags for ${TEMPLATE.name}` }));
    expect(onEditTags).toHaveBeenCalledWith(TEMPLATE);
  });

  it('hides Delete + Edit + Tags overlay actions when callbacks are not supplied', () => {
    const { queryByRole } = renderWithTheme(<TemplateCard template={TEMPLATE} onUse={vi.fn()} />);
    expect(queryByRole('button', { name: new RegExp(`Edit ${TEMPLATE.name}$`, 'i') })).toBeNull();
    expect(queryByRole('button', { name: new RegExp(`Delete ${TEMPLATE.name}$`, 'i') })).toBeNull();
    expect(
      queryByRole('button', { name: new RegExp(`Edit tags for ${TEMPLATE.name}$`, 'i') }),
    ).toBeNull();
  });
});
