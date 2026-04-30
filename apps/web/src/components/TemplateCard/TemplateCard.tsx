import { forwardRef, useMemo } from 'react';
import { Pencil, PenTool, Send, Tag, Trash2 } from 'lucide-react';
import { Icon } from '@/components/Icon';
import { tagColorFor } from '@/features/templates';
import type { TemplateCardAccent, TemplateCardProps } from './TemplateCard.types';
import {
  ActionButton,
  ActionDanger,
  ActionOverlay,
  ActionPrimary,
  Body,
  MiniThumb,
  Name,
  Root,
  StatDot,
  StatItem,
  StatMono,
  StatRow,
  TagOverflowPill,
  TagPill,
  TagRow,
  ThumbLine,
  ThumbPagesChip,
  ThumbPaper,
  ThumbSig,
  ThumbSpacer,
  ThumbStripe,
} from './TemplateCard.styles';

const ACCENTS: ReadonlyArray<TemplateCardAccent> = ['indigo', 'amber', 'emerald', 'pink'];
const THUMB_LINE_COUNT = 7;
const VISIBLE_TAGS = 2;

/** Hash the template id so accent + line widths stay stable per id. */
function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

function computeLineWidths(seed: string, count: number): ReadonlyArray<number> {
  let h = hashStr(seed);
  const widths: number[] = [];
  for (let i = 0; i < count; i += 1) {
    h = (h * 1103515245 + 12345) | 0;
    const norm = ((h >>> 16) & 0xffff) / 0xffff;
    widths.push(58 + Math.round(norm * 32));
  }
  return widths;
}

function pickAccent(seed: string): TemplateCardAccent {
  const idx = Math.abs(hashStr(seed)) % ACCENTS.length;
  return ACCENTS[idx]!;
}

/**
 * L2 domain card — 4:3 MiniThumb + name + tags + stats, with a
 * floating action overlay revealed on hover. Mirrors the design
 * guide's TemplatesList card layout
 * (`Design-Guide/project/templates-flow/TemplatesList.jsx`).
 *
 * Whole card is clickable (fires `onUse`). The action overlay's
 * Edit / Use / Delete / Tags affordances `stopPropagation` so the
 * card-click never overrides them.
 */
export const TemplateCard = forwardRef<HTMLElement, TemplateCardProps>((props, ref) => {
  const { template, onUse, onEdit, onDelete, onTagClick, onEditTags, ...rest } = props;
  const widths = useMemo(() => computeLineWidths(template.id, THUMB_LINE_COUNT), [template.id]);
  const accent = useMemo(() => pickAccent(template.id), [template.id]);

  const tags = template.tags ?? [];
  const visibleTags = tags.slice(0, VISIBLE_TAGS);
  const overflowCount = tags.length - visibleTags.length;

  return (
    <Root
      ref={ref}
      role="button"
      tabIndex={0}
      aria-labelledby={`tpl-name-${template.id}`}
      onClick={() => onUse(template)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onUse(template);
        }
      }}
      {...rest}
    >
      <MiniThumb $accent={accent} aria-hidden>
        <ThumbPaper>
          <ThumbStripe $accent={accent} />
          <ThumbSpacer />
          {widths.map((w, i) => (
            <ThumbLine
              // Index keys are fine — the line set is generated
              // deterministically from `template.id` + count, so the
              // identity is positional.
              // eslint-disable-next-line react/no-array-index-key
              key={`l${String(i)}`}
              $width={w}
            />
          ))}
          <ThumbSig $accent={accent} />
        </ThumbPaper>
        <ThumbPagesChip>{template.pages}p</ThumbPagesChip>
      </MiniThumb>

      <Body>
        <Name id={`tpl-name-${template.id}`} title={template.name}>
          {template.name}
        </Name>

        {tags.length > 0 ? (
          <TagRow aria-label="Tags">
            {visibleTags.map((tag) => {
              const c = tagColorFor(tag);
              return (
                <TagPill
                  key={tag}
                  type="button"
                  $bg={c.bg}
                  $fg={c.fg}
                  title={`Filter by ${tag}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onTagClick?.(tag);
                  }}
                >
                  {tag}
                </TagPill>
              );
            })}
            {overflowCount > 0 ? (
              <TagOverflowPill
                type="button"
                title={tags.slice(VISIBLE_TAGS).join(', ')}
                onClick={(e) => {
                  e.stopPropagation();
                  onEditTags?.(template);
                }}
              >
                +{overflowCount}
              </TagOverflowPill>
            ) : null}
          </TagRow>
        ) : null}

        <StatRow>
          <StatItem>
            <Icon icon={PenTool} size={11} aria-hidden />
            {template.fieldCount}
          </StatItem>
          <StatDot aria-hidden />
          <StatItem>Used {template.uses}×</StatItem>
          <StatDot aria-hidden />
          <StatMono>{template.lastUsed}</StatMono>
        </StatRow>
      </Body>

      <ActionOverlay onClick={(e) => e.stopPropagation()}>
        {onEditTags ? (
          <ActionButton
            type="button"
            onClick={() => onEditTags(template)}
            aria-label={`Edit tags for ${template.name}`}
            title="Edit tags"
          >
            <Icon icon={Tag} size={12} />
            Tags
          </ActionButton>
        ) : null}
        {onEdit ? (
          <ActionButton
            type="button"
            onClick={() => onEdit(template)}
            aria-label={`Edit ${template.name}`}
            title="Edit template"
          >
            <Icon icon={Pencil} size={12} />
            Edit
          </ActionButton>
        ) : null}
        <ActionPrimary
          type="button"
          onClick={() => onUse(template)}
          aria-label={`Use ${template.name}`}
          title="Use template"
        >
          <Icon icon={Send} size={12} />
          Use
        </ActionPrimary>
        {onDelete ? (
          <ActionDanger
            type="button"
            onClick={() => onDelete(template)}
            aria-label={`Delete ${template.name}`}
            title="Delete template"
          >
            <Icon icon={Trash2} size={12} />
          </ActionDanger>
        ) : null}
      </ActionOverlay>
    </Root>
  );
});

TemplateCard.displayName = 'TemplateCard';
