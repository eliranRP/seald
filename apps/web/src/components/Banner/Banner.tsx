import { forwardRef } from 'react';
import { AlertCircle, CheckCircle2, Info } from 'lucide-react';
import { Icon } from '../Icon';
import type { BannerProps } from './Banner.types';
import { BannerAction, BannerBody, BannerIcon, BannerRoot } from './Banner.styles';

const DEFAULT_ICON = { info: Info, ok: CheckCircle2, error: AlertCircle } as const;

/**
 * L1 primitive — inline banner above a form or section (canvas `.banner`).
 * Errors are `role="alert"`; info / ok are polite `role="status"`.
 */
export const Banner = forwardRef<HTMLDivElement, BannerProps>((props, ref) => {
  const { tone = 'info', icon, action, children, ...rest } = props;
  const glyph = icon === undefined ? DEFAULT_ICON[tone] : icon;
  return (
    <BannerRoot ref={ref} $tone={tone} role={tone === 'error' ? 'alert' : 'status'} {...rest}>
      {glyph ? (
        <BannerIcon>
          <Icon icon={glyph} size={18} />
        </BannerIcon>
      ) : null}
      <BannerBody>{children}</BannerBody>
      {action ? <BannerAction>{action}</BannerAction> : null}
    </BannerRoot>
  );
});
Banner.displayName = 'Banner';
