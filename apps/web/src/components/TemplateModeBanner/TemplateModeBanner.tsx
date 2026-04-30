import { forwardRef } from 'react';
import { CheckCircle2, Info, X } from 'lucide-react';
import { Icon } from '../Icon';
import type { TemplateModeBannerProps } from './TemplateModeBanner.types';
import { Body, DismissButton, IconWrap, Subtitle, Title, Wrap } from './TemplateModeBanner.styles';

/**
 * L3 widget — contextual banner the editor surfaces when the user
 * arrived from the templates wizard. Three real-world copies:
 *
 *   new mode → "Last step — place fields, then save as template" (success)
 *   use+saved → "Saved layout loaded · N fields across M pages" (info)
 *   use+new   → "Saved layout adapted to your new document" (info)
 *
 * The component itself is generic — the host page decides the copy
 * and tone. We expose `onDismiss` so the user can collapse it once
 * the message has been read; absent that prop, the banner is fixed.
 */
export const TemplateModeBanner = forwardRef<HTMLDivElement, TemplateModeBannerProps>(
  (props, ref) => {
    const { tone = 'info', title, subtitle, onDismiss, ...rest } = props;
    const role = tone === 'success' ? 'status' : 'note';
    return (
      <Wrap ref={ref} $tone={tone} role={role} {...rest}>
        <IconWrap aria-hidden>
          <Icon icon={tone === 'success' ? CheckCircle2 : Info} size={18} />
        </IconWrap>
        <Body>
          <Title>{title}</Title>
          {subtitle ? <Subtitle>{subtitle}</Subtitle> : null}
        </Body>
        {onDismiss ? (
          <DismissButton type="button" onClick={onDismiss} aria-label="Dismiss banner">
            <Icon icon={X} size={14} />
          </DismissButton>
        ) : null}
      </Wrap>
    );
  },
);

TemplateModeBanner.displayName = 'TemplateModeBanner';
