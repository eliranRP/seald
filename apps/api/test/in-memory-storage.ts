import { StorageService } from '../src/storage/storage.service';

/**
 * In-memory StorageService used by the envelopes e2e. Tracks uploaded bytes
 * per path; enables assertions on what the controller wrote.
 */
export class InMemoryStorageService extends StorageService {
  private readonly objects = new Map<string, { bytes: Buffer; contentType: string }>();

  reset(): void {
    this.objects.clear();
  }

  async upload(path: string, body: Buffer, contentType: string): Promise<void> {
    this.objects.set(path, { bytes: Buffer.from(body), contentType });
  }

  async download(path: string): Promise<Buffer> {
    const obj = this.objects.get(path);
    if (!obj) throw new Error(`in_memory_storage_not_found:${path}`);
    return obj.bytes;
  }

  async remove(paths: string[]): Promise<void> {
    for (const p of paths) this.objects.delete(p);
  }

  async createSignedUrl(path: string, _expiresInSeconds: number): Promise<string> {
    return `https://test.invalid/${encodeURIComponent(path)}?token=test`;
  }

  async exists(path: string): Promise<boolean> {
    return this.objects.has(path);
  }

  // Test-only helpers
  allPaths(): string[] {
    return [...this.objects.keys()];
  }

  get(path: string): { bytes: Buffer; contentType: string } | undefined {
    return this.objects.get(path);
  }
}
