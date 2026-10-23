import { useEffect, useId, useRef, useState } from 'react';
import { X as XIcon } from 'lucide-react';
import {
  isDateFormat,
  isValidTimeZone,
  parseDateValue,
  validateTextValue,
  type AnyFieldKind,
} from 'shared';
import { Icon } from '@/components/Icon';
import { useT } from '@/lib/i18n';
import type { TFn } from '@/lib/i18n';
import { dateToInputValue, metaOptions } from './fieldDisplay';
import { fillErrorMessage } from './fillErrors';
import {
  ApplyBtn,
  Backdrop,
  CancelBtn,
  CloseBtn,
  ErrorText,
  Footer,
  HeaderRow,
  Hint,
  Input,
  RadioList,
  RadioRow,
  Select,
  Sheet,
  Title,
} from './MetaFieldDrawer.styles';

export type MetaInputKind = 'text' | 'email' | 'date' | 'name' | 'number' | 'radio' | 'dropdown';

export interface MetaFieldDrawerProps {
  readonly open: boolean;
  readonly label: string;
  readonly kind: MetaInputKind;
  /** The field's `meta` (limits, options, placeholder, default). */
  readonly meta?: Readonly<Record<string, unknown>> | undefined;
  /** What the field already holds, as the API stored it. */
  readonly initialValue?: string | undefined;
  /** Prefills a `name` field. */
  readonly signerName?: string | undefined;
  /** Envelope date rendering; the date input reads "today" in this zone. */
  readonly dateFormat?: string | null | undefined;
  readonly timezone?: string | null | undefined;
  /** Message for an API rejection of the last apply; cleared once the signer edits. */
  readonly serverError?: string | null | undefined;
  readonly busy?: boolean | undefined;
  readonly onCancel: () => void;
  /** `date` gets `yyyy-MM-dd`, which the API accepts and rewrites in the envelope's format. */
  readonly onApply: (value: string) => void;
}

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function str(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

function startingValue(props: MetaFieldDrawerProps): string {
  const { kind, meta, initialValue, signerName, dateFormat, timezone } = props;
  if (initialValue !== undefined && initialValue !== '') {
    return kind === 'date' ? dateToInputValue(initialValue, dateFormat, timezone) : initialValue;
  }
  if (kind === 'name') return signerName ?? '';
  const d = meta?.['default'];
  if (typeof d === 'string') return d;
  if (typeof d === 'number') return String(d);
  return '';
}

function hintFor(
  kind: MetaInputKind,
  meta: Readonly<Record<string, unknown>> | undefined,
  t: TFn,
): string {
  if (kind === 'text') {
    const limit = meta?.['char_limit'];
    return typeof limit === 'number' ? t('signing.meta.upTo', { limit }) : '';
  }
  if (kind === 'number') {
    const min = meta?.['min'];
    const max = meta?.['max'];
    if (typeof min === 'number' && typeof max === 'number') {
      return t('signing.meta.numberBetween', { min, max });
    }
    if (typeof min === 'number') return t('signing.meta.numberAtLeast', { min });
    if (typeof max === 'number') return t('signing.meta.numberAtMost', { max });
  }
  return '';
}

/**
 * Bottom sheet for the field kinds that take options from the sender
 * (WP-08, flag `fieldMetaV2`): name (prefilled with the signer's name),
 * number, radio group, dropdown, and text / email / date honouring
 * `meta`. The same checks the API runs happen here first; an API
 * rejection (`serverError`) shows in the same inline, announced slot.
 */
export function MetaFieldDrawer(props: MetaFieldDrawerProps) {
  const {
    open,
    label,
    kind,
    meta,
    signerName,
    dateFormat,
    timezone,
    serverError,
    busy = false,
    onCancel,
    onApply,
  } = props;
  // Seeded once per mount; the caller keys the drawer by field so another field re-seeds it.
  const [value, setValue] = useState(() => startingValue(props));
  const [touched, setTouched] = useState(false);
  const [edited, setEdited] = useState(false);
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const errorId = useId();
  const hintId = useId();
  const radioName = useId();
  const t = useT();

  useEffect(() => {
    if (!open) return undefined;
    const focusTimer = setTimeout(() => {
      if (inputRef.current) inputRef.current.focus();
      else {
        sheetRef.current
          ?.querySelector<HTMLInputElement>('input[type="radio"]:checked, input[type="radio"]')
          ?.focus();
      }
    }, 0);
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        onCancel();
        return;
      }
      if (e.key !== 'Tab') return;
      const sheet = sheetRef.current;
      if (!sheet) return;
      const focusables = Array.from(sheet.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (!first || !last) return;
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && (active === first || !sheet.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !sheet.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(focusTimer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onCancel]);

  if (!open) return null;

  const options = metaOptions(meta);

  /** Message for the value as typed, or null when the API would accept it. */
  function check(): string | null {
    const trimmed = value.trim();
    if (kind === 'name') {
      return trimmed === '' && (signerName ?? '').trim() === ''
        ? fillErrorMessage('field_value_empty', meta, t)
        : null;
    }
    if (trimmed === '') {
      return kind === 'radio' || kind === 'dropdown'
        ? t('signing.meta.chooseOption')
        : t('signing.meta.required');
    }
    if (kind === 'date') {
      const parsed = parseDateValue(trimmed, {
        format: isDateFormat(dateFormat) ? dateFormat : null,
        timeZone: typeof timezone === 'string' && isValidTimeZone(timezone) ? timezone : null,
      });
      return parsed === null ? fillErrorMessage('field_value_invalid_date', meta, t) : null;
    }
    const slug = validateTextValue(kind as AnyFieldKind, meta ?? {}, value);
    return slug === null ? null : fillErrorMessage(slug, meta, t);
  }

  const clientError = check();
  const shown = touched ? clientError : null;
  const error = shown ?? (!edited && typeof serverError === 'string' ? serverError : null);
  const hint = hintFor(kind, meta, t);
  const describedBy =
    [error !== null ? errorId : undefined, hint !== '' ? hintId : undefined]
      .filter((id): id is string => id !== undefined)
      .join(' ') || undefined;

  function change(next: string): void {
    setValue(next);
    setEdited(true);
  }

  function apply(): void {
    setTouched(true);
    if (clientError !== null || busy) return;
    // The next rejection, if any, is about this value, so show it.
    setEdited(false);
    const trimmed = value.trim();
    onApply(kind === 'name' && trimmed === '' ? (signerName ?? '').trim() : trimmed);
  }

  const placeholder = str(meta?.['placeholder']) ?? label;

  let control: React.ReactNode;
  if (kind === 'radio') {
    control = (
      <RadioList role="radiogroup" aria-label={label} aria-describedby={describedBy}>
        {options.map((o) => (
          <RadioRow key={o.value}>
            <input
              type="radio"
              name={radioName}
              value={o.value}
              checked={value === o.value}
              onChange={() => change(o.value)}
            />
            {o.label}
          </RadioRow>
        ))}
      </RadioList>
    );
  } else if (kind === 'dropdown') {
    control = (
      <Select
        ref={(el) => {
          inputRef.current = el;
        }}
        value={value}
        aria-label={label}
        aria-invalid={error !== null ? true : undefined}
        aria-describedby={describedBy}
        $invalid={error !== null}
        onChange={(e) => change(e.target.value)}
        onBlur={() => setTouched(true)}
      >
        <option value="">
          {placeholder === label ? t('signing.meta.selectOption') : placeholder}
        </option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
    );
  } else {
    let type = 'text';
    let inputMode: 'text' | 'decimal' | 'email' = 'text';
    let autoComplete = 'off';
    if (kind === 'email') {
      type = 'email';
      inputMode = 'email';
      autoComplete = 'email';
    } else if (kind === 'date') {
      type = 'date';
    } else if (kind === 'number') {
      inputMode = 'decimal';
    } else if (kind === 'name') {
      autoComplete = 'name';
    }
    control = (
      <Input
        ref={(el) => {
          inputRef.current = el;
        }}
        type={type}
        inputMode={inputMode}
        value={value}
        aria-label={label}
        aria-invalid={error !== null ? true : undefined}
        aria-describedby={describedBy}
        autoComplete={autoComplete}
        placeholder={kind === 'date' ? undefined : placeholder}
        $invalid={error !== null}
        onChange={(e) => change(e.target.value)}
        onBlur={() => setTouched(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            apply();
          }
        }}
      />
    );
  }

  return (
    <Backdrop role="dialog" aria-modal="true" aria-label={label} onClick={onCancel}>
      <Sheet onClick={(e) => e.stopPropagation()} ref={sheetRef}>
        <HeaderRow>
          <Title>{label}</Title>
          <CloseBtn type="button" onClick={onCancel} aria-label={t('signing.common.cancel')}>
            <Icon icon={XIcon} size={16} />
          </CloseBtn>
        </HeaderRow>
        {control}
        {hint !== '' ? <Hint id={hintId}>{hint}</Hint> : null}
        {error !== null ? (
          <ErrorText id={errorId} role="alert">
            {error}
          </ErrorText>
        ) : null}
        <Footer>
          <CancelBtn type="button" onClick={onCancel}>
            {t('signing.common.cancel')}
          </CancelBtn>
          <ApplyBtn type="button" onClick={apply} disabled={busy}>
            {t('signing.common.apply')}
          </ApplyBtn>
        </Footer>
      </Sheet>
    </Backdrop>
  );
}
