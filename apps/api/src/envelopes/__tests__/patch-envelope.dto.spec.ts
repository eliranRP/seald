import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PatchEnvelopeDto } from '../dto/patch-envelope.dto';

type Host = { __SEALD_FEATURE_OVERRIDES__?: Record<string, boolean> };

function setFlag(on: boolean): void {
  (globalThis as unknown as Host).__SEALD_FEATURE_OVERRIDES__ = { customReminders: on };
}

async function errorsFor(body: Record<string, unknown>): Promise<string[]> {
  const dto = plainToInstance(PatchEnvelopeDto, body);
  const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
  return errors.map((e) => e.property);
}

describe('PatchEnvelopeDto reminder cadence and expiry (WP-09)', () => {
  afterEach(() => {
    delete (globalThis as unknown as Host).__SEALD_FEATURE_OVERRIDES__;
  });

  describe('with customReminders on', () => {
    beforeEach(() => setFlag(true));

    it('accepts in-range cadence values', async () => {
      expect(
        await errorsFor({
          reminder_first_after_days: 3,
          reminder_interval_days: 2,
          reminder_max: 7,
        }),
      ).toEqual([]);
    });

    it.each([
      ['reminder_first_after_days', 0],
      ['reminder_first_after_days', 31],
      ['reminder_interval_days', 0],
      ['reminder_interval_days', 31],
      ['reminder_max', 0],
      ['reminder_max', 8],
      ['reminder_max', 2.5],
    ])('rejects %s = %p', async (field, value) => {
      expect(await errorsFor({ [field]: value })).toEqual([field]);
    });

    it('accepts an expiry between one day and 90 days from now', async () => {
      const in30 = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      expect(await errorsFor({ expires_at: in30 })).toEqual([]);
    });

    it('rejects an expiry in the past or further than 90 days out', async () => {
      const past = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const far = new Date(Date.now() + 200 * 24 * 60 * 60 * 1000).toISOString();
      expect(await errorsFor({ expires_at: past })).toEqual(['expires_at']);
      expect(await errorsFor({ expires_at: far })).toEqual(['expires_at']);
    });
  });

  describe('with customReminders off', () => {
    beforeEach(() => setFlag(false));

    it('does not validate cadence values (the service rejects the keys)', async () => {
      expect(
        await errorsFor({
          reminder_first_after_days: 999,
          reminder_interval_days: 0,
          reminder_max: 50,
        }),
      ).toEqual([]);
    });

    it('keeps the pre-existing expires_at contract with no range check', async () => {
      const far = new Date(Date.now() + 400 * 24 * 60 * 60 * 1000).toISOString();
      expect(await errorsFor({ expires_at: far })).toEqual([]);
    });
  });
});
