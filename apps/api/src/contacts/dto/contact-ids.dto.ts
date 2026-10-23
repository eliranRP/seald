import { ArrayMaxSize, ArrayMinSize, IsArray, IsUUID } from 'class-validator';

/** Body of `DELETE /contacts` and `POST /contacts/restore`. */
export class ContactIdsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsUUID('all', { each: true })
  readonly ids!: ReadonlyArray<string>;
}
