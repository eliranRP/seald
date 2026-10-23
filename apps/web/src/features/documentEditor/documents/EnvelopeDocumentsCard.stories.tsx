import type { Meta, StoryObj } from '@storybook/react-vite';
import { chromaticViewportModes } from '@/stories/chromaticViewports';
import type { EnvelopeDocument } from 'shared';
import { EnvelopeDocumentsCard } from './EnvelopeDocumentsCard';

const meta: Meta<typeof EnvelopeDocumentsCard> = {
  title: 'L3/EnvelopeDocumentsCard',
  component: EnvelopeDocumentsCard,
  tags: ['autodocs', 'layer-3'],
  parameters: { chromatic: { modes: chromaticViewportModes } },
  decorators: [
    (Story) => (
      <div style={{ width: 380, padding: 16 }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof EnvelopeDocumentsCard>;

const DOCS: ReadonlyArray<EnvelopeDocument> = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    ord: 1,
    title: 'Master services agreement',
    original_pages: 12,
    original_sha256: 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90',
    sealed_sha256: '0f9e8d7c6b5a49382716f5e4d3c2b1a00f9e8d7c6b5a49382716f5e4d3c2b1a0',
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    ord: 2,
    title: 'Side letter',
    original_pages: 1,
    original_sha256: '1122334455667788990011223344556677889900112233445566778899001122',
    sealed_sha256: 'ffeeddccbbaa99887766554433221100ffeeddccbbaa99887766554433221100',
  },
];

export const Sealed: Story = {
  args: { documents: DOCS, sealed: true, onDownload: () => {}, onDownloadAll: () => {} },
};

export const DraftWithReorder: Story = {
  name: 'Draft (reorder and remove)',
  args: {
    documents: DOCS.map((d) => ({ ...d, sealed_sha256: null })),
    sealed: false,
    onDownload: () => {},
    onMove: () => {},
    onRemove: () => {},
  },
};

export const PreparingZip: Story = {
  args: {
    documents: DOCS,
    sealed: true,
    busyId: 'zip',
    onDownload: () => {},
    onDownloadAll: () => {},
  },
};
