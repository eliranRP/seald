// Constant-time shared-secret check for internal endpoints (cron, worker
// self-kicks). Hashing both sides first makes the comparison fixed-length,
// so neither the content nor the length of the secret leaks through timing.

async function sha256(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
}

export async function secretMatches(provided: string | null, expected: string): Promise<boolean> {
  if (provided === null || expected.length === 0) return false;
  const [a, b] = await Promise.all([sha256(provided), sha256(expected)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= (a[i] as number) ^ (b[i] as number);
  return diff === 0;
}
