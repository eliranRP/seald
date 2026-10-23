import { Inject, Injectable } from '@nestjs/common';
import { sql, type Kysely } from 'kysely';
import type { ExpiryDefaultDays, UserSettings } from 'shared';
import type { Database } from '../../../db/schema';
import { DB_TOKEN } from '../../db/db.provider';
import { UserSettingsRepository } from './user-settings.repository';

@Injectable()
export class UserSettingsPgRepository extends UserSettingsRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Kysely<Database>) {
    super();
  }

  async find(userId: string): Promise<UserSettings | null> {
    const row = await this.db
      .selectFrom('user_settings')
      .selectAll()
      .where('user_id', '=', userId)
      .executeTakeFirst();
    if (!row) return null;
    return {
      display_name: row.display_name,
      signature: {
        type: row.signature_type,
        typed_text: row.signature_text,
        image: row.signature_image,
      },
      initials: row.initials,
      notify: { signed: row.notify_signed, daily_summary: row.notify_daily_summary },
      reminder_default: row.reminder_default,
      expiry_default_days: row.expiry_default_days as ExpiryDefaultDays,
    };
  }

  async save(userId: string, s: UserSettings): Promise<void> {
    const values = {
      display_name: s.display_name,
      signature_type: s.signature.type,
      signature_text: s.signature.typed_text,
      signature_image: s.signature.image,
      initials: s.initials,
      notify_signed: s.notify.signed,
      notify_daily_summary: s.notify.daily_summary,
      reminder_default: s.reminder_default,
      expiry_default_days: s.expiry_default_days,
    };
    await this.db
      .insertInto('user_settings')
      .values({ user_id: userId, ...values })
      .onConflict((oc) =>
        oc.column('user_id').doUpdateSet({ ...values, updated_at: sql<string>`now()` }),
      )
      .execute();
  }
}
