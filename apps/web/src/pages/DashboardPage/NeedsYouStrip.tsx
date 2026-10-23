import { useState } from 'react';
import type { FormEvent } from 'react';
import { Bell, Clock, Pencil, PenLine, Send, TriangleAlert, XCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/Button';
import { Skeleton } from '@/components/Skeleton';
import { useIsMobileViewport } from '@/hooks/useIsMobileViewport';
import type { NeedsCard, NeedsKind } from '@/features/dashboard';
import {
  CountPill,
  Eyebrow,
  FixField,
  MetaLine,
  MoreLink,
  NeedBody,
  NeedCard,
  NeedIcon,
  NeedTitle,
  NeedsGrid,
  Section,
  SectionHead,
  type NeedTone,
} from './DashboardPage.styles';

/** Cards shown before the "+N" link. */
export const NEEDS_VISIBLE = 3;

interface KindSpec {
  readonly tone: NeedTone;
  readonly icon: LucideIcon;
  readonly label: string;
  readonly variant: 'primary' | 'secondary';
  readonly buttonIcon: LucideIcon;
}

const KINDS: Readonly<Record<NeedsKind, KindSpec>> = {
  bounced: {
    tone: 'red',
    icon: TriangleAlert,
    label: 'Fix email',
    variant: 'primary',
    buttonIcon: Pencil,
  },
  you: { tone: 'indigo', icon: PenLine, label: 'Sign', variant: 'primary', buttonIcon: PenLine },
  others: {
    tone: 'amber',
    icon: Clock,
    label: 'Remind',
    variant: 'secondary',
    buttonIcon: Bell,
  },
  declined: {
    tone: 'red',
    icon: XCircle,
    label: 'Revise',
    variant: 'secondary',
    buttonIcon: Pencil,
  },
};

export interface NeedsYouStripProps {
  readonly cards: ReadonlyArray<NeedsCard>;
  readonly loading: boolean;
  readonly expanded: boolean;
  readonly onToggleExpanded: () => void;
  readonly onOpen: (card: NeedsCard) => void;
  readonly onAct: (card: NeedsCard) => void;
  /** Resolves when the corrected address was saved and the invite resent. */
  readonly onFixEmail: (card: NeedsCard, email: string) => Promise<void>;
}

interface CardViewProps {
  readonly card: NeedsCard;
  readonly mobile: boolean;
  readonly onOpen: (card: NeedsCard) => void;
  readonly onAct: (card: NeedsCard) => void;
  readonly onFixEmail: (card: NeedsCard, email: string) => Promise<void>;
}

function CardView({ card, mobile, onOpen, onAct, onFixEmail }: CardViewProps) {
  const spec = KINDS[card.kind];
  const [fixing, setFixing] = useState(false);
  const [email, setEmail] = useState(card.signer?.email ?? '');
  const [busy, setBusy] = useState(false);
  const title = card.envelope.title;

  function submitFix(e: FormEvent): void {
    e.preventDefault();
    if (busy || email.trim() === '') return;
    setBusy(true);
    onFixEmail(card, email.trim())
      .then(() => setFixing(false))
      .finally(() => setBusy(false));
  }

  const Icon = spec.icon;
  const showForm = card.kind === 'bounced' && fixing;
  return (
    <NeedCard as="li" data-kind={card.kind}>
      <NeedIcon $tone={spec.tone} aria-hidden>
        <Icon size={16} />
      </NeedIcon>
      <NeedBody>
        <NeedTitle type="button" onClick={() => onOpen(card)}>
          {title}
        </NeedTitle>
        {showForm ? (
          <form onSubmit={submitFix}>
            <FixField
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-label={`Email address for ${card.signer?.name ?? 'the signer'}`}
              autoFocus
            />
          </form>
        ) : (
          <MetaLine>
            {card.reason} · {card.age}
          </MetaLine>
        )}
      </NeedBody>
      {showForm ? (
        <Button
          size="sm"
          variant="primary"
          iconLeft={mobile ? Send : undefined}
          iconOnly={mobile}
          aria-label={mobile ? 'Resend' : undefined}
          loading={busy}
          onClick={submitFix}
        >
          {mobile ? undefined : 'Resend'}
        </Button>
      ) : (
        <Button
          size="sm"
          variant={spec.variant}
          iconLeft={spec.buttonIcon}
          iconOnly={mobile}
          aria-label={mobile ? spec.label : undefined}
          onClick={() => (card.kind === 'bounced' ? setFixing(true) : onAct(card))}
        >
          {mobile ? undefined : spec.label}
        </Button>
      )}
    </NeedCard>
  );
}

/** "Needs you": compact one-line action cards, three at a time. */
export function NeedsYouStrip(props: NeedsYouStripProps) {
  const { cards, loading, expanded, onToggleExpanded, onOpen, onAct, onFixEmail } = props;
  const mobile = useIsMobileViewport();

  if (loading) {
    return (
      <Section aria-label="Needs you" aria-busy="true">
        <SectionHead>
          <Eyebrow>Needs you</Eyebrow>
          <Skeleton variant="circle" width={20} height={20} />
        </SectionHead>
        <NeedsGrid>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} variant="rect" height={58} style={{ borderRadius: 16 }} />
          ))}
        </NeedsGrid>
      </Section>
    );
  }
  if (cards.length === 0) return null;

  const shown = expanded ? cards : cards.slice(0, NEEDS_VISIBLE);
  const extra = cards.length - NEEDS_VISIBLE;
  return (
    <Section aria-label="Needs you">
      <SectionHead>
        <Eyebrow>Needs you</Eyebrow>
        <CountPill $accent aria-label={`${cards.length} documents need you`}>
          {cards.length}
        </CountPill>
        {extra > 0 ? (
          <MoreLink type="button" onClick={onToggleExpanded}>
            {expanded ? 'Show less' : `+${extra}`}
          </MoreLink>
        ) : null}
      </SectionHead>
      <NeedsGrid as="ul">
        {shown.map((card) => (
          <CardView
            key={card.id}
            card={card}
            mobile={mobile}
            onOpen={onOpen}
            onAct={onAct}
            onFixEmail={onFixEmail}
          />
        ))}
      </NeedsGrid>
    </Section>
  );
}
