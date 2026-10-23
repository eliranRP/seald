import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { renderWithTheme } from '@/test/renderWithTheme';
import { ApprovalCard } from './ApprovalCard';
import { fakeSummary, KNOWN_RECIPIENTS, MANY_RECIPIENTS, NEW_RECIPIENT } from './fixtures';

describe('ApprovalCard', () => {
  it('shows the action, the title, the pages and the key, with no New flags when all are known', () => {
    renderWithTheme(<ApprovalCard summary={fakeSummary()} />);

    expect(screen.getByRole('heading', { name: 'Send for signature' })).toBeInTheDocument();
    expect(screen.getByText('Services agreement')).toBeInTheDocument();
    expect(screen.getByText('3 pages')).toBeInTheDocument();
    expect(screen.getByText('Sent via Key 2')).toBeInTheDocument();
    expect(screen.getByText('Approving as owner@example.test')).toBeInTheDocument();
    const list = screen.getByRole('list', { name: 'Recipients' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(within(list).queryByText('New')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /more/ })).not.toBeInTheDocument();
  });

  it('lists a new recipient first with a New flag', () => {
    renderWithTheme(
      <ApprovalCard summary={fakeSummary({ recipients: [...KNOWN_RECIPIENTS, NEW_RECIPIENT] })} />,
    );
    const items = within(screen.getByRole('list', { name: 'Recipients' })).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Linus Torvalds');
    expect(items[0]).toHaveTextContent('New');
    expect(items[1]).not.toHaveTextContent('New');
  });

  it('shows three recipients, then "+2 more" that expands to the full list', async () => {
    const user = userEvent.setup();
    renderWithTheme(<ApprovalCard summary={fakeSummary({ recipients: MANY_RECIPIENTS })} />);
    const list = screen.getByRole('list', { name: 'Recipients' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(3);

    const more = screen.getByRole('button', { name: '+2 more' });
    expect(more).toHaveAttribute('aria-expanded', 'false');
    await user.click(more);

    expect(within(list).getAllByRole('listitem')).toHaveLength(5);
    expect(screen.getByRole('button', { name: 'Show fewer' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('names a destination and "Sent via API key" whole', () => {
    renderWithTheme(
      <ApprovalCard
        summary={fakeSummary({
          kind: 'automation_external_destination',
          title: null,
          recipients: [],
          page_count: null,
          key_name: 'Sent via API key',
          destination: { kind: 'webhook', label: 'hooks.example.test/seald' },
        })}
      />,
    );
    expect(screen.getByText('Destination: hooks.example.test/seald')).toBeInTheDocument();
    expect(screen.getByText('Sent via API key')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Recipients' })).not.toBeInTheDocument();
  });

  it('shows the Fields updated badge and the expiry', () => {
    renderWithTheme(
      <ApprovalCard
        summary={fakeSummary()}
        fieldsUpdatedAt="2026-10-22T09:21:00.000Z"
        expiresAt={new Date(Date.now() + 24 * 60 * 60 * 1000 - 60_000).toISOString()}
      />,
    );
    expect(screen.getByText(/^Fields updated/)).toBeInTheDocument();
    expect(screen.getByText('Expires in 23h')).toBeInTheDocument();
  });

  it('lists the facts of a request with no document (WP-45)', async () => {
    const facts = [
      { label: 'Name', value: 'Zapier' },
      { label: 'Scopes', value: 'envelopes:read' },
    ];
    const { container } = renderWithTheme(
      <ApprovalCard
        summary={fakeSummary({ title: null, recipients: [], page_count: null, facts })}
      />,
    );
    expect(screen.getAllByRole('term').map((t) => t.textContent)).toEqual(['Name', 'Scopes']);
    expect(screen.getAllByRole('definition').map((d) => d.textContent)).toEqual([
      'Zapier',
      'envelopes:read',
    ]);
    expect(screen.queryByRole('list', { name: 'Recipients' })).not.toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('has no axe violations', async () => {
    const { container } = renderWithTheme(
      <ApprovalCard summary={fakeSummary({ recipients: MANY_RECIPIENTS })} />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
