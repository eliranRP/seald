import { describe, it, expect, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { Send } from 'lucide-react';
import { renderWithTheme } from '../../test/renderWithTheme';
import { Button } from './Button';

describe('Button', () => {
  it('renders as a native button with its label', () => {
    const { getByRole } = renderWithTheme(<Button>Send for signature</Button>);
    expect(getByRole('button', { name: 'Send for signature' })).toBeInTheDocument();
  });

  it('fires onClick when activated', async () => {
    const onClick = vi.fn();
    const { getByRole } = renderWithTheme(<Button onClick={onClick}>Sign now</Button>);
    await userEvent.click(getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('activates on Enter and Space (keyboard)', async () => {
    const onClick = vi.fn();
    const { getByRole } = renderWithTheme(<Button onClick={onClick}>Go</Button>);
    getByRole('button').focus();
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard(' ');
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it('disabled blocks click and sets aria-disabled', async () => {
    const onClick = vi.fn();
    const { getByRole } = renderWithTheme(
      <Button onClick={onClick} disabled>
        Go
      </Button>,
    );
    await userEvent.click(getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
    expect(getByRole('button')).toHaveAttribute('aria-disabled', 'true');
  });

  it('loading disables click and sets aria-busy', async () => {
    const onClick = vi.fn();
    const { getByRole } = renderWithTheme(
      <Button onClick={onClick} loading iconLeft={Send}>
        Send
      </Button>,
    );
    await userEvent.click(getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
    expect(getByRole('button')).toHaveAttribute('aria-busy', 'true');
  });

  it('renders without axe violations', async () => {
    const { container } = renderWithTheme(<Button>OK</Button>);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('forwards ref to the root button', () => {
    const ref = { current: null as HTMLButtonElement | null };
    renderWithTheme(<Button ref={ref}>Go</Button>);
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
  });

  it('forwards rest props (className, data-*) to the root button', () => {
    const { getByRole } = renderWithTheme(
      <Button data-testid="go" className="custom">
        Go
      </Button>,
    );
    const btn = getByRole('button');
    expect(btn).toHaveAttribute('data-testid', 'go');
    expect(btn).toHaveClass('custom');
  });
});
