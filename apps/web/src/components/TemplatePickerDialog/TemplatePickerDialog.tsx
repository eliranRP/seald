import { useEffect, useId, useMemo, useState } from 'react';
import { ChevronRight, FileText, LayoutTemplate, PenTool, Search, X } from 'lucide-react';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { TagFilterMenu } from '@/components/TagFilterMenu';
import { tagColorFor } from '@/features/templates';
import type { TemplateSummary } from '@/features/templates';
import {
  ActiveTagDot,
  ActiveTagPill,
  ActiveTagRemove,
  Backdrop,
  Card,
  Chevron,
  CloseButton,
  Count,
  Empty,
  FilterLabel,
  FilterRow,
  Footer,
  Header,
  HeaderIcon,
  HeaderRow,
  HeaderText,
  List,
  Meta,
  MetaCell,
  MetaDot,
  MetaMono,
  Row,
  RowMain,
  RowName,
  SearchRow,
  Subtitle,
  Swatch,
  SwatchLine,
  TagChip,
  TagOverflow,
  TagRow,
  Title,
} from './TemplatePickerDialog.styles';
import type { TemplatePickerDialogProps } from './TemplatePickerDialog.types';

const VISIBLE_TAG_LIMIT = 3;

function matchesQuery(t: TemplateSummary, lowered: string): boolean {
  if (!lowered) return true;
  if (t.name.toLowerCase().includes(lowered)) return true;
  if (t.id.toLowerCase().includes(lowered)) return true;
  return (t.tags ?? []).some((tag) => tag.toLowerCase().includes(lowered));
}

/**
 * Modal that lets the user pick a saved template from the upload
 * screen. Mirrors `TemplatePickerDialog` in the design guide
 * (Design-Guide/project/ui_kits/signing_app/Screens.jsx) but reuses
 * the existing `TagFilterMenu` popover instead of an inline chip
 * row, per the templates list page filter pattern.
 */
export function TemplatePickerDialog({
  open,
  templates,
  onPick,
  onClose,
}: TemplatePickerDialogProps) {
  const titleId = useId();
  const subtitleId = useId();
  const [query, setQuery] = useState('');
  const [activeTags, setActiveTags] = useState<ReadonlyArray<string>>([]);

  // Reset filter state every time the dialog re-opens.
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActiveTags([]);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const t of templates) for (const tag of t.tags ?? []) set.add(tag);
    return Array.from(set).sort();
  }, [templates]);

  const tagCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const t of templates) for (const tag of t.tags ?? []) counts[tag] = (counts[tag] ?? 0) + 1;
    return counts;
  }, [templates]);

  const filtered = useMemo(() => {
    const lowered = query.trim().toLowerCase();
    return templates.filter((t) => {
      if (activeTags.length > 0 && !activeTags.every((tag) => (t.tags ?? []).includes(tag))) {
        return false;
      }
      return matchesQuery(t, lowered);
    });
  }, [templates, query, activeTags]);

  if (!open) return null;

  const toggleTag = (tag: string): void => {
    setActiveTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  };

  const clearTags = (): void => setActiveTags([]);

  return (
    <Backdrop role="presentation" onClick={onClose}>
      <Card
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={subtitleId}
        onClick={(e) => e.stopPropagation()}
      >
        <Header>
          <HeaderRow>
            <HeaderIcon aria-hidden>
              <Icon icon={LayoutTemplate} size={18} />
            </HeaderIcon>
            <HeaderText>
              <Title id={titleId}>Choose a template</Title>
              <Subtitle id={subtitleId}>
                Pick a saved field layout. We&apos;ll apply it to your next document.
              </Subtitle>
            </HeaderText>
            <CloseButton type="button" onClick={onClose} aria-label="Close">
              <Icon icon={X} size={18} />
            </CloseButton>
          </HeaderRow>

          <SearchRow>
            <Icon icon={Search} size={14} />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or tag…"
              aria-label="Search templates"
            />
          </SearchRow>

          {allTags.length > 0 ? (
            <FilterRow>
              <FilterLabel>Filter</FilterLabel>
              <TagFilterMenu
                allTags={allTags}
                counts={tagCounts}
                selected={activeTags}
                onToggle={toggleTag}
                onClear={clearTags}
              />
              {activeTags.map((tag) => {
                const c = tagColorFor(tag);
                return (
                  <ActiveTagPill key={tag} $bg={c.bg} $fg={c.fg}>
                    <ActiveTagDot $color={c.fg} />
                    {tag}
                    <ActiveTagRemove
                      type="button"
                      onClick={() => toggleTag(tag)}
                      aria-label={`Remove ${tag} filter`}
                    >
                      <Icon icon={X} size={11} />
                    </ActiveTagRemove>
                  </ActiveTagPill>
                );
              })}
            </FilterRow>
          ) : null}
        </Header>

        <List>
          {filtered.length === 0 ? (
            <Empty role="status">No templates match.</Empty>
          ) : (
            filtered.map((t) => {
              const tags = t.tags ?? [];
              const visibleTags = tags.slice(0, VISIBLE_TAG_LIMIT);
              const hidden = tags.length - visibleTags.length;
              return (
                <Row key={t.id} type="button" onClick={() => onPick(t)}>
                  <Swatch $bg={`${t.cover}1F`} $mark={t.cover} aria-hidden>
                    <SwatchLine $top="34%" $right="30%" />
                    <SwatchLine $top="46%" $right="24%" />
                    <SwatchLine $top="58%" $right="40%" />
                  </Swatch>
                  <RowMain>
                    <RowName>{t.name}</RowName>
                    <Meta>
                      <MetaCell>
                        <Icon icon={FileText} size={11} />
                        {t.pages}p
                      </MetaCell>
                      <MetaDot aria-hidden />
                      <MetaCell>
                        <Icon icon={PenTool} size={11} />
                        {t.fieldCount} fields
                      </MetaCell>
                      <MetaDot aria-hidden />
                      <span>Used {t.uses}×</span>
                      <MetaDot aria-hidden />
                      <MetaMono>{t.lastUsed}</MetaMono>
                    </Meta>
                    {visibleTags.length > 0 ? (
                      <TagRow>
                        {visibleTags.map((tag) => {
                          const c = tagColorFor(tag);
                          return (
                            <TagChip key={tag} $bg={c.bg} $fg={c.fg}>
                              {tag}
                            </TagChip>
                          );
                        })}
                        {hidden > 0 ? <TagOverflow>+{hidden}</TagOverflow> : null}
                      </TagRow>
                    ) : null}
                  </RowMain>
                  <Chevron aria-hidden>
                    <Icon icon={ChevronRight} size={16} />
                  </Chevron>
                </Row>
              );
            })
          )}
        </List>

        <Footer>
          <Count>
            {filtered.length} template{filtered.length === 1 ? '' : 's'}
          </Count>
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancel
          </Button>
        </Footer>
      </Card>
    </Backdrop>
  );
}
