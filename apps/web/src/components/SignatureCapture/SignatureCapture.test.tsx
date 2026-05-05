import { describe, it, expect, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { renderWithTheme } from '../../test/renderWithTheme';
import { SignatureCapture, computeScaledFontSize, CAPTURE_WIDTH } from './SignatureCapture';

beforeEach(() => {
  // jsdom does not implement HTMLCanvasElement.prototype.toBlob; stub it.
  HTMLCanvasElement.prototype.toBlob = function toBlobStub(cb: BlobCallback) {
    cb(new Blob(['fake'], { type: 'image/png' }));
  };
});

describe('SignatureCapture', () => {
  it('renders nothing when closed', () => {
    const { queryByRole } = renderWithTheme(
      <SignatureCapture
        open={false}
        kind="signature"
        defaultName="Maya Raskin"
        onCancel={() => {}}
        onApply={() => {}}
      />,
    );
    expect(queryByRole('dialog')).toBeNull();
  });

  it('defaults to type tab; switching tabs updates aria-selected', async () => {
    const { getByRole } = renderWithTheme(
      <SignatureCapture
        open
        kind="signature"
        defaultName="Maya Raskin"
        onCancel={() => {}}
        onApply={() => {}}
      />,
    );
    const typeTab = getByRole('tab', { name: /type/i });
    expect(typeTab).toHaveAttribute('aria-selected', 'true');
    const drawTab = getByRole('tab', { name: /draw/i });
    await userEvent.click(drawTab);
    expect(drawTab).toHaveAttribute('aria-selected', 'true');
  });

  it('type tab: Apply emits a typed SignatureCaptureResult', async () => {
    const onApply = vi.fn();
    const { getByRole } = renderWithTheme(
      <SignatureCapture
        open
        kind="signature"
        defaultName="Maya Raskin"
        onCancel={() => {}}
        onApply={onApply}
      />,
    );
    await userEvent.click(getByRole('button', { name: /apply/i }));
    await vi.waitFor(() => expect(onApply).toHaveBeenCalledTimes(1));
    const result = onApply.mock.calls[0]?.[0];
    expect(result.format).toBe('typed');
    expect(result.font).toBe('Caveat');
    expect(result.blob).toBeInstanceOf(Blob);
  });

  it('Apply is disabled when typed name is empty', async () => {
    const { getByRole, getByLabelText } = renderWithTheme(
      <SignatureCapture
        open
        kind="signature"
        defaultName="Maya Raskin"
        onCancel={() => {}}
        onApply={() => {}}
      />,
    );
    const input = getByLabelText(/your full name/i);
    await userEvent.clear(input);
    expect(getByRole('button', { name: /apply/i })).toBeDisabled();
  });

  it('Escape fires onCancel', async () => {
    const onCancel = vi.fn();
    renderWithTheme(
      <SignatureCapture
        open
        kind="signature"
        defaultName="Maya Raskin"
        onCancel={onCancel}
        onApply={() => {}}
      />,
    );
    await userEvent.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('Cancel button fires onCancel', async () => {
    const onCancel = vi.fn();
    const { getAllByRole } = renderWithTheme(
      <SignatureCapture
        open
        kind="signature"
        defaultName="Maya Raskin"
        onCancel={onCancel}
        onApply={() => {}}
      />,
    );
    // Two buttons match "cancel" (the X icon close + the footer Cancel).
    // Click the last one (footer).
    const cancels = getAllByRole('button', { name: /^cancel$/i });
    await userEvent.click(cancels[cancels.length - 1]!);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('renders without axe violations', async () => {
    const { container } = renderWithTheme(
      <SignatureCapture
        open
        kind="initials"
        defaultName="Maya Raskin"
        onCancel={() => {}}
        onApply={() => {}}
      />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});

/**
 * Regression guard: typed signature text must never be clipped.
 * Bug: "Eliran Azulay, Managing member" was cut off because the font
 * size was hardcoded at 78px. computeScaledFontSize now shrinks the
 * font until it fits.
 */
/**
 * Regression guard: typed signature text must never be clipped.
 * Bug: "Eliran Azulay, Managing member" was cut off because the font
 * size was hardcoded at 78px. computeScaledFontSize now shrinks the
 * font until it fits.
 *
 * jsdom doesn't implement Canvas 2D, so we use a fake ctx with a
 * deterministic measureText that simulates width = chars * fontSize * 0.5.
 */
describe('computeScaledFontSize — signature text scaling', () => {
  const MAX_TEXT_WIDTH = CAPTURE_WIDTH - 40; // 560px
  const FONT_FAMILY = 'Caveat, cursive';

  /** Fake CanvasRenderingContext2D with deterministic measureText. */
  function makeFakeCtx(): CanvasRenderingContext2D {
    let currentFont = '';
    return {
      set font(f: string) {
        currentFont = f;
      },
      get font() {
        return currentFont;
      },
      measureText(text: string) {
        // Extract font size from the font string (e.g. "500 78px Caveat, cursive")
        const match = currentFont.match(/(\d+)px/);
        const size = match ? Number(match[1]) : 78;
        // Approximate: each character is ~0.5 * fontSize wide
        return { width: text.length * size * 0.5 };
      },
    } as unknown as CanvasRenderingContext2D;
  }

  it('uses the maximum font size for short text (2 chars)', () => {
    const ctx = makeFakeCtx();
    const fontSize = computeScaledFontSize(ctx, 'EA', 78, 28, MAX_TEXT_WIDTH, FONT_FAMILY);
    // "EA" = 2 chars × 78 × 0.5 = 78px — fits in 560px
    expect(fontSize).toBe(78);
  });

  it('shrinks the font for long signature names so text fits', () => {
    const ctx = makeFakeCtx();
    const longName = 'Eliran Azulay, Managing member'; // 30 chars
    // At 78px: 30 × 78 × 0.5 = 1170px > 560px → must shrink
    const fontSize = computeScaledFontSize(ctx, longName, 78, 28, MAX_TEXT_WIDTH, FONT_FAMILY);
    expect(fontSize).toBeLessThan(78);
    // Verify fits at the computed size
    ctx.font = `500 ${fontSize}px ${FONT_FAMILY}`;
    expect(ctx.measureText(longName).width).toBeLessThanOrEqual(MAX_TEXT_WIDTH);
  });

  it('never goes below the minimum font size even for extremely long text', () => {
    const ctx = makeFakeCtx();
    const extremelyLong = 'A'.repeat(200);
    const fontSize = computeScaledFontSize(ctx, extremelyLong, 78, 28, MAX_TEXT_WIDTH, FONT_FAMILY);
    expect(fontSize).toBe(28);
  });

  it('uses the larger max font size for initials', () => {
    const ctx = makeFakeCtx();
    const fontSize = computeScaledFontSize(ctx, 'EA', 110, 28, MAX_TEXT_WIDTH, FONT_FAMILY);
    // "EA" = 2 chars × 110 × 0.5 = 110px — fits in 560px
    expect(fontSize).toBe(110);
  });

  it('typical long names all fit without clipping', () => {
    const ctx = makeFakeCtx();
    const names = [
      'Eliran Azulay, Managing member',
      'Christopher Alexander Hamilton III',
      'Maria del Carmen Gonzalez Fernandez',
      'Jean-Pierre Beaumont de la Fontaine',
    ];
    for (const name of names) {
      const fontSize = computeScaledFontSize(ctx, name, 78, 28, MAX_TEXT_WIDTH, FONT_FAMILY);
      ctx.font = `500 ${fontSize}px ${FONT_FAMILY}`;
      const textWidth = ctx.measureText(name).width;
      expect(
        textWidth,
        `"${name}" overflows at ${fontSize}px (${textWidth}px > ${MAX_TEXT_WIDTH}px)`,
      ).toBeLessThanOrEqual(MAX_TEXT_WIDTH);
    }
  });

  it('font size decreases in 2px steps', () => {
    const ctx = makeFakeCtx();
    // 15 chars at 78px: 15 × 78 × 0.5 = 585px > 560px → one step down
    const fontSize = computeScaledFontSize(
      ctx,
      'A'.repeat(15),
      78,
      28,
      MAX_TEXT_WIDTH,
      FONT_FAMILY,
    );
    expect(fontSize % 2).toBe(0); // always even (decrements by 2)
    expect(fontSize).toBeLessThan(78);
  });
});
