import { forwardRef } from 'react';
import { X } from 'lucide-react';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { Button } from '../Button';
import type { ShortcutRow, ShortcutsPopoverProps } from './ShortcutsPopover.types';
import { Action, Card, Head, Kbd, Keys, List, Row, Title } from './ShortcutsPopover.styles';

export const SHORTCUTS: ReadonlyArray<ShortcutRow> = [
  { action: 'Copy', keys: ['⌘', 'C'] },
  { action: 'Paste', keys: ['⌘', 'V'] },
  { action: 'Undo', keys: ['⌘', 'Z'] },
  { action: 'Redo', keys: ['⇧', '⌘', 'Z'] },
  { action: 'Delete', keys: ['⌫'] },
  { action: 'Select many', keys: ['Drag on page'] },
  { action: 'Add to selection', keys: ['⇧', 'Click'] },
  { action: 'Zoom', keys: ['⌘', '+', '/', '−', '/', '0'] },
  { action: 'Pages', keys: ['←', '→', 'Home', 'End'] },
];

/**
 * The editor's keyboard shortcuts, one row each. On Windows and Linux read
 * ⌘ as Ctrl. Opens from the "?" button on the canvas toolbar.
 */
export const ShortcutsPopover = forwardRef<HTMLDivElement, ShortcutsPopoverProps>((props, ref) => {
  const { open, onClose, ...rest } = props;
  useEscapeKey(onClose, open);
  if (!open) return null;
  return (
    <Card {...rest} ref={ref} role="dialog" aria-label="Keyboard shortcuts">
      <Head>
        <Title>Shortcuts</Title>
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          iconLeft={X}
          aria-label="Close shortcuts"
          onClick={onClose}
        />
      </Head>
      <List>
        {SHORTCUTS.map((row) => (
          <Row key={row.action}>
            <Action>{row.action}</Action>
            <Keys>
              {row.keys.map((k, i) => (
                // Key caps repeat ("/" appears twice), so the position is part of the key.
                <Kbd key={`${k}-${String(i)}`}>{k}</Kbd>
              ))}
            </Keys>
          </Row>
        ))}
      </List>
    </Card>
  );
});

ShortcutsPopover.displayName = 'ShortcutsPopover';
