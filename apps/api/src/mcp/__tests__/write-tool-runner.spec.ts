import { BadGatewayException, ConflictException, HttpException } from '@nestjs/common';
import { McpError } from '@modelcontextprotocol/sdk/types.js';
import { McpIdempotencyKeySchema } from 'shared';
import { z } from 'zod';
import { InMemoryIdempotencyRecordsRepository } from '../../idempotency/__tests__/in-memory-idempotency-records.repository';
import { IdempotencyService } from '../../idempotency/idempotency.service';
import type { McpServices } from '../mcp-services';
import { defineWriteTool, type McpTool } from '../tool';
import { describeTool } from '../tool-catalog';
import { McpToolRunner } from '../tool-runner';
import { principal } from '../tools/__tests__/harness';

/** Step 8a: dry run, idempotency replay / conflict / in-progress, release on failure. */
class TestRunner extends McpToolRunner {
  constructor(
    private readonly catalog: readonly McpTool[],
    services: McpServices,
  ) {
    super(services);
  }
  protected override tools(): readonly McpTool[] {
    return this.catalog;
  }
}

function setup(handler: (args: { n: number }) => Promise<{ value: string }>) {
  const repo = new InMemoryIdempotencyRecordsRepository();
  const services = { idempotency: new IdempotencyService(repo) } as unknown as McpServices;
  let previews = 0;
  let runs = 0;
  const tool = defineWriteTool({
    name: 'probe_write',
    title: 'Probe',
    description: 'Probe write tool.',
    step: 'step-8a',
    scopes: ['envelopes:write'],
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    input: z.strictObject({
      n: z.number().int(),
      idempotency_key: McpIdempotencyKeySchema,
      dry_run: z.boolean(),
    }),
    output: z.object({ value: z.string() }),
    preview: async (args) => {
      previews += 1;
      if (args.n < 0) throw new ConflictException('envelope_not_draft');
      return { n: args.n };
    },
    handler: async (args) => {
      runs += 1;
      return handler(args);
    },
  });
  const runner = new TestRunner([tool], services);
  const call = (args: Record<string, unknown>, keyId?: string) =>
    runner.call(
      'probe_write',
      args,
      keyId ? { ...principal(['envelopes:write']), keyId } : principal(['envelopes:write']),
    );
  return { repo, call, tool, counts: () => ({ previews, runs }) };
}

const parse = (r: { content: Array<{ type: string; text?: string }> }) =>
  JSON.parse(r.content[0]?.text ?? '{}') as Record<string, unknown>;

describe('McpToolRunner (write tools)', () => {
  it('advertises the dry-run shape or the result as one object output schema', () => {
    const { tool } = setup(async () => ({ value: 'x' }));
    const listed = describeTool(tool);
    expect(listed.outputSchema['type']).toBe('object');
    expect(Array.isArray(listed.outputSchema['anyOf'])).toBe(true);
    expect(listed.inputSchema['required']).toEqual(
      expect.arrayContaining(['idempotency_key', 'dry_run']),
    );
  });

  it('dry run calls preview only, stores no idempotency row, and still validates', async () => {
    const { repo, call, counts } = setup(async () => ({ value: 'x' }));
    const out = await call({ n: 1, idempotency_key: 'key-00000001', dry_run: true });
    expect(out.structuredContent).toEqual({ dry_run: true, would: { n: 1 } });
    expect(repo.rows.size).toBe(0);
    const refused = await call({ n: -1, idempotency_key: 'key-00000001', dry_run: true });
    expect(parse(refused)['slug']).toBe('envelope_not_draft');
    expect(counts()).toEqual({ previews: 2, runs: 0 });
  });

  it('replays a completed key, conflicts on new arguments, and keeps keys per credential', async () => {
    let seq = 0;
    const { call, counts } = setup(async () => ({ value: `run-${++seq}` }));
    const args = { n: 1, idempotency_key: 'key-00000001', dry_run: false };
    expect((await call(args)).structuredContent).toEqual({ value: 'run-1' });
    expect((await call(args)).structuredContent).toEqual({ value: 'run-1' });
    expect(counts().runs).toBe(1);
    const conflict = await call({ ...args, n: 2 });
    expect(conflict.isError).toBe(true);
    expect(parse(conflict)).toMatchObject({ slug: 'idempotency_conflict', retryable: false });
    expect((await call(args, 'another-key')).structuredContent).toEqual({ value: 'run-2' });
  });

  it('answers a concurrent call with the same key as in progress, retryable', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const { call } = setup(async () => {
      await gate;
      return { value: 'done' };
    });
    const args = { n: 1, idempotency_key: 'key-00000001', dry_run: false };
    const first = call(args);
    await new Promise((r) => setImmediate(r));
    const second = await call(args);
    expect(parse(second)).toMatchObject({
      slug: 'idempotency_in_progress',
      retryable: true,
      retry_after_seconds: 2,
    });
    release();
    expect((await first).structuredContent).toEqual({ value: 'done' });
    expect((await call(args)).structuredContent).toEqual({ value: 'done' });
  });

  it('releases the key when the tool fails, so the same key can retry', async () => {
    let fail = true;
    const { repo, call } = setup(async () => {
      if (fail) throw new ConflictException('envelope_not_draft');
      return { value: 'ok' };
    });
    const args = { n: 1, idempotency_key: 'key-00000001', dry_run: false };
    expect(parse(await call(args))['slug']).toBe('envelope_not_draft');
    expect(repo.rows.size).toBe(0);
    fail = false;
    expect((await call(args)).structuredContent).toEqual({ value: 'ok' });
  });

  it('releases on an internal error too, and never replays it', async () => {
    let fail = true;
    const { repo, call } = setup(async () => {
      if (fail) throw new HttpException('boom', 500);
      return { value: 'ok' };
    });
    const args = { n: 1, idempotency_key: 'key-00000001', dry_run: false };
    await expect(call(args)).rejects.toBeInstanceOf(McpError);
    expect(repo.rows.size).toBe(0);
    fail = false;
    expect((await call(args)).structuredContent).toEqual({ value: 'ok' });
  });

  it('passes a named upstream 5xx through as a retryable tool error', async () => {
    const { call } = setup(async () => {
      throw new BadGatewayException('conversion_failed');
    });
    const out = await call({ n: 1, idempotency_key: 'key-00000001', dry_run: false });
    expect(parse(out)).toMatchObject({ slug: 'conversion_failed', retryable: true });
  });

  it('requires idempotency_key (8–200 chars) and dry_run', async () => {
    const { call, counts } = setup(async () => ({ value: 'x' }));
    for (const bad of [
      { n: 1 },
      { n: 1, dry_run: false },
      { n: 1, idempotency_key: 'short', dry_run: false },
    ]) {
      expect(parse(await call(bad))['slug']).toBe('validation_error');
    }
    expect(counts()).toEqual({ previews: 0, runs: 0 });
  });
});
