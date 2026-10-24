import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DragEvent, JSX } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, FileText, Send, Upload } from 'lucide-react';
import { isFeatureEnabled } from 'shared';
import type { AddSignerContact } from '@/components/AddSignerDropdown/AddSignerDropdown.types';
import { Banner } from '@/components/Banner';
import { Button } from '@/components/Button';
import { DrivePicker } from '@/components/drive-picker';
import { Icon } from '@/components/Icon';
import { PersonPicker } from '@/components/PersonPicker';
import { ResponsiveDialog } from '@/components/ResponsiveDialog';
import { Skeleton } from '@/components/Skeleton';
import { useSendEnvelope } from '@/features/envelopes';
import { DEFAULT_SEND_REMINDER_SETTINGS } from '@/features/envelopes/sendReminderSettings';
import { makeMeSigner } from '@/features/documentEditor/upload/meSigner';
import {
  ConversionFailedDialog,
  ConversionProgressDialog,
  DriveTemplateReplaceButton,
  useDriveImport,
} from '@/features/gdriveImport';
import { readPdfInfo } from '@/lib/pdf';
import { useAppState } from '@/providers/AppStateProvider';
import { useAuth } from '@/providers/AuthProvider';
import {
  useConnectGDrive,
  useGDriveAccounts,
  useReconnectGDrive,
} from '@/routes/settings/integrations/useGDriveAccounts';
import { rosterAfterUse } from './rosterUpdate';
import { planTemplateSend, toSendInput } from './sendFromTemplate';
import { deriveTemplateRoles } from './templateRoles';
import type { TemplateRole } from './templateRoles';
import { getTemplates, resolveTemplateFields, setTemplates } from './templates';
import type { ResolvedField, TemplateSummary } from './templates';
import {
  applyTemplate,
  bumpUseCount,
  fetchTemplateExamplePdf,
  updateTemplate,
} from './templatesApi';
import {
  DropActions,
  DropTitle,
  Dropzone,
  FileCard,
  FileName,
  FileText as FileMeta,
  FootButtons,
  HiddenInput,
  MetaLine,
  Quiet,
  RoleDot,
  RoleName,
  RoleRow,
  Roles,
} from './UseTemplateDialog.styles';

const MAX_PDF_BYTES = 25 * 1024 * 1024;

type Picks = Readonly<Record<string, AddSignerContact | undefined>>;

interface LoadedDoc {
  readonly file: File;
  readonly pages: number;
  readonly aspect: number;
}

type SavedDoc =
  | { readonly status: 'loading' }
  | { readonly status: 'missing' }
  | ({ readonly status: 'ready' } & LoadedDoc);

export interface UseTemplateDialogProps {
  /** The template to use; null keeps the dialog closed. */
  readonly template: TemplateSummary | null;
  readonly onClose: () => void;
}

function isPdf(file: File): boolean {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
}

function pagesText(pages: number): string {
  return `${String(pages)} ${pages === 1 ? 'page' : 'pages'}`;
}

/** "Reminders every 3 days · expires in 30 days", read from the send defaults. */
function defaultsLine(): string {
  const { cadence, expiry } = DEFAULT_SEND_REMINDER_SETTINGS;
  const every = `Reminders every ${String(cadence.intervalDays)} ${cadence.intervalDays === 1 ? 'day' : 'days'}`;
  return expiry.kind === 'days' ? `${every} · expires in ${String(expiry.days)} days` : every;
}

/**
 * Who starts in each slot: the person from last time, matched to a saved
 * contact (or to the sender) by email so their latest name and id are used.
 */
function initialPicks(
  roles: ReadonlyArray<TemplateRole>,
  me: AddSignerContact | null,
  contacts: ReadonlyArray<AddSignerContact>,
): Picks {
  const out: Record<string, AddSignerContact | undefined> = {};
  for (const role of roles) {
    const p = role.person;
    if (!p) continue;
    const email = p.email.toLowerCase();
    if (me && me.email.toLowerCase() === email) out[role.key] = me;
    else out[role.key] = contacts.find((c) => c.email.toLowerCase() === email) ?? p;
  }
  return out;
}

/** Maps each field's stored signer id to the person now in that slot. */
function toChosenIds(fields: ReadonlyArray<ResolvedField>, picks: Picks): ResolvedField[] {
  return fields.map((f) => {
    const person = f.signerRoleId !== undefined ? picks[f.signerRoleId] : undefined;
    return person ? { ...f, signerRoleId: person.id } : f;
  });
}

/**
 * Use a template in one step: who fills each role (pre-filled from last
 * time), which document (the saved PDF, or a replacement), then "Send now"
 * creates and sends the envelope with the Settings defaults and lands on the
 * Documents list, or "Review fields" opens the editor with the layout placed.
 * A dialog on desktop, a tall sheet on phones.
 */
export function UseTemplateDialog(props: UseTemplateDialogProps): JSX.Element | null {
  const { template, onClose } = props;
  if (!template) return null;
  return <UseTemplateBody key={template.id} template={template} onClose={onClose} />;
}

interface BodyProps {
  readonly template: TemplateSummary;
  readonly onClose: () => void;
}

function UseTemplateBody({ template, onClose }: BodyProps): JSX.Element {
  const navigate = useNavigate();
  const { contacts, addContact } = useAppState();
  const { user } = useAuth();
  const sendEnvelope = useSendEnvelope();

  const roles = useMemo(() => deriveTemplateRoles(template), [template]);
  const me = useMemo(() => (user && user.email.length > 0 ? makeMeSigner(user) : null), [user]);
  const options = useMemo(() => {
    const list: AddSignerContact[] = me ? [me] : [];
    for (const c of contacts) {
      if (!me || c.email.toLowerCase() !== me.email.toLowerCase()) list.push(c);
    }
    return list;
  }, [me, contacts]);

  const [picks, setPicks] = useState<Picks>(() => initialPicks(roles, me, contacts));

  // Contacts and the sender may load after the dialog opens: fill slots that
  // are still empty, never overwrite a choice the person made.
  const touched = useRef(false);
  useEffect(() => {
    if (touched.current) return;
    setPicks((prev) => {
      const next = initialPicks(roles, me, contacts);
      return Object.keys(next).length > Object.keys(prev).length ? next : prev;
    });
  }, [roles, me, contacts]);

  // ---- document -----------------------------------------------------------
  const [saved, setSaved] = useState<SavedDoc>(
    template.hasExamplePdf ? { status: 'loading' } : { status: 'missing' },
  );
  const [replaced, setReplaced] = useState<LoadedDoc | null>(null);
  const [replacing, setReplacing] = useState(!template.hasExamplePdf);
  const [reading, setReading] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!template.hasExamplePdf) return undefined;
    const ac = new AbortController();
    void (async () => {
      try {
        const blob = await fetchTemplateExamplePdf(template.id, ac.signal);
        const file = new File([blob], `${template.name}.pdf`, { type: 'application/pdf' });
        const info = await readPdfInfo(file);
        if (!ac.signal.aborted) {
          setSaved({ status: 'ready', file, pages: info.pages, aspect: info.aspect });
        }
      } catch {
        if (!ac.signal.aborted) {
          setSaved({ status: 'missing' });
          setReplacing(true);
        }
      }
    })();
    return () => ac.abort();
  }, [template.id, template.name, template.hasExamplePdf]);

  const chooseFile = useCallback(async (file: File): Promise<void> => {
    if (!isPdf(file) || file.size > MAX_PDF_BYTES) {
      setFileError('Choose a PDF up to 25 MB.');
      return;
    }
    setFileError(null);
    setReading(true);
    try {
      const info = await readPdfInfo(file);
      setReplaced({ file, pages: info.pages, aspect: info.aspect });
      setReplacing(false);
    } catch {
      setFileError('This PDF could not be read. Try another file.');
    } finally {
      setReading(false);
    }
  }, []);

  // Google Drive (flag `gdriveIntegration`): same picker and conversion as New document.
  const gdriveOn = isFeatureEnabled('gdriveIntegration');
  const accountsQuery = useGDriveAccounts();
  const accounts = gdriveOn ? (accountsQuery.data ?? []) : [];
  const driveAccountId = accounts[0]?.id ?? null;
  const connectDrive = useConnectGDrive();
  const reconnectDrive = useReconnectGDrive();
  const [drivePickerOpen, setDrivePickerOpen] = useState(false);
  const driveImport = useDriveImport({
    accountId: driveAccountId ?? '',
    onReady: (file) => {
      void chooseFile(file);
    },
  });

  const active: LoadedDoc | null = replaced ?? (saved.status === 'ready' ? saved : null);
  const droppedFields = active
    ? template.fields.filter((f) => typeof f.pageRule === 'number' && f.pageRule > active.pages)
        .length
    : 0;

  // ---- people ---------------------------------------------------------------
  const missing = roles.filter((r) => !picks[r.key]);
  const emails = roles.flatMap((r) => {
    const p = picks[r.key];
    return p ? [p.email.toLowerCase()] : [];
  });
  const duplicates = new Set(emails).size !== emails.length;
  const chosenIds = roles.flatMap((r) => picks[r.key]?.id ?? []);

  const setPick = (roleKey: string, person: AddSignerContact): void => {
    touched.current = true;
    setPicks((prev) => ({ ...prev, [roleKey]: person }));
  };

  // ---- actions ----------------------------------------------------------------
  const [sending, setSending] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const busy = sending || reviewing;

  const activeFile = replaced?.file ?? (saved.status === 'ready' ? saved.file : null);

  const expand = useCallback(
    async (pages: number): Promise<ReadonlyArray<ResolvedField>> => {
      try {
        return await applyTemplate(template.id, pages);
      } catch {
        // The API is the source of truth; expanding locally keeps the flow alive offline.
        return resolveTemplateFields(template.fields, pages, template.lastSigners);
      }
    },
    [template],
  );

  const canSend =
    active !== null &&
    activeFile !== null &&
    missing.length === 0 &&
    !duplicates &&
    droppedFields === 0 &&
    !busy;

  /** After a send: count the use and remember who filled each slot. */
  const remember = (): void => {
    const update = rosterAfterUse(template, roles, picks);
    const replace = (t: TemplateSummary): void =>
      setTemplates(getTemplates().map((x) => (x.id === t.id ? t : x)));
    void bumpUseCount(template.id)
      .then((t) => {
        replace(t);
        return update.changed
          ? updateTemplate(template.id, {
              last_signers: update.lastSigners,
              field_layout: update.fieldLayout,
            })
          : null;
      })
      .then((t) => {
        if (t) replace(t);
      })
      .catch(() => {
        /* the envelope is already sent; the template just won't remember this time */
      });
  };

  const sendNow = async (): Promise<void> => {
    if (!active || !activeFile || !canSend) return;
    setSending(true);
    setSendError(null);
    try {
      const fields = await expand(active.pages);
      const plan = planTemplateSend({ template, roles, picks, fields, aspect: active.aspect });
      if (!plan) throw new Error('missing_people');
      const result = await sendEnvelope.run(toSendInput(plan, activeFile));
      remember();
      navigate('/documents', { state: { justSent: result.envelope_id } });
    } catch {
      sendEnvelope.reset();
      setSendError('Could not send. Nothing was sent. Try again.');
      setSending(false);
    }
  };

  const reviewFields = async (): Promise<void> => {
    if (!active || busy) return;
    setReviewing(true);
    try {
      const fields = toChosenIds(await expand(active.pages), picks);
      const templateSigners = roles.flatMap((r) => picks[r.key] ?? []);
      navigate(`/templates/${encodeURIComponent(template.id)}/edit`, {
        state: {
          templateSigners,
          templateFields: fields,
          templateFieldsPages: active.pages,
          ...(replaced ? { pendingFile: replaced.file } : {}),
        },
      });
    } finally {
      setReviewing(false);
    }
  };

  const onDrop = (e: DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    setOver(false);
    const file = e.dataTransfer.files[0];
    if (file) void chooseFile(file);
  };

  // ---- render ------------------------------------------------------------------
  const showDropzone = replacing;
  let hint: string | null = null;
  if (missing.length > 0) hint = 'Pick a person for every role';
  else if (duplicates) hint = 'Each role needs a different person';

  return (
    <>
      <ResponsiveDialog
        open
        onClose={onClose}
        title={`Use ${template.name}`}
        width={560}
        footer={
          <FootButtons>
            <Button
              variant="ghost"
              loading={reviewing}
              disabled={!active || sending}
              onClick={() => void reviewFields()}
            >
              Review fields
            </Button>
            <Button
              variant="primary"
              iconLeft={Send}
              loading={sending}
              disabled={!canSend && !sending}
              onClick={() => void sendNow()}
            >
              Send now
            </Button>
          </FootButtons>
        }
      >
        <Roles>
          {roles.map((role) => (
            <RoleRow key={role.key}>
              <RoleDot $color={role.color} aria-hidden />
              <RoleName>{role.label}</RoleName>
              <PersonPicker
                aria-label={`Person for ${role.label}`}
                value={picks[role.key] ?? null}
                options={options}
                youId={me?.id}
                inline
                disabledIds={chosenIds}
                onChange={(p) => setPick(role.key, p)}
                onCreate={(email) => addContact(email.split('@')[0] ?? email, email)}
              />
            </RoleRow>
          ))}
        </Roles>

        {saved.status === 'loading' && !replaced ? (
          <Skeleton variant="rect" height={64} aria-label="Loading the saved document" />
        ) : null}

        {!showDropzone && active ? (
          <FileCard>
            <Icon icon={FileText} size={24} />
            <FileMeta>
              <FileName>{replaced ? replaced.file.name : `${template.name}.pdf`}</FileName>
              <Quiet>{pagesText(active.pages)}</Quiet>
            </FileMeta>
            <Button variant="ghost" size="sm" onClick={() => setReplacing(true)}>
              Replace
            </Button>
          </FileCard>
        ) : null}

        {showDropzone ? (
          <Dropzone
            $over={over}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={onDrop}
          >
            <Icon icon={Upload} size={24} />
            <DropTitle>Drop a PDF · the layout snaps on</DropTitle>
            <DropActions>
              <Button
                variant="primary"
                size="sm"
                loading={reading}
                onClick={() => fileInput.current?.click()}
              >
                Choose file
              </Button>
              {gdriveOn ? (
                <DriveTemplateReplaceButton
                  connected={driveAccountId !== null}
                  onPickDrive={() => setDrivePickerOpen(true)}
                  onConnect={() => connectDrive.mutate()}
                />
              ) : null}
              {active ? (
                <Button variant="ghost" size="sm" onClick={() => setReplacing(false)}>
                  Keep current
                </Button>
              ) : null}
            </DropActions>
            <HiddenInput
              ref={fileInput}
              type="file"
              accept="application/pdf,.pdf"
              aria-label="Choose a PDF"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) void chooseFile(file);
              }}
            />
          </Dropzone>
        ) : null}

        {fileError ? <Banner tone="error">{fileError}</Banner> : null}
        {saved.status === 'missing' && template.hasExamplePdf && !replaced ? (
          <Banner tone="error">The saved document could not be loaded. Choose a PDF.</Banner>
        ) : null}
        {droppedFields > 0 && active ? (
          <Banner tone="info">
            This PDF has {pagesText(active.pages)}; {String(droppedFields)}{' '}
            {droppedFields === 1 ? 'field' : 'fields'} on missing pages would be dropped. Review the
            fields before sending.
          </Banner>
        ) : null}
        {sendError ? <Banner tone="error">{sendError}</Banner> : null}

        <MetaLine>
          <Icon icon={Bell} size={14} />
          {defaultsLine()}
        </MetaLine>
        {hint ? <Quiet role="status">{hint}</Quiet> : null}
      </ResponsiveDialog>

      {gdriveOn && driveAccountId !== null ? (
        <DrivePicker
          open={drivePickerOpen}
          accountId={driveAccountId}
          onClose={() => setDrivePickerOpen(false)}
          onReconnect={() => reconnectDrive.mutate()}
          onPick={(file) => {
            setDrivePickerOpen(false);
            driveImport.beginImport(file);
          }}
        />
      ) : null}
      <ConversionProgressDialog
        open={driveImport.state.kind === 'starting' || driveImport.state.kind === 'running'}
        fileName={
          driveImport.state.kind === 'starting' || driveImport.state.kind === 'running'
            ? driveImport.state.file.name
            : ''
        }
        onCancel={() => {
          void driveImport.cancelImport();
        }}
      />
      <ConversionFailedDialog
        open={driveImport.state.kind === 'failed'}
        errorCode={
          driveImport.state.kind === 'failed' ? driveImport.state.error : 'conversion-failed'
        }
        onRetry={() => {
          driveImport.reset();
          setDrivePickerOpen(true);
        }}
        onClose={() => driveImport.reset()}
      />
    </>
  );
}
