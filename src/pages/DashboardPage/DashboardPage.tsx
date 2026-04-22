import { useMemo, useState } from 'react';
import { UploadCloud } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Avatar } from '../../components/Avatar';
import { Badge } from '../../components/Badge';
import type { BadgeTone } from '../../components/Badge/Badge.types';
import { Button } from '../../components/Button';
import { DocThumb } from '../../components/DocThumb';
import { useAppState } from '../../providers/AppStateProvider';
import type { AppDocument, DocumentStatus } from '../../providers/AppStateProvider';
import {
  DateCell,
  DocCell,
  DocCode,
  DocTitle,
  EmptyState,
  Eyebrow,
  HeaderActions,
  HeaderRow,
  Inner,
  Main,
  RecipientCell,
  RecipientLabel,
  StatCard,
  StatGrid,
  StatLabel,
  StatValue,
  TableHead,
  TableRow,
  TableShell,
  TabButton,
  TabCount,
  Tabs,
  Title,
  TitleBlock,
} from './DashboardPage.styles';

type FilterId = 'all' | 'you' | 'others' | 'completed' | 'drafts';

interface FilterDef {
  readonly id: FilterId;
  readonly label: string;
  readonly matches: (d: AppDocument) => boolean;
}

const FILTERS: ReadonlyArray<FilterDef> = [
  { id: 'all', label: 'All', matches: () => true },
  { id: 'you', label: 'Awaiting you', matches: (d) => d.status === 'awaiting-you' },
  { id: 'others', label: 'Awaiting others', matches: (d) => d.status === 'awaiting-others' },
  { id: 'completed', label: 'Completed', matches: (d) => d.status === 'completed' },
  { id: 'drafts', label: 'Drafts', matches: (d) => d.status === 'draft' },
];

const STATUS_LABEL: Record<DocumentStatus, string> = {
  draft: 'Draft',
  'awaiting-you': 'Awaiting you',
  'awaiting-others': 'Awaiting others',
  completed: 'Completed',
  declined: 'Declined',
};

const STATUS_TONE: Record<DocumentStatus, BadgeTone> = {
  draft: 'neutral',
  'awaiting-you': 'indigo',
  'awaiting-others': 'amber',
  completed: 'emerald',
  declined: 'red',
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: '2-digit' });
}

function primaryRecipient(d: AppDocument): { name: string; email: string } | null {
  const first = d.signers[0];
  if (!first) return null;
  return { name: first.name, email: first.email };
}

/**
 * L4 page — the dashboard / inbox view listing every document the user has
 * created or received. Pulls documents from `useAppState` and renders the
 * filter tabs + table from `Design-Guide/ui_kits/dashboard`.
 */
export function DashboardPage() {
  const { documents } = useAppState();
  const navigate = useNavigate();
  const [tab, setTab] = useState<FilterId>('all');

  const counts = useMemo(() => {
    const byFilter = new Map<FilterId, number>();
    FILTERS.forEach((f) => {
      byFilter.set(f.id, documents.filter(f.matches).length);
    });
    return byFilter;
  }, [documents]);

  const filtered = useMemo(() => {
    const match = FILTERS.find((f) => f.id === tab) ?? FILTERS[0]!;
    return documents.filter(match.matches);
  }, [documents, tab]);

  const stats = useMemo(() => {
    const awaitingYou = documents.filter((d) => d.status === 'awaiting-you').length;
    const awaitingOthers = documents.filter((d) => d.status === 'awaiting-others').length;
    const completedThisMonth = documents.filter((d) => {
      if (d.status !== 'completed') return false;
      const when = new Date(d.updatedAt);
      const now = new Date();
      return when.getFullYear() === now.getFullYear() && when.getMonth() === now.getMonth();
    }).length;
    return [
      { label: 'Awaiting you', value: awaitingYou.toString(), tone: 'indigo' as const },
      { label: 'Awaiting others', value: awaitingOthers.toString(), tone: 'amber' as const },
      {
        label: 'Completed this month',
        value: completedThisMonth.toString(),
        tone: 'emerald' as const,
      },
      { label: 'Total', value: documents.length.toString(), tone: 'neutral' as const },
    ];
  }, [documents]);

  return (
    <Main>
      <Inner>
        <HeaderRow>
          <TitleBlock>
            <Eyebrow>Documents</Eyebrow>
            <Title>Everything you&apos;ve sent</Title>
          </TitleBlock>
          <HeaderActions>
            <Button
              variant="primary"
              iconLeft={UploadCloud}
              onClick={() => navigate('/document/new')}
            >
              New document
            </Button>
          </HeaderActions>
        </HeaderRow>

        <StatGrid>
          {stats.map((s) => (
            <StatCard key={s.label}>
              <StatLabel>{s.label}</StatLabel>
              <StatValue $tone={s.tone}>{s.value}</StatValue>
            </StatCard>
          ))}
        </StatGrid>

        <Tabs role="tablist" aria-label="Document filters">
          {FILTERS.map((f) => (
            <TabButton
              key={f.id}
              role="tab"
              type="button"
              aria-selected={tab === f.id}
              $active={tab === f.id}
              onClick={() => setTab(f.id)}
            >
              {f.label}
              <TabCount aria-label={`${counts.get(f.id) ?? 0} items`}>
                {counts.get(f.id) ?? 0}
              </TabCount>
            </TabButton>
          ))}
        </Tabs>

        <TableShell>
          <TableHead role="row">
            <div>Document</div>
            <div>Recipient</div>
            <div>Status</div>
            <div>Date</div>
            <div aria-hidden />
          </TableHead>
          {filtered.length === 0 ? (
            <EmptyState>No documents match this filter.</EmptyState>
          ) : (
            filtered.map((d) => {
              const recipient = primaryRecipient(d);
              return (
                <TableRow
                  key={d.id}
                  type="button"
                  onClick={() => navigate(`/document/${d.id}`)}
                  aria-label={`Open ${d.title}`}
                >
                  <DocCell>
                    <DocThumb size={40} title={d.title} signed={d.status === 'completed'} />
                    <div style={{ minWidth: 0 }}>
                      <DocTitle>{d.title}</DocTitle>
                      <DocCode>{d.code}</DocCode>
                    </div>
                  </DocCell>
                  <RecipientCell>
                    {recipient ? (
                      <>
                        <Avatar name={recipient.name} size={24} />
                        <RecipientLabel>{recipient.name}</RecipientLabel>
                      </>
                    ) : (
                      <RecipientLabel>—</RecipientLabel>
                    )}
                  </RecipientCell>
                  <div>
                    <Badge tone={STATUS_TONE[d.status]}>{STATUS_LABEL[d.status]}</Badge>
                  </div>
                  <DateCell>{formatDate(d.updatedAt)}</DateCell>
                  <div aria-hidden />
                </TableRow>
              );
            })
          )}
        </TableShell>
      </Inner>
    </Main>
  );
}
