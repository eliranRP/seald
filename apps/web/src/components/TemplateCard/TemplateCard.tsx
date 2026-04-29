import { forwardRef, useMemo } from 'react';
import { FileText, PenTool, Send } from 'lucide-react';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import type { TemplateCardProps } from './TemplateCard.types';
import {
  Actions,
  Body,
  Code,
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
 * Edit / Use buttons in the footer for keyboard parity.
 */
export const TemplateCard = forwardRef<HTMLElement, TemplateCardProps>((props, ref) => {
  const { template, onUse, onEdit, ...rest } = props;
  const widths = useMemo(() => computeLineWidths(template.id, COVER_LINE_COUNT), [template.id]);

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
        <Actions>
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
        </Actions>
      </Footer>
    </Root>
  );
});

TemplateCard.displayName = 'TemplateCard';
