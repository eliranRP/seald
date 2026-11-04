import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { RotateSecretResponse } from 'shared';
import { Button } from '@/components/Button';
import { Disclosure } from '@/components/Disclosure';
import { SecretOnceSheet } from '@/components/SecretOnceSheet';
import { Switch } from '@/components/Switch';
import {
  useAutomation,
  useDeleteAutomation,
  useRotateSecret,
  useUpdateAutomation,
} from './automationsApi';
import { stateWord } from './AutomationList';
import { EditAutomationForm } from './EditAutomationForm';
import { RunHistory } from './RunHistory';
import { TestEvent } from './TestEvent';
import {
  Actions,
  BackLink,
  Facts,
  Intro,
  Notice,
  Section,
  SectionTitle,
  Stack,
  TitleRow,
  Word,
} from './automations.styles';
import { TRIGGER_LABELS, saveProblem, type FixTarget } from './model';

export interface AutomationDetailProps {
  readonly id: string;
  /** The automations list page, for Back and after a delete. */
  readonly listPath: string;
  /** The Drive integration page, where Fix goes for a Drive connection problem. */
  readonly integrationsPath: string;
}

function destinationText(action: string, host: string | null): string {
  if (action === 'webhook') return host ?? 'Your webhook address';
  if (action === 'gdrive_upload') return 'My Drive / Seald';
  return 'The email address on your account';
}

/** One automation: switch, where it goes, secret, edit, run history, test, delete. */
export function AutomationDetail({ id, listPath, integrationsPath }: AutomationDetailProps) {
  const detail = useAutomation(id);
  const update = useUpdateAutomation();
  const rotate = useRotateSecret();
  const remove = useDeleteAutomation();
  const navigate = useNavigate();
  const fixFieldRef = useRef<HTMLInputElement>(null);
  const [rotated, setRotated] = useState<RotateSecretResponse | null>(null);
  const [rotateFailed, setRotateFailed] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [saved, setSaved] = useState(false);

  if (detail.isLoading) return <p role="status">Loading</p>;
  if (detail.isError) {
    return (
      <Notice $tone="error" role="alert">
        Couldn&apos;t load this automation.
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            void detail.refetch();
          }}
        >
          Try again
        </Button>
      </Notice>
    );
  }
  const automation = detail.data;
  if (!automation) {
    return (
      <Stack>
        <Intro role="status">We couldn&apos;t find that automation.</Intro>
        <BackLink to={listPath}>Back to automations</BackLink>
      </Stack>
    );
  }

  const webhook = automation.action === 'webhook';
  const word = stateWord(automation);

  const handleFix = (target: FixTarget): void => {
    if (target === 'integrations') {
      navigate(integrationsPath);
      return;
    }
    fixFieldRef.current?.focus();
  };

  return (
    <Stack>
      <Section aria-labelledby="automation-name">
        <TitleRow>
          <SectionTitle id="automation-name">{automation.name}</SectionTitle>
          <Switch
            label={automation.name}
            checked={automation.enabled}
            pending={update.isPending && update.variables.body.enabled !== undefined}
            onChange={(enabled) => {
              update.mutate({ id, body: { enabled } });
            }}
          />
        </TitleRow>
        {word ? <Word $tone={word.tone}>{word.text}</Word> : null}
        {automation.awaiting_approval ? (
          <Notice role="status">
            An app asked to set this up. It stays off until you turn it on here or approve it.
          </Notice>
        ) : null}
        <Facts>
          <dt>Runs when</dt>
          <dd>{TRIGGER_LABELS[automation.trigger]}</dd>
          <dt>Goes to</dt>
          <dd>{destinationText(automation.action, automation.destination_host)}</dd>
          {webhook ? (
            <>
              <dt>Secret</dt>
              <dd>Secret set</dd>
            </>
          ) : null}
        </Facts>
        {webhook ? (
          <Actions>
            <Button
              variant="secondary"
              loading={rotate.isPending}
              onClick={() => {
                setRotateFailed(false);
                rotate.mutate(id, {
                  onSuccess: setRotated,
                  onError: () => {
                    setRotateFailed(true);
                  },
                });
              }}
            >
              Rotate secret
            </Button>
          </Actions>
        ) : null}
        {rotateFailed ? (
          <Notice $tone="error" role="alert">
            Couldn&apos;t rotate the secret. Try again.
          </Notice>
        ) : null}
      </Section>

      <Section aria-labelledby="automation-edit">
        <SectionTitle id="automation-edit">Edit</SectionTitle>
        <EditAutomationForm
          key={automation.updated_at}
          automation={automation}
          busy={update.isPending && update.variables.body.enabled === undefined}
          problem={update.isError ? saveProblem(update.error) : undefined}
          saved={saved}
          fixFieldRef={fixFieldRef}
          onSave={(body) => {
            setSaved(false);
            update.mutate(
              { id, body },
              {
                onSuccess: () => {
                  setSaved(true);
                },
              },
            );
          }}
        />
      </Section>

      <Section aria-labelledby="automation-runs">
        <SectionTitle id="automation-runs">Run history</SectionTitle>
        <RunHistory automationId={id} onFix={handleFix} />
      </Section>

      <Disclosure label="Advanced" ariaLabel="Advanced automation options">
        <Stack>
          {webhook ? (
            <TestEvent automationId={id} awaitingApproval={automation.awaiting_approval} />
          ) : null}
          <Section aria-labelledby="automation-delete">
            <SectionTitle id="automation-delete">Delete</SectionTitle>
            {confirmingDelete ? (
              <>
                <Intro>Delete this automation and its run history? This cannot be undone.</Intro>
                <Actions>
                  <Button
                    variant="danger"
                    loading={remove.isPending}
                    onClick={() => {
                      remove.mutate(id, {
                        onSuccess: () => {
                          navigate(listPath);
                        },
                      });
                    }}
                  >
                    Delete
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setConfirmingDelete(false);
                    }}
                  >
                    Cancel
                  </Button>
                </Actions>
                {remove.isError ? (
                  <Notice $tone="error" role="alert">
                    Couldn&apos;t delete it. Try again.
                  </Notice>
                ) : null}
              </>
            ) : (
              <Actions>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setConfirmingDelete(true);
                  }}
                >
                  Delete automation
                </Button>
              </Actions>
            )}
          </Section>
        </Stack>
      </Disclosure>

      <SecretOnceSheet
        open={rotated !== null}
        onClose={() => {
          setRotated(null);
        }}
        title="Your new signing secret"
        description="Copy it now. It is shown once."
        secret={rotated?.secret ?? ''}
      >
        <Intro>The old secret keeps working for 24 hours.</Intro>
      </SecretOnceSheet>
    </Stack>
  );
}
