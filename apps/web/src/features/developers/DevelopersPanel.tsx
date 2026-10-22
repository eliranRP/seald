import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_KEY_MAX_LIVE, SIGNATURE_LEVEL_NOTE, requiresFreshLogin } from 'shared';
import type { CreateApiKeyRequest, CreateApiKeyResponse } from 'shared';
import { Plus } from 'lucide-react';
import { Button } from '@/components/Button';
import { CodeSnippet } from '@/components/CodeSnippet';
import { SecretOnceSheet } from '@/components/SecretOnceSheet';
import { useAuth } from '@/providers/AuthProvider';
import type { ApiError } from '@/lib/api/apiClient';
import { NotAvailable } from './NotAvailable';
import { ConnectClient } from './ConnectClient';
import { CreateKeyAdvanced } from './CreateKeyAdvanced';
import { Disclosure } from './Disclosure';
import { KeyList } from './KeyList';
import { useApiKeys, useCreateApiKey, useRevokeApiKey } from './developersApi';
import { claudeCodeCommand, mcpServerUrl } from './model';
import { Actions, Intro, Notice, Section, SectionTitle, Stack } from './DevelopersPanel.styles';

type CreateProblem = 'fresh_login' | 'email_required' | 'limit' | 'other';

function classify(err: Error, body: CreateApiKeyRequest): CreateProblem {
  const status = (err as ApiError).status;
  if (status === 403) {
    // A create that carries a scope in the fresh-login set returns 403 when the
    // last sign-in is older than 10 minutes. Any other 403 is a guest session.
    return requiresFreshLogin(body.scopes ?? []) ? 'fresh_login' : 'email_required';
  }
  if (status === 409 && /limit/i.test(err.message)) return 'limit';
  return 'other';
}

const PROBLEM_TEXT: Readonly<Record<CreateProblem, string>> = {
  fresh_login: 'Sign in again to create this key.',
  email_required: 'Sign in with an email account to create keys.',
  limit: `You can have ${API_KEY_MAX_LIVE} keys. Revoke one to add another.`,
  other: "Couldn't create the key. Try again.",
};

/**
 * The Developers page body, shared by `/settings/developers` and
 * `/m/settings/developers`. One column. "New key" is one tap; everything
 * else is behind "Advanced".
 */
export function DevelopersPanel() {
  const keys = useApiKeys();
  const create = useCreateApiKey();
  const revoke = useRevokeApiKey();
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const [created, setCreated] = useState<CreateApiKeyResponse | null>(null);
  const [problem, setProblem] = useState<CreateProblem | null>(null);
  const [revokeFailed, setRevokeFailed] = useState(false);

  if (keys.data === null) return <NotAvailable />;
  const list = keys.data ?? [];
  const full = list.length >= API_KEY_MAX_LIVE;

  const handleCreate = (body: CreateApiKeyRequest): void => {
    setProblem(null);
    create.mutate(body, {
      onSuccess: (res) => {
        setCreated(res);
      },
      onError: (err) => {
        setProblem(classify(err, body));
      },
    });
  };

  const handleSignInAgain = (): void => {
    void signOut().then(() => {
      navigate('/signin');
    });
  };

  if (keys.isLoading) {
    return (
      <Stack>
        <p role="status">Loading keys</p>
      </Stack>
    );
  }
  if (keys.isError) {
    return (
      <Stack>
        <Notice $tone="error" role="alert">
          Couldn&apos;t load your keys.
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              void keys.refetch();
            }}
          >
            Try again
          </Button>
        </Notice>
      </Stack>
    );
  }

  return (
    <Stack>
      <Intro>
        Keys let an app prepare and send on your behalf. Signers still sign from their own link. Any
        app that can read your email can approve from the email link.
      </Intro>
      <Disclosure label="Advanced" ariaLabel="Advanced signature note">
        <Intro>{SIGNATURE_LEVEL_NOTE}</Intro>
      </Disclosure>

      <Section aria-labelledby="keys-title">
        <SectionTitle id="keys-title">Keys</SectionTitle>
        {list.length > 0 ? (
          <KeyList
            keys={list}
            revoking={revoke.isPending}
            onRevoke={(id) => {
              setRevokeFailed(false);
              revoke.mutate(id, {
                onError: () => {
                  setRevokeFailed(true);
                },
              });
            }}
          />
        ) : null}
        {revokeFailed ? (
          <Notice $tone="error" role="alert">
            Couldn&apos;t revoke the key. Try again.
          </Notice>
        ) : null}
        <Actions>
          <Button
            variant="primary"
            iconLeft={Plus}
            loading={create.isPending}
            disabled={full}
            onClick={() => {
              handleCreate({});
            }}
          >
            New key
          </Button>
        </Actions>
        {full ? <Intro>{PROBLEM_TEXT.limit}</Intro> : null}
        {problem ? (
          <Notice $tone="error" role="alert">
            {PROBLEM_TEXT[problem]}
            {problem === 'fresh_login' ? (
              <Button variant="secondary" size="sm" onClick={handleSignInAgain}>
                Sign in again
              </Button>
            ) : null}
          </Notice>
        ) : null}
        {full ? null : (
          <Disclosure label="Advanced" ariaLabel="Advanced new key options">
            <CreateKeyAdvanced busy={create.isPending} onCreate={handleCreate} />
          </Disclosure>
        )}
      </Section>

      <ConnectClient />

      <SecretOnceSheet
        open={created !== null}
        onClose={() => {
          setCreated(null);
        }}
        title="Your new key"
        description="Copy it now. It is shown once."
        secret={created?.secret ?? ''}
      >
        {created ? (
          <CodeSnippet
            label="Claude Code with this key"
            code={claudeCodeCommand(mcpServerUrl(), created.secret)}
          />
        ) : null}
      </SecretOnceSheet>
    </Stack>
  );
}
