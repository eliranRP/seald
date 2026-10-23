import type { Meta, StoryObj } from '@storybook/react-vite';
import { chromaticViewportModes } from '@/stories/chromaticViewports';
import { useState } from 'react';
import { DocumentList } from './DocumentList';
import type { DocumentListItem } from './DocumentList';
import { moveItem } from './model';

const meta: Meta<typeof DocumentList> = {
  title: 'L3/DocumentList',
  component: DocumentList,
  tags: ['autodocs', 'layer-3'],
  parameters: { chromatic: { modes: chromaticViewportModes } },
  decorators: [
    (Story) => (
      <div style={{ width: 320, padding: 16 }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof DocumentList>;

const DOCS: ReadonlyArray<DocumentListItem> = [
  { id: 'd1', title: 'Master services agreement', pages: 12 },
  { id: 'd2', title: 'Side letter', pages: 1 },
  { id: 'd3', title: 'Schedule A — pricing', pages: 3 },
];

function Interactive() {
  const [docs, setDocs] = useState<ReadonlyArray<DocumentListItem>>(DOCS);
  const [active, setActive] = useState('d1');
  return (
    <DocumentList
      documents={docs}
      activeId={active}
      onSelect={setActive}
      onReorder={(ids) =>
        setDocs((prev) => {
          let next = [...prev];
          ids.forEach((id, to) => {
            const from = next.findIndex((d) => d.id === id);
            next = moveItem(next, from, to);
          });
          return next;
        })
      }
      onRemove={(id) => setDocs((prev) => prev.filter((d) => d.id !== id))}
      onAddFiles={(files) =>
        setDocs((prev) => [
          ...prev,
          ...files.map((f) => ({
            id: `${f.name}-${String(prev.length)}`,
            title: f.name.replace(/\.pdf$/i, ''),
            pages: 1,
          })),
        ])
      }
    />
  );
}

export const Default: Story = { render: () => <Interactive /> };

export const WithDrive: Story = {
  args: {
    documents: DOCS,
    activeId: 'd2',
    onSelect: () => {},
    onReorder: () => {},
    onRemove: () => {},
    onAddFiles: () => {},
    onAddFromDrive: () => {},
  },
};

export const SingleDocument: Story = {
  name: 'Single document (add only)',
  args: { documents: [DOCS[0]!], activeId: 'd1', onSelect: () => {}, onAddFiles: () => {} },
};

export const AtLimit: Story = {
  name: 'At the document limit',
  args: {
    documents: DOCS,
    activeId: 'd1',
    maxDocuments: 3,
    onSelect: () => {},
    onReorder: () => {},
    onAddFiles: () => {},
  },
};
