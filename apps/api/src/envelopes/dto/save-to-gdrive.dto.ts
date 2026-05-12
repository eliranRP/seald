import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Body of `POST /envelopes/:id/gdrive/save`. `folderId` is the Drive
 * folder id the user picked via the Google Picker; `folderName` is the
 * display path captured from the same Picker selection (best-effort —
 * Drive folder names aren't unique, so it's purely cosmetic for the
 * "Last saved to Drive · …" line and the success toast link text).
 */
export class SaveToGdriveDto {
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  readonly folderId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1024)
  readonly folderName?: string;
}
