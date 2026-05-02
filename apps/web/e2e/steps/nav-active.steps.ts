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
  // live backend.
  mockedApi.on('GET', /\/api\/envelopes(\?|$)/, { json: { items: [] } });
  mockedApi.on('GET', /\/api\/envelopes\/[^/]+$/, {
    json: {
      id: 'abc-123',
      title: 'Test envelope',
      status: 'sent',
      createdAt: '2026-04-25T10:00:00Z',
      updatedAt: '2026-04-25T10:00:00Z',
      recipients: [],
      events: [],
      documents: [],
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
