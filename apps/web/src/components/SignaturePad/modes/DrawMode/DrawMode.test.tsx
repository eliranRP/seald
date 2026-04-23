import { beforeAll, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen, waitFor } from '@testing-library/react';
import { renderWithTheme } from '../../../../test/renderWithTheme';
import { DrawMode } from './DrawMode';

class PointerEventPolyfill extends MouseEvent {
  readonly pointerId: number;

  readonly pointerType: string;

  constructor(type: string, params: PointerEventInit = {}) {
    super(type, params);
    this.pointerId = params.pointerId ?? 0;
    this.pointerType = params.pointerType ?? '';
  }
}

beforeAll(() => {
  if (typeof window.PointerEvent === 'undefined') {
    Object.defineProperty(window, 'PointerEvent', {
      value: PointerEventPolyfill,
      configurable: true,
    });
    Object.defineProperty(globalThis, 'PointerEvent', {
      value: PointerEventPolyfill,
      configurable: true,
    });
  }
  const stubCtx = {
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    clearRect: vi.fn(),
    lineWidth: 0,
    strokeStyle: '',
    lineCap: '',
    lineJoin: '',
  };
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    value: vi.fn().mockReturnValue(stubCtx),
    configurable: true,
  });
  Object.defineProperty(HTMLCanvasElement.prototype, 'toDataURL', {
    value: vi.fn().mockReturnValue('data:image/png;base64,AAAA'),
    configurable: true,
  });
});

describe('DrawMode', () => {
  it('renders a canvas with an accessible name', () => {
    renderWithTheme(<DrawMode onCommit={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole('img', { name: /signature canvas/i })).toBeInTheDocument();
  });

  it('Done is disabled until at least one stroke is drawn', () => {
    renderWithTheme(<DrawMode onCommit={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole('button', { name: /done/i })).toBeDisabled();
  });

  it('Clear resets and re-disables Done', async () => {
    renderWithTheme(<DrawMode onCommit={vi.fn()} onCancel={vi.fn()} />);
    const canvas = screen.getByRole('img', { name: /signature canvas/i });
    canvas.dispatchEvent(
      new PointerEvent('pointerdown', {
        clientX: 10,
        clientY: 10,
        pointerId: 1,
        bubbles: true,
      }),
    );
    canvas.dispatchEvent(
      new PointerEvent('pointermove', {
        clientX: 20,
        clientY: 15,
        pointerId: 1,
        bubbles: true,
      }),
    );
    canvas.dispatchEvent(
      new PointerEvent('pointerup', {
        clientX: 20,
        clientY: 15,
        pointerId: 1,
        bubbles: true,
      }),
    );
    await waitFor(() => expect(screen.getByRole('button', { name: /done/i })).toBeEnabled());
    await userEvent.click(screen.getByRole('button', { name: /clear/i }));
    expect(screen.getByRole('button', { name: /done/i })).toBeDisabled();
  });

  it('commits a drawn value with a pngDataUrl and strokes', async () => {
    const onCommit = vi.fn();
    renderWithTheme(<DrawMode onCommit={onCommit} onCancel={vi.fn()} />);
    const canvas = screen.getByRole('img', { name: /signature canvas/i });
    canvas.dispatchEvent(
      new PointerEvent('pointerdown', {
        clientX: 0,
        clientY: 0,
        pointerId: 1,
        bubbles: true,
      }),
    );
    canvas.dispatchEvent(
      new PointerEvent('pointerup', {
        clientX: 5,
        clientY: 5,
        pointerId: 1,
        bubbles: true,
      }),
    );
    await userEvent.click(screen.getByRole('button', { name: /done/i }));
    expect(onCommit).toHaveBeenCalled();
    const firstCall = onCommit.mock.calls[0];
    const arg = firstCall ? firstCall[0] : undefined;
    expect(arg.kind).toBe('drawn');
    expect(typeof arg.pngDataUrl).toBe('string');
    expect(arg.pngDataUrl).toMatch(/^data:image\/png/);
    // Accept either `strokes` or `strokeCount` — whichever the union declares.
    const count = arg.strokes ?? arg.strokeCount;
    expect(count).toBe(1);
  });

  it('has an aria-live region that announces when captured', () => {
    renderWithTheme(<DrawMode onCommit={vi.fn()} onCancel={vi.fn()} />);
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
  });
});
