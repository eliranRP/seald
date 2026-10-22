import { McpDryRunOutputSchema, type ApiKeyScope, type FeatureFlag } from 'shared';
import { z } from 'zod';
import type { ApiKeyPrincipal } from '../api-keys/api-key-auth.service';
import type { McpServices } from './mcp-services';

/** Steps of docs/design/mcp-server.md § Pull requests that ship tools. */
export type McpStep = `step-${string}`;

export interface McpToolContext {
  /** The verified credential. `owner_id` always comes from here, never from arguments. */
  readonly principal: ApiKeyPrincipal;
  readonly services: McpServices;
  readonly now: Date;
}

export interface McpToolAnnotations {
  readonly readOnlyHint: boolean;
  readonly destructiveHint: boolean;
  readonly idempotentHint: boolean;
  readonly openWorldHint: boolean;
}

interface McpToolMeta {
  /** `noun_verb`; never contains `sign`. */
  readonly name: string;
  readonly title: string;
  readonly description: string;
  /** The pull-request step that shipped the tool (route coverage). */
  readonly step: McpStep;
  /** Every scope the call needs; the credential must hold all of them. */
  readonly scopes: readonly ApiKeyScope[];
  readonly annotations: McpToolAnnotations;
  /** Hidden from tools/list (and not callable) unless every flag is on. */
  readonly requiresFlags?: readonly FeatureFlag[];
  /** Top-level output keys that may hold a short-lived signed storage URL (leak scan). */
  readonly signedUrlFields?: readonly string[];
}

export interface McpToolDefinition<I extends z.ZodType, O extends z.ZodType> extends McpToolMeta {
  /** Strict Zod object; `z.toJSONSchema` of it is the advertised `inputSchema`. */
  readonly input: I;
  /** Output schema; the result is parsed through it, which drops unnamed keys. */
  readonly output: O;
  readonly handler: (args: z.output<I>, ctx: McpToolContext) => Promise<z.input<O>>;
}

/**
 * A mutating tool (step 8a). Its input must require `idempotency_key`
 * and `dry_run`. `dry_run: true` calls `preview`, which validates without
 * writing and returns what the call would do; the runner wraps it as
 * `{ dry_run: true, would }` and stores no idempotency row. Otherwise the
 * runner claims the idempotency key, calls `handler`, and stores its
 * output for replay.
 */
export interface McpWriteToolDefinition<
  I extends z.ZodType,
  O extends z.ZodType,
> extends McpToolDefinition<I, O> {
  readonly preview: (args: z.output<I>, ctx: McpToolContext) => Promise<Record<string, unknown>>;
}

/** A registered tool with its types erased, so the catalog can hold any of them. */
export interface McpTool extends McpToolMeta {
  readonly input: z.ZodType;
  /** For a mutating tool: the dry-run shape or the tool's own output. */
  readonly output: z.ZodType;
  /** True for tools defined with `defineWriteTool`. */
  readonly mutating: boolean;
  /** `args` must already have passed `input`. */
  readonly invoke: (args: unknown, ctx: McpToolContext) => Promise<unknown>;
  /** Mutating tools only: the dry run. */
  readonly preview?: (args: unknown, ctx: McpToolContext) => Promise<Record<string, unknown>>;
}

export function defineTool<I extends z.ZodType, O extends z.ZodType>(
  def: McpToolDefinition<I, O>,
): McpTool {
  const { handler, ...meta } = def;
  return {
    ...meta,
    mutating: false,
    invoke: (args, ctx) => handler(args as z.output<I>, ctx),
  };
}

export function defineWriteTool<I extends z.ZodType, O extends z.ZodType>(
  def: McpWriteToolDefinition<I, O>,
): McpTool {
  const { handler, preview, output, ...meta } = def;
  return {
    ...meta,
    // Dry-run branch first: a real result never has `dry_run: true`.
    output: z.union([McpDryRunOutputSchema, output]),
    mutating: true,
    invoke: (args, ctx) => handler(args as z.output<I>, ctx),
    preview: (args, ctx) => preview(args as z.output<I>, ctx),
  };
}
