// HTTP shell shared by the worker Edge Functions (seal-worker, email-worker,
// jobs). docs/supabase-native-architecture.md, decision 5.
//
// - POST only, `X-Cron-Secret: $CRON_SECRET` (pg_cron via pg_net, or the
//   worker itself).
// - One run at a time per worker: the runtime counts CPU per worker and may
//   route a cron tick and a self-kick to the same one.
// - When a run reports more work, the worker calls its own URL after
//   answering, so the next run starts at once on a new invocation with its
//   own CPU budget instead of waiting for the next cron tick.
// - The work object is built on the first request, not at module load, so a
//   misconfiguration answers 500 with the error in the logs instead of
//   failing every boot.
import { secretMatches } from './secret.ts';

export interface WorkerServerOptions<W, R> {
  /** Function name; the self-kick URL is `$SUPABASE_URL/functions/v1/<name>`. */
  readonly name: string;
  readonly create: () => W;
  readonly run: (worker: W, req: Request) => Promise<R>;
  /** True when another run should follow right away. */
  readonly more: (result: R) => boolean;
}

export function serveWorker<W, R>(opts: WorkerServerOptions<W, R>): void {
  const cronSecret = Deno.env.get('CRON_SECRET') ?? '';
  const envName = `${opts.name.toUpperCase().replace(/-/g, '_')}_URL`;
  const selfUrl =
    Deno.env.get(envName) ??
    `${(Deno.env.get('SUPABASE_URL') ?? '').replace(/\/$/, '')}/functions/v1/${opts.name}`;
  let worker: W | null = null;
  let busy = false;

  Deno.serve(async (req: Request) => {
    if (req.method !== 'POST') return new Response('method_not_allowed', { status: 405 });
    if (
      cronSecret.length < 32 ||
      !(await secretMatches(req.headers.get('x-cron-secret'), cronSecret))
    ) {
      return new Response('invalid_cron_secret', { status: 401 });
    }
    if (busy) return Response.json({ kind: 'busy' });
    busy = true;
    let result: R;
    try {
      worker ??= opts.create();
      result = await opts.run(worker, req);
    } finally {
      busy = false;
    }
    if (opts.more(result)) {
      EdgeRuntime.waitUntil(
        fetch(selfUrl, { method: 'POST', headers: { 'x-cron-secret': cronSecret } })
          .then((res) => res.body?.cancel())
          .catch((err: unknown) => console.error(`${opts.name} self-kick failed`, err)),
      );
    }
    return Response.json(result);
  });
}
