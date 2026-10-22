import type { Meta, StoryObj } from '@storybook/react-vite';
import { chromaticViewportModes } from '@/stories/chromaticViewports';
import { useState } from 'react';
import { DocumentPage } from './DocumentPage';
import type { DocumentPageSigner } from './DocumentPage.types';
import type { AddSignerContact } from '../../components/AddSignerDropdown/AddSignerDropdown.types';
import type { PlacedFieldValue } from '../../components/PlacedField/PlacedField.types';
import { seald } from '../../styles/theme';
import { DocumentList, DocumentSwitcher } from '../../features/documentEditor/documents';

const INITIAL_SIGNERS: ReadonlyArray<DocumentPageSigner> = [
  { id: 's1', name: 'Eliran Azulay', email: 'eliran@azulay.co', color: '#F472B6' },
  { id: 's2', name: 'Nitsan Yanovitch', email: 'nitsan@yanov.co', color: '#7DD3FC' },
];

const INITIAL_FIELDS: ReadonlyArray<PlacedFieldValue> = [
  { id: 'f1', page: 4, type: 'signature', x: 60, y: 560, signerIds: ['s1'] },
  { id: 'f2', page: 4, type: 'signature', x: 272, y: 560, signerIds: ['s2'] },
];

const CONTACTS: ReadonlyArray<AddSignerContact> = [
  { id: 'c1', name: 'Eliran Azulay', email: 'eliran@azulay.co', color: '#F472B6' },
  { id: 'c2', name: 'Nitsan Yanovitch', email: 'nitsan@yanov.co', color: '#7DD3FC' },
  { id: 'c3', name: 'Ana Torres', email: 'ana@farrow.law', color: '#10B981' },
  { id: 'c4', name: 'Meilin Chen', email: 'meilin@chen.co', color: '#F59E0B' },
  { id: 'c5', name: 'Priya Kapoor', email: 'priya@kapoor.com', color: '#818CF8' },
];

const PALETTE = seald.color.signer;

const meta: Meta<typeof DocumentPage> = {
  title: 'L4/DocumentPage',
  component: DocumentPage,
  tags: ['autodocs', 'layer-4'],
  parameters: { layout: 'fullscreen' },
};
export default meta;
type Story = StoryObj<typeof DocumentPage>;

function InteractiveDemo({
  startingFields = INITIAL_FIELDS,
  startingSigners = INITIAL_SIGNERS,
  initialPage = 4,
  withSaveAsTemplate = false,
}: {
  readonly startingFields?: ReadonlyArray<PlacedFieldValue>;
  readonly startingSigners?: ReadonlyArray<DocumentPageSigner>;
  readonly initialPage?: number;
  readonly withSaveAsTemplate?: boolean;
}) {
  const [fields, setFields] = useState<ReadonlyArray<PlacedFieldValue>>(startingFields);
  const [signers, setSigners] = useState<ReadonlyArray<DocumentPageSigner>>(startingSigners);

  return (
    <DocumentPage
      totalPages={4}
      initialPage={initialPage}
      signers={signers}
      contacts={CONTACTS}
      fields={fields}
      onFieldsChange={setFields}
      onAddSignerFromContact={(c) => {
        setSigners((prev) =>
          prev.some((s) => s.id === c.id)
            ? prev
            : [...prev, { id: c.id, name: c.name, email: c.email, color: c.color }],
        );
      }}
      onCreateSigner={(name, email) => {
        setSigners((prev) => {
          const color = PALETTE[prev.length % PALETTE.length] ?? '#818CF8';
          const nextId = `s_${Date.now().toString(36)}`;
          return [...prev, { id: nextId, name, email, color }];
        });
      }}
      onSend={() => {}}
      onSaveDraft={() => {}}
      onBack={() => {}}
      {...(withSaveAsTemplate ? { onSaveAsTemplate: () => {} } : {})}
    />
  );
}

export const Default: Story = {
  render: () => <InteractiveDemo />,
};

export const EmptyCanvas: Story = {
  name: 'No fields placed',
  render: () => <InteractiveDemo startingFields={[]} initialPage={1} />,
};

export const SingleSigner: Story = {
  render: () => (
    <InteractiveDemo
      startingSigners={[
        { id: 's1', name: 'Eliran Azulay', email: 'eliran@azulay.co', color: '#F472B6' },
      ]}
      startingFields={[{ id: 'f1', page: 1, type: 'signature', x: 80, y: 300, signerIds: ['s1'] }]}
      initialPage={1}
    />
  ),
};

export const Desktop: Story = {
  parameters: { chromatic: { modes: { desktop: chromaticViewportModes.desktop } } },
  render: () => <InteractiveDemo />,
};

export const Mobile: Story = {
  parameters: { chromatic: { modes: { mobile: chromaticViewportModes.mobile } } },
  render: () => <InteractiveDemo />,
};

export const WithSaveAsTemplate: Story = {
  // Variant that opts into the "Save as template" affordance — the
  // route wrapper threads `onSaveAsTemplate` through whenever the
  // sender has authored a layout worth reusing. The dashed button
  // appears in the right rail above the Send footer.
  name: 'Save-as-template affordance',
  render: () => <InteractiveDemo withSaveAsTemplate />,
};

const MULTI_DOCS = [
  { id: 'd1', title: 'Master services agreement', pages: 4 },
  { id: 'd2', title: 'Side letter', pages: 1 },
];

function MultiDocumentDemo() {
  const [active, setActive] = useState('d1');
  const [fieldsByDoc, setFieldsByDoc] = useState<Record<string, ReadonlyArray<PlacedFieldValue>>>({
    d1: INITIAL_FIELDS,
    d2: [],
  });
  const total = Object.values(fieldsByDoc).reduce((n, list) => n + list.length, 0);
  const pages = MULTI_DOCS.find((d) => d.id === active)?.pages ?? 1;
  return (
    <DocumentPage
      // Remount per document, as the route does.
      key={active}
      totalPages={pages}
      initialPage={1}
      title={MULTI_DOCS.find((d) => d.id === active)?.title}
      signers={INITIAL_SIGNERS}
      contacts={CONTACTS}
      fields={fieldsByDoc[active] ?? []}
      onFieldsChange={(next) => setFieldsByDoc((prev) => ({ ...prev, [active]: next }))}
      onSend={() => {}}
      onBack={() => {}}
      sendTotals={{
        fieldCount: total,
        signatureFieldCount: Object.values(fieldsByDoc)
          .flat()
          .filter((f) => f.type === 'signature').length,
      }}
      documentSwitcher={
        <DocumentSwitcher
          documents={MULTI_DOCS.map((d) => ({
            id: d.id,
            title: d.title,
            meta: `${String(fieldsByDoc[d.id]?.length ?? 0)} fields`,
          }))}
          activeId={active}
          onSelect={setActive}
        />
      }
      documentsPanel={
        <DocumentList
          documents={MULTI_DOCS}
          activeId={active}
          onSelect={setActive}
          onReorder={() => {}}
          onRemove={() => {}}
          onAddFiles={() => {}}
        />
      }
    />
  );
}

/**
 * Flag `multiDocumentEnvelopes` on: a switcher above the canvas and the
 * document list in the right rail. Fields belong to the document on
 * screen; the send gate counts every document.
 */
export const MultipleDocuments: Story = {
  render: () => <MultiDocumentDemo />,
};
