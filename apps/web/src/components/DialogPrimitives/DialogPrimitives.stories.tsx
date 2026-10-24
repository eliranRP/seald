import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from '../Button';
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

const meta: Meta<typeof DialogCard> = {
  title: 'L1/DialogPrimitives',
  component: DialogCard,
  tags: ['autodocs', 'layer-1'],
  parameters: { layout: 'fullscreen' },
};
export default meta;
type Story = StoryObj<typeof DialogCard>;

export const Confirm: Story = {
  render: () => (
    <DialogBackdrop>
      <DialogCard role="dialog" aria-modal="true" aria-labelledby="confirm-title">
        <DialogTitle id="confirm-title">Delete this template?</DialogTitle>
        <DialogDescription>Documents already sent are not affected.</DialogDescription>
        <DialogFooter>
          <Button variant="secondary">Cancel</Button>
          <Button variant="danger">Delete</Button>
        </DialogFooter>
      </DialogCard>
    </DialogBackdrop>
  ),
};

export const Sectioned: Story = {
  render: () => (
    <DialogBackdrop>
      <DialogSectionedCard role="dialog" aria-modal="true" aria-labelledby="sec-title">
        <DialogHead>
          <DialogTitle id="sec-title">Send settings</DialogTitle>
        </DialogHead>
        <DialogBody>Reminders, expiry and signing order live here.</DialogBody>
        <DialogFoot>
          <Button variant="secondary">Cancel</Button>
          <Button>Save</Button>
        </DialogFoot>
      </DialogSectionedCard>
    </DialogBackdrop>
  ),
};
