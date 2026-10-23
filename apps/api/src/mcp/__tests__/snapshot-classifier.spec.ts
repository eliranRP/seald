import { classifyToolsChange, minorOf, type SnapshotTool } from '../snapshot-classifier';

function tool(name: string, input: object, output: object = {}, extra: object = {}): SnapshotTool {
  return {
    name,
    description: 'd',
    inputSchema: { type: 'object', additionalProperties: false, ...input },
    outputSchema: { type: 'object', ...output },
    ...extra,
  };
}

const base = tool(
  'envelopes_get',
  {
    properties: {
      envelope_id: { type: 'string' },
      kind: { type: 'string', enum: ['a', 'b'] },
      limit: { type: 'integer', maximum: 50 },
    },
    required: ['envelope_id'],
  },
  { properties: { id: { type: 'string' }, status: { type: 'string', enum: ['x'] } } },
);

const withInput = (patch: (p: Record<string, unknown>) => void, required = ['envelope_id']) => {
  const props = JSON.parse(JSON.stringify((base.inputSchema as { properties: object }).properties));
  patch(props);
  return { ...base, inputSchema: { ...(base.inputSchema as object), properties: props, required } };
};

describe('classifyToolsChange', () => {
  it('none for an identical catalog', () => {
    expect(classifyToolsChange([base], [base]).kind).toBe('none');
  });

  it.each([
    ['a removed tool', [] as SnapshotTool[]],
    ['a removed input property', [withInput((p) => delete p['kind'])]],
    [
      'a new required input',
      [withInput((p) => (p['x'] = { type: 'string' }), ['envelope_id', 'x'])],
    ],
    ['an optional input made required', [withInput(() => undefined, ['envelope_id', 'kind'])]],
    ['a narrowed type', [withInput((p) => (p['limit'] = { type: 'string', maximum: 50 }))]],
    [
      'a removed input enum value',
      [withInput((p) => (p['kind'] = { type: 'string', enum: ['a'] }))],
    ],
    ['a tighter bound', [withInput((p) => (p['limit'] = { type: 'integer', maximum: 20 }))]],
    [
      'a removed output field',
      [{ ...base, outputSchema: { type: 'object', properties: { id: { type: 'string' } } } }],
    ],
  ])('breaking for %s', (_name, after) => {
    expect(classifyToolsChange([base], after).kind).toBe('breaking');
  });

  it.each([
    ['a new tool', [base, tool('envelopes_status', {})]],
    ['a new optional input', [withInput((p) => (p['q'] = { type: 'string' }))]],
    ['a widened bound', [withInput((p) => (p['limit'] = { type: 'integer', maximum: 100 }))]],
    [
      'a new input enum value',
      [withInput((p) => (p['kind'] = { type: 'string', enum: ['a', 'b', 'c'] }))],
    ],
    [
      'a new output field',
      [
        {
          ...base,
          outputSchema: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              status: { type: 'string', enum: ['x'] },
              extra: { type: 'string' },
            },
          },
        },
      ],
    ],
    [
      'a new output enum value',
      [
        {
          ...base,
          outputSchema: {
            type: 'object',
            properties: { id: { type: 'string' }, status: { type: 'string', enum: ['x', 'y'] } },
          },
        },
      ],
    ],
    ['a changed description', [{ ...base, description: 'better words' }]],
  ])('additive for %s', (_name, after) => {
    expect(classifyToolsChange([base], after).kind).toBe('additive');
  });

  it('waives a breaking change when the same change adds <tool>_v2', () => {
    const changed = withInput((p) => delete p['kind']);
    expect(classifyToolsChange([base], [changed]).kind).toBe('breaking');
    const v2 = { ...changed, name: 'envelopes_get_v2' };
    expect(classifyToolsChange([base], [changed, v2]).kind).toBe('additive');
  });

  describe('unions (anyOf)', () => {
    const union = (kinds: string[], extra: object = {}) => ({
      ...base,
      outputSchema: {
        type: 'object',
        anyOf: [
          { type: 'object', properties: { dry_run: { type: 'boolean' } } },
          {
            type: 'object',
            properties: { kind: { type: 'string', enum: kinds }, ...extra },
          },
        ],
      },
    });

    it('is additive when a branch gains an enum value or a field (the approval kinds grow this way)', () => {
      expect(classifyToolsChange([union(['a'])], [union(['a', 'b'])]).kind).toBe('additive');
      expect(
        classifyToolsChange([union(['a'])], [union(['a'], { note: { type: 'string' } })]).kind,
      ).toBe('additive');
    });

    it('is breaking when a branch loses an output field or the branch count changes', () => {
      expect(
        classifyToolsChange([union(['a'], { note: { type: 'string' } })], [union(['a'])]).kind,
      ).toBe('breaking');
      const fewer = {
        ...union(['a']),
        outputSchema: { type: 'object', anyOf: [{ type: 'object' }] },
      };
      expect(classifyToolsChange([union(['a'])], [fewer]).kind).toBe('breaking');
    });

    it('is breaking when a union appears or disappears', () => {
      expect(classifyToolsChange([base], [union(['a'])]).kind).toBe('breaking');
      expect(classifyToolsChange([union(['a'])], [base]).kind).toBe('breaking');
    });
  });

  it('reads the minor of a semver', () => {
    expect(minorOf('0.12.3')).toBe(12);
  });
});
