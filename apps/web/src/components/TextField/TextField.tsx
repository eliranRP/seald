import { forwardRef, useId } from 'react';
import type { ChangeEvent, ReactNode } from 'react';
import { Icon } from '../Icon';
import type { TextFieldProps } from './TextField.types';
import { Field, Label, InputWrap, IconSlot, Input, HelpText, ErrorText } from './TextField.styles';

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>((props, ref) => {
  const {
    label,
    helpText,
    error,
    iconLeft,
    type = 'text',
    onChange,
    value,
    defaultValue,
    id,
    ...rest
  } = props;
  const autoId = useId();
  const inputId = id ?? autoId;

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

  return (
    <Field>
      {label ? <Label htmlFor={inputId}>{label}</Label> : null}
      <InputWrap>
        {iconLeft ? (
          <IconSlot>
            <Icon icon={iconLeft} size={16} />
          </IconSlot>
        ) : null}
        <Input
          $hasIcon={Boolean(iconLeft)}
          $invalid={Boolean(error)}
          {...rest}
          ref={ref}
          id={inputId}
          type={type}
          value={value}
          defaultValue={defaultValue}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedId}
          onChange={(e: ChangeEvent<HTMLInputElement>) => onChange?.(e.target.value, e)}
        />
      </InputWrap>
      {feedback}
    </Field>
  );
});
TextField.displayName = 'TextField';
