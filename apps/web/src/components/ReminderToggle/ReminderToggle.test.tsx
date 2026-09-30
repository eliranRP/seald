import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { ThemeProvider } from 'styled-components';
import { seald } from '@/styles/theme';
import { ReminderToggle } from './ReminderToggle';

function Harness({ initial = true }: { readonly initial?: boolean }) {
  const [enabled, setEnabled] = useState(initial);
  return (
    <ThemeProvider theme={seald}>
      <ReminderToggle enabled={enabled} onChange={setEnabled} />
    </ThemeProvider>
  );
}

describe('ReminderToggle', () => {
  it('starts on and turns reminders off', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const toggle = screen.getByRole('switch', { name: /email reminders/i });
    expect(toggle).toBeChecked();
    expect(screen.getByText(/until they sign or the request expires/i)).toBeInTheDocument();
    await user.click(toggle);
    expect(toggle).not.toBeChecked();
  });

  it('can start off', () => {
    render(<Harness initial={false} />);
    expect(screen.getByRole('switch', { name: /email reminders/i })).not.toBeChecked();
  });

  it('sizes the switch from theme tokens and pins the indigo-500 focus color', () => {
    render(<Harness />);
    const css = [...document.querySelectorAll('style')]
      .map((node) => node.textContent ?? '')
      .join('\n');
    expect(css).toContain('var(--border-focus)');
    expect(css).toContain('13px');
    expect(css).not.toMatch(/#4[Ff]46[Ee]5/);
    expect(css).not.toContain('36px');
    expect(css).not.toContain('22px');
    expect(css).not.toContain('12px');
    expect(css).not.toContain('28px');
    expect(css).not.toContain('10px');
    expect(css).not.toContain('1.4');
  });

  it('toggles from the help text because the whole row is the label', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const toggle = screen.getByRole('switch', { name: /^email reminders$/i });
    const hint = screen.getByText(/until they sign or the request expires/i);
    expect(hint.closest('label')).toContainElement(toggle);
    await user.click(hint);
    expect(toggle).not.toBeChecked();
  });

  it('stays enabled and keeps focus while a save is pending', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(
      <ThemeProvider theme={seald}>
        <ReminderToggle enabled pending={false} onChange={onChange} />
      </ThemeProvider>,
    );
    const toggle = screen.getByRole('switch', { name: /^email reminders$/i });
    toggle.focus();
    rerender(
      <ThemeProvider theme={seald}>
        <ReminderToggle enabled pending onChange={onChange} />
      </ThemeProvider>,
    );
    expect(toggle).toBeEnabled();
    expect(toggle).toHaveAttribute('aria-busy', 'true');
    expect(toggle).toHaveAttribute('aria-disabled', 'true');
    expect(toggle).toHaveFocus();
    await user.click(toggle);
    await user.click(screen.getByText(/until they sign or the request expires/i));
    expect(onChange).not.toHaveBeenCalled();
    expect(toggle).toBeChecked();
  });
});
