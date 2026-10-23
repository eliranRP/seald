import { forwardRef, useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { Icon } from '../Icon';
import type { ToastProps } from './Toast.types';
import { Body, IconSlot, Sep, Subtitle, Title, ToastButton, Wrap } from './Toast.styles';

const GLYPH = { success: CheckCircle2, error: AlertCircle, info: Info } as const;

/**
 * L3 widget — dark floating toast (canvas `.toast`) for transient
 * confirmations ("Sent to 3 signers") with an optional inline action
 * (Undo, Retry) and a Dismiss button.
 *
 * The host owns mounting. Pass `duration` + `onClose` for auto-dismiss
 * (paused while hovered or focused), or omit `duration` for a sticky toast.
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

  useEffect(() => {
    if (duration === undefined || paused) return undefined;
    const id = window.setTimeout(() => onCloseRef.current?.(), duration);
    return () => window.clearTimeout(id);
  }, [duration, paused]);

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
