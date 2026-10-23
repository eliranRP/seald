import { isEmail } from 'class-validator';
import {
  BULK_SEND_EMAIL_MAX,
  BULK_SEND_MAX_SLOTS,
  BULK_SEND_NAME_MAX,
  BULK_SEND_TITLE_MAX,
  bulkColumnNames,
  type BulkRecipient,
  type BulkRowError,
  type BulkSlot,
  type Template,
  type TemplateField,
} from 'shared';
import type { CsvRecord } from './csv-parser';

/** Column that names each envelope; optional. */
export const BULK_TITLE_COLUMN = 'title';

/** What a template needs before it can be bulk sent. */
export type SlotDerivation =
  | {
      readonly ok: true;
      readonly slots: ReadonlyArray<BulkSlot>;
      /** Role id (or `null` for an unbound field) to its 0-based slot. */
      readonly slotOfRole: ReadonlyMap<string | null, number>;
    }
  | { readonly ok: false; readonly reason: BulkTemplateProblem };

export type BulkTemplateProblem =
  | 'template_has_no_fields'
  | 'template_has_too_many_signers'
  | 'template_signer_without_signature_field'
  | 'template_has_no_example_pdf';

/** The signer role a layout field is bound to, `null` when it has none. */
export function roleOfField(
  field: TemplateField,
  lastSigners: Template['last_signers'],
): string | null {
  if (field.signerRoleId !== undefined) return field.signerRoleId;
  if (field.signerIndex !== undefined) return lastSigners[field.signerIndex]?.id ?? null;
  return null;
}

/**
 * The template's signer slots, in order. A slot is a signer role that owns
 * at least one field. Roles follow the saved roster order (`last_signers`),
 * then any other role in order of first appearance. Fields with no role
 * belong to the first slot, as the editor does for legacy layouts. Every
 * slot needs a required signature or initials field, or the envelope could
 * never be sent.
 */
export function deriveSlots(
  template: Pick<Template, 'field_layout' | 'last_signers'>,
): SlotDerivation {
  const layout = template.field_layout;
  if (layout.length === 0) return { ok: false, reason: 'template_has_no_fields' };

  const used: Array<string | null> = [];
  for (const f of layout) {
    const role = roleOfField(f, template.last_signers);
    if (!used.includes(role)) used.push(role);
  }
  const named = used.filter((r): r is string => r !== null);
  const rosterOrder = template.last_signers.map((s) => s.id).filter((id) => named.includes(id));
  const ordered: Array<string | null> = [
    ...rosterOrder,
    ...named.filter((id) => !rosterOrder.includes(id)),
  ];
  // Unbound fields share the first slot; with no roles at all they are the only slot.
  if (ordered.length === 0) ordered.push(null);

  if (ordered.length > BULK_SEND_MAX_SLOTS) {
    return { ok: false, reason: 'template_has_too_many_signers' };
  }

  const slotOfRole = new Map<string | null, number>();
  ordered.forEach((role, i) => slotOfRole.set(role, i));
  if (used.includes(null) && !slotOfRole.has(null)) slotOfRole.set(null, 0);

  const hasSignature = new Set<number>();
  for (const f of layout) {
    if (f.type !== 'signature' && f.type !== 'initial') continue;
    if (f.meta?.['required'] === false) continue;
    const slot = slotOfRole.get(roleOfField(f, template.last_signers));
    if (slot !== undefined) hasSignature.add(slot);
  }
  if (hasSignature.size !== ordered.length) {
    return { ok: false, reason: 'template_signer_without_signature_field' };
  }

  const slots: BulkSlot[] = ordered.map((role, i) => {
    const columns = bulkColumnNames(i + 1);
    const labelled = role === null ? undefined : template.last_signers.find((s) => s.id === role);
    return {
      slot: i + 1,
      label: labelled && labelled.name.trim().length > 0 ? labelled.name.trim() : `Signer ${i + 1}`,
      name_column: columns.name,
      email_column: columns.email,
    };
  });
  return { ok: true, slots, slotOfRole };
}

export interface ValidatedRow {
  /** 1-based data row (record number minus the header). */
  readonly row: number;
  readonly recipients: ReadonlyArray<BulkRecipient>;
  readonly title: string | null;
  readonly errors: ReadonlyArray<BulkRowError>;
}

export interface ValidatedCsv {
  readonly column_errors: ReadonlyArray<BulkRowError>;
  readonly ignored_columns: ReadonlyArray<string>;
  readonly rows: ReadonlyArray<ValidatedRow>;
}

function clean(value: string | undefined): string {
  // Control characters (other than the tab and newline a spreadsheet cell can
  // carry) never belong in a name; turn each into a space and collapse
  // whitespace so " Ada  Lovelace " is one stable string.
  let out = '';
  for (const ch of value ?? '') {
    const code = ch.charCodeAt(0);
    out += code < 0x20 || code === 0x7f ? ' ' : ch;
  }
  return out.replace(/\s+/g, ' ').trim();
}

/**
 * Validate parsed CSV records against the template's slots. `records[0]` is
 * the header. Pure: no I/O, and the same input always gives the same
 * output. A missing required column is reported once in `column_errors` and
 * on every row, so the preview table can show it where the sender looks.
 */
export function validateBulkCsv(
  records: ReadonlyArray<CsvRecord>,
  slots: ReadonlyArray<BulkSlot>,
): ValidatedCsv {
  const [headerRecord, ...dataRecords] = records;
  const header = (headerRecord?.cells ?? []).map((c) => c.trim().toLowerCase());
  const indexOf = new Map<string, number>();
  header.forEach((name, i) => {
    if (name.length > 0 && !indexOf.has(name)) indexOf.set(name, i);
  });

  const wanted = new Set<string>([BULK_TITLE_COLUMN]);
  const columnErrors: BulkRowError[] = [];
  for (const slot of slots) {
    for (const column of [slot.name_column, slot.email_column]) {
      wanted.add(column);
      if (!indexOf.has(column)) {
        columnErrors.push({
          code: 'missing_column',
          column,
          message: `The file has no "${column}" column (${slot.label}).`,
        });
      }
    }
  }
  // Columns the template does not use. A repeated column keeps its first copy
  // for the row data and is listed once here when it is not a wanted one.
  const ignored: string[] = [];
  for (const name of header) {
    if (name.length > 0 && !wanted.has(name) && !ignored.includes(name)) ignored.push(name);
  }

  const rows: ValidatedRow[] = dataRecords.map((rec) => {
    const errors: BulkRowError[] = [...columnErrors];
    const recipients: BulkRecipient[] = [];
    const seen = new Map<string, number>();
    for (const slot of slots) {
      const nameAt = indexOf.get(slot.name_column);
      const emailAt = indexOf.get(slot.email_column);
      const name = nameAt === undefined ? '' : clean(rec.cells[nameAt]);
      const email = emailAt === undefined ? '' : clean(rec.cells[emailAt]);
      recipients.push({ name, email });
      if (nameAt !== undefined) {
        if (name.length === 0) {
          errors.push({
            code: 'missing_name',
            column: slot.name_column,
            message: `${slot.name_column} is empty.`,
          });
        } else if (name.length > BULK_SEND_NAME_MAX) {
          errors.push({
            code: 'name_too_long',
            column: slot.name_column,
            message: `${slot.name_column} is longer than ${BULK_SEND_NAME_MAX} characters.`,
          });
        }
      }
      if (emailAt !== undefined) {
        if (email.length === 0) {
          errors.push({
            code: 'missing_email',
            column: slot.email_column,
            message: `${slot.email_column} is empty.`,
          });
        } else if (email.length > BULK_SEND_EMAIL_MAX) {
          errors.push({
            code: 'email_too_long',
            column: slot.email_column,
            message: `${slot.email_column} is longer than ${BULK_SEND_EMAIL_MAX} characters.`,
          });
        } else if (!isEmail(email)) {
          errors.push({
            code: 'bad_email',
            column: slot.email_column,
            message: `"${email}" is not a valid email address.`,
          });
        } else {
          const key = email.toLowerCase();
          const first = seen.get(key);
          if (first !== undefined) {
            errors.push({
              code: 'duplicate_email',
              column: slot.email_column,
              message: `${email} is already used by recipient ${first} in this row.`,
            });
          } else {
            seen.set(key, slot.slot);
          }
        }
      }
    }
    const titleAt = indexOf.get(BULK_TITLE_COLUMN);
    const rawTitle = titleAt === undefined ? '' : clean(rec.cells[titleAt]);
    if (rawTitle.length > BULK_SEND_TITLE_MAX) {
      errors.push({
        code: 'title_too_long',
        column: BULK_TITLE_COLUMN,
        message: `title is longer than ${BULK_SEND_TITLE_MAX} characters.`,
      });
    }
    return {
      row: rec.record - 1,
      recipients,
      title: rawTitle.length > 0 && rawTitle.length <= BULK_SEND_TITLE_MAX ? rawTitle : null,
      errors,
    };
  });

  return { column_errors: columnErrors, ignored_columns: ignored, rows };
}
