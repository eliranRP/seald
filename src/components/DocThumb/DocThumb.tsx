import { forwardRef } from 'react';
import type { DocThumbProps } from './DocThumb.types';
import { Thumb, Line, Signed } from './DocThumb.styles';

export const DocThumb = forwardRef<HTMLDivElement, DocThumbProps>((props, ref) => {
  const { title, size = 52, signed = false, ...rest } = props;
  return (
    <Thumb $size={size} {...rest} ref={ref} role="img" aria-label={title}>
      <Line $top={9} $width={60} />
      <Line $top={14} $width={75} />
      <Line $top={19} $width={45} />
      <Line $top={24} $width={65} />
      {signed ? <Signed>signed</Signed> : null}
    </Thumb>
  );
});
DocThumb.displayName = 'DocThumb';
