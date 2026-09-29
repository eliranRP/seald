import { RETENTION_NOTE } from 'shared';

interface RetentionNoticeProps {
  /**
   * Public verify path, for example `/verify/abc`. Omit when no code is
   * known yet; the notice then states retention only.
   */
  readonly verifyPath?: string;
}

/**
 * Retention copy shared by the send-confirmation and signing-done screens.
 * There is no purge job, so this does not promise a year count.
 */
export function RetentionNotice({ verifyPath }: RetentionNoticeProps) {
  if (!verifyPath) {
    return <span>{RETENTION_NOTE}</span>;
  }
  return (
    <span>
      {RETENTION_NOTE} Verify any time at <a href={verifyPath}>{verifyPath}</a>.
    </span>
  );
}
