import { forwardRef } from 'react';
import type { KeyboardEvent } from 'react';
import { Check, PenTool, Calendar, Type, Square, Mail } from 'lucide-react';
import type { FieldKind } from '@/types/sealdTypes';
import { Icon } from '../Icon';
import type { SignatureFieldProps } from './SignatureField.types';
import { FieldRoot, SignatureLine, CheckboxPreview } from './SignatureField.styles';

const KIND_LABEL: Record<FieldKind, string> = {
  signature: 'Signature',
  initials: 'Initials',
  date: 'Date',
  text: 'Text',
  checkbox: 'Checkbox',
  email: 'Email',
};

const KIND_ICON = {
  signature: PenTool,
  initials: Type,
  date: Calendar,
  text: Type,
  checkbox: Square,
  email: Mail,
} as const;

export const SignatureField = forwardRef<HTMLDivElement, SignatureFieldProps>((props, ref) => {
  const {
    kind,
    signerName,
    filled = false,
    selected = false,
    width = 180,
    height = 44,
    onKeyDown,
    ...rest
  } = props;

  const kindLabel = KIND_LABEL[kind];
  const suffix = filled ? ', signed' : '';
  const ariaLabel = `${kindLabel} field for ${signerName}${suffix}`;
  const KindIcon = filled ? Check : KIND_ICON[kind];

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.currentTarget.click();
    }
    onKeyDown?.(e);
  };

  const showGuide = !filled;
  const isCheckbox = kind === 'checkbox';

  return (
    <FieldRoot
      {...rest}
      ref={ref}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={ariaLabel}
      $width={width}
      $height={height}
      $selected={selected}
      $filled={filled}
      $hasSignatureLine={showGuide && !isCheckbox}
      onKeyDown={handleKeyDown}
    >
      {showGuide ? (
        isCheckbox ? (
          <CheckboxPreview />
        ) : (
          <>
            <span>
              <Icon icon={KindIcon} size={16} />
              {kindLabel}
            </span>
            <SignatureLine />
          </>
        )
      ) : (
        <>
          <Icon icon={KindIcon} size={16} />
          <span>{kindLabel}</span>
        </>
      )}
    </FieldRoot>
  );
});

SignatureField.displayName = 'SignatureField';
