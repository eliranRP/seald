import type { AgentActivityItem } from 'shared';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { useAgentActivity } from './agentActivityApi';
import {
  OUTCOME_LABEL,
  OUTCOME_TONE,
  describeActivity,
  envelopePath,
  formatWhen,
  keyLabel,
} from './model';
import {
  Actions,
  Doc,
  Empty,
  Intro,
  Item,
  List,
  Meta,
  Notice,
  Section,
  SectionTitle,
  Top,
  What,
} from './AgentActivityPanel.styles';

const EMPTY = 'Nothing yet. When a key sends, reminds or changes something, it shows here.';

/** How the owner approved a finished row, when an owner approved it. */
function approvedHow(item: AgentActivityItem): string | null {
  if (item.outcome !== 'done' || item.approved_by_session === null) return null;
  return item.approved_by_session ? 'Approved signed in' : 'Approved from the email link';
}

function Row({ item }: { readonly item: AgentActivityItem }) {
  const path = envelopePath(item);
  const how = approvedHow(item);
  return (
    <Item>
      <Top>
        <What>{describeActivity(item)}</What>
        <Badge tone={OUTCOME_TONE[item.outcome]} dot={false}>
          {OUTCOME_LABEL[item.outcome]}
        </Badge>
      </Top>
      {item.title !== null ? (
        <Doc>{path ? <Link to={path}>{item.title}</Link> : item.title}</Doc>
      ) : null}
      <Meta>
        {keyLabel(item)} · {formatWhen(item.at)}
        {how ? ` · ${how}` : ''}
      </Meta>
    </Item>
  );
}

/**
 * "Agent activity" on the Developers page (docs/design/mcp-server.md,
 * Later): what each key did for the owner, newest first, 20 a page. A row
 * is a write that carries the key's attribution, or an approval the key
 * asked for (waiting, denied, expired or failed). Reads are not listed.
 * Renders nothing when the API says the list is not available.
 */
export function AgentActivityPanel() {
  const activity = useAgentActivity();

  if (activity.isLoading) {
    return (
      <Section aria-labelledby="agent-activity-title">
        <SectionTitle id="agent-activity-title">Agent activity</SectionTitle>
        <p role="status">Loading activity</p>
      </Section>
    );
  }

  if (activity.isError) {
    return (
      <Section aria-labelledby="agent-activity-title">
        <SectionTitle id="agent-activity-title">Agent activity</SectionTitle>
        <Notice role="alert">
          Couldn&apos;t load the activity.
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              void activity.refetch();
            }}
          >
            Try again
          </Button>
        </Notice>
      </Section>
    );
  }

  const pages = activity.data?.pages ?? [];
  if (pages.length === 0 || pages[0] === null) return null;
  const items: AgentActivityItem[] = pages.flatMap((page) => page?.items ?? []);

  return (
    <Section aria-labelledby="agent-activity-title">
      <SectionTitle id="agent-activity-title">Agent activity</SectionTitle>
      <Intro>What your keys did, and what they asked you to approve.</Intro>
      {items.length === 0 ? (
        <Empty>{EMPTY}</Empty>
      ) : (
        <List aria-label="Agent activity">
          {items.map((item) => (
            <Row key={`${item.source}:${item.id}`} item={item} />
          ))}
        </List>
      )}
      {activity.hasNextPage ? (
        <Actions>
          <Button
            variant="secondary"
            size="sm"
            loading={activity.isFetchingNextPage}
            onClick={() => {
              void activity.fetchNextPage();
            }}
          >
            Load more
          </Button>
        </Actions>
      ) : null}
    </Section>
  );
}
