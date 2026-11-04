import { useRef, useState } from 'react';
import { useAuth } from '@/providers/AuthProvider';
import { supabase } from '@/lib/supabase/supabaseClient';
import { Avatar } from '@/components/Avatar';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Toast } from '@/components/Toast';
import { GoogleMark } from './GoogleMark';
import {
  BadgeMark,
  DirtyBar,
  EmailLine,
  EmailValue,
  Eyebrow,
  FieldError,
  Meta,
  NameInput,
  Panel,
  ProfileHead,
  Section,
  Spacer,
  Stack,
} from './SettingsPage.styles';
import { useUpdateUserSettings, useUserSettings } from './userSettingsApi';

const NAME_MIN = 2;
const NAME_MAX = 80;

function providerOf(appMetadata: Record<string, unknown> | undefined): 'google' | 'email' {
  return appMetadata?.provider === 'google' ? 'google' : 'email';
}

/**
 * Profile: the one editable thing is the name. Email comes from sign-in and
 * is read-only. A Save bar appears only once the name differs from what is
 * saved. The name goes to `/me/settings`, then to the auth profile so the
 * avatar menu shows it too.
 */
export function ProfileSection() {
  const { user, session } = useAuth();
  const settings = useUserSettings();
  const update = useUpdateUserSettings();
  const [edited, setEdited] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [failed, setFailed] = useState(false);
  // The length check waits until the field is left or Save is pressed.
  const [touched, setTouched] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const savedName = settings.data?.display_name ?? user?.name ?? '';
  const draft = edited ?? savedName;
  const trimmed = draft.trim();
  const dirty = edited !== null && trimmed !== savedName;
  const tooShort = trimmed.length < NAME_MIN;
  const provider = providerOf(session?.user.app_metadata);
  const showTooShort = dirty && touched && tooShort;

  function save(): void {
    if (tooShort) {
      setTouched(true);
      inputRef.current?.focus();
      return;
    }
    setFailed(false);
    update.mutate(
      { display_name: trimmed },
      {
        onSuccess: () => {
          setEdited(null);
          setTouched(false);
          setSaved(true);
          // Best effort: keep the auth profile name in step for the avatar menu.
          void supabase.auth.updateUser({ data: { name: trimmed } }).catch(() => undefined);
        },
        onError: () => setFailed(true),
      },
    );
  }

  return (
    <Section aria-label="Profile">
      <Panel>
        <ProfileHead>
          <Avatar name={draft || (user?.email ?? '')} size={64} tone="indigo" />
          <Stack $gap={8} style={{ flex: 1 }}>
            <Eyebrow as="label" htmlFor="settings-full-name">
              Full name
            </Eyebrow>
            <NameInput
              ref={inputRef}
              id="settings-full-name"
              type="text"
              dir="auto"
              value={draft}
              maxLength={NAME_MAX}
              autoComplete="name"
              aria-invalid={showTooShort ? true : undefined}
              aria-describedby={showTooShort ? 'settings-full-name-error' : undefined}
              onBlur={() => setTouched(true)}
              onChange={(e) => setEdited(e.target.value)}
            />
            {showTooShort ? (
              <FieldError id="settings-full-name-error" role="alert">
                Enter at least {NAME_MIN} characters for your name.
              </FieldError>
            ) : null}
          </Stack>
        </ProfileHead>
        <Stack $gap={8}>
          <Eyebrow>Email</Eyebrow>
          <EmailLine>
            <EmailValue title={user?.email ?? undefined}>{user?.email ?? ''}</EmailValue>
            {provider === 'google' ? (
              <Badge tone="neutral" dot={false}>
                <BadgeMark>
                  <GoogleMark />
                  Google
                </BadgeMark>
              </Badge>
            ) : null}
          </EmailLine>
        </Stack>
      </Panel>

      {dirty ? (
        <DirtyBar role="region" aria-label="Unsaved changes">
          <Meta role={failed ? 'alert' : undefined}>
            {failed
              ? "Couldn't save your name. Check your connection and try again."
              : 'Unsaved changes'}
          </Meta>
          <Spacer />
          <Button
            variant="secondary"
            onClick={() => {
              setEdited(null);
              setTouched(false);
              setFailed(false);
            }}
          >
            Cancel
          </Button>
          {/* Stays pressable: a press with a short name points at the field instead. */}
          <Button variant="primary" loading={update.isPending} onClick={save}>
            Save name
          </Button>
        </DirtyBar>
      ) : null}
      {saved ? <Toast title="Saved" duration={2000} onClose={() => setSaved(false)} /> : null}
    </Section>
  );
}
