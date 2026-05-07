import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';
import { test } from '../fixtures/test';

const { Given, When, Then } = createBdd(test);

/**
 * BDD steps for the primary-nav active-tab indicator (Bug A regression
 * — see `apps/web/src/layout/navItems.test.ts` for the unit-level
 * coverage). These run inside `RequireAuth → AppShell` so the seeded
 * Supabase session lets the guard fall through.
 */

Given('the user is signed in as {string}', async ({ seededUser, mockedApi }, email: string) => {
  await seededUser.signInAs({
    id: '00000000-0000-4000-8000-000000000a11',
    email,
    fullName: 'Alice Example',
  });
  // Stub the dashboard + envelope APIs so each route renders without a
  // live backend. Shape matches the `Envelope` contract from
  // `envelopesApi.ts` — both EnvelopeDetailPage and SentConfirmationPage
  // read `signers` + `short_code`, so a stale `recipients`-shaped payload
  // tears the tree down on render (no top-level ErrorBoundary above NavBar).
  mockedApi.on('GET', /\/api\/envelopes(\?|$)/, { json: { items: [] } });
  mockedApi.on('GET', /\/api\/envelopes\/[^/]+$/, {
    json: {
      id: 'abc-123',
      owner_id: '00000000-0000-4000-8000-000000000a11',
      title: 'Test envelope',
      short_code: 'ABC-123',
      status: 'sent',
      original_pages: 1,
      expires_at: '2026-05-25T10:00:00Z',
      tc_version: '1.0',
      privacy_version: '1.0',
      sent_at: '2026-04-25T10:00:00Z',
      completed_at: null,
      signers: [],
      fields: [],
      created_at: '2026-04-25T10:00:00Z',
      updated_at: '2026-04-25T10:00:00Z',
    },
  });
});

When('the user opens the Documents dashboard', async ({ page }) => {
  await page.goto('/documents');
});

When(
  'the user opens the envelope detail page for {string}',
  async ({ page }, envelopeId: string) => {
    await page.goto(`/document/${envelopeId}`);
  },
);

When(
  'the user opens the sent confirmation page for {string}',
  async ({ page }, envelopeId: string) => {
    await page.goto(`/document/${envelopeId}/sent`);
  },
);

When('the user opens the new envelope upload page', async ({ page }) => {
  await page.goto('/document/new');
});

Then('the primary nav highlights {string}', async ({ page }, label: string) => {
  // Active tab is rendered with `aria-current="page"` (NavBar.tsx).
  const tab = page.getByRole('button', { name: new RegExp(`^${label}$`, 'i') });
  await expect(tab).toHaveAttribute('aria-current', 'page');
});

Then('the primary nav does not highlight {string}', async ({ page }, label: string) => {
  const tab = page.getByRole('button', { name: new RegExp(`^${label}$`, 'i') });
  await expect(tab).not.toHaveAttribute('aria-current', 'page');
});
