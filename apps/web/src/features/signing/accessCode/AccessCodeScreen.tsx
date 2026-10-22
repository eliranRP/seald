import type { AccessCodeSendResponse, AccessCodePurpose } from 'shared';
import styled from 'styled-components';
import { verifyAccessCode } from './accessCodeApi';
import type { AccessCodeVerifyResponse } from './accessCodeApi';
import { AccessCodeForm } from './AccessCodeForm';

const Page = styled.div`
  min-height: 100vh;
  background: ${({ theme }) => theme.color.ink[50]};
  display: grid;
  place-items: center;
  padding: ${({ theme }) => theme.space[4]};
  font-family: ${({ theme }) => theme.font.sans};
`;

const Card = styled.section`
  width: 100%;
  max-width: 440px;
  display: grid;
  gap: ${({ theme }) => theme.space[4]};
  background: ${({ theme }) => theme.color.paper};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.lg};
  padding: ${({ theme }) => theme.space[6]};
  text-align: center;
`;

const Title = styled.h1`
  margin: 0;
  font-family: ${({ theme }) => theme.font.serif};
  font-size: ${({ theme }) => theme.font.size.h3};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  color: ${({ theme }) => theme.color.fg[1]};
  letter-spacing: -0.01em;
`;

export interface AccessCodeScreenProps {
  readonly emailMasked: string;
  /** The code was accepted and the signer session started. */
  readonly onVerified: (result: AccessCodeVerifyResponse) => void;
  readonly onSessionLost?: (() => void) | undefined;
  /** Replaces the network calls (stories and tests). */
  readonly sendCode?: ((purpose: AccessCodePurpose) => Promise<AccessCodeSendResponse>) | undefined;
  readonly verifyCode?: ((code: string) => Promise<AccessCodeVerifyResponse>) | undefined;
}

/**
 * Full-page step shown when `POST /sign/start` answers `access_code_required`
 * (WP-10): the sender asked for an emailed one-time code before the signer
 * can open the document. Nothing is revealed about the document here.
 */
export function AccessCodeScreen({
  emailMasked,
  onVerified,
  onSessionLost,
  sendCode,
  verifyCode = verifyAccessCode,
}: AccessCodeScreenProps) {
  return (
    <Page>
      <Card aria-labelledby="access-code-title">
        <Title id="access-code-title">Enter your emailed code</Title>
        <AccessCodeForm
          purpose="access"
          emailMasked={emailMasked}
          submitLabel="Continue"
          sendCode={sendCode}
          onSessionLost={onSessionLost}
          onSubmitCode={async (code) => {
            onVerified(await verifyCode(code));
          }}
        />
      </Card>
    </Page>
  );
}
