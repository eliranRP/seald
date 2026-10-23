import { forwardRef, isValidElement } from 'react';
import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import type { SourceTileProps } from './SourceTile.types';
import { IconCircle, Meta, Text, Tile } from './SourceTile.styles';

function renderIcon(icon: LucideIcon | ReactNode): ReactNode {
  if (isValidElement(icon) || typeof icon === 'string') return icon;
  // Lucide icons are forwardRef objects, not elements.
  if (
    typeof icon === 'function' ||
    (typeof icon === 'object' && icon !== null && '$$typeof' in icon)
  ) {
    const Glyph = icon as LucideIcon;
    return <Glyph size={20} strokeWidth={1.75} aria-hidden />;
  }
  return null;
}

/**
 * One choice of where a document comes from (Upload, Template, Drive).
 * A radio inside a radiogroup: the parent supplies `role="radiogroup"`.
 * With `action`, it is a plain button that starts a one-off action.
 */
export const SourceTile = forwardRef<HTMLButtonElement, SourceTileProps>((props, ref) => {
  const { icon, label, meta, selected = false, stacked = false, action = false, ...rest } = props;
  return (
    <Tile
      {...rest}
      ref={ref}
      type="button"
      {...(action ? {} : { role: 'radio', 'aria-checked': selected })}
      $selected={selected}
      $stacked={stacked}
    >
      <IconCircle $selected={selected}>{renderIcon(icon)}</IconCircle>
      <Text>
        {label}
        {meta ? <Meta>{meta}</Meta> : null}
      </Text>
    </Tile>
  );
});

SourceTile.displayName = 'SourceTile';
