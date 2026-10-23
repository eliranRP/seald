import { describe, expect, it } from 'vitest';
import { fakePermanentRun, fakeRetryableRun, fakeRun } from './fixtures';
import { fixTarget, saveProblem, testProblem, toRunItem } from './model';

describe('toRunItem', () => {
  it('maps a finished success to the list word Done and keeps queued and running wordless', () => {
    expect(toRunItem(fakeRun()).status).toBe('succeeded');
    expect(toRunItem(fakeRun({ status: 'queued', status_word: null })).status).toBe('queued');
  });

  it('carries attempt n of 8 for a run in backoff', () => {
    const item = toRunItem(fakeRun({ status: 'retrying', status_word: 'Retrying', attempts: 3 }));
    expect(item).toMatchObject({ status: 'retrying', attempt: 3, maxAttempts: 8 });
  });

  it('carries the server reason and whether Retry is allowed', () => {
    expect(toRunItem(fakeRetryableRun())).toMatchObject({
      status: 'failed',
      retryable: true,
      reason: expect.stringContaining('Retry is safe') as string,
    });
    expect(toRunItem(fakePermanentRun()).retryable).toBe(false);
  });
});

describe('fixTarget', () => {
  it('sends a Drive connection problem to the integrations page', () => {
    for (const slug of ['reconnect_required', 'gdrive_not_connected', 'permission-denied']) {
      expect(fixTarget(fakePermanentRun({ failure_slug: slug }))).toBe('integrations');
    }
  });

  it('keeps every other permanent failure on the recipe', () => {
    for (const slug of ['http_404', 'webhook_url_blocked', 'bad_config', null]) {
      expect(fixTarget(fakePermanentRun({ failure_slug: slug }))).toBe('recipe');
    }
  });
});

describe('problem text', () => {
  it('names the limit, a blocked address, and falls back to a generic line', () => {
    expect(saveProblem({ code: 'automation_limit_reached' })).toMatch(/10 automations/);
    expect(saveProblem({ code: 'webhook_url_blocked' })).toMatch(/public https address/);
    expect(saveProblem(new Error('boom'))).toBe("Couldn't save. Try again.");
  });

  it('explains a test that was refused or rate limited', () => {
    expect(testProblem({ code: 'recipe_not_approved', status: 409 })).toMatch(/approval/);
    expect(testProblem({ status: 429 })).toMatch(/Too many tests/);
    expect(testProblem(new Error('boom'))).toBe("Couldn't send the test. Try again.");
  });
});
