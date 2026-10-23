import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderSigningRoute } from '../../test/renderSigningRoute';
import {
  MOCK_ENVELOPE_ID,
  MOCK_SIGNER_ID,
  createSigningApiMock,
  makeSignMeResponse,
} from '../../test/signingApiMock';

vi.mock('../../lib/api/signApiClient', () => createSigningApiMock());
vi.mock('pdfjs-dist', () => ({
  getDocument: () => ({
    promise: Promise.reject(new Error('jsdom-stub')),
    destroy: () => Promise.resolve(),
  }),
  GlobalWorkerOptions: { workerSrc: '' },
}));

import { signApiClient } from '../../lib/api/signApiClient';
import { SigningFillPage } from './SigningFillPage';

const get = signApiClient.get as unknown as ReturnType<typeof vi.fn>;
const post = signApiClient.post as unknown as ReturnType<typeof vi.fn>;

type FlagHost = { __SEALD_FEATURE_OVERRIDES__?: Record<string, boolean> };

function ok<T>(data: T) {
  return { data, status: 200, statusText: 'OK', headers: {}, config: {} };
}

function field(id: string, kind: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    signer_id: MOCK_SIGNER_ID,
    kind,
    page: 1,
    x: 60,
    y: 100,
    required: true,
    value_text: null,
    filled_at: null,
    ...extra,
  };
}

function load(
  fields: ReadonlyArray<Record<string, unknown>>,
  envelope: Record<string, unknown> = {},
) {
  const base = makeSignMeResponse();
  get.mockResolvedValue(
    ok({
      ...base,
      envelope: { ...base.envelope, ...envelope },
      signer: { ...base.signer, tc_accepted_at: '2026-04-24T00:00:00Z' },
      fields,
    }),
  );
}

function renderFill() {
  return renderSigningRoute(<SigningFillPage />, {
    initialEntry: `/sign/${MOCK_ENVELOPE_ID}/fill`,
    path: '/sign/:envelopeId/fill',
  });
}

beforeEach(() => {
  get.mockReset();
  post.mockReset();
  (globalThis as unknown as FlagHost).__SEALD_FEATURE_OVERRIDES__ = { fieldMetaV2: true };
});
afterEach(() => {
  delete (globalThis as unknown as FlagHost).__SEALD_FEATURE_OVERRIDES__;
});

describe('SigningFillPage with fieldMetaV2', () => {
  it('uses the sender label and opens a numeric input that enforces the range', async () => {
    load([field('f-num', 'number', { meta: { label: 'Seats', min: 1, max: 10 } })]);
    post.mockResolvedValueOnce(ok(field('f-num', 'number', { value_text: '4' })));
    renderFill();

    await userEvent.click(await screen.findByRole('button', { name: 'Seats (required)' }));
    const input = await screen.findByRole('textbox', { name: 'Seats' });
    await userEvent.type(input, '40');
    await userEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter a number from 1 to 10.');
    expect(post).not.toHaveBeenCalled();

    await userEvent.clear(input);
    await userEvent.type(input, '4');
    await userEvent.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        '/sign/fields/f-num',
        { value_text: '4' },
        expect.any(Object),
      ),
    );
  });

  it('keeps the drawer open and maps the API 400 slug to an inline message', async () => {
    load([field('f-num', 'number', { meta: { label: 'Seats', max: 10 } })]);
    post.mockRejectedValueOnce(
      Object.assign(new Error('field_value_out_of_range'), { status: 400 }),
    );
    renderFill();

    await userEvent.click(await screen.findByRole('button', { name: 'Seats (required)' }));
    await userEvent.type(await screen.findByRole('textbox', { name: 'Seats' }), '5');
    await userEvent.click(screen.getByRole('button', { name: 'Apply' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Enter a number of at most 10.');
    expect(screen.getByRole('dialog', { name: 'Seats' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Seats' })).toHaveAttribute('aria-invalid', 'true');
  });

  it('prefills a name field from the signer name', async () => {
    load([field('f-name', 'name')]);
    renderFill();
    await userEvent.click(await screen.findByRole('button', { name: 'Print name (required)' }));
    expect(await screen.findByRole('textbox', { name: 'Print name' })).toHaveValue('Maya Raskin');
  });

  it('shows a radio group from the options', async () => {
    load([
      field('f-radio', 'radio', {
        meta: {
          label: 'Size',
          options: [
            { label: 'Small', value: 's' },
            { label: 'Large', value: 'l' },
          ],
        },
      }),
    ]);
    post.mockResolvedValueOnce(ok(field('f-radio', 'radio', { value_text: 'l' })));
    renderFill();
    await userEvent.click(await screen.findByRole('button', { name: 'Size (required)' }));
    expect(await screen.findByRole('radiogroup', { name: 'Size' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: 'Large' }));
    await userEvent.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        '/sign/fields/f-radio',
        { value_text: 'l' },
        expect.any(Object),
      ),
    );
  });

  it('fills a read-only field with its default and does not open an input', async () => {
    const meta = { label: 'Company', read_only: true, default: 'Acme Ltd' };
    load([field('f-ro', 'text', { meta })]);
    post.mockResolvedValue(ok(field('f-ro', 'text', { meta, value_text: 'Acme Ltd' })));
    renderFill();

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        '/sign/fields/f-ro',
        { value_text: 'Acme Ltd' },
        expect.any(Object),
      ),
    );
    await userEvent.click(await screen.findByRole('button', { name: /Company \(read-only\)/ }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows a number in its format and a choice by its label once filled', async () => {
    load([
      field('f-num', 'number', {
        meta: { label: 'Fee', format: 'thousands_fixed2' },
        value_text: '1234.5',
      }),
      field('f-dd', 'dropdown', {
        meta: { label: 'Plan', options: [{ label: 'Pro plan', value: 'pro' }] },
        value_text: 'pro',
        y: 200,
      }),
    ]);
    renderFill();
    expect(await screen.findByText('1,234.50')).toBeInTheDocument();
    expect(screen.getByText('Pro plan')).toBeInTheDocument();
  });

  it('keeps the legacy text drawer when the flag is off', async () => {
    (globalThis as unknown as FlagHost).__SEALD_FEATURE_OVERRIDES__ = { fieldMetaV2: false };
    load([field('f-text', 'text', { meta: { label: 'Ignored' } })]);
    renderFill();
    await userEvent.click(await screen.findByRole('button', { name: 'Ignored (required)' }));
    // Legacy drawer: no hint line, no inline server error slot.
    expect(await screen.findByRole('textbox', { name: 'Ignored' })).toBeInTheDocument();
  });
});
