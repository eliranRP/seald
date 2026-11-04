import { useRef, useState } from 'react';
import { Undo2, Upload } from 'lucide-react';
import type { SettingsSignatureType, UserSettings } from 'shared';
import { useAuth } from '@/providers/AuthProvider';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { SegmentedControl } from '@/components/SegmentedControl';
import { Toast } from '@/components/Toast';
import { deriveInitialsFromName } from '@/components/SignatureCapture/SignatureCapture';
import { SignatureDrawPad } from './SignatureDrawPad';
import { imageFileToPng } from './imageFileToPng';
import {
  CardHeading,
  CardTitle,
  DirtyBar,
  DropLabel,
  Eyebrow,
  FieldError,
  HiddenFile,
  Meta,
  NameInput,
  Panel,
  Section,
  SigImage,
  SigInk,
  SigPad,
  Spacer,
  Stack,
} from './SettingsPage.styles';
import { useUpdateUserSettings, useUserSettings } from './userSettingsApi';

const TABS = [
  { value: 'typed', label: 'Type' },
  { value: 'drawn', label: 'Draw' },
  { value: 'uploaded', label: 'Upload' },
] as const satisfies ReadonlyArray<{ value: SettingsSignatureType; label: string }>;

interface Draft {
  readonly type: SettingsSignatureType;
  readonly typed: string;
  readonly drawn: string | null;
  readonly uploaded: string | null;
  readonly initials: string;
}

function draftFrom(settings: UserSettings | undefined, fallbackName: string): Draft {
  const sig = settings?.signature;
  return {
    type: sig?.type ?? 'typed',
    typed: sig?.typed_text ?? settings?.display_name ?? fallbackName,
    drawn: sig?.type === 'drawn' ? sig.image : null,
    uploaded: sig?.type === 'uploaded' ? sig.image : null,
    initials: settings?.initials ?? deriveInitialsFromName(settings?.display_name ?? fallbackName),
  };
}

function imageOf(draft: Draft): string | null {
  if (draft.type === 'drawn') return draft.drawn;
  if (draft.type === 'uploaded') return draft.uploaded;
  return null;
}

function sameDraft(a: Draft, b: Draft): boolean {
  return (
    a.type === b.type &&
    a.typed === b.typed &&
    a.drawn === b.drawn &&
    a.uploaded === b.uploaded &&
    a.initials === b.initials
  );
}

/**
 * Signature: the sender's saved signature (typed, drawn or uploaded) and
 * initials, used when they sign their own documents. Edits save with the
 * bar that appears once something differs from what is stored.
 */
export function SignatureSection() {
  const { user } = useAuth();
  const settings = useUserSettings();
  const update = useUpdateUserSettings();
  const [edit, setEdit] = useState<Draft | null>(null);
  const [saved, setSaved] = useState(false);
  const [failed, setFailed] = useState(false);
  const [uploadError, setUploadError] = useState(false);
  // Set when Save is pressed with nothing to save; cleared by the next edit.
  const [missing, setMissing] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const base = draftFrom(settings.data, user?.name ?? '');
  const draft = edit ?? base;
  const dirty = edit !== null && !sameDraft(edit, base);
  const image = imageOf(draft);
  const typedName = draft.typed.trim();
  const incomplete = draft.type === 'typed' ? typedName === '' : image === null;
  const missingCopy: Record<SettingsSignatureType, string> = {
    typed: 'Type your name to create a typed signature.',
    drawn: 'Draw your signature in the box first.',
    uploaded: 'Choose an image of your signature first.',
  };

  function change(next: Partial<Draft>): void {
    setMissing(false);
    setEdit({ ...draft, ...next });
  }

  async function onFile(file: File | undefined): Promise<void> {
    if (!file) return;
    setUploadError(false);
    const png = await imageFileToPng(file);
    if (png === null) {
      setUploadError(true);
      return;
    }
    change({ uploaded: png });
  }

  function save(): void {
    if (incomplete) {
      setMissing(true);
      return;
    }
    setFailed(false);
    update.mutate(
      {
        signature: {
          type: draft.type,
          typed_text: typedName === '' ? null : typedName,
          image,
        },
        initials: draft.initials.trim() === '' ? null : draft.initials.trim(),
      },
      {
        onSuccess: () => {
          setEdit(null);
          setSaved(true);
        },
        onError: () => setFailed(true),
      },
    );
  }

  return (
    <Section aria-label="Signature">
      <Panel $gap={4}>
        <CardHeading>Your signature</CardHeading>
        <SegmentedControl
          aria-label="Signature type"
          block
          options={TABS}
          value={draft.type}
          onChange={(type) => change({ type })}
        />

        {draft.type === 'typed' ? (
          <Stack $gap={8}>
            <SigPad>
              <SigInk>{draft.typed || ' '}</SigInk>
            </SigPad>
            <Eyebrow as="label" htmlFor="settings-typed-signature">
              Typed signature
            </Eyebrow>
            <NameInput
              id="settings-typed-signature"
              type="text"
              dir="auto"
              autoComplete="name"
              value={draft.typed}
              maxLength={80}
              onChange={(e) => change({ typed: e.target.value })}
            />
          </Stack>
        ) : null}

        {draft.type === 'drawn' ? (
          <SignatureDrawPad value={draft.drawn} onChange={(drawn) => change({ drawn })} />
        ) : null}

        {draft.type === 'uploaded' ? (
          <Stack $gap={8}>
            <SigPad $drop={!draft.uploaded}>
              {draft.uploaded ? (
                <SigImage src={draft.uploaded} alt="Your uploaded signature" />
              ) : (
                <DropLabel>
                  <Icon icon={Upload} size={32} />
                  <CardTitle as="span">Choose an image</CardTitle>
                  <Meta>PNG or JPG on a plain background, up to 1 MB</Meta>
                  <HiddenFile
                    ref={fileRef}
                    type="file"
                    accept="image/png,image/jpeg"
                    aria-label="Signature image"
                    onChange={(e) => void onFile(e.target.files?.[0])}
                  />
                </DropLabel>
              )}
            </SigPad>
            {draft.uploaded ? (
              <div>
                <Button
                  variant="ghost"
                  size="sm"
                  iconLeft={Undo2}
                  onClick={() => change({ uploaded: null })}
                >
                  Remove image
                </Button>
              </div>
            ) : null}
            {uploadError ? (
              <FieldError role="alert">Use a PNG or JPG under 1 MB.</FieldError>
            ) : null}
          </Stack>
        ) : null}

        <Stack $gap={8}>
          <Eyebrow as="label" htmlFor="settings-initials">
            Initials
          </Eyebrow>
          <SigPad $small>
            <SigInk $small>{draft.initials || ' '}</SigInk>
          </SigPad>
          <NameInput
            id="settings-initials"
            type="text"
            dir="auto"
            value={draft.initials}
            maxLength={6}
            style={{ maxWidth: 200 }}
            onChange={(e) => change({ initials: e.target.value })}
          />
        </Stack>
        <Meta>Used when you sign your own documents.</Meta>
      </Panel>

      {dirty ? (
        <DirtyBar role="region" aria-label="Unsaved changes">
          {missing || failed ? (
            <FieldError role="alert">
              {missing
                ? missingCopy[draft.type]
                : "Couldn't save your signature. Check your connection and try again."}
            </FieldError>
          ) : (
            <Meta>Unsaved changes</Meta>
          )}
          <Spacer />
          <Button
            variant="secondary"
            onClick={() => {
              setEdit(null);
              setMissing(false);
              setFailed(false);
            }}
          >
            Cancel
          </Button>
          {/* Stays pressable: a press with nothing to save says what is missing. */}
          <Button variant="primary" loading={update.isPending} onClick={save}>
            Save signature
          </Button>
        </DirtyBar>
      ) : null}
      {saved ? <Toast title="Saved" duration={2000} onClose={() => setSaved(false)} /> : null}
    </Section>
  );
}
