import type { Meta, StoryObj } from '@storybook/react-vite';
import { PdfPageView } from './PdfPageView';
import type { PDFDocumentProxy } from '../../lib/pdf';

/**
 * Synthetic document for the Storybook preview. Canvas stays blank since
 * Storybook lacks a real PDF fixture — the point is to show the surrounding
 * chrome (size, placeholder, wrapper padding).
 */
function demoDoc(): PDFDocumentProxy {
  const getPage = async (): Promise<unknown> => ({
    getViewport: ({ scale }: { readonly scale: number }) => ({
      width: 560 * scale,
      height: 760 * scale,
    }),
    render: () => ({ promise: Promise.resolve(), cancel: () => {} }),
  });
  return { numPages: 1, getPage, destroy: async () => {} } as unknown as PDFDocumentProxy;
}

const meta: Meta<typeof PdfPageView> = {
  title: 'L3 Widgets/PdfPageView',
  component: PdfPageView,
  parameters: { layout: 'centered' },
};

export default meta;

type Story = StoryObj<typeof PdfPageView>;

export const Default: Story = {
  args: {
    doc: demoDoc(),
    pageNumber: 1,
    width: 560,
  },
};
