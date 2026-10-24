import { useRef, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import type { EnvelopeListItem } from 'shared';
import { Button } from '@/components/Button';
import { Menu, MenuAnchor } from '@/components/Menu';
import type { MenuEntry } from '@/components/Menu';
import { formatUpdated, rowStatus, statusReason } from '@/features/dashboard';
import type { RowStatus } from '@/features/dashboard';
import {
  DocCell,
  DocSub,
  DocText,
  DocTitleButton,
  MCard,
  RowActions,
  RowCheck,
  SignedText,
  SignersCell,
  StatusCell,
  StatusText,
  Tag,
  TRow,
  UpdatedCell,
} from './DashboardPage.styles';
import { PRIMARY_ACTION, STATUS_TONE, signedSummary, statusLine } from './rowModel';

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
  const line =
    fresh && status === 'others'
      ? 'Delivered just now'
      : statusLine(status, statusReason(env, status, viewerEmail, now));
  const statusText = (
    <StatusText $tone={STATUS_TONE[status]} $strong={status === 'you'}>
      {line}
    </StatusText>
  );
  const signed = signedSummary(env);
  const tags = env.tags ?? [];
  const check = (
    <RowCheck
      type="checkbox"
      checked={selected}
      onChange={onToggleSelected}
      aria-label={`Select ${env.title}`}
    />
  );

  if (mobile) {
    return (
      <MCard $selected={selected} $fresh={fresh} data-testid="doc-row">
        {selectable ? check : null}
        <DocText>
          <DocTitleButton type="button" onClick={onOpen}>
            {env.title}
          </DocTitleButton>
          {statusText}
        </DocText>
        <Button
          variant="ghost"
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
        <DocText>
          <DocTitleButton type="button" onClick={onOpen}>
            {env.title}
          </DocTitleButton>
          {tags.length > 0 ? (
            <DocSub>
              {tags.slice(0, 2).map((t) => (
                <Tag key={t}>{t}</Tag>
              ))}
              {tags.length > 2 ? (
                <Tag aria-label={`${tags.length - 2} more tags`}>+{tags.length - 2}</Tag>
              ) : null}
            </DocSub>
          ) : null}
        </DocText>
      </DocCell>
      <StatusCell>{statusText}</StatusCell>
      <SignersCell>{signed !== null ? <SignedText>{signed}</SignedText> : null}</SignersCell>
      <UpdatedCell>{formatUpdated(env.updated_at, now)}</UpdatedCell>
      <RowActions data-part="row-actions">
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
