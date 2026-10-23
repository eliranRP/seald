import { ArrayMaxSize, ArrayMinSize, IsArray, IsString, MaxLength } from 'class-validator';

/** Most addresses one paste may carry (the Add modal splits a pasted list). */
export const BULK_CONTACTS_MAX = 200;

export class BulkCreateContactsDto {
  /**
   * Raw addresses as pasted. The server trims, lower-cases, validates and
   * de-duplicates them, so the body is not validated address by address.
   */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(BULK_CONTACTS_MAX)
  @IsString({ each: true })
  @MaxLength(400, { each: true })
  readonly emails!: ReadonlyArray<string>;
}
