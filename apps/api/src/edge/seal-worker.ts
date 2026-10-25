import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { AutomationsPgRepository } from '../automations/automations.repository.pg';
import { AutomationMatcherService } from '../automations/matcher';
import { parseEnv } from '../config/env.schema';
import { createDb } from '../db/db.provider';
import { OutboundEmailsPgRepository } from '../email/outbound-emails.repository.pg';
import { EnvelopeDocumentsPgRepository } from '../envelopes/documents/envelope-documents.repository.pg';
import { EnvelopesPgRepository } from '../envelopes/envelopes.repository.pg';
import { DssInjector } from '../sealing/dss-injector';
import { RevocationFetcher } from '../sealing/revocation-fetcher';
import { selectPadesSigner } from '../sealing/pades-signer-selection';
import { SealingService } from '../sealing/sealing.service';
import { runOneSealStep, type SealStepOutcome } from '../sealing/seal-step-runner';
import { TsaClient } from '../sealing/tsa-client';
import { SupabaseStorageService } from '../storage/storage.service';
import { installFastLatin1 } from './fast-latin1';

/**
 * Entry for the `seal-worker` Edge Function (docs/supabase-native-architecture.md).
 *
 * Wires only what sealing needs, by hand, with no Nest application: the
 * bundle stays small and boots fast, which matters because the runtime
 * counts the boot against the worker's CPU budget. The wiring mirrors
 * SealingModule (signer selection rule S.1 included) and the automation
 * event hook AutomationsModule installs on the envelopes repository.
 */
export interface SealWorker {
  runOneStep(): Promise<SealStepOutcome>;
}

export function createSealWorker(source: NodeJS.ProcessEnv = process.env): SealWorker {
  installFastLatin1();
  const env = parseEnv(source);
  // One step at a time per worker: a couple of connections is plenty, and
  // the transaction-mode connection pool (port 6543) multiplexes them.
  const db = createDb(env, { maxConnections: 2 });
  const automationHook = new AutomationMatcherService(new AutomationsPgRepository(db), env);
  const repo = new EnvelopesPgRepository(db, automationHook);
  const tsa = new TsaClient(env);
  const sealing = new SealingService(
    repo,
    new SupabaseStorageService(env),
    new OutboundEmailsPgRepository(db),
    selectPadesSigner(env, tsa),
    new DssInjector(new RevocationFetcher(), tsa),
    env,
    new EnvelopeDocumentsPgRepository(db),
  );
  const logger = new Logger('SealWorker');
  return { runOneStep: () => runOneSealStep(repo, sealing, logger) };
}
