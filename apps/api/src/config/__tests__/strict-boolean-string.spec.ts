import { STRICT_BOOLEAN_STRING_MESSAGE, strictBooleanString } from '../strict-boolean-string';

describe('strictBooleanString', () => {
  const schema = strictBooleanString(false);

  it.each([
    ['false', false],
    ['true', true],
    ['0', false],
    ['1', true],
  ] as const)('parses %s as %s', (input, expected) => {
    expect(schema.parse(input)).toBe(expected);
  });

  it('uses the provided default when the value is unset', () => {
    expect(strictBooleanString(false).parse(undefined)).toBe(false);
    expect(strictBooleanString(true).parse(undefined)).toBe(true);
  });

  it.each(['yes', 'FALSE', 'no', ''])('rejects %j', (input) => {
    const result = schema.safeParse(input);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.message).join(' ')).toContain(
        STRICT_BOOLEAN_STRING_MESSAGE,
      );
    }
  });
});
