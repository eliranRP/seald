import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateEnvelopeDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  readonly title!: string;
}
