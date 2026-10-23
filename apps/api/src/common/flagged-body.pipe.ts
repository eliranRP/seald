import { Injectable, ValidationPipe, type PipeTransform } from '@nestjs/common';
import { isFeatureEnabled, type FeatureFlag } from 'shared';

/** The options `main.ts` gives the global ValidationPipe. */
const VALIDATION_OPTIONS = {
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
} as const;

type DtoClass = new (...args: never[]) => object;

/**
 * Validates a request body against one of two DTO classes, picked by a
 * feature flag at request time. With the flag off the body goes through
 * exactly the validation (and error text) the legacy DTO always had, so a
 * dark field such as `document_id` is still rejected byte for byte.
 *
 * The handler must declare its `@Body()` parameter type as `object` so
 * the global ValidationPipe skips it and this pipe is the only validator.
 */
@Injectable()
export class FlaggedBodyPipe implements PipeTransform {
  private readonly pipe = new ValidationPipe(VALIDATION_OPTIONS);

  constructor(
    private readonly flag: FeatureFlag,
    private readonly whenOn: DtoClass,
    private readonly whenOff: DtoClass,
  ) {}

  transform(value: unknown): Promise<unknown> {
    const metatype = isFeatureEnabled(this.flag) ? this.whenOn : this.whenOff;
    return this.pipe.transform(value, { type: 'body', metatype });
  }
}
