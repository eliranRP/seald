import { ArrayMaxSize, ArrayMinSize, IsArray, IsUUID } from 'class-validator';
import { MAX_ENVELOPE_DOCUMENTS } from 'shared';

/** `PUT /envelopes/:id/documents/order`. Mirrors ReorderDocumentsRequestSchema. */
export class ReorderDocumentsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_ENVELOPE_DOCUMENTS)
  @IsUUID('all', { each: true })
  readonly document_ids!: string[];
}
