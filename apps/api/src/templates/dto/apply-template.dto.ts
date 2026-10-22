import { IsInt, Max, Min } from 'class-validator';

/** Upper bound keeps `'all'` expansion (fields x pages) bounded. */
export const APPLY_TEMPLATE_MAX_PAGES = 2000;

export class ApplyTemplateDto {
  /** Page count of the document the layout is applied to. */
  @IsInt()
  @Min(1)
  @Max(APPLY_TEMPLATE_MAX_PAGES)
  readonly totalPages!: number;
}
