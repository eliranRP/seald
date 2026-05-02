import { Readable } from 'node:stream';
import type { Response } from 'express';
import { buildContentDisposition, MeController } from './me.controller';
import type { MeService } from './me.service';
import type { AuthUser } from '../auth/auth-user';
import { DeleteAccountDto } from './dto/delete-account.dto';

/**
 * Issue #44 — Content-Disposition header injection coverage.
 * The controller uses `buildContentDisposition` to defend against any
 * future regression in the JWT `sub` validator letting CR/LF or quotes
 * into the filename. Behavior under test (NOT implementation):
 *
 *   - emits BOTH the ASCII `filename=` quoted fallback AND the RFC 5987
 *     `filename*=UTF-8''<percent-encoded>` extension
 *   - escapes backslash + double-quote in the ASCII fallback
 *   - strips non-ASCII from the ASCII fallback
 *   - never lets `;`, `\r`, `\n`, `"` escape the header value
 *
 * Plus: the controller passes the user identity through to the service
 * stream and pipes into the response.
 */
describe('buildContentDisposition', () => {
  it('emits both an ASCII filename and an RFC 5987 filename* extension', () => {
    const cd = buildContentDisposition('seald-export-abc.json');
    expect(cd).toMatch(/^attachment; filename="seald-export-abc\.json";/);
    expect(cd).toMatch(/filename\*=UTF-8''seald-export-abc\.json$/);
  });

  it('escapes backslash and double-quote in the ASCII fallback', () => {
    const cd = buildContentDisposition('weird"name\\here.json');
    // Inside the quoted ASCII parameter, `"` and `\` get prefixed with `\`.
    expect(cd).toContain('filename="weird\\"name\\\\here.json"');
    // The `filename*` percent-encodes them.
    expect(cd).toContain("filename*=UTF-8''");
    expect(cd).toMatch(/filename\*=UTF-8''weird%22name%5Chere\.json$/);
  });

  it('strips non-ASCII bytes from the ASCII fallback (replaced with _)', () => {
    const cd = buildContentDisposition('seald-énglish-ünicode.json');
    // ASCII fallback has the non-ASCII chars replaced with `_`. The
    // RFC 5987 extension keeps them as percent-encoded UTF-8.
    expect(cd).toMatch(/filename="seald-_nglish-_nicode\.json"/);
    expect(cd).toContain("filename*=UTF-8''");
    expect(cd).toContain('%C3%A9'); // 'é'
    expect(cd).toContain('%C3%BC'); // 'ü'
  });

  it('blocks header injection: CR / LF cannot escape the header value', () => {
    // The injection vector is "filename"; X-Inject: evil\r\n which would
    // smuggle a header in. The ASCII strip removes CR/LF (turning them
    // into `_`), and the RFC 5987 extension percent-encodes them.
    const cd = buildContentDisposition('a.json"; X-Inject: evil\r\nFoo: bar');
    // No raw CR or LF survives anywhere — that's the smuggling vector.
    expect(cd).not.toMatch(/\r/);
    expect(cd).not.toMatch(/\n/);
    // The double-quote in the injected value is escaped in the ASCII
    // fallback (with a leading backslash so it doesn't terminate the
    // quoted string) and percent-encoded in the RFC 5987 extension.
    expect(cd).toContain('\\"');
    expect(cd).toContain('%22');
    // The RFC 5987 percent-encoded form must contain CRLF as %0D%0A so
    // a downstream parser sees them as part of the filename, not a
    // header separator.
    expect(cd).toContain('%0D%0A');
  });
});

describe('MeController', () => {
  const user: AuthUser = {
    id: '11111111-1111-1111-1111-111111111111',
    email: 'maya@example.com',
    provider: 'email',
  };

  function makeRes(): Response & {
    headers: Record<string, string>;
    pipedFrom: Readable | null;
    destroyed: Error | null;
  } {
    const headers: Record<string, string> = {};
    const pipedFrom: Readable | null = null;
    let destroyed: Error | null = null;
    const res = {
      headers,
      pipedFrom,
      destroyed,
      setHeader(k: string, v: string) {
        headers[k.toLowerCase()] = v;
      },
      destroy(err?: Error) {
        destroyed = err ?? new Error('destroyed');
        (res as unknown as { destroyed: Error | null }).destroyed = destroyed;
      },
    } as unknown as Response & {
      headers: Record<string, string>;
      pipedFrom: Readable | null;
      destroyed: Error | null;
    };
    return res;
  }

  it('exportAll: sets the three required headers and pipes the service stream', async () => {
    // Service yields a tiny payload; we use a real Readable so the
    // controller's `pipe()` and error-handler attach correctly.
    const stream = Readable.from(['{"meta":{}}']);
    const svc = {
      exportAllStream: jest.fn(async () => stream),
    } as unknown as MeService;
    const controller = new MeController(svc);
    const res = makeRes();
    let pipeTarget: unknown = null;
    (stream as unknown as { pipe: (t: unknown) => void }).pipe = (t) => {
      pipeTarget = t;
    };

    await controller.exportAll(user, res);

    expect(svc.exportAllStream).toHaveBeenCalledWith(user);
    expect(res.headers['content-type']).toBe('application/json; charset=utf-8');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['content-disposition']).toMatch(/filename="seald-export-/);
    expect(res.headers['content-disposition']).toContain(user.id);
    expect(pipeTarget).toBe(res);
  });

  it('exportAll: a stream-level error destroys the response with the error', async () => {
    const stream = new Readable({ read() {} });
    const svc = {
      exportAllStream: jest.fn(async () => stream),
    } as unknown as MeService;
    const controller = new MeController(svc);
    const res = makeRes();
    (stream as unknown as { pipe: (t: unknown) => void }).pipe = () => {};

    await controller.exportAll(user, res);
    const boom = new Error('storage_blip');
    stream.emit('error', boom);

    expect(res.destroyed).toBe(boom);
  });

  it('deleteAccount: forwards user identity to MeService.deleteAccount, ignores DTO', async () => {
    const svc = { deleteAccount: jest.fn(async () => undefined) } as unknown as MeService;
    const controller = new MeController(svc);
    const dto: DeleteAccountDto = { confirm: 'DELETE_MY_ACCOUNT' };
    await controller.deleteAccount(user, dto);
    expect(svc.deleteAccount).toHaveBeenCalledWith(user);
    // Discarded — only the user identity flows through.
    expect(svc.deleteAccount).toHaveBeenCalledTimes(1);
  });
});
