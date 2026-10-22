import type { Meta, StoryObj } from '@storybook/react-vite';
import { chromaticViewportModes } from '@/stories/chromaticViewports';
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
  render: () => <UploadPage onFileSelected={() => {}} maxSizeBytes={1024} />,
};

export const CustomCopy: Story = {
  render: () => (
    <UploadPage
      onFileSelected={() => {}}
      title="Upload a contract"
      subtitle="We support PDFs up to 10 MB. Drag the file in, or click the button below."
      dropHeading="Drop a contract here"
      chooseLabel="Browse files"
      maxSizeBytes={10 * 1024 * 1024}
    />
  ),
};

export const WithTemplateBanner: Story = {
  name: 'With template banner',
  render: () => (
    <UploadPage
      onFileSelected={() => {}}
      templateBannerTitle="Mutual NDA — short form"
      templateBannerTone="info"
      onClearTemplate={() => {}}
    />
  ),
};

export const WithTemplateNotFound: Story = {
  name: 'With template not-found banner',
  render: () => (
    <UploadPage
      onFileSelected={() => {}}
      templateBannerTitle="Template not found — starting empty"
      templateBannerTone="warning"
      onClearTemplate={() => {}}
    />
  ),
};

function MultipleDemo() {
  const [names, setNames] = useState<ReadonlyArray<string>>([]);
  return (
    <UploadPage
      multiple
      onFileSelected={(f) => setNames([f.name])}
      onFilesSelected={(files) => setNames(files.map((f) => f.name))}
      {...(names.length > 0 ? { subtitle: `Selected: ${names.join(', ')}` } : {})}
    />
  );
}

/** Flag `multiDocumentEnvelopes` on: the picker and the dropzone take several PDFs. */
export const MultipleFiles: Story = {
  name: 'Several files (multi-document envelopes)',
  parameters: { chromatic: { modes: chromaticViewportModes } },
  render: () => <MultipleDemo />,
};
