import { useRef } from 'react';
import type { KeyboardEvent } from 'react';
import { Icon } from '../Icon';
import type { SegmentedControlProps } from './SegmentedControl.types';
import { Segment, SegmentedRoot } from './SegmentedControl.styles';

const NEXT_KEYS = new Set(['ArrowRight', 'ArrowDown']);
const PREV_KEYS = new Set(['ArrowLeft', 'ArrowUp']);

/**
 * L1 primitive — single-choice segmented control (canvas `.segmented`).
 * Exposed as a radio group: one tab stop (the selected segment), arrow
 * keys move + select, Home / End jump to the ends.
 */
export function SegmentedControl<T extends string>(props: SegmentedControlProps<T>) {
  const { options, value, onChange, block = false, stacked = false, size = 'md', ...rest } = props;
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const enabled = options.map((o, i) => (o.disabled ? -1 : i)).filter((i) => i >= 0);

  const move = (from: number, event: KeyboardEvent<HTMLButtonElement>): void => {
    if (enabled.length === 0) return;
    const pos = enabled.indexOf(from);
    let target: number | undefined;
    if (NEXT_KEYS.has(event.key)) target = enabled[(pos + 1) % enabled.length];
    else if (PREV_KEYS.has(event.key))
      target = enabled[(pos - 1 + enabled.length) % enabled.length];
    else if (event.key === 'Home') target = enabled[0];
    else if (event.key === 'End') target = enabled[enabled.length - 1];
    if (target === undefined) return;
    event.preventDefault();
    const option = options[target];
    if (!option) return;
    refs.current[target]?.focus();
    onChange(option.value);
  };

  return (
    <SegmentedRoot role="radiogroup" $block={block} {...rest}>
      {options.map((option, index) => {
        const active = option.value === value;
        return (
          <Segment
            key={option.value}
            ref={(node) => {
              refs.current[index] = node;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            disabled={option.disabled}
            $active={active}
            $block={block}
            $stacked={stacked}
            $large={size === 'lg'}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => move(index, event)}
          >
            {option.icon ? <Icon icon={option.icon} size={stacked ? 20 : 16} /> : null}
            {option.label}
          </Segment>
        );
      })}
    </SegmentedRoot>
  );
}
