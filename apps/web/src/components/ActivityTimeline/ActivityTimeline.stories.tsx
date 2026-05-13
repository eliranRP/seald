import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  Eye,
  FilePlus,
  PenTool,
  PencilRuler,
  Send,
  ShieldCheck,
  Clock,
  XCircle,
} from 'lucide-react';
import { ActivityTimeline } from './ActivityTimeline';

const meta: Meta<typeof ActivityTimeline> = {
  title: 'L2/ActivityTimeline',
  component: ActivityTimeline,
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 680 }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof ActivityTimeline>;

export const Complete: Story = {
  args: {
    staggerMs: 140,
    events: [
      {
        id: '1',
        icon: FilePlus,
        tone: 'indigo',
        text: 'Envelope created',
        by: 'You',
        at: 'Apr 17 · 09:14 AM',
        kind: 'created',
      },
      {
        id: '1b',
        icon: FilePlus,
        tone: 'indigo',
        text: 'PDF uploaded — 4 pages',
        by: 'You',
        at: 'Apr 17 · 09:14 AM',
        kind: 'pdf_uploaded',
      },
      {
        id: '2',
        icon: PencilRuler,
        tone: 'indigo',
        text: 'Placed 2 signers and 5 fields',
        by: 'You',
        at: 'Apr 17 · 09:22 AM',
        kind: 'prepared',
      },
      {
        id: '3',
        icon: Send,
        tone: 'indigo',
        text: 'Sent to 2 signers',
        by: 'You',
        at: 'Apr 18 · 10:42 AM',
        kind: 'sent',
      },
      {
        id: '4',
        icon: Eye,
        tone: 'slate',
        text: 'Opened the envelope',
        by: 'Maya Raskin',
        at: 'Apr 18 · 11:05 AM',
        kind: 'viewed',
      },
      {
        id: '5',
        icon: PenTool,
        tone: 'success',
        text: 'Signed the document',
        by: 'Maya Raskin',
        at: 'Apr 18 · 11:12 AM',
        kind: 'signed',
      },
      {
        id: '6',
        icon: ShieldCheck,
        tone: 'success',
        text: 'Envelope sealed — audit trail locked',
        by: 'System',
        at: 'Apr 18 · 11:12 AM',
        kind: 'completed',
      },
    ],
  },
};

export const Pending: Story = {
  args: {
    staggerMs: 0,
    events: [
      {
        id: '1',
        icon: Send,
        tone: 'indigo',
        text: 'Sent to Bob',
        by: 'You',
        at: 'Apr 18 · 10:42 AM',
        kind: 'sent',
      },
      {
        id: '2',
        icon: Clock,
        tone: 'amber',
        text: 'Waiting on your signature',
        by: 'Bob Byte',
        at: null,
        kind: 'pending',
        pending: true,
      },
    ],
  },
};

export const Declined: Story = {
  args: {
    staggerMs: 0,
    events: [
      {
        id: '1',
        icon: Send,
        tone: 'indigo',
        text: 'Sent to 2 signers',
        by: 'You',
        at: 'Apr 18 · 10:42 AM',
        kind: 'sent',
      },
      {
        id: '2',
        icon: XCircle,
        tone: 'danger',
        text: 'Declined to sign — "Terms on page 3 need renegotiation"',
        by: 'Maya Raskin',
        at: 'Apr 19 · 08:30 AM',
        kind: 'declined',
      },
    ],
  },
};
