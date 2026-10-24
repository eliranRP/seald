import { forwardRef } from 'react';
import { PanelsTopLeft, Users } from 'lucide-react';
import type { TemplateChipProps } from './TemplateChip.types';
import { CardIcon, CardName, CardText, Chip, Meta } from './TemplateChip.styles';

/** One-click start from a recent template. */
export const TemplateChip = forwardRef<HTMLButtonElement, TemplateChipProps>((props, ref) => {
  const { name, signers, card = false, ...rest } = props;
  const meta =
    signers !== undefined ? (
      <Meta aria-label={`${String(signers)} ${signers === 1 ? 'signer' : 'signers'}`}>
        <Users size={14} strokeWidth={1.75} aria-hidden />
        {signers}
      </Meta>
    ) : null;
  if (card) {
    return (
      <Chip {...rest} ref={ref} type="button" $card>
        <CardIcon aria-hidden>
          <PanelsTopLeft size={20} strokeWidth={1.75} />
        </CardIcon>
        <CardText>
          <CardName>{name}</CardName>
          {meta}
        </CardText>
      </Chip>
    );
  }
  return (
    <Chip {...rest} ref={ref} type="button" $card={false}>
      <PanelsTopLeft size={16} strokeWidth={1.75} aria-hidden />
      {name}
      {meta}
    </Chip>
  );
});

TemplateChip.displayName = 'TemplateChip';
