import { forwardRef, useEffect, useMemo, useRef, useState } from 'react';
import { Copy, FileText, MoreHorizontal, PenTool, Send, Trash2 } from 'lucide-react';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import type { TemplateCardProps } from './TemplateCard.types';
import {
  Actions,
  Body,
  Code,
  ConfirmRow,
  CoverInitial,
  CoverLine,
  CoverLines,
  CoverPaper,
  CoverPages,
  CoverSig,
  CoverStripe,
  CoverWrap,
  Footer,
  FooterStat,
  MenuItem,
  MenuPopover,
  MenuTrigger,
  Meta,
  MetaItem,
  Name,
  Root,
  Top,
} from './TemplateCard.styles';

const COVER_LINE_COUNT = 6;

/**
 * Deterministic line widths so the cover preview stays stable across renders
 * (avoids `Math.random` flicker — also keeps Storybook + visual snapshots
 * reproducible).
 */
function computeLineWidths(seed: string, count: number): ReadonlyArray<number> {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) {
    h = (h * 31 + seed.charCodeAt(i)) | 0;
  }
  const widths: number[] = [];
  for (let i = 0; i < count; i += 1) {
    h = (h * 1103515245 + 12345) | 0;
    const norm = ((h >>> 16) & 0xffff) / 0xffff;
    widths.push(60 + Math.round(norm * 32));
  }
  return widths;
}

/**
 * L2 domain card — preview tile for a single template, used in the
 * `/templates` grid. Whole card is clickable (fires `onUse`), with explicit
 * Edit / Use buttons in the footer for keyboard parity. When an
 * `onDuplicate` prop is supplied a "More actions" overflow menu surfaces a
 * Duplicate item; the menu closes on outside click and on Escape.
 */
export const TemplateCard = forwardRef<HTMLElement, TemplateCardProps>((props, ref) => {
  const { template, onUse, onEdit, onDuplicate, onDelete, ...rest } = props;
  const widths = useMemo(() => computeLineWidths(template.id, COVER_LINE_COUNT), [template.id]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const actionsRef = useRef<HTMLDivElement | null>(null);
  const hasMenu = Boolean(onDuplicate) || Boolean(onDelete);

  // Close the overflow menu on outside-click + Escape (rule 4.4: each effect
  // owns one concern — here, "menu open ⇒ listen for dismissal"). Also
  // resets the destructive-confirm state so the menu re-opens fresh.
  useEffect(() => {
    if (!menuOpen) return undefined;
    function onPointer(ev: MouseEvent): void {
      const node = actionsRef.current;
      if (node && ev.target instanceof Node && !node.contains(ev.target)) {
        setMenuOpen(false);
        setConfirmingDelete(false);
      }
    }
    function onKey(ev: KeyboardEvent): void {
      if (ev.key === 'Escape') {
        setMenuOpen(false);
        setConfirmingDelete(false);
      }
    }
    window.addEventListener('mousedown', onPointer);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onPointer);
      window.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  return (
    <Root
      ref={ref}
      aria-labelledby={`tpl-name-${template.id}`}
      onClick={() => onUse(template)}
      style={{ cursor: 'pointer' }}
      {...rest}
    >
      <Top>
        <CoverWrap aria-hidden>
          <CoverPaper>
            <CoverStripe $color={template.cover} />
            <CoverLines>
              {widths.map((w, i) => (
                <CoverLine key={`${template.id}-${i}`} $width={w} />
              ))}
            </CoverLines>
            <CoverInitial />
            <CoverSig />
            <CoverPages>{template.pages}p</CoverPages>
          </CoverPaper>
        </CoverWrap>

        <Body>
          <Code>{template.id}</Code>
          <Name id={`tpl-name-${template.id}`}>{template.name}</Name>
          <Meta>
            <MetaItem>
              <Icon icon={FileText} size={12} />
              {template.pages} pages
            </MetaItem>
            <MetaItem>
              <Icon icon={PenTool} size={12} />
              {template.fieldCount} fields
            </MetaItem>
          </Meta>
        </Body>
      </Top>

      <Footer onClick={(e) => e.stopPropagation()}>
        <FooterStat>
          Used <b>{template.uses}</b> times · last <code>{template.lastUsed}</code>
        </FooterStat>
        <Actions ref={actionsRef}>
          {onEdit ? (
            <Button
              variant="ghost"
              size="sm"
              iconLeft={PenTool}
              onClick={() => onEdit(template)}
              aria-label={`Edit ${template.name}`}
            >
              Edit
            </Button>
          ) : null}
          <Button
            variant="secondary"
            size="sm"
            iconLeft={Send}
            onClick={() => onUse(template)}
            aria-label={`Use ${template.name}`}
          >
            Use
          </Button>
          {hasMenu ? (
            <>
              <MenuTrigger
                type="button"
                onClick={() => {
                  setMenuOpen((v) => !v);
                  setConfirmingDelete(false);
                }}
                aria-label={`More actions for ${template.name}`}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
              >
                <Icon icon={MoreHorizontal} size={16} />
              </MenuTrigger>
              {menuOpen ? (
                <MenuPopover role="menu">
                  {onDuplicate ? (
                    <MenuItem role="none">
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setMenuOpen(false);
                          onDuplicate(template);
                        }}
                      >
                        <Icon icon={Copy} size={14} />
                        Duplicate
                      </button>
                    </MenuItem>
                  ) : null}
                  {onDelete && !confirmingDelete ? (
                    <MenuItem role="none" $danger>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => setConfirmingDelete(true)}
                      >
                        <Icon icon={Trash2} size={14} />
                        Delete
                      </button>
                    </MenuItem>
                  ) : null}
                  {onDelete && confirmingDelete ? (
                    <ConfirmRow role="none">
                      <strong>Delete this template?</strong>
                      <span>This can&apos;t be undone.</span>
                      <div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setConfirmingDelete(false)}
                        >
                          Cancel
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          iconLeft={Trash2}
                          onClick={() => {
                            setMenuOpen(false);
                            setConfirmingDelete(false);
                            onDelete(template);
                          }}
                          aria-label={`Confirm delete ${template.name}`}
                        >
                          Delete
                        </Button>
                      </div>
                    </ConfirmRow>
                  ) : null}
                </MenuPopover>
              ) : null}
            </>
          ) : null}
        </Actions>
      </Footer>
    </Root>
  );
});

TemplateCard.displayName = 'TemplateCard';
