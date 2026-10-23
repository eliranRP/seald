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

const SOURCES = {
  allowWord: true,
  showSources: true,
  onPickTemplate: () => {},
  templateCount: 6,
  onPickDrive: () => {},
  onScan: () => {},
  recentTemplates: [
    { id: 't1', name: 'NDA — mutual', signers: 2 },
    { id: 't2', name: 'Offer letter', signers: 2 },
    { id: 't3', name: 'Consulting agreement', signers: 2 },
  ],
  onPickRecentTemplate: () => {},
} as const;

/** The v2 start screen: source tiles, one drop zone for PDF and Word, recent templates. */
export const Start: Story = {
  parameters: { chromatic: { modes: chromaticViewportModes } },
  render: () => <UploadPage onFileSelected={() => {}} {...SOURCES} />,
};

export const Analyzing: Story = {
  render: () => (
    <UploadPage
      onFileSelected={() => {}}
      {...SOURCES}
      status="analyzing"
      analyzingFileName="Master services agreement.pdf"
      analyzingFileSize={1_258_291}
      analyzedPages={8}
      onCancelAnalysis={() => {}}
    />
  ),
};

export const ConvertingWord: Story = {
  render: () => (
    <UploadPage
      onFileSelected={() => {}}
      {...SOURCES}
      status="converting"
      analyzingFileName="Q3 vendor agreement.docx"
      onCancelAnalysis={() => {}}
    />
  ),
};

export const ConversionFailed: Story = {
  render: () => (
    <UploadPage
      onFileSelected={() => {}}
      {...SOURCES}
      status="converting"
      analyzingFileName="Q3 vendor agreement.docx"
      conversionFailed
      onRetryConversion={() => {}}
      onCancelAnalysis={() => {}}
    />
  ),
};
