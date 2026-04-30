import { forwardRef } from 'react';
import { AlertCircle, Check, Info } from 'lucide-react';
import { Icon } from '../Icon';
import type { ToastProps } from './Toast.types';
import { Body, IconBadge, Subtitle, Title, Wrap } from './Toast.styles';

/**
 * L3 widget — top-center floating toast for transient confirmations
 * ("Template saved", "Sent + template updated"). The toast does NOT
 * own its own auto-dismiss timer: the parent decides how long the
 * toast lives so the same component works for ephemeral
 * confirmations and for sticky errors that should wait for an
 * explicit dismiss. The host typically pairs a 4-6s timeout with
 * a `setTemplate(null)` that unmounts the toast.
 *
 * Accessibility: the wrap is `role="status"` for success/info (polite
 * announcement) and `role="alert"` for the error tone (assertive).
 * No focus-trap — the toast must not steal focus from the editor.
 */
export const Toast = forwardRef<HTMLDivElement, ToastProps>((props, ref) => {
  const { title, subtitle, tone = 'success', ...rest } = props;
  const role = tone === 'error' ? 'alert' : 'status';
  const glyph = tone === 'error' ? AlertCircle : tone === 'info' ? Info : Check;
  return (
    <Wrap ref={ref} role={role} aria-live={tone === 'error' ? 'assertive' : 'polite'} {...rest}>
      <IconBadge $tone={tone} aria-hidden>
        <Icon icon={glyph} size={14} />
      </IconBadge>
      <Body>
        <Title>{title}</Title>
        {subtitle ? <Subtitle>{subtitle}</Subtitle> : null}
      </Body>
    </Wrap>
  );
});

Toast.displayName = 'Toast';
