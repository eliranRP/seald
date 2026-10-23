import {
  isFeatureEnabled,
  type AnyFieldKind,
  type DeliveryMode,
  type Template,
  type TemplateField,
} from 'shared';
import type { McpToolAnnotations } from '../../tool';

export const TEMPLATE_READ_ANNOTATIONS: McpToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

export const TEMPLATE_WRITE_ANNOTATIONS: McpToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

/** The template spelling `initial` is the envelope's `initials`; the rest match. */
export function envelopeKind(type: TemplateField['type']): AnyFieldKind {
  return type === 'initial' ? 'initials' : type;
}

export interface TemplateSlot {
  /** The roster id fields bind to (`signerRoleId`), or null for the single unnamed slot. */
  readonly role_id: string | null;
  readonly name: string | null;
  /** 1-based step, only while the template is sequential and signing order is on. */
  readonly signing_order: number | null;
}

/** The two fields a layout entry (or its expansion) binds a signer by. */
export interface FieldRole {
  readonly signerRoleId?: string | undefined;
  readonly signerIndex?: number | undefined;
}

export interface TemplateShape {
  readonly delivery_mode: DeliveryMode;
  /** One signer is needed per slot, in this order. */
  readonly slots: readonly TemplateSlot[];
  /** Index into `slots` of the signer a field belongs to. */
  readonly slotOf: (field: FieldRole) => number;
}

/** The role a field binds to: `signerRoleId`, else the roster entry its legacy `signerIndex` names. */
function roleOf(template: Template, f: FieldRole): string | undefined {
  return (
    f.signerRoleId ??
    (f.signerIndex !== undefined ? template.last_signers[f.signerIndex]?.id : undefined)
  );
}

/**
 * Signer slots of a template. The roster saved with it is the slot list
 * (a mid-list removal never shifts a kept signer's fields). A template
 * saved without a roster gets one slot per distinct role its fields name,
 * or a single slot. A field whose role is unknown goes to the first slot,
 * the same fallback the doc gives for `templates_use`.
 */
export function templateShape(template: Template): TemplateShape {
  const sequential = isFeatureEnabled('signingOrder') && template.delivery_mode === 'sequential';
  const mode: DeliveryMode = sequential ? 'sequential' : 'parallel';

  let roles: Array<{ id: string | null; name: string | null; order: number | null }>;
  if (template.last_signers.length > 0) {
    roles = template.last_signers.map((s, i) => ({
      id: s.id,
      name: s.name,
      order: sequential ? (s.signing_order ?? i + 1) : null,
    }));
  } else {
    const seen: string[] = [];
    for (const f of template.field_layout) {
      const role = roleOf(template, f);
      if (role !== undefined && !seen.includes(role)) seen.push(role);
    }
    roles =
      seen.length > 0
        ? seen.map((id, i) => ({ id, name: null, order: sequential ? i + 1 : null }))
        : [{ id: null, name: null, order: sequential ? 1 : null }];
  }

  return {
    delivery_mode: mode,
    slots: roles.map((r) => ({ role_id: r.id, name: r.name, signing_order: r.order })),
    slotOf: (f) => {
      const role = roleOf(template, f);
      const at = role === undefined ? -1 : roles.findIndex((r) => r.id === role);
      return at < 0 ? 0 : at;
    },
  };
}

/** `meta.required` when the template says so, else required (the placement default). */
export function isRequired(f: { readonly meta?: Readonly<Record<string, unknown>> }): boolean {
  const r = f.meta?.['required'];
  return typeof r === 'boolean' ? r : true;
}

/**
 * The editor's canvas is 560 by 740 base pixels and a template stores
 * pixel coordinates against it (`apps/web/src/lib/canvas-coords.ts`,
 * `FIELD_SIZE`). Envelope fields are 0 to 1 from the top-left, so a
 * template field is divided by the same canvas.
 */
export const CANVAS_W = 560;
export const CANVAS_H = 740;

const FIELD_PX: Readonly<Record<string, { readonly w: number; readonly h: number }>> = {
  signature: { w: 200, h: 54 },
  initials: { w: 80, h: 54 },
  date: { w: 140, h: 36 },
  text: { w: 240, h: 36 },
  email: { w: 240, h: 36 },
  checkbox: { w: 28, h: 28 },
  name: { w: 240, h: 36 },
  number: { w: 140, h: 36 },
  radio: { w: 200, h: 72 },
  dropdown: { w: 200, h: 36 },
};

const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

export function normalizedBox(
  kind: AnyFieldKind,
  x: number,
  y: number,
): { x: number; y: number; width: number; height: number } {
  const size = FIELD_PX[kind] ?? { w: 132, h: 54 };
  return {
    x: clamp01(x / CANVAS_W),
    y: clamp01(y / CANVAS_H),
    width: clamp01(size.w / CANVAS_W),
    height: clamp01(size.h / CANVAS_H),
  };
}
