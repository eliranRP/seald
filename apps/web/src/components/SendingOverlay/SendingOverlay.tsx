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
  StageAudit,
  StageBg,
  StageEnvelope,
  StageFrame,
  StagePanel,
  StagePdf,
  StagePdfLine,
  StagePdfSig,
  StageScanLine,
  StageSeal,
  StageShimmer,
  StageSignerAvatar,
  StageSignerCheck,
  StageSignerName,
  StageSignerRow,
  StageSignerTile,
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
export const SendingOverlay = forwardRef<HTMLDivElement, SendingOverlayProps>((props, ref) => {
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

  let kicker: string;
  if (done) kicker = 'Delivered';
  else if (errored) kicker = 'Send failed';
  else kicker = 'Sealing your envelope';

  let title: string;
  if (done) title = 'Sent. Your envelope is on its way.';
  else if (errored) title = 'We hit a snag sending your envelope.';
  else title = 'Generating and sending your document…';

  let statusLine: string;
  if (done) statusLine = 'All signer invites delivered';
  else if (errored) statusLine = 'Nothing has been sent. Try again?';
  else statusLine = `${STEPS[idx]?.detail ?? ''}…`;

  let envelopeStage: 'entered' | 'sealed' | 'flying';
  if (idx >= 4 || done) envelopeStage = 'flying';
  else if (idx >= 2) envelopeStage = 'sealed';
  else envelopeStage = 'entered';

  const computeStepState = (i: number): 'done' | 'active' | 'pending' => {
    if (i < idx || done) return 'done';
    if (i === idx && !errored) return 'active';
    return 'pending';
  };

  return (
    <Backdrop ref={ref} role="dialog" aria-modal="true" aria-live="polite" {...rest}>
      <Wrap>
        <Kicker>{kicker}</Kicker>
        <Title>{title}</Title>
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
                const state = computeStepState(i);
                const Icon = s.icon;
                return (
                  <StepItem key={s.key} $state={state}>
                    <StepDot $state={state}>
                      {state === 'done' ? <Check size={16} /> : <Icon size={16} />}
                    </StepDot>
                    <StepBody>
                      <StepHead>
                        <StepLabel>{s.label}</StepLabel>
                        {(() => {
                          if (state === 'done')
                            return <StepStateTag $tone="success">done</StepStateTag>;
                          if (state === 'active')
                            return <StepStateTag $tone="indigo">working…</StepStateTag>;
                          return null;
                        })()}
                      </StepHead>
                      <StepDetail>{s.detail}</StepDetail>
                    </StepBody>
                  </StepItem>
                );
              })}
            </StepList>

            {error !== null ? <ErrorBanner role="alert">{error}</ErrorBanner> : null}

            <Footer>
              {(() => {
                if (done) {
                  return onViewEnvelope ? (
                    <Button variant="primary" iconRight={ArrowRight} onClick={onViewEnvelope}>
                      View envelope
                    </Button>
                  ) : null;
                }
                if (errored) {
                  return onRetry ? (
                    <Button variant="primary" onClick={onRetry}>
                      Try again
                    </Button>
                  ) : null;
                }
                return onCancel ? (
                  <Button variant="secondary" onClick={onCancel}>
                    Cancel
                  </Button>
                ) : null;
              })()}
            </Footer>
          </Panel>

          <StagePanel>
            <StageBg aria-hidden />
            <StageFrame aria-hidden>
              {/* Page: visible until the envelope takes over (step 3+) */}
              <StagePdf $collapsed={idx >= 1 || done} $hidden={idx >= 3 || done}>
                <StagePdfLine $w="70%" $bold />
                <StagePdfLine $w="90%" />
                <StagePdfLine $w="82%" />
                <StagePdfLine $w="76%" />
                <StagePdfLine $w="60%" />
                <StagePdfSig>sign</StagePdfSig>
                <StagePdfLine $w="85%" />
                <StagePdfLine $w="70%" />
                {idx === 0 && !errored && !done ? <StageScanLine /> : null}
              </StagePdf>

              {/* Envelope: appears at "uploading" (encrypt), gets its
                    wax seal at "adding-signers" (anchor), and flies out
                    to the signer row at "sending" (deliver). */}
              <StageEnvelope $visible={idx >= 1 || done} $state={envelopeStage}>
                <svg viewBox="0 0 160 110" width="160" height="110" style={{ overflow: 'visible' }}>
                  <defs>
                    <linearGradient id="so-env-body" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0" stopColor="#F8FAFC" />
                      <stop offset="1" stopColor="#EEF2FF" />
                    </linearGradient>
                    <linearGradient id="so-env-flap" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0" stopColor="#FFFFFF" />
                      <stop offset="1" stopColor="#E0E7FF" />
                    </linearGradient>
                    <linearGradient id="so-shimmer" x1="0" x2="1">
                      <stop offset="0" stopColor="#4F46E5" stopOpacity="0" />
                      <stop offset=".5" stopColor="#4F46E5" stopOpacity=".2" />
                      <stop offset="1" stopColor="#4F46E5" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <rect
                    x="8"
                    y="18"
                    width="144"
                    height="84"
                    rx="8"
                    fill="url(#so-env-body)"
                    stroke="#C7D2FE"
                  />
                  <path d="M8 26 L80 70 L152 26" fill="none" stroke="#A5B4FC" strokeWidth="1.2" />
                  <path
                    d="M8 26 L80 2 L152 26 L152 34 L80 12 L8 34 Z"
                    fill="url(#so-env-flap)"
                    stroke="#C7D2FE"
                  />
                  <StageSeal $visible={idx >= 2 || done}>
                    <circle cx="80" cy="70" r="18" fill="#4F46E5" />
                    <circle
                      cx="80"
                      cy="70"
                      r="18"
                      fill="none"
                      stroke="#FFFFFF"
                      strokeWidth="1"
                      strokeDasharray="2 3"
                      opacity=".6"
                    />
                    <path
                      d="M72 68 C 74 67, 76 65, 78 64 L 84 58 L 86 60 L 80 66 C 79 69, 76 72, 73 73 Z"
                      fill="#FFFFFF"
                    />
                  </StageSeal>
                  {idx === 1 && !errored && !done ? (
                    <StageShimmer
                      x="8"
                      y="18"
                      width="144"
                      height="84"
                      rx="8"
                      fill="url(#so-shimmer)"
                    />
                  ) : null}
                </svg>
                <StageAudit $visible={idx >= 2 || done}>
                  anchor · {(signers[0]?.id ?? 'abc123').slice(0, 6)}
                </StageAudit>
              </StageEnvelope>

              {/* Signer row — avatars lift + gain a success ring as
                    they "receive" their invite from step 3 onward. */}
              <StageSignerRow>
                {signers.slice(0, 3).map((s, i) => {
                  const show = idx >= 3 || done;
                  const delivered = done || (idx >= 4 && i <= idx - 4);
                  return (
                    <StageSignerTile key={s.id} $visible={show} $delivered={delivered}>
                      <StageSignerAvatar $delivered={delivered}>
                        {initialsOf(s.name)}
                        {delivered ? (
                          <StageSignerCheck>
                            <Check size={9} strokeWidth={3} />
                          </StageSignerCheck>
                        ) : null}
                      </StageSignerAvatar>
                      <StageSignerName>{firstNameOf(s.name)}</StageSignerName>
                    </StageSignerTile>
                  );
                })}
              </StageSignerRow>
            </StageFrame>
            <StatusLine>{statusLine}</StatusLine>
          </StagePanel>
        </Grid>
      </Wrap>
    </Backdrop>
  );
});
SendingOverlay.displayName = 'SendingOverlay';
