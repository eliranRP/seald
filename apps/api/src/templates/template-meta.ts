import { BadRequestException } from '@nestjs/common';
import { parseFieldMeta, type AnyTemplateFieldType } from 'shared';

/** A template type names a field kind; only `initial` is spelled differently. */
function kindOf(type: AnyTemplateFieldType): string {
  return type === 'initial' ? 'initials' : type;
}

/**
 * WP-07. With `fieldMetaV2` on, check every layout entry's `meta` against
 * its kind with the shared Zod union and return the layout with the parsed
 * meta. Entries without meta stay without meta, except radio and dropdown,
 * which need `options` and so always go through the check. One 400 lists
 * every problem as `field_layout.<i>.meta...`.
 */
export function validateTemplateMeta<
  T extends {
    readonly type: AnyTemplateFieldType;
    readonly meta?: Readonly<Record<string, unknown>>;
  },
>(layout: ReadonlyArray<T>): T[] {
  const problems: string[] = [];
  const out = layout.map((f, i) => {
    const needsMeta = f.type === 'radio' || f.type === 'dropdown';
    if (f.meta === undefined && !needsMeta) return f;
    const parsed = parseFieldMeta(kindOf(f.type), f.meta ?? {});
    if (!parsed.ok) {
      for (const issue of parsed.issues) {
        problems.push(`field_layout.${i}.${issue.path}: ${issue.message}`);
      }
      return f;
    }
    return { ...f, meta: parsed.meta };
  });
  if (problems.length > 0) throw new BadRequestException(problems);
  return out;
}
