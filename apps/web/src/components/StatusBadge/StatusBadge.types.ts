import type { SignerStatus } from '@/types/sealdTypes';

/**
 * Envelope-level status tones from the v2 design (canvas `.badge-*`):
 * you = your turn · others = waiting on others · sealing = completing ·
 * sealed · declined · expired · canceled · draft.
 */
export type EnvelopeBadgeStatus =
  'you' | 'others' | 'sealing' | 'sealed' | 'declined' | 'expired' | 'canceled' | 'draft';

export interface StatusBadgeProps {
  readonly status: SignerStatus | EnvelopeBadgeStatus;
  /** Override the default label (e.g. "Waiting on Maya"). */
  readonly label?: string | undefined;
  /**
   * Icon only (canvas mobile card `.badge` with just its `.ic`): the label
   * becomes the badge's accessible name (`role="img"`).
   */
  readonly iconOnly?: boolean | undefined;
}
