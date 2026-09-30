import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { chromaticViewportModes } from '@/stories/chromaticViewports';
import { SigningFillPage } from './SigningFillPage';

const signingViewports = {
  mobile: {
    name: 'Mobile',
    styles: { width: '390px', height: '844px' },
    type: 'mobile' as const,
  },
  desktop: {
    name: 'Desktop',
    styles: { width: '1440px', height: '900px' },
    type: 'desktop' as const,
  },
};

function Wrap({ children }: { readonly children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/sign/env-001/fill']}>
        <Routes>
          <Route path="/sign/:envelopeId/fill" element={children} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const meta: Meta<typeof SigningFillPage> = {
  title: 'L4/SigningFillPage',
  component: SigningFillPage,
  tags: ['autodocs', 'layer-4'],
  parameters: {
    layout: 'fullscreen',
    viewport: { options: signingViewports },
  },
  decorators: [
    (Story) => (
      <Wrap>
        <Story />
      </Wrap>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof SigningFillPage>;

export const Default: Story = {
  name: 'Initial render (loading session + fields)',
};

export const Desktop: Story = {
  parameters: { chromatic: { modes: { desktop: chromaticViewportModes.desktop } } },
  globals: { viewport: { value: 'desktop', isRotated: false } },
};

export const Mobile: Story = {
  parameters: { chromatic: { modes: { mobile: chromaticViewportModes.mobile } } },
  globals: { viewport: { value: 'mobile', isRotated: false } },
};
