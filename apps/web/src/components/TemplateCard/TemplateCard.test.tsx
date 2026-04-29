import { describe, it, expect, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { TEMPLATES } from '@/features/templates';
import { renderWithTheme } from '../../test/renderWithTheme';
import { TemplateCard } from './TemplateCard';

const TEMPLATE = TEMPLATES[0]!;

describe('TemplateCard', () => {
  it('renders the template name, id, and metadata', () => {
    const onUse = vi.fn();
    const { getByRole, getByText } = renderWithTheme(
      <TemplateCard template={TEMPLATE} onUse={onUse} />,
    );
    expect(getByRole('heading', { level: 3, name: TEMPLATE.name })).toBeInTheDocument();
    expect(getByText(TEMPLATE.id)).toBeInTheDocument();
    expect(getByText(`${TEMPLATE.pages} pages`)).toBeInTheDocument();
    expect(getByText(`${TEMPLATE.fieldCount} fields`)).toBeInTheDocument();
  });

  it('clicking Use fires onUse with the template', async () => {
    const onUse = vi.fn();
    const { getByRole } = renderWithTheme(<TemplateCard template={TEMPLATE} onUse={onUse} />);
    await userEvent.click(getByRole('button', { name: `Use ${TEMPLATE.name}` }));
    expect(onUse).toHaveBeenCalledWith(TEMPLATE);
  });

  it('clicking Edit fires onEdit when supplied', async () => {
    const onUse = vi.fn();
    const onEdit = vi.fn();
    const { getByRole } = renderWithTheme(
      <TemplateCard template={TEMPLATE} onUse={onUse} onEdit={onEdit} />,
    );
    await userEvent.click(getByRole('button', { name: `Edit ${TEMPLATE.name}` }));
    expect(onEdit).toHaveBeenCalledWith(TEMPLATE);
    // Click on Edit must not bubble up to the card-level onUse handler.
    expect(onUse).not.toHaveBeenCalled();
  });

  it('overflow menu surfaces Duplicate when onDuplicate is supplied', async () => {
    const onUse = vi.fn();
    const onDuplicate = vi.fn();
    const { getByRole, queryByRole } = renderWithTheme(
      <TemplateCard template={TEMPLATE} onUse={onUse} onDuplicate={onDuplicate} />,
    );
    expect(queryByRole('menu')).toBeNull();
    await userEvent.click(getByRole('button', { name: `More actions for ${TEMPLATE.name}` }));
    await userEvent.click(getByRole('menuitem', { name: /duplicate/i }));
    expect(onDuplicate).toHaveBeenCalledWith(TEMPLATE);
    expect(onUse).not.toHaveBeenCalled();
  });

  it('does not render the overflow trigger when onDuplicate is omitted', () => {
    const { queryByRole } = renderWithTheme(<TemplateCard template={TEMPLATE} onUse={vi.fn()} />);
    expect(queryByRole('button', { name: /more actions/i })).toBeNull();
  });
});
