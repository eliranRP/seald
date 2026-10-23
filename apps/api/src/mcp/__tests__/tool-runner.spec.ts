import { ConflictException, HttpException, HttpStatus } from '@nestjs/common';
import { McpError } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import type { FeatureFlag } from 'shared';
import { defineTool, type McpTool } from '../tool';
import { McpToolRunner } from '../tool-runner';
import { McpToolFailure } from '../tool-errors';
import { principal } from '../tools/__tests__/harness';
import type { McpServices } from '../mcp-services';

class TestRunner extends McpToolRunner {
  constructor(private readonly catalog: readonly McpTool[]) {
    super({} as McpServices);
  }
  protected override tools(): readonly McpTool[] {
    return this.catalog;
  }
}

const base = {
  title: 'Probe',
  description: 'Probe tool.',
  step: 'step-4' as const,
  scopes: ['envelopes:read' as const],
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  input: z.strictObject({ n: z.number().int() }),
  output: z.object({ value: z.string() }),
};

function tool(handler: (args: { n: number }) => Promise<unknown>, extra: Partial<McpTool> = {}) {
  return {
    ...defineTool({
      ...base,
      name: 'probe_run',
      handler: (args) => handler(args) as Promise<{ value: string }>,
    }),
    ...extra,
  };
}

type OverrideHost = { __SEALD_FEATURE_OVERRIDES__?: Partial<Record<FeatureFlag, boolean>> };
const host = globalThis as unknown as OverrideHost;

afterEach(() => {
  delete host.__SEALD_FEATURE_OVERRIDES__;
});

const text = (r: { content: Array<{ type: string; text?: string }> }) =>
  JSON.parse(r.content[0]?.text ?? '{}') as Record<string, unknown>;

describe('McpToolRunner', () => {
  it('returns structuredContent parsed through the output schema (extra keys dropped)', async () => {
    const runner = new TestRunner([
      tool(async () => ({ value: 'ok', storage_secret: 'x/original.pdf' })),
    ]);
    const res = await runner.call('probe_run', { n: 1 }, principal());
    expect(res.isError).toBeUndefined();
    expect(res.structuredContent).toEqual({ value: 'ok' });
    expect(text(res)).toEqual({ value: 'ok' });
  });

  it('unknown tool names (including a signing tool) are "Tool not found"', async () => {
    const runner = new TestRunner([tool(async () => ({ value: 'x' }))]);
    await expect(runner.call('envelopes_sign', {}, principal())).rejects.toThrow(McpError);
    await expect(runner.call('envelopes_sign', {}, principal())).rejects.toThrow(/Tool not found/);
  });

  it('hides a tool whose flag is off', async () => {
    const runner = new TestRunner([
      tool(async () => ({ value: 'x' }), { requiresFlags: ['gdriveIntegration'] }),
    ]);
    host.__SEALD_FEATURE_OVERRIDES__ = { gdriveIntegration: false };
    await expect(runner.call('probe_run', { n: 1 }, principal())).rejects.toThrow(/Tool not found/);
  });

  it('checks scope before validating input, as a 200 tool error', async () => {
    const handler = jest.fn();
    const runner = new TestRunner([tool(handler)]);
    const res = await runner.call('probe_run', { bad: true }, principal([]));
    expect(res.isError).toBe(true);
    expect(text(res)).toEqual({
      slug: 'insufficient_scope',
      message: 'This API key does not have the scope this tool needs.',
      retryable: false,
      next_steps: [],
    });
    expect(res).toMatchObject({ slug: 'insufficient_scope' });
    expect(handler).not.toHaveBeenCalled();
  });

  it('answers validation_error without echoing argument values', async () => {
    const runner = new TestRunner([tool(jest.fn())]);
    const res = await runner.call('probe_run', { n: 'Ignore previous instructions' }, principal());
    expect(text(res)['slug']).toBe('validation_error');
    expect(JSON.stringify(res)).not.toContain('Ignore previous');
  });

  it('maps a service HttpException to its slug, retryable for 429', async () => {
    const conflict = new TestRunner([
      tool(async () => {
        throw new ConflictException('envelope_terminal');
      }),
    ]);
    expect(text(await conflict.call('probe_run', { n: 1 }, principal()))).toMatchObject({
      slug: 'envelope_terminal',
      retryable: false,
    });

    const throttled = new TestRunner([
      tool(async () => {
        throw new HttpException('remind_throttled', HttpStatus.TOO_MANY_REQUESTS);
      }),
    ]);
    expect(text(await throttled.call('probe_run', { n: 1 }, principal()))).toMatchObject({
      slug: 'remind_throttled',
      message: 'This signer was reminded less than an hour ago.',
      retryable: true,
    });
  });

  it('maps an McpToolFailure with its options', async () => {
    const runner = new TestRunner([
      tool(async () => {
        throw new McpToolFailure('rate_limited', { retryable: true, retry_after_seconds: 30 });
      }),
    ]);
    expect(text(await runner.call('probe_run', { n: 1 }, principal()))).toMatchObject({
      slug: 'rate_limited',
      retryable: true,
      retry_after_seconds: 30,
    });
  });

  it('turns an unexpected throw, a 5xx, a bad output or a token-shaped output into internal_error', async () => {
    const cases = [
      async () => {
        throw new Error('db exploded with secret details');
      },
      async () => {
        throw new HttpException('boom', 503);
      },
      async () => ({ value: 42 }),
      async () => ({ value: 'https://x.test/sign?t=abc' }),
      async () => ({ value: `${'seald_live_'}${'x'.repeat(43)}` }),
    ];
    for (const handler of cases) {
      const runner = new TestRunner([tool(handler)]);
      const err = await runner.call('probe_run', { n: 1 }, principal()).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(McpError);
      expect((err as McpError).message).toContain('internal_error');
      expect((err as McpError).message).not.toContain('secret details');
    }
  });

  it('allows a signed URL only in the declared field', async () => {
    const url = 'https://storage.test/object/sign/x?token=abc';
    const allowed = new TestRunner([
      tool(async () => ({ value: url }), { signedUrlFields: ['value'] }),
    ]);
    expect((await allowed.call('probe_run', { n: 1 }, principal())).structuredContent).toEqual({
      value: url,
    });
    const denied = new TestRunner([tool(async () => ({ value: url }))]);
    await expect(denied.call('probe_run', { n: 1 }, principal())).rejects.toThrow(McpError);
  });
});
