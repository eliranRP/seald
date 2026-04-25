import type { Meta, StoryObj } from '@storybook/react';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { EnvelopeDetailPage } from './EnvelopeDetailPage';

function Wrap({ children }: { readonly children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/document/env-1']}>
        <Routes>
          <Route path="/document/:id" element={children} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const meta: Meta<typeof EnvelopeDetailPage> = {
  title: 'L4/EnvelopeDetailPage',
  component: EnvelopeDetailPage,
  tags: ['autodocs', 'layer-4'],
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <Wrap>
        <Story />
      </Wrap>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof EnvelopeDetailPage>;

export const Default: Story = {
  name: 'Initial render (skeleton while envelope + events fetch)',
};
