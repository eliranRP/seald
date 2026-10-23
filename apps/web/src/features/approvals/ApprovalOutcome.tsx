import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Clock, Info, XCircle, type LucideIcon } from 'lucide-react';
import styled from 'styled-components';
import type { ApprovalCardState } from 'shared';
import { failureCopy } from './model';

type Tone = 'success' | 'danger' | 'warn' | 'neutral';

interface OutcomeCopy {
  readonly title: string;
  readonly body: string;
  readonly tone: Tone;
  readonly icon: LucideIcon;
}

const COPY: Readonly<Record<Exclude<ApprovalCardState, 'pending'>, OutcomeCopy>> = {
  done: {
    title: 'Approved',
    body: 'Seald has the go-ahead and is carrying it out. You can close this page.',
    tone: 'success',
    icon: CheckCircle2,
  },
  denied: {
    title: 'Denied',
    body: 'Nothing was sent. You can close this page.',
    tone: 'neutral',
    icon: XCircle,
  },
  expired: {
    title: 'Expired',
    body: 'This link is no longer valid. Ask your agent to make the request again.',
    tone: 'warn',
    icon: Clock,
  },
  failed: {
    title: 'Failed',
    body: 'The request was approved but did not go through. Nothing was sent.',
    tone: 'danger',
    icon: AlertTriangle,
  },
  superseded: {
    title: 'Updated, see the newest email',
    body: 'This request changed after this email was sent. Use the link in the newest email.',
    tone: 'neutral',
    icon: Info,
  },
};

const Root = styled.section<{ readonly $tone: Tone }>`
  display: flex;
  align-items: flex-start;
  gap: ${({ theme }) => theme.space[3]};
  box-sizing: border-box;
  width: 100%;
  padding: ${({ theme }) => theme.space[5]};
  border: 1px solid
    ${({ $tone, theme }) => {
      if ($tone === 'success') return theme.color.success[500];
      if ($tone === 'danger') return theme.color.danger[500];
      if ($tone === 'warn') return theme.color.warn[500];
      return theme.color.border[1];
    }};
  border-radius: ${({ theme }) => theme.radius.lg};
  background: ${({ theme }) => theme.color.paper};
  color: ${({ theme }) => theme.color.fg[1]};
  font-family: ${({ theme }) => theme.font.sans};
`;

const Body = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[2]};
  min-width: 0;
`;

const Title = styled.h2`
  margin: 0;
  font-size: ${({ theme }) => theme.font.size.h5};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
`;

const Text = styled.p`
  margin: 0;
  font-size: ${({ theme }) => theme.font.size.bodySm};
  color: ${({ theme }) => theme.color.fg[2]};
  line-height: ${({ theme }) => theme.font.lineHeight.normal};
`;

export interface ApprovalOutcomeProps {
  readonly state: Exclude<ApprovalCardState, 'pending'>;
  /** Why a Failed approval failed. A slug, never a token. */
  readonly resultSlug?: string | null | undefined;
  /** Extra controls, for example "Revoke this key" on Denied. */
  readonly children?: ReactNode | undefined;
}

/** The one state a handled, expired, failed or replaced link shows. */
export function ApprovalOutcome({ state, resultSlug, children }: ApprovalOutcomeProps) {
  const copy = COPY[state];
  const Glyph = copy.icon;
  const body = state === 'failed' ? failureCopy(resultSlug) : copy.body;
  return (
    <Root $tone={copy.tone} role="status" aria-label={copy.title}>
      <Glyph size={22} strokeWidth={1.75} aria-hidden />
      <Body>
        <Title>{copy.title}</Title>
        <Text>{body}</Text>
        {children}
      </Body>
    </Root>
  );
}
