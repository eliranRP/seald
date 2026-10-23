import { afterEach, describe, expect, it, vi } from 'vitest';
import * as sharedModule from 'shared';
import {
  EXPIRY_CHOICES,
  errorCopy,
  failureCopy,
  finishedCount,
  isBulkSendEnabled,
  isFinished,
  plannedCount,
  rowTone,
} from './model';
import { fakeFinishedWithFailure, fakePreviewWithProblems, fakeProcessing } from './fixtures';

describe('bulk send model', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reads the bulkSend flag', () => {
    const spy = vi.spyOn(sharedModule, 'isFeatureEnabled').mockReturnValue(false);
    expect(isBulkSendEnabled()).toBe(false);
    spy.mockImplementation((flag) => flag === 'bulkSend');
    expect(isBulkSendEnabled()).toBe(true);
  });

  it('counts planned rows as the valid ones and finished rows as the settled ones', () => {
    const preview = fakePreviewWithProblems();
    expect(plannedCount(preview)).toBe(1);
    expect(finishedCount(preview)).toBe(0);
    expect(finishedCount(fakeProcessing())).toBe(1);
    expect(finishedCount(fakeFinishedWithFailure())).toBe(3);
    expect(isFinished(fakeProcessing())).toBe(false);
    expect(isFinished(fakeFinishedWithFailure())).toBe(true);
  });

  it('gives plain copy for known slugs and a safe fallback for unknown ones', () => {
    expect(errorCopy('bulk_csv_not_utf8')).toBe('Save the file as CSV UTF-8 and try again.');
    expect(errorCopy('something_new')).toBe('Something went wrong. Try again.');
    expect(failureCopy('template_not_found')).toBe('The template no longer exists');
    expect(failureCopy(null)).toBe('Could not be sent');
  });

  it('colors failures and problems red and finished rows green', () => {
    expect(rowTone('sent')).toBe('emerald');
    expect(rowTone('failed')).toBe('red');
    expect(rowTone('invalid')).toBe('red');
    expect(rowTone('pending')).toBe('amber');
  });

  it('offers the default expiry first, then the presets', () => {
    expect(EXPIRY_CHOICES[0]).toEqual({ value: '', label: 'Template default (30 days)' });
    expect(EXPIRY_CHOICES.map((c) => c.value)).toContain('14');
  });
});
