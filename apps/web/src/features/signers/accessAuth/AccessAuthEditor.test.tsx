import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from 'styled-components';
import { axe } from 'vitest-axe';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { seald } from '@/styles/theme';
import { AccessAuthEditor } from './AccessAuthEditor';
import type { AccessAuthSigner } from './AccessAuthEditor';
import { DEFAULT_ACCESS_AUTH } from './model';
import type { AccessAuthValue } from './model';

type FlagHost = { __SEALD_FEATURE_OVERRIDES__?: Record<string, boolean> };
const setFlag = (on: boolean): void => {
  (globalThis as unknown as FlagHost).__SEALD_FEATURE_OVERRIDES__ = { signerAccessAuth: on };
};

const SIGNERS: ReadonlyArray<AccessAuthSigner> = [
  { id: 'a', name: 'Ada', email: 'ada@example.com' },
  { id: 'b', name: 'Bo', email: 'bo@example.com' },
];

function Harness({ onChange }: { readonly onChange?: (v: AccessAuthValue) => void }) {
  const [value, setValue] = useState<AccessAuthValue>(DEFAULT_ACCESS_AUTH);
  return (
    <ThemeProvider theme={seald}>
      <AccessAuthEditor
        signers={SIGNERS}
        value={value}
        onChange={(next) => {
          setValue(next);
          onChange?.(next);
        }}
      />
    </ThemeProvider>
  );
}

describe('AccessAuthEditor', () => {
  beforeEach(() => setFlag(true));
  afterEach(() => {
    delete (globalThis as unknown as FlagHost).__SEALD_FEATURE_OVERRIDES__;
  });

  it('renders nothing while the flag is off', () => {
    setFlag(false);
    const { container } = render(<Harness />);
    expect(container).toBeEmptyDOMElement();
  });

  it('starts with both switches off and says "emailed one-time code" without claiming identity checks', () => {
    const { container } = render(<Harness />);
    expect(
      screen.getByRole('switch', { name: /require an emailed code to open/i }),
    ).not.toBeChecked();
    expect(screen.getByRole('switch', { name: /ask again before signing/i })).not.toBeChecked();
    expect(container.textContent).toMatch(/one-time code/i);
    expect(container.textContent).not.toMatch(/identity|verified/i);
  });

  it('turns the two document-wide switches on', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await userEvent.click(screen.getByRole('switch', { name: /require an emailed code to open/i }));
    await userEvent.click(screen.getByRole('switch', { name: /ask again before signing/i }));
    expect(onChange).toHaveBeenLastCalledWith({ access: true, action: true, overrides: {} });
  });

  it('overrides one recipient without touching the others', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await userEvent.click(screen.getByText('Per-recipient settings'));
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: /code to open for bo/i }),
      'on',
    );
    expect(onChange).toHaveBeenLastCalledWith({
      access: false,
      action: false,
      overrides: { b: { access: 'on', action: 'inherit' } },
    });
    expect(screen.getByRole('combobox', { name: /code to open for ada/i })).toHaveValue('inherit');
  });

  it('has no axe violations', async () => {
    const { container } = render(<Harness />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
