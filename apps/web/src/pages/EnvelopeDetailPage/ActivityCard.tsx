import { useState } from 'react';
import { ChevronDown, ChevronUp, ShieldAlert, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/Button';
import { useIsMobileViewport } from '@/hooks/useIsMobileViewport';
import type { ActivityRowView } from './envelopeView';
import {
  ActFoot,
  ActIcon,
  ActList,
  ActRow,
  ActText,
  ActTime,
  ActivityHead,
  ChainChip,
  Eyebrow,
  SectionCard,
  Spacer,
} from './EnvelopeDetailPage.styles';

export interface ActivityCardProps {
  readonly rows: ReadonlyArray<ActivityRowView>;
  /** Result of the server's audit-chain check. Null (unknown) shows no chip. */
  readonly chainIntact: boolean | null;
}

const PREVIEW = 3;

/** Last three events, "Show all" for the rest, and the audit chain verdict. */
export function ActivityCard({ rows, chainIntact }: ActivityCardProps) {
  const isMobile = useIsMobileViewport();
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.slice(0, PREVIEW);
  return (
    <SectionCard aria-label="Activity">
      <ActivityHead>
        <Eyebrow>Activity</Eyebrow>
        <Spacer />
        {chainIntact === true ? (
          <ChainChip $ok icon={ShieldCheck}>
            Chain intact
          </ChainChip>
        ) : null}
        {chainIntact === false ? (
          <ChainChip $ok={false} icon={ShieldAlert}>
            Chain broken
          </ChainChip>
        ) : null}
      </ActivityHead>
      <ActList>
        {shown.map((row) => (
          <ActRow key={row.id}>
            <ActIcon $tone={row.tone} aria-hidden>
              <row.icon size={14} />
            </ActIcon>
            <ActText>{row.text}</ActText>
            <ActTime>{row.time}</ActTime>
          </ActRow>
        ))}
      </ActList>
      {rows.length > PREVIEW ? (
        <ActFoot>
          {/* The mobile board centres this as a full 44px touch target. */}
          <Button
            variant="ghost"
            size={isMobile ? 'md' : 'sm'}
            iconRight={all ? ChevronUp : ChevronDown}
            aria-expanded={all}
            onClick={() => setAll((v) => !v)}
          >
            {all ? 'Show less' : `Show all (${rows.length})`}
          </Button>
        </ActFoot>
      ) : null}
    </SectionCard>
  );
}
