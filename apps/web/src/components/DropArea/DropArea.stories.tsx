import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { DropArea } from './DropArea';

const meta: Meta<typeof DropArea> = {
  title: 'L3/DropArea',
  component: DropArea,
  // Layer-3 widget: a self-contained drag/drop dropzone shared by the
  // signer-flow upload page and the templates wizard's "Upload a new one"
  // branch. Stories cover the default copy + the templates-wizard copy
  // so designers can A/B the heading/subheading without re-mounting.
  tags: ['autodocs', 'layer-3'],
  parameters: {
    layout: 'centered',
  },
};
export default meta;
type Story = StoryObj<typeof DropArea>;

function Demo({
  heading,
  subheading,
}: {
  readonly heading?: string;
  readonly subheading?: string;
}) {
  const [last, setLast] = useState<{ name: string; size: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div style={{ width: 480 }}>
      <DropArea
        onFileSelected={(f) => {
          setErr(null);
          setLast({ name: f.name, size: f.size });
        }}
        onError={(_, m) => setErr(m)}
        {...(heading !== undefined ? { heading } : {})}
        {...(subheading !== undefined ? { subheading } : {})}
      />
      {last ? (
        <pre style={{ marginTop: 12 }}>
          {JSON.stringify({ ...last, sizeMB: (last.size / 1024 / 1024).toFixed(2) }, null, 2)}
        </pre>
      ) : null}
      {err ? <p style={{ marginTop: 12, color: '#B91C1C' }}>{err}</p> : null}
    </div>
  );
}

export const Default: Story = {
  render: () => <Demo />,
};

export const TemplatesNewBranch: Story = {
  // Copy used by `/templates/new/use` Step 1 — when the user is creating
  // a brand-new template and the dropped PDF becomes its example doc.
  render: () => (
    <Demo
      heading="Drop your example PDF"
      subheading="We'll use it as the template's example document · up to 25 MB"
    />
  ),
};

export const TemplatesUseBranch: Story = {
  // Copy used by `/templates/:id/use` Step 1 → "Upload a new one"
  // segmented choice, when the user wants to apply a saved layout to
  // a freshly-uploaded PDF.
  render: () => (
    <Demo
      heading="Drop a different PDF"
      subheading="Saved layout will snap onto it · up to 25 MB"
    />
  ),
};
