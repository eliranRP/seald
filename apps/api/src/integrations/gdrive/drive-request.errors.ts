/**
 * Domain errors for caller-supplied Drive request input. Services throw
 * these; the controller (transport) maps them to HTTP 400 so the service
 * layer stays free of Nest HTTP exceptions and MCP tools can reuse it.
 */
export type DriveRequestErrorCode = 'invalid-account-id' | 'invalid-file-id' | 'unsupported-mime';

export class DriveRequestError extends Error {
  constructor(
    public readonly code: DriveRequestErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'DriveRequestError';
  }
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function assertAccountId(accountId: unknown): asserts accountId is string {
  if (typeof accountId !== 'string' || !UUID_RE.test(accountId)) {
    throw new DriveRequestError('invalid-account-id', 'accountId_must_be_uuid');
  }
}
