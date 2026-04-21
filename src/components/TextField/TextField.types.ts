import type { ChangeEvent, InputHTMLAttributes } from 'react';
import type { LucideIcon } from 'lucide-react';

type NativeInputProps = InputHTMLAttributes<HTMLInputElement>;

export interface TextFieldProps extends Omit<NativeInputProps, 'size' | 'type' | 'onChange'> {
  readonly label?: string | undefined;
  readonly helpText?: string | undefined;
  readonly error?: string | undefined;
  readonly iconLeft?: LucideIcon | undefined;
  readonly type?: 'text' | 'email' | 'password' | 'url' | 'tel' | 'search' | undefined;
  readonly onChange?: ((value: string, e: ChangeEvent<HTMLInputElement>) => void) | undefined;
  readonly value?: string | undefined;
  readonly defaultValue?: string | undefined;
}
