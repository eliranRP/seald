import type { Meta, StoryObj } from '@storybook/react-vite';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { chromaticViewportModes } from '@/stories/chromaticViewports';
import { FieldPlacementStage } from './FieldPlacementStage';

const viewports = {
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

function fakeDoc(): PDFDocumentProxy {
  const pages = [
    { width: 612, height: 792 },
    { width: 612, height: 1008 },
  ];
  return {
    numPages: pages.length,
    getPage: async (pageNumber: number) => {
      const page = pages[pageNumber - 1];
      if (!page) throw new Error('missing page');
      return {
        getViewport: ({ scale }: { scale: number }) => ({
          width: page.width * scale,
          height: page.height * scale,
        }),
        render: () => ({ promise: Promise.resolve(), cancel: () => {} }),
      };
    },
  } as unknown as PDFDocumentProxy;
}

const meta: Meta<typeof FieldPlacementStage> = {
  title: 'L2/FieldPlacementStage',
  component: FieldPlacementStage,
  parameters: {
    layout: 'padded',
    viewport: { options: viewports },
  },
};
export default meta;

type Story = StoryObj<typeof FieldPlacementStage>;

const fields = [
  { id: 'sig', kind: 'signature', page: 1, x: 0.12, y: 0.08, width: 0.28, height: 0.06 },
  { id: 'date', kind: 'date', page: 2, x: 0.12, y: 0.2, width: 0.22, height: 0.045 },
] as const;

export const Desktop: Story = {
  parameters: { chromatic: { modes: { desktop: chromaticViewportModes.desktop } } },
  globals: { viewport: { value: 'desktop', isRotated: false } },
  render: () => (
    <FieldPlacementStage pdfDoc={fakeDoc()} canvasWidth={560} surface="preview" fields={fields} />
  ),
};

export const Mobile: Story = {
  parameters: { chromatic: { modes: { mobile: chromaticViewportModes.mobile } } },
  globals: { viewport: { value: 'mobile', isRotated: false } },
  render: () => (
    <FieldPlacementStage pdfDoc={fakeDoc()} canvasWidth={358} surface="preview" fields={fields} />
  ),
};
