import { afterEach, beforeEach, describe, it, expect } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { UseTemplatePage } from './UseTemplatePage';
import { setTemplates } from '../../features/templates';
import { SAMPLE_TEMPLATES as TEMPLATES } from '../../test/templateFixtures';
import { renderWithProviders } from '../../test/renderWithProviders';

// Production seed is empty; tests inject fixtures into the module store
// so `findTemplateById` (called during page render) returns the right
// record. Reset between tests so fixtures don't leak across the suite.
beforeEach(() => {
  setTemplates(TEMPLATES);
});
afterEach(() => {
  setTemplates([]);
});

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="probe">{`${location.pathname}${location.search}`}</div>;
}

function renderAt(initialPath: string) {
  return renderWithProviders(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/templates" element={<LocationProbe />} />
        <Route path="/templates/:id/use" element={<UseTemplatePage />} />
        <Route path="/templates/:id/edit" element={<LocationProbe />} />
        <Route path="/document/new" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

const SAMPLE = TEMPLATES[0]!;

describe('UseTemplatePage — Document → Signers → Editor flow', () => {
  it('Step 1 shows the document segmented control with the saved doc selected by default', async () => {
    renderAt(`/templates/${encodeURIComponent(SAMPLE.id)}/use`);
    // Mode badge in the FlowHeader.
    expect(screen.getByText(/updating template/i)).toBeInTheDocument();
    // Document source toggle (radiogroup) — saved is the default for an
    // existing template.
    const group = await screen.findByRole('radiogroup', { name: /document source/i });
    expect(within(group).getByRole('radio', { name: /use saved document/i })).toBeInTheDocument();
    expect(within(group).getByRole('radio', { name: /upload a new one/i })).toBeInTheDocument();
  });

  it('Cancel ✕ in the FlowHeader returns to /templates', async () => {
    renderAt(`/templates/${encodeURIComponent(SAMPLE.id)}/use`);
    const cancel = screen.getByRole('button', { name: /cancel template flow/i });
    await userEvent.click(cancel);
    expect(screen.getByTestId('probe').textContent).toBe('/templates');
  });

  it('Step 1 → Step 2: clicking Continue on the saved-doc card opens the SignersStepCard', async () => {
    renderAt(`/templates/${encodeURIComponent(SAMPLE.id)}/use`);
    // Saved doc card has its own Continue button.
    await userEvent.click(screen.getByRole('button', { name: /^continue$/i }));
    // Step 2 — SignersStepCard with the empty-state pill.
    expect(
      await screen.findByRole('heading', { name: /who's signing this time/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/add at least one receiver to continue/i)).toBeInTheDocument();
    // Continue-to-fields is disabled until ≥ 1 signer is added.
    expect(screen.getByRole('button', { name: /continue to fields/i })).toBeDisabled();
  });

  it('Step 2: adding a guest signer enables the Continue-to-fields button', async () => {
    renderAt(`/templates/${encodeURIComponent(SAMPLE.id)}/use`);
    await userEvent.click(screen.getByRole('button', { name: /^continue$/i }));
    await userEvent.click(await screen.findByRole('button', { name: /^add signer$/i }));
    const search = screen.getByPlaceholderText(/search contacts/i);
    await userEvent.type(search, 'guest@example.com');
    await userEvent.click(await screen.findByRole('button', { name: /add .* as guest signer/i }));
    expect(screen.getByRole('button', { name: /continue to fields/i })).not.toBeDisabled();
  });

  it('Step 2 → Step 3: Continue-to-fields routes to /templates/:id/edit', async () => {
    renderAt(`/templates/${encodeURIComponent(SAMPLE.id)}/use`);
    await userEvent.click(screen.getByRole('button', { name: /^continue$/i }));
    await userEvent.click(await screen.findByRole('button', { name: /^add signer$/i }));
    await userEvent.type(screen.getByPlaceholderText(/search contacts/i), 'guest@example.com');
    await userEvent.click(await screen.findByRole('button', { name: /add .* as guest signer/i }));
    await userEvent.click(screen.getByRole('button', { name: /continue to fields/i }));
    expect(screen.getByTestId('probe').textContent).toBe(
      `/templates/${encodeURIComponent(SAMPLE.id)}/edit`,
    );
  });

  it('Step 1: switching to "Upload a new one" reveals the dropzone', async () => {
    renderAt(`/templates/${encodeURIComponent(SAMPLE.id)}/use`);
    await userEvent.click(await screen.findByRole('radio', { name: /upload a new one/i }));
    // The DropArea renders a region labelled "Upload a PDF" with a
    // serif "Drop a different PDF" heading (existing template branch).
    expect(await screen.findByRole('region', { name: /upload a pdf/i })).toBeInTheDocument();
    expect(screen.getByText(/drop a different pdf/i)).toBeInTheDocument();
  });

  it('shows a not-found state for an unknown template id', () => {
    renderAt('/templates/TPL-NOPE/use');
    expect(screen.getByRole('alert')).toHaveTextContent(/template not found/i);
  });
});

// Regression: pre-filled signers from `template.lastSigners` (captured
// on the previous "Send and update template") must populate the
// SignersStepCard immediately when the wizard mounts. Two cases:
// (a) template already in the store at mount, (b) template arrives
// after mount via the API hydration path.
describe('UseTemplatePage — pre-filled signers from lastSigners', () => {
  const SAVED = [
    {
      id: 'c-jamie',
      name: 'Jamie Okonkwo',
      email: 'jamie@seald.app',
      color: '#818CF8',
    },
    {
      id: 's-guest-1',
      name: 'Avery Lin',
      email: 'avery@example.com',
      color: '#F472B6',
    },
  ];

  it('seeds signers from lastSigners when the template is in the store at mount', async () => {
    setTemplates(TEMPLATES.map((t) => (t.id === SAMPLE.id ? { ...t, lastSigners: SAVED } : t)));
    renderAt(`/templates/${encodeURIComponent(SAMPLE.id)}/use`);
    // Step 2 is the signers card. Get there by accepting the saved doc.
    await userEvent.click(screen.getByRole('button', { name: /^continue$/i }));
    expect(
      await screen.findByRole('heading', { name: /who's signing this time/i }),
    ).toBeInTheDocument();
    // Both saved signers should be visible in the list.
    expect(screen.getByText('Jamie Okonkwo')).toBeInTheDocument();
    expect(screen.getByText('jamie@seald.app')).toBeInTheDocument();
    expect(screen.getByText('Avery Lin')).toBeInTheDocument();
    // Continue is enabled because we have ≥ 1 signer pre-filled.
    expect(screen.getByRole('button', { name: /continue to fields/i })).not.toBeDisabled();
  });

  it('seeds signers when the template arrives AFTER mount (hydration race)', async () => {
    // Start with the template ABSENT from the store (mimics a deep
    // link fired before TemplatesListPage / API hydration).
    setTemplates([]);
    renderAt(`/templates/${encodeURIComponent(SAMPLE.id)}/use`);
    // The page initially shows the not-found alert.
    expect(screen.getByRole('alert')).toHaveTextContent(/template not found/i);
    // Now the API hydration completes and republishes the template
    // with `lastSigners` attached. The page must react.
    setTemplates(TEMPLATES.map((t) => (t.id === SAMPLE.id ? { ...t, lastSigners: SAVED } : t)));
    // Step 1 — Document — should now be visible (Continue is the
    // saved-doc Continue button).
    await userEvent.click(await screen.findByRole('button', { name: /^continue$/i }));
    expect(
      await screen.findByRole('heading', { name: /who's signing this time/i }),
    ).toBeInTheDocument();
    expect(await screen.findByText('Jamie Okonkwo')).toBeInTheDocument();
    expect(screen.getByText('Avery Lin')).toBeInTheDocument();
  });

  it('once the user touches the roster, late-arriving lastSigners do NOT overwrite their edits', async () => {
    setTemplates(TEMPLATES.map((t) => (t.id === SAMPLE.id ? { ...t, lastSigners: [] } : t)));
    renderAt(`/templates/${encodeURIComponent(SAMPLE.id)}/use`);
    await userEvent.click(screen.getByRole('button', { name: /^continue$/i }));
    // Step 2 — empty roster, user opens the picker and adds a guest.
    await userEvent.click(await screen.findByRole('button', { name: /^add signer$/i }));
    await userEvent.type(screen.getByPlaceholderText(/search contacts/i), 'mine@example.com');
    await userEvent.click(await screen.findByRole('button', { name: /add .* as guest signer/i }));
    expect(screen.getByText('mine@example.com')).toBeInTheDocument();
    // Now a late hydration republishes the template WITH lastSigners.
    // The user-touched flag must suppress the auto-seed so their pick
    // isn't clobbered.
    setTemplates(TEMPLATES.map((t) => (t.id === SAMPLE.id ? { ...t, lastSigners: SAVED } : t)));
    expect(screen.getByText('mine@example.com')).toBeInTheDocument();
    // No Jamie / Avery — late seed was suppressed.
    expect(screen.queryByText('Jamie Okonkwo')).toBeNull();
    expect(screen.queryByText('Avery Lin')).toBeNull();
  });

  // Bug 1 (2026-05-10 user report): a template's prefilled signer is
  // removed, a fresh guest is added in their place — both remaining
  // signers must keep distinct colors. Pre-fix the new guest got
  // `prev.length % palette.length` which collided with the kept
  // signer's slot whenever a mid-list removal had freed an earlier
  // index.
  it('keeps every signer row a unique color even after a mid-list remove + add cycle', async () => {
    // Three prefills covering the first three palette slots so the
    // collision is observable without exhausting the 6-color palette.
    const SAVED_THREE = [
      { id: 'c-jamie', name: 'Jamie', email: 'jamie@x.test', color: '#F472B6' },
      { id: 'c-avery', name: 'Avery', email: 'avery@x.test', color: '#7DD3FC' },
      { id: 'c-bo', name: 'Bo', email: 'bo@x.test', color: '#FBBF24' },
    ];
    setTemplates(
      TEMPLATES.map((t) => (t.id === SAMPLE.id ? { ...t, lastSigners: SAVED_THREE } : t)),
    );
    renderAt(`/templates/${encodeURIComponent(SAMPLE.id)}/use`);
    await userEvent.click(screen.getByRole('button', { name: /^continue$/i }));
    expect(
      await screen.findByRole('heading', { name: /who's signing this time/i }),
    ).toBeInTheDocument();

    // Remove Avery (mid-list — frees palette slot #7DD3FC).
    await userEvent.click(screen.getByRole('button', { name: /remove avery/i }));

    // Add a new guest. Pre-fix this would have re-used Bo's #FBBF24
    // because `prev.length = 2` after the removal. Post-fix the guest
    // picks the lowest-index unused color (#7DD3FC, freed by Avery).
    await userEvent.click(screen.getByRole('button', { name: /^add signer$/i }));
    await userEvent.type(screen.getByPlaceholderText(/search contacts/i), 'fresh@x.test');
    await userEvent.click(await screen.findByRole('button', { name: /add .* as guest signer/i }));

    // Collect the avatar background colors of every visible signer
    // row. Each row's first child is the styled `<Avatar $color={...}>`
    // so we read its computed background. The kept signer (Jamie),
    // remaining prefilled (Bo), and the freshly-added guest must each
    // resolve to a distinct color.
    const expectedNames = ['Jamie', 'Bo', 'fresh@x.test'];
    const colors = expectedNames.map((name) => {
      const nameEl = screen.getByText(name);
      // Walk up until we find the listitem ancestor (SignerRow).
      let cursor: HTMLElement | null = nameEl;
      while (cursor && cursor.getAttribute('role') !== 'listitem') {
        cursor = cursor.parentElement;
      }
      if (!cursor) throw new Error(`could not find listitem ancestor for ${name}`);
      const avatar = cursor.firstElementChild as HTMLElement | null;
      if (!avatar) throw new Error(`row for ${name} has no avatar child`);
      return window.getComputedStyle(avatar).backgroundColor.toLowerCase();
    });
    expect(colors.every((c) => c.length > 0)).toBe(true);
    expect(new Set(colors).size).toBe(colors.length);
  });
});
