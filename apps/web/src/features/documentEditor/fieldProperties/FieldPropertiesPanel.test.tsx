import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import type { PlacedFieldValue } from '@/components/PlacedField/PlacedField.types';
import { renderWithTheme } from '@/test/renderWithTheme';
import { FieldPropertiesPanel, type FieldPropertiesChange } from './FieldPropertiesPanel';

function field(patch: Partial<PlacedFieldValue>): PlacedFieldValue {
  return { id: 'f1', page: 1, type: 'text', x: 0, y: 0, signerIds: ['s1'], ...patch };
}

function Harness({
  initial,
  onChange,
}: {
  readonly initial: PlacedFieldValue;
  readonly onChange: (patch: FieldPropertiesChange) => void;
}) {
  const [f, setF] = useState(initial);
  return (
    <FieldPropertiesPanel
      key={f.id}
      field={f}
      onChange={(patch) => {
        onChange(patch);
        setF((prev) => ({
          ...prev,
          ...(patch.required !== undefined ? { required: patch.required } : {}),
          ...('meta' in patch ? { meta: patch.meta } : {}),
        }));
      }}
    />
  );
}

describe('FieldPropertiesPanel', () => {
  it('edits a text field: label, character limit and default reach onChange as API meta', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithTheme(<Harness initial={field({})} onChange={onChange} />);

    await user.type(screen.getByRole('textbox', { name: 'Label' }), 'Job');
    await user.type(screen.getByRole('spinbutton', { name: 'Character limit' }), '20');
    await user.type(screen.getByRole('textbox', { name: 'Default text' }), 'Eng');

    expect(onChange).toHaveBeenLastCalledWith({
      meta: { label: 'Job', char_limit: 20, default: 'Eng' },
    });
  });

  it('toggles required on the field itself', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithTheme(<Harness initial={field({})} onChange={onChange} />);
    const required = screen.getByRole('checkbox', { name: 'Required' });
    expect(required).toBeChecked();
    await user.click(required);
    expect(onChange).toHaveBeenCalledWith({ required: false });
  });

  it('holds back an invalid number range and says why, accessibly', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithTheme(<Harness initial={field({ type: 'number' })} onChange={onChange} />);

    await user.type(screen.getByRole('textbox', { name: 'Minimum' }), '9');
    expect(onChange).toHaveBeenLastCalledWith({ meta: { min: 9 } });
    onChange.mockClear();

    const max = screen.getByRole('textbox', { name: 'Maximum' });
    await user.type(max, '2');
    expect(onChange).not.toHaveBeenCalled();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Minimum can't be greater than maximum.",
    );
    expect(screen.getByRole('textbox', { name: 'Minimum' })).toHaveAttribute(
      'aria-invalid',
      'true',
    );
  });

  it('offers number formats', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithTheme(<Harness initial={field({ type: 'number' })} onChange={onChange} />);
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Number format' }),
      'thousands_fixed2',
    );
    expect(onChange).toHaveBeenLastCalledWith({ meta: { format: 'thousands_fixed2' } });
  });

  it('manages radio options: add, edit, unique values, default, remove', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const initial = field({
      type: 'radio',
      meta: {
        options: [
          { label: 'Yes', value: 'yes' },
          { label: 'No', value: 'no' },
        ],
      },
    });
    renderWithTheme(<Harness initial={initial} onChange={onChange} />);

    // Duplicate value is held back with an inline message.
    const secondValue = screen.getByRole('textbox', { name: 'Option 2 value' });
    await user.clear(secondValue);
    await user.type(secondValue, 'yes');
    expect(await screen.findByRole('alert')).toHaveTextContent('Values must be unique.');
    onChange.mockClear();

    await user.clear(secondValue);
    await user.type(secondValue, 'nope');
    expect(onChange).toHaveBeenLastCalledWith({
      meta: {
        options: [
          { label: 'Yes', value: 'yes' },
          { label: 'No', value: 'nope' },
        ],
      },
    });

    await user.selectOptions(screen.getByRole('combobox', { name: 'Default option' }), 'nope');
    expect(onChange).toHaveBeenLastCalledWith({
      meta: {
        options: [
          { label: 'Yes', value: 'yes' },
          { label: 'No', value: 'nope' },
        ],
        default: 'nope',
      },
    });

    await user.click(screen.getByRole('button', { name: 'Add option' }));
    expect(screen.getByRole('textbox', { name: 'Option 3 label' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Remove option 2' }));
    expect(screen.queryByRole('textbox', { name: 'Option 3 label' })).not.toBeInTheDocument();
  });

  it('read-only needs a default value', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithTheme(<Harness initial={field({})} onChange={onChange} />);
    await user.click(screen.getByRole('checkbox', { name: /read-only/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/needs a default value/i);
    await user.type(screen.getByRole('textbox', { name: 'Default text' }), 'Fixed');
    expect(onChange).toHaveBeenLastCalledWith({ meta: { read_only: true, default: 'Fixed' } });
  });

  it('has no axe violations', async () => {
    const { container } = renderWithTheme(
      <FieldPropertiesPanel
        field={field({
          type: 'dropdown',
          meta: { options: [{ label: 'A', value: 'a' }] },
        })}
        onChange={() => undefined}
      />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
