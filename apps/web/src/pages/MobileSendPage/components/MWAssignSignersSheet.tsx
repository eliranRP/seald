import { useEffect, useState } from 'react';
import styled from 'styled-components';
import { Check } from 'lucide-react';
import { PrimaryBtn, SecondaryBtn } from '../MobileSendPage.styles';
import type { MobileSigner } from '../types';
import { MWBottomSheet } from './MWBottomSheet';

const Note = styled.div`
  font-size: 12px;
  color: var(--fg-3);
  margin-bottom: 10px;
`;

const List = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const Row = styled.button<{ $sel: boolean; $color: string }>`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid ${({ $sel, $color }) => ($sel ? $color : 'var(--border-1)')};
  border-radius: 12px;
  background: ${({ $sel, $color }) => ($sel ? `${$color}14` : '#fff')};
  text-align: left;
  cursor: pointer;
  font: inherit;

  &:focus-visible {
    outline: 2px solid var(--indigo-600);
    outline-offset: 2px;
  }
`;

const Avatar = styled.span<{ $color: string }>`
  width: 32px;
  height: 32px;
  border-radius: 16px;
  background: ${({ $color }) => $color};
  color: #fff;
  font-size: 11px;
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
`;

const CheckBubble = styled.span<{ $sel: boolean; $color: string }>`
  width: 22px;
  height: 22px;
  border-radius: 11px;
  border: 2px solid ${({ $sel, $color }) => ($sel ? $color : 'var(--border-2)')};
  background: ${({ $sel, $color }) => ($sel ? $color : '#fff')};
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: #fff;
`;

const Actions = styled.div`
  display: flex;
  gap: 8px;
  margin-top: 14px;
`;

export interface MWAssignSignersSheetProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly signers: ReadonlyArray<MobileSigner>;
  readonly initialSelectedIds: ReadonlyArray<string>;
  readonly onApply: (signerIds: ReadonlyArray<string>) => void;
}

/**
 * Multi-select signer-assignment sheet. Apply with N≥2 ids splits the source
 * field into N independent single-signer fields (handled by the caller via
 * `assignSignersToSelection`).
 */
export function MWAssignSignersSheet(props: MWAssignSignersSheetProps) {
  const { open, onClose, signers, initialSelectedIds, onApply } = props;
  const [picked, setPicked] = useState<ReadonlyArray<string>>(initialSelectedIds);

  useEffect(() => {
    if (open) setPicked(initialSelectedIds);
  }, [open, initialSelectedIds]);

  const toggle = (id: string): void => {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  };

  return (
    <MWBottomSheet open={open} onClose={onClose} title="Assigned signers">
      <Note>
        Pick one or more. When more than one signer is assigned, the field is split — each signer
        gets their own copy.
      </Note>
      <List>
        {signers.map((s) => {
          const sel = picked.includes(s.id);
          return (
            <Row
              key={s.id}
              type="button"
              $sel={sel}
              $color={s.color}
              aria-pressed={sel}
              aria-label={`${s.name} ${sel ? '(selected)' : ''}`}
              onClick={() => toggle(s.id)}
            >
              <Avatar $color={s.color} aria-hidden>
                {s.initials}
              </Avatar>
              <Info>
                <Name>{s.name}</Name>
                <Email>{s.email}</Email>
              </Info>
              <CheckBubble $sel={sel} $color={s.color} aria-hidden>
                {sel && <Check size={12} />}
              </CheckBubble>
            </Row>
          );
        })}
      </List>
      <Actions>
        <SecondaryBtn type="button" onClick={onClose}>
          Cancel
        </SecondaryBtn>
        <PrimaryBtn type="button" disabled={picked.length === 0} onClick={() => onApply(picked)}>
          Apply
        </PrimaryBtn>
      </Actions>
    </MWBottomSheet>
  );
}
