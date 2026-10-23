import { describe, expect, it } from 'vitest';
import type { ResolvedField, TemplateSummary } from '../templates';
import { deriveTemplateRoles } from '../templateRoles';
import { planTemplateSend, toSendInput } from '../sendFromTemplate';
import { DEFAULT_SEND_REMINDER_SETTINGS } from '../../envelopes/sendReminderSettings';

const HANNAH_ID = 'a1111111-1111-4111-8111-111111111111';
const HANNAH = { id: HANNAH_ID, name: 'Hannah Wills', email: 'hannah@quill.vc', color: '#7DD3FC' };
const ME = { id: 'me:u1', name: 'Eliran Azulay', email: 'eliran@seald.app', color: '#F472B6' };

const TEMPLATE: TemplateSummary = {
  id: 'tpl-1',
  name: 'NDA — standard',
  pages: 3,
  fieldCount: 3,
  lastUsed: '',
  uses: 0,
  cover: '',
  exampleFile: '',
  fields: [],
  lastSigners: [HANNAH, ME],
};

const FIELDS: ReadonlyArray<ResolvedField> = [
  { id: 'f1', page: 3, type: 'signature', x: 56, y: 130, signerRoleId: HANNAH_ID },
  { id: 'f2', page: 3, type: 'date', x: 280, y: 130, signerRoleId: HANNAH_ID },
  { id: 'f3', page: 3, type: 'signature', x: 56, y: 260, signerRoleId: ME.id },
  { id: 'f4', page: 1, type: 'initial', x: 10, y: 10, signerRoleId: 'someone-removed' },
];

const roles = deriveTemplateRoles(TEMPLATE);

describe('planTemplateSend', () => {
  it('sends a saved contact by id and anyone else inline, keyed by role', () => {
    const plan = planTemplateSend({
      template: TEMPLATE,
      roles,
      picks: { [HANNAH_ID]: HANNAH, [ME.id]: ME },
      fields: FIELDS,
      aspect: 1.25,
    });
    expect(plan).not.toBeNull();
    expect(plan?.title).toBe('NDA — standard');
    expect(plan?.signers).toEqual([
      { localId: HANNAH_ID, contactId: HANNAH_ID },
      { localId: ME.id, email: ME.email, name: ME.name, color: ME.color },
    ]);
  });

  it('places every bound field on the server signer, normalised to 0-1', () => {
    const plan = planTemplateSend({
      template: TEMPLATE,
      roles,
      picks: { [HANNAH_ID]: HANNAH, [ME.id]: ME },
      fields: FIELDS,
      aspect: 1.25,
    });
    const placed = plan?.buildFields(
      new Map([
        [HANNAH_ID, 'srv-1'],
        [ME.id, 'srv-2'],
      ]),
      new Map(),
    );
    // The field of a signer who is not in the roster is dropped.
    expect(placed).toHaveLength(3);
    expect(plan?.fieldCount).toBe(3);
    const first = placed?.[0];
    expect(first).toMatchObject({ signer_id: 'srv-1', kind: 'signature', page: 3, required: true });
    expect(first?.x).toBeCloseTo(56 / 560, 5);
    // canvas height = 560 * 1.25 = 700
    expect(first?.y).toBeCloseTo(130 / 700, 5);
    expect(first?.width).toBeCloseTo(200 / 560, 5);
    expect(first?.height).toBeCloseTo(54 / 700, 5);
    expect(placed?.[2]).toMatchObject({ signer_id: 'srv-2' });
    expect(placed?.find((f) => f.kind === 'initials')).toBeUndefined();
  });

  it('keeps each field with its role when the person in a slot changed', () => {
    const alex = {
      id: 'b2222222-2222-4222-8222-222222222222',
      name: 'Alex',
      email: 'a@x.co',
      color: '#FBBF24',
    };
    const plan = planTemplateSend({
      template: TEMPLATE,
      roles,
      picks: { [HANNAH_ID]: alex, [ME.id]: ME },
      fields: FIELDS,
      aspect: 1.25,
    });
    expect(plan?.signers[0]).toEqual({ localId: HANNAH_ID, contactId: alex.id });
    const placed = plan?.buildFields(
      new Map([
        [HANNAH_ID, 'srv-1'],
        [ME.id, 'srv-2'],
      ]),
      new Map(),
    );
    expect(placed?.filter((f) => f.signer_id === 'srv-1')).toHaveLength(2);
  });

  it('skips a role the server did not return and falls back on a default page shape', () => {
    const plan = planTemplateSend({
      template: TEMPLATE,
      roles,
      picks: { [HANNAH_ID]: HANNAH, [ME.id]: ME },
      fields: FIELDS,
      aspect: Number.NaN,
    });
    const placed = plan?.buildFields(new Map([[HANNAH_ID, 'srv-1']]), new Map());
    expect(placed?.every((f) => f.signer_id === 'srv-1')).toBe(true);
    expect(placed).toHaveLength(2);
  });

  it('is null while a role has nobody', () => {
    expect(
      planTemplateSend({
        template: TEMPLATE,
        roles,
        picks: { [HANNAH_ID]: HANNAH },
        fields: FIELDS,
        aspect: 1.25,
      }),
    ).toBeNull();
  });
});

describe('toSendInput', () => {
  it('adds the document and the Settings defaults (reminders on, 3 days, 30-day expiry)', () => {
    const plan = planTemplateSend({
      template: TEMPLATE,
      roles,
      picks: { [HANNAH_ID]: HANNAH, [ME.id]: ME },
      fields: FIELDS,
      aspect: 1.25,
    });
    const file = new File(['x'], 'nda.pdf', { type: 'application/pdf' });
    const input = toSendInput(plan!, file);
    expect(input.file).toBe(file);
    expect(input.remindersEnabled).toBe(true);
    expect(input.reminderSettings).toBe(DEFAULT_SEND_REMINDER_SETTINGS);
    expect(input.signingOrder).toBeUndefined();
  });
});
