import { forwardRef, useId, useState } from 'react';
import type { ReactNode } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Icon } from '../Icon';
import type { PasswordFieldProps } from './PasswordField.types';
import {
  Field,
  LabelRow,
  Label,
  LabelRight,
  InputWrap,
  Input,
  EyeToggle,
  HelpText,
  ErrorText,
} from './PasswordField.styles';

export const PasswordField = forwardRef<HTMLInputElement, PasswordFieldProps>((props, ref) => {
  const { label, labelRight, helpText, error, onChange, showInitially, id, ...rest } = props;

  const autoId = useId();
  const inputId = id ?? autoId;
  const [visible, setVisible] = useState(!!showInitially);

  let describedId: string | undefined;
  if (error) describedId = `${inputId}-err`;
  else if (helpText) describedId = `${inputId}-help`;

  let feedback: ReactNode = null;
  if (error)
    feedback = (
      <ErrorText id={`${inputId}-err`} role="alert">
        {error}
      </ErrorText>
    );
  else if (helpText) feedback = <HelpText id={`${inputId}-help`}>{helpText}</HelpText>;

  const toggleLabel = visible ? 'Hide password' : 'Show password';

  return (
    <Field>
      {label || labelRight ? (
        <LabelRow>
          {label ? <Label htmlFor={inputId}>{label}</Label> : <span />}
          {labelRight ? <LabelRight>{labelRight}</LabelRight> : null}
        </LabelRow>
      ) : null}
      <InputWrap>
        <Input
          $invalid={Boolean(error)}
          {...rest}
          ref={ref}
          id={inputId}
          type={visible ? 'text' : 'password'}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedId}
          onChange={(e) => onChange?.(e.target.value, e)}
        />
        <EyeToggle
          type="button"
          aria-label={toggleLabel}
          aria-pressed={visible}
          onClick={() => setVisible((v) => !v)}
        >
          <Icon icon={visible ? EyeOff : Eye} size={18} />
        </EyeToggle>
      </InputWrap>
      {feedback}
    </Field>
  );
});

PasswordField.displayName = 'PasswordField';
