import { forwardRef, useCallback, useMemo, useRef, useState } from 'react';
import type { DragEvent, ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { AddSignerDropdown } from '../../components/AddSignerDropdown';
import type { AddSignerContact } from '../../components/AddSignerDropdown/AddSignerDropdown.types';
import { Button } from '../../components/Button';
import { CollapsibleRail } from '../../components/CollapsibleRail';
import { DocumentCanvas } from '../../components/DocumentCanvas';
import { FieldPalette } from '../../components/FieldPalette';
import { FieldsPlacedList } from '../../components/FieldsPlacedList';
import { NavBar } from '../../components/NavBar';
import { PageThumbStrip } from '../../components/PageThumbStrip';
import { PageToolbar } from '../../components/PageToolbar';
import { PlaceOnPagesPopover } from '../../components/PlaceOnPagesPopover';
import type { PlacePagesMode } from '../../components/PlaceOnPagesPopover/PlaceOnPagesPopover.types';
import { PlacedField } from '../../components/PlacedField';
import type { PlacedFieldValue } from '../../components/PlacedField/PlacedField.types';
import { SelectSignersPopover } from '../../components/SelectSignersPopover';
import { SendPanelFooter } from '../../components/SendPanelFooter';
import { SideBar } from '../../components/SideBar';
import { SignersPanel } from '../../components/SignersPanel';
import type { FieldKind } from '../../types/sealdTypes';
import type { DocumentPageProps } from './DocumentPage.types';
import {
  Body,
  CanvasWrap,
  Center,
  CenterHeader,
  CenterHeaderSide,
  RightRailFooter,
  RightRailInner,
  RightRailScroll,
  Shell,
  Workspace,
} from './DocumentPage.styles';

const DEFAULT_LEFT_WIDTH = 240;
const DEFAULT_RIGHT_WIDTH = 320;
const FIELD_WIDTH = 132;
const FIELD_HEIGHT = 54;
const ADDDROPDOWN_WRAP_STYLE: React.CSSProperties = {
  position: 'relative',
  height: 0,
};

function makeId(): string {
  // RFC-style compact id — good enough for DOM keys and internal refs.
  return `f_${Math.random().toString(36).slice(2, 9)}_${Date.now().toString(36)}`;
}

/**
 * Resolve the target pages for a duplicate-to-pages action. Skips the source
 * page so the caller can append new field clones without producing a duplicate
 * on the originating page.
 */
function resolveTargetPages(
  mode: PlacePagesMode,
  sourcePage: number,
  totalPages: number,
  customPages?: ReadonlyArray<number>,
): ReadonlyArray<number> {
  const all = Array.from({ length: totalPages }, (_v, i) => i + 1);
  switch (mode) {
    case 'this':
      return [];
    case 'all':
      return all.filter((p) => p !== sourcePage);
    case 'allButLast':
      return all.filter((p) => p !== sourcePage && p !== totalPages);
    case 'last':
      return totalPages === sourcePage ? [] : [totalPages];
    case 'custom':
      return (customPages ?? []).filter((p) => p !== sourcePage && p >= 1 && p <= totalPages);
    default:
      return [];
  }
}

export const DocumentPage = forwardRef<HTMLDivElement, DocumentPageProps>((props, ref) => {
  const {
    totalPages,
    title,
    docId,
    initialPage = 1,
    fields,
    onFieldsChange,
    availableFieldKinds,
    requiredFieldKinds,
    signers,
    contacts = [],
    onAddSignerFromContact,
    onCreateSigner,
    onSend,
    onSaveDraft,
    onBack,
    user,
    onLogoClick,
    onSelectNavItem,
    activeNavId = 'documents',
    ...rest
  } = props;

  const [currentPage, setCurrentPage] = useState<number>(() =>
    Math.min(Math.max(initialPage, 1), totalPages),
  );
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [leftWidth, setLeftWidth] = useState(DEFAULT_LEFT_WIDTH);
  const [rightWidth, setRightWidth] = useState(DEFAULT_RIGHT_WIDTH);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [signerPopoverFor, setSignerPopoverFor] = useState<string | null>(null);
  const [pagesPopoverFor, setPagesPopoverFor] = useState<string | null>(null);
  const [addSignerOpen, setAddSignerOpen] = useState(false);
  const dragKindRef = useRef<FieldKind | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);

  const placedFieldSigners = useMemo(
    () => signers.map((s) => ({ id: s.id, name: s.name, color: s.color })),
    [signers],
  );
  const panelSigners = useMemo(
    () => signers.map((s) => ({ id: s.id, name: s.name, email: s.email, color: s.color })),
    [signers],
  );
  const popoverSigners = useMemo(
    () => signers.map((s) => ({ id: s.id, name: s.name, color: s.color })),
    [signers],
  );
  const fieldsSummary = useMemo(
    () =>
      fields.map((f) => ({
        id: f.id,
        type: f.type,
        page: f.page,
        signerIds: f.signerIds,
      })),
    [fields],
  );
  const pagesWithFields = useMemo(() => Array.from(new Set(fields.map((f) => f.page))), [fields]);
  const existingContactIds = useMemo(
    () => signers.map((s) => s.id).filter((id) => contacts.some((c) => c.id === id)),
    [signers, contacts],
  );

  const signerPopoverField = useMemo(
    () => (signerPopoverFor ? fields.find((f) => f.id === signerPopoverFor) : undefined),
    [signerPopoverFor, fields],
  );
  const pagesPopoverField = useMemo(
    () => (pagesPopoverFor ? fields.find((f) => f.id === pagesPopoverFor) : undefined),
    [pagesPopoverFor, fields],
  );

  // -------------------------------------------------------------------- DnD
  const handlePaletteDragStart = useCallback((kind: FieldKind, e: DragEvent<HTMLElement>): void => {
    dragKindRef.current = kind;
    try {
      e.dataTransfer.setData('text/plain', kind);
      e.dataTransfer.effectAllowed = 'copy';
    } catch {
      // Some browsers disallow dataTransfer mutation in tests — the ref is
      // the authoritative source.
    }
  }, []);

  const handlePaletteDragEnd = useCallback((): void => {
    dragKindRef.current = null;
  }, []);

  const handleCanvasDragOver = useCallback((e: DragEvent<HTMLDivElement>): void => {
    if (!dragKindRef.current) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleCanvasDrop = useCallback(
    (e: DragEvent<HTMLDivElement>): void => {
      const kind = dragKindRef.current;
      if (!kind) return;
      e.preventDefault();
      const rect = canvasRef.current?.getBoundingClientRect();
      const x = Math.max(0, Math.round(e.clientX - (rect?.left ?? 0) - FIELD_WIDTH / 2));
      const y = Math.max(0, Math.round(e.clientY - (rect?.top ?? 0) - FIELD_HEIGHT / 2));
      const firstSignerId = signers[0]?.id;
      const nextField: PlacedFieldValue = {
        id: makeId(),
        page: currentPage,
        type: kind,
        x,
        y,
        signerIds: firstSignerId ? [firstSignerId] : [],
      };
      onFieldsChange([...fields, nextField]);
      setSelectedFieldId(nextField.id);
      dragKindRef.current = null;
    },
    [currentPage, fields, onFieldsChange, signers],
  );

  // --------------------------------------------------------------- mutations
  const moveField = useCallback(
    (id: string, x: number, y: number): void => {
      onFieldsChange(fields.map((f) => (f.id === id ? { ...f, x, y } : f)));
    },
    [fields, onFieldsChange],
  );

  const removeField = useCallback(
    (id: string): void => {
      onFieldsChange(fields.filter((f) => f.id !== id));
      if (selectedFieldId === id) setSelectedFieldId(null);
      if (signerPopoverFor === id) setSignerPopoverFor(null);
      if (pagesPopoverFor === id) setPagesPopoverFor(null);
    },
    [fields, onFieldsChange, pagesPopoverFor, selectedFieldId, signerPopoverFor],
  );

  const applySignerSelection = useCallback(
    (ids: ReadonlyArray<string>): void => {
      if (!signerPopoverFor) return;
      onFieldsChange(fields.map((f) => (f.id === signerPopoverFor ? { ...f, signerIds: ids } : f)));
      setSignerPopoverFor(null);
    },
    [fields, onFieldsChange, signerPopoverFor],
  );

  const applyPagesSelection = useCallback(
    (mode: PlacePagesMode, customPages?: ReadonlyArray<number>): void => {
      const source = pagesPopoverField;
      if (!source) {
        setPagesPopoverFor(null);
        return;
      }
      const targets = resolveTargetPages(mode, source.page, totalPages, customPages);
      if (targets.length === 0) {
        setPagesPopoverFor(null);
        return;
      }
      const clones: ReadonlyArray<PlacedFieldValue> = targets.map((page) => ({
        id: makeId(),
        page,
        type: source.type,
        x: source.x,
        y: source.y,
        signerIds: source.signerIds,
      }));
      onFieldsChange([...fields, ...clones]);
      setPagesPopoverFor(null);
    },
    [fields, onFieldsChange, pagesPopoverField, totalPages],
  );

  // ----------------------------------------------------------------- signer
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

  // ------------------------------------------------------------------ chrome
  const logoNode: ReactNode = onLogoClick ? (
    <button
      type="button"
      onClick={onLogoClick}
      aria-label="Go home"
      style={{
        background: 'transparent',
        border: 'none',
        padding: 0,
        cursor: 'pointer',
        font: 'inherit',
        color: 'inherit',
      }}
    >
      Sealed
    </button>
  ) : undefined;

  // ------------------------------------------------------------------ render
  return (
    <Shell {...rest} ref={ref}>
      <NavBar
        activeItemId={activeNavId}
        onSelectItem={onSelectNavItem}
        {...(user ? { user } : {})}
        {...(logoNode ? { logo: logoNode } : {})}
      />
      <Body>
        <SideBar
          activeItemId="drafts"
          primaryAction={{ label: 'New document', onClick: () => {} }}
        />
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
              onFieldDragStart={handlePaletteDragStart}
              onFieldDragEnd={handlePaletteDragEnd}
            />
          </CollapsibleRail>

          <Center>
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
                onPrevPage={() => setCurrentPage((p) => Math.max(1, p - 1))}
                onNextPage={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              />
              <CenterHeaderSide aria-hidden />
            </CenterHeader>

            <CanvasWrap>
              <DocumentCanvas
                ref={canvasRef}
                currentPage={currentPage}
                totalPages={totalPages}
                {...(title ? { title } : {})}
                {...(docId ? { docId } : {})}
                onDragOver={handleCanvasDragOver}
                onDrop={handleCanvasDrop}
              >
                {fields
                  .filter((f) => f.page === currentPage)
                  .map((field) => (
                    <PlacedField
                      key={field.id}
                      field={field}
                      signers={placedFieldSigners}
                      selected={selectedFieldId === field.id}
                      {...((canvasRef as { current: HTMLDivElement | null })
                        ? { canvasRef: canvasRef as React.RefObject<HTMLElement> }
                        : {})}
                      onSelect={(e) => {
                        e.stopPropagation();
                        setSelectedFieldId(field.id);
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
                      onMove={moveField}
                    />
                  ))}
              </DocumentCanvas>
            </CanvasWrap>

            <PageThumbStrip
              totalPages={totalPages}
              currentPage={currentPage}
              onSelectPage={setCurrentPage}
              pagesWithFields={pagesWithFields}
            />
          </Center>

          <CollapsibleRail
            side="right"
            title="Ready to send"
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
                />
                <FieldsPlacedList
                  fields={fieldsSummary}
                  signers={placedFieldSigners}
                  {...(selectedFieldId ? { selectedFieldId } : {})}
                  onSelectField={(id) => {
                    const f = fields.find((x) => x.id === id);
                    if (f) setCurrentPage(f.page);
                    setSelectedFieldId(id);
                  }}
                />
              </RightRailScroll>
              <RightRailFooter>
                <SendPanelFooter
                  fieldCount={fields.length}
                  signerCount={signers.length}
                  onSend={onSend}
                  {...(onSaveDraft ? { onSaveDraft } : {})}
                />
              </RightRailFooter>
            </RightRailInner>
          </CollapsibleRail>
        </Workspace>
      </Body>

      <SelectSignersPopover
        open={signerPopoverFor !== null}
        signers={popoverSigners}
        {...(signerPopoverField ? { initialSelectedIds: signerPopoverField.signerIds } : {})}
        onApply={applySignerSelection}
        onCancel={() => setSignerPopoverFor(null)}
      />
      <PlaceOnPagesPopover
        open={pagesPopoverFor !== null}
        currentPage={pagesPopoverField?.page ?? currentPage}
        totalPages={totalPages}
        onApply={applyPagesSelection}
        onCancel={() => setPagesPopoverFor(null)}
      />
    </Shell>
  );
});

DocumentPage.displayName = 'DocumentPage';
