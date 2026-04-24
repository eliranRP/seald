import { forwardRef } from 'react';
import {
  Calendar,
  CheckSquare,
  Mail,
  PenTool,
  TextCursorInput,
  Type,
  User,
  type LucideIcon,
} from 'lucide-react';
import { Icon } from '../Icon';
import type { ReviewFieldKind, ReviewListProps } from './ReviewList.types';
import {
  IconBadge,
  LabelStack,
  LabelText,
  PageText,
  Root,
  Row,
  ValueSlot,
} from './ReviewList.styles';

const KIND_ICON: Record<ReviewFieldKind, LucideIcon> = {
  signature: PenTool,
  initials: Type,
  date: Calendar,
  text: TextCursorInput,
  checkbox: CheckSquare,
  email: Mail,
  name: User,
};

/**
 * L2 component — read-only vertical list of filled signing fields shown on the
 * recipient's review screen. Each row displays a kind-specific icon badge, a
 * label with page number, and a right-aligned value preview (text, checkmark,
 * or a signature rendered via <SignatureMark/>).
 */
export const ReviewList = forwardRef<HTMLDivElement, ReviewListProps>((props, ref) => {
  const { items, ...rest } = props;
  return (
    <Root ref={ref} {...rest}>
      {items.map((item) => (
        <Row key={item.id} data-testid={`review-row-${item.id}`} data-kind={item.kind}>
          <IconBadge>
            <Icon icon={KIND_ICON[item.kind]} size={14} />
          </IconBadge>
          <LabelStack>
            <LabelText>{item.label}</LabelText>
            <PageText>Page {item.page}</PageText>
          </LabelStack>
          <ValueSlot>{item.valuePreview}</ValueSlot>
        </Row>
      ))}
    </Root>
  );
});

ReviewList.displayName = 'ReviewList';
