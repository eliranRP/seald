import { DirectLinkRateLimiter } from '../direct-link-rate-limiter';

describe('DirectLinkRateLimiter', () => {
  const MIN = 60_000;

  it('allows up to the limit inside the window, then refuses with a retry time', () => {
    const rl = new DirectLinkRateLimiter();
    for (let i = 0; i < 3; i++) expect(rl.hit('k', 3, MIN, 1_000 + i).allowed).toBe(true);
    const over = rl.hit('k', 3, MIN, 10_000);
    expect(over.allowed).toBe(false);
    // The oldest hit (t=1000) leaves the window at t=61000.
    expect(over.retryAfterSeconds).toBe(51);
  });

  it('forgets hits once they leave the window', () => {
    const rl = new DirectLinkRateLimiter();
    for (let i = 0; i < 3; i++) rl.hit('k', 3, MIN, 0);
    expect(rl.hit('k', 3, MIN, 30_000).allowed).toBe(false);
    expect(rl.hit('k', 3, MIN, MIN + 1).allowed).toBe(true);
  });

  it('does not extend the window with refused hits', () => {
    const rl = new DirectLinkRateLimiter();
    rl.hit('k', 1, MIN, 0);
    for (let t = 1; t < 50; t++) expect(rl.hit('k', 1, MIN, t * 1_000).allowed).toBe(false);
    expect(rl.hit('k', 1, MIN, MIN + 1).allowed).toBe(true);
  });

  it('keeps keys independent', () => {
    const rl = new DirectLinkRateLimiter();
    expect(rl.hit('a', 1, MIN, 0).allowed).toBe(true);
    expect(rl.hit('a', 1, MIN, 1).allowed).toBe(false);
    expect(rl.hit('b', 1, MIN, 1).allowed).toBe(true);
  });

  it('reset clears everything', () => {
    const rl = new DirectLinkRateLimiter();
    rl.hit('a', 1, MIN, 0);
    rl.reset();
    expect(rl.hit('a', 1, MIN, 1).allowed).toBe(true);
  });
});
