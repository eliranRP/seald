import styled from 'styled-components';
import { RETENTION_NOTE } from 'shared';

interface RetentionNoticeProps {
  /**
   * Public verify path, for example `/verify/abc`. Omit when no code is
   * known yet; the notice then states retention only.
   */
  readonly verifyPath?: string;
  /**
   * Set on the sent screen, where the path is set in the mono face.
   * The link color always comes from the theme, either way.
   */
  readonly mono?: boolean;
}

const VerifyLink = styled.a<{ $mono: boolean }>`
  color: ${({ theme }) => theme.color.indigo[700]};
  font-family: ${({ theme, $mono }) => ($mono ? theme.font.mono : 'inherit')};
  text-decoration: underline;
  text-underline-offset: 2px;
`;

/**
 * Retention copy shared by the send-confirmation and signing-done screens.
 * There is no purge job, so this does not promise a year count.
 */
export function RetentionNotice({ verifyPath, mono = false }: RetentionNoticeProps) {
  if (!verifyPath) {
    return <span>{RETENTION_NOTE}</span>;
  }
  return (
    <span>
      {RETENTION_NOTE} Verify any time at{' '}
      <VerifyLink href={verifyPath} $mono={mono}>
        {verifyPath}
      </VerifyLink>
      .
    </span>
  );
}
