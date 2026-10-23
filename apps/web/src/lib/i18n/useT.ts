import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { i18n } from './init';
import type { CommonCatalog } from './init';

/** Dotted leaf-key paths of a nested catalog object. */
type LeafPaths<T> = {
  [K in keyof T & string]: T[K] extends string
    ? K
    : T[K] extends object
      ? `${K}.${LeafPaths<T[K]>}`
      : never;
}[keyof T & string];

export type CommonKey = LeafPaths<CommonCatalog>;

/** Values interpolated into a catalog string, e.g. `{{count}}`. */
export type TOptions = Readonly<Record<string, string | number>>;

export type TFn = (key: CommonKey, options?: TOptions) => string;

/** Typed translation hook over the `common` namespace. Unknown keys fail to compile. */
export function useT(): TFn {
  const { t } = useTranslation('common');
  // Stable while the language is unchanged, so callers can list it in deps.
  return useCallback<TFn>((key, options) => (options ? t(key, options) : t(key)), [t]);
}

/**
 * Translator for code that runs outside React (plain helpers, class
 * components). Uses the app-wide default instance, which is English until
 * a locale is chosen. Prefer `useT()` inside components so the active
 * provider's locale applies; pass its `t` into helpers that take one.
 */
export const translate: TFn = (key, options) => (options ? i18n.t(key, options) : i18n.t(key));
