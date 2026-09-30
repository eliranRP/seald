import { NotFoundException } from '@nestjs/common';

/**
 * Placement refused because `mcpServer` is off. Same 404 shape as the
 * other dark features, so a caller cannot tell the engine exists.
 */
export class FieldPlacementDisabledError extends NotFoundException {
  constructor() {
    super('not_found');
  }
}

export class FieldPlacementError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'FieldPlacementError';
    this.code = code;
  }
}
