import { CANVAS_WIDTH, normalizeCoord } from '@/lib/canvas-coords';
import { placementMeta } from '@/features/documentEditor/fieldProperties';
import { signingOrderFromTemplate } from './templateSigningOrder';
import { rebindFieldsToSigners } from './rebindFieldsToSigners';
import type { ResolvedField, TemplateSummary } from './templates';
import type { TemplateRole } from './templateRoles';
import type { AddSignerContact } from '@/components/AddSignerDropdown/AddSignerDropdown.types';
import type {
  FieldKind,
  FieldPlacement,
  SendEnvelopeInput,
  SendEnvelopeSignerInput,
} from '@/features/envelopes';
import { DEFAULT_SEND_REMINDER_SETTINGS } from '@/features/envelopes/sendReminderSettings';
import type { PlacedFieldValue } from '@/components/PlacedField/PlacedField.types';
import { isFeatureEnabled } from 'shared';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Default box size in canvas px for a field the template did not size. */
const DEFAULT_PX: Record<FieldKind, { readonly w: number; readonly h: number }> = {
  signature: { w: 200, h: 54 },
  initials: { w: 80, h: 54 },
  date: { w: 140, h: 36 },
  text: { w: 240, h: 36 },
  email: { w: 240, h: 36 },
  checkbox: { w: 24, h: 24 },
  name: { w: 240, h: 36 },
  number: { w: 140, h: 36 },
  radio: { w: 200, h: 72 },
  dropdown: { w: 200, h: 36 },
};

export interface TemplateSendPlan {
  readonly title: string;
  readonly signers: ReadonlyArray<SendEnvelopeSignerInput>;
  readonly buildFields: SendEnvelopeInput['buildFields'];
  /** Fields the template places on this document (after dropping the unbound). */
  readonly fieldCount: number;
  readonly signingOrder: SendEnvelopeInput['signingOrder'];
}

export interface TemplateSendArgs {
  readonly template: TemplateSummary;
  readonly roles: ReadonlyArray<TemplateRole>;
  /** The person chosen for each role, by `role.key`. */
  readonly picks: Readonly<Record<string, AddSignerContact | undefined>>;
  /** The layout expanded onto this document's pages. */
  readonly fields: ReadonlyArray<ResolvedField>;
  /** Page height over width of page 1 (sizes the canvas the layout was drawn on). */
  readonly aspect: number;
}

/** The people for a role, or null if one is missing. */
function pickAll(
  roles: ReadonlyArray<TemplateRole>,
  picks: TemplateSendArgs['picks'],
): ReadonlyArray<{ readonly role: TemplateRole; readonly person: AddSignerContact }> | null {
  const out: Array<{ role: TemplateRole; person: AddSignerContact }> = [];
  for (const role of roles) {
    const person = picks[role.key];
    if (!person) return null;
    out.push({ role, person });
  }
  return out;
}

/**
 * Turns "this template, these people, this document" into what the send
 * orchestration (`useSendEnvelope.run`) takes. Fields bind to roles by the
 * stored signer id (or ordinal for old templates), then each role is sent as
 * a saved contact when the person is one, otherwise as an inline name and
 * email. Returns null while a role has nobody.
 */
export function planTemplateSend(args: TemplateSendArgs): TemplateSendPlan | null {
  const { template, roles, picks, fields, aspect } = args;
  const chosen = pickAll(roles, picks);
  if (!chosen) return null;

  const signers = chosen.map(({ role, person }): SendEnvelopeSignerInput => {
    if (UUID_RE.test(person.id)) return { localId: role.key, contactId: person.id };
    return { localId: role.key, email: person.email, name: person.name, color: person.color };
  });

  // Bind the layout to the role keys; fields of a role nobody fills are dropped.
  const placed: ReadonlyArray<PlacedFieldValue> = rebindFieldsToSigners(
    fields,
    roles.map((r) => ({ id: r.key })),
  );
  const canvasHeight = CANVAS_WIDTH * (Number.isFinite(aspect) && aspect > 0 ? aspect : 1.294);

  const buildFields: SendEnvelopeInput['buildFields'] = (roleToServerSigner) => {
    const out: FieldPlacement[] = [];
    for (const f of placed) {
      const kind = f.type as FieldKind;
      const widthPx = f.width ?? DEFAULT_PX[kind]?.w ?? DEFAULT_PX.text.w;
      const heightPx = f.height ?? DEFAULT_PX[kind]?.h ?? DEFAULT_PX.text.h;
      for (const roleKey of f.signerIds) {
        const serverSignerId = roleToServerSigner.get(roleKey);
        if (!serverSignerId) continue;
        out.push({
          signer_id: serverSignerId,
          kind,
          page: f.page,
          x: normalizeCoord(f.x, CANVAS_WIDTH),
          y: normalizeCoord(f.y, canvasHeight),
          required: f.required ?? true,
          width: normalizeCoord(widthPx, CANVAS_WIDTH),
          height: normalizeCoord(heightPx, canvasHeight),
          ...(f.linkId ? { link_id: f.linkId } : {}),
          ...placementMeta(f),
        });
      }
    }
    return out;
  };

  const order = isFeatureEnabled('signingOrder') ? signingOrderFromTemplate(template) : undefined;
  return {
    title: template.name,
    signers,
    buildFields,
    fieldCount: placed.filter((f) => f.signerIds.length > 0).length,
    signingOrder: order?.sequential ? order : undefined,
  };
}

/** Everything `useSendEnvelope.run` needs, with the Settings defaults applied. */
export function toSendInput(plan: TemplateSendPlan, file: File | Blob): SendEnvelopeInput {
  return {
    title: plan.title,
    file,
    signers: plan.signers,
    buildFields: plan.buildFields,
    remindersEnabled: true,
    reminderSettings: DEFAULT_SEND_REMINDER_SETTINGS,
    ...(plan.signingOrder ? { signingOrder: plan.signingOrder } : {}),
  };
}
