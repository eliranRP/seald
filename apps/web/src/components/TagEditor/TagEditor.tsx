import { forwardRef, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import styled, { css } from 'styled-components';
import { TagChip } from '@/components/TagChip';

/**
 * Inline tag composer used by both the dashboard row's "+" affordance
 * and the envelope detail page's Tags section.
 *
 * - Renders the current chip list (each with a × button).
 * - Below (or beside, in `layout="inline"`): an autocomplete input.
 *   Suggestions are the user's previously-used tags (`suggestions`)
 *   filtered by the typed substring; press Enter to add the typed
 *   value (after normalisation), or click a suggestion.
 * - Backspace at the empty input removes the last chip.
 * - Caps the working set at `max` (default 10) — extra adds are no-ops.
 *
 * Layout modes:
 *   - "stack" (default): chips above, full-width input below — the
 *     classic vertical composer used inside dedicated panels.
 *   - "inline": chips + a compact "+ tag" chip-button on a single row;
 *     the button expands to an auto-sized input on click. Used inside
 *     the envelope-detail status/meta row so tags don't claim a whole
 *     ~900px row of header real estate.
 *
 * Pure: owns no network state. The parent decides whether to
 * persist the change (typically a debounced `PATCH /envelopes/:id`).
 */

const Root = styled.div<{ readonly $inline: boolean }>`
  display: flex;
  ${({ $inline, theme }) =>
    $inline
      ? css`
          flex-direction: row;
          flex-wrap: wrap;
          align-items: center;
          gap: 6px;
        `
      : css`
          flex-direction: column;
          gap: ${theme.space[2]};
        `}
`;

const ChipsRow = styled.div<{ readonly $inline: boolean }>`
  display: ${({ $inline }) => ($inline ? 'contents' : 'flex')};
  flex-wrap: wrap;
  gap: 6px;
`;

const InputRow = styled.div<{ readonly $inline: boolean }>`
  position: relative;
  display: ${({ $inline }) => ($inline ? 'inline-flex' : 'flex')};
  align-items: stretch;
`;

const Input = styled.input<{ readonly $inline: boolean }>`
  ${({ $inline }) =>
    $inline
      ? css`
          width: auto;
          min-width: 140px;
        `
      : css`
          flex: 1;
        `}
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: 8px;
  padding: ${({ $inline }) => ($inline ? '4px 8px' : '8px 10px')};
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

/**
 * Compact "+ tag" chip-style button shown in inline layout when the
 * input is collapsed. Clicking expands it into the input.
 */
const AddTagButton = styled.button`
  all: unset;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  font-family: ${({ theme }) => theme.font.sans};
  font-size: 12px;
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.fg[2]};
  border: 1px dashed ${({ theme }) => theme.color.border[1]};
  border-radius: 999px;
  cursor: pointer;
  &:hover {
    color: ${({ theme }) => theme.color.fg[1]};
    border-color: ${({ theme }) => theme.color.border[2]};
  }
  &:focus-visible {
    outline: none;
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
  /**
   * "stack" (default) renders chips above a full-width input. "inline"
   * keeps chips + a compact "+ tag" button on a single row; clicking
   * the button reveals an auto-sized input.
   */
  readonly layout?: 'stack' | 'inline';
}

function normalize(raw: string): string {
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
    layout = 'stack',
  } = props;
  const inline = layout === 'inline';
  const [draft, setDraft] = useState('');
  const [open, setOpen] = useState(false);
  // In inline layout the input is collapsed into a "+ tag" chip-button
  // until the user clicks; in stack layout the input is always mounted.
  const [inputExpanded, setInputExpanded] = useState(!inline);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const filtered = useMemo(() => {
    const needle = normalize(draft);
    const taken = new Set(value);
    return suggestions
      .filter((s) => !taken.has(s.toLowerCase()))
      .filter((s) => (needle === '' ? true : s.toLowerCase().includes(needle)))
      .slice(0, 10);
  }, [draft, suggestions, value]);

  function commitTag(raw: string) {
    const next = normalize(raw).slice(0, maxLength);
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

  const atMax = value.length >= max;
  const showInput = !inline || inputExpanded || atMax;

  return (
    <Root ref={ref} $inline={inline}>
      {value.length > 0 ? (
        <ChipsRow $inline={inline} role="list" aria-label="Selected tags">
          {value.map((t, i) => (
            <span key={`${t}-${i}`} role="listitem">
              <TagChip label={t} onRemove={() => removeAt(i)} />
            </span>
          ))}
        </ChipsRow>
      ) : null}

      {inline && !showInput ? (
        <AddTagButton
          type="button"
          aria-label="Add tag"
          onClick={() => {
            setInputExpanded(true);
            // Defer focus to next tick so the input is mounted first.
            window.setTimeout(() => inputRef.current?.focus(), 0);
          }}
        >
          + tag
        </AddTagButton>
      ) : null}

      {showInput ? (
        <InputRow $inline={inline}>
          <Input
            $inline={inline}
            ref={inputRef}
            type="text"
            value={draft}
            placeholder={atMax ? `Max ${max} tags` : placeholder}
            disabled={atMax}
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
                // Collapse the inline input back into the "+ tag" chip when
                // it loses focus with no typed content — keeps the row
                // visually tight rather than carrying an empty box.
                if (inline && draft === '' && !atMax) {
                  setInputExpanded(false);
                }
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
      ) : null}
    </Root>
  );
});
TagEditor.displayName = 'TagEditor';
