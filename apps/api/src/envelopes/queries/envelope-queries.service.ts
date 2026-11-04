import { BadRequestException, Injectable } from '@nestjs/common';
import {
  MCP_LIST_LIMIT_DEFAULT,
  MCP_LIST_LIMIT_MAX,
  type EnvelopeEvent,
  type EnvelopeStatus,
  type McpSignerStatus,
} from 'shared';
import { OutboundEmailsRepository } from '../../email/outbound-emails.repository';
import { EnvelopesService } from '../envelopes.service';
import {
  EnvelopeQueriesRepository,
  type PendingCursor,
  type PendingSignerRow,
  type SearchEnvelopeRow,
  type UpdatedAtCursor,
} from './envelope-queries.repository';

/** Same rule as `EnvelopesService.remindSigner`: one manual invite or reminder per hour. */
export const REMIND_WINDOW_MS = 60 * 60 * 1000;

export interface SearchInput {
  readonly title?: string;
  readonly signer?: string;
  readonly statuses?: ReadonlyArray<EnvelopeStatus>;
  /** Comma-separated, like `GET /envelopes?tags=`. */
  readonly tags?: string;
  readonly date_from?: string;
  readonly date_to?: string;
  readonly template_id?: string;
  readonly drive_file_name?: string;
  readonly archived?: boolean;
  readonly limit?: number;
  readonly cursor?: string;
}

export interface SearchResult {
  readonly items: ReadonlyArray<SearchEnvelopeRow>;
  readonly next_cursor: string | null;
}

export interface PendingResult {
  readonly items: ReadonlyArray<PendingSignerRow>;
  readonly next_cursor: string | null;
}

export interface EventsPage {
  readonly events: ReadonlyArray<EnvelopeEvent>;
  readonly next_cursor: string | null;
}

/**
 * Per-signer state for the MCP tools (docs/design/mcp-server.md,
 * `envelopes_status`). Extends `deriveSignerStatus` with `sent`, and
 * `not_sent` for a signer whose link has not gone out (a draft).
 */
export function mcpSignerStatus(
  signer: {
    readonly viewed_at: string | null;
    readonly signed_at: string | null;
    readonly declined_at: string | null;
  },
  sentAt: string | null,
): McpSignerStatus {
  if (signer.declined_at !== null) return 'declined';
  if (signer.signed_at !== null) return 'signed';
  if (signer.viewed_at !== null) return 'viewed';
  return sentAt !== null ? 'sent' : 'not_sent';
}

/**
 * Read-side queries behind the MCP read tools (steps 5 and 6) that the
 * dashboard list does not have. Owner isolation is in every query; this
 * service clamps limits, validates dates and owns the opaque cursors.
 * HTTP controllers do not call it today; when one does, it calls these
 * same methods (MCP-first rule 2).
 */
@Injectable()
export class EnvelopeQueriesService {
  constructor(
    private readonly repo: EnvelopeQueriesRepository,
    private readonly envelopes: EnvelopesService,
    private readonly outboundEmails: OutboundEmailsRepository,
  ) {}

  async search(owner_id: string, input: SearchInput): Promise<SearchResult> {
    if (
      input.date_from !== undefined &&
      input.date_to !== undefined &&
      Date.parse(input.date_from) >= Date.parse(input.date_to)
    ) {
      throw new BadRequestException('validation_error');
    }
    const limit = clampLimit(input.limit);
    const cursor = input.cursor === undefined ? null : decodeUpdatedAtCursor(input.cursor);
    const tags = input.tags
      ?.split(',')
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t.length > 0);
    const page = await this.repo.search(owner_id, {
      ...(input.title !== undefined ? { title: input.title.toLowerCase() } : {}),
      ...(input.signer !== undefined ? { signer: input.signer.toLowerCase() } : {}),
      ...(input.statuses && input.statuses.length > 0 ? { statuses: input.statuses } : {}),
      ...(tags && tags.length > 0 ? { tags } : {}),
      ...(input.date_from !== undefined ? { date_from: input.date_from } : {}),
      ...(input.date_to !== undefined ? { date_to: input.date_to } : {}),
      ...(input.template_id !== undefined ? { template_id: input.template_id } : {}),
      // Recorded per document by the MCP Drive import (WP-19, migration 0029).
      ...(input.drive_file_name !== undefined
        ? { drive_file_name: input.drive_file_name.toLowerCase() }
        : {}),
      ...(input.archived !== undefined ? { archived: input.archived } : {}),
      limit,
      cursor,
    });
    const last = page.rows[page.rows.length - 1];
    return {
      items: page.rows,
      next_cursor:
        page.has_more && last ? encodeCursor({ u: last.cursor_updated_at, i: last.id }) : null,
    };
  }

  async listPendingSigners(
    owner_id: string,
    input: { readonly limit?: number; readonly cursor?: string },
  ): Promise<PendingResult> {
    const limit = clampLimit(input.limit);
    const cursor = input.cursor === undefined ? null : decodePendingCursor(input.cursor);
    const page = await this.repo.listPendingSigners(owner_id, { limit, cursor });
    const last = page.rows[page.rows.length - 1];
    return {
      items: page.rows,
      next_cursor:
        page.has_more && last
          ? encodeCursor({ u: last.cursor_updated_at, i: last.envelope_id, s: last.signer_id })
          : null,
    };
  }

  /**
   * For each signer id: the earliest time a manual remind passes the
   * one-hour guard in `remindSigner`, or null when it would pass now.
   * Reads the same `findLastInviteOrReminder` row that guard reads, so
   * the two cannot disagree.
   */
  async remindAvailableAt(
    envelope_id: string,
    signer_ids: ReadonlyArray<string>,
    now: Date = new Date(),
  ): Promise<ReadonlyMap<string, string | null>> {
    const out = new Map<string, string | null>();
    for (const signer_id of signer_ids) {
      const recent = await this.outboundEmails.findLastInviteOrReminder(envelope_id, signer_id, {
        excludeAutomated: true,
      });
      const allowedAt = recent ? new Date(recent.created_at).getTime() + REMIND_WINDOW_MS : 0;
      out.set(signer_id, allowedAt > now.getTime() ? new Date(allowedAt).toISOString() : null);
    }
    return out;
  }

  /**
   * One page of the audit events, oldest first, through
   * `EnvelopesService.listEvents` (owner check included). The cursor
   * names the last event of the previous page.
   */
  async listEvents(
    owner_id: string,
    envelope_id: string,
    input: { readonly limit?: number; readonly cursor?: string },
  ): Promise<EventsPage> {
    const limit = clampLimit(input.limit);
    const cursor = input.cursor === undefined ? null : decodeUpdatedAtCursor(input.cursor);
    const all = await this.envelopes.listEvents(owner_id, envelope_id);
    // Events are append-only and listed in a fixed order, so the page
    // after the cursor starts right after the event it names.
    let start = 0;
    if (cursor) {
      const at = all.findIndex((e) => e.id === cursor.id && e.created_at === cursor.updated_at);
      if (at < 0) throw new BadRequestException('invalid_cursor');
      start = at + 1;
    }
    const rest = all.slice(start);
    const events = rest.slice(0, limit);
    const last = events[events.length - 1];
    return {
      events,
      next_cursor:
        rest.length > limit && last ? encodeCursor({ u: last.created_at, i: last.id }) : null,
    };
  }
}

function clampLimit(limit: number | undefined): number {
  return Math.max(1, Math.min(MCP_LIST_LIMIT_MAX, limit ?? MCP_LIST_LIMIT_DEFAULT));
}

interface CursorPayload {
  readonly u: string;
  readonly i: string;
  readonly s?: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TS_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$/;

function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function decodeCursor(raw: string, withSigner: boolean): CursorPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
  } catch {
    throw new BadRequestException('invalid_cursor');
  }
  if (typeof parsed !== 'object' || parsed === null)
    throw new BadRequestException('invalid_cursor');
  const { u, i, s } = parsed as Record<string, unknown>;
  const valid =
    typeof u === 'string' &&
    TS_RE.test(u) &&
    typeof i === 'string' &&
    UUID_RE.test(i) &&
    (withSigner ? typeof s === 'string' && UUID_RE.test(s) : s === undefined);
  if (!valid) throw new BadRequestException('invalid_cursor');
  return withSigner ? { u, i, s: s as string } : { u, i };
}

function decodeUpdatedAtCursor(raw: string): UpdatedAtCursor {
  const c = decodeCursor(raw, false);
  return { updated_at: c.u, id: c.i };
}

function decodePendingCursor(raw: string): PendingCursor {
  const c = decodeCursor(raw, true);
  return { updated_at: c.u, id: c.i, signer_id: c.s ?? '' };
}
