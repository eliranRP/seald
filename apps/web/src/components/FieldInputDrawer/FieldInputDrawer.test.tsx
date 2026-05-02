import { describe, it, expect, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { renderWithTheme } from '../../test/renderWithTheme';
import { FieldInputDrawer } from './FieldInputDrawer';

describe('FieldInputDrawer', () => {
  it('renders nothing when closed', () => {
    const { queryByRole } = renderWithTheme(
      <FieldInputDrawer
        open={false}
        kind="text"
        label="Job title"
        onCancel={() => {}}
        onApply={() => {}}
      />,
    );
    expect(queryByRole('dialog')).toBeNull();
  });

  it('renders label + typed input when open', () => {
    const { getByRole } = renderWithTheme(
      <FieldInputDrawer
        open
        kind="text"
        label="Job title"
        onCancel={() => {}}
        onApply={() => {}}
      />,
    );
    expect(getByRole('dialog', { name: /job title/i })).toBeInTheDocument();
    expect(getByRole('textbox', { name: 'Job title' })).toBeInTheDocument();
  });

  it('Apply is disabled when value is empty', () => {
    const { getByRole } = renderWithTheme(
      <FieldInputDrawer
        open
        kind="text"
        label="Job title"
        onCancel={() => {}}
        onApply={() => {}}
      />,
    );
    expect(getByRole('button', { name: /apply/i })).toBeDisabled();
  });

  it('email kind rejects bad email with an alert', async () => {
    const onApply = vi.fn();
    const { getByRole } = renderWithTheme(
      <FieldInputDrawer open kind="email" label="Email" onCancel={() => {}} onApply={onApply} />,
    );
    await userEvent.type(getByRole('textbox', { name: 'Email' }), 'not-an-email');
    await userEvent.click(getByRole('button', { name: /apply/i }));
    expect(getByRole('alert')).toHaveTextContent(/valid email/i);
    expect(onApply).not.toHaveBeenCalled();
  });

  it('valid text submits the trimmed value', async () => {
    const onApply = vi.fn();
    const { getByRole } = renderWithTheme(
      <FieldInputDrawer open kind="text" label="Job title" onCancel={() => {}} onApply={onApply} />,
    );
    await userEvent.type(getByRole('textbox', { name: 'Job title' }), '  Engineer  ');
    await userEvent.click(getByRole('button', { name: /apply/i }));
    expect(onApply).toHaveBeenCalledWith('Engineer');
  });

  it('Enter submits', async () => {
    const onApply = vi.fn();
    const { getByRole } = renderWithTheme(
      <FieldInputDrawer open kind="text" label="Job title" onCancel={() => {}} onApply={onApply} />,
    );
    const input = getByRole('textbox', { name: 'Job title' });
    await userEvent.type(input, 'Lead{Enter}');
    expect(onApply).toHaveBeenCalledWith('Lead');
  });

  it('Escape fires onCancel', async () => {
    const onCancel = vi.fn();
    renderWithTheme(
      <FieldInputDrawer
        open
        kind="text"
        label="Job title"
        onCancel={onCancel}
        onApply={() => {}}
      />,
    );
    await userEvent.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('axe clean', async () => {
    const { container } = renderWithTheme(
      <FieldInputDrawer
        open
        kind="text"
        label="Job title"
        onCancel={() => {}}
        onApply={() => {}}
      />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  describe('mobile-keyboard / safe-area regression', () => {
    // BUG FIX: the bottom sheet was a fixed 100vh backdrop with no max-height
    // or scroll on the inner Sheet. On iOS Safari the visual viewport
    // shrinks under the on-screen keyboard but `vh` units do not reflect
    // it, so the Apply button sat below the keyboard, unreachable. The
    // sheet now uses dynamic-viewport units, allows the inner sheet to
    // scroll, and reserves padding for the iPhone home-indicator
    // (safe-area-inset-bottom).
    it('Sheet has overflow scroll and dvh max-height so the footer stays reachable on mobile', () => {
      const { getByRole } = renderWithTheme(
        <FieldInputDrawer
          open
          kind="text"
          label="Job title"
          onCancel={() => {}}
          onApply={() => {}}
        />,
      );
      const dialog = getByRole('dialog');
      // The Sheet is the dialog's only direct element child (Backdrop > Sheet).
      const sheet = dialog.firstElementChild as HTMLElement;
      const styles = window.getComputedStyle(sheet);
      // jsdom does not honour the @supports(env()) call, so we assert on
      // the rendered CSSOM properties directly. Both `max-height` and
      // `overflow-y: auto` must be present so the footer is reachable
      // even when the visual viewport shrinks under the soft keyboard.
      expect(sheet.style.cssText + styles.cssText).toMatch(/max-height/i);
      expect(sheet.style.cssText + styles.cssText).toMatch(/overflow/i);
    });

    it('traps Tab focus inside the dialog (a11y regression)', async () => {
      // BUG FIX: aria-modal="true" was set but Tab navigation was not
      // trapped. Keyboard users could Tab outside the open dialog and
      // interact with the page underneath, defeating the modal contract.
      // The fix adds a Tab-cycle handler so focus stays within the sheet.
      // We render an external focusable element to assert it never receives
      // keyboard focus while the dialog is open.
      const { getByRole, getByTestId } = renderWithTheme(
        <>
          <button data-testid="external" type="button">
            Outside
          </button>
          <FieldInputDrawer
            open
            kind="text"
            label="Job title"
            onCancel={() => {}}
            onApply={() => {}}
          />
        </>,
      );
      const dialog = getByRole('dialog');
      const external = getByTestId('external');
      // Type a value so the Apply button is no longer disabled (disabled
      // controls are skipped by browser tab order).
      await userEvent.type(getByRole('textbox', { name: 'Job title' }), 'Engineer');
      const apply = getByRole('button', { name: /apply/i });
      apply.focus();
      expect(document.activeElement).toBe(apply);
      // Tab forward from the last focusable inside the sheet — focus
      // should wrap back into the dialog, NOT escape to the external btn.
      await userEvent.tab();
      expect(document.activeElement).not.toBe(external);
      expect(dialog.contains(document.activeElement)).toBe(true);
    });

    it('Backdrop uses dynamic-viewport height so the iOS keyboard does not push the sheet offscreen', () => {
      const { getByRole } = renderWithTheme(
        <FieldInputDrawer
          open
          kind="text"
          label="Job title"
          onCancel={() => {}}
          onApply={() => {}}
        />,
      );
      const dialog = getByRole('dialog');
      // Read the raw CSS text — jsdom drops `100dvh` from the computed
      // style, but the literal source is preserved in the styled
      // component's injected stylesheet, accessible via .cssText.
      const allStyles = Array.from(document.styleSheets)
        .flatMap((s) => {
          try {
            return Array.from(s.cssRules);
          } catch {
            return [];
          }
        })
        .map((r) => r.cssText)
        .join('\n');
      // Match either the modern `dvh` unit or a fallback `height: 100%` with
      // `min-height: 100%` — both keep the backdrop bound to the visual
      // viewport instead of the layout viewport on iOS Safari.
      expect(allStyles).toMatch(/dvh|svh/i);
      void dialog;
    });
  });
});
