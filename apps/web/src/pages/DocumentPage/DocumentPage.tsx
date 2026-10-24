import { forwardRef, useCallback, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  ArrowLeft,
  Bookmark,
  BookmarkPlus,
  CheckCircle2,
  Copy,
  Group as GroupIcon,
  MousePointerClick,
  Pen,
  Send,
  Signature,
  Users,
  Ungroup as UngroupIcon,
  X as XIcon,
} from 'lucide-react';
import { Icon } from '@/components/Icon';
import { AddSignerDropdown } from '@/components/AddSignerDropdown';
import type { AddSignerContact } from '@/components/AddSignerDropdown/AddSignerDropdown.types';
import { AddSignerPanel } from '@/components/AddSignerPanel';
import { Button } from '@/components/Button';
import { CollapsibleRail } from '@/components/CollapsibleRail';
import { DocumentCanvas } from '@/components/DocumentCanvas';
import { FieldPalette } from '@/components/FieldPalette';
import { FieldsPlacedList } from '@/components/FieldsPlacedList';
import { FlowHeader } from '@/components/FlowHeader';
import { Menu, MenuAnchor } from '@/components/Menu';
import type { MenuEntry } from '@/components/Menu';
import { PageThumbRail } from '@/components/PageThumbRail';
import { PageToolbar } from '@/components/PageToolbar';
import { PlaceOnPagesPopover } from '@/components/PlaceOnPagesPopover';
import { PlacedField } from '@/components/PlacedField';
import { ReadinessChip } from '@/components/ReadinessChip';
import { RemoveLinkedCopiesDialog } from '@/components/RemoveLinkedCopiesDialog';
import { SegmentedControl } from '@/components/SegmentedControl';
import { SelectSignersPopover } from '@/components/SelectSignersPopover';
import { SendOptionsDialog } from '@/components/SendOptionsDialog';
import { ShortcutsPopover } from '@/components/ShortcutsPopover';
import { SplitButton } from '@/components/SplitButton';
import { ReminderToggle } from '@/components/ReminderToggle';
import { DateFormatSettings } from '@/components/DateFormatSettings';
import { LocaleSettings } from '@/components/LocaleSettings';
import { SendSettings } from '@/components/SendSettings';
import { SigningOrderEditor } from '@/features/signers/signingOrder';
import { AccessAuthEditor } from '@/features/signers/accessAuth';
import { DEFAULT_SEND_REMINDER_SETTINGS } from '@/features/envelopes/sendReminderSettings';
import { useReminderToggle } from '@/hooks/useReminderToggle';
import { useIsMobileViewport } from '@/hooks/useIsMobileViewport';
import { SendPanelFooter } from '@/components/SendPanelFooter';
import { SignersPanel } from '@/components/SignersPanel';
import {
  DEFAULT_LEFT_WIDTH,
  DEFAULT_RIGHT_WIDTH,
  expandSelectionToGroup,
  hasAnyGrouped,
  isFullyGrouped,
  makeGroupId,
  makeId,
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
import { FIELD_SIZE } from '@/features/documentEditor/model/lib';
import {
  FieldPropertiesPanel,
  hasSettingsPanel,
  type FieldPropertiesChange,
} from '@/features/documentEditor/fieldProperties';
import type { FieldKind } from '@/types/sealdTypes';
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
  ChipsBar,
  Eyebrow,
  GroupBoundary,
  GroupToolbar,
  GroupToolbarButton,
  GroupToolbarLabel,
  HeaderActions,
  HideOnMobile,
  HintPill,
  MarqueeRect,
  BannerSlot,
  MobileBar,
  PageStack,
  PanelSection,
  PreparePanel,
  RailSlot,
  ReminderSlot,
  RightRailFooter,
  RightRailInner,
  RightRailScroll,
  SaveAsTemplateButton,
  SaveAsTemplateRow,
  Shell,
  ShortcutsDock,
  SnapGuide,
  TabsBar,
  TemplatePrimaryButton,
  TemplatePrimaryFooter,
  TemplatePrimaryStatus,
  TemplateSummaryBody,
  TemplateSummaryCard,
  TemplateSummaryEyebrow,
  TemplateSummaryIcon,
  TemplateSummaryText,
  ThumbsSlot,
  ToolbarDock,
  Workspace,
} from './DocumentPage.styles';

const ADDDROPDOWN_WRAP_STYLE: React.CSSProperties = {
  position: 'relative',
  height: 0,
};

const PREPARE_STEPS = [
  { label: 'Upload', state: 'done' },
  { label: 'Prepare', state: 'active' },
  { label: 'Send', state: 'todo' },
] as const;

type MobileTab = 'signers' | 'fields';

interface ReadinessIssue {
  readonly id: string;
  readonly label: string;
  /** One-click fix; absent when the person has to act in the panel. */
  readonly signerId?: string | undefined;
}

function firstName(name: string): string {
  return name.split(' ').filter(Boolean)[0] ?? name;
}

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
    onAddSignersFromContacts,
    youId,
    onCreateSigner,
    onRemoveSigner,
    onSend,
    remindersEnabled,
    onRemindersEnabledChange,
    reminderSettings,
    onReminderSettingsChange,
    signingOrder,
    onSigningOrderChange,
    accessAuth,
    onAccessAuthChange,
    onSaveDraft,
    onBack,
    onSaveAsTemplate,
    banner,
    documentSwitcher,
    documentsPanel,
    sendTotals,
    sendLabel,
    templateMode,
    templateName,
    ...rest
  } = props;

  const isTemplateAuthoring = templateMode === 'authoring';
  // Template editing keeps the three-pane editor (its own flow header sits
  // above); the sender flow gets the Prepare layout.
  const legacy = templateMode !== undefined;
  const isMobile = useIsMobileViewport();
  const reminders = useReminderToggle({
    sourceKey: docId,
    enabled: remindersEnabled,
    onChange: onRemindersEnabledChange,
  });

  // -------------------------- chrome state (rail widths + drawer toggles)
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [leftWidth, setLeftWidth] = useState(DEFAULT_LEFT_WIDTH);
  const [rightWidth, setRightWidth] = useState(DEFAULT_RIGHT_WIDTH);
  const [addSignerOpen, setAddSignerOpen] = useState(false);
  const [mobileTab, setMobileTab] = useState<MobileTab>('signers');
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [issuesOpen, setIssuesOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  // Field kind picked in the palette and waiting for a tap on the page.
  const [armedKind, setArmedKind] = useState<FieldKind | null>(null);
  const chipRef = useRef<HTMLButtonElement>(null);

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
  // On phones the page is scaled down to fit the screen width; the zoom the
  // person picks multiplies that fit.
  const fitZoom =
    isMobile && paperSize.width > 0 && typeof window !== 'undefined'
      ? Math.min(1, (window.innerWidth - 32) / paperSize.width)
      : 1;
  const viewZoom = zoom * fitZoom;

  const clearSignerPopover = useCallback(() => setSignerPopoverFor(null), []);
  const clearPagesPopover = useCallback(() => setPagesPopoverFor(null), []);

  const { pushUndo, undo, hasUndo, redo, hasRedo, clipboardRef, hasClipboard } = useUndoStack({
    fields,
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
    placeKindAt,
    handleCanvasBackgroundClick,
    handleCanvasMouseDown,
  } = useCanvasDnd({
    fields,
    onFieldsChange,
    pushUndo,
    signers,
    canvasRefsRef,
    zoom: viewZoom,
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
    redo,
    hasRedo,
    currentPage,
    selectedIds,
    setSelectedIds,
    requestRemove,
    zoomIn,
    zoomOut,
    resetZoom,
  });

  // ------------------------------------------------------- field settings (WP-08)
  // Flag `fieldMetaV2`: the panel shows for one selected field of a kind with
  // settings. An edit applies to the field and its linked copies, so a
  // field repeated on every page stays consistent.
  const settingsField =
    singleSelectedId !== null ? fields.find((f) => f.id === singleSelectedId) : undefined;
  const applyFieldProperties = useCallback(
    (id: string, patch: FieldPropertiesChange): void => {
      const source = fields.find((f) => f.id === id);
      if (!source) return;
      onFieldsChange(
        fields.map((f) => {
          if (f.id !== id && (source.linkId === undefined || f.linkId !== source.linkId)) return f;
          return {
            ...f,
            ...(patch.required !== undefined ? { required: patch.required } : {}),
            ...('meta' in patch ? { meta: patch.meta } : {}),
          };
        }),
      );
    },
    [fields, onFieldsChange],
  );

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

  const handleAddContacts = useCallback(
    (picked: ReadonlyArray<AddSignerContact>): void => {
      if (onAddSignersFromContacts) {
        onAddSignersFromContacts(picked);
        return;
      }
      picked.forEach((c) => onAddSignerFromContact?.(c));
    },
    [onAddSignerFromContact, onAddSignersFromContacts],
  );

  // ------------------------------------------------------------- readiness
  // The API rejects a signer without a signature field, so each signer needs
  // one. Fields of every document count (`sendTotals` carries them).
  const issues = useMemo<ReadonlyArray<ReadinessIssue>>(() => {
    const list: ReadinessIssue[] = [];
    if (signers.length === 0) {
      list.push({ id: 'no-signers', label: 'Add at least one signer' });
      return list;
    }
    const signedIds = new Set<string>(
      sendTotals?.signerIdsWithSignature ??
        fields.filter((f) => f.type === 'signature').flatMap((f) => f.signerIds),
    );
    for (const s of signers) {
      if (!signedIds.has(s.id)) {
        list.push({
          id: `sig-${s.id}`,
          label: `${firstName(s.name)} has no signature`,
          signerId: s.id,
        });
      }
    }
    return list;
  }, [fields, sendTotals?.signerIdsWithSignature, signers]);

  const placeSignatureFor = useCallback(
    (signerId: string): void => {
      const size = FIELD_SIZE['signature'] ?? { w: 200, h: 54 };
      const onPage = fields.filter((f) => f.page === currentPage && f.type === 'signature').length;
      const x = 48;
      const y = Math.max(
        0,
        Math.min(
          paperSize.height - size.h - 24,
          Math.round(paperSize.height * 0.72) + onPage * (size.h + 12),
        ),
      );
      const added = {
        id: makeId(),
        page: currentPage,
        type: 'signature' as const,
        x,
        y,
        width: size.w,
        height: size.h,
        signerIds: [signerId],
      };
      pushUndo(fields);
      onFieldsChange([...fields, added]);
      setSelectedIds([added.id]);
    },
    [currentPage, fields, onFieldsChange, paperSize.height, pushUndo],
  );

  const issueItems = useMemo<ReadonlyArray<MenuEntry>>(() => {
    const entries: MenuEntry[] = [{ type: 'label', id: 'before', label: 'Before you send' }];
    for (const issue of issues) {
      const signerId = issue.signerId;
      entries.push({
        id: issue.id,
        label: signerId !== undefined ? `${issue.label}. Add one` : issue.label,
        icon: signerId !== undefined ? Signature : Users,
        onSelect: () => {
          if (signerId !== undefined) placeSignatureFor(signerId);
        },
      });
    }
    return entries;
  }, [issues, placeSignatureFor]);

  const onlyMe = youId !== undefined && signers.length === 1 && signers[0]?.id === youId;
  const primaryLabel = onlyMe ? 'Sign now' : 'Send';
  const blocked = issues.length > 0;

  const signerDotsByPage = useMemo(() => {
    const byPage: Record<number, string[]> = {};
    const colorOf = new Map(signers.map((s) => [s.id, s.color]));
    for (const f of fields) {
      for (const id of f.signerIds) {
        const color = colorOf.get(id);
        if (color === undefined) continue;
        const list = byPage[f.page] ?? [];
        if (!list.includes(color)) list.push(color);
        byPage[f.page] = list;
      }
    }
    return byPage;
  }, [fields, signers]);

  const handleActivateKind = useCallback((kind: FieldKind): void => {
    setArmedKind((prev) => (prev === kind ? null : kind));
  }, []);

  const handleSendFromOptions = useCallback((): void => {
    setOptionsOpen(false);
    onSend();
  }, [onSend]);

  // ---------------------------------------------------------- send options
  const settings = reminderSettings ?? DEFAULT_SEND_REMINDER_SETTINGS;
  const accessEditor: ReactNode =
    accessAuth && onAccessAuthChange ? (
      <AccessAuthEditor signers={signers} value={accessAuth} onChange={onAccessAuthChange} />
    ) : null;
  const advanced: ReactNode = (
    <>
      {reminderSettings && onReminderSettingsChange ? (
        <>
          <SendSettings value={reminderSettings} onChange={onReminderSettingsChange} />
          <DateFormatSettings value={reminderSettings} onChange={onReminderSettingsChange} />
          <LocaleSettings value={reminderSettings} onChange={onReminderSettingsChange} />
        </>
      ) : null}
      {accessEditor}
    </>
  );

  // ------------------------------------------------------------------ pieces
  const palette = (
    <FieldPalette
      {...(availableFieldKinds ? { kinds: availableFieldKinds } : {})}
      {...(requiredFieldKinds ? { requiredKinds: requiredFieldKinds } : {})}
      {...(legacy ? {} : { variant: 'tiles' as const, activeKind: armedKind })}
      usageByKind={usageByKind}
      onFieldDragStart={handlePaletteDragStart}
      onFieldDragEnd={handlePaletteDragEnd}
      {...(legacy ? {} : { onFieldActivate: handleActivateKind })}
    />
  );

  const pageToolbar = (
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
      {...(legacy
        ? {}
        : {
            onUndo: undo,
            onRedo: redo,
            undoDisabled: !hasUndo(),
            redoDisabled: !hasRedo(),
            onShowShortcuts: () => setShortcutsOpen((v) => !v),
            shortcutsExpanded: shortcutsOpen,
          })}
    />
  );

  const preparePanel = (
    <PreparePanel aria-label="Signers and fields" $hidden={isMobile && mobileTab !== 'signers'}>
      <PanelSection>
        <SignersPanel
          signers={panelSigners}
          {...(youId !== undefined ? { youId } : {})}
          showOrder={signingOrder?.sequential === true}
          {...(onRemoveSigner ? { onRemoveSigner } : {})}
        />
        {signingOrder && onSigningOrderChange ? (
          <SigningOrderEditor
            signers={signers}
            value={signingOrder}
            onChange={onSigningOrderChange}
          />
        ) : null}
        <AddSignerPanel
          contacts={contacts}
          existingIds={signers.map((s) => s.id)}
          existingEmails={signers.map((s) => s.email)}
          onAddContacts={handleAddContacts}
          onCreate={handleCreateSigner}
        />
      </PanelSection>
      {documentsPanel ?? null}
      <PanelSection>
        <Eyebrow>Fields</Eyebrow>
        {palette}
      </PanelSection>
      {settingsField !== undefined && hasSettingsPanel(settingsField.type) ? (
        <FieldPropertiesPanel
          key={settingsField.id}
          field={settingsField}
          onChange={(patch) => applyFieldProperties(settingsField.id, patch)}
        />
      ) : null}
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
      {onSaveAsTemplate ? (
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
    </PreparePanel>
  );

  // ------------------------------------------------------------------ render
  return (
    <Shell {...rest} ref={ref}>
      {legacy ? null : (
        <FlowHeader
          steps={PREPARE_STEPS}
          {...(onBack ? { onClose: onBack } : {})}
          {...(title ? { title } : {})}
          meta={`${String(totalPages)} ${totalPages === 1 ? 'page' : 'pages'}`}
        >
          <HeaderActions>
            <MenuAnchor>
              <ReadinessChip
                ref={chipRef}
                issues={issues.length}
                expanded={issuesOpen}
                onClick={() => {
                  if (issues.length > 0) setIssuesOpen((v) => !v);
                }}
              />
              <Menu
                open={issuesOpen && issues.length > 0}
                onClose={() => setIssuesOpen(false)}
                items={issueItems}
                anchorRef={chipRef}
                aria-label="Before you send"
              />
            </MenuAnchor>
            {onSaveDraft ? (
              <HideOnMobile>
                <Button variant="ghost" onClick={onSaveDraft}>
                  Save draft
                </Button>
              </HideOnMobile>
            ) : null}
            <HideOnMobile>
              <SplitButton
                label={primaryLabel}
                icon={onlyMe ? Pen : Send}
                disabled={blocked}
                onMain={onSend}
                onOptions={() => setOptionsOpen(true)}
              />
            </HideOnMobile>
          </HeaderActions>
        </FlowHeader>
      )}
      {!legacy && isMobile ? (
        <TabsBar>
          <SegmentedControl<MobileTab>
            aria-label="Prepare"
            block
            value={mobileTab}
            onChange={setMobileTab}
            options={[
              { value: 'signers', label: `Signers (${String(signers.length)})`, icon: Users },
              { value: 'fields', label: 'Fields', icon: Signature },
            ]}
          />
        </TabsBar>
      ) : null}
      <Body>
        <Workspace>
          {legacy ? (
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
              {palette}
            </CollapsibleRail>
          ) : (
            preparePanel
          )}

          <Center $hidden={!legacy && isMobile && mobileTab !== 'fields'}>
            {legacy ? (
              <CenterTop>
                <CenterHeader>
                  <CenterHeaderSide>
                    {onBack ? (
                      <Button variant="ghost" iconLeft={ArrowLeft} size="sm" onClick={onBack}>
                        Back
                      </Button>
                    ) : null}
                  </CenterHeaderSide>
                  {pageToolbar}
                  <CenterHeaderSide aria-hidden />
                </CenterHeader>
              </CenterTop>
            ) : null}

            {documentSwitcher ?? null}
            {banner ? <BannerSlot>{banner}</BannerSlot> : null}
            {armedKind !== null ? (
              <HintPill role="status">
                <MousePointerClick size={16} aria-hidden />
                {isMobile ? 'Tap the page to place' : 'Click the page to place'}
              </HintPill>
            ) : null}

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
                            width: paperSize.width * viewZoom,
                            height: paperSize.height * viewZoom,
                          }}
                        >
                          <CanvasScaleInner
                            style={{
                              width: paperSize.width,
                              height: paperSize.height,
                              transform: `scale(${String(viewZoom)})`,
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
                                onClick={(e) => {
                                  if (armedKind !== null) {
                                    placeKindAt(armedKind, pageNum, e.clientX, e.clientY);
                                    setArmedKind(null);
                                    return;
                                  }
                                  handleCanvasBackgroundClick();
                                }}
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
                                          let base: ReadonlyArray<string>;
                                          if (!additive) base = [field.id];
                                          else if (prev.includes(field.id)) {
                                            base = prev.filter((id) => id !== field.id);
                                          } else base = [...prev, field.id];
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
                                      zoom={viewZoom}
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
              {legacy ? (
                <RailSlot>
                  <PageThumbRail
                    totalPages={totalPages}
                    currentPage={currentPage}
                    onSelectPage={scrollToPage}
                    fieldCountByPage={fieldCountByPage}
                  />
                </RailSlot>
              ) : (
                <ThumbsSlot>
                  <PageThumbRail
                    totalPages={totalPages}
                    currentPage={currentPage}
                    onSelectPage={scrollToPage}
                    fieldCountByPage={fieldCountByPage}
                    signerDotsByPage={signerDotsByPage}
                  />
                </ThumbsSlot>
              )}
            </CanvasScroll>
            {legacy ? null : (
              <>
                <ToolbarDock>{pageToolbar}</ToolbarDock>
                {shortcutsOpen ? (
                  <ShortcutsDock>
                    <ShortcutsPopover open onClose={() => setShortcutsOpen(false)} />
                  </ShortcutsDock>
                ) : null}
              </>
            )}
          </Center>

          {legacy ? (
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
                  {documentsPanel ?? null}
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
                          Place fields once. Pick which pages they repeat on. Add signers later,
                          when you send.
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
                      {signingOrder && onSigningOrderChange ? (
                        <SigningOrderEditor
                          signers={signers}
                          value={signingOrder}
                          onChange={onSigningOrderChange}
                        />
                      ) : null}
                      {accessAuth && onAccessAuthChange ? (
                        <AccessAuthEditor
                          signers={signers}
                          value={accessAuth}
                          onChange={onAccessAuthChange}
                        />
                      ) : null}
                    </>
                  )}
                  {settingsField !== undefined && hasSettingsPanel(settingsField.type) ? (
                    <FieldPropertiesPanel
                      key={settingsField.id}
                      field={settingsField}
                      onChange={(patch) => applyFieldProperties(settingsField.id, patch)}
                    />
                  ) : null}
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
                    <ReminderSlot>
                      {reminderSettings && onReminderSettingsChange ? (
                        <SendSettings
                          value={reminderSettings}
                          onChange={onReminderSettingsChange}
                        />
                      ) : null}
                      {reminderSettings && onReminderSettingsChange ? (
                        <DateFormatSettings
                          value={reminderSettings}
                          onChange={onReminderSettingsChange}
                        />
                      ) : null}
                      {reminderSettings && onReminderSettingsChange ? (
                        <LocaleSettings
                          value={reminderSettings}
                          onChange={onReminderSettingsChange}
                        />
                      ) : null}
                      <ReminderToggle
                        enabled={reminders.enabled}
                        pending={reminders.pending}
                        onChange={reminders.onChange}
                        cadence={reminderSettings?.cadence}
                      />
                    </ReminderSlot>
                    <SendPanelFooter
                      fieldCount={sendTotals?.fieldCount ?? fields.length}
                      /* The seald API rejects envelopes without a signature
                       (`signer_without_signature_field`). Surface the
                       constraint as a UI gate: count placed signatures
                       and let SendPanelFooter disable Send until ≥ 1. */
                      signatureFieldCount={
                        sendTotals?.signatureFieldCount ??
                        fields.filter((f) => f.type === 'signature').length
                      }
                      signerCount={signers.length}
                      onSend={onSend}
                      {...(onSaveDraft ? { onSaveDraft } : {})}
                      {...(sendLabel ? { primaryLabel: sendLabel } : {})}
                    />
                  </RightRailFooter>
                )}
              </RightRailInner>
            </CollapsibleRail>
          ) : null}
        </Workspace>
      </Body>

      {!legacy && isMobile && mobileTab === 'fields' ? (
        <ChipsBar>
          <FieldPalette
            {...(availableFieldKinds ? { kinds: availableFieldKinds } : {})}
            {...(requiredFieldKinds ? { requiredKinds: requiredFieldKinds } : {})}
            variant="chips"
            activeKind={armedKind}
            usageByKind={usageByKind}
            onFieldActivate={handleActivateKind}
          />
        </ChipsBar>
      ) : null}
      {!legacy && isMobile ? (
        <MobileBar>
          <SplitButton
            fullWidth
            label={primaryLabel}
            icon={onlyMe ? Pen : Send}
            disabled={blocked}
            onMain={onSend}
            onOptions={() => setOptionsOpen(true)}
          />
        </MobileBar>
      ) : null}

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
      {legacy ? null : (
        <SendOptionsDialog
          open={optionsOpen}
          onClose={() => setOptionsOpen(false)}
          onSend={handleSendFromOptions}
          sendLabel={onlyMe ? 'Sign now' : 'Send now'}
          recipients={signers.map((s) => ({ id: s.id, name: s.name, color: s.color }))}
          ordered={signingOrder?.sequential === true}
          remindersEnabled={reminders.enabled}
          onRemindersEnabledChange={reminders.onChange}
          cadence={settings.cadence}
          onCadenceChange={(cadence) => onReminderSettingsChange?.({ ...settings, cadence })}
          expiry={settings.expiry}
          onExpiryChange={(expiry) => onReminderSettingsChange?.({ ...settings, expiry })}
          advanced={advanced}
        />
      )}
    </Shell>
  );
});

DocumentPage.displayName = 'DocumentPage';
