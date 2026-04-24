import { IsOptional, IsString, MaxLength } from 'class-validator';

export class DeclineDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  readonly reason?: string;
}
