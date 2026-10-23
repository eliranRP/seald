import type { Meta, StoryObj } from '@storybook/react-vite';
import { userEvent, within } from 'storybook/test';
import type { AccessCodeSendResponse } from 'shared';
import { chromaticViewportModes } from '@/stories/chromaticViewports';
import { AccessCodeForm } from './AccessCodeForm';

const SENT: AccessCodeSendResponse = {
  status: 'sent',
  purpose: 'access',
  email_masked: 'j***@example.com',
  expires_in_seconds: 600,
  resend_after_seconds: 60,
};

const apiError = (status: number, code: string) => Object.assign(new Error(code), { status, code });

const meta: Meta<typeof AccessCodeForm> = {
  title: 'L3/AccessCodeForm',
  component: AccessCodeForm,
  tags: ['autodocs', 'layer-3'],
  parameters: { layout: 'centered', chromatic: { modes: chromaticViewportModes } },
  decorators: [
    (Story) => (
      <div style={{ width: 360 }}>
        <Story />
      </div>
    ),
  ],
  args: {
    purpose: 'access',
    emailMasked: 'j***@example.com',
    submitLabel: 'Continue',
    sendCode: () => Promise.resolve(SENT),
    onSubmitCode: () => Promise.resolve(),
  },
};
export default meta;
type Story = StoryObj<typeof AccessCodeForm>;

export const BeforeSending: Story = {};

export const CodeSent: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(await within(canvasElement).findByRole('button', { name: 'Send code' }));
  },
};

export const WrongCode: Story = {
  args: { onSubmitCode: () => Promise.reject(apiError(422, 'access_code_invalid')) },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.click(await c.findByRole('button', { name: 'Send code' }));
    await userEvent.type(await c.findByRole('textbox', { name: /one-time code/i }), '000000');
    await userEvent.click(c.getByRole('button', { name: 'Continue' }));
  },
};

export const LockedOut: Story = {
  args: { onSubmitCode: () => Promise.reject(apiError(423, 'access_code_locked')) },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.click(await c.findByRole('button', { name: 'Send code' }));
    await userEvent.type(await c.findByRole('textbox', { name: /one-time code/i }), '000000');
    await userEvent.click(c.getByRole('button', { name: 'Continue' }));
  },
};

export const SendCooldown: Story = {
  args: {
    sendCode: () =>
      Promise.reject(
        Object.assign(apiError(429, 'access_code_cooldown'), { retryAfterSeconds: 45 }),
      ),
  },
  play: async ({ canvasElement }) => {
    await userEvent.click(await within(canvasElement).findByRole('button', { name: 'Send code' }));
  },
};

export const BeforeSigning: Story = {
  args: { purpose: 'action', submitLabel: 'Sign and submit' },
};
