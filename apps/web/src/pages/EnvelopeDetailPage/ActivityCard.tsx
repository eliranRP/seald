import { useState } from 'react';
import { ChevronDown, ChevronUp, ShieldAlert, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/Button';
import { InfoChip } from '@/components/InfoChip';
import type { ActivityRowView } from './envelopeView';
import {
  ActIcon,
  ActList,
  ActRow,
  ActText,
  ActTime,
  Card,
  ChainOk,
  CardHead,
  Eyebrow,
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
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.slice(0, PREVIEW);
  return (
    <Card aria-label="Activity">
      <CardHead style={{ padding: '0 0 12px' }}>
        <Eyebrow>Activity</Eyebrow>
        <Spacer />
        {chainIntact === true ? (
          <ChainOk $ok>
            <InfoChip icon={ShieldCheck}>Chain intact</InfoChip>
          </ChainOk>
        ) : null}
        {chainIntact === false ? (
          <ChainOk $ok={false}>
            <InfoChip icon={ShieldAlert}>Chain broken</InfoChip>
          </ChainOk>
        ) : null}
      </CardHead>
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
        <div style={{ marginTop: 8 }}>
          <Button
            variant="ghost"
            size="sm"
            iconRight={all ? ChevronUp : ChevronDown}
            aria-expanded={all}
            onClick={() => setAll((v) => !v)}
          >
            {all ? 'Show less' : `Show all (${rows.length})`}
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
