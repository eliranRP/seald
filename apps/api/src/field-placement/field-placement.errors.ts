/** A PDF the engine could not read. Not a placement slug. */
export class FieldPlacementError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'FieldPlacementError';
    this.code = code;
  }
}
