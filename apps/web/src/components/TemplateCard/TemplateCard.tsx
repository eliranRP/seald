import { forwardRef, useId } from 'react';
import { Copy, Link2, MoreHorizontal, Pencil, Tag, Trash2, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/Button';
import { MenuButton } from '@/components/Menu';
import type { MenuEntry } from '@/components/Menu';
import { deriveTemplateRoles } from '@/features/templates/templateRoles';
import type { TemplateSummary } from '@/features/templates';
import { relativeAgo } from '@/lib/relativeAgo';
import type { TemplateCardActions, TemplateCardProps } from './TemplateCard.types';
import { CardButton, Dot, Dots, Meta, More, Name, Text, Thumb, Wrap } from './TemplateCard.styles';

/** "Used 12× · 3d ago", or "Not used yet" for a template nobody has sent. */
export function templateUsageText(template: TemplateSummary, now?: Date): string {
  if (template.uses <= 0) return 'Not used yet';
  const ago = relativeAgo(template.lastUsedAt, now);
  return ago ? `Used ${String(template.uses)}× · ${ago}` : `Used ${String(template.uses)}×`;
}

/**
 * The card's actions as menu entries: Edit, Duplicate, Tags (then the flagged
 * Bulk send and Link), a separator and Delete. The tile shows them in a
 * menu; the phone layout shows the same entries in a sheet.
 */
export function templateMenuEntries(
  template: TemplateSummary,
  actions: TemplateCardActions,
): MenuEntry[] {
  const entries: MenuEntry[] = [];
  const add = (
    id: string,
    label: string,
    icon: LucideIcon,
    run: ((t: TemplateSummary) => void) | undefined,
    danger = false,
  ): void => {
    if (!run) return;
    entries.push({ id, label, icon, danger, onSelect: () => run(template) });
  };
  add('edit', 'Edit', Pencil, actions.onEdit);
  add('duplicate', 'Duplicate', Copy, actions.onDuplicate);
  add('tags', 'Tags', Tag, actions.onEditTags);
  add('bulk', 'Send to many', Users, actions.onBulkSend);
  add('link', 'Direct link', Link2, actions.onDirectLink);
  if (actions.onDelete) {
    if (entries.length > 0) entries.push({ type: 'separator', id: 'sep' });
    add('delete', 'Delete', Trash2, actions.onDelete, true);
  }
  return entries;
}

/**
 * L2 domain card: thumbnail, name, role dots and "Used 12× · 3d ago". The
 * whole card is one button (Use); the ⋯ menu is its sibling so the two never
 * nest. A tile on desktop, a row on phones (`compact`).
 */
export const TemplateCard = forwardRef<HTMLDivElement, TemplateCardProps>((props, ref) => {
  const {
    template,
    onUse,
    compact = false,
    onMore,
    onEdit,
    onDuplicate,
    onEditTags,
    onDelete,
    onBulkSend,
    onDirectLink,
    ...rest
  } = props;
  const nameId = useId();
  const metaId = useId();
  const roles = deriveTemplateRoles(template);
  const items = templateMenuEntries(template, {
    onEdit,
    onDuplicate,
    onEditTags,
    onDelete,
    onBulkSend,
    onDirectLink,
  });
  const moreLabel = `More for ${template.name}`;

  return (
    <Wrap ref={ref} {...rest}>
      <CardButton
        type="button"
        $compact={compact}
        aria-labelledby={nameId}
        aria-describedby={metaId}
        onClick={() => onUse(template)}
      >
        <Thumb $compact={compact} aria-hidden>
          <i />
          <i />
          <i />
          <b />
        </Thumb>
        <Text>
          <Name id={nameId} title={template.name}>
            {template.name}
          </Name>
          <Meta id={metaId}>
            <Dots aria-hidden>
              {roles.slice(0, 5).map((r) => (
                <Dot key={r.key} $color={r.color} />
              ))}
            </Dots>
            <span>{templateUsageText(template)}</span>
          </Meta>
        </Text>
      </CardButton>
      {items.length > 0 ? (
        <More $compact={compact}>
          {compact ? (
            <Button
              variant="ghost"
              size="sm"
              iconOnly
              iconLeft={MoreHorizontal}
              aria-label={moreLabel}
              onClick={() => onMore?.(template)}
            />
          ) : (
            <MenuButton
              aria-label={`Actions for ${template.name}`}
              items={items}
              trigger={(p) => (
                <Button
                  variant="ghost"
                  size="sm"
                  iconOnly
                  iconLeft={MoreHorizontal}
                  aria-label={moreLabel}
                  {...p}
                />
              )}
            />
          )}
        </More>
      ) : null}
    </Wrap>
  );
});

TemplateCard.displayName = 'TemplateCard';
