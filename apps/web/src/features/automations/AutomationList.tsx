import type { AutomationRunStatus, OwnerAutomation } from 'shared';
import { Switch } from '@/components/Switch';
import { Row, RowLink, RowMeta, RowText, Rows, Word } from './automations.styles';

export interface AutomationListProps {
  readonly items: readonly OwnerAutomation[];
  /** Where a recipe's own page lives, without a trailing slash. */
  readonly basePath: string;
  /** The recipe whose switch is saving. */
  readonly pendingId?: string | null | undefined;
  readonly onToggle: (id: string, enabled: boolean) => void;
}

interface StateWord {
  readonly text: string;
  readonly tone: 'ok' | 'warn' | 'bad' | 'quiet';
}

/**
 * The last run's word, keyed on the run status enum (`AUTOMATION_RUN_STATUSES`),
 * never on the server's display text. A queued or running run shows nothing.
 * The `Record` makes a new run status a type error here until it is mapped.
 */
const RUN_STATE_WORD: Readonly<Record<AutomationRunStatus, StateWord | null>> = {
  queued: null,
  running: null,
  done: { text: 'Done', tone: 'ok' },
  retrying: { text: 'Retrying', tone: 'warn' },
  failed: { text: 'Failed', tone: 'bad' },
};

/** Off, waiting for approval, or the last run's word. */
export function stateWord(item: OwnerAutomation): StateWord | null {
  if (item.awaiting_approval) return { text: 'Waiting for approval', tone: 'warn' };
  if (!item.enabled) return { text: 'Off', tone: 'quiet' };
  const status = item.last_run?.status;
  return status ? RUN_STATE_WORD[status] : null;
}

function destination(item: OwnerAutomation): string {
  if (item.action === 'webhook') return item.destination_host ?? 'Webhook';
  if (item.action === 'gdrive_upload') return 'My Drive / Seald';
  return 'Your inbox';
}

/** One row per automation: name, where it goes, the last-run word, and an on/off switch. */
export function AutomationList({
  items,
  basePath,
  pendingId = null,
  onToggle,
}: AutomationListProps) {
  return (
    <Rows aria-label="Your automations">
      {items.map((item) => {
        const word = stateWord(item);
        return (
          <Row key={item.id}>
            <RowText>
              <RowLink to={`${basePath}/${item.id}`}>{item.name}</RowLink>
              <RowMeta>
                <span>{destination(item)}</span>
                {item.secret_set ? <span>Secret set</span> : null}
                {word ? <Word $tone={word.tone}>{word.text}</Word> : null}
              </RowMeta>
            </RowText>
            <Switch
              label={item.name}
              checked={item.enabled}
              pending={pendingId === item.id}
              onChange={(checked) => {
                onToggle(item.id, checked);
              }}
            />
          </Row>
        );
      })}
    </Rows>
  );
}
