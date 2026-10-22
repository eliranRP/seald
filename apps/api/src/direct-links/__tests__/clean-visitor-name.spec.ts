import { cleanVisitorName } from '../direct-links.service';

describe('cleanVisitorName', () => {
  it('collapses whitespace and trims', () => {
    expect(cleanVisitorName('  Ada   \t Lovelace ')).toBe('Ada Lovelace');
  });

  it('removes control characters and angle brackets (the name goes into emails)', () => {
    expect(cleanVisitorName('Ada\u0000 <script>Lovelace</script>\u007f')).toBe(
      'Ada scriptLovelace/script',
    );
    expect(cleanVisitorName('<>')).toBe('');
  });

  it('keeps ordinary non-ASCII names', () => {
    expect(cleanVisitorName('Zoë Müller-Åberg')).toBe('Zoë Müller-Åberg');
    expect(cleanVisitorName('שרה כהן')).toBe('שרה כהן');
  });
});
