import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderSigningRoute } from '../../../test/renderSigningRoute';
import { MOCK_ENVELOPE_ID, createSigningApiMock } from '../../../test/signingApiMock';

vi.mock('../../../lib/api/signApiClient', () => createSigningApiMock());

import { signApiClient } from '../../../lib/api/signApiClient';
import { RequireSignerSession } from '../RequireSignerSession';

const get = signApiClient.get as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  get.mockReset();
});

describe('RequireSignerSession (signing order)', () => {
  it('shows the friendly not-your-turn page for a 409 not_your_turn from /sign/me', async () => {
    get.mockRejectedValue(Object.assign(new Error('not_your_turn'), { status: 409 }));
    renderSigningRoute(<RequireSignerSession />, {
      initialEntry: `/sign/${MOCK_ENVELOPE_ID}/fill`,
      path: '/sign/:envelopeId/fill',
    });
    expect(
      await screen.findByRole('heading', { name: /not your turn to sign yet/i }, { timeout: 4000 }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Check again' })).toBeInTheDocument();
  });
});
