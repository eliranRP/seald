import { useRef, useState } from 'react';
import { Mail, MoreHorizontal } from 'lucide-react';
import type { EnvelopeListItem } from 'shared';
import { Button } from '@/components/Button';
import { DocThumb } from '@/components/DocThumb';
import { Menu, MenuAnchor } from '@/components/Menu';
import type { MenuEntry } from '@/components/Menu';
import { SignerProgressBar } from '@/components/SignerProgressBar';
import { SignerStack } from '@/components/SignerStack';
import { StatusBadge } from '@/components/StatusBadge';
import { formatUpdated, rowStatus, statusReason } from '@/features/dashboard';
import type { RowStatus } from '@/features/dashboard';
import {
  DocCell,
  DocSub,
  DocText,
  DocTitleButton,
  MCard,
  Mono,
  RowActions,
  RowCheck,
  SignersCell,
  StatusCell,
  StatusMeta,
  Tag,
  TRow,
  UpdatedCell,
} from './DashboardPage.styles';
import { PRIMARY_ACTION, STATUS_META_ICON, stackEntries } from './rowModel';

export interface DocumentRowProps {
  readonly envelope: EnvelopeListItem;
  readonly viewerEmail: string | null;
  readonly now: Date;
  readonly selected: boolean;
  /** Just sent: tinted, fading out over 3 s. */
  readonly fresh: boolean;
  readonly selectable: boolean;
  readonly mobile: boolean;
  /** Entries for the "more" menu (desktop dropdown). */
  readonly menuItems: ReadonlyArray<MenuEntry>;
  readonly onToggleSelected: () => void;
  readonly onOpen: () => void;
  readonly onPrimary: (status: RowStatus) => void;
  /** Mobile: open the row sheet instead of a dropdown. */
  readonly onOpenSheet: () => void;
}

/** Status meta glyph: the mail icon of "Delivered · now" for a fresh send. */
function MetaGlyph({ status, fresh }: { readonly status: RowStatus; readonly fresh: boolean }) {
  const Glyph = fresh && status === 'others' ? Mail : STATUS_META_ICON[status];
  return <Glyph size={14} aria-hidden />;
}

/** One document: a table row on desktop, a card on phones. */
export function DocumentRow(props: DocumentRowProps) {
  const {
    envelope: env,
    viewerEmail,
    now,
    selected,
    fresh,
    selectable,
    mobile,
    menuItems,
    onToggleSelected,
    onOpen,
    onPrimary,
    onOpenSheet,
  } = props;
  const status = rowStatus(env, viewerEmail);
  const primary = PRIMARY_ACTION[status];
  const [menuOpen, setMenuOpen] = useState(false);
  const moreRef = useRef<HTMLButtonElement | null>(null);
  const reason =
    fresh && status === 'others' ? 'Delivered · now' : statusReason(env, status, viewerEmail, now);
  const check = (
    <RowCheck
      type="checkbox"
      checked={selected}
      onChange={onToggleSelected}
      aria-label={`Select ${env.title}`}
    />
  );
  const thumb = <DocThumb size={40} title={env.title} signed={status === 'sealed'} aria-hidden />;

  if (mobile) {
    return (
      <MCard $selected={selected} $fresh={fresh} data-testid="doc-row">
        {selectable ? check : null}
        {thumb}
        <DocText>
          <DocTitleButton type="button" onClick={onOpen}>
            {env.title}
          </DocTitleButton>
          <StatusMeta>
            <MetaGlyph status={status} fresh={fresh} />
            {reason}
          </StatusMeta>
        </DocText>
        <StatusBadge status={status} />
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          iconLeft={MoreHorizontal}
          aria-label={`More actions for ${env.title}`}
          aria-haspopup="dialog"
          onClick={onOpenSheet}
        />
      </MCard>
    );
  }

  return (
    <TRow $selected={selected} $hot={menuOpen} $fresh={fresh} data-testid="doc-row">
      {check}
      <DocCell>
        {thumb}
        <DocText>
          <DocTitleButton type="button" onClick={onOpen}>
            {env.title}
          </DocTitleButton>
          <DocSub>
            <Mono>{env.short_code}</Mono>
            {(env.tags ?? []).slice(0, 2).map((t) => (
              <Tag key={t}>{t}</Tag>
            ))}
            {(env.tags ?? []).length > 2 ? (
              <Tag aria-label={`${(env.tags ?? []).length - 2} more tags`}>
                +{(env.tags ?? []).length - 2}
              </Tag>
            ) : null}
          </DocSub>
        </DocText>
      </DocCell>
      <StatusCell>
        <StatusBadge status={status} />
        <StatusMeta>
          <MetaGlyph status={status} fresh={fresh} />
          {reason}
        </StatusMeta>
      </StatusCell>
      <SignersCell>
        <SignerStack signers={stackEntries(env, viewerEmail)} aria-label={`${env.title} signers`} />
        <SignerProgressBar
          signers={stackEntries(env, viewerEmail)}
          aria-label={`${env.title} progress`}
        />
      </SignersCell>
      <UpdatedCell>{formatUpdated(env.updated_at, now)}</UpdatedCell>
      <RowActions>
        <Button
          size="sm"
          variant={primary.variant}
          iconLeft={primary.icon}
          aria-label={`${primary.label} ${env.title}`}
          onClick={() => onPrimary(status)}
        >
          {primary.label}
        </Button>
        <MenuAnchor>
          <Button
            ref={moreRef}
            variant="ghost"
            size="sm"
            iconOnly
            iconLeft={MoreHorizontal}
            aria-label={`More actions for ${env.title}`}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((o) => !o)}
          />
          <Menu
            open={menuOpen}
            onClose={() => setMenuOpen(false)}
            items={menuItems}
            anchorRef={moreRef}
            aria-label={`Actions for ${env.title}`}
          />
        </MenuAnchor>
      </RowActions>
    </TRow>
  );
}
