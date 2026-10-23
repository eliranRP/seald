import { describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';
import { renderWithTheme } from '@/test/renderWithTheme';
import {
  DialogBackdrop,
  DialogBody,
  DialogCard,
  DialogDescription,
  DialogFoot,
  DialogFooter,
  DialogHead,
  DialogSectionedCard,
  DialogTitle,
} from './index';

describe('DialogPrimitives', () => {
  it('composes a labelled confirm dialog', () => {
    const { getByRole } = renderWithTheme(
      <DialogBackdrop>
        <DialogCard role="dialog" aria-modal="true" aria-labelledby="t">
          <DialogTitle id="t">Delete template?</DialogTitle>
          <DialogDescription>This cannot be undone.</DialogDescription>
          <DialogFooter>
            <button type="button">Cancel</button>
          </DialogFooter>
        </DialogCard>
      </DialogBackdrop>,
    );
    const dialog = getByRole('dialog', { name: 'Delete template?' });
    expect(dialog).toHaveTextContent('This cannot be undone.');
    expect(getByRole('heading', { level: 2, name: 'Delete template?' })).toBeInTheDocument();
  });

  it('composes a sectioned dialog with head, body and foot', async () => {
    const { getByRole, container } = renderWithTheme(
      <DialogBackdrop>
        <DialogSectionedCard role="dialog" aria-modal="true" aria-labelledby="h">
          <DialogHead>
            <DialogTitle id="h">Send settings</DialogTitle>
          </DialogHead>
          <DialogBody>Body</DialogBody>
          <DialogFoot>
            <button type="button">Done</button>
          </DialogFoot>
        </DialogSectionedCard>
      </DialogBackdrop>,
    );
    expect(getByRole('dialog', { name: 'Send settings' })).toHaveTextContent('Body');
    expect(await axe(container)).toHaveNoViolations();
  });
});
