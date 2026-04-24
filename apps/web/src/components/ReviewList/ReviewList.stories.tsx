import type { Meta, StoryObj } from '@storybook/react';
import { SignatureMark } from '../SignatureMark';
import { ReviewList } from './ReviewList';
import type { ReviewItem } from './ReviewList.types';

const meta: Meta<typeof ReviewList> = {
  title: 'L2/ReviewList',
  component: ReviewList,
  tags: ['autodocs', 'layer-2'],
};
export default meta;
type Story = StoryObj<typeof ReviewList>;

const defaultItems: ReadonlyArray<ReviewItem> = [
  {
    id: '1',
    kind: 'signature',
    label: 'Your signature',
    page: 1,
    valuePreview: <SignatureMark name="Maya Raskin" size={22} />,
  },
  { id: '2', kind: 'initials', label: 'Initials', page: 2, valuePreview: 'MR' },
  { id: '3', kind: 'date', label: 'Date signed', page: 2, valuePreview: '2026-04-24' },
  { id: '4', kind: 'text', label: 'Property address', page: 3, valuePreview: '1 Rothschild Blvd' },
  { id: '5', kind: 'checkbox', label: 'Agree to terms', page: 3, valuePreview: 'Checked' },
  { id: '6', kind: 'email', label: 'Contact email', page: 4, valuePreview: 'maya@example.com' },
  { id: '7', kind: 'name', label: 'Printed name', page: 4, valuePreview: 'Maya Raskin' },
];

export const Default: Story = {
  args: { items: defaultItems },
};

export const Empty: Story = {
  args: { items: [] },
};
