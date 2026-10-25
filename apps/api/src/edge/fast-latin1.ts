import { Buffer } from 'node:buffer';

/**
 * Supabase Edge Functions run on Deno, whose `node:buffer` decodes
 * `latin1` / `binary` about 100x slower than Node (5 MB: ~400 ms instead
 * of ~3 ms). The sealing pipeline makes that conversion several times per
 * document (archive timestamp, verify helpers, @signpdf, forge), which
 * pushed a 2 MB seal past the 2 s CPU limit and an 8.5 MB one past the
 * memory limit. This swaps in an exact decoder built on
 * `String.fromCharCode` (~30 ms for 5 MB on both runtimes) for those two
 * encodings only. Installed by the edge entry points, never by the Docker
 * API.
 */

const CHUNK = 0x2000;
const INSTALLED: unique symbol = Symbol.for('seald.fastLatin1') as never;

interface PatchableBuffer {
  toString(encoding?: string, start?: number, end?: number): string;
  [INSTALLED]?: boolean;
}

/** Each byte becomes one UTF-16 code unit, as Node's `latin1` decoder does. */
export function decodeLatin1(buf: Uint8Array, start = 0, end = buf.length): string {
  let out = '';
  for (let i = start; i < end; i += CHUNK) {
    out += String.fromCharCode(...buf.subarray(i, Math.min(i + CHUNK, end)));
  }
  return out;
}

/** Node's clamping of `buf.toString(enc, start, end)` bounds. */
function bounds(length: number, start?: number, end?: number): [number, number] {
  const s = start === undefined ? 0 : Math.max(0, Math.trunc(Number(start)) || 0);
  const e = end === undefined ? length : Math.min(length, Math.trunc(Number(end)) || 0);
  return [s, e];
}

export function installFastLatin1(): void {
  const proto: PatchableBuffer = Buffer.prototype;
  if (proto[INSTALLED]) return;
  const original = proto.toString;
  proto.toString = function (this: Buffer, encoding?: string, start?: number, end?: number) {
    const enc = typeof encoding === 'string' ? encoding.toLowerCase() : encoding;
    if (enc === 'latin1' || enc === 'binary') {
      const [s, e] = bounds(this.length, start, end);
      return e <= s ? '' : decodeLatin1(this, s, e);
    }
    return original.call(this, encoding, start, end);
  };
  proto[INSTALLED] = true;
}
