import { forwardRef } from 'react';
import { LayoutTemplate, Users } from 'lucide-react';
import type { TemplateChipProps } from './TemplateChip.types';
import { Chip, Meta } from './TemplateChip.styles';

/** One-click start from a recent template. */
export const TemplateChip = forwardRef<HTMLButtonElement, TemplateChipProps>((props, ref) => {
  const { name, signers, ...rest } = props;
  return (
    <Chip {...rest} ref={ref} type="button">
      <LayoutTemplate size={16} strokeWidth={1.75} aria-hidden />
      {name}
      {signers !== undefined ? (
        <Meta aria-label={`${String(signers)} ${signers === 1 ? 'signer' : 'signers'}`}>
          <Users size={14} strokeWidth={1.75} aria-hidden />
          {signers}
        </Meta>
      ) : null}
    </Chip>
  );
});

TemplateChip.displayName = 'TemplateChip';
