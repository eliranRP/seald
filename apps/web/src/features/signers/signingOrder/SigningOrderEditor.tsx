import { useEffect, useId, useRef, useState } from 'react';
import type { DragEvent } from 'react';
import { ArrowDown, ArrowUp, GripVertical, ListOrdered } from 'lucide-react';
import { isFeatureEnabled } from 'shared';
import { Icon } from '@/components/Icon';
import {
  Copy,
  CopyCol,
  Input as SwitchInput,
  Root as SwitchRoot,
  Text as SwitchText,
} from '@/components/ReminderToggle/ReminderToggle.styles';
import { moveRow, setJoinsPrevious, stepNumbers, type SigningOrderValue } from './model';
import {
  Email,
  Grip,
  Hint,
  IconButton,
  JoinLabel,
  Line,
  List,
  Name,
  Names,
  Root,
  Row,
  StepTag,
  VisuallyHidden,
} from './SigningOrderEditor.styles';

export interface SigningOrderSigner {
  readonly id: string;
  readonly name: string;
  readonly email: string;
}

export interface SigningOrderEditorProps {
  readonly signers: ReadonlyArray<SigningOrderSigner>;
  readonly value: SigningOrderValue;
  readonly onChange: (next: SigningOrderValue) => void;
  readonly disabled?: boolean | undefined;
}

/**
 * Sender control for the signing order (WP-06). A switch picks "in any
 * order" (default) or "in order"; when ordered, rows can be dragged, moved
 * with the Move up / Move down buttons from the keyboard, and joined to the
 * step above so several signers sign at the same time. Rows are keyed by
 * signer id (rule 4.3). Renders nothing while the `signingOrder` flag is
 * off, or with fewer than two signers (there is nothing to order).
 */
export function SigningOrderEditor({
  signers,
  value,
  onChange,
  disabled = false,
}: SigningOrderEditorProps) {
  const switchId = useId();
  const titleId = useId();
  const hintId = useId();
  const rootRef = useRef<HTMLElement | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const refocus = useRef<{ readonly id: string; readonly dir: 'up' | 'down' } | null>(null);

  useEffect(() => {
    const target = refocus.current;
    if (target === null) return;
    refocus.current = null;
    const root = rootRef.current;
    if (root === null) return;
    const pick = (dir: 'up' | 'down'): HTMLButtonElement | null =>
      root.querySelector<HTMLButtonElement>(`[data-order-move="${target.id}:${dir}"]`);
    const first = pick(target.dir);
    if (first !== null && !first.disabled) first.focus();
    else pick(target.dir === 'up' ? 'down' : 'up')?.focus();
  }, [value.rows]);

  if (!isFeatureEnabled('signingOrder') || signers.length < 2) return null;

  const byId = new Map(signers.map((s) => [s.id, s]));
  const steps = stepNumbers(value.rows);
  const total = value.rows.length;

  const move = (id: string, to: number, dir: 'up' | 'down' | null): void => {
    const signer = byId.get(id);
    const next = moveRow(value.rows, id, to);
    if (next === value.rows || signer === undefined) return;
    if (dir !== null) refocus.current = { id, dir };
    setAnnouncement(`Moved ${signer.name} to position ${String(to + 1)} of ${String(total)}.`);
    onChange({ ...value, rows: next });
  };

  const handleDragStart = (e: DragEvent<HTMLLIElement>, id: string): void => {
    setDragId(id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  };
  const handleDragOver = (e: DragEvent<HTMLLIElement>, id: string): void => {
    if (dragId === null) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (overId !== id) setOverId(id);
  };
  const handleDrop = (e: DragEvent<HTMLLIElement>, id: string): void => {
    e.preventDefault();
    const to = value.rows.findIndex((r) => r.id === id);
    const moved = dragId;
    setDragId(null);
    setOverId(null);
    if (moved !== null && to >= 0) move(moved, to, null);
  };
  const handleDragEnd = (): void => {
    setDragId(null);
    setOverId(null);
  };

  return (
    <Root ref={rootRef} aria-label="Signing order">
      <SwitchRoot htmlFor={switchId}>
        <SwitchInput
          id={switchId}
          type="checkbox"
          role="switch"
          checked={value.sequential}
          disabled={disabled}
          aria-labelledby={titleId}
          aria-describedby={hintId}
          onChange={(event) => onChange({ ...value, sequential: event.currentTarget.checked })}
        />
        <CopyCol>
          <SwitchText id={titleId}>
            <Icon icon={ListOrdered} size={16} />
            Signing order
          </SwitchText>
          <Copy id={hintId}>
            {value.sequential
              ? 'Signers are invited one step at a time. The next step is invited once everyone in the current step has signed.'
              : 'Everyone is invited at once and can sign in any order.'}
          </Copy>
        </CopyCol>
      </SwitchRoot>
      {value.sequential ? (
        <>
          <List aria-label="Signing steps">
            {value.rows.map((row, index) => {
              const signer = byId.get(row.id);
              if (signer === undefined) return null;
              const above = index > 0 ? byId.get(value.rows[index - 1]?.id ?? '') : undefined;
              return (
                <Row
                  key={row.id}
                  $dragging={dragId === row.id}
                  $dropTarget={overId === row.id && dragId !== row.id}
                  draggable={!disabled}
                  onDragStart={(e) => handleDragStart(e, row.id)}
                  onDragOver={(e) => handleDragOver(e, row.id)}
                  onDrop={(e) => handleDrop(e, row.id)}
                  onDragEnd={handleDragEnd}
                >
                  <Line>
                    <Grip aria-hidden>
                      <GripVertical size={14} />
                    </Grip>
                    <StepTag>Step {steps.get(row.id)}</StepTag>
                    <Names>
                      <Name>{signer.name}</Name>
                      <Email>{signer.email}</Email>
                    </Names>
                    <IconButton
                      type="button"
                      data-order-move={`${row.id}:up`}
                      aria-label={`Move ${signer.name} up`}
                      disabled={disabled || index === 0}
                      onClick={() => move(row.id, index - 1, 'up')}
                    >
                      <ArrowUp size={14} aria-hidden />
                    </IconButton>
                    <IconButton
                      type="button"
                      data-order-move={`${row.id}:down`}
                      aria-label={`Move ${signer.name} down`}
                      disabled={disabled || index === total - 1}
                      onClick={() => move(row.id, index + 1, 'down')}
                    >
                      <ArrowDown size={14} aria-hidden />
                    </IconButton>
                  </Line>
                  {above !== undefined ? (
                    <JoinLabel>
                      <input
                        type="checkbox"
                        checked={row.joinsPrevious}
                        disabled={disabled}
                        aria-label={`${signer.name} signs in the same step as ${above.name}`}
                        onChange={(event) =>
                          onChange({
                            ...value,
                            rows: setJoinsPrevious(value.rows, row.id, event.currentTarget.checked),
                          })
                        }
                      />
                      Same step as above
                    </JoinLabel>
                  ) : null}
                </Row>
              );
            })}
          </List>
          <Hint>Drag a signer, or use the arrow buttons, to change the order.</Hint>
        </>
      ) : null}
      <VisuallyHidden role="status" aria-live="polite">
        {announcement}
      </VisuallyHidden>
    </Root>
  );
}
