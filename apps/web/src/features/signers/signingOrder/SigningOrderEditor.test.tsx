import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from 'styled-components';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { seald } from '@/styles/theme';
import { reconcileRows, type SigningOrderValue } from './model';
import { SigningOrderEditor, type SigningOrderSigner } from './SigningOrderEditor';

type FlagHost = { __SEALD_FEATURE_OVERRIDES__?: Record<string, boolean> };
const setFlag = (on: boolean): void => {
  (globalThis as unknown as FlagHost).__SEALD_FEATURE_OVERRIDES__ = { signingOrder: on };
};

const SIGNERS: ReadonlyArray<SigningOrderSigner> = [
  { id: 'a', name: 'Ada', email: 'ada@example.com' },
  { id: 'b', name: 'Bo', email: 'bo@example.com' },
  { id: 'c', name: 'Cy', email: 'cy@example.com' },
];

function Harness({
  signers = SIGNERS,
  initial,
  onChange,
}: {
  readonly signers?: ReadonlyArray<SigningOrderSigner>;
  readonly initial?: SigningOrderValue;
  readonly onChange?: (next: SigningOrderValue) => void;
}) {
  const ids = signers.map((s) => s.id);
  const [raw, setRaw] = useState<SigningOrderValue>(initial ?? { sequential: false, rows: [] });
  const value = reconcileRows(raw, ids);
  return (
    <ThemeProvider theme={seald}>
      <SigningOrderEditor
        signers={signers}
        value={value}
        onChange={(next) => {
          setRaw(next);
          onChange?.(next);
        }}
      />
    </ThemeProvider>
  );
}

const ORDERED: SigningOrderValue = {
  sequential: true,
  rows: [
    { id: 'a', joinsPrevious: false },
    { id: 'b', joinsPrevious: false },
    { id: 'c', joinsPrevious: false },
  ],
};

describe('SigningOrderEditor', () => {
  beforeEach(() => setFlag(true));
  afterEach(() => {
    delete (globalThis as unknown as FlagHost).__SEALD_FEATURE_OVERRIDES__;
  });

  it('renders nothing while the flag is off', () => {
    setFlag(false);
    const { container } = render(<Harness />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing with a single signer', () => {
    const { container } = render(<Harness signers={SIGNERS.slice(0, 1)} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('starts in any order and shows no list', () => {
    render(<Harness />);
    expect(screen.getByRole('switch', { name: 'Signing order' })).not.toBeChecked();
    expect(screen.queryByRole('list', { name: 'Signing steps' })).not.toBeInTheDocument();
  });

  it('lists the signers as steps once switched on', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('switch', { name: 'Signing order' }));
    const list = screen.getByRole('list', { name: 'Signing steps' });
    expect(list).toBeInTheDocument();
    expect(screen.getByText('Step 1')).toBeInTheDocument();
    expect(screen.getByText('Step 3')).toBeInTheDocument();
    expect(screen.getByText('Ada')).toBeInTheDocument();
  });

  it('reorders with the Move buttons and announces it', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness initial={ORDERED} onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: 'Move Ada down' }));
    const last = onChange.mock.calls.at(-1)?.[0] as SigningOrderValue;
    expect(last.rows.map((r) => r.id)).toEqual(['b', 'a', 'c']);
    expect(screen.getByRole('status')).toHaveTextContent('Moved Ada to position 2 of 3.');
  });

  it('keeps keyboard focus on the moved row after a move', async () => {
    const user = userEvent.setup();
    render(<Harness initial={ORDERED} />);
    await user.click(screen.getByRole('button', { name: 'Move Ada down' }));
    expect(screen.getByRole('button', { name: 'Move Ada down' })).toHaveFocus();
  });

  it('disables moving the first row up and the last row down', () => {
    render(<Harness initial={ORDERED} />);
    expect(screen.getByRole('button', { name: 'Move Ada up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move Cy down' })).toBeDisabled();
  });

  it('puts two signers in the same step', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness initial={ORDERED} onChange={onChange} />);
    expect(
      screen.queryByRole('checkbox', { name: 'Ada signs in the same step as' }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: 'Bo signs in the same step as Ada' }));
    const last = onChange.mock.calls.at(-1)?.[0] as SigningOrderValue;
    expect(last.rows.find((r) => r.id === 'b')?.joinsPrevious).toBe(true);
    // Ada and Bo now share step 1; Cy moves up to step 2.
    expect(screen.getAllByText('Step 1')).toHaveLength(2);
    expect(screen.getByText('Step 2')).toBeInTheDocument();
  });

  it('adds a newly added signer as its own last step', () => {
    const { rerender } = render(<Harness signers={SIGNERS.slice(0, 2)} initial={ORDERED} />);
    rerender(<Harness signers={SIGNERS} initial={ORDERED} />);
    expect(screen.getByText('Cy')).toBeInTheDocument();
  });
});
