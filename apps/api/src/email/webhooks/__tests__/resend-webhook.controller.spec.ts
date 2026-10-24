import { createHmac } from 'node:crypto';
import {
  BadRequestException,
  ServiceUnavailableException,
  UnauthorizedException,
  type RawBodyRequest,
} from '@nestjs/common';
import type { Request } from 'express';
import type { AppEnv } from '../../../config/env.schema';
import { ResendWebhookController } from '../resend-webhook.controller';
import type { ResendWebhookService } from '../resend-webhook.service';

const KEY = Buffer.from('controller-test-signing-key');
const SECRET = `whsec_${KEY.toString('base64')}`;
const BODY = JSON.stringify({ type: 'email.bounced', data: { email_id: 'prv_1' } });

function request(raw: string | undefined): RawBodyRequest<Request> {
  return { rawBody: raw === undefined ? undefined : Buffer.from(raw) } as RawBodyRequest<Request>;
}

function headers(body: string, tsOffset = 0): [string, string, string] {
  const ts = Math.floor(Date.now() / 1000) + tsOffset;
  const sig = createHmac('sha256', KEY).update(`msg_1.${ts}.${body}`).digest('base64');
  return ['msg_1', String(ts), `v1,${sig}`];
}

describe('ResendWebhookController', () => {
  const handle = jest.fn();
  const service = { handle } as unknown as ResendWebhookService;

  function controller(secret: string | undefined): ResendWebhookController {
    return new ResendWebhookController(service, { RESEND_WEBHOOK_SECRET: secret } as AppEnv);
  }

  beforeEach(() => {
    handle.mockReset().mockResolvedValue('bounce_recorded');
  });

  it('passes a signed delivery to the service', async () => {
    const out = await controller(SECRET).resend(request(BODY), ...headers(BODY));
    expect(out).toEqual({ ok: true, outcome: 'bounce_recorded' });
    expect(handle).toHaveBeenCalledWith({ type: 'email.bounced', data: { email_id: 'prv_1' } });
  });

  it('answers 503 and does nothing while no secret is configured', async () => {
    await expect(controller(undefined).resend(request(BODY), ...headers(BODY))).rejects.toThrow(
      ServiceUnavailableException,
    );
    expect(handle).not.toHaveBeenCalled();
  });

  it('rejects a bad signature, a stale timestamp and a tampered body with 401', async () => {
    const c = controller(SECRET);
    await expect(c.resend(request(BODY), 'msg_1', headers(BODY)[1], 'v1,AAAA')).rejects.toThrow(
      UnauthorizedException,
    );
    await expect(c.resend(request(BODY), ...headers(BODY, -3600))).rejects.toThrow(
      UnauthorizedException,
    );
    await expect(c.resend(request(`${BODY} `), ...headers(BODY))).rejects.toThrow(
      UnauthorizedException,
    );
    await expect(c.resend(request(BODY), undefined, undefined, undefined)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(handle).not.toHaveBeenCalled();
  });

  it('needs the raw body', async () => {
    await expect(controller(SECRET).resend(request(undefined), ...headers(BODY))).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rejects a signed body that is not a JSON object', async () => {
    for (const body of ['not json', '"text"', 'null']) {
      await expect(controller(SECRET).resend(request(body), ...headers(body))).rejects.toThrow(
        BadRequestException,
      );
    }
    expect(handle).not.toHaveBeenCalled();
  });
});
