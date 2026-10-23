import { useId } from 'react';
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, isFeatureEnabled, isSupportedLocale } from 'shared';
import { Control, Field, Hint, Label, Legend, Root } from './LocaleSettings.styles';
import type { LocaleSettingsProps } from './LocaleSettings.types';

/** Native-language name for a locale tag ("English"); falls back to the tag itself. */
function languageName(tag: string): string {
  try {
    return new Intl.DisplayNames([tag], { type: 'language' }).of(tag) ?? tag;
  } catch {
    return tag;
  }
}

/**
 * Envelope language for the send step (WP-38): the signing page and the
 * emails use it. Hidden while the `i18n` flag is off. With a single
 * supported locale the select is disabled and shows that locale. Legal and
 * consent text stays English whatever is chosen.
 */
export function LocaleSettings({ value, onChange, disabled = false }: LocaleSettingsProps) {
  const selectId = useId();
  const hintId = useId();
  if (!isFeatureEnabled('i18n')) return null;

  const current =
    value.locale !== undefined && isSupportedLocale(value.locale) ? value.locale : DEFAULT_LOCALE;
  const onlyOne = SUPPORTED_LOCALES.length <= 1;

  return (
    <Root disabled={disabled}>
      <Legend>Language</Legend>
      <Field>
        <Label htmlFor={selectId}>Signer language</Label>
        <Control
          id={selectId}
          value={current}
          disabled={onlyOne}
          aria-describedby={hintId}
          onChange={(event) => onChange({ ...value, locale: event.target.value })}
        >
          {SUPPORTED_LOCALES.map((tag) => (
            <option key={tag} value={tag}>
              {languageName(tag)}
            </option>
          ))}
        </Control>
      </Field>
      <Hint id={hintId}>
        Used for the signing page and emails. Legal and consent text always stays in English.
      </Hint>
    </Root>
  );
}
