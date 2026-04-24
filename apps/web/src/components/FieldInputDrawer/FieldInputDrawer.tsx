import { forwardRef, useEffect, useRef, useState } from 'react';
import { X as XIcon } from 'lucide-react';
import { Icon } from '../Icon';
import type { FieldInputDrawerProps, FieldInputKind } from './FieldInputDrawer.types';
import {
  ApplyBtn,
  Backdrop,
  CancelBtn,
  CloseBtn,
  ErrorText,
  Footer,
  HeaderRow,
  Input,
  Sheet,
  Title,
} from './FieldInputDrawer.styles';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function inputType(kind: FieldInputKind): string {
  if (kind === 'email') return 'email';
  if (kind === 'date') return 'date';
  return 'text';
}

function autoCompleteFor(kind: FieldInputKind): string {
  if (kind === 'email') return 'email';
  if (kind === 'name') return 'name';
  return 'off';
}

function validate(kind: FieldInputKind, value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return 'This field is required.';
  if (kind === 'email' && !EMAIL_RE.test(trimmed)) return 'Please enter a valid email address.';
  if (kind === 'date' && !ISO_DATE_RE.test(trimmed)) return 'Please enter a valid date.';
  return null;
}

/**
 * L2 bottom-sheet for typing a text / email / date / name value. Used by the
 * fill page for every non-signature field.
 */
export const FieldInputDrawer = forwardRef<HTMLDivElement, FieldInputDrawerProps>((props, ref) => {
  const { open, label, kind, initialValue, onCancel, onApply, ...rest } = props;
  const [value, setValue] = useState<string>(initialValue ?? '');
  const [touched, setTouched] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return undefined;
    setValue(initialValue ?? '');
    setTouched(false);
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel();
    }
    document.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, initialValue, onCancel]);

  if (!open) return null;

  const error = touched ? validate(kind, value) : null;
  const canApply = validate(kind, value) === null;

  const handleApply = (): void => {
    setTouched(true);
    if (!canApply) return;
    onApply(value.trim());
  };

  return (
    <Backdrop
      role="dialog"
      aria-modal="true"
      aria-label={label}
      onClick={onCancel}
      ref={ref}
      {...rest}
    >
      <Sheet onClick={(e) => e.stopPropagation()}>
        <HeaderRow>
          <Title>{label}</Title>
          <CloseBtn type="button" onClick={onCancel} aria-label="Cancel">
            <Icon icon={XIcon} size={16} />
          </CloseBtn>
        </HeaderRow>

        <Input
          ref={inputRef}
          type={inputType(kind)}
          value={value}
          aria-label={label}
          aria-invalid={error ? true : undefined}
          autoComplete={autoCompleteFor(kind)}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => setTouched(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleApply();
            }
          }}
          $invalid={Boolean(error)}
          placeholder={label}
        />
        {error ? <ErrorText role="alert">{error}</ErrorText> : null}

        <Footer>
          <CancelBtn type="button" onClick={onCancel}>
            Cancel
          </CancelBtn>
          <ApplyBtn type="button" onClick={handleApply} disabled={!canApply}>
            Apply
          </ApplyBtn>
        </Footer>
      </Sheet>
    </Backdrop>
  );
});
FieldInputDrawer.displayName = 'FieldInputDrawer';
