import type { AgentActivityItem, AgentActivityOutcome } from 'shared';
import type { BadgeTone } from '@/components/Badge';

/**
 * One short sentence per MCP tool, in the owner's words: what the key did
 * (or asked to do). The tool id is the fallback, so a tool added later still
 * shows something true.
 */
const DID: Readonly<Record<string, string>> = {
  envelopes_send: 'Sent for signature',
  envelopes_remind: 'Reminded a signer',
  envelopes_cancel: 'Withdrew a request',
  envelopes_fix_signer: 'Corrected a signer',
  envelopes_change_expiry: 'Changed an expiry',
  envelopes_bulk_send_from_template: 'Sent from a template to several people',
  envelopes_save_to_drive: 'Saved to Google Drive',
  gdrive_disconnect: 'Disconnected Google Drive',
  automations_upsert_recipe: 'Turned on an automation',
};

const ASKED: Readonly<Record<string, string>> = {
  envelopes_send: 'Asked to send for signature',
  envelopes_preview_send: 'Asked to send for signature',
  envelopes_remind: 'Asked to remind a signer',
  envelopes_cancel: 'Asked to withdraw a request',
  envelopes_fix_signer: 'Asked to correct a signer',
  envelopes_change_expiry: 'Asked to change an expiry',
  envelopes_bulk_send_from_template: 'Asked to send from a template to several people',
  envelopes_save_to_drive: 'Asked to save to Google Drive',
  gdrive_disconnect: 'Asked to disconnect Google Drive',
  automations_upsert_recipe: 'Asked to turn on an automation',
};

/** The sentence for a row: what was done when it is done, what was asked otherwise. */
export function describeActivity(item: Pick<AgentActivityItem, 'tool' | 'outcome'>): string {
  const table = item.outcome === 'done' ? DID : ASKED;
  return table[item.tool] ?? item.tool;
}

export const OUTCOME_LABEL: Readonly<Record<AgentActivityOutcome, string>> = {
  done: 'Done',
  waiting: 'Waiting for you',
  denied: 'Denied',
  expired: 'Expired',
  failed: 'Failed',
};

export const OUTCOME_TONE: Readonly<Record<AgentActivityOutcome, BadgeTone>> = {
  done: 'emerald',
  waiting: 'indigo',
  denied: 'neutral',
  expired: 'neutral',
  failed: 'red',
};

const WHEN = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

export function formatWhen(iso: string): string {
  return WHEN.format(new Date(iso));
}

/** "Key 2", or "A key" when the key's name was never recorded. */
export function keyLabel(item: Pick<AgentActivityItem, 'key_name'>): string {
  return item.key_name && item.key_name.length > 0 ? item.key_name : 'A key';
}

/** Where a row's document lives in the app, if it has one. */
export function envelopePath(item: Pick<AgentActivityItem, 'envelope_id'>): string | null {
  return item.envelope_id ? `/document/${encodeURIComponent(item.envelope_id)}` : null;
}
