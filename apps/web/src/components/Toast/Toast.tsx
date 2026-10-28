import { forwardRef, useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { Icon } from '../Icon';
import type { ToastProps } from './Toast.types';
import { Body, IconSlot, Sep, Subtitle, Title, ToastButton, Wrap } from './Toast.styles';

const GLYPH = { success: CheckCircle2, error: AlertCircle, info: Info } as const;

/**
 * Shortest time a confirmation stays up. Under ~4s a toast is gone before
 * it is read (UX rules: feedback-and-states § 9 — info 4s).
 */
export const MIN_TOAST_MS = 4000;

/**
 * L3 widget — dark floating toast (canvas `.toast`) for transient
 * confirmations ("Sent to 3 signers") with an optional inline action
 * (Undo, Retry) and a Dismiss button.
 *
 * The host owns mounting. Pass `duration` + `onClose` for auto-dismiss
 * (paused while hovered or focused), or omit `duration` for a sticky toast.
 * Auto-dismiss never runs shorter than `MIN_TOAST_MS`, and an error toast
 * with a Dismiss button ignores `duration`: failures stay until the user
 * acknowledges them (UX rules: feedback-and-states § 9).
 *
 * Accessibility: `role="status"` (polite) for success / info and
 * `role="alert"` (assertive) for errors. No focus trap — the toast never
 * steals focus.
 */
export const Toast = forwardRef<HTMLDivElement, ToastProps>((props, ref) => {
  const {
    title,
    subtitle,
    tone = 'success',
    icon,
    action,
    onClose,
    duration,
    placement = 'fixed',
    onMouseEnter,
    onMouseLeave,
    onFocus,
    onBlur,
    ...rest
  } = props;
  const [paused, setPaused] = useState(false);
  // Latest onClose without restarting the timer when the host re-renders
  // with a new inline handler.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const sticky = tone === 'error' && onClose !== undefined;
  const autoDismissMs =
    duration === undefined || sticky ? undefined : Math.max(duration, MIN_TOAST_MS);

  useEffect(() => {
    if (autoDismissMs === undefined || paused) return undefined;
    const id = window.setTimeout(() => onCloseRef.current?.(), autoDismissMs);
    return () => window.clearTimeout(id);
  }, [autoDismissMs, paused]);

  const glyph = icon === undefined ? GLYPH[tone] : icon;
  const role = tone === 'error' ? 'alert' : 'status';

  return (
    <Wrap
      ref={ref}
      role={role}
      aria-live={tone === 'error' ? 'assertive' : 'polite'}
      $placement={placement}
      onMouseEnter={(e) => {
        setPaused(true);
        onMouseEnter?.(e);
      }}
      onMouseLeave={(e) => {
        setPaused(false);
        onMouseLeave?.(e);
      }}
      onFocus={(e) => {
        setPaused(true);
        onFocus?.(e);
      }}
      onBlur={(e) => {
        setPaused(false);
        onBlur?.(e);
      }}
      {...rest}
    >
      {glyph ? (
        <IconSlot $tone={tone}>
          <Icon icon={glyph} size={16} />
        </IconSlot>
      ) : null}
      <Body>
        <Title>{title}</Title>
        {subtitle ? <Subtitle>{subtitle}</Subtitle> : null}
      </Body>
      {action || onClose ? <Sep aria-hidden /> : null}
      {action ? (
        <ToastButton type="button" onClick={action.onClick}>
          {action.label}
        </ToastButton>
      ) : null}
      {onClose ? (
        <ToastButton type="button" $icon aria-label="Dismiss" onClick={onClose}>
          <Icon icon={X} size={14} />
        </ToastButton>
      ) : null}
    </Wrap>
  );
});

Toast.displayName = 'Toast';
