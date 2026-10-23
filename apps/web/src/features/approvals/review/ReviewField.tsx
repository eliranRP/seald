import styled from 'styled-components';
import type { EnvelopeField } from '@/features/envelopes';
import { colorOf, fieldBox, FIELD_LABELS, type ReviewSigner } from './reviewModel';

/**
 * Read-only tile for one field on the review page: the signer's colour at
 * a light fill, a 1.5px border in that colour, a 6px radius and a 12px/600
 * header. It takes no handlers, so a tap on the page can never change a
 * field. `color-mix` keeps the fill a tint of whatever colour the signer
 * has, with no hex in the source.
 */
const Box = styled.div<{ readonly $color: string }>`
  position: absolute;
  box-sizing: border-box;
  min-width: 18px;
  min-height: 14px;
  overflow: hidden;
  padding: 1px 4px;
  border: 1.5px solid ${({ $color }) => $color};
  border-radius: ${({ theme }) => theme.radius.xs};
  background: ${({ $color }) => `color-mix(in srgb, ${$color} 16%, transparent)`};
  color: ${({ theme }) => theme.color.ink[900]};
  font-family: ${({ theme }) => theme.font.sans};
  font-size: 12px;
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  line-height: 1.2;
  white-space: nowrap;
  text-overflow: ellipsis;
`;

export interface ReviewFieldProps {
  readonly field: EnvelopeField;
  readonly signer: ReviewSigner | undefined;
}

export function ReviewField({ field, signer }: ReviewFieldProps) {
  const box = fieldBox(field);
  const label = FIELD_LABELS[field.kind];
  const owner = signer ? signer.name : 'unassigned';
  return (
    <Box
      role="group"
      aria-label={`${label} field for ${owner}`}
      $color={colorOf(signer)}
      style={{
        left: `${box.left}%`,
        top: `${box.top}%`,
        width: `${box.width}%`,
        height: `${box.height}%`,
      }}
    >
      {label}
    </Box>
  );
}
