import { z } from 'zod';

/**
 * zod 4.6 made `z.string().datetime()` require seconds (RFC 3339), where
 * 4.4 accepted `2026-01-01T00:00Z`. Tightening that would break MCP and
 * REST clients, so these patterns pin the pre-4.6 grammar: seconds
 * optional, fractional seconds allowed. They are byte-identical to the
 * patterns zod 4.4 emitted, so the committed `tools/list` snapshot keeps
 * its `pattern` and `format: "date-time"`.
 */
const DATE =
  '(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))';
const TIME = '(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?';

const UTC_ONLY = new RegExp(`^${DATE}T(?:${TIME}(?:Z))$`);
const WITH_OFFSET = new RegExp(`^${DATE}T(?:${TIME}(?:Z|([+-](?:[01]\\d|2[0-3]):[0-5]\\d)))$`);

// zod 4.6's `.datetime()` takes no `pattern` option, so build the string from
// the pinned regex and declare `format: "date-time"` as metadata. Unlike
// `.datetime()` this does not also run the (stricter) built-in check.
const build = (re: RegExp): z.ZodString =>
  z.string().regex(re, { message: 'Invalid ISO datetime' }).meta({ format: 'date-time' });

/** `z.string().datetime()` as zod 4.4 behaved: `Z` only, seconds optional. */
export const isoDateTimeUtc = (): z.ZodString => build(UTC_ONLY);

/** `z.string().datetime({ offset: true })` as zod 4.4 behaved. */
export const isoDateTimeOffset = (): z.ZodString => build(WITH_OFFSET);
