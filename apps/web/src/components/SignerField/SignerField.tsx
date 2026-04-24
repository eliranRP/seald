import { forwardRef } from 'react';
import {
  Calendar,
  Check,
  CheckSquare,
  Mail,
  PenTool,
  TextCursorInput,
  Type,
  User,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Icon } from '../Icon';
import { SignatureMark } from '../SignatureMark';
import type { SignerFieldKind, SignerFieldProps } from './SignerField.types';
import type { Tone } from './SignerField.styles';
import {
  CheckboxMark,
  EmptyLabel,
  FilledText,
  InitialScript,
  RequiredStar,
  Root,
} from './SignerField.styles';

const KIND_ICON: Record<SignerFieldKind, LucideIcon> = {
  signature: PenTool,
  initials: Type,
  date: Calendar,
  text: TextCursorInput,
  checkbox: CheckSquare,
  email: Mail,
  name: User,
};

function deriveTone(filled: boolean, active: boolean, required: boolean): Tone {
  if (filled) return 'success';
  if (active) return 'indigo';
  if (required) return 'amber';
  return 'neutral';
}

/**
 * L2 component — absolute-positioned in-doc field the recipient taps to fill.
 *
 * Tone depends on state:
 *  - filled → green (success)
 *  - active (unfilled, currently highlighted) → indigo
 *  - required-empty → amber
 *  - optional-empty → neutral grey
 *
 * Renders content per kind: signature uses the existing `SignatureMark`;
 * initials use the script font; checkbox uses a small filled square with a
 * check glyph; everything else renders the stringified value.
 */
export const SignerField = forwardRef<HTMLButtonElement, SignerFieldProps>((props, ref) => {
  const {
    kind,
    label,
    required,
    active,
    filled,
    value,
    x,
    y,
    w,
    h,
    previewNode,
    onActivate,
    type,
    ...rest
  } = props;
  const tone = deriveTone(filled, active, required);
  const showRequired = required && !filled;

  let inner: React.ReactNode = null;
  if (filled && previewNode) {
    inner = previewNode;
  } else if (filled && kind === 'signature') {
    inner = (
      <SignatureMark name={typeof value === 'string' ? value : ''} size={Math.max(16, h - 18)} />
    );
  } else if (filled && kind === 'initials') {
    inner = (
      <InitialScript $size={Math.max(18, h - 18)}>
        {typeof value === 'string' ? value : ''}
      </InitialScript>
    );
  } else if (kind === 'checkbox') {
    const checked = value === true;
    inner = (
      <CheckboxMark $checked={checked} aria-hidden="true">
        {checked ? <Icon icon={Check} size={12} /> : null}
      </CheckboxMark>
    );
  } else if (filled) {
    let text = '';
    if (typeof value === 'string') text = value;
    else if (typeof value === 'boolean') text = String(value);
    inner = <FilledText $mono={kind === 'date'}>{text}</FilledText>;
  } else {
    inner = (
      <EmptyLabel>
        <Icon icon={KIND_ICON[kind]} size={12} />
        {label}
        {showRequired ? <RequiredStar aria-hidden="true">*</RequiredStar> : null}
      </EmptyLabel>
    );
  }

  let accessibleLabel: string;
  if (filled) accessibleLabel = `${label} (filled)`;
  else if (required) accessibleLabel = `${label} (required)`;
  else accessibleLabel = `${label} (optional)`;

  return (
    <Root
      ref={ref}
      type={type ?? 'button'}
      $tone={tone}
      $kind={kind}
      $filled={filled}
      $active={active}
      $x={x}
      $y={y}
      $w={w}
      $h={h}
      onClick={onActivate}
      aria-label={accessibleLabel}
      aria-pressed={kind === 'checkbox' ? value === true : undefined}
      data-kind={kind}
      data-tone={tone}
      data-filled={filled ? 'true' : 'false'}
      data-active={active ? 'true' : 'false'}
      {...rest}
    >
      {inner}
    </Root>
  );
});
SignerField.displayName = 'SignerField';
