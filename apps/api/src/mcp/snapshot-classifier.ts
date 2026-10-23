/**
 * Classifies a `tools/list` change against the committed snapshot
 * (docs/design/mcp-server.md, Parity, schemas, and the SDK harness).
 *
 * Breaking: a removed tool, a removed or renamed property, a new required
 * input, a narrowed type (a changed `type`, a removed input enum value, a
 * tighter bound) and any other schema keyword change it cannot prove is
 * safe. Additive: a new tool, a new optional input, a new output field,
 * a widened bound, a new enum value, a changed description or annotation.
 *
 * A breaking change to tool `X` is waived when the same change adds
 * `X_v2` (or any `X_vN`): the old tool stays as it was for 90 days.
 */
export type ChangeKind = 'none' | 'additive' | 'breaking';

export interface Classification {
  readonly kind: ChangeKind;
  readonly reasons: readonly string[];
}

type Json = Record<string, unknown>;

export interface SnapshotTool {
  readonly name: string;
  readonly [key: string]: unknown;
}

const isObject = (v: unknown): v is Json =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Stable stringify (sorted keys) for structural equality. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (isObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'undefined';
}

const LOWER_BOUNDS = ['minLength', 'minimum', 'minItems', 'exclusiveMinimum'];
const UPPER_BOUNDS = ['maxLength', 'maximum', 'maxItems', 'exclusiveMaximum'];
const DOC_KEYWORDS = ['description', 'title', 'examples', 'default'];
const STRUCTURAL = [
  'type',
  'properties',
  'required',
  'items',
  'enum',
  'additionalProperties',
  'anyOf',
  'oneOf',
];

class Collector {
  readonly breaking: string[] = [];
  readonly additive: string[] = [];
}

function compareSchema(
  oldS: unknown,
  newS: unknown,
  path: string,
  io: 'input' | 'output',
  out: Collector,
): void {
  if (stableStringify(oldS) === stableStringify(newS)) return;
  if (!isObject(oldS) || !isObject(newS)) {
    out.breaking.push(`${path}: schema replaced`);
    return;
  }

  if (stableStringify(oldS['type']) !== stableStringify(newS['type'])) {
    out.breaking.push(`${path}: type changed`);
  }

  const oldProps = isObject(oldS['properties']) ? oldS['properties'] : {};
  const newProps = isObject(newS['properties']) ? newS['properties'] : {};
  const oldReq = new Set(Array.isArray(oldS['required']) ? (oldS['required'] as string[]) : []);
  const newReq = new Set(Array.isArray(newS['required']) ? (newS['required'] as string[]) : []);
  for (const key of Object.keys(oldProps)) {
    if (!(key in newProps)) out.breaking.push(`${path}.${key}: property removed`);
    else compareSchema(oldProps[key], newProps[key], `${path}.${key}`, io, out);
  }
  for (const key of Object.keys(newProps)) {
    if (key in oldProps) continue;
    if (io === 'input' && newReq.has(key)) out.breaking.push(`${path}.${key}: new required input`);
    else out.additive.push(`${path}.${key}: property added`);
  }
  for (const key of newReq) {
    if (key in oldProps && !oldReq.has(key)) {
      (io === 'input' ? out.breaking : out.additive).push(`${path}.${key}: now required`);
    }
  }
  for (const key of oldReq) {
    if (!newReq.has(key) && key in newProps) {
      (io === 'output' ? out.breaking : out.additive).push(`${path}.${key}: no longer required`);
    }
  }

  if ('items' in oldS || 'items' in newS) {
    compareSchema(oldS['items'], newS['items'], `${path}[]`, io, out);
  }

  // A union with the same branches in the same order is compared branch
  // by branch (WP-45: a new approval kind adds an enum value inside the
  // dry-run union of every approval-gated tool's output). Any other change
  // to the branch list is breaking.
  for (const key of ['anyOf', 'oneOf']) {
    const a = oldS[key];
    const b = newS[key];
    if (stableStringify(a) === stableStringify(b)) continue;
    if (Array.isArray(a) && Array.isArray(b) && a.length === b.length) {
      a.forEach((branch, i) => compareSchema(branch, b[i], `${path}.${key}[${i}]`, io, out));
    } else {
      out.breaking.push(`${path}: ${key} changed`);
    }
  }

  if (Array.isArray(oldS['enum']) || Array.isArray(newS['enum'])) {
    const before = new Set((oldS['enum'] as unknown[] | undefined) ?? []);
    const after = new Set((newS['enum'] as unknown[] | undefined) ?? []);
    const removed = [...before].filter((v) => !after.has(v));
    const added = [...after].filter((v) => !before.has(v));
    if (removed.length > 0) {
      (io === 'input' ? out.breaking : out.additive).push(`${path}: enum value removed`);
    }
    if (added.length > 0) out.additive.push(`${path}: enum value added`);
  }

  // A union with the same number of branches is compared branch by branch,
  // so a new enum value or output field inside one branch is additive (the
  // approval kinds grow this way). A different number of branches, or a
  // union that appears or disappears, cannot be proved safe.
  for (const keyword of ['anyOf', 'oneOf'] as const) {
    const a = oldS[keyword];
    const b = newS[keyword];
    if (a === undefined && b === undefined) continue;
    if (Array.isArray(a) && Array.isArray(b) && a.length === b.length) {
      a.forEach((branch, i) => {
        compareSchema(branch, b[i], `${path}|${String(i)}`, io, out);
      });
    } else if (stableStringify(a) !== stableStringify(b)) {
      out.breaking.push(`${path}: ${keyword} changed`);
    }
  }

  if (
    stableStringify(oldS['additionalProperties']) !== stableStringify(newS['additionalProperties'])
  ) {
    out.breaking.push(`${path}: additionalProperties changed`);
  }

  for (const key of LOWER_BOUNDS) {
    const a = oldS[key];
    const b = newS[key];
    if (a === b) continue;
    const tighter = typeof b === 'number' && (typeof a !== 'number' || b > a);
    (tighter && io === 'input' ? out.breaking : out.additive).push(`${path}: ${key} changed`);
  }
  for (const key of UPPER_BOUNDS) {
    const a = oldS[key];
    const b = newS[key];
    if (a === b) continue;
    const tighter = typeof b === 'number' && (typeof a !== 'number' || b < a);
    (tighter && io === 'input' ? out.breaking : out.additive).push(`${path}: ${key} changed`);
  }
  for (const key of DOC_KEYWORDS) {
    if (stableStringify(oldS[key]) !== stableStringify(newS[key])) {
      out.additive.push(`${path}: ${key} changed`);
    }
  }

  const known = new Set([...STRUCTURAL, ...LOWER_BOUNDS, ...UPPER_BOUNDS, ...DOC_KEYWORDS]);
  const others = new Set([...Object.keys(oldS), ...Object.keys(newS)].filter((k) => !known.has(k)));
  for (const key of others) {
    if (stableStringify(oldS[key]) !== stableStringify(newS[key])) {
      out.breaking.push(`${path}: ${key} changed`);
    }
  }
}

function compareTool(oldT: SnapshotTool, newT: SnapshotTool, out: Collector): void {
  const p = oldT.name;
  compareSchema(oldT['inputSchema'], newT['inputSchema'], `${p}.input`, 'input', out);
  compareSchema(oldT['outputSchema'], newT['outputSchema'], `${p}.output`, 'output', out);
  for (const key of ['title', 'description', 'annotations', '_meta']) {
    if (stableStringify(oldT[key]) !== stableStringify(newT[key])) {
      out.additive.push(`${p}: ${key} changed`);
    }
  }
}

export function classifyToolsChange(
  before: readonly SnapshotTool[],
  after: readonly SnapshotTool[],
): Classification {
  const out = new Collector();
  const afterByName = new Map(after.map((t) => [t.name, t]));
  const beforeNames = new Set(before.map((t) => t.name));
  const addedNames = after.map((t) => t.name).filter((n) => !beforeNames.has(n));

  for (const oldT of before) {
    const newT = afterByName.get(oldT.name);
    const scratch = new Collector();
    if (!newT) scratch.breaking.push(`${oldT.name}: tool removed`);
    else compareTool(oldT, newT, scratch);
    const versioned = addedNames.some((n) => new RegExp(`^${oldT.name}_v\\d+$`).test(n));
    if (versioned) {
      out.additive.push(...scratch.breaking.map((r) => `${r} (waived: versioned tool added)`));
    } else {
      out.breaking.push(...scratch.breaking);
    }
    out.additive.push(...scratch.additive);
  }
  for (const name of addedNames) out.additive.push(`${name}: tool added`);

  if (out.breaking.length > 0) return { kind: 'breaking', reasons: out.breaking };
  if (out.additive.length > 0) return { kind: 'additive', reasons: out.additive };
  return { kind: 'none', reasons: [] };
}

/** `a.b.c` → minor number. */
export function minorOf(version: string): number {
  const parts = version.split('.');
  return Number(parts[1] ?? Number.NaN);
}
