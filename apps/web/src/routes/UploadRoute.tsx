import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { UploadPage } from '../pages/UploadPage';
import { CreateSignatureRequestDialog } from '../components/CreateSignatureRequestDialog';
import type { AddSignerContact } from '../components/AddSignerDropdown/AddSignerDropdown.types';
import type { PlacedFieldValue } from '../components/PlacedField/PlacedField.types';
import type { FieldKind } from '../features/envelopes';
import { useAppState } from '../providers/AppStateProvider';
import { useAuth } from '../providers/AuthProvider';
import { usePdfDocument } from '../lib/pdf';
import { NAV_ITEMS } from '../layout/navItems';
import {
  findTemplateById,
  resolveTemplateFields,
  type ResolvedField,
  type TemplateFieldType,
  type TemplateSummary,
} from '../features/templates';

const TEMPLATE_QUERY_PARAM = 'template';

// Template field kinds use the singular `initial`; `PlacedFieldValue.type`
// uses the canonical `FieldKind` ('initials'). Keep the mapping local to the
// upload route — templates are otherwise an isolated authoring concept.
const TEMPLATE_TO_FIELD_KIND: Record<TemplateFieldType, FieldKind> = {
  signature: 'signature',
  initial: 'initials',
  date: 'date',
  text: 'text',
  checkbox: 'checkbox',
};

function templateFieldsToPlaced(
  resolved: ReadonlyArray<ResolvedField>,
): ReadonlyArray<PlacedFieldValue> {
  return resolved.map((rf) => ({
    id: rf.id,
    page: rf.page,
    type: TEMPLATE_TO_FIELD_KIND[rf.type],
    x: rf.x,
    y: rf.y,
    // No signer assigned yet — sender will pick signers in the dialog and
    // assign them to fields once the editor opens. Empty array keeps the
    // PlacedFieldValue contract.
    signerIds: [],
  }));
}

/**
 * Route wrapper around `UploadPage` that gates document creation on the
 * "add signers" dialog — the user must pick at least one signer before the
 * new document is created and routed to the editor.
 *
 * If the URL carries `?template=<id>` (set by `/templates/:id/use`'s
 * "Continue with this template" CTA), the route looks up the template,
 * shows a "Using template: <title>" banner, and after the uploaded PDF is
 * parsed projects the template's field layout onto the new document via
 * `resolveTemplateFields`. The pre-populated fields are written into the
 * draft so the editor renders them immediately. "Clear template" strips
 * the query arg and resets the pending field state.
 */
export function UploadRoute() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, contacts, createDocument, addContact, updateDocument } = useAppState();
  const { guest, exitGuestMode, signOut } = useAuth();
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedSigners, setSelectedSigners] = useState<ReadonlyArray<AddSignerContact>>([]);
  const { numPages } = usePdfDocument(pdfFile);

  // Resolve the template from the query arg (local lookup today;
  // TODO(api): swap for `GET /templates/:id` once the templates service
  // ships). `templateMissing` is true when a `?template=` arg is present
  // but doesn't match any known id — we surface a warning banner so the
  // sender knows the editor will start empty.
  const templateIdFromQuery = searchParams.get(TEMPLATE_QUERY_PARAM);
  const template: TemplateSummary | null = useMemo(() => {
    if (!templateIdFromQuery) return null;
    return findTemplateById(templateIdFromQuery) ?? null;
  }, [templateIdFromQuery]);
  const templateMissing = templateIdFromQuery !== null && template === null;

  // Open the signer-picker once the PDF has been parsed (numPages > 0).
  // In the meantime UploadPage shows the "Analyzing" loader. If parsing
  // fails numPages stays 0 forever — a small defensive timeout opens
  // the dialog anyway so the user is never stuck.
  useEffect(() => {
    if (!pdfFile) return undefined;
    if (numPages > 0) {
      setDialogOpen(true);
      return undefined;
    }
    const t = window.setTimeout(() => setDialogOpen(true), 3000);
    return () => window.clearTimeout(t);
  }, [pdfFile, numPages]);

  const handleFileSelected = useCallback((file: File) => {
    setPdfFile(file);
    setSelectedSigners([]);
    // Hold the signer-picker dialog until the PDF has been parsed so
    // the UploadPage can show its "Analyzing your document" loader in
    // the intervening window.
    setDialogOpen(false);
  }, []);

  const handleAddFromContact = useCallback((contact: AddSignerContact) => {
    setSelectedSigners((prev) =>
      prev.some((s) => s.id === contact.id) ? prev : [...prev, contact],
    );
  }, []);

  const handleCreateContact = useCallback(
    (name: string, email: string) => {
      addContact(name, email)
        .then((created) => {
          setSelectedSigners((prev) => [...prev, created]);
        })
        .catch(() => {
          // Creation errors surface in the console for now; keeping the
          // dialog open lets the user retry without losing their other picks.
        });
    },
    [addContact],
  );

  const handleRemoveSelected = useCallback((id: string) => {
    setSelectedSigners((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const handleConfirm = useCallback(() => {
    if (!pdfFile || selectedSigners.length === 0) return;
    const resolvedPages = Math.max(1, numPages);
    const id = createDocument(pdfFile, resolvedPages);

    // Pre-populate fields when the sender came from a template. Pages
    // that don't exist on the new PDF (e.g. layout asks for `page: 5`
    // on a 3-page upload) are filtered out by `resolveTemplateFields`;
    // we surface a console warning so the dropoff is observable.
    let pendingFields: ReadonlyArray<PlacedFieldValue> = [];
    if (template) {
      const resolved = resolveTemplateFields(template.fields, resolvedPages);
      pendingFields = templateFieldsToPlaced(resolved);
      if (resolvedPages < template.pages) {
        // Use console.warn so the SPA's debug build flags the gap. The
        // banner already informs the user; this is for engineering.
        // eslint-disable-next-line no-console
        console.warn(
          `[templates] Uploaded PDF has ${resolvedPages} pages but template "${template.name}" was authored on ${template.pages}; some fields may have been skipped.`,
        );
      }
      // TODO(api): POST /templates/:id/use — bumps `uses_count` server-side
      // once the templates service lands. Today we just log; the local
      // `TEMPLATES` array is read-only seed data.
      // eslint-disable-next-line no-console
      console.info(`[templates] uses_count++ for ${template.id}`);
    }

    updateDocument(id, {
      signers: selectedSigners.map((s) => ({
        id: s.id,
        name: s.name,
        email: s.email,
        color: s.color,
      })),
      ...(pendingFields.length > 0 ? { fields: pendingFields } : {}),
    });
    setDialogOpen(false);
    setPdfFile(null);
    setSelectedSigners([]);
    navigate(`/document/${id}`);
  }, [pdfFile, selectedSigners, createDocument, updateDocument, numPages, navigate, template]);

  const handleCancelDialog = useCallback(() => {
    setDialogOpen(false);
    setPdfFile(null);
    setSelectedSigners([]);
  }, []);

  const handleClearTemplate = useCallback((): void => {
    // Strip the `template` arg only — preserve any other query params the
    // entry might one day carry. Also drop the in-progress file so the
    // sender starts from a clean slate; otherwise the dialog would still
    // be queued to open with no template-derived fields.
    const next = new URLSearchParams(searchParams);
    next.delete(TEMPLATE_QUERY_PARAM);
    setSearchParams(next, { replace: true });
    setPdfFile(null);
    setDialogOpen(false);
    setSelectedSigners([]);
  }, [searchParams, setSearchParams]);

  const handleSelectNavItem = useCallback(
    (id: string): void => {
      const item = NAV_ITEMS.find((n) => n.id === id);
      if (item) {
        navigate(item.path);
      }
    },
    [navigate],
  );

  const handleAuthCta = useCallback(
    (path: string): void => {
      exitGuestMode();
      navigate(path);
    },
    [exitGuestMode, navigate],
  );

  const handleSignOut = useCallback((): void => {
    signOut()
      .catch(() => {
        /* soft-fail: still route to signin */
      })
      .finally(() => navigate('/signin', { replace: true }));
  }, [signOut, navigate]);

  const navMode = !user && guest ? 'guest' : 'authed';

  const bannerTitle = template
    ? template.name
    : templateMissing
      ? 'Template not found — starting empty'
      : undefined;
  const bannerTone: 'info' | 'warning' = templateMissing ? 'warning' : 'info';

  return (
    <>
      <UploadPage
        user={user ?? undefined}
        onFileSelected={handleFileSelected}
        activeNavId="sign"
        onSelectNavItem={handleSelectNavItem}
        navMode={navMode}
        onSignIn={() => handleAuthCta('/signin')}
        onSignUp={() => handleAuthCta('/signup')}
        onSignOut={handleSignOut}
        status={pdfFile && !dialogOpen ? 'analyzing' : 'idle'}
        {...(pdfFile ? { analyzingFileName: pdfFile.name } : {})}
        {...(bannerTitle ? { templateBannerTitle: bannerTitle } : {})}
        templateBannerTone={bannerTone}
        {...(template || templateMissing ? { onClearTemplate: handleClearTemplate } : {})}
      />
      <CreateSignatureRequestDialog
        open={dialogOpen}
        signers={selectedSigners}
        contacts={contacts}
        onAddFromContact={handleAddFromContact}
        onCreateContact={handleCreateContact}
        onRemoveSigner={handleRemoveSelected}
        onApply={handleConfirm}
        onCancel={handleCancelDialog}
      />
    </>
  );
}
