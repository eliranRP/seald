import { describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { axe } from 'vitest-axe';
import { renderWithTheme } from '@/test/renderWithTheme';
import { AutomationList, stateWord } from './AutomationList';
import { fakeAutomation, fakeDriveAutomation } from './fixtures';

const BASE = '/settings/automations';

function renderList(props: Partial<Parameters<typeof AutomationList>[0]> = {}) {
  return renderWithTheme(
    <MemoryRouter>
      <AutomationList
        items={[fakeAutomation(), fakeDriveAutomation({ enabled: false })]}
        basePath={BASE}
        onToggle={vi.fn()}
        {...props}
      />
    </MemoryRouter>,
  );
}

describe('AutomationList', () => {
  it('has a switch named by the automation, on or off, and links to its page', () => {
    renderList();
    expect(screen.getByRole('switch', { name: 'Send a webhook when sealed' })).toBeChecked();
    expect(screen.getByRole('switch', { name: 'Save sealed copies to Drive' })).not.toBeChecked();
    expect(screen.getByRole('link', { name: 'Save sealed copies to Drive' })).toHaveAttribute(
      'href',
      `${BASE}/00000000-0000-4000-8000-0000000000a2`,
    );
  });

  it('hands back the id and the new state when a switch is tapped', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    renderList({ onToggle });
    await user.click(screen.getByRole('switch', { name: 'Save sealed copies to Drive' }));
    expect(onToggle).toHaveBeenCalledWith('00000000-0000-4000-8000-0000000000a2', true);
  });

  it('keeps the switch that is saving busy', () => {
    renderList({ pendingId: '00000000-0000-4000-8000-0000000000a1' });
    expect(screen.getByRole('switch', { name: 'Send a webhook when sealed' })).toHaveAttribute(
      'aria-busy',
      'true',
    );
  });

  it('shows Secret set on a webhook only', () => {
    renderList();
    const rows = within(screen.getByRole('list', { name: 'Your automations' })).getAllByRole(
      'listitem',
    );
    expect(within(rows[0] as HTMLElement).getByText('Secret set')).toBeInTheDocument();
    expect(within(rows[1] as HTMLElement).queryByText('Secret set')).not.toBeInTheDocument();
  });

  it('has no axe violations', async () => {
    const { container } = renderList();
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('stateWord', () => {
  it('prefers approval, then Off, then the last run', () => {
    expect(stateWord(fakeAutomation({ enabled: false, awaiting_approval: true }))?.text).toBe(
      'Waiting for approval',
    );
    expect(stateWord(fakeAutomation({ enabled: false }))?.text).toBe('Off');
    expect(
      stateWord(
        fakeAutomation({
          last_run: {
            status: 'retrying',
            status_word: 'Retrying',
            created_at: '2026-10-02T10:00:00.000Z',
          },
        }),
      )?.text,
    ).toBe('Retrying');
    expect(stateWord(fakeAutomation())).toBeNull();
  });
});
