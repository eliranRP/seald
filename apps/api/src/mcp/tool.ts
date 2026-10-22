import type { ApiKeyScope, FeatureFlag } from 'shared';
import type { z } from 'zod';
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

/** A registered tool with its types erased, so the catalog can hold any of them. */
export interface McpTool extends McpToolMeta {
  readonly input: z.ZodType;
  readonly output: z.ZodType;
  /** `args` must already have passed `input`. */
  readonly invoke: (args: unknown, ctx: McpToolContext) => Promise<unknown>;
}

export function defineTool<I extends z.ZodType, O extends z.ZodType>(
  def: McpToolDefinition<I, O>,
): McpTool {
  const { handler, ...meta } = def;
  return {
    ...meta,
    invoke: (args, ctx) => handler(args as z.output<I>, ctx),
  };
}
