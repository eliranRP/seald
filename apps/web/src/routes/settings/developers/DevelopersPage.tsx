import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { isFeatureEnabled } from 'shared';
import { DevelopersKeysScreen } from './DevelopersKeysScreen';
import type { ApiKeyListItem, KeysScreenStatus } from './types';
import { useApiKeyMutations, useApiKeys } from './useApiKeys';
import { BackLink, Muted, Page, Title } from './DevelopersKeysScreen.styles';

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
  const query = useApiKeys();
  const [secret, setSecret] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const mutations = useApiKeyMutations(
    (value) => {
      setNotice(null);
      setToast(null);
      setSecret(value);
    },
    setNotice,
    () => {
      setNotice(null);
      setToast('Key revoked.');
    },
  );

  const keys: ApiKeyListItem[] = (query.data ?? [])
    .filter((row) => row.revoked_at === null)
    .map((row) => ({
      id: row.id,
      name: row.name,
      prefix: row.prefix,
      scopes: row.scopes,
      last_used_at: row.last_used_at,
      expires_at: row.expires_at,
    }));

  let status: KeysScreenStatus = 'ready';
  if (query.isPending && !query.data) status = 'loading';
  else if (query.isError && !query.data) status = 'error';

  return (
    <DevelopersKeysScreen
      layout={phone ? 'phone' : 'desktop'}
      keys={keys}
      status={status}
      creating={mutations.create.isPending}
      notice={notice}
      toast={toast}
      revealedSecret={secret}
      onCreate={(input) => {
        setToast(null);
        mutations.create.mutate(input);
      }}
      onRevoke={(id) => mutations.revoke.mutate(id)}
      onDismissSecret={() => {
        setSecret(null);
        mutations.create.reset();
      }}
      onRetry={() => {
        void query.refetch();
      }}
    />
  );
}
