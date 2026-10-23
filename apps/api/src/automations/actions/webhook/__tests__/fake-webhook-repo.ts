import type { SealedValue } from '../secret-box';
import type {
  StoredWebhookSecrets,
  WebhookEventRow,
  WebhookPgRepository,
} from '../webhook.repository.pg';

/** In-memory stand-in for `WebhookPgRepository` (unit tests only). */
export class FakeWebhookRepo {
  readonly rows = new Map<string, StoredWebhookSecrets>();
  event: WebhookEventRow | null = {
    eventCreatedAt: '2026-10-22T10:00:00.000Z',
    envelope: { id: 'env-1', title: 'Lease', status: 'completed', shortCode: 'AB12CD34EF56G' },
    signer: null,
  };

  async getSecrets(id: string): Promise<StoredWebhookSecrets | null> {
    return this.rows.get(id) ?? null;
  }

  async putSecrets(id: string, secret: SealedValue, url: SealedValue): Promise<void> {
    this.rows.set(id, { secret, url, previous: null, previousRetiredAt: null });
  }

  async replaceUrl(id: string, url: SealedValue): Promise<boolean> {
    const row = this.rows.get(id);
    if (!row) return false;
    this.rows.set(id, { ...row, url });
    return true;
  }

  async rotateSecret(id: string, next: SealedValue, retiredAt: Date): Promise<boolean> {
    const row = this.rows.get(id);
    if (!row) return false;
    this.rows.set(id, { ...row, previous: row.secret, previousRetiredAt: retiredAt, secret: next });
    return true;
  }

  async clearRetiredPrevious(now: Date): Promise<number> {
    let n = 0;
    for (const [id, row] of this.rows) {
      if (row.previousRetiredAt && row.previousRetiredAt.getTime() <= now.getTime()) {
        this.rows.set(id, { ...row, previous: null, previousRetiredAt: null });
        n += 1;
      }
    }
    return n;
  }

  async loadEvent(): Promise<WebhookEventRow | null> {
    return this.event;
  }

  asRepo(): WebhookPgRepository {
    return this as unknown as WebhookPgRepository;
  }
}
