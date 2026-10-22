import { useTranslation } from 'react-i18next';
import './init';
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

export type TFn = (key: CommonKey) => string;

/** Typed translation hook over the `common` namespace. Unknown keys fail to compile. */
export function useT(): TFn {
  const { t } = useTranslation('common');
  return (key) => t(key);
}
