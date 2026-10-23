import { useCallback, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  ESIGN_DISCLOSURE_VERSION,
  RECORD_ACCESS_ATTESTATION,
  isFeatureEnabled,
  maskEmail,
} from 'shared';
import { Ban, User, XCircle } from 'lucide-react';
import { Banner } from '@/components/Banner';
import { DocumentPageCanvas } from '@/components/DocumentPageCanvas';
import { FieldInputDrawer } from '@/components/FieldInputDrawer';
import type { FieldInputKind } from '@/components/FieldInputDrawer';
import { SignatureCapture } from '@/components/SignatureCapture';
import { SignatureMark } from '@/components/SignatureMark';
import { SignerField } from '@/components/SignerField';
import type { SignerFieldKind } from '@/components/SignerField';
import type { MenuEntry } from '@/components/Menu';
import { useDownloadPdf } from '@/features/downloadPdf';
import {
  getPdfSignedUrl,
  SigningSessionProvider,
  useSigningSession,
  type SignMeField,
} from '@/features/signing';
import { AccessCodeForm, isAccessCodeRequiredError } from '@/features/signing/accessCode';
import { ConfirmSheet } from '@/features/signing/ui/ConfirmSheet';
import { ConsentBar } from '@/features/signing/ui/ConsentBar';
import { DeclineSheet } from '@/features/signing/ui/DeclineSheet';
import { FinishSheet } from '@/features/signing/ui/FinishSheet';
import { SignBar } from '@/features/signing/ui/SignBar';
import { SignHeader } from '@/features/signing/ui/SignHeader';
import { isReadOnly, usesMetaDrawer } from '@/features/signingFill/inputs/fieldDisplay';
import { MetaFieldDrawer } from '@/features/signingFill/inputs/MetaFieldDrawer';
import type { MetaInputKind } from '@/features/signingFill/inputs/MetaFieldDrawer';
import {
  DocumentRail,
  displayDate,
  fieldIsFilled,
  fieldLabel,
  fieldValue,
  isAutoField,
  nextTodoField,
  summarizeDocuments,
  toUiKind,
  useFieldsByPage,
  useSignerAutofill,
  useSigningFillController,
  useSigningPdfSource,
} from '@/features/signingFill';
import { denormalizeCoord, useCanvasHeight, useCanvasWidth } from '@/lib/canvas-coords';
import { useT } from '@/lib/i18n';
import { usePdfDocument } from '@/lib/pdf';
import { ErrorSlot, Page, Pages, Stage } from './SigningFillPage.styles';

const DEFAULT_FIELD_W: Record<SignerFieldKind, number> = {
  signature: 200,
  initials: 80,
  name: 200,
  date: 140,
  text: 240,
  email: 240,
  checkbox: 24,
  number: 140,
  radio: 200,
  dropdown: 200,
};
const DEFAULT_FIELD_H: Record<SignerFieldKind, number> = {
  signature: 54,
  initials: 54,
  name: 36,
  date: 36,
  text: 36,
  email: 36,
  checkbox: 24,
  number: 36,
  radio: 72,
  dropdown: 36,
};

/**
 * Per-page reading order: required first, then top to bottom, then left to
 * right, so the DOM (and Tab) order is what a signer reads.
 */
function compareFieldsForReadingOrder(a: SignMeField, b: SignMeField): number {
  if (a.required !== b.required) return a.required ? -1 : 1;
  if (a.y !== b.y) return a.y - b.y;
  return a.x - b.x;
}

type Dialog = 'decline' | 'notMe' | 'withdraw' | 'finish' | null;

interface ApiErrorLike extends Error {
  status?: number;
}

function Content() {
  const params = useParams<{ readonly envelopeId: string }>();
  const envelopeId = params.envelopeId ?? '';
  const t = useT();
  const navigate = useNavigate();
  const location = useLocation();

  const session = useSigningSession();
  const { envelope, signer, fields: allFields, documents, allRequiredFilled } = session;

  // Multi-document envelopes (WP-04). Off, or one document: everything below
  // is the single-document view, untouched.
  const multiDoc = isFeatureEnabled('multiDocumentEnvelopes') && documents.length > 1;
  const [requestedDocumentId, setRequestedDocumentId] = useState<string | null>(null);
  const activeDocument = multiDoc
    ? (documents.find((d) => d.id === requestedDocumentId) ?? documents[0])
    : undefined;
  // `fields` is what the canvas shows: the active document's fields. The
  // progress counts and "Next" keep using every document.
  const fields = useMemo(
    () =>
      activeDocument === undefined
        ? allFields
        : allFields.filter((f) => f.document_id === activeDocument.id),
    [allFields, activeDocument],
  );

  // Consent: asked in the bar until the signer presses Start. A fresh link
  // (flagged by the entry page) asks again even when terms were accepted
  // in an earlier session; a refresh after Start does not.
  const [started, setStarted] = useState(false);
  const freshLink = (location.state as { readonly fresh?: boolean } | null)?.fresh === true;
  const needsConsent = !started && signer !== null && (signer.tc_accepted_at === null || freshLink);
  const [agreed, setAgreed] = useState(false);
  const [startBusy, setStartBusy] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  useSignerAutofill(!needsConsent);

  const totalPages = activeDocument?.original_pages ?? envelope?.original_pages ?? 1;
  const pdfSrc = useSigningPdfSource(envelope?.id, activeDocument?.id);
  const { doc: signingPdfDoc } = usePdfDocument(pdfSrc);
  const canvasWidth = useCanvasWidth();
  const canvasHeight = useCanvasHeight(signingPdfDoc);
  const { fieldsByPage } = useFieldsByPage(fields);

  const {
    textDrawer,
    sigDrawer,
    error,
    closeTextDrawer,
    closeSigDrawer,
    handleFieldClick,
    goTo,
    handleTextApply,
    handleMetaApply,
    drawerError,
    drawerBusy,
    handleSignatureApply,
  } = useSigningFillController({
    envelopeId,
    activeDocumentId: activeDocument?.id,
    onActiveDocumentChange: multiDoc ? setRequestedDocumentId : undefined,
    locked: needsConsent,
  });

  const { download: downloadPdf, busy: downloadBusy } = useDownloadPdf({
    getUrl: () =>
      activeDocument === undefined
        ? getPdfSignedUrl()
        : getPdfSignedUrl(undefined, activeDocument.id),
    filename: activeDocument?.title ?? envelope?.title ?? 'document',
  });

  // Progress counts the required fields the signer fills by hand; their
  // name and the date are put in for them, and optional fields never block.
  const handFields = useMemo(
    () => allFields.filter((f) => f.required && !isAutoField(f)),
    [allFields],
  );
  const handDone = handFields.filter(fieldIsFilled).length;
  const optionalLeft = allFields.filter((f) => !f.required && !fieldIsFilled(f)).length;
  const nowField = useMemo(() => nextTodoField(allFields, documents), [allFields, documents]);

  const [dialog, setDialog] = useState<Dialog>(null);
  const [dialogBusy, setDialogBusy] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [needsActionCode, setNeedsActionCode] = useState(false);
  const [intentRecorded, setIntentRecorded] = useState(false);

  const closeDialog = useCallback(() => {
    if (dialogBusy) return;
    setDialog(null);
    setDialogError(null);
  }, [dialogBusy]);

  const backToEntry = useCallback(() => {
    navigate(`/sign/${envelopeId}`, { replace: true });
  }, [envelopeId, navigate]);

  const handleStart = useCallback(async () => {
    if (!agreed || !signer) return;
    setStartBusy(true);
    setStartError(null);
    try {
      if (!signer.tc_accepted_at) {
        await session.acceptTerms();
      }
      // The ESIGN disclosure acknowledgement is recorded as its own audit
      // event each time the signer starts from a fresh session. The backend
      // appends it idempotently, so re-sending is harmless.
      await session.acknowledgeEsignDisclosure(ESIGN_DISCLOSURE_VERSION);
      setStarted(true);
      navigate(location.pathname, { replace: true, state: null });
    } catch (err) {
      const e = err as ApiErrorLike;
      if (e.status === 401 || e.status === 410) {
        backToEntry();
        return;
      }
      setStartError(e.message || t('signing.sign.consent.errorAccept'));
    } finally {
      setStartBusy(false);
    }
  }, [agreed, backToEntry, location.pathname, navigate, session, signer, t]);

  /** Runs one terminal action from a dialog and goes to its page. */
  const runTerminal = useCallback(
    async (action: () => Promise<void>, to: 'declined' | 'done', fallback: string) => {
      setDialogBusy(true);
      setDialogError(null);
      try {
        await action();
        navigate(`/sign/${envelopeId}/${to}`, { replace: true });
      } catch (err) {
        const e = err as ApiErrorLike;
        setDialogBusy(false);
        if (e.status === 401 || e.status === 410) {
          backToEntry();
          return;
        }
        setDialogError(e.message || fallback);
      }
    },
    [backToEntry, envelopeId, navigate],
  );

  const handleSign = useCallback(async () => {
    setDialogBusy(true);
    setDialogError(null);
    try {
      // Intent-to-sign lands in the audit chain BEFORE the signed event, and
      // a failed intent call stops the submit.
      if (!intentRecorded) {
        await session.confirmIntentToSign();
        setIntentRecorded(true);
      }
      await session.submit();
      navigate(`/sign/${envelopeId}/done`, { replace: true });
    } catch (err) {
      setDialogBusy(false);
      if (isAccessCodeRequiredError(err)) {
        setNeedsActionCode(true);
        return;
      }
      const e = err as ApiErrorLike;
      if (e.status === 401 || e.status === 410) {
        backToEntry();
        return;
      }
      setDialogError(e.message || t('signing.sign.finish.errorSubmit'));
    }
  }, [backToEntry, envelopeId, intentRecorded, navigate, session, t]);

  const handleSubmitWithCode = useCallback(
    async (code: string) => {
      await session.submit(code);
      navigate(`/sign/${envelopeId}/done`, { replace: true });
    },
    [envelopeId, navigate, session],
  );

  const menu = useMemo<ReadonlyArray<MenuEntry>>(
    () => [
      {
        id: 'decline',
        label: t('signing.sign.menu.decline'),
        icon: XCircle,
        onSelect: () => setDialog('decline'),
      },
      {
        id: 'not-me',
        label: t('signing.sign.menu.notMe'),
        icon: User,
        onSelect: () => setDialog('notMe'),
      },
      { type: 'separator', id: 'sep' },
      {
        id: 'withdraw',
        label: t('signing.sign.menu.withdraw'),
        icon: Ban,
        danger: true,
        onSelect: () => setDialog('withdraw'),
      },
    ],
    [t],
  );

  if (!envelope || !signer) return null;

  const railItems = multiDoc ? summarizeDocuments(documents, allFields, fieldIsFilled) : [];
  const signatureField = allFields.find(
    (f) => f.kind === 'signature' && fieldIsFilled(f) && f.value_text,
  );
  const sigValue = signatureField?.value_text ?? signer.name;
  const preview = /^(blob:|data:|https?:\/\/)/.test(sigValue) ? (
    <img src={sigValue} alt={t('signing.sign.finish.signatureAlt')} />
  ) : (
    <SignatureMark name={sigValue} size={44} />
  );

  const tagFor = (kind: SignerFieldKind): string => {
    if (kind === 'signature') return t('signing.sign.tag.sign');
    if (kind === 'initials') return t('signing.sign.tag.initial');
    return t('signing.sign.tag.fill');
  };

  return (
    <Page>
      <SignHeader
        title={envelope.title}
        senderName={envelope.sender_name}
        onDownload={() => {
          downloadPdf().catch(() => {
            /* surfaced by the hook; swallowed at the click boundary */
          });
        }}
        downloadBusy={downloadBusy}
        menu={menu}
      />

      {activeDocument !== undefined ? (
        <DocumentRail
          documents={railItems}
          activeId={activeDocument.id}
          onSelect={setRequestedDocumentId}
        />
      ) : null}

      <Stage>
        {error ? (
          <ErrorSlot>
            <Banner tone="error">{error}</Banner>
          </ErrorSlot>
        ) : null}

        {needsConsent ? (
          <ConsentBar
            senderName={envelope.sender_name}
            fieldCount={handFields.length}
            agreed={agreed}
            onAgreedChange={setAgreed}
            onStart={() => {
              handleStart().catch(() => {
                /* handled inside */
              });
            }}
            busy={startBusy}
            disclosureHref="/legal/esign-disclosure"
            attestation={RECORD_ACCESS_ATTESTATION}
            error={startError}
          />
        ) : null}

        <Pages>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => {
            const pageFields = fieldsByPage.get(p) ?? [];
            return (
              <DocumentPageCanvas
                key={p}
                pageNum={p}
                totalPages={totalPages}
                title={activeDocument?.title ?? envelope.title}
                pdfSrc={pdfSrc ?? undefined}
                width={canvasWidth}
              >
                {[...pageFields].sort(compareFieldsForReadingOrder).map((f: SignMeField) => {
                  const uiKind = toUiKind(f);
                  const baseLabel = fieldLabel(f, uiKind, t);
                  const label = isReadOnly(f)
                    ? t('signing.fill.readOnly', { label: baseLabel })
                    : baseLabel;
                  const width = f.width
                    ? denormalizeCoord(f.width, canvasWidth)
                    : DEFAULT_FIELD_W[uiKind];
                  const height = f.height
                    ? denormalizeCoord(f.height, canvasHeight)
                    : DEFAULT_FIELD_H[uiKind];
                  const value = fieldValue(f);
                  const isNow = !needsConsent && nowField?.id === f.id;
                  return (
                    <SignerField
                      key={f.id}
                      kind={uiKind}
                      label={label}
                      required={f.required}
                      active={isNow}
                      filled={fieldIsFilled(f)}
                      value={
                        uiKind === 'date' && typeof value === 'string' ? displayDate(value) : value
                      }
                      auto={isAutoField(f)}
                      autoLabel={t('signing.sign.tag.auto')}
                      tag={isNow ? tagFor(uiKind) : undefined}
                      x={denormalizeCoord(f.x, canvasWidth)}
                      y={denormalizeCoord(f.y, canvasHeight)}
                      w={width}
                      h={height}
                      onActivate={() => {
                        handleFieldClick(f).catch(() => {
                          /* surfaced via error state */
                        });
                      }}
                    />
                  );
                })}
              </DocumentPageCanvas>
            );
          })}
        </Pages>
      </Stage>

      {!needsConsent ? (
        <SignBar
          done={handDone}
          total={handFields.length}
          optionalLeft={optionalLeft}
          ready={allRequiredFilled}
          onNext={() => {
            if (nowField) goTo(nowField);
          }}
          onFinish={() => setDialog('finish')}
        />
      ) : null}

      {textDrawer !== null && usesMetaDrawer(textDrawer.field) ? (
        <MetaFieldDrawer
          key={textDrawer.field.id}
          open
          label={fieldLabel(textDrawer.field, toUiKind(textDrawer.field), t)}
          kind={textDrawer.kind as MetaInputKind}
          meta={textDrawer.field.meta}
          initialValue={textDrawer.field.value_text ?? undefined}
          signerName={signer.name}
          dateFormat={envelope.date_format}
          timezone={envelope.timezone}
          serverError={drawerError}
          busy={drawerBusy}
          onCancel={closeTextDrawer}
          onApply={(v) => {
            handleMetaApply(v).catch(() => {
              /* surfaced via drawerError */
            });
          }}
        />
      ) : (
        <FieldInputDrawer
          open={textDrawer !== null}
          label={textDrawer ? fieldLabel(textDrawer.field, toUiKind(textDrawer.field), t) : ''}
          kind={(textDrawer?.kind ?? 'text') as FieldInputKind}
          initialValue={
            textDrawer && typeof textDrawer.field.value_text === 'string'
              ? textDrawer.field.value_text
              : ''
          }
          onCancel={closeTextDrawer}
          onApply={(v) => {
            handleTextApply(v).catch(() => {
              /* surfaced via error state */
            });
          }}
        />
      )}

      <SignatureCapture
        open={sigDrawer !== null}
        kind={sigDrawer?.kind ?? 'signature'}
        defaultName={signer.name}
        email={signer.email}
        onCancel={closeSigDrawer}
        onApply={(r) => {
          handleSignatureApply(r).catch(() => {
            /* surfaced via error state */
          });
        }}
      />

      <FinishSheet
        open={dialog === 'finish'}
        onClose={closeDialog}
        docTitle={envelope.title}
        signerName={signer.name}
        signerEmail={signer.email}
        preview={preview}
        busy={dialogBusy}
        error={dialogError}
        onSign={() => {
          handleSign().catch(() => {
            /* handled inside */
          });
        }}
        codeForm={
          needsActionCode ? (
            <>
              <strong>{t('signing.sign.finish.codeTitle')}</strong>
              <AccessCodeForm
                purpose="action"
                emailMasked={maskEmail(signer.email)}
                submitLabel={t('signing.sign.finish.sign')}
                onSubmitCode={handleSubmitWithCode}
              />
            </>
          ) : undefined
        }
      />

      <DeclineSheet
        open={dialog === 'decline'}
        onClose={closeDialog}
        senderName={envelope.sender_name}
        busy={dialogBusy}
        error={dialogError}
        onConfirm={(reason) => {
          runTerminal(
            () => session.decline(reason),
            'declined',
            t('signing.sign.decline.error'),
          ).catch(() => {
            /* handled inside */
          });
        }}
      />

      <ConfirmSheet
        open={dialog === 'notMe'}
        onClose={closeDialog}
        title={t('signing.sign.notMe.title')}
        confirmLabel={t('signing.sign.notMe.confirm')}
        cancelLabel={t('signing.sign.notMe.cancel')}
        busy={dialogBusy}
        error={dialogError}
        onConfirm={() => {
          runTerminal(
            () => session.decline('not-the-recipient'),
            'declined',
            t('signing.sign.decline.error'),
          ).catch(() => {
            /* handled inside */
          });
        }}
      >
        {t('signing.sign.notMe.body')}
      </ConfirmSheet>

      <ConfirmSheet
        open={dialog === 'withdraw'}
        onClose={closeDialog}
        title={t('signing.sign.withdraw.title')}
        confirmLabel={t('signing.sign.withdraw.confirm')}
        cancelLabel={t('signing.sign.withdraw.keep')}
        busy={dialogBusy}
        error={dialogError}
        onConfirm={() => {
          runTerminal(
            () => session.withdrawConsent(),
            'declined',
            t('signing.sign.withdraw.error'),
          ).catch(() => {
            /* handled inside */
          });
        }}
      >
        {t('signing.sign.withdraw.body')}
      </ConfirmSheet>
    </Page>
  );
}

/**
 * `/sign/:envelopeId/fill` — the whole signing flow on the document: the
 * consent bar, guided fields (Next), the signature sheet, and the Finish
 * confirmation. Name and date are filled in for the signer.
 */
export function SigningFillPage() {
  const params = useParams<{ readonly envelopeId: string }>();
  const envelopeId = params.envelopeId ?? '';
  return (
    <SigningSessionProvider envelopeId={envelopeId} senderName={null}>
      <Content />
    </SigningSessionProvider>
  );
}
