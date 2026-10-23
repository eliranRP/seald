import type { LucideIcon } from 'lucide-react';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { MWBottomSheet } from '@/components/MWBottomSheet';
import { StatusBadge } from '@/components/StatusBadge';
import { DocThumb } from '@/components/DocThumb';
import { DATE_PRESETS } from '@/features/dashboard';
import type { PersonOption, RowStatus, ViewFilters } from '@/features/dashboard';
import {
  DocText,
  DocTitleButton,
  PillGrid,
  PillRow,
  SheetItem,
  SheetSection,
  SheetTitleRow,
  Eyebrow,
  Spacer,
} from './DashboardPage.styles';
import { DATE_LABEL } from './HomeToolbar';

export interface FilterSheetProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly filters: ViewFilters;
  readonly onChange: (patch: Partial<ViewFilters>) => void;
  readonly onReset: () => void;
  readonly people: ReadonlyArray<PersonOption>;
  readonly tags: ReadonlyArray<string>;
  readonly resultCount: number;
}

function toggle(list: ReadonlyArray<string>, value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

/** Phone filter sheet: Updated presets, People avatars, Tags pills. */
export function FilterSheet(props: FilterSheetProps) {
  const { open, onClose, filters, onChange, onReset, people, tags, resultCount } = props;
  return (
    <MWBottomSheet open={open} onClose={onClose} title="Filter">
      <SheetTitleRow>
        <Spacer />
        <Button variant="ghost" size="sm" onClick={onReset}>
          Reset
        </Button>
      </SheetTitleRow>
      <SheetSection>
        <Eyebrow as="span">Updated</Eyebrow>
        <PillGrid>
          {DATE_PRESETS.map((p) => (
            <Button
              key={p}
              variant={filters.date === p ? 'primary' : 'secondary'}
              aria-pressed={filters.date === p}
              onClick={() => onChange({ date: p })}
            >
              {DATE_LABEL[p]}
            </Button>
          ))}
        </PillGrid>
      </SheetSection>
      {people.length > 0 ? (
        <SheetSection>
          <Eyebrow as="span">People</Eyebrow>
          <PillRow>
            {people.map((p) => (
              <button
                key={p.email}
                type="button"
                aria-label={p.name}
                aria-pressed={filters.people.includes(p.email)}
                onClick={() => onChange({ people: toggle(filters.people, p.email) })}
                style={{
                  border: 0,
                  padding: 0,
                  background: 'none',
                  width: 44,
                  height: 44,
                  cursor: 'pointer',
                  opacity: filters.people.includes(p.email) ? 1 : 0.55,
                }}
              >
                <Avatar name={p.name} size={32} aria-hidden />
              </button>
            ))}
          </PillRow>
        </SheetSection>
      ) : null}
      {tags.length > 0 ? (
        <SheetSection>
          <Eyebrow as="span">Tags</Eyebrow>
          <PillRow>
            {tags.map((t) => (
              <Button
                key={t}
                variant={filters.tags.includes(t) ? 'primary' : 'secondary'}
                aria-pressed={filters.tags.includes(t)}
                onClick={() => onChange({ tags: toggle(filters.tags, t) })}
              >
                {t}
              </Button>
            ))}
          </PillRow>
        </SheetSection>
      ) : null}
      <Button variant="primary" fullWidth onClick={onClose}>
        {`Show ${resultCount}`}
      </Button>
    </MWBottomSheet>
  );
}

export interface SheetAction {
  readonly id: string;
  readonly label: string;
  readonly icon: LucideIcon;
  readonly danger?: boolean;
  readonly onSelect: () => void;
}

export interface RowSheetProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly title: string;
  readonly status: RowStatus;
  readonly actions: ReadonlyArray<SheetAction>;
  readonly onOpenDocument: () => void;
}

/** Phone row actions: document header, then full-width 48 px items. */
export function RowSheet(props: RowSheetProps) {
  const { open, onClose, title, status, actions, onOpenDocument } = props;
  return (
    <MWBottomSheet open={open} onClose={onClose} title="Row actions">
      <SheetTitleRow>
        <DocThumb size={40} title={title} signed={status === 'sealed'} aria-hidden />
        <DocText>
          <DocTitleButton type="button" onClick={onOpenDocument}>
            {title}
          </DocTitleButton>
        </DocText>
        <StatusBadge status={status} />
      </SheetTitleRow>
      {actions.map((a) => {
        const Icon = a.icon;
        return (
          <SheetItem
            key={a.id}
            type="button"
            $danger={a.danger === true}
            onClick={() => {
              onClose();
              a.onSelect();
            }}
          >
            <Icon size={20} aria-hidden />
            {a.label}
          </SheetItem>
        );
      })}
    </MWBottomSheet>
  );
}
