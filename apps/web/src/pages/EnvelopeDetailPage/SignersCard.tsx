import { useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Bell, Check, MoreHorizontal, Pencil, Send, UserRoundCog } from 'lucide-react';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { Menu, MenuAnchor } from '@/components/Menu';
import type { MenuEntry } from '@/components/Menu';
import { MiniTrack } from '@/components/MiniTrack';
import { MWBottomSheet } from '@/components/MWBottomSheet';
import { useIsMobileViewport } from '@/hooks/useIsMobileViewport';
import type { Envelope, EnvelopeSigner } from '@/features/envelopes';
import { isPending, signerRowView } from './envelopeView';
import {
  CardHead,
  Count,
  EmptyNote,
  Eyebrow,
  FieldBox,
  FixRow,
  RowActions,
  SectionCard,
  SheetList,
  SignerEmail,
  SignerGrid,
  SignerItem,
  SignerList,
  SignerName,
  SignerWho,
  TrackSlot,
  When,
} from './EnvelopeDetailPage.styles';

export interface SignersCardProps {
  readonly envelope: Envelope;
  /** Signer ids reminded in this visit (or throttled): their button reads "Reminded". */
  readonly remindedIds: ReadonlySet<string>;
  /** Signer whose inline email fix is open. */
  readonly fixingId: string | null;
  readonly busyId: string | null;
  readonly onRemind: (signer: EnvelopeSigner) => void;
  readonly onFixOpen: (signer: EnvelopeSigner) => void;
  readonly onFixCancel: () => void;
  readonly onFixSubmit: (signer: EnvelopeSigner, email: string) => void;
  readonly onReplace: (signer: EnvelopeSigner) => void;
}

function FixEmailForm(props: {
  readonly signer: EnvelopeSigner;
  readonly busy: boolean;
  readonly onCancel: () => void;
  readonly onSubmit: (email: string) => void;
}) {
  const { signer, busy, onCancel, onSubmit } = props;
  const [email, setEmail] = useState(signer.email);
  const first = signer.name.split(/\s+/)[0] ?? signer.name;
  const submit = (event: FormEvent): void => {
    event.preventDefault();
    const next = email.trim();
    if (next !== '') onSubmit(next);
  };
  return (
    <FixRow onSubmit={submit}>
      <FieldBox>
        <input
          type="email"
          aria-label={`${first}'s email`}
          value={email}
          autoFocus
          onChange={(e) => setEmail(e.target.value)}
        />
      </FieldBox>
      <Button type="submit" size="sm" iconLeft={Send} loading={busy}>
        Resend
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
        Cancel
      </Button>
    </FixRow>
  );
}

function SignerMenu(props: {
  readonly signer: EnvelopeSigner;
  readonly canRemind: boolean;
  readonly onRemind: () => void;
  readonly onFix: () => void;
  readonly onReplace: () => void;
}) {
  const { signer, canRemind, onRemind, onFix, onReplace } = props;
  const isMobile = useIsMobileViewport();
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const close = (): void => setOpen(false);
  const entries: MenuEntry[] = [
    ...(canRemind
      ? [{ id: 'remind', label: 'Remind', icon: Bell, onSelect: onRemind } satisfies MenuEntry]
      : []),
    { id: 'fix', label: 'Fix email', icon: Pencil, onSelect: onFix },
    { id: 'replace', label: 'Replace signer', icon: UserRoundCog, onSelect: onReplace },
  ];
  const label = `More for ${signer.name}`;
  return (
    <MenuAnchor>
      <Button
        ref={anchorRef}
        variant="ghost"
        size={isMobile ? 'md' : 'sm'}
        iconOnly
        iconLeft={MoreHorizontal}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      />
      {isMobile ? (
        <MWBottomSheet open={open} onClose={close} title={signer.name}>
          <SheetList>
            {entries.map((entry) =>
              entry.type === undefined || entry.type === 'item' ? (
                <Button
                  key={entry.id}
                  variant="ghost"
                  size="lg"
                  fullWidth
                  iconLeft={entry.icon}
                  onClick={() => {
                    close();
                    entry.onSelect();
                  }}
                >
                  {entry.label}
                </Button>
              ) : null,
            )}
          </SheetList>
        </MWBottomSheet>
      ) : (
        <Menu
          open={open}
          onClose={close}
          items={entries}
          anchorRef={anchorRef}
          aria-label="Signer actions"
        />
      )}
    </MenuAnchor>
  );
}

/**
 * The hero of the envelope page: one row per signer with a Sent, Opened,
 * Signed track, a short "when", and the per-signer actions while the
 * envelope is still out for signature.
 */
export function SignersCard(props: SignersCardProps) {
  const {
    envelope,
    remindedIds,
    fixingId,
    busyId,
    onRemind,
    onFixOpen,
    onFixCancel,
    onFixSubmit,
    onReplace,
  } = props;
  const live = envelope.status === 'awaiting_others';
  // Mobile stacks name over track in a small card and keeps the email only
  // when it is the problem (bounced); Remind becomes an icon button.
  const isMobile = useIsMobileViewport();
  return (
    <SectionCard $flush aria-label="Signers">
      <CardHead>
        <Eyebrow>Signers</Eyebrow>
        <Count>{envelope.signers.length}</Count>
      </CardHead>
      {envelope.signers.length === 0 ? (
        <EmptyNote>No signers on this envelope.</EmptyNote>
      ) : (
        <SignerList>
          {envelope.signers.map((signer) => {
            const view = signerRowView(envelope, signer);
            const pending = isPending(signer);
            const actionable = live && pending;
            const reminded = remindedIds.has(signer.id);
            const track = (
              <TrackSlot>
                <MiniTrack steps={view.steps} aria-label={`Progress for ${signer.name}`} />
              </TrackSlot>
            );
            const reminderSent = (
              <Button
                variant="ghost"
                size={isMobile ? 'md' : 'sm'}
                iconOnly={isMobile}
                iconLeft={Check}
                {...(isMobile ? { 'aria-label': 'Reminded' } : {})}
                disabled
              >
                {isMobile ? null : 'Reminded'}
              </Button>
            );
            const remind = (
              <Button
                variant="secondary"
                size={isMobile ? 'md' : 'sm'}
                iconOnly={isMobile}
                iconLeft={Bell}
                loading={busyId === signer.id}
                aria-label={`Remind ${signer.name}`}
                onClick={() => onRemind(signer)}
              >
                {isMobile ? null : 'Remind'}
              </Button>
            );
            // A bounced address can't be reminded; the row's menu offers Fix email instead.
            let remindButton: ReactNode = reminded ? reminderSent : remind;
            if (signer.status === 'bounced') remindButton = null;
            return (
              <SignerItem key={signer.id} $bad={view.bad}>
                <SignerGrid>
                  <Avatar name={signer.name} size={32} />
                  <SignerWho>
                    <SignerName>{signer.name}</SignerName>
                    {!isMobile || signer.status === 'bounced' ? (
                      <SignerEmail>{signer.email}</SignerEmail>
                    ) : null}
                    {isMobile ? track : null}
                  </SignerWho>
                  {isMobile ? null : track}
                  <When $bad={view.bad}>{view.when}</When>
                  <RowActions>
                    {actionable ? (
                      <>
                        {remindButton}
                        <SignerMenu
                          signer={signer}
                          canRemind={!reminded}
                          onRemind={() => onRemind(signer)}
                          onFix={() => onFixOpen(signer)}
                          onReplace={() => onReplace(signer)}
                        />
                      </>
                    ) : null}
                  </RowActions>
                </SignerGrid>
                {fixingId === signer.id ? (
                  <FixEmailForm
                    signer={signer}
                    busy={busyId === signer.id}
                    onCancel={onFixCancel}
                    onSubmit={(email) => onFixSubmit(signer, email)}
                  />
                ) : null}
              </SignerItem>
            );
          })}
        </SignerList>
      )}
    </SectionCard>
  );
}
