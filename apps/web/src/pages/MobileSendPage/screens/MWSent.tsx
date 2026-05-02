import { Check, FileText } from 'lucide-react';
import styled from 'styled-components';
import { PrimaryBtn, SecondaryBtn } from '../MobileSendPage.styles';
import type { MobileSigner } from '../types';

const Wrap = styled.div`
  padding: 48px 24px 24px;
  text-align: center;
`;

const SuccessHalo = styled.div`
  width: 64px;
  height: 64px;
  border-radius: 32px;
  background: var(--success-50);
  margin: 0 auto 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--success-700);
`;

const Sealed = styled.div`
  font-family: 'Caveat', ${({ theme }) => theme.font.serif};
  font-size: 64px;
  font-weight: 600;
  color: var(--indigo-700);
  line-height: 1;
  margin-bottom: 6px;
`;

const Headline = styled.div`
  font-family: ${({ theme }) => theme.font.serif};
  font-size: 24px;
  font-weight: 500;
  color: var(--fg-1);
  letter-spacing: -0.02em;
  line-height: 1.2;
  margin-bottom: 8px;
`;

const Lead = styled.div`
  font-size: 14px;
  color: var(--fg-3);
  max-width: 280px;
  margin: 0 auto 28px;
`;

const Card = styled.div`
  background: #fff;
  border: 1px solid var(--border-1);
  border-radius: 16px;
  padding: 14px 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  text-align: left;
  margin: 0 auto 28px;
`;

const Thumb = styled.span`
  width: 42px;
  height: 42px;
  border-radius: 8px;
  background: var(--ink-100);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--fg-3);
  flex-shrink: 0;
`;

const DocName = styled.div`
  font-size: 14px;
  font-weight: 600;
  color: var(--fg-1);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const DocCode = styled.div`
  font-size: 12px;
  color: var(--fg-3);
  font-family: ${({ theme }) => theme.font.mono};
  margin-top: 2px;
`;

const Actions = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

export interface MWSentProps {
  readonly title: string;
  readonly code?: string;
  readonly signers: ReadonlyArray<MobileSigner>;
  readonly onView: () => void;
  readonly onAnother: () => void;
}

export function MWSent(props: MWSentProps) {
  const { title, code, signers, onView, onAnother } = props;
  const headline =
    signers.length === 1
      ? `We've emailed ${signers[0]?.name.split(' ')[0] ?? 'your signer'}.`
      : `We've emailed ${signers.length} signers.`;
  return (
    <Wrap>
      <SuccessHalo aria-hidden>
        <Check size={32} />
      </SuccessHalo>
      <Sealed aria-hidden>Sealed.</Sealed>
      <Headline>Sent for signature</Headline>
      <Lead>{headline} You&apos;ll get a notification the moment they sign.</Lead>
      <Card>
        <Thumb aria-hidden>
          <FileText size={20} />
        </Thumb>
        <div style={{ flex: 1, minWidth: 0 }}>
          <DocName>{title}</DocName>
          <DocCode>
            {code ? `${code} · ` : ''}
            awaiting{' '}
            {signers.length === 1 ? signers[0]?.name.split(' ')[0] : `${signers.length} signers`}
          </DocCode>
        </div>
      </Card>
      <Actions>
        <PrimaryBtn type="button" onClick={onView}>
          View status
        </PrimaryBtn>
        <SecondaryBtn type="button" onClick={onAnother}>
          Send another
        </SecondaryBtn>
      </Actions>
    </Wrap>
  );
}
