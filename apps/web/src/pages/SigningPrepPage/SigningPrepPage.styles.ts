import styled from 'styled-components';
import { ErrorBanner as SharedErrorBanner } from '@/components/shared/ErrorBanner';

export const Page = styled.div`
  min-height: 100vh;
  background: ${({ theme }) => theme.color.ink[100]};
  font-family: ${({ theme }) => theme.font.sans};
  color: ${({ theme }) => theme.color.fg[2]};
`;

export const Inner = styled.div`
  max-width: 560px;
  margin: 0 auto;
  padding: 48px 24px 80px;
`;

export const Chip = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 4px 12px;
  border-radius: ${({ theme }) => theme.radius.pill};
  background: ${({ theme }) => theme.color.indigo[50]};
  color: ${({ theme }) => theme.color.indigo[700]};
  font-size: ${({ theme }) => theme.font.size.caption};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  margin-bottom: ${({ theme }) => theme.space[5]};
`;

export const Hero = styled.h1`
  font-family: ${({ theme }) => theme.font.serif};
  /* Item 8 — design-spec hero is 40px (between theme.font.size.h2 36px and
     h1 48px); the signer-flow uses this size across prep / done. The theme
     does not currently expose a hero token so we pin the literal here,
     mirrored in SigningDonePage.tsx so the two heroes stay in lock-step. */
  font-size: 40px;
  font-weight: ${({ theme }) => theme.font.weight.medium};
  color: ${({ theme }) => theme.color.fg[1]};
  letter-spacing: -0.02em;
  line-height: 1.1;
  margin: 0;
`;

export const Subhero = styled.p`
  font-size: 15px;
  color: ${({ theme }) => theme.color.fg[3]};
  margin: ${({ theme }) => theme.space[4]} 0 0;
  line-height: 1.6;
`;

export const IdCard = styled.div`
  margin-top: ${({ theme }) => theme.space[8]};
  background: ${({ theme }) => theme.color.paper};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.lg};
  padding: 24px;
`;

export const SigningAsLabel = styled.div`
  font-size: ${({ theme }) => theme.font.size.micro};
  font-weight: ${({ theme }) => theme.font.weight.bold};
  letter-spacing: 0.08em;
  color: ${({ theme }) => theme.color.fg[3]};
  text-transform: uppercase;
  margin-bottom: ${({ theme }) => theme.space[4]};
`;

export const IdRow = styled.div`
  display: flex;
  align-items: center;
  gap: 14px;
`;

export const IdName = styled.div`
  font-size: ${({ theme }) => theme.font.size.bodySm};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.fg[1]};
`;

export const IdEmail = styled.div`
  font-size: ${({ theme }) => theme.font.size.caption};
  color: ${({ theme }) => theme.color.fg[3]};
  margin-top: 2px;
`;

export const TosRow = styled.label`
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-top: ${({ theme }) => theme.space[5]};
  padding-top: ${({ theme }) => theme.space[5]};
  border-top: 1px solid ${({ theme }) => theme.color.border[1]};
  font-size: ${({ theme }) => theme.font.size.caption};
  color: ${({ theme }) => theme.color.fg[2]};
  cursor: pointer;
  line-height: 1.55;
`;

export const Checkbox = styled.input`
  width: 18px;
  height: 18px;
  margin-top: 1px;
  accent-color: ${({ theme }) => theme.color.ink[900]};
  cursor: pointer;
  /* Item 6 — keyboard users get a clear focus indicator instead of the
     barely-visible global 2px outline at 18×18. Mirrors the SignatureCapture
     close button so the disclosure / access checkboxes share the visual
     vocabulary used everywhere else. */
  &:focus-visible {
    outline: none;
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
`;

export const PrimaryBtn = styled.button`
  margin-top: ${({ theme }) => theme.space[6]};
  width: 100%;
  height: 52px;
  border: none;
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.color.ink[900]};
  color: ${({ theme }) => theme.color.paper};
  font-size: 15px;
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  &:disabled {
    background: ${({ theme }) => theme.color.ink[300]};
    cursor: not-allowed;
  }
`;

export const DeclineLink = styled.button`
  background: transparent;
  border: none;
  color: ${({ theme }) => theme.color.fg[3]};
  font-size: ${({ theme }) => theme.font.size.caption};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  text-align: left;
  display: block;
  width: 100%;
  padding: 8px 0;
  cursor: pointer;
  text-decoration: underline;
  &:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
`;

/**
 * T-16 — sits below the Decline link as a separate, less-prominent
 * affordance. Same styling as DeclineLink but tighter spacing, since
 * the two terminal actions are visually paired.
 */
export const WithdrawLink = styled.button`
  background: transparent;
  border: none;
  color: ${({ theme }) => theme.color.fg[3]};
  font-size: ${({ theme }) => theme.font.size.caption};
  font-weight: ${({ theme }) => theme.font.weight.regular};
  text-align: left;
  display: block;
  width: 100%;
  padding: 8px 0;
  cursor: pointer;
  text-decoration: underline;
  opacity: 0.78;
  &:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
`;

/**
 * Item 5 — wraps the three destructive opt-out controls (Wrong recipient /
 * Decline / Withdraw consent) into a single subdued `<details>` block
 * below `AesDisclosure` so accidental clicks during signing require an
 * explicit disclosure step.
 */
export const OptOutDetails = styled.details`
  margin-top: ${({ theme }) => theme.space[5]};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.color.ink[50]};
  padding: ${({ theme }) => theme.space[3]} ${({ theme }) => theme.space[4]};
  font-size: ${({ theme }) => theme.font.size.caption};
  color: ${({ theme }) => theme.color.fg[3]};
`;

export const OptOutSummary = styled.summary`
  cursor: pointer;
  list-style: none;
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.fg[2]};
  /* The native disclosure triangle is muted vs. the rest of the screen;
     hide it and ship the text as the entire affordance. */
  &::-webkit-details-marker {
    display: none;
  }
  &:focus-visible {
    outline: none;
    box-shadow: ${({ theme }) => theme.shadow.focus};
    border-radius: ${({ theme }) => theme.radius.xs};
  }
`;

export const OptOutBody = styled.div`
  margin-top: ${({ theme }) => theme.space[3]};
  padding-top: ${({ theme }) => theme.space[3]};
  border-top: 1px solid ${({ theme }) => theme.color.border[1]};
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[2]};
`;

/**
 * Item 10 — demoted marketing line. `<small>` semantics so screen-readers
 * de-emphasize it and visual treatment matches `AesDisclosure`'s footer.
 */
export const AccountNote = styled.small`
  display: block;
  margin-top: ${({ theme }) => theme.space[2]};
  font-size: ${({ theme }) => theme.font.size.micro};
  color: ${({ theme }) => theme.color.fg[3]};
  line-height: 1.5;
`;

/**
 * Item 7 — styled withdraw-consent dialog buttons. Mirror the destructive /
 * neutral pair used by SendConfirmDialog so the visual vocabulary is
 * consistent across confirm flows.
 */
export const WithdrawDialogConfirm = styled.button`
  padding: 10px 18px;
  border: none;
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.color.danger[500]};
  color: ${({ theme }) => theme.color.paper};
  font-size: ${({ theme }) => theme.font.size.caption};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  cursor: pointer;
  &:focus-visible {
    outline: none;
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
  &:disabled {
    background: ${({ theme }) => theme.color.ink[300]};
    cursor: not-allowed;
  }
`;

export const WithdrawDialogCancel = styled.button`
  padding: 10px 18px;
  border: 1px solid ${({ theme }) => theme.color.border[2]};
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.color.paper};
  color: ${({ theme }) => theme.color.fg[2]};
  font-size: ${({ theme }) => theme.font.size.caption};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  cursor: pointer;
  &:focus-visible {
    outline: none;
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
`;

/**
 * Item 7 — surfaces the audit-event name the dialog is about to write
 * so the user can see exactly what the audit trail will record.
 */
export const WithdrawDialogEventName = styled.code`
  display: inline-block;
  padding: 2px 6px;
  border-radius: ${({ theme }) => theme.radius.xs};
  background: ${({ theme }) => theme.color.ink[100]};
  color: ${({ theme }) => theme.color.fg[2]};
  font-family: ${({ theme }) => theme.font.mono};
  font-size: ${({ theme }) => theme.font.size.micro};
`;

/**
 * T-26 — small attribution disclosure under the IdCard explaining
 * what level of e-signature Seald produces and when wet ink may
 * still be required.
 */
export const AesDisclosure = styled.p`
  margin: ${({ theme }) => theme.space[5]} 0 0;
  padding: 12px 14px;
  background: ${({ theme }) => theme.color.ink[50]};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.md};
  font-size: ${({ theme }) => theme.font.size.micro};
  color: ${({ theme }) => theme.color.fg[3]};
  line-height: 1.55;
`;

export const ErrorBanner = styled(SharedErrorBanner)`
  margin-top: ${({ theme }) => theme.space[4]};
`;
