import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { renderWithTheme } from '@/test/renderWithTheme';
import { EmailChipsInput } from './EmailChipsInput';
import type { EmailChipsValue } from './EmailChipsInput.types';

const EXISTING: ReadonlySet<string> = new Set(['alex@quill.vc']);

function Harness({ initial }: { readonly initial?: EmailChipsValue }) {
  const [value, setValue] = useState<EmailChipsValue>(initial ?? { tokens: [], draft: '' });
  return (
    <>
      <EmailChipsInput value={value} onChange={setValue} existingEmails={EXISTING} />
      <output aria-label="state">{JSON.stringify(value)}</output>
    </>
  );
}

const state = (el: HTMLElement): EmailChipsValue =>
  JSON.parse(el.textContent ?? '{}') as EmailChipsValue;

describe('EmailChipsInput', () => {
  it('commits a typed address on Enter and on comma', async () => {
    const user = userEvent.setup();
    const { getByRole, getByLabelText } = renderWithTheme(<Harness />);
    const field = getByRole('textbox', { name: 'Emails' });
    await user.type(field, 'nora@acme.co{Enter}');
    await user.type(field, 'tom@acme.co,');
    expect(state(getByLabelText('state')).tokens).toEqual(['nora@acme.co', 'tom@acme.co']);
    expect(state(getByLabelText('state')).draft).toBe('');
  });

  it('splits a pasted list on commas, spaces and newlines', async () => {
    const user = userEvent.setup();
    const { getByRole, getByLabelText } = renderWithTheme(<Harness />);
    await user.click(getByRole('textbox', { name: 'Emails' }));
    await user.paste('Nora@acme.co, tom@acme.co\nkate@acme.co; bad@@acme');
    expect(state(getByLabelText('state')).tokens).toEqual([
      'nora@acme.co',
      'tom@acme.co',
      'kate@acme.co',
      'bad@@acme',
    ]);
  });

  it('marks duplicates (saved or repeated) and invalid addresses', () => {
    const { getByText } = renderWithTheme(
      <Harness
        initial={{
          tokens: ['nora@acme.co', 'nora@acme.co', 'alex@quill.vc', 'bad@@acme'],
          draft: '',
        }}
      />,
    );
    const chips = [...document.querySelectorAll('span[title]')].map((c) => c.getAttribute('title'));
    expect(chips).toEqual(['Already in this list', 'Already a contact', 'Not an email address']);
    expect(getByText('nora@acme.co', { selector: 'span:not([title])' })).toBeInTheDocument();
  });

  it('removes a chip with its x button', async () => {
    const user = userEvent.setup();
    const { getByRole, getByLabelText } = renderWithTheme(
      <Harness initial={{ tokens: ['a@b.co', 'c@d.co'], draft: '' }} />,
    );
    await user.click(getByRole('button', { name: 'Remove a@b.co' }));
    expect(state(getByLabelText('state')).tokens).toEqual(['c@d.co']);
  });

  it('Backspace in the empty field removes the last chip, but not while typing', async () => {
    const user = userEvent.setup();
    const { getByRole, getByLabelText } = renderWithTheme(
      <Harness initial={{ tokens: ['a@b.co', 'c@d.co'], draft: '' }} />,
    );
    const field = getByRole('textbox', { name: 'Emails' });
    await user.click(field);
    await user.keyboard('{Backspace}');
    expect(state(getByLabelText('state')).tokens).toEqual(['a@b.co']);
    await user.type(field, 'x{Backspace}');
    expect(state(getByLabelText('state')).tokens).toEqual(['a@b.co']);
  });

  it('commits the draft when the field loses focus', () => {
    const { getByRole, getByLabelText } = renderWithTheme(<Harness />);
    const field = getByRole('textbox', { name: 'Emails' });
    fireEvent.change(field, { target: { value: 'nora@acme.co' } });
    fireEvent.blur(field);
    expect(state(getByLabelText('state')).tokens).toEqual(['nora@acme.co']);
  });

  it('has no axe violations', async () => {
    const { container } = renderWithTheme(
      <Harness initial={{ tokens: ['a@b.co', 'bad'], draft: '' }} />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
