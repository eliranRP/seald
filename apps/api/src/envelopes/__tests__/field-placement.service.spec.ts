import { normalizeFieldPlacements } from '../field-placement.service';

describe('normalizeFieldPlacements', () => {
  it('fills omitted width, height, required, and link id', () => {
    expect(
      normalizeFieldPlacements([
        { signer_id: 'signer-1', kind: 'signature', page: 1, x: 0.1, y: 0.2 },
      ]),
    ).toEqual([
      {
        signer_id: 'signer-1',
        kind: 'signature',
        page: 1,
        x: 0.1,
        y: 0.2,
        width: null,
        height: null,
        required: true,
        link_id: null,
      },
    ]);
  });

  it('preserves explicit width, height, required, and link id', () => {
    expect(
      normalizeFieldPlacements([
        {
          signer_id: 'signer-1',
          kind: 'initials',
          page: 2,
          x: 0.1,
          y: 0.2,
          width: 0.3,
          height: 0.05,
          required: false,
          link_id: 'fld-7',
        },
      ]),
    ).toEqual([
      {
        signer_id: 'signer-1',
        kind: 'initials',
        page: 2,
        x: 0.1,
        y: 0.2,
        width: 0.3,
        height: 0.05,
        required: false,
        link_id: 'fld-7',
      },
    ]);
  });
});
