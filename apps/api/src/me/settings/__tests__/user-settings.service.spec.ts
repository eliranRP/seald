import { DEFAULT_USER_SETTINGS, type UserSettings } from 'shared';
import { UserSettingsRepository } from '../user-settings.repository';
import { UserSettingsService } from '../user-settings.service';

class FakeRepo extends UserSettingsRepository {
  saved: UserSettings | null = null;
  async find(): Promise<UserSettings | null> {
    return this.saved;
  }
  async save(_userId: string, settings: UserSettings): Promise<void> {
    this.saved = settings;
  }
}

describe('UserSettingsService', () => {
  it('reads the defaults when nothing was saved', async () => {
    const svc = new UserSettingsService(new FakeRepo());
    await expect(svc.get('u')).resolves.toEqual(DEFAULT_USER_SETTINGS);
  });

  it('merges a partial patch onto the defaults and saves the whole row', async () => {
    const repo = new FakeRepo();
    const svc = new UserSettingsService(repo);
    const out = await svc.patch('u', { notify: { daily_summary: true }, reminder_default: 'off' });
    expect(out.notify).toEqual({ signed: true, daily_summary: true });
    expect(out.reminder_default).toBe('off');
    expect(out.expiry_default_days).toBe(30);
    expect(repo.saved).toEqual(out);
  });

  it('trims names and stores a blank as null', async () => {
    const svc = new UserSettingsService(new FakeRepo());
    expect((await svc.patch('u', { display_name: '  Ada  ' })).display_name).toBe('Ada');
    expect((await svc.patch('u', { display_name: '   ' })).display_name).toBeNull();
  });

  it('drops the image when the signature goes back to typed', async () => {
    const svc = new UserSettingsService(new FakeRepo());
    const image = 'data:image/png;base64,AAAA';
    const drawn = await svc.patch('u', { signature: { type: 'drawn', image } });
    expect(drawn.signature.image).toBe(image);
    const typed = await svc.patch('u', { signature: { type: 'typed', typed_text: 'Ada' } });
    expect(typed.signature).toEqual({ type: 'typed', typed_text: 'Ada', image: null });
  });
});
