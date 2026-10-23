import { render, screen, within } from '@testing-library/react';
import { ThemeProvider } from 'styled-components';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seald } from '@/styles/theme';
import { SigningOrderSteps, stepSignerState, type StepSignerView } from './SigningOrderSteps';

type FlagHost = { __SEALD_FEATURE_OVERRIDES__?: Record<string, boolean> };
const setFlag = (on: boolean): void => {
  (globalThis as unknown as FlagHost).__SEALD_FEATURE_OVERRIDES__ = { signingOrder: on };
};

const SIGNERS: ReadonlyArray<StepSignerView> = [
  { id: 'a', name: 'Ada', step: 1, invited_at: 't', signed_at: 't', declined_at: null },
  { id: 'b', name: 'Bo', step: 2, invited_at: 't', signed_at: null, declined_at: null },
  { id: 'c', name: 'Cy', step: 3, invited_at: null, signed_at: null, declined_at: null },
];

const view = (mode: 'parallel' | 'sequential' | undefined, sent = true) => (
  <ThemeProvider theme={seald}>
    <SigningOrderSteps deliveryMode={mode} signers={SIGNERS} sent={sent} />
  </ThemeProvider>
);

describe('SigningOrderSteps', () => {
  beforeEach(() => setFlag(true));
  afterEach(() => {
    delete (globalThis as unknown as FlagHost).__SEALD_FEATURE_OVERRIDES__;
  });

  it('shows signed, invited and waiting signers under their step', () => {
    render(view('sequential'));
    const region = screen.getByRole('region', { name: 'Signing steps' });
    expect(within(region).getByText('Signed')).toBeInTheDocument();
    expect(within(region).getByText('Invited')).toBeInTheDocument();
    expect(within(region).getByText('Waiting for their turn')).toBeInTheDocument();
    expect(within(region).getAllByRole('listitem').length).toBeGreaterThanOrEqual(3);
  });

  it('says "Not sent yet" for a draft', () => {
    render(view('sequential', false));
    expect(screen.getAllByText('Not sent yet')).toHaveLength(2);
  });

  it('renders nothing for a parallel envelope or with the flag off', () => {
    const { container, rerender } = render(view('parallel'));
    expect(container).toBeEmptyDOMElement();
    setFlag(false);
    rerender(view('sequential'));
    expect(container).toBeEmptyDOMElement();
  });

  it('classifies a declined signer first', () => {
    expect(
      stepSignerState(
        { id: 'x', name: 'X', invited_at: 't', signed_at: null, declined_at: 't' },
        true,
      ),
    ).toBe('declined');
  });
});
