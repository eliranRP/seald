import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { TagEditorPopover } from './TagEditorPopover';

const KNOWN_TAGS = ['Legal', 'Sales', 'HR', 'Construction', 'Marketing'];

const meta: Meta<typeof TagEditorPopover> = {
  title: 'L3/TagEditorPopover',
  component: TagEditorPopover,
  // L3 widget: search-or-create tag picker, used from the templates
  // list to attach/detach tags on a single template card. Stories
  // demo the empty + populated states.
  tags: ['autodocs', 'layer-3'],
  parameters: { layout: 'fullscreen' },
};
export default meta;
type Story = StoryObj<typeof TagEditorPopover>;

function Demo({ initial = [] }: { readonly initial?: ReadonlyArray<string> }) {
  const [open, setOpen] = useState(true);
  const [current, setCurrent] = useState<ReadonlyArray<string>>(initial);
  const [allTags, setAllTags] = useState<ReadonlyArray<string>>(KNOWN_TAGS);
  return (
    <div style={{ minHeight: 360 }}>
      <button type="button" onClick={() => setOpen(true)}>
        Open editor
      </button>
      <pre style={{ marginTop: 12 }}>{JSON.stringify({ current, allTags }, null, 2)}</pre>
      <TagEditorPopover
        open={open}
        currentTags={current}
        allTags={allTags}
        onToggle={(tag) => {
          setCurrent((prev) =>
            prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
          );
        }}
        onCreate={(tag) => {
          setAllTags((prev) => (prev.includes(tag) ? prev : [...prev, tag]));
          setCurrent((prev) => (prev.includes(tag) ? prev : [...prev, tag]));
        }}
        onClose={() => setOpen(false)}
      />
    </div>
  );
}

export const Default: Story = {
  render: () => <Demo />,
};

export const WithCurrentTags: Story = {
  render: () => <Demo initial={['Legal', 'Sales']} />,
};
