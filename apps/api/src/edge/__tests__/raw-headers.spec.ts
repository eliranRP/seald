import { normalizeRawHeaders } from '../raw-headers';

describe('normalizeRawHeaders (Edge Functions)', () => {
  it('leaves a Node array untouched', () => {
    const raw = ['Content-Type', 'application/json'];
    const req = { rawHeaders: raw, headers: { 'content-type': 'application/json' } };
    normalizeRawHeaders(req);
    expect(req.rawHeaders).toBe(raw);
  });

  it('rebuilds a flat list when rawHeaders is not an array', () => {
    const req: { rawHeaders: unknown; headers: Record<string, string | string[] | undefined> } = {
      rawHeaders: new Map([['x', 'y']]),
      headers: {
        'content-type': 'application/json',
        'set-cookie': ['a=1', 'b=2'],
        skip: undefined,
      },
    };
    normalizeRawHeaders(req);
    expect(req.rawHeaders).toEqual([
      'content-type',
      'application/json',
      'set-cookie',
      'a=1',
      'set-cookie',
      'b=2',
    ]);
    expect((req.rawHeaders as string[]).slice(0, 2)).toEqual(['content-type', 'application/json']);
  });

  it('fills a getter-only rawHeaders', () => {
    const req = { headers: { accept: 'text/event-stream' } } as {
      rawHeaders?: unknown;
      headers: Record<string, string>;
    };
    Object.defineProperty(req, 'rawHeaders', { get: () => undefined, configurable: true });
    normalizeRawHeaders(req);
    expect(req.rawHeaders).toEqual(['accept', 'text/event-stream']);
  });
});
