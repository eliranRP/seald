import { forwardRef, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import styled from 'styled-components';
import { TagChip } from '@/components/TagChip';

/**
 * Inline tag composer used by both the dashboard row's "+" affordance
 * and the envelope detail page's Tags section.
 *
 * - Renders the current chip list (each with a × button).
 * - Below: an autocomplete input. Suggestions are the user's
 *   previously-used tags (`suggestions`) filtered by the typed
 *   substring; press Enter to add the typed value (after
 *   normalisation), or click a suggestion.
 * - Backspace at the empty input removes the last chip.
 * - Caps the working set at `max` (default 10) — extra adds are no-ops.
 *
 * Pure: owns no network state. The parent decides whether to
 * persist the change (typically a debounced `PATCH /envelopes/:id`).
 */

const Root = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[2]};
`;

const ChipsRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
`;

const InputRow = styled.div`
  position: relative;
  display: flex;
  align-items: stretch;
`;

const Input = styled.input`
  flex: 1;
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: 8px;
  padding: 8px 10px;
  font-family: ${({ theme }) => theme.font.sans};
  font-size: 13px;
  line-height: 1.4;
  background: ${({ theme }) => theme.color.bg.surface};
  color: ${({ theme }) => theme.color.fg[1]};
  &::placeholder {
    color: ${({ theme }) => theme.color.fg[3]};
  }
  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.color.indigo[500]};
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
`;

const Suggestions = styled.div`
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  z-index: 30;
  max-height: 220px;
  overflow-y: auto;
  background: ${({ theme }) => theme.color.bg.surface};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: 10px;
  box-shadow: ${({ theme }) => theme.shadow.lg};
  padding: 4px;
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const Suggestion = styled.button`
  all: unset;
  cursor: pointer;
  padding: 6px 8px;
  border-radius: 6px;
  font-family: ${({ theme }) => theme.font.sans};
  font-size: 13px;
  color: ${({ theme }) => theme.color.fg[1]};
  &:hover,
  &:focus-visible {
    background: ${({ theme }) => theme.color.ink[50]};
    outline: none;
  }
`;

export interface TagEditorProps {
  /** Current tag list (lower-cased). Owned by the parent. */
  readonly value: ReadonlyArray<string>;
  /** Notified with the next tag list whenever the user adds / removes. */
  readonly onChange: (next: ReadonlyArray<string>) => void;
  /**
   * Pool of previously-used tag names to surface as autocomplete
   * suggestions. Caller supplies (typically derived from the
   * envelope list). Filtered by the typed substring.
   */
  readonly suggestions?: ReadonlyArray<string>;
  /** Hard ceiling for tag count. Default 10 (matches API DTO). */
  readonly max?: number;
  /** Per-tag length cap. Default 32 (matches API DTO). */
  readonly maxLength?: number;
  readonly placeholder?: string;
}

function normalise(raw: string): string {
  return raw.trim().toLowerCase();
}

export const TagEditor = forwardRef<HTMLDivElement, TagEditorProps>((props, ref) => {
  const {
    value,
    onChange,
    suggestions = [],
    max = 10,
    maxLength = 32,
    placeholder = 'Add a tag…',
  } = props;
  const [draft, setDraft] = useState('');
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const filtered = useMemo(() => {
    const needle = normalise(draft);
    const taken = new Set(value);
    return suggestions
      .filter((s) => !taken.has(s.toLowerCase()))
      .filter((s) => (needle === '' ? true : s.toLowerCase().includes(needle)))
      .slice(0, 10);
  }, [draft, suggestions, value]);

  function commitTag(raw: string) {
    const next = normalise(raw).slice(0, maxLength);
    if (next === '') return;
    if (value.includes(next)) return;
    if (value.length >= max) return;
    onChange([...value, next]);
    setDraft('');
  }

  function removeAt(idx: number) {
    onChange(value.filter((_, i) => i !== idx));
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitTag(draft);
      return;
    }
    if (e.key === ',') {
      // Comma is a natural delimiter when pasting "foo, bar". Treat it
      // as Enter so users don't have to think about the separator.
      e.preventDefault();
      commitTag(draft);
      return;
    }
    if (e.key === 'Backspace' && draft === '' && value.length > 0) {
      e.preventDefault();
      removeAt(value.length - 1);
    }
  }

  return (
    <Root ref={ref}>
      {value.length > 0 ? (
        <ChipsRow role="list" aria-label="Selected tags">
          {value.map((t, i) => (
            <span key={`${t}-${i}`} role="listitem">
              <TagChip label={t} onRemove={() => removeAt(i)} />
            </span>
          ))}
        </ChipsRow>
      ) : null}

      <InputRow>
        <Input
          ref={inputRef}
          type="text"
          value={draft}
          placeholder={value.length >= max ? `Max ${max} tags` : placeholder}
          disabled={value.length >= max}
          maxLength={maxLength}
          onChange={(e) => {
            setDraft(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            // Commit on blur so the user doesn't lose a typed-but-not-Entered
            // tag. Slight delay so a Suggestion click can fire first.
            window.setTimeout(() => {
              commitTag(draft);
              setOpen(false);
            }, 120);
          }}
          onKeyDown={onKeyDown}
          aria-label="Add tag"
          aria-autocomplete="list"
          aria-expanded={open && filtered.length > 0}
        />
        {open && filtered.length > 0 ? (
          <Suggestions role="listbox">
            {filtered.map((s) => (
              <Suggestion
                key={s}
                type="button"
                role="option"
                aria-selected={false}
                onMouseDown={(e) => {
                  // mousedown so the input's onBlur (which timeouts) sees
                  // a non-empty draft consumed before the suggestion
                  // applies; here we click directly.
                  e.preventDefault();
                  commitTag(s);
                  setOpen(false);
                  inputRef.current?.focus();
                }}
              >
                {s}
              </Suggestion>
            ))}
          </Suggestions>
        ) : null}
      </InputRow>
    </Root>
  );
});
TagEditor.displayName = 'TagEditor';
