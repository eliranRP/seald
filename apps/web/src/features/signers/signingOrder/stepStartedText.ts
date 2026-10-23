/**
 * Readable text for a `step_started` event (WP-05 metadata:
 * `{ step, signing_order, signer_ids }`). Falls back to a plain sentence
 * when the metadata is missing or unexpected, so the timeline never shows
 * the raw event name.
 */
export function stepStartedText(
  metadata: Readonly<Record<string, unknown>> | null | undefined,
  nameById: ReadonlyMap<string, string>,
): string {
  const step = typeof metadata?.step === 'number' ? metadata.step : null;
  const ids = Array.isArray(metadata?.signer_ids) ? (metadata.signer_ids as unknown[]) : [];
  const names = ids
    .filter((id): id is string => typeof id === 'string')
    .map((id) => nameById.get(id))
    .filter((name): name is string => name !== undefined);
  const head = step !== null ? `Step ${String(step)} started` : 'Next signing step started';
  return names.length > 0 ? `${head} — invited ${names.join(', ')}` : head;
}
