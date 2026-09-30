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
    expect(screen.getByText(/about once a day/i)).toBeInTheDocument();
    await user.click(toggle);
    expect(toggle).not.toBeChecked();
  });

  it('can start off', () => {
    render(<Harness initial={false} />);
    expect(screen.getByRole('switch', { name: /email reminders/i })).not.toBeChecked();
  });
});
