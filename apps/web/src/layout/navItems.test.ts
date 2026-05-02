import { describe, it, expect } from 'vitest';
import { matchNavId } from './navItems';

/**
 * Audit gap (2026-05-02): the previous `matchNavId` lit up the "Sign"
 * tab for ANY pathname under `/document/...`, including the
 * EnvelopeDetailPage at `/document/:id` and the SentConfirmationPage at
 * `/document/:id/sent`. Both surfaces are entered from the Documents
 * tab (clicking a row on the dashboard, or finishing a send) and should
 * keep the user oriented with "Documents" highlighted — only the
 * new-envelope upload + editor flow at `/document/new` is part of the
 * "Sign" tab proper. Without this distinction the active-tab indicator
 * silently mis-reports the user's position in the IA.
 */
describe('matchNavId', () => {
  it('returns "documents" for the dashboard', () => {
    expect(matchNavId('/documents')).toBe('documents');
  });

  it('returns "sign" for the new-envelope upload entry', () => {
    expect(matchNavId('/document/new')).toBe('sign');
  });

  it('returns "templates" for the templates list', () => {
    expect(matchNavId('/templates')).toBe('templates');
  });

  it('returns "templates" inside the templates wizard', () => {
    expect(matchNavId('/templates/abc/use')).toBe('templates');
    expect(matchNavId('/templates/abc/edit')).toBe('templates');
  });

  it('returns "signers" for the contacts/signers tab', () => {
    expect(matchNavId('/signers')).toBe('signers');
  });

  // Bug A regression: existing-envelope detail must NOT highlight Sign.
  it('returns "documents" for an existing envelope detail (/document/:id)', () => {
    expect(matchNavId('/document/abc-123')).toBe('documents');
  });

  it('returns "documents" for the sent-confirmation page (/document/:id/sent)', () => {
    expect(matchNavId('/document/abc-123/sent')).toBe('documents');
  });

  it('still returns "sign" while the user is mid-flight on /document/new', () => {
    // The upload/editor handoff replaces the URL with /document/<draftId>
    // ONLY after sending — during the in-flight create flow we'd be on
    // /document/new and the Sign tab must stay lit.
    expect(matchNavId('/document/new')).toBe('sign');
  });
});
