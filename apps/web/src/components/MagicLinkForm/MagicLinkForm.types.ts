import type { LucideIcon } from 'lucide-react';

export interface MagicLinkNotice {
  readonly tone: 'info' | 'error';
  readonly icon?: LucideIcon | undefined;
  readonly text: string;
}

export interface MagicLinkFormProps {
  /** Controlled email value (the parent also needs it for the check-email panel). */
  readonly email: string;
  readonly onEmailChange: (email: string) => void;
  /** Called with a format-valid email. Invalid input shows the inline error instead. */
  readonly onSubmit: (email: string) => void;
  /** Continue with Google (leaves the app via OAuth redirect). */
  readonly onGoogle: () => void;
  /** Guest link ("Try without an account"); omit to hide it. */
  readonly onGuest?: (() => void) | undefined;
  /** True while the magic-link request is in flight: spinner + disabled fields. */
  readonly sending?: boolean | undefined;
  /** True while the Google redirect is starting. */
  readonly googleBusy?: boolean | undefined;
  /** Rate-limited: the primary button stays disabled. */
  readonly locked?: boolean | undefined;
  /** Banner above the title (info / error). */
  readonly notice?: MagicLinkNotice | undefined;
  /** Primary label override ("Email me a new link" after an expired link). */
  readonly submitLabel?: string | undefined;
}
