import type { AutomationRunOutput, OwnerAutomation } from 'shared';

export const FAKE_SECRET = 'seald_webhook_EXAMPLEEXAMPLEEXAMPLEEXAMPLE0000';
const ID_A = '00000000-0000-4000-8000-0000000000a1';
const ENVELOPE = '00000000-0000-4000-8000-0000000000e1';

/** A webhook automation that is on and has never run. Override fields per case. */
export function fakeAutomation(over: Partial<OwnerAutomation> = {}): OwnerAutomation {
  return {
    id: ID_A,
    recipe: 'sealed_webhook',
    name: 'Send a webhook when sealed',
    enabled: true,
    status_word: null,
    trigger: 'envelope_sealed',
    action: 'webhook',
    scope: 'account',
    template_id: null,
    destination_host: 'hooks.example.com',
    payload_detail: 'ids',
    recipients: null,
    awaiting_approval: false,
    consecutive_failures: 0,
    created_at: '2026-10-01T09:00:00.000Z',
    updated_at: '2026-10-01T09:00:00.000Z',
    secret_set: true,
    last_run: null,
    ...over,
  };
}

export function fakeDriveAutomation(over: Partial<OwnerAutomation> = {}): OwnerAutomation {
  return fakeAutomation({
    id: '00000000-0000-4000-8000-0000000000a2',
    recipe: 'sealed_save_drive',
    name: 'Save sealed copies to Drive',
    action: 'gdrive_upload',
    destination_host: null,
    payload_detail: null,
    secret_set: false,
    ...over,
  });
}

export function fakeRun(over: Partial<AutomationRunOutput> = {}): AutomationRunOutput {
  return {
    id: '00000000-0000-4000-8000-0000000000c1',
    automation_id: ID_A,
    envelope_id: ENVELOPE,
    trigger: 'envelope_sealed',
    action: 'webhook',
    status: 'done',
    status_word: 'Done',
    attempts: 1,
    failure_slug: null,
    failure_message: null,
    response_status: 200,
    retry_allowed: false,
    created_at: '2026-10-02T10:00:00.000Z',
    finished_at: '2026-10-02T10:00:01.000Z',
    ...over,
  };
}

/** A temporary failure that used up its automatic attempts: Retry is allowed. */
export function fakeRetryableRun(over: Partial<AutomationRunOutput> = {}): AutomationRunOutput {
  return fakeRun({
    id: '00000000-0000-4000-8000-0000000000c2',
    status: 'failed',
    status_word: 'Failed',
    attempts: 8,
    failure_slug: 'attempts_exhausted',
    failure_message: 'Seald tried several times and the destination kept failing. Retry is safe.',
    response_status: 503,
    retry_allowed: true,
    ...over,
  });
}

/** A permanent failure: Fix, no Retry. */
export function fakePermanentRun(over: Partial<AutomationRunOutput> = {}): AutomationRunOutput {
  return fakeRun({
    id: '00000000-0000-4000-8000-0000000000c3',
    status: 'failed',
    status_word: 'Failed',
    attempts: 1,
    failure_slug: 'http_404',
    failure_message: 'The destination answered with HTTP 404. Check the receiving end.',
    response_status: 404,
    retry_allowed: false,
    ...over,
  });
}
