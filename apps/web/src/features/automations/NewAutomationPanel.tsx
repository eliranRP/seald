import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { SecretOnceSheet } from '@/components/SecretOnceSheet';
import { NewAutomationForm } from './NewAutomationForm';
import { useCreateAutomation } from './automationsApi';
import { BackLink, Intro, Stack } from './automations.styles';
import { recipeCard, saveProblem } from './model';

export interface NewAutomationPanelProps {
  readonly basePath: string;
}

/**
 * `/settings/automations/new?recipe=<id>`. Save turns the automation on. A
 * webhook then shows its signing secret once, and closing the sheet opens
 * the automation.
 */
export function NewAutomationPanel({ basePath }: NewAutomationPanelProps) {
  const [params] = useSearchParams();
  const card = recipeCard(params.get('recipe'));
  const create = useCreateAutomation();
  const navigate = useNavigate();
  const [created, setCreated] = useState<{ id: string; secret: string } | null>(null);

  if (!card) {
    return (
      <Stack>
        <Intro role="status">Pick an automation first.</Intro>
        <BackLink to={basePath}>Back to automations</BackLink>
      </Stack>
    );
  }

  return (
    <Stack>
      <NewAutomationForm
        card={card}
        busy={create.isPending}
        problem={create.isError ? saveProblem(create.error) : undefined}
        onCancel={() => {
          navigate(basePath);
        }}
        onSave={(body) => {
          create.mutate(body, {
            onSuccess: (res) => {
              if (res.secret) setCreated({ id: res.automation.id, secret: res.secret });
              else navigate(basePath);
            },
          });
        }}
      />
      <SecretOnceSheet
        open={created !== null}
        onClose={() => {
          if (created) navigate(`${basePath}/${created.id}`);
          setCreated(null);
        }}
        title="Your signing secret"
        description="Copy it now. It is shown once."
        secret={created?.secret ?? ''}
      />
    </Stack>
  );
}
