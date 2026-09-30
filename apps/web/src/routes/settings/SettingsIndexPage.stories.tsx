import type { Meta, StoryObj } from '@storybook/react-vite';
import { MemoryRouter } from 'react-router-dom';
import { chromaticViewportModes } from '@/stories/chromaticViewports';
import { SettingsIndexView } from './SettingsIndexPage';

function Index(props: { readonly phone: boolean }) {
  const path = props.phone ? '/m/settings' : '/settings';
  return (
    <MemoryRouter initialEntries={[path]}>
      <SettingsIndexView phone={props.phone} showIntegrations />
    </MemoryRouter>
  );
}

const meta: Meta<typeof SettingsIndexView> = {
  title: 'L4/Settings/SettingsIndexPage',
  component: SettingsIndexView,
  tags: ['autodocs', 'layer-4'],
  parameters: { layout: 'fullscreen', chromatic: { modes: chromaticViewportModes } },
};
export default meta;
type Story = StoryObj<typeof SettingsIndexView>;

export const Mobile: Story = {
  render: () => <Index phone />,
  parameters: { chromatic: { modes: { mobile: chromaticViewportModes.mobile } } },
};

export const Desktop: Story = {
  render: () => <Index phone={false} />,
  parameters: { chromatic: { modes: { desktop: chromaticViewportModes.desktop } } },
};
