import type { OwnerAutomation } from 'shared';
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

/** Off, waiting for approval, or the last run's word. */
export function stateWord(item: OwnerAutomation): StateWord | null {
  if (item.awaiting_approval) return { text: 'Waiting for approval', tone: 'warn' };
  if (!item.enabled) return { text: 'Off', tone: 'quiet' };
  const word = item.last_run?.status_word;
  if (word === 'Done') return { text: word, tone: 'ok' };
  if (word === 'Failed') return { text: word, tone: 'bad' };
  if (word === 'Retrying') return { text: word, tone: 'warn' };
  return null;
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
