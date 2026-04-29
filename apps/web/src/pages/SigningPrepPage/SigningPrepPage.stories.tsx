import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SigningPrepPage } from './SigningPrepPage';

function Wrap({ children }: { readonly children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/sign/env-001/prep']}>
        <Routes>
          <Route path="/sign/:envelopeId/prep" element={children} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const meta: Meta<typeof SigningPrepPage> = {
  title: 'L4/SigningPrepPage',
  component: SigningPrepPage,
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
type Story = StoryObj<typeof SigningPrepPage>;

export const Default: Story = {
  name: 'Initial render (waiting for /sign/me)',
};
