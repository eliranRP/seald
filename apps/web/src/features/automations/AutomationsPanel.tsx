import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MAX_AUTOMATIONS_PER_OWNER } from 'shared';
import { Button } from '@/components/Button';
import { Disclosure } from '@/components/Disclosure';
import { AutomationList } from './AutomationList';
import { NotAvailable } from './NotAvailable';
import { RecipeGallery } from './RecipeGallery';
import { useAutomations, useCreateAutomation, useUpdateAutomation } from './automationsApi';
import { Intro, Muted, Notice, Section, Stack } from './automations.styles';
import { recipeCards, saveProblem, type RecipeCard } from './model';

export interface AutomationsPanelProps {
  /** `/settings/automations` or `/m/settings/automations`. */
  readonly basePath: string;
}

/**
 * The automations page body. With none yet, the recipe gallery is the page.
 * Otherwise the list comes first, a switch per automation, and the gallery
 * sits below it for the next one.
 */
export function AutomationsPanel({ basePath }: AutomationsPanelProps) {
  const list = useAutomations();
  const create = useCreateAutomation();
  const update = useUpdateAutomation();
  const navigate = useNavigate();
  const [busyCard, setBusyCard] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [turnedOn, setTurnedOn] = useState<string | null>(null);

  if (list.isLoading) {
    return (
      <Stack>
        <p role="status">Loading automations</p>
      </Stack>
    );
  }
  if (list.data === null) return <NotAvailable />;
  if (list.isError || !list.data) {
    return (
      <Stack>
        <Notice $tone="error" role="alert">
          Couldn&apos;t load your automations.
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              void list.refetch();
            }}
          >
            Try again
          </Button>
        </Notice>
      </Stack>
    );
  }

  const items = list.data.items;
  const full = items.length >= MAX_AUTOMATIONS_PER_OWNER;

  const handleUse = (card: RecipeCard): void => {
    setProblem(null);
    setTurnedOn(null);
    if (card.kind === 'webhook') {
      navigate(`${basePath}/new?recipe=${card.id}`);
      return;
    }
    setBusyCard(card.id);
    create.mutate(
      { recipe: card.id },
      {
        onSuccess: () => {
          setTurnedOn(card.title);
        },
        onError: (err) => {
          setProblem(saveProblem(err));
        },
        onSettled: () => {
          setBusyCard(null);
        },
      },
    );
  };

  return (
    <Stack>
      <Intro>Do something automatically when a document is sent, signed or sealed.</Intro>
      {problem ? (
        <Notice $tone="error" role="alert">
          {problem}
        </Notice>
      ) : null}
      {turnedOn ? <Notice role="status">Turned on: {turnedOn}.</Notice> : null}
      {items.length > 0 ? (
        <Section aria-label="Automations">
          <AutomationList
            items={items}
            basePath={basePath}
            pendingId={update.isPending ? update.variables.id : null}
            onToggle={(id, enabled) => {
              setProblem(null);
              update.mutate(
                { id, body: { enabled } },
                {
                  onError: () => {
                    setProblem("Couldn't change that switch. Try again.");
                  },
                },
              );
            }}
          />
          <Disclosure label="Advanced" ariaLabel="Advanced list options">
            <Muted>
              {items.length} of {MAX_AUTOMATIONS_PER_OWNER} automations
            </Muted>
          </Disclosure>
        </Section>
      ) : null}
      {full ? (
        <Muted>You have {MAX_AUTOMATIONS_PER_OWNER} automations. Delete one to add another.</Muted>
      ) : (
        <RecipeGallery
          cards={recipeCards()}
          heading={items.length > 0 ? 'Add another' : 'Pick one to start'}
          busyId={busyCard}
          onUse={handleUse}
        />
      )}
    </Stack>
  );
}
