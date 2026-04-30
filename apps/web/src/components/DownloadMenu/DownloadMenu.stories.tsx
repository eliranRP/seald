import type { Meta, StoryObj } from '@storybook/react-vite';
import { FileCheck2, FileText, Package, ShieldCheck } from 'lucide-react';
import { DownloadMenu } from './DownloadMenu';
import type { DownloadMenuItem } from './DownloadMenu.types';

const original: DownloadMenuItem = {
  kind: 'original',
  icon: FileText,
  title: 'Original PDF',
  description: 'The document as uploaded — no signatures, no fields.',
  meta: '4 pages · 214 KB',
  available: true,
};

const sealed = (available: boolean): DownloadMenuItem => ({
  kind: 'sealed',
  icon: FileCheck2,
  title: 'Sealed PDF',
  description: 'Final signed document with all fields filled and certificate page.',
  meta: available ? '5 pages · 312 KB · PAdES-LT' : 'Available once all signers complete',
  available,
  recommended: available,
  primaryLabel: 'sealed PDF',
});

const audit: DownloadMenuItem = {
  kind: 'audit',
  icon: ShieldCheck,
  title: 'Audit trail',
  description: 'Cryptographic event log — IPs, timestamps, hashes.',
  meta: 'PDF · 2 pages',
  available: true,
};

const bundle = (available: boolean): DownloadMenuItem => ({
  kind: 'bundle',
  icon: Package,
  title: 'Full package',
  description: 'Sealed PDF + audit trail bundled together.',
  meta: available ? '.zip · 428 KB' : 'Available once sealed',
  available,
});

const meta: Meta<typeof DownloadMenu> = {
  title: 'L3/DownloadMenu',
  component: DownloadMenu,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div style={{ padding: 140, display: 'flex', justifyContent: 'flex-end' }}>
        <Story />
      </div>
    ),
  ],
  args: {
    onSelect: () => {},
  },
};
export default meta;
type Story = StoryObj<typeof DownloadMenu>;

export const Draft: Story = {
  args: {
    items: [
      { ...original, available: false },
      sealed(false),
      { ...audit, available: false },
      bundle(false),
    ],
  },
  parameters: {
    docs: {
      description: {
        story:
          'Draft envelope — nothing has been sent yet, so nothing is downloadable. Every row is LOCKED.',
      },
    },
  },
};

export const InFlight: Story = {
  args: {
    items: [original, sealed(false), audit, bundle(false)],
  },
  parameters: {
    docs: {
      description: {
        story:
          'Envelope sent, waiting on signers. Original PDF and audit trail are downloadable; sealed + bundle are LOCKED until completion.',
      },
    },
  },
};

export const Completed: Story = {
  args: {
    items: [original, sealed(true), audit, bundle(true)],
  },
  parameters: {
    docs: {
      description: {
        story:
          'Fully sealed envelope — every artifact is downloadable. Sealed PDF is RECOMMENDED and drives the split-button primary action.',
      },
    },
  },
};

export const DownloadingSealed: Story = {
  args: {
    items: [original, sealed(true), audit, bundle(true)],
    inFlight: 'sealed',
  },
  parameters: {
    docs: {
      description: {
        story:
          'The sealed row is being prepared — the icon tile spins and the meta line reads "Preparing…".',
      },
    },
  },
};
