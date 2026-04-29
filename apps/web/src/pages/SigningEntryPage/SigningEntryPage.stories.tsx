import type { Meta, StoryObj } from '@storybook/react-vite';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { SigningEntryPage } from './SigningEntryPage';

const meta: Meta<typeof SigningEntryPage> = {
  title: 'L4/SigningEntryPage',
  component: SigningEntryPage,
  tags: ['autodocs', 'layer-4'],
  parameters: { layout: 'fullscreen' },
};
export default meta;
type Story = StoryObj<typeof SigningEntryPage>;

export const InvalidLink: Story = {
  name: 'No token (invalid-link state)',
  render: () => (
    <MemoryRouter initialEntries={['/sign/env-001']}>
      <Routes>
        <Route path="/sign/:envelopeId" element={<SigningEntryPage />} />
      </Routes>
    </MemoryRouter>
  ),
};

export const Loading: Story = {
  name: 'Token present (loading spinner)',
  render: () => (
    <MemoryRouter initialEntries={[`/sign/env-001?t=${'a'.repeat(43)}`]}>
      <Routes>
        <Route path="/sign/:envelopeId" element={<SigningEntryPage />} />
      </Routes>
    </MemoryRouter>
  ),
};
