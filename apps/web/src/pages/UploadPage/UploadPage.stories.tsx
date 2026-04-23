import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { UploadPage } from './UploadPage';

const meta: Meta<typeof UploadPage> = {
  title: 'L4/UploadPage',
  component: UploadPage,
  tags: ['autodocs', 'layer-4'],
  parameters: { layout: 'fullscreen' },
};
export default meta;
type Story = StoryObj<typeof UploadPage>;

function InteractiveDemo() {
  const [lastFile, setLastFile] = useState<string | null>(null);
  return (
    <UploadPage
      user={{ name: 'Jamie Okonkwo' }}
      onFileSelected={(f) => setLastFile(f.name)}
      subtitle={
        lastFile
          ? `Selected "${lastFile}". In a real app we'd advance to the placement screen.`
          : undefined
      }
    />
  );
}

export const Default: Story = {
  render: () => <InteractiveDemo />,
};

export const ErrorState: Story = {
  name: 'With size limit (1 KB)',
  render: () => (
    <UploadPage user={{ name: 'Jamie Okonkwo' }} onFileSelected={() => {}} maxSizeBytes={1024} />
  ),
};

export const CustomCopy: Story = {
  render: () => (
    <UploadPage
      user={{ name: 'Jamie Okonkwo' }}
      onFileSelected={() => {}}
      title="Upload a contract"
      subtitle="We support PDFs up to 10 MB. Drag the file in, or click the button below."
      dropHeading="Drop a contract here"
      chooseLabel="Browse files"
      maxSizeBytes={10 * 1024 * 1024}
    />
  ),
};
