import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { chromaticViewportModes } from '@/stories/chromaticViewports';
import { Checkbox } from './Checkbox';

function Demo() {
  const [checked, setChecked] = useState(false);
  return (
    <Checkbox
      label="Send"
      helpText="Needs a recent sign-in."
      checked={checked}
      onChange={setChecked}
    />
  );
}

const meta: Meta<typeof Checkbox> = {
  title: 'L1/Checkbox',
  component: Checkbox,
  tags: ['autodocs', 'layer-1'],
  parameters: { chromatic: { modes: chromaticViewportModes } },
  args: { label: 'Read envelopes', checked: true, onChange: () => {} },
};
export default meta;
type Story = StoryObj<typeof Checkbox>;

export const Mobile: Story = {
  render: () => <Demo />,
  parameters: { chromatic: { modes: { mobile: chromaticViewportModes.mobile } } },
};

export const Desktop: Story = {
  render: () => <Demo />,
  parameters: { chromatic: { modes: { desktop: chromaticViewportModes.desktop } } },
};
