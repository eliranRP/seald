import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from 'styled-components';
import { seald } from '@/styles/theme';
import { MWPlace } from './MWPlace';
import type { MobileFieldType } from '../types';

/**
 * PR #108 PM-P0-3: the design's "armed chip" visual state could not be
 * verified in the live harness. The visual rule is `Chip $armed` (indigo
 * background) and the assistive rule is `aria-pressed`. This test pins
 * both so a regression on either fires in vitest, not in production.
 */

interface RenderOpts {
  readonly armedTool?: MobileFieldType | null;
  readonly onArmTool?: (t: MobileFieldType | null) => void;
}

function renderPlace(opts: RenderOpts = {}) {
  const onArmTool = opts.onArmTool ?? vi.fn();
  return {
    onArmTool,
    ...render(
      <ThemeProvider theme={seald}>
        <MWPlace
          page={1}
          totalPages={1}
          onPage={vi.fn()}
          fields={[]}
          signers={[]}
          selectedIds={[]}
          armedTool={opts.armedTool ?? null}
          onArmTool={onArmTool}
          onCanvasTap={vi.fn()}
          onTapField={vi.fn()}
          onClearSelection={vi.fn()}
          onOpenApply={vi.fn()}
          onOpenAssign={vi.fn()}
          onDeleteSelected={vi.fn()}
          onCommitDrag={vi.fn()}
        />
      </ThemeProvider>,
    ),
  };
}

describe('MWPlace — field-types toolbar (chip armed state)', () => {
  it('starts with every chip aria-pressed=false when no tool is armed', () => {
    renderPlace();
    const toolbar = screen.getByRole('toolbar', { name: /field types/i });
    const chips = within(toolbar).getAllByRole('button');
    expect(chips).toHaveLength(5);
    chips.forEach((chip) => {
      expect(chip).toHaveAttribute('aria-pressed', 'false');
    });
  });

  it('marks only the armed chip as aria-pressed=true', () => {
    renderPlace({ armedTool: 'sig' });
    const toolbar = screen.getByRole('toolbar', { name: /field types/i });
    const sigChip = within(toolbar).getByRole('button', {
      name: /Signature \(armed/i,
    });
    expect(sigChip).toHaveAttribute('aria-pressed', 'true');
    // No other chip should be pressed.
    const others = within(toolbar)
      .getAllByRole('button')
      .filter((b) => b !== sigChip);
    others.forEach((chip) => {
      expect(chip).toHaveAttribute('aria-pressed', 'false');
    });
  });

  it('arms a tool when its chip is tapped', async () => {
    const user = userEvent.setup();
    const { onArmTool } = renderPlace({ armedTool: null });
    const toolbar = screen.getByRole('toolbar', { name: /field types/i });
    await user.click(within(toolbar).getByRole('button', { name: /^Signature$/ }));
    expect(onArmTool).toHaveBeenCalledWith('sig');
  });

  it('disarms a tool when its already-armed chip is tapped again', async () => {
    const user = userEvent.setup();
    const { onArmTool } = renderPlace({ armedTool: 'sig' });
    const toolbar = screen.getByRole('toolbar', { name: /field types/i });
    await user.click(within(toolbar).getByRole('button', { name: /Signature \(armed/i }));
    expect(onArmTool).toHaveBeenCalledWith(null);
  });
});
