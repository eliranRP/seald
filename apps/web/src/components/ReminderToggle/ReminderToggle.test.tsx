import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

  it('marks the switch busy while a save is pending', () => {
    render(
      <ThemeProvider theme={seald}>
        <ReminderToggle enabled pending onChange={() => undefined} />
      </ThemeProvider>,
    );
    const toggle = screen.getByRole('switch', { name: /email reminders/i });
    expect(toggle).toBeDisabled();
    expect(toggle).toHaveAttribute('aria-busy', 'true');
  });
});
