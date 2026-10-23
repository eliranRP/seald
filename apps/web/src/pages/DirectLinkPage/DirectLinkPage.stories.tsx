import type { Meta, StoryObj } from '@storybook/react-vite';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { chromaticViewportModes } from '@/stories/chromaticViewports';
import { verifyApiClient } from '@/lib/api/verifyApiClient';
import { DirectLinkPage } from './DirectLinkPage';

const TOKEN = `dl_${'a'.repeat(43)}`;

type Behaviour = 'ok' | 'gone' | 'slow';

/** Stubs the public API so every story renders without a server. */
function stub(behaviour: Behaviour): void {
  verifyApiClient.defaults.adapter = (config) => {
    const respond = (status: number, data: unknown) =>
      status < 400
        ? Promise.resolve({ data, status, statusText: 'OK', headers: {}, config })
        : Promise.reject(
            Object.assign(new Error('x'), { isAxiosError: true, response: { status } }),
          );
    if (behaviour === 'slow') return new Promise(() => undefined);
    if (behaviour === 'gone') return respond(404, {});
    if (config.method === 'post') return respond(200, { status: 'check_your_email' });
    return respond(200, { template_title: 'Consulting agreement', sender_name: 'Olive Owner' });
  };
}

const meta: Meta<typeof DirectLinkPage> = {
  title: 'L4/DirectLinkPage',
  component: DirectLinkPage,
  tags: ['autodocs', 'layer-4'],
  parameters: { layout: 'fullscreen', chromatic: { modes: chromaticViewportModes } },
  render: () => (
    <MemoryRouter initialEntries={[`/d/${TOKEN}`]}>
      <Routes>
        <Route path="/d/:token" element={<DirectLinkPage />} />
      </Routes>
    </MemoryRouter>
  ),
};
export default meta;
type Story = StoryObj<typeof DirectLinkPage>;

export const Form: Story = {
  name: 'Name and email form',
  beforeEach: () => stub('ok'),
};

export const Loading: Story = {
  beforeEach: () => stub('slow'),
};

export const NotAvailable: Story = {
  name: 'Link off, rotated or unknown',
  beforeEach: () => stub('gone'),
};
