import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import type { PlacedFieldValue } from '@/components/PlacedField/PlacedField.types';
import { chromaticViewportModes } from '@/stories/chromaticViewports';
import { FieldPropertiesPanel } from './FieldPropertiesPanel';

const meta: Meta<typeof FieldPropertiesPanel> = {
  title: 'L3/FieldPropertiesPanel',
  component: FieldPropertiesPanel,
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
type Story = StoryObj<typeof FieldPropertiesPanel>;

const base: PlacedFieldValue = { id: 'f1', page: 1, type: 'text', x: 0, y: 0, signerIds: ['s1'] };

function Interactive({ initial }: { readonly initial: PlacedFieldValue }) {
  const [field, setField] = useState(initial);
  return (
    <FieldPropertiesPanel
      key={field.id}
      field={field}
      onChange={(patch) =>
        setField((prev) => ({
          ...prev,
          ...(patch.required !== undefined ? { required: patch.required } : {}),
          ...('meta' in patch ? { meta: patch.meta } : {}),
        }))
      }
    />
  );
}

export const Text: Story = {
  render: () => (
    <Interactive
      initial={{ ...base, meta: { label: 'Job title', char_limit: 40, placeholder: 'Engineer' } }}
    />
  ),
};

export const NumberRange: Story = {
  render: () => (
    <Interactive
      initial={{
        ...base,
        type: 'number',
        meta: { min: 1, max: 100, format: 'thousands_fixed2', default: 10 },
      }}
    />
  ),
};

export const RadioOptions: Story = {
  render: () => (
    <Interactive
      initial={{
        ...base,
        type: 'radio',
        meta: {
          options: [
            { label: 'Monthly', value: 'monthly' },
            { label: 'Yearly', value: 'yearly' },
          ],
          default: 'yearly',
        },
      }}
    />
  ),
};

export const DropdownReadOnly: Story = {
  render: () => (
    <Interactive
      initial={{
        ...base,
        type: 'dropdown',
        meta: {
          options: [
            { label: 'Pro', value: 'pro' },
            { label: 'Team', value: 'team' },
          ],
          default: 'pro',
          read_only: true,
        },
      }}
    />
  ),
};
