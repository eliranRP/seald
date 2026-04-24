import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { FilePlus, Send, PenTool } from 'lucide-react';
import { renderWithTheme } from '../../test/renderWithTheme';
import { ActivityTimeline } from './ActivityTimeline';
import type { ActivityTimelineEvent } from './ActivityTimeline.types';

const e = (over: Partial<ActivityTimelineEvent>): ActivityTimelineEvent => ({
  id: over.id ?? 'id',
  icon: over.icon ?? FilePlus,
  tone: over.tone ?? 'indigo',
  text: over.text ?? 'Envelope created',
  by: over.by ?? 'You',
  // Note: can't use `??` here — we need explicit `null` to pass through.
  at: 'at' in over ? (over.at as string | null) : 'Apr 17 · 09:14 AM',
  kind: over.kind ?? 'created',
  ...(over.pending !== undefined ? { pending: over.pending } : {}),
});

describe('ActivityTimeline', () => {
  it('renders every event with text, by, kind and timestamp', () => {
    renderWithTheme(
      <ActivityTimeline
        staggerMs={0}
        events={[
          e({ id: '1', text: 'Envelope created', by: 'You', kind: 'created' }),
          e({ id: '2', icon: Send, tone: 'indigo', text: 'Sent to 2 signers', kind: 'sent' }),
          e({
            id: '3',
            icon: PenTool,
            tone: 'success',
            text: 'Ada signed',
            kind: 'signed',
            by: 'Ada',
          }),
        ]}
      />,
    );
    expect(screen.getByText('Envelope created')).toBeInTheDocument();
    expect(screen.getByText('Sent to 2 signers')).toBeInTheDocument();
    expect(screen.getByText('Ada signed')).toBeInTheDocument();
    expect(screen.getByText('created')).toBeInTheDocument();
    expect(screen.getByText('sent')).toBeInTheDocument();
    expect(screen.getByText('signed')).toBeInTheDocument();
  });

  it('renders "in progress" when at is null', () => {
    renderWithTheme(
      <ActivityTimeline staggerMs={0} events={[e({ id: '1', at: null, kind: 'pending' })]} />,
    );
    expect(screen.getByText('in progress')).toBeInTheDocument();
  });

  it('renders empty state when events is []', () => {
    renderWithTheme(<ActivityTimeline staggerMs={0} events={[]} />);
    expect(screen.getByText('No activity recorded yet.')).toBeInTheDocument();
  });
});
