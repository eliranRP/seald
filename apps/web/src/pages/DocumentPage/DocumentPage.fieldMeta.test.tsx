import { afterEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from 'styled-components';
import { DocumentPage } from './DocumentPage';
import type { PlacedFieldValue } from '../../components/PlacedField/PlacedField.types';
import { seald } from '../../styles/theme';

type FlagHost = { __SEALD_FEATURE_OVERRIDES__?: Record<string, boolean> };
const setFlag = (on: boolean): void => {
  (globalThis as unknown as FlagHost).__SEALD_FEATURE_OVERRIDES__ = { fieldMetaV2: on };
};
afterEach(() => {
  delete (globalThis as unknown as FlagHost).__SEALD_FEATURE_OVERRIDES__;
});

const SIGNERS = [{ id: 'a', name: 'Ada Byron', email: 'ada@analytical.co', color: '#F472B6' }];

function Harness({
  initial,
  onChange,
}: {
  readonly initial: ReadonlyArray<PlacedFieldValue>;
  readonly onChange?: (next: ReadonlyArray<PlacedFieldValue>) => void;
}) {
  const [fields, setFields] = useState(initial);
  return (
    <DocumentPage
      totalPages={2}
      signers={SIGNERS}
      onSend={() => undefined}
      fields={fields}
      onFieldsChange={(next) => {
        onChange?.(next);
        setFields(next);
      }}
    />
  );
}

function renderPage(
  initial: ReadonlyArray<PlacedFieldValue>,
  onChange?: (next: ReadonlyArray<PlacedFieldValue>) => void,
) {
  return render(
    <ThemeProvider theme={seald}>
      <Harness initial={initial} {...(onChange ? { onChange } : {})} />
    </ThemeProvider>,
  );
}

const NUMBER_FIELD: PlacedFieldValue = {
  id: 'n1',
  page: 1,
  type: 'number',
  x: 60,
  y: 100,
  signerIds: ['a'],
};

describe('DocumentPage field settings (WP-08)', () => {
  it('offers name, number, radio and dropdown in the palette while fieldMetaV2 is on', () => {
    setFlag(true);
    renderPage([]);
    const palette = screen.getByRole('region', { name: /field palette/i });
    for (const name of ['Name', 'Number', 'Radio', 'Dropdown']) {
      expect(within(palette).getByRole('button', { name })).toBeInTheDocument();
    }
  });

  it('keeps the legacy palette, and shows no settings panel, while the flag is off', () => {
    setFlag(false);
    renderPage([NUMBER_FIELD]);
    const palette = screen.getByRole('region', { name: /field palette/i });
    for (const name of ['Name', 'Number', 'Radio', 'Dropdown']) {
      expect(within(palette).queryByRole('button', { name })).not.toBeInTheDocument();
    }
    fireEvent.click(screen.getByRole('group', { name: /number field for/i }));
    expect(screen.queryByRole('region', { name: 'Field settings' })).not.toBeInTheDocument();
  });

  it('shows the settings panel for a selected field and writes meta back to the field', async () => {
    setFlag(true);
    const onChange = vi.fn();
    renderPage([NUMBER_FIELD], onChange);
    expect(screen.queryByRole('region', { name: 'Field settings' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('group', { name: /number field for/i }));
    const panel = screen.getByRole('region', { name: 'Field settings' });
    await userEvent.type(within(panel).getByRole('textbox', { name: 'Maximum' }), '10');

    const last = onChange.mock.calls.at(-1)?.[0] as ReadonlyArray<PlacedFieldValue>;
    expect(last[0]?.meta).toEqual({ max: 10 });
  });

  it('drops a radio field with two starter options so it is valid to send', () => {
    setFlag(true);
    const onChange = vi.fn();
    renderPage([], onChange);
    const row = screen.getByRole('button', { name: 'Radio' });
    const canvas = screen.getByRole('document', { name: /page 1 of 2/i });
    const dataTransfer = {
      setData: vi.fn(),
      getData: vi.fn().mockReturnValue('radio'),
      effectAllowed: '',
      dropEffect: '',
      files: [],
      items: [],
      types: ['text/plain'],
    };
    act(() => {
      fireEvent.dragStart(row, { dataTransfer });
      fireEvent.dragOver(canvas, { dataTransfer });
      fireEvent.drop(canvas, { dataTransfer, clientX: 200, clientY: 150 });
    });
    const placed = onChange.mock.calls.at(-1)?.[0] as ReadonlyArray<PlacedFieldValue>;
    expect(placed[0]?.type).toBe('radio');
    expect(placed[0]?.meta).toEqual({
      options: [
        { label: 'Option 1', value: 'option-1' },
        { label: 'Option 2', value: 'option-2' },
      ],
    });
  });
});
