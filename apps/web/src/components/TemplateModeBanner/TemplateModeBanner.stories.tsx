import type { Meta, StoryObj } from '@storybook/react-vite';
import { TemplateModeBanner } from './TemplateModeBanner';

const meta: Meta<typeof TemplateModeBanner> = {
  title: 'L3/TemplateModeBanner',
  component: TemplateModeBanner,
  // Contextual banner the editor surfaces when the user arrived from
  // the templates wizard. Three real-world copies + a generic
  // dismissible variant.
  tags: ['autodocs', 'layer-3'],
  parameters: { layout: 'padded' },
};
export default meta;
type Story = StoryObj<typeof TemplateModeBanner>;

export const NewTemplate: Story = {
  // 'new' mode — sender is authoring a brand-new template; the editor
  // is the last step before saving.
  render: () => (
    <TemplateModeBanner
      tone="success"
      title="Last step — place fields, then save as template"
      subtitle={`Drop fields where they should appear. When you're done, hit "Save as template" in the right panel to make this reusable.`}
    />
  ),
};

export const SavedDocLoaded: Story = {
  // 'using' mode — saved layout loaded onto its example doc.
  render: () => (
    <TemplateModeBanner
      tone="info"
      title="Saved layout loaded · 8 fields across 6 pages"
      subtitle={`Edit anything you'd like, then send. Save changes back to the template if you want them to stick.`}
    />
  ),
};

export const AdaptedToNewDoc: Story = {
  // 'using' mode — saved layout adapted onto a fresh upload.
  render: () => (
    <TemplateModeBanner
      tone="info"
      title="Saved layout adapted to your new document · 8 fields across 9 pages"
      subtitle="Field rules adjusted for the new page count. Drag any field to nudge it, then send."
    />
  ),
};

export const Dismissible: Story = {
  render: () => (
    <TemplateModeBanner
      tone="info"
      title="Working from a saved template"
      subtitle="Field layout was loaded from a template. Adjust as needed before sending."
      onDismiss={() => {}}
    />
  ),
};
