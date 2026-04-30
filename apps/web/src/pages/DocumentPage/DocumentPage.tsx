import { forwardRef, useCallback, useState } from 'react';
import {
  ArrowLeft,
  Bookmark,
  BookmarkPlus,
  CheckCircle2,
  Copy,
  Group as GroupIcon,
  Ungroup as UngroupIcon,
  X as XIcon,
} from 'lucide-react';
import { Icon } from '@/components/Icon';
import { AddSignerDropdown } from '@/components/AddSignerDropdown';
import type { AddSignerContact } from '@/components/AddSignerDropdown/AddSignerDropdown.types';
import { Button } from '@/components/Button';
import { CollapsibleRail } from '@/components/CollapsibleRail';
import { DocumentCanvas } from '@/components/DocumentCanvas';
import { FieldPalette } from '@/components/FieldPalette';
import { FieldsPlacedList } from '@/components/FieldsPlacedList';
import { PageThumbRail } from '@/components/PageThumbRail';
import { PageToolbar } from '@/components/PageToolbar';
import { PlaceOnPagesPopover } from '@/components/PlaceOnPagesPopover';
import { PlacedField } from '@/components/PlacedField';
import { RemoveLinkedCopiesDialog } from '@/components/RemoveLinkedCopiesDialog';
import { SelectSignersPopover } from '@/components/SelectSignersPopover';
import { SendPanelFooter } from '@/components/SendPanelFooter';
import { SignersPanel } from '@/components/SignersPanel';
import {
  DEFAULT_LEFT_WIDTH,
  DEFAULT_RIGHT_WIDTH,
  expandSelectionToGroup,
  hasAnyGrouped,
  isFullyGrouped,
  makeGroupId,
  withoutGroupId,
  useCanvasDnd,
  useCanvasScroll,
  useCanvasZoom,
  useDocumentDerived,
  useEditorKeyboard,
  useFieldMutations,
  useLinkedRemove,
  usePlacement,
  useUndoStack,
} from '@/features/documentEditor';
import type { DocumentPageProps } from './DocumentPage.types';
import {
  Body,
  CanvasScaleInner,
  CanvasScaler,
  CanvasScroll,
  CanvasWrap,
  Center,
  CenterHeader,
  CenterHeaderSide,
  CenterInner,
  CenterTop,
  GroupBoundary,
  GroupToolbar,
  GroupToolbarButton,
  GroupToolbarLabel,
  MarqueeRect,
  BannerSlot,
  PageStack,
  RailSlot,
  RightRailFooter,
  RightRailInner,
  RightRailScroll,
  SaveAsTemplateButton,
  SaveAsTemplateRow,
  Shell,
  SnapGuide,
  TemplatePrimaryButton,
  TemplatePrimaryFooter,
  TemplatePrimaryStatus,
  TemplateSummaryBody,
  TemplateSummaryCard,
  TemplateSummaryEyebrow,
  TemplateSummaryIcon,
  TemplateSummaryText,
  Workspace,
} from './DocumentPage.styles';

const ADDDROPDOWN_WRAP_STYLE: React.CSSProperties = {
  position: 'relative',
  height: 0,
};

export const DocumentPage = forwardRef<HTMLDivElement, DocumentPageProps>((props, ref) => {
  const {
    totalPages,
    title,
    docId,
    initialPage = 1,
    pdfDoc,
    pdfLoading,
    fields,
    onFieldsChange,
    availableFieldKinds,
    requiredFieldKinds,
    signers,
    contacts = [],
    onAddSignerFromContact,
    onCreateSigner,
    onRemoveSigner,
    onSend,
    onSaveDraft,
    onBack,
    onSaveAsTemplate,
    banner,
    sendLabel,
    templateMode,
    templateName,
    ...rest
  } = props;

  const isTemplateAuthoring = templateMode === 'authoring';

  // -------------------------- chrome state (rail widths + drawer toggles)
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [leftWidth, setLeftWidth] = useState(DEFAULT_LEFT_WIDTH);
  const [rightWidth, setRightWidth] = useState(DEFAULT_RIGHT_WIDTH);
  const [addSignerOpen, setAddSignerOpen] = useState(false);

  // -------------------------- selection + popover state (page-owned because
  //                            multiple feature hooks read/write it)
  const [selectedIds, setSelectedIds] = useState<ReadonlyArray<string>>([]);
  const [signerPopoverFor, setSignerPopoverFor] = useState<string | null>(null);
  const [pagesPopoverFor, setPagesPopoverFor] = useState<string | null>(null);
  const [groupPagesPopoverOpen, setGroupPagesPopoverOpen] = useState(false);

  // -------------------------- feature hooks
  const {
    currentPage,
    visiblePages,
    paperSize,
    canvasScrollRef,
    canvasRefsRef,
    setCanvasRefForPage,
    setPageWrapRefForPage,
    scrollToPage,
  } = useCanvasScroll({ initialPage, totalPages, paperResetKey: pdfDoc });

  const { zoom, zoomIn, zoomOut, resetZoom, zoomInDisabled, zoomOutDisabled } = useCanvasZoom();

  const clearSignerPopover = useCallback(() => setSignerPopoverFor(null), []);
  const clearPagesPopover = useCallback(() => setPagesPopoverFor(null), []);

  const { pushUndo, undo, hasUndo, clipboardRef, hasClipboard } = useUndoStack({
    onFieldsChange,
    onUndoApplied: useCallback((restored) => {
      // Restoring a snapshot can leave stale ids in the selection — drop any
      // that no longer point to a present field, and close every popover so
      // none refer to a removed id.
      setSelectedIds((prev) => prev.filter((id) => restored.some((f) => f.id === id)));
      setSignerPopoverFor(null);
      setPagesPopoverFor(null);
      setGroupPagesPopoverOpen(false);
    }, []),
  });

  const {
    placedFieldSigners,
    panelSigners,
    popoverSigners,
    fieldsSummary,
    fieldCountByPage,
    usageByKind,
    existingContactIds,
    singleSelectedId,
    groupRect,
    signerPopoverField,
    pagesPopoverField,
  } = useDocumentDerived({
    fields,
    signers,
    contacts,
    selectedIds,
    signerPopoverFor,
    pagesPopoverFor,
  });

  const { snapGuides, clearSnapGuides, moveField, resizeField, toggleRequired } = useFieldMutations(
    { fields, onFieldsChange, selectedIds },
  );

  const {
    pendingRemove,
    pendingLinkedCount,
    requestRemove,
    handleRemoveLinkedConfirm,
    handleRemoveLinkedCancel,
  } = useLinkedRemove({
    fields,
    onFieldsChange,
    pushUndo,
    setSelectedIds,
    clearSignerPopover,
    clearPagesPopover,
  });

  const removeField = useCallback((id: string) => requestRemove([id]), [requestRemove]);
  const removeSelectedGroup = useCallback((): void => {
    if (selectedIds.length < 2) return;
    requestRemove(selectedIds);
  }, [requestRemove, selectedIds]);
  const duplicateSelectedGroup = useCallback((): void => {
    if (selectedIds.length < 2) return;
    setGroupPagesPopoverOpen(true);
  }, [selectedIds]);

  // Persistent group/ungroup actions. "Group" assigns a fresh groupId to
  // every selected field so they stay bound across selections, drags,
  // and duplicate-on-pages operations. "Ungroup" strips the groupId off
  // every selected field, returning them to standalone behavior. Both
  // record an undo snapshot so the operation is reversible.
  const groupSelected = useCallback((): void => {
    if (selectedIds.length < 2) return;
    if (isFullyGrouped(selectedIds, fields)) return;
    const newGroupId = makeGroupId();
    const selectedSet = new Set<string>(selectedIds);
    pushUndo(fields);
    onFieldsChange(fields.map((f) => (selectedSet.has(f.id) ? { ...f, groupId: newGroupId } : f)));
  }, [fields, onFieldsChange, pushUndo, selectedIds]);

  const ungroupSelected = useCallback((): void => {
    if (!hasAnyGrouped(selectedIds, fields)) return;
    const selectedSet = new Set<string>(selectedIds);
    pushUndo(fields);
    onFieldsChange(
      fields.map((f) => {
        if (!selectedSet.has(f.id) || !f.groupId) return f;
        return withoutGroupId(f);
      }),
    );
  }, [fields, onFieldsChange, pushUndo, selectedIds]);

  const { duplicateField, applySignerSelection, applyPagesSelection, applyGroupPagesSelection } =
    usePlacement({
      fields,
      onFieldsChange,
      pushUndo,
      setSelectedIds,
      selectedIds,
      groupRect,
      totalPages,
      signerPopoverFor,
      pagesPopoverField,
      setSignerPopoverFor,
      setPagesPopoverFor,
      setGroupPagesPopoverOpen,
    });

  const {
    marqueeRect,
    handlePaletteDragStart,
    handlePaletteDragEnd,
    handleCanvasDragOver,
    handleCanvasDrop,
    handleCanvasBackgroundClick,
    handleCanvasMouseDown,
  } = useCanvasDnd({
    fields,
    onFieldsChange,
    pushUndo,
    signers,
    canvasRefsRef,
    zoom,
    setSelectedIds,
    setSignerPopoverFor,
    setPagesPopoverFor,
  });

  useEditorKeyboard({
    fields,
    onFieldsChange,
    pushUndo,
    clipboardRef,
    hasUndo,
    hasClipboard,
    undo,
    currentPage,
    selectedIds,
    setSelectedIds,
    requestRemove,
    zoomIn,
    zoomOut,
    resetZoom,
  });

  // ------------------------------------------------------------------ signer
  const handlePickContact = useCallback(
    (contact: AddSignerContact): void => {
      onAddSignerFromContact?.(contact);
      setAddSignerOpen(false);
    },
    [onAddSignerFromContact],
  );

  const handleCreateSigner = useCallback(
    (name: string, email: string): void => {
      onCreateSigner?.(name, email);
      setAddSignerOpen(false);
    },
    [onCreateSigner],
  );

  // ------------------------------------------------------------------ render
  return (
    <Shell {...rest} ref={ref}>
      <Body>
        <Workspace>
          <CollapsibleRail
            side="left"
            title="Fields"
            open={leftOpen}
            onOpenChange={setLeftOpen}
            width={leftWidth}
            onWidthChange={setLeftWidth}
            minW={200}
            maxW={360}
          >
            <FieldPalette
              {...(availableFieldKinds ? { kinds: availableFieldKinds } : {})}
              {...(requiredFieldKinds ? { requiredKinds: requiredFieldKinds } : {})}
              usageByKind={usageByKind}
              onFieldDragStart={handlePaletteDragStart}
              onFieldDragEnd={handlePaletteDragEnd}
            />
          </CollapsibleRail>

          <Center>
            <CenterTop>
              <CenterHeader>
                <CenterHeaderSide>
                  {onBack ? (
                    <Button variant="ghost" iconLeft={ArrowLeft} size="sm" onClick={onBack}>
                      Back
                    </Button>
                  ) : null}
                </CenterHeaderSide>
                <PageToolbar
                  currentPage={currentPage}
                  totalPages={totalPages}
                  onPrevPage={() => scrollToPage(Math.max(1, currentPage - 1))}
                  onNextPage={() => scrollToPage(Math.min(totalPages, currentPage + 1))}
                  zoom={zoom}
                  onZoomIn={zoomIn}
                  onZoomOut={zoomOut}
                  onResetZoom={resetZoom}
                  zoomInDisabled={zoomInDisabled}
                  zoomOutDisabled={zoomOutDisabled}
                />
                <CenterHeaderSide aria-hidden />
              </CenterHeader>
            </CenterTop>

            {banner ? <BannerSlot>{banner}</BannerSlot> : null}

            <CanvasScroll ref={canvasScrollRef}>
              <CenterInner>
                <PageStack>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => {
                    const isLive = visiblePages.has(pageNum);
                    const pageFields = fields.filter((f) => f.page === pageNum);
                    const pageCanvasRef = {
                      get current() {
                        return canvasRefsRef.current.get(pageNum) ?? null;
                      },
                    } as React.RefObject<HTMLElement>;
                    return (
                      <CanvasWrap
                        key={pageNum}
                        data-page={pageNum}
                        ref={setPageWrapRefForPage(pageNum)}
                      >
                        <CanvasScaler
                          style={{
                            width: paperSize.width * zoom,
                            height: paperSize.height * zoom,
                          }}
                        >
                          <CanvasScaleInner
                            style={{
                              width: paperSize.width,
                              height: paperSize.height,
                              transform: `scale(${String(zoom)})`,
                            }}
                          >
                            {isLive ? (
                              <DocumentCanvas
                                ref={setCanvasRefForPage(pageNum)}
                                currentPage={pageNum}
                                totalPages={totalPages}
                                {...(title ? { title } : {})}
                                {...(docId ? { docId } : {})}
                                {...(pdfDoc ? { pdfDoc } : {})}
                                {...(pdfLoading ? { pdfLoading: true } : {})}
                                onDragOver={handleCanvasDragOver}
                                onDrop={(e) => handleCanvasDrop(e, pageNum)}
                                onClick={handleCanvasBackgroundClick}
                                onMouseDown={(e) => handleCanvasMouseDown(e, pageNum)}
                              >
                                {pageFields.map((field) => {
                                  const isSelected = selectedIds.includes(field.id);
                                  const inGroup = isSelected && selectedIds.length > 1;
                                  return (
                                    <PlacedField
                                      key={field.id}
                                      field={field}
                                      signers={placedFieldSigners}
                                      selected={isSelected}
                                      inGroup={inGroup}
                                      canvasRef={pageCanvasRef}
                                      onSelect={(e) => {
                                        e.stopPropagation();
                                        const additive = e.shiftKey || e.metaKey || e.ctrlKey;
                                        // Persistent groups expand to all members so clicking
                                        // any tile selects the whole group — same gesture for
                                        // single-click and shift/meta-click.
                                        setSelectedIds((prev) => {
                                          const base = additive
                                            ? prev.includes(field.id)
                                              ? prev.filter((id) => id !== field.id)
                                              : [...prev, field.id]
                                            : [field.id];
                                          return expandSelectionToGroup(base, fields);
                                        });
                                        setSignerPopoverFor(null);
                                        setPagesPopoverFor(null);
                                      }}
                                      onOpenSignerPopover={(e) => {
                                        e.stopPropagation();
                                        setSignerPopoverFor(field.id);
                                      }}
                                      onOpenPagesPopover={(e) => {
                                        e.stopPropagation();
                                        setPagesPopoverFor(field.id);
                                      }}
                                      onRemove={() => removeField(field.id)}
                                      onToggleRequired={toggleRequired}
                                      onMove={moveField}
                                      onResize={resizeField}
                                      onDragEnd={clearSnapGuides}
                                      zoom={zoom}
                                    />
                                  );
                                })}
                                {marqueeRect && marqueeRect.page === pageNum ? (
                                  <MarqueeRect
                                    data-testid="canvas-marquee"
                                    style={{
                                      left: marqueeRect.x,
                                      top: marqueeRect.y,
                                      width: marqueeRect.w,
                                      height: marqueeRect.h,
                                    }}
                                  />
                                ) : null}
                                {snapGuides
                                  .filter((g) => g.page === pageNum)
                                  .map((g, i) => (
                                    <SnapGuide
                                      // Positional keys are fine here — guides are short-lived
                                      // drag-time state with no stable identity of their own.
                                      // eslint-disable-next-line react/no-array-index-key
                                      key={`${g.orientation}-${String(g.pos)}-${String(i)}`}
                                      data-testid="snap-guide"
                                      $orientation={g.orientation}
                                      style={
                                        g.orientation === 'v' ? { left: g.pos } : { top: g.pos }
                                      }
                                    />
                                  ))}
                                {groupRect && groupRect.page === pageNum ? (
                                  <GroupBoundary
                                    data-testid="group-boundary"
                                    style={{
                                      left: groupRect.x - 6,
                                      top: groupRect.y - 6,
                                      width: groupRect.w + 12,
                                      height: groupRect.h + 12,
                                    }}
                                  />
                                ) : null}
                                {groupRect && groupRect.page === pageNum ? (
                                  <GroupToolbar
                                    data-testid="group-toolbar"
                                    style={{
                                      left: groupRect.x,
                                      top: Math.max(0, groupRect.y - 40),
                                    }}
                                    onMouseDown={(e) => e.stopPropagation()}
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <GroupToolbarLabel>
                                      {selectedIds.length} selected
                                    </GroupToolbarLabel>
                                    {isFullyGrouped(selectedIds, fields) ? (
                                      <GroupToolbarButton
                                        type="button"
                                        $tone="indigo"
                                        aria-label="Ungroup selected fields"
                                        onClick={ungroupSelected}
                                      >
                                        <UngroupIcon size={14} strokeWidth={1.75} aria-hidden />
                                      </GroupToolbarButton>
                                    ) : (
                                      <GroupToolbarButton
                                        type="button"
                                        $tone="indigo"
                                        aria-label="Group selected fields"
                                        onClick={groupSelected}
                                      >
                                        <GroupIcon size={14} strokeWidth={1.75} aria-hidden />
                                      </GroupToolbarButton>
                                    )}
                                    <GroupToolbarButton
                                      type="button"
                                      $tone="indigo"
                                      aria-label="Duplicate selected fields"
                                      onClick={duplicateSelectedGroup}
                                    >
                                      <Copy size={14} strokeWidth={1.75} aria-hidden />
                                    </GroupToolbarButton>
                                    <GroupToolbarButton
                                      type="button"
                                      $tone="danger"
                                      aria-label="Delete selected fields"
                                      onClick={removeSelectedGroup}
                                    >
                                      <XIcon size={14} strokeWidth={1.75} aria-hidden />
                                    </GroupToolbarButton>
                                  </GroupToolbar>
                                ) : null}
                              </DocumentCanvas>
                            ) : null}
                          </CanvasScaleInner>
                        </CanvasScaler>
                      </CanvasWrap>
                    );
                  })}
                </PageStack>
              </CenterInner>
              <RailSlot>
                <PageThumbRail
                  totalPages={totalPages}
                  currentPage={currentPage}
                  onSelectPage={scrollToPage}
                  fieldCountByPage={fieldCountByPage}
                />
              </RailSlot>
            </CanvasScroll>
          </Center>

          <CollapsibleRail
            side="right"
            title={isTemplateAuthoring ? (templateName ?? 'New template') : 'Ready to send'}
            open={rightOpen}
            onOpenChange={setRightOpen}
            width={rightWidth}
            onWidthChange={setRightWidth}
            minW={280}
            maxW={440}
            noPad
          >
            <RightRailInner>
              <RightRailScroll>
                {isTemplateAuthoring ? (
                  // Template-authoring mode: explanatory summary card
                  // sits where the Signers panel would. Signers are
                  // collected later when the template is *used*, so
                  // they don't belong in the authoring surface.
                  <TemplateSummaryCard role="note">
                    <TemplateSummaryIcon aria-hidden>
                      <Icon icon={Bookmark} size={16} />
                    </TemplateSummaryIcon>
                    <TemplateSummaryBody>
                      <TemplateSummaryEyebrow>Template</TemplateSummaryEyebrow>
                      <TemplateSummaryText>
                        Place fields once. Pick which pages they repeat on. Add signers later, when
                        you send.
                      </TemplateSummaryText>
                    </TemplateSummaryBody>
                  </TemplateSummaryCard>
                ) : (
                  <>
                    <div style={ADDDROPDOWN_WRAP_STYLE}>
                      {addSignerOpen ? (
                        <AddSignerDropdown
                          contacts={contacts}
                          existingContactIds={existingContactIds}
                          onPick={handlePickContact}
                          onCreate={handleCreateSigner}
                          onClose={() => setAddSignerOpen(false)}
                        />
                      ) : null}
                    </div>
                    <SignersPanel
                      signers={panelSigners}
                      onRequestAdd={() => setAddSignerOpen((v) => !v)}
                      {...(onRemoveSigner ? { onRemoveSigner } : {})}
                    />
                  </>
                )}
                <FieldsPlacedList
                  fields={fieldsSummary}
                  signers={placedFieldSigners}
                  {...(singleSelectedId !== null ? { selectedFieldId: singleSelectedId } : {})}
                  onSelectField={(id) => {
                    const f = fields.find((x) => x.id === id);
                    if (f) scrollToPage(f.page);
                    setSelectedIds([id]);
                  }}
                  onDuplicateField={duplicateField}
                  onRemoveField={removeField}
                />
              </RightRailScroll>
              {onSaveAsTemplate && !isTemplateAuthoring ? (
                <SaveAsTemplateRow>
                  <SaveAsTemplateButton
                    type="button"
                    onClick={onSaveAsTemplate}
                    disabled={fields.length === 0}
                    aria-label="Save current layout as a template"
                  >
                    <Icon icon={BookmarkPlus} size={14} />
                    Save as template
                  </SaveAsTemplateButton>
                </SaveAsTemplateRow>
              ) : null}
              {isTemplateAuthoring ? (
                <TemplatePrimaryFooter>
                  <TemplatePrimaryStatus>
                    <Icon icon={CheckCircle2} size={14} />
                    {fields.length === 0
                      ? 'Drop a field to enable saving'
                      : `${String(fields.length)} ${fields.length === 1 ? 'field' : 'fields'} across ${String(totalPages)} ${totalPages === 1 ? 'page' : 'pages'}`}
                  </TemplatePrimaryStatus>
                  <TemplatePrimaryButton
                    type="button"
                    onClick={onSaveAsTemplate}
                    disabled={fields.length === 0 || !onSaveAsTemplate}
                  >
                    <Icon icon={Bookmark} size={16} />
                    Save as template
                  </TemplatePrimaryButton>
                </TemplatePrimaryFooter>
              ) : (
                <RightRailFooter>
                  <SendPanelFooter
                    fieldCount={fields.length}
                    /* The seald API rejects envelopes without a signature
                       (`signer_without_signature_field`). Surface the
                       constraint as a UI gate: count placed signatures
                       and let SendPanelFooter disable Send until ≥ 1.
                       Templates flow doesn't go through this branch
                       (uses TemplatePrimaryFooter above) so this only
                       applies to the regular envelope flow. */
                    signatureFieldCount={fields.filter((f) => f.type === 'signature').length}
                    signerCount={signers.length}
                    onSend={onSend}
                    {...(onSaveDraft ? { onSaveDraft } : {})}
                    {...(sendLabel ? { primaryLabel: sendLabel } : {})}
                  />
                </RightRailFooter>
              )}
            </RightRailInner>
          </CollapsibleRail>
        </Workspace>
      </Body>

      <SelectSignersPopover
        // `key` ties the popover's identity to the field being edited so it
        // fully remounts between fields — never carrying stale selection.
        key={signerPopoverFor ?? 'closed'}
        open={signerPopoverFor !== null}
        signers={popoverSigners}
        {...(signerPopoverField ? { initialSelectedIds: signerPopoverField.signerIds } : {})}
        onApply={applySignerSelection}
        onCancel={clearSignerPopover}
      />
      <PlaceOnPagesPopover
        open={pagesPopoverFor !== null}
        currentPage={pagesPopoverField?.page ?? currentPage}
        totalPages={totalPages}
        onApply={applyPagesSelection}
        onCancel={clearPagesPopover}
      />
      {/* Place-on-pages popover for a multi-field selection. Applies the
          chosen mode to every selected field at once. */}
      <PlaceOnPagesPopover
        open={groupPagesPopoverOpen}
        currentPage={groupRect?.page ?? currentPage}
        totalPages={totalPages}
        onApply={applyGroupPagesSelection}
        onCancel={() => setGroupPagesPopoverOpen(false)}
      />
      <RemoveLinkedCopiesDialog
        open={pendingRemove !== null}
        linkedCount={pendingLinkedCount}
        onConfirm={handleRemoveLinkedConfirm}
        onCancel={handleRemoveLinkedCancel}
      />
    </Shell>
  );
});

DocumentPage.displayName = 'DocumentPage';
