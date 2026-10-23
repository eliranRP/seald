/**
 * The name approvals, email and audit rows use for a connected app (the
 * OAuth grant's stand-in for a key name). A pre-registered client's name
 * comes from Seald's own configuration. A CIMD client's `client_name` is
 * whatever its document says, so it is not used: the label is the host
 * that served the document, which the client cannot fake.
 */
export function connectedAppLabel(
  kind: 'preregistered' | 'cimd',
  clientId: string,
  clientName: string,
): string {
  if (kind === 'preregistered') return `${clientName} (connected app)`;
  return `${clientIdHost(clientId)} (connected app)`;
}

/** Host of a CIMD client id URL, or the id itself when it is not a URL. */
export function clientIdHost(clientId: string): string {
  try {
    return new URL(clientId).host;
  } catch {
    return clientId;
  }
}
