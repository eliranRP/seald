import { z } from 'zod';

export type JsonSchemaObject = { type: 'object' } & Record<string, unknown>;

/**
 * Zod 4 → the JSON Schema a tool advertises (docs: `z.toJSONSchema`, no
 * second JSON-Schema package). Draft-07 because the SDK client validates
 * `outputSchema` with a draft-07 Ajv; the `$schema` key is dropped so a
 * validator never tries to fetch a meta-schema. `io` picks the input or
 * output view of transforms and defaults.
 */
export function toToolJsonSchema(schema: z.ZodType, io: 'input' | 'output'): JsonSchemaObject {
  // Zod throws on a type JSON Schema cannot express (its default), so a
  // schema that would advertise a lie fails at startup and in tests.
  const json = z.toJSONSchema(schema, { target: 'draft-7', io });
  const { $schema: _drop, ...rest } = json as Record<string, unknown>;
  // A mutating tool's output is a union of objects (dry run | result).
  // MCP wants `type: "object"` at the root; with every branch an object
  // that is the same set of values.
  // A tool whose own result is a union (send: approval_pending | sent)
  // nests one anyOf inside the dry-run union; flatten it to one level.
  if (Array.isArray(rest['anyOf'])) rest['anyOf'] = flattenAnyOf(rest['anyOf'] as unknown[]);
  const branches = rest['anyOf'];
  if (
    rest['type'] === undefined &&
    Array.isArray(branches) &&
    branches.length > 0 &&
    branches.every(
      (b) => typeof b === 'object' && b !== null && (b as { type?: unknown }).type === 'object',
    )
  ) {
    rest['type'] = 'object';
  }
  if (rest['type'] !== 'object') {
    throw new Error('MCP tool schemas must be JSON objects at the root');
  }
  return rest as JsonSchemaObject;
}

/** `anyOf: [a, { anyOf: [b, c] }]` → `anyOf: [a, b, c]` (a bare nested union only). */
function flattenAnyOf(branches: readonly unknown[]): unknown[] {
  return branches.flatMap((b) => {
    if (typeof b !== 'object' || b === null) return [b];
    const inner = (b as { anyOf?: unknown }).anyOf;
    return Object.keys(b).length === 1 && Array.isArray(inner) ? flattenAnyOf(inner) : [b];
  });
}
