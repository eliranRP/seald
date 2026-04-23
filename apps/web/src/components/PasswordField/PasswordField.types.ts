import type { ChangeEvent, InputHTMLAttributes, ReactNode } from 'react';

type NativeInputProps = InputHTMLAttributes<HTMLInputElement>;

export interface PasswordFieldProps extends Omit<NativeInputProps, 'type' | 'onChange'> {
  readonly label?: ReactNode | undefined;
  readonly labelRight?: ReactNode | undefined;
  readonly helpText?: ReactNode | undefined;
  readonly error?: ReactNode | undefined;
  readonly onChange?: ((value: string, event: ChangeEvent<HTMLInputElement>) => void) | undefined;
  readonly showInitially?: boolean | undefined;
}
