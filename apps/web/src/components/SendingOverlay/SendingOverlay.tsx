import { forwardRef } from 'react';
import { ArrowRight, Check, FileText, Lock, Mail, Send, ShieldCheck } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '../Button';
import type { SendingOverlayProps, SendingPhase } from './SendingOverlay.types';
import {
  Backdrop,
  ErrorBanner,
  Footer,
  Grid,
  Kicker,
  Meta,
  OverallFill,
  OverallHead,
  OverallLabel,
  OverallPct,
  OverallRow,
  OverallShine,
  OverallTrack,
  Panel,
  SignerAvatar,
  SignerFirstName,
  SignerRow,
  SignerTile,
  StagePanel,
  StatusLine,
  StepBody,
  StepDetail,
  StepDot,
  StepHead,
  StepItem,
  StepLabel,
  StepList,
  StepStateTag,
  Title,
  Wrap,
} from './SendingOverlay.styles';

interface StepSpec {
  readonly key: SendingPhase;
  readonly icon: LucideIcon;
  readonly label: string;
  readonly detail: string;
}

const STEPS: ReadonlyArray<StepSpec> = [
  {
    key: 'creating',
    icon: FileText,
    label: 'Finalizing document',
    detail: 'Locking title and envelope shell',
  },
  {
    key: 'uploading',
    icon: Lock,
    label: 'Uploading + encrypting',
    detail: 'Hashing pages and sealing at rest',
  },
  {
    key: 'adding-signers',
    icon: ShieldCheck,
    label: 'Anchoring audit trail',
    detail: 'Attaching signers to the envelope',
  },
  {
    key: 'placing-fields',
    icon: Mail,
    label: 'Preparing signer invites',
    detail: 'Generating unique signing links per signer',
  },
  {
    key: 'sending',
    icon: Send,
    label: 'Delivering to signers',
    detail: 'Handing off to the mail pipeline',
  },
];

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}

function firstNameOf(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

function phaseIndex(phase: SendingPhase): number {
  return STEPS.findIndex((s) => s.key === phase);
}

/**
 * Full-screen "Sending your envelope" overlay. Drives its animation
 * off `phase` broadcast by `useSendEnvelope`, so the step list, the
 * overall progress bar, and the signer-delivery tiles all stay in
 * sync with the real orchestration.
 */
export const SendingOverlay = forwardRef<HTMLDivElement, SendingOverlayProps>(
  function SendingOverlay(props, ref) {
    const {
      open,
      phase,
      error,
      signers,
      fieldCount,
      envelopeCode,
      onCancel,
      onViewEnvelope,
      onRetry,
      ...rest
    } = props;

    if (!open) return null;

    const done = phase === 'done';
    const errored = phase === 'error';
    const idx = done ? STEPS.length : Math.max(0, phaseIndex(phase));
    const pct = done ? 100 : Math.round((idx / STEPS.length) * 100);

    return (
      <Backdrop ref={ref} role="dialog" aria-modal="true" aria-live="polite" {...rest}>
        <Wrap>
          <Kicker>{done ? 'Delivered' : errored ? 'Send failed' : 'Sealing your envelope'}</Kicker>
          <Title>
            {done
              ? 'Sent. Your envelope is on its way.'
              : errored
                ? 'We hit a snag sending your envelope.'
                : 'Generating and sending your document…'}
          </Title>
          <Meta>
            {envelopeCode !== undefined ? `${envelopeCode} · ` : ''}
            {fieldCount} field{fieldCount === 1 ? '' : 's'} · {signers.length} signer
            {signers.length === 1 ? '' : 's'}
          </Meta>

          <Grid>
            <Panel>
              <OverallRow>
                <OverallHead>
                  <OverallLabel>Overall</OverallLabel>
                  <OverallPct $done={done}>{pct}%</OverallPct>
                </OverallHead>
                <OverallTrack>
                  <OverallFill $pct={pct} $done={done} />
                  {!done && !errored ? <OverallShine $pct={pct} /> : null}
                </OverallTrack>
              </OverallRow>

              <StepList>
                {STEPS.map((s, i) => {
                  const state: 'done' | 'active' | 'pending' =
                    i < idx || done ? 'done' : i === idx && !errored ? 'active' : 'pending';
                  const Icon = s.icon;
                  return (
                    <StepItem key={s.key} $state={state}>
                      <StepDot $state={state}>
                        {state === 'done' ? <Check size={16} /> : <Icon size={16} />}
                      </StepDot>
                      <StepBody>
                        <StepHead>
                          <StepLabel>{s.label}</StepLabel>
                          {state === 'done' ? (
                            <StepStateTag $tone="success">done</StepStateTag>
                          ) : state === 'active' ? (
                            <StepStateTag $tone="indigo">working…</StepStateTag>
                          ) : null}
                        </StepHead>
                        <StepDetail>{s.detail}</StepDetail>
                      </StepBody>
                    </StepItem>
                  );
                })}
              </StepList>

              {error !== null ? <ErrorBanner role="alert">{error}</ErrorBanner> : null}

              <Footer>
                {done ? (
                  onViewEnvelope ? (
                    <Button variant="primary" iconRight={ArrowRight} onClick={onViewEnvelope}>
                      View envelope
                    </Button>
                  ) : null
                ) : errored ? (
                  onRetry ? (
                    <Button variant="primary" onClick={onRetry}>
                      Try again
                    </Button>
                  ) : null
                ) : onCancel ? (
                  <Button variant="secondary" onClick={onCancel}>
                    Cancel
                  </Button>
                ) : null}
              </Footer>
            </Panel>

            <StagePanel>
              <StatusLine>
                {done
                  ? 'All signer invites delivered'
                  : errored
                    ? 'Nothing has been sent. Try again?'
                    : `${STEPS[idx]?.detail ?? ''}…`}
              </StatusLine>
              <SignerRow>
                {signers.slice(0, 4).map((s, i) => {
                  const delivered =
                    done || (idx >= STEPS.length - 1 && i === 0) || idx >= STEPS.length;
                  return (
                    <SignerTile key={s.id} $delivered={delivered}>
                      <SignerAvatar $delivered={delivered}>{initialsOf(s.name)}</SignerAvatar>
                      <SignerFirstName>{firstNameOf(s.name)}</SignerFirstName>
                    </SignerTile>
                  );
                })}
              </SignerRow>
            </StagePanel>
          </Grid>
        </Wrap>
      </Backdrop>
    );
  },
);
SendingOverlay.displayName = 'SendingOverlay';
