import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { isFeatureEnabled } from 'shared';
import { useAuth } from '@/providers/AuthProvider';
import { isSendLoginFresh } from './amr';
import { DevelopersKeysScreen } from './DevelopersKeysScreen';
import { rememberPostSignInPath } from './postSignInPath';
import type { ApiKeyListItem } from './types';
import { useApiKeyMutations, useApiKeys } from './useApiKeys';
import { Page, Title, Muted, BackLink } from './DevelopersKeysScreen.styles';

/**
 * Session page for agent access keys. Phone and desktop share the screen.
 * Hidden behind `mcpServer`, which defaults off.
 */
export function DevelopersPage() {
  const location = useLocation();
  const phone = location.pathname.startsWith('/m/');
  if (!isFeatureEnabled('mcpServer')) {
    return (
      <Page>
        {phone ? <BackLink to="/m/send">Back</BackLink> : null}
        <Title>Developers</Title>
        <Muted>Not available.</Muted>
      </Page>
    );
  }
  return <DevelopersPageInner phone={phone} />;
}

function DevelopersPageInner(props: { readonly phone: boolean }) {
  const { phone } = props;
  const navigate = useNavigate();
  const { session } = useAuth();
  const query = useApiKeys();
  const [secret, setSecret] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const mutations = useApiKeyMutations((value) => {
    setNotice(null);
    setSecret(value);
  }, setNotice);

  const keys: ApiKeyListItem[] = (query.data ?? [])
    .filter((row) => row.revoked_at === null)
    .map((row) => ({
      id: row.id,
      name: row.name,
      prefix: row.prefix,
      scopes: row.scopes,
      require_owner_approval: row.require_owner_approval,
      allow_new_recipients: row.allow_new_recipients,
      always_require_signin: row.always_require_signin,
      approval_notify: row.approval_notify,
      last_used_at: row.last_used_at,
      expires_at: row.expires_at,
    }));

  if (query.isError && !query.data) {
    return (
      <Page>
        <Title>Developers</Title>
        <Muted>Could not load keys.</Muted>
      </Page>
    );
  }

  return (
    <DevelopersKeysScreen
      layout={phone ? 'phone' : 'desktop'}
      keys={keys}
      busy={mutations.create.isPending || query.isLoading}
      notice={notice}
      revealedSecret={secret}
      sendLoginFresh={isSendLoginFresh(session?.access_token)}
      onCreate={(input) => mutations.create.mutate(input)}
      onRevoke={(id) => mutations.revoke.mutate(id)}
      onPatch={(id, patch) => mutations.patch.mutate({ id, patch })}
      onDismissSecret={() => setSecret(null)}
      onNeedFreshLogin={() => {
        const path = phone ? '/m/settings/developers' : '/settings/developers';
        rememberPostSignInPath(path);
        navigate('/signin');
      }}
    />
  );
}
