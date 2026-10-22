import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildStoredZip, crc32 } from '../zip-store';

describe('zip-store', () => {
  it('computes the standard CRC-32 check value', () => {
    expect(crc32(Buffer.from('123456789'))).toBe(0xcbf43926);
    expect(crc32(Buffer.alloc(0))).toBe(0);
  });

  it('writes a STORE archive with the entries in order and their bytes intact', () => {
    const a = Buffer.from('%PDF-1.7 first');
    const b = Buffer.from('second ü');
    const zip = buildStoredZip(
      [
        { name: '01 Contract.pdf', data: a },
        { name: 'audit-trail.pdf', data: b },
      ],
      new Date('2026-01-02T03:04:06Z'),
    );
    expect(zip.readUInt32LE(0)).toBe(0x04034b50);
    // End of central directory: 2 entries.
    const eocd = zip.subarray(zip.length - 22);
    expect(eocd.readUInt32LE(0)).toBe(0x06054b50);
    expect(eocd.readUInt16LE(10)).toBe(2);
    // Local header 1: name then raw bytes (STORE).
    const nameLen = zip.readUInt16LE(26);
    expect(zip.subarray(30, 30 + nameLen).toString('utf8')).toBe('01 Contract.pdf');
    expect(zip.subarray(30 + nameLen, 30 + nameLen + a.length).equals(a)).toBe(true);
    expect(zip.readUInt32LE(14)).toBe(crc32(a));
  });

  it('is accepted by unzip when it is installed', () => {
    const probe = spawnSync('unzip', ['-v'], { encoding: 'utf8' });
    if (probe.status !== 0) return;
    const dir = mkdtempSync(join(tmpdir(), 'zip-store-'));
    try {
      const file = join(dir, 'x.zip');
      writeFileSync(
        file,
        buildStoredZip(
          [
            { name: 'a.pdf', data: Buffer.from('aaa') },
            { name: 'b.pdf', data: Buffer.alloc(70_000, 7) },
          ],
          new Date('2026-05-06T07:08:09Z'),
        ),
      );
      expect(spawnSync('unzip', ['-tq', file]).status).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('is deterministic for the same inputs', () => {
    const entries = [{ name: 'a.pdf', data: Buffer.from('x') }];
    const at = new Date('2026-01-01T00:00:00Z');
    expect(buildStoredZip(entries, at).equals(buildStoredZip(entries, at))).toBe(true);
  });
});
