import { isFeatureEnabled } from 'shared';
import { Badge } from '@/components/Badge';
import type { BadgeTone } from '@/components/Badge/Badge.types';
import {
  Heading,
  StepBox,
  StepHeading,
  StepList,
  StepSigner,
  StepSignerList,
  StepsRoot,
} from './SigningOrderSteps.styles';

export interface StepSignerView {
  readonly id: string;
  readonly name: string;
  readonly step?: number | undefined;
  readonly invited_at?: string | null | undefined;
  readonly signed_at: string | null;
  readonly declined_at: string | null;
}

export type StepSignerState = 'signed' | 'declined' | 'invited' | 'waiting' | 'not_sent';

export const STEP_STATE_LABEL: Record<StepSignerState, string> = {
  signed: 'Signed',
  declined: 'Declined',
  invited: 'Invited',
  waiting: 'Waiting for their turn',
  not_sent: 'Not sent yet',
};

const STEP_STATE_TONE: Record<StepSignerState, BadgeTone> = {
  signed: 'emerald',
  declined: 'red',
  invited: 'indigo',
  waiting: 'neutral',
  not_sent: 'neutral',
};

export function stepSignerState(signer: StepSignerView, sent: boolean): StepSignerState {
  if (signer.signed_at !== null) return 'signed';
  if (signer.declined_at !== null) return 'declined';
  if (!sent) return 'not_sent';
  return signer.invited_at !== null && signer.invited_at !== undefined ? 'invited' : 'waiting';
}

export interface SigningOrderStepsProps {
  readonly deliveryMode: 'parallel' | 'sequential' | undefined;
  readonly signers: ReadonlyArray<StepSignerView>;
  /** False while the envelope is still a draft. */
  readonly sent: boolean;
}

interface Group {
  readonly step: number;
  readonly signers: StepSignerView[];
}

function groupByStep(signers: ReadonlyArray<StepSignerView>): Group[] {
  const groups = new Map<number, StepSignerView[]>();
  for (const s of signers) {
    const step = s.step ?? 1;
    const list = groups.get(step);
    if (list) list.push(s);
    else groups.set(step, [s]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a - b)
    .map(([step, list]) => ({ step, signers: list }));
}

/**
 * Envelope-detail view of a sequential envelope (WP-06): each step with its
 * signers and where each one stands. Renders nothing while `signingOrder` is
 * off or the envelope is not sequential, so every other detail page is
 * unchanged.
 */
export function SigningOrderSteps({ deliveryMode, signers, sent }: SigningOrderStepsProps) {
  if (!isFeatureEnabled('signingOrder') || deliveryMode !== 'sequential') return null;
  const groups = groupByStep(signers);
  return (
    <StepsRoot aria-label="Signing steps">
      <Heading>Signing order</Heading>
      <StepList>
        {groups.map((group) => (
          <StepBox key={group.step}>
            <StepHeading>Step {group.step}</StepHeading>
            <StepSignerList>
              {group.signers.map((s) => {
                const state = stepSignerState(s, sent);
                return (
                  <StepSigner key={s.id}>
                    <span>{s.name}</span>
                    <Badge tone={STEP_STATE_TONE[state]} dot={false}>
                      {STEP_STATE_LABEL[state]}
                    </Badge>
                  </StepSigner>
                );
              })}
            </StepSignerList>
          </StepBox>
        ))}
      </StepList>
    </StepsRoot>
  );
}
