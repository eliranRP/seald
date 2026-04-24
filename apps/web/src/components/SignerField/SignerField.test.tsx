import { describe, it, expect, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { renderWithTheme } from '../../test/renderWithTheme';
import { SignerField } from './SignerField';
import type { SignerFieldKind } from './SignerField.types';

const baseProps = {
  x: 10,
  y: 10,
  w: 200,
  h: 54,
  active: false,
  filled: false,
  required: true,
  onActivate: () => {},
};

const KINDS: ReadonlyArray<SignerFieldKind> = [
  'signature',
  'initials',
  'date',
  'text',
  'checkbox',
  'email',
  'name',
];

describe('SignerField', () => {
  KINDS.forEach((kind) => {
    it(`renders empty required state for kind=${kind}`, () => {
      const { getByRole } = renderWithTheme(
        <SignerField {...baseProps} kind={kind} label={kind} />,
      );
      const btn = getByRole('button');
      expect(btn).toHaveAttribute('data-kind', kind);
      expect(btn).toHaveAttribute('data-tone', 'amber');
      expect(btn).toHaveAttribute('data-filled', 'false');
    });
  });

  it('filled sets success tone and renders the value', () => {
    const { getByRole, getByText } = renderWithTheme(
      <SignerField {...baseProps} kind="text" label="Text" filled value="hello" />,
    );
    expect(getByRole('button')).toHaveAttribute('data-tone', 'success');
    expect(getByText('hello')).toBeInTheDocument();
  });

  it('active (unfilled) sets indigo tone', () => {
    const { getByRole } = renderWithTheme(
      <SignerField {...baseProps} kind="text" label="Text" active />,
    );
    expect(getByRole('button')).toHaveAttribute('data-tone', 'indigo');
  });

  it('optional empty sets neutral tone', () => {
    const { getByRole } = renderWithTheme(
      <SignerField {...baseProps} required={false} kind="text" label="Text" />,
    );
    expect(getByRole('button')).toHaveAttribute('data-tone', 'neutral');
  });

  it('checkbox reflects value=true via aria-pressed', () => {
    const { getByRole } = renderWithTheme(
      <SignerField {...baseProps} kind="checkbox" label="Agree" filled value />,
    );
    const btn = getByRole('button');
    expect(btn).toHaveAttribute('aria-pressed', 'true');
  });

  it('click fires onActivate', async () => {
    const onActivate = vi.fn();
    const { getByRole } = renderWithTheme(
      <SignerField {...baseProps} kind="text" label="Text" onActivate={onActivate} />,
    );
    await userEvent.click(getByRole('button'));
    expect(onActivate).toHaveBeenCalledTimes(1);
  });

  it('axe clean', async () => {
    const { container } = renderWithTheme(<SignerField {...baseProps} kind="text" label="Text" />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('forwards ref', () => {
    const ref = { current: null as HTMLButtonElement | null };
    renderWithTheme(<SignerField ref={ref} {...baseProps} kind="text" label="Text" />);
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
  });
});
