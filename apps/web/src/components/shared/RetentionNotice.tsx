import { RETENTION_NOTE } from 'shared';

interface RetentionNoticeProps {
  /** Public verify path, for example `/verify/abc`. */
  readonly verifyPath: string;
}

/**
 * Retention copy shared by the send-confirmation and signing-done screens.
 * There is no purge job, so this does not promise a year count.
 */
export function RetentionNotice({ verifyPath }: RetentionNoticeProps) {
  return (
    <span>
      {RETENTION_NOTE} Verify any time at <a href={verifyPath}>{verifyPath}</a>.
    </span>
  );
}
