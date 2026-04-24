import { IsUUID } from 'class-validator';

export class AddSignerDto {
  @IsUUID()
  readonly contact_id!: string;
}
