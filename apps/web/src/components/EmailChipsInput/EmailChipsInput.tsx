import { forwardRef, useMemo, useRef } from 'react';
import type { ClipboardEvent, KeyboardEvent } from 'react';
import { X } from 'lucide-react';
import { classifyEmails, tokensFromText } from '@/features/contacts/classifyEmails';
import type { EmailChip } from '@/features/contacts/classifyEmails';
import { Icon } from '../Icon';
import type { EmailChipsInputProps } from './EmailChipsInput.types';
import { Box, Chip, ChipRemove, Field } from './EmailChipsInput.styles';

const SEPARATOR = /[\s,;]/;

function chipTitle(chip: EmailChip): string | undefined {
  if (chip.kind === 'invalid') return 'Not an email address';
  if (chip.kind !== 'duplicate') return undefined;
  return chip.duplicateOf === 'saved' ? 'Already a contact' : 'Already in this list';
}

/**
 * L1 primitive: type or paste addresses and they become chips. Enter, comma,
 * semicolon, space and paste commit; Backspace in the empty field removes the
 * last chip. Chips are marked new, duplicate (already a contact, or repeated
 * earlier in the paste) or invalid so the sender sees what Add will do.
 */
export const EmailChipsInput = forwardRef<HTMLDivElement, EmailChipsInputProps>((props, ref) => {
  const {
    value,
    onChange,
    existingEmails,
    placeholder = 'Paste or type emails',
    inputLabel = 'Emails',
    autoFocus,
    trailing,
    ...rest
  } = props;
  const inputRef = useRef<HTMLInputElement>(null);
  const chips = useMemo(
    () => classifyEmails(value.tokens, existingEmails),
    [value.tokens, existingEmails],
  );

  const commit = (text: string, rest2 = ''): void => {
    const add = tokensFromText(text);
    onChange({ tokens: add.length > 0 ? [...value.tokens, ...add] : value.tokens, draft: rest2 });
  };

  const handleText = (text: string): void => {
    // A separator inside the text commits everything before the last one.
    if (SEPARATOR.test(text)) {
      const last = text.search(/[\s,;][^\s,;]*$/);
      const head = last >= 0 ? text.slice(0, last + 1) : text;
      const tail = last >= 0 ? text.slice(last + 1) : '';
      commit(head, tail);
      return;
    }
    onChange({ tokens: value.tokens, draft: text });
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>): void => {
    const text = e.clipboardData.getData('text');
    if (text.length === 0) return;
    e.preventDefault();
    commit(`${value.draft}${text}`);
  };

  const handleKey = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') {
      if (value.draft.trim().length === 0) return;
      e.preventDefault();
      commit(value.draft);
    } else if (e.key === 'Backspace' && value.draft.length === 0 && value.tokens.length > 0) {
      e.preventDefault();
      onChange({ tokens: value.tokens.slice(0, -1), draft: '' });
    }
  };

  const removeAt = (index: number): void => {
    onChange({ tokens: value.tokens.filter((_, i) => i !== index), draft: value.draft });
    inputRef.current?.focus();
  };

  return (
    <Box
      ref={ref}
      role="group"
      aria-label="Emails to add"
      onClick={() => inputRef.current?.focus()}
      {...rest}
    >
      {chips.map((chip, index) => (
        <Chip key={chip.id} $kind={chip.kind} title={chipTitle(chip)}>
          {chip.email}
          <ChipRemove
            type="button"
            aria-label={`Remove ${chip.email}`}
            onClick={() => removeAt(index)}
          >
            <Icon icon={X} size={12} />
          </ChipRemove>
        </Chip>
      ))}
      <Field
        ref={inputRef}
        type="text"
        value={value.draft}
        placeholder={placeholder}
        aria-label={inputLabel}
        autoFocus={autoFocus}
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => handleText(e.target.value)}
        onPaste={handlePaste}
        onKeyDown={handleKey}
        onBlur={() => {
          if (value.draft.trim().length > 0) commit(value.draft);
        }}
      />
      {trailing}
    </Box>
  );
});

EmailChipsInput.displayName = 'EmailChipsInput';
