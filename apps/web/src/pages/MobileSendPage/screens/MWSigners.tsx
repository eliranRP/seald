import { Plus, Trash2 } from 'lucide-react';
import styled from 'styled-components';
import type { MobileSigner } from '../types';

const Wrap = styled.div`
  padding: 4px 16px 24px;
`;

const Card = styled.div`
  background: #fff;
  border: 1px solid var(--border-1);
  border-radius: 14px;
  padding: 12px 14px;
  margin-bottom: 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const Stack = styled.div`
  background: #fff;
  border: 1px solid var(--border-1);
  border-radius: 18px;
  overflow: hidden;
`;

const Row = styled.div<{ $last?: boolean }>`
  padding: 14px;
  display: flex;
  align-items: center;
  gap: 12px;
  border-bottom: ${({ $last }) => ($last ? 'none' : '1px solid var(--border-1)')};
`;

const Avatar = styled.span<{ $color: string }>`
  width: 36px;
  height: 36px;
  border-radius: 18px;
  background: ${({ $color }) => $color};
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
`;

const Info = styled.div`
  flex: 1;
  min-width: 0;
`;

const Name = styled.div`
  font-size: 14px;
  font-weight: 600;
  color: var(--fg-1);
`;

const Email = styled.div`
  font-size: 12px;
  color: var(--fg-3);
  margin-top: 2px;
  /* Slice-D §4 LOW: long emails crowded Badge + Remove on 320 px
     phones; ellipsis matches Name's truncation. */
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const Badge = styled.span`
  background: var(--indigo-50);
  color: var(--indigo-700);
  font-size: 11px;
  font-weight: 700;
  padding: 4px 8px;
  border-radius: 8px;
`;

/**
 * Slice-D §4 HIGH: previously a text "Remove" button at ~24×22 px —
 * below WCAG 2.5.5 (44×44). Switched to a 44×44 icon-only button using
 * lucide's `Trash2`; the visible accessible name is supplied by
 * `aria-label="Remove <name>"` so screen readers still announce target
 * clearly.
 */
const RemoveBtn = styled.button`
  border: none;
  background: transparent;
  color: var(--fg-3);
  cursor: pointer;
  min-width: 44px;
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  font: inherit;

  &:hover {
    color: var(--danger-700);
    background: var(--danger-50);
  }

  &:focus-visible {
    outline: 2px solid var(--indigo-600);
    outline-offset: 2px;
  }
`;

/**
 * Slice-D §4 MEDIUM: with 5+ signers, an Add row at the bottom of the
 * card stack scrolled out of view — the sender had to scroll to add
 * each new signer. Making the Add row `position: sticky` to the BOTTOM
 * of the Stack keeps it reachable regardless of list length.
 */
const AddBtn = styled.button`
  position: sticky;
  bottom: 0;
  z-index: 1;
  width: 100%;
  text-align: left;
  padding: 14px;
  border: none;
  background: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--indigo-700);
  font-size: 14px;
  font-weight: 600;
  border-top: 1px dashed var(--border-1);
  font: inherit;

  &:focus-visible {
    outline: 2px solid var(--indigo-600);
    outline-offset: -2px;
  }
`;

/**
 * Slice-D §4 HIGH: the visual switch pill is 46×28 px (designed for an
 * iOS-style toggle), but the touchable area was the same — below WCAG
 * 2.5.5 (44×44). The outer button is now a 44×44 hit area with the
 * visible pill centered inside via `::before` so the visual stays
 * unchanged while the touch target meets the standard.
 */
const ToggleBtn = styled.button<{ $on: boolean }>`
  position: relative;
  min-width: 44px;
  min-height: 44px;
  border-radius: 14px;
  border: none;
  cursor: pointer;
  background: transparent;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;

  /* The visible iOS-style pill. */
  &::before {
    content: '';
    width: 46px;
    height: 28px;
    border-radius: 14px;
    background: ${({ $on }) => ($on ? 'var(--indigo-600)' : 'var(--ink-200)')};
    transition: background 0.15s;
    display: block;
  }

  &:focus-visible {
    outline: 2px solid var(--indigo-600);
    outline-offset: 2px;
  }
`;

const ToggleKnob = styled.span<{ $on: boolean }>`
  position: absolute;
  /* Centered inside the 44px hit area; the pill is 28px tall, so the
     knob's vertical center matches whether the parent is 28 or 44 px. */
  top: 50%;
  transform: translateY(-50%);
  left: ${({ $on }) => ($on ? 'calc(50% - 1px)' : 'calc(50% - 21px)')};
  width: 24px;
  height: 24px;
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
  transition: left 0.15s;
`;

const ToggleHeading = styled.div`
  font-size: 14px;
  font-weight: 600;
  color: var(--fg-1);
`;

const ToggleSub = styled.div`
  font-size: 12px;
  color: var(--fg-3);
  margin-top: 2px;
`;

const Empty = styled.div`
  padding: 24px 14px;
  text-align: center;
  font-size: 13px;
  color: var(--fg-3);
`;

export interface MWSignersProps {
  readonly signers: ReadonlyArray<MobileSigner>;
  readonly meIncluded: boolean;
  readonly onMeToggle: () => void;
  readonly onAdd: () => void;
  readonly onRemove: (id: string) => void;
}

export function MWSigners(props: MWSignersProps) {
  const { signers, meIncluded, onMeToggle, onAdd, onRemove } = props;
  return (
    <Wrap>
      <Card>
        <div>
          <ToggleHeading>Add me as signer</ToggleHeading>
          <ToggleSub>Sign first, then send</ToggleSub>
        </div>
        <ToggleBtn
          type="button"
          $on={meIncluded}
          onClick={onMeToggle}
          aria-pressed={meIncluded}
          aria-label="Add me as signer"
        >
          <ToggleKnob $on={meIncluded} aria-hidden />
        </ToggleBtn>
      </Card>

      <Stack>
        {signers.length === 0 ? (
          <Empty>No signers yet — tap &quot;Add signer&quot; to get started.</Empty>
        ) : (
          signers.map((s, i) => (
            <Row key={s.id} $last={i === signers.length - 1 && false}>
              <Avatar $color={s.color} aria-hidden>
                {s.initials}
              </Avatar>
              <Info>
                <Name>{s.name}</Name>
                <Email>{s.email}</Email>
              </Info>
              <Badge>Signer {i + 1}</Badge>
              <RemoveBtn
                type="button"
                onClick={() => onRemove(s.id)}
                aria-label={`Remove ${s.name}`}
              >
                <Trash2 size={18} aria-hidden />
              </RemoveBtn>
            </Row>
          ))
        )}
        <AddBtn type="button" onClick={onAdd}>
          <Plus size={18} aria-hidden /> Add signer
        </AddBtn>
      </Stack>
    </Wrap>
  );
}
