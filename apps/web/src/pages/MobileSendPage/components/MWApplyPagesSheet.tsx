import { useEffect, useState } from 'react';
import styled from 'styled-components';
import { PrimaryBtn, SecondaryBtn } from '../MobileSendPage.styles';
import { parseCustomPages, type MobileApplyMode } from '../types';
import { MWBottomSheet } from './MWBottomSheet';

const List = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const Row = styled.button<{ $sel: boolean }>`
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px;
  border: 1px solid ${({ $sel }) => ($sel ? 'var(--indigo-500)' : 'var(--border-1)')};
  border-radius: 12px;
  background: ${({ $sel }) => ($sel ? 'var(--indigo-50)' : '#fff')};
  text-align: left;
  cursor: pointer;
  font: inherit;

  &:focus-visible {
    outline: 2px solid var(--indigo-600);
    outline-offset: 2px;
  }
`;

const Radio = styled.span<{ $sel: boolean }>`
  width: 20px;
  height: 20px;
  border-radius: 10px;
  margin-top: 1px;
  border: 2px solid ${({ $sel }) => ($sel ? 'var(--indigo-600)' : 'var(--border-2)')};
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
`;

const RadioDot = styled.span`
  width: 10px;
  height: 10px;
  border-radius: 5px;
  background: var(--indigo-600);
`;

const RowLabel = styled.div<{ $sel: boolean }>`
  font-size: 14px;
  font-weight: 600;
  color: ${({ $sel }) => ($sel ? 'var(--indigo-800)' : 'var(--fg-1)')};
`;

const RowHint = styled.div`
  font-size: 12px;
  color: var(--fg-3);
  margin-top: 2px;
`;

const Input = styled.input`
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--border-1);
  border-radius: 12px;
  padding: 12px 14px;
  font: inherit;
  font-size: 15px;
  color: var(--fg-1);
  outline: none;
  background: #fff;

  &:focus {
    border-color: var(--indigo-500);
    box-shadow: var(--shadow-focus);
  }
`;

const Actions = styled.div`
  display: flex;
  gap: 8px;
  margin-top: 8px;
`;

export interface MWApplyPagesSheetProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly totalPages: number;
  readonly currentPage: number;
  readonly currentMode: MobileApplyMode;
  readonly onApply: (mode: MobileApplyMode, pages: ReadonlyArray<number>) => void;
}

interface OptDef {
  readonly k: MobileApplyMode;
  readonly l: string;
  readonly hint: string;
}

/**
 * Bulk-apply sheet — parity with the desktop `PlaceOnPagesPopover`. Five
 * modes: only this page · all pages · all pages but last · last page ·
 * custom (comma-separated).
 */
export function MWApplyPagesSheet(props: MWApplyPagesSheetProps) {
  const { open, onClose, totalPages, currentPage, currentMode, onApply } = props;
  const [mode, setMode] = useState<MobileApplyMode>(currentMode);
  const [custom, setCustom] = useState<string>('');

  // Re-seed when the sheet is reopened against a new selection.
  useEffect(() => {
    if (open) {
      setMode(currentMode);
      setCustom('');
    }
  }, [open, currentMode]);

  const opts: ReadonlyArray<OptDef> = [
    { k: 'this', l: 'Only this page', hint: `Keep it only on page ${currentPage}.` },
    { k: 'all', l: 'All pages', hint: `Place on every page (1–${totalPages}).` },
    {
      k: 'allButLast',
      l: 'All pages but last',
      hint: `Pages 1–${Math.max(1, totalPages - 1)}. Skips the last page.`,
    },
    { k: 'last', l: 'Last page', hint: `Only page ${totalPages}.` },
    { k: 'custom', l: 'Custom pages', hint: 'Comma-separated, e.g. 1, 3, 5.' },
  ];

  const handleApply = (): void => {
    const pages = mode === 'custom' ? parseCustomPages(custom, totalPages, currentPage) : [];
    onApply(mode, pages);
  };

  return (
    <MWBottomSheet open={open} onClose={onClose} title="Place on pages">
      <List>
        {opts.map((o) => {
          const sel = mode === o.k;
          return (
            <Row
              key={o.k}
              type="button"
              $sel={sel}
              onClick={() => setMode(o.k)}
              aria-pressed={sel}
              aria-label={o.l}
            >
              <Radio $sel={sel} aria-hidden>
                {sel && <RadioDot />}
              </Radio>
              <div style={{ flex: 1 }}>
                <RowLabel $sel={sel}>{o.l}</RowLabel>
                <RowHint>{o.hint}</RowHint>
              </div>
            </Row>
          );
        })}
        {mode === 'custom' && (
          <Input
            // eslint-disable-next-line jsx-a11y/no-autofocus -- per design,
            // custom mode opens an inline text input that must be ready for
            // typing immediately when the user picks "Custom pages".
            autoFocus
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder="e.g. 1, 3, 5"
            aria-label="Custom page list"
          />
        )}
        <Actions>
          <SecondaryBtn type="button" onClick={onClose}>
            Cancel
          </SecondaryBtn>
          <PrimaryBtn type="button" onClick={handleApply}>
            Apply
          </PrimaryBtn>
        </Actions>
      </List>
    </MWBottomSheet>
  );
}
