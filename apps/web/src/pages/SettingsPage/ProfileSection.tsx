import { useState } from 'react';
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

  const savedName = settings.data?.display_name ?? user?.name ?? '';
  const draft = edited ?? savedName;
  const trimmed = draft.trim();
  const dirty = edited !== null && trimmed !== savedName;
  const tooShort = trimmed.length < NAME_MIN;
  const provider = providerOf(session?.user.app_metadata);

  function save(): void {
    if (tooShort) return;
    setFailed(false);
    update.mutate(
      { display_name: trimmed },
      {
        onSuccess: () => {
          setEdited(null);
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
          <Avatar name={draft || (user?.email ?? '')} size={56} />
          <Stack $gap={8} style={{ flex: 1 }}>
            <Eyebrow as="label" htmlFor="settings-full-name">
              Full name
            </Eyebrow>
            <NameInput
              id="settings-full-name"
              type="text"
              value={draft}
              maxLength={NAME_MAX}
              autoComplete="name"
              aria-invalid={dirty && tooShort ? true : undefined}
              onChange={(e) => setEdited(e.target.value)}
            />
            {dirty && tooShort ? (
              <FieldError role="alert">Use at least {NAME_MIN} characters.</FieldError>
            ) : null}
          </Stack>
        </ProfileHead>
        <Stack $gap={8}>
          <Eyebrow>Email</Eyebrow>
          <EmailLine>
            <Meta>{user?.email ?? ''}</Meta>
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
          <Meta>{failed ? "Couldn't save. Try again." : 'Unsaved changes'}</Meta>
          <Spacer />
          <Button variant="secondary" onClick={() => setEdited(null)}>
            Cancel
          </Button>
          <Button variant="primary" loading={update.isPending} disabled={tooShort} onClick={save}>
            Save
          </Button>
        </DirtyBar>
      ) : null}
      {saved ? <Toast title="Saved" duration={2000} onClose={() => setSaved(false)} /> : null}
    </Section>
  );
}
