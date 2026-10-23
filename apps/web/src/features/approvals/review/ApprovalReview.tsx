import { useMemo, useRef } from 'react';
import type { ReactNode, TouchEvent } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { Button } from '@/components/Button';
import { DocumentPageCanvas } from '@/components/DocumentPageCanvas';
import { MWBottomSheet } from '@/components/MWBottomSheet';
import { PageThumbRail } from '@/components/PageThumbRail';
import { useCanvasWidth } from '@/lib/canvas-coords';
import type { Envelope } from '@/features/envelopes';
import {
  Bar,
  BarSpacer,
  Body,
  Header,
  HeaderSub,
  HeaderText,
  HeaderTitle,
  IconButton,
  LegendPanel,
  Notice,
  PageArea,
  PanelTitle,
  RailSlot,
  Root,
  SheetActions,
  SummaryPanel,
  SummaryTitle,
} from './ApprovalReview.styles';
import { ReviewField } from './ReviewField';
import { ReviewSignerList } from './ReviewSignerList';
import { useReviewPdfUrl } from './useReviewPdfUrl';
import {
  buildReviewPages,
  fieldCountByPage,
  fieldsOnPage,
  signerFor,
  summarizeSigners,
  type ReviewPage,
} from './reviewModel';

const SWIPE_MIN_PX = 60;

export interface ApprovalReviewProps {
  readonly envelope: Envelope;
  /** The action in words ("Send for signature"), shown under the title. */
  readonly actionLabel: string;
  /** 1-based page step. `pages + 1` is the "All fields checked" step. */
  readonly step: number;
  readonly onStepChange: (step: number) => void;
  readonly onApprove: () => void;
  /** Omitted where the field editor cannot open (a phone). */
  readonly onEdit?: (() => void) | undefined;
  readonly onExit: () => void;
  readonly busy: boolean;
  /** An alert shown above the bar: a failed Approve, or "sign in again". */
  readonly notice?: ReactNode | undefined;
  /** Phone layout: header arrows, swipe, and the summary in a bottom sheet. */
  readonly isMobile: boolean;
  /** The primary button's text. Default "Approve"; the app send flow says "Send". */
  readonly approveLabel?: string | undefined;
  /** The header back button's accessible name. Default "Back to the approval". */
  readonly backLabel?: string | undefined;
}

function clampStep(step: number, total: number): number {
  return Math.min(Math.max(1, Math.floor(step) || 1), total + 1);
}

interface PageCanvasProps {
  readonly envelope: Envelope;
  readonly target: ReviewPage;
}

function ReviewPageCanvas({ envelope, target }: PageCanvasProps) {
  const width = useCanvasWidth();
  const { data: src } = useReviewPdfUrl(envelope.id, target.documentId);
  const fields = fieldsOnPage(envelope, target);
  return (
    <DocumentPageCanvas
      pageNum={target.page}
      totalPages={envelope.original_pages ?? target.page}
      title={target.documentTitle}
      width={width}
      pdfSrc={src || undefined}
    >
      {fields.map((field) => (
        <ReviewField
          key={field.id}
          field={field}
          signer={signerFor(envelope.signers, field.signer_id)}
        />
      ))}
    </DocumentPageCanvas>
  );
}

/**
 * The guided review (design step 7d): one step per page across every
 * document, each field in its signer's colour, a legend, a sticky bar with
 * Approve on every page, then "All fields checked" with Approve or Edit.
 * Everything on it is read-only. Opening it never uses up the email token.
 */
export function ApprovalReview({
  envelope,
  actionLabel,
  step,
  onStepChange,
  onApprove,
  onEdit,
  onExit,
  busy,
  notice,
  isMobile,
  approveLabel = 'Approve',
  backLabel = 'Back to the approval',
}: ApprovalReviewProps) {
  const pages = useMemo(() => buildReviewPages(envelope), [envelope]);
  const total = pages.length;
  const current = clampStep(step, total);
  const onSummary = current === total + 1;
  const target = pages[Math.min(current, total) - 1];
  const signers = useMemo(() => summarizeSigners(envelope, pages), [envelope, pages]);
  const counts = useMemo(() => fieldCountByPage(envelope, pages), [envelope, pages]);
  const touchStart = useRef<{ readonly x: number; readonly y: number } | null>(null);

  const goBack = (): void => {
    if (current > 1) onStepChange(current - 1);
  };
  const goNext = (): void => {
    if (current <= total) onStepChange(current + 1);
  };

  const handleTouchStart = (e: TouchEvent): void => {
    const t = e.touches[0];
    touchStart.current = t ? { x: t.clientX, y: t.clientY } : null;
  };
  const handleTouchEnd = (e: TouchEvent): void => {
    const start = touchStart.current;
    const t = e.changedTouches[0];
    touchStart.current = null;
    if (!start || !t || !isMobile) return;
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) < Math.abs(dy)) return;
    if (dx < 0) goNext();
    else goBack();
  };

  if (!target) return null;

  const subtitle = onSummary
    ? 'All fields checked'
    : `${target.multiDocument ? `${target.documentTitle} · ` : ''}Page ${current} / ${total}`;

  const approveButton = (
    <Button variant="primary" size="lg" loading={busy} onClick={onApprove}>
      {approveLabel}
    </Button>
  );
  const editButton = onEdit ? (
    <Button variant="secondary" size="lg" disabled={busy} onClick={onEdit}>
      Edit
    </Button>
  ) : null;

  const summary = (
    <>
      <ReviewSignerList signers={signers} label="Fields by signer" showPages />
    </>
  );

  return (
    <Root>
      <Header>
        <IconButton type="button" aria-label={backLabel} onClick={onExit}>
          <ArrowLeft size={20} aria-hidden />
        </IconButton>
        <HeaderText>
          <HeaderTitle>{envelope.title}</HeaderTitle>
          <HeaderSub>
            {actionLabel} · {subtitle}
          </HeaderSub>
        </HeaderText>
        {isMobile ? (
          <>
            <IconButton
              type="button"
              aria-label="Previous page"
              disabled={current <= 1}
              onClick={goBack}
            >
              <ArrowLeft size={20} aria-hidden />
            </IconButton>
            <IconButton type="button" aria-label="Next page" disabled={onSummary} onClick={goNext}>
              <ArrowRight size={20} aria-hidden />
            </IconButton>
          </>
        ) : null}
      </Header>

      <Body onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
        <LegendPanel aria-label="Signer colours">
          <PanelTitle>Signers</PanelTitle>
          <ReviewSignerList signers={signers} label="Signer legend" />
        </LegendPanel>

        {onSummary && !isMobile ? (
          <SummaryPanel aria-label="All fields checked">
            <SummaryTitle>All fields checked</SummaryTitle>
            {summary}
          </SummaryPanel>
        ) : (
          <PageArea role="region" aria-label={`Page ${target.index} of ${total}`}>
            <ReviewPageCanvas envelope={envelope} target={target} />
          </PageArea>
        )}

        <RailSlot>
          <PageThumbRail
            totalPages={total}
            currentPage={Math.min(current, total)}
            onSelectPage={onStepChange}
            fieldCountByPage={counts}
          />
        </RailSlot>
      </Body>

      {notice ? <Notice role="alert">{notice}</Notice> : null}

      <Bar aria-label="Review actions" role="group">
        {!isMobile ? (
          <>
            <Button variant="ghost" size="lg" disabled={current <= 1} onClick={goBack}>
              Back
            </Button>
            <Button variant="ghost" size="lg" disabled={onSummary} onClick={goNext}>
              Next
            </Button>
          </>
        ) : null}
        <BarSpacer />
        {editButton}
        {approveButton}
      </Bar>

      <MWBottomSheet
        open={isMobile && onSummary}
        title="All fields checked"
        onClose={() => {
          onStepChange(total);
        }}
      >
        {summary}
        <SheetActions>
          {approveButton}
          {editButton}
        </SheetActions>
      </MWBottomSheet>
    </Root>
  );
}
