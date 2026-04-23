import { forwardRef, useCallback, useEffect, useId, useRef, useState } from 'react';
import type { ChangeEvent, KeyboardEvent as ReactKeyboardEvent, MouseEvent } from 'react';
import { Button } from '../Button';
import type { PlaceOnPagesPopoverProps, PlacePagesMode } from './PlaceOnPagesPopover.types';
import {
  Backdrop,
  CancelButton,
  Card,
  CurrentPage,
  CurrentPageNumber,
  CustomInput,
  Footer,
  Grid,
  HiddenInput,
  HintCard,
  RadioCircle,
  RadioColumn,
  RadioDot,
  RadioLabel,
  Title,
} from './PlaceOnPagesPopover.styles';

interface ModeOption {
  readonly k: PlacePagesMode;
  readonly l: string;
}

const OPTIONS: ReadonlyArray<ModeOption> = [
  { k: 'this', l: 'Only this page' },
  { k: 'all', l: 'All pages' },
  { k: 'allButLast', l: 'All pages but last' },
  { k: 'last', l: 'Last page' },
  { k: 'custom', l: 'Custom pages' },
];

const HINTS: Record<PlacePagesMode, string> = {
  this: 'Keep it only on this page.',
  all: 'Create a linked copy on every page of the document.',
  allButLast: 'Copy to every page except the last.',
  last: 'Place only on the final page.',
  custom: 'Comma-separated page numbers, e.g. 1, 3, 5.',
};

const parseCustom = (value: string, totalPages: number): ReadonlyArray<number> =>
  value
    .split(',')
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !Number.isNaN(n) && n >= 1 && n <= totalPages);

export const PlaceOnPagesPopover = forwardRef<HTMLDivElement, PlaceOnPagesPopoverProps>(
  (props, ref) => {
    const {
      open,
      currentPage,
      totalPages,
      initialMode = 'all',
      onApply,
      onCancel,
      title = 'Place on',
      applyLabel = 'Apply',
      cancelLabel = 'Cancel',
      ...rest
    } = props;

    const [mode, setMode] = useState<PlacePagesMode>(initialMode);
    const [custom, setCustom] = useState<string>('');
    const prevOpenRef = useRef<boolean>(open);
    const customInputRef = useRef<HTMLInputElement | null>(null);
    const titleId = useId();

    useEffect(() => {
      if (open && !prevOpenRef.current) {
        setMode(initialMode);
        setCustom('');
      }
      prevOpenRef.current = open;
    }, [open, initialMode]);

    useEffect(() => {
      if (open && mode === 'custom') {
        customInputRef.current?.focus();
      }
    }, [open, mode]);

    useEffect(() => {
      if (!open) return undefined;
      const handleKey = (e: KeyboardEvent): void => {
        if (e.key === 'Escape') {
          e.preventDefault();
          onCancel();
        }
      };
      window.addEventListener('keydown', handleKey);
      return () => {
        window.removeEventListener('keydown', handleKey);
      };
    }, [open, onCancel]);

    const handleBackdropClick = useCallback(() => {
      onCancel();
    }, [onCancel]);

    const handleCardClick = useCallback((e: MouseEvent<HTMLDivElement>) => {
      e.stopPropagation();
    }, []);

    const handleCustomChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
      setCustom(e.target.value);
    }, []);

    const handleRadioKey = useCallback(
      (next: PlacePagesMode) =>
        (e: ReactKeyboardEvent<HTMLInputElement>): void => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setMode(next);
          }
        },
      [],
    );

    const handleApply = useCallback(() => {
      if (mode === 'custom') {
        onApply('custom', parseCustom(custom, totalPages));
        return;
      }
      onApply(mode, undefined);
    }, [mode, custom, totalPages, onApply]);

    if (!open) return null;

    return (
      <Backdrop onClick={handleBackdropClick} data-testid="place-on-pages-backdrop">
        <Card
          {...rest}
          ref={ref}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          onClick={handleCardClick}
        >
          <Title id={titleId}>{title}</Title>
          <Grid>
            <RadioColumn role="radiogroup" aria-label={title}>
              {OPTIONS.map((o) => {
                const selected = mode === o.k;
                return (
                  <RadioLabel key={o.k} $selected={selected} onClick={() => setMode(o.k)}>
                    <RadioCircle $selected={selected} aria-hidden>
                      {selected ? <RadioDot /> : null}
                    </RadioCircle>
                    <HiddenInput
                      type="radio"
                      name="place-on-pages-mode"
                      value={o.k}
                      checked={selected}
                      onChange={() => setMode(o.k)}
                      onKeyDown={handleRadioKey(o.k)}
                      aria-checked={selected}
                    />
                    <span>{o.l}</span>
                  </RadioLabel>
                );
              })}
              {mode === 'custom' ? (
                <CustomInput
                  ref={customInputRef}
                  value={custom}
                  onChange={handleCustomChange}
                  placeholder="e.g. 1, 3, 5"
                  aria-label="Custom pages"
                />
              ) : null}
              <CurrentPage>
                Current page: <CurrentPageNumber>{currentPage}</CurrentPageNumber> of {totalPages}
              </CurrentPage>
            </RadioColumn>
            <HintCard role="note">{HINTS[mode]}</HintCard>
          </Grid>
          <Footer>
            <CancelButton type="button" onClick={onCancel}>
              {cancelLabel}
            </CancelButton>
            <Button variant="primary" onClick={handleApply}>
              {applyLabel}
            </Button>
          </Footer>
        </Card>
      </Backdrop>
    );
  },
);

PlaceOnPagesPopover.displayName = 'PlaceOnPagesPopover';
