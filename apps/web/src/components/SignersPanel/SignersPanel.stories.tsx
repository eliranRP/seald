import type { Meta, StoryObj } from '@storybook/react-vite';
import { SignersPanel } from './SignersPanel';
import type { SignersPanelSigner } from './SignersPanel.types';

const meta: Meta<typeof SignersPanel> = {
  title: 'L3/SignersPanel',
  component: SignersPanel,
  tags: ['autodocs', 'layer-3'],
  parameters: { layout: 'padded' },
};
export default meta;
type Story = StoryObj<typeof SignersPanel>;

const TWO: ReadonlyArray<SignersPanelSigner> = [
  { id: 'you', name: 'Jamie Rivera', email: 'jamie@sealed.co', color: '#4F46E5' },
  { id: 'ana', name: 'Ana Torres', email: 'ana@farrow.law', color: '#10B981' },
];

const MANY: ReadonlyArray<SignersPanelSigner> = [
  { id: 'you', name: 'Jamie Rivera', email: 'jamie@sealed.co', color: '#4F46E5' },
  { id: 'ana', name: 'Ana Torres', email: 'ana@farrow.law', color: '#10B981' },
  { id: 'kai', name: 'Kai Nakamura', email: 'kai@hashi.co', color: '#F59E0B' },
  { id: 'ben', name: 'Ben Silver', email: 'ben@silver.partners', color: '#EF4444' },
  { id: 'mei', name: 'Mei Chen', email: 'mei@studioc.io', color: '#3B82F6' },
  { id: 'leo', name: 'Leo Park', email: 'leo@park.co', color: '#8B5CF6' },
];

function FrameContainer({ children }: { readonly children: React.ReactNode }) {
  return (
    <div
      style={{
        width: 320,
        padding: 16,
        border: '1px solid #E2E8F0',
        borderRadius: 12,
        background: '#FFFFFF',
      }}
    >
      {children}
    </div>
  );
}

export const Empty: Story = {
  render: () => (
    <FrameContainer>
      <SignersPanel signers={[]} onRequestAdd={() => {}} />
    </FrameContainer>
  ),
};

export const TwoSigners: Story = {
  render: () => (
    <FrameContainer>
      <SignersPanel signers={TWO} onRequestAdd={() => {}} onSelectSigner={() => {}} />
    </FrameContainer>
  ),
};

export const ManySigners: Story = {
  render: () => (
    <FrameContainer>
      <SignersPanel signers={MANY} onRequestAdd={() => {}} onSelectSigner={() => {}} />
    </FrameContainer>
  ),
};

export const Readonly: Story = {
  render: () => (
    <FrameContainer>
      <SignersPanel signers={TWO} />
    </FrameContainer>
  ),
};

export const Playground: Story = {
  args: {
    signers: TWO,
    title: 'Signers',
    addLabel: 'Add signer',
    onRequestAdd: () => {},
    onSelectSigner: () => {},
  },
  render: (args) => (
    <FrameContainer>
      <SignersPanel {...args} />
    </FrameContainer>
  ),
};
