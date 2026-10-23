import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { renderWithTheme } from '@/test/renderWithTheme';
import { SignBar } from './SignBar';

describe('SignBar', () => {
  it('counts the required fields and offers Next until they are done', async () => {
    const onNext = vi.fn();
    const user = userEvent.setup();
    const { getByText, getByRole, queryByRole, container } = renderWithTheme(
      <SignBar
        done={1}
        total={3}
        optionalLeft={1}
        ready={false}
        onNext={onNext}
        onFinish={() => {}}
      />,
    );
    expect(getByText('1 of 3')).toBeInTheDocument();
    expect(getByText('required')).toBeInTheDocument();
    expect(queryByRole('button', { name: 'Finish' })).toBeNull();
    await user.click(getByRole('button', { name: 'Next' }));
    expect(onNext).toHaveBeenCalledTimes(1);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('turns into Finish and names the optional fields left', async () => {
    const onFinish = vi.fn();
    const user = userEvent.setup();
    const { getByText, getByRole, queryByRole } = renderWithTheme(
      <SignBar done={3} total={3} optionalLeft={1} ready onNext={() => {}} onFinish={onFinish} />,
    );
    expect(getByText('3 of 3')).toBeInTheDocument();
    expect(getByText('1 optional')).toBeInTheDocument();
    expect(queryByRole('button', { name: 'Next' })).toBeNull();
    await user.click(getByRole('button', { name: 'Finish' }));
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it('shows no optional note when none are left', () => {
    const { queryByText } = renderWithTheme(
      <SignBar done={2} total={2} optionalLeft={0} ready onNext={() => {}} onFinish={() => {}} />,
    );
    expect(queryByText(/optional/)).toBeNull();
  });
});
