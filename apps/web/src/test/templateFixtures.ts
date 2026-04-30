/**
 * Test + Storybook-only fixtures for the templates feature.
 *
 * Production ships with an empty `TEMPLATES` array
 * (`apps/web/src/features/templates/templates.ts`) — each user authors
 * their own. Tests and stories still need representative records to
 * exercise card layouts, search/filter logic, and the use-template
 * wizard, so the pre-existing seed lives here, kept out of the shipped
 * bundle.
 */

import type { TemplateFieldLayout, TemplateSummary } from '@/features/templates';

const MSA_FIELDS: ReadonlyArray<TemplateFieldLayout> = [
  { type: 'initial', pageRule: 'all', x: 522, y: 50 },
  { type: 'date', pageRule: 'last', x: 60, y: 488 },
  { type: 'signature', pageRule: 'last', x: 60, y: 540 },
  { type: 'signature', pageRule: 'last', x: 320, y: 540 },
  { type: 'text', pageRule: 'last', x: 60, y: 612, label: 'Print name' },
  { type: 'text', pageRule: 'last', x: 320, y: 612, label: 'Print name' },
  { type: 'text', pageRule: 'last', x: 60, y: 672, label: 'Title' },
  { type: 'text', pageRule: 'last', x: 320, y: 672, label: 'Title' },
];

const NDA_FIELDS: ReadonlyArray<TemplateFieldLayout> = [
  { type: 'initial', pageRule: 'allButLast', x: 522, y: 50 },
  { type: 'signature', pageRule: 'last', x: 60, y: 540 },
  { type: 'signature', pageRule: 'last', x: 320, y: 540 },
  { type: 'date', pageRule: 'last', x: 60, y: 612 },
  { type: 'date', pageRule: 'last', x: 320, y: 612 },
];

const ICA_FIELDS: ReadonlyArray<TemplateFieldLayout> = [
  { type: 'initial', pageRule: 'all', x: 522, y: 50 },
  { type: 'signature', pageRule: 'last', x: 60, y: 520 },
  { type: 'signature', pageRule: 'last', x: 320, y: 520 },
  { type: 'date', pageRule: 'last', x: 60, y: 588 },
  { type: 'date', pageRule: 'last', x: 320, y: 588 },
  { type: 'text', pageRule: 'last', x: 60, y: 644, label: 'Print name' },
  { type: 'text', pageRule: 'last', x: 320, y: 644, label: 'Print name' },
  { type: 'text', pageRule: 'first', x: 60, y: 200, label: 'Effective date' },
  { type: 'text', pageRule: 'first', x: 320, y: 200, label: 'Compensation' },
  { type: 'checkbox', pageRule: 'first', x: 60, y: 280 },
  { type: 'checkbox', pageRule: 'first', x: 60, y: 320 },
];

const RELEASE_FIELDS: ReadonlyArray<TemplateFieldLayout> = [
  { type: 'signature', pageRule: 'last', x: 60, y: 540 },
  { type: 'date', pageRule: 'last', x: 320, y: 540 },
  { type: 'text', pageRule: 'last', x: 60, y: 612, label: 'Print name' },
];

export const SAMPLE_TEMPLATES: ReadonlyArray<TemplateSummary> = [
  {
    id: 'TPL-AC04',
    name: 'Unconditional waiver — final payment',
    pages: 6,
    fieldCount: MSA_FIELDS.length,
    lastUsed: 'Apr 22',
    uses: 14,
    cover: '#EEF2FF',
    exampleFile: 'Master Services Agreement.pdf',
    fields: MSA_FIELDS,
    description: 'Lien waiver issued on receipt of the final payment for a project.',
  },
  {
    id: 'TPL-7B12',
    name: 'Mutual NDA — short form',
    pages: 3,
    fieldCount: NDA_FIELDS.length,
    lastUsed: 'Apr 18',
    uses: 46,
    cover: '#FFFBEB',
    exampleFile: 'Mutual NDA.pdf',
    fields: NDA_FIELDS,
    description: 'Two-way confidentiality agreement for early conversations.',
  },
  {
    id: 'TPL-29DA',
    name: 'Independent contractor agreement',
    pages: 8,
    fieldCount: ICA_FIELDS.length,
    lastUsed: 'Apr 11',
    uses: 7,
    cover: '#ECFDF5',
    exampleFile: 'Independent Contractor Agreement.pdf',
    fields: ICA_FIELDS,
    description: 'Standard 1099 contractor terms with checkboxes for scope and exclusivity.',
  },
  {
    id: 'TPL-5F0E',
    name: 'Photography release',
    pages: 2,
    fieldCount: RELEASE_FIELDS.length,
    lastUsed: 'Mar 30',
    uses: 22,
    cover: '#FDF2F8',
    exampleFile: 'Photography Release.pdf',
    fields: RELEASE_FIELDS,
    description: 'Subject release for using a photo in marketing or print.',
  },
];
