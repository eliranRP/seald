import { useId, useState } from 'react';
import type { ReactNode } from 'react';
import { NUMBER_FORMATS, type FieldMetaOptions, type NumberFormat } from 'shared';
import type { PlacedFieldValue } from '@/components/PlacedField/PlacedField.types';
import {
  NUMBER_FORMAT_LABELS,
  draftFromMeta,
  hasOptions,
  metaFromDraft,
  newOption,
  supportsFontSize,
  supportsPlaceholder,
  supportsReadOnly,
  type DraftErrors,
  type MetaDraft,
} from './fieldMetaForm';
import {
  CheckRow,
  ErrorText,
  Heading,
  OptionItem,
  OptionList,
  Pair,
  Root,
  Row,
  Label,
  Select,
  SmallButton,
  TextInput,
} from './FieldPropertiesPanel.styles';

const KIND_TITLE: Readonly<Record<string, string>> = {
  text: 'Text',
  name: 'Name',
  email: 'Email',
  date: 'Date',
  number: 'Number',
  radio: 'Radio',
  dropdown: 'Dropdown',
};

export interface FieldPropertiesChange {
  readonly required?: boolean;
  readonly meta?: FieldMetaOptions | undefined;
}

export interface FieldPropertiesPanelProps {
  readonly field: PlacedFieldValue;
  /** Called only with values the API schema accepts; invalid edits stay in the panel. */
  readonly onChange: (patch: FieldPropertiesChange) => void;
}

const NO_ERRORS: DraftErrors = { fields: {}, options: {} };

/**
 * Settings for one placed field (WP-08, flag `fieldMetaV2`): label,
 * placeholder, required, read-only, font size, and the per-kind options
 * (text limit and default, number range and format, choice options). Edits
 * are checked against the API's schema as they are made; only valid meta
 * is passed up, and the reason an edit is held back shows next to its
 * control. Mount with `key={field.id}` so the draft follows the selection.
 */
export function FieldPropertiesPanel({ field, onChange }: FieldPropertiesPanelProps) {
  const uid = useId();
  const kind = field.type;
  const [draft, setDraft] = useState<MetaDraft>(() => draftFromMeta(kind, field.meta));
  const [errors, setErrors] = useState<DraftErrors>(NO_ERRORS);

  const idOf = (name: string): string => `${uid}-${name}`;
  const errId = (name: string): string => `${uid}-${name}-error`;

  function edit(patch: Partial<MetaDraft>): void {
    const next: MetaDraft = { ...draft, ...patch };
    setDraft(next);
    const result = metaFromDraft(kind, next, field.meta);
    if (result.ok) {
      setErrors(NO_ERRORS);
      onChange({ meta: Object.keys(result.meta).length > 0 ? result.meta : undefined });
    } else {
      setErrors(result.errors);
    }
  }

  function fieldError(key: keyof DraftErrors['fields']): ReactNode {
    const message = errors.fields[key];
    return message !== undefined ? (
      <ErrorText id={errId(key)} role="alert">
        {message}
      </ErrorText>
    ) : null;
  }
  const describe = (key: keyof DraftErrors['fields']): string | undefined =>
    errors.fields[key] !== undefined ? errId(key) : undefined;

  const options = draft.options;

  return (
    <Root role="region" aria-label="Field settings">
      <Heading>{`${KIND_TITLE[kind] ?? 'Field'} field settings`}</Heading>

      <Row>
        <Label htmlFor={idOf('label')}>Label</Label>
        <TextInput
          id={idOf('label')}
          type="text"
          value={draft.label}
          maxLength={100}
          onChange={(e) => edit({ label: e.target.value })}
        />
      </Row>

      {supportsPlaceholder(kind) ? (
        <Row>
          <Label htmlFor={idOf('placeholder')}>Placeholder</Label>
          <TextInput
            id={idOf('placeholder')}
            type="text"
            value={draft.placeholder}
            maxLength={100}
            onChange={(e) => edit({ placeholder: e.target.value })}
          />
        </Row>
      ) : null}

      <CheckRow>
        <input
          type="checkbox"
          checked={field.required ?? true}
          onChange={(e) => onChange({ required: e.target.checked })}
        />
        Required
      </CheckRow>

      {supportsReadOnly(kind) ? (
        <Row>
          <CheckRow>
            <input
              type="checkbox"
              checked={draft.readOnly}
              aria-invalid={errors.fields.readOnly !== undefined ? true : undefined}
              aria-describedby={describe('readOnly')}
              onChange={(e) => edit({ readOnly: e.target.checked })}
            />
            Read-only (signer sees the default)
          </CheckRow>
          {fieldError('readOnly')}
        </Row>
      ) : null}

      {supportsFontSize(kind) ? (
        <Row>
          <Label htmlFor={idOf('fontSize')}>Font size</Label>
          <TextInput
            id={idOf('fontSize')}
            type="number"
            inputMode="numeric"
            min={8}
            max={96}
            value={draft.fontSize}
            $invalid={errors.fields.fontSize !== undefined}
            aria-invalid={errors.fields.fontSize !== undefined ? true : undefined}
            aria-describedby={describe('fontSize')}
            onChange={(e) => edit({ fontSize: e.target.value })}
          />
          {fieldError('fontSize')}
        </Row>
      ) : null}

      {kind === 'text' ? (
        <>
          <Row>
            <Label htmlFor={idOf('charLimit')}>Character limit</Label>
            <TextInput
              id={idOf('charLimit')}
              type="number"
              inputMode="numeric"
              min={1}
              max={500}
              value={draft.charLimit}
              $invalid={errors.fields.charLimit !== undefined}
              aria-invalid={errors.fields.charLimit !== undefined ? true : undefined}
              aria-describedby={describe('charLimit')}
              onChange={(e) => edit({ charLimit: e.target.value })}
            />
            {fieldError('charLimit')}
          </Row>
          <Row>
            <Label htmlFor={idOf('default')}>Default text</Label>
            <TextInput
              id={idOf('default')}
              type="text"
              value={draft.defaultValue}
              maxLength={500}
              $invalid={errors.fields.defaultValue !== undefined}
              aria-invalid={errors.fields.defaultValue !== undefined ? true : undefined}
              aria-describedby={describe('defaultValue')}
              onChange={(e) => edit({ defaultValue: e.target.value })}
            />
            {fieldError('defaultValue')}
          </Row>
        </>
      ) : null}

      {kind === 'number' ? (
        <>
          <Pair>
            <Row>
              <Label htmlFor={idOf('min')}>Minimum</Label>
              <TextInput
                id={idOf('min')}
                type="text"
                inputMode="decimal"
                value={draft.min}
                $invalid={errors.fields.min !== undefined}
                aria-invalid={errors.fields.min !== undefined ? true : undefined}
                aria-describedby={describe('min')}
                onChange={(e) => edit({ min: e.target.value })}
              />
              {fieldError('min')}
            </Row>
            <Row>
              <Label htmlFor={idOf('max')}>Maximum</Label>
              <TextInput
                id={idOf('max')}
                type="text"
                inputMode="decimal"
                value={draft.max}
                $invalid={errors.fields.max !== undefined}
                aria-invalid={errors.fields.max !== undefined ? true : undefined}
                aria-describedby={describe('max')}
                onChange={(e) => edit({ max: e.target.value })}
              />
              {fieldError('max')}
            </Row>
          </Pair>
          <Row>
            <Label htmlFor={idOf('format')}>Number format</Label>
            <Select
              id={idOf('format')}
              value={draft.format}
              onChange={(e) => edit({ format: e.target.value as NumberFormat | '' })}
            >
              <option value="">Plain (default)</option>
              {NUMBER_FORMATS.filter((f) => f !== 'plain').map((f) => (
                <option key={f} value={f}>
                  {NUMBER_FORMAT_LABELS[f]}
                </option>
              ))}
            </Select>
          </Row>
          <Row>
            <Label htmlFor={idOf('default')}>Default value</Label>
            <TextInput
              id={idOf('default')}
              type="text"
              inputMode="decimal"
              value={draft.defaultValue}
              $invalid={errors.fields.defaultValue !== undefined}
              aria-invalid={errors.fields.defaultValue !== undefined ? true : undefined}
              aria-describedby={describe('defaultValue')}
              onChange={(e) => edit({ defaultValue: e.target.value })}
            />
            {fieldError('defaultValue')}
          </Row>
        </>
      ) : null}

      {hasOptions(kind) ? (
        <>
          <Row role="group" aria-labelledby={idOf('options')}>
            <Label as="span" id={idOf('options')}>
              Options
            </Label>
            <OptionList>
              {options.map((o, i) => {
                const e = errors.options[o.id];
                const n = String(i + 1);
                return (
                  <OptionItem key={o.id}>
                    <Row>
                      <TextInput
                        type="text"
                        value={o.label}
                        maxLength={100}
                        aria-label={`Option ${n} label`}
                        $invalid={e?.label !== undefined}
                        aria-invalid={e?.label !== undefined ? true : undefined}
                        onChange={(ev) =>
                          edit({
                            options: options.map((x) =>
                              x.id === o.id ? { ...x, label: ev.target.value } : x,
                            ),
                          })
                        }
                      />
                      {e?.label !== undefined ? (
                        <ErrorText role="alert">{e.label}</ErrorText>
                      ) : null}
                    </Row>
                    <Row>
                      <TextInput
                        type="text"
                        value={o.value}
                        maxLength={100}
                        aria-label={`Option ${n} value`}
                        $invalid={e?.value !== undefined}
                        aria-invalid={e?.value !== undefined ? true : undefined}
                        onChange={(ev) => {
                          const value = ev.target.value;
                          edit({
                            options: options.map((x) => (x.id === o.id ? { ...x, value } : x)),
                            // A renamed value keeps being the default only if it stays one.
                            defaultValue:
                              draft.defaultValue !== '' && draft.defaultValue === o.value
                                ? value
                                : draft.defaultValue,
                          });
                        }}
                      />
                      {e?.value !== undefined ? (
                        <ErrorText role="alert">{e.value}</ErrorText>
                      ) : null}
                    </Row>
                    <SmallButton
                      type="button"
                      aria-label={`Remove option ${n}`}
                      disabled={options.length <= 1}
                      onClick={() =>
                        edit({
                          options: options.filter((x) => x.id !== o.id),
                          defaultValue:
                            draft.defaultValue !== '' && draft.defaultValue === o.value
                              ? ''
                              : draft.defaultValue,
                        })
                      }
                    >
                      Remove
                    </SmallButton>
                  </OptionItem>
                );
              })}
            </OptionList>
            {fieldError('options')}
            <SmallButton
              type="button"
              disabled={options.length >= 50}
              onClick={() => edit({ options: [...options, newOption(options)] })}
            >
              Add option
            </SmallButton>
          </Row>
          <Row>
            <Label htmlFor={idOf('default')}>Default option</Label>
            <Select
              id={idOf('default')}
              value={draft.defaultValue}
              $invalid={errors.fields.defaultValue !== undefined}
              aria-invalid={errors.fields.defaultValue !== undefined ? true : undefined}
              aria-describedby={describe('defaultValue')}
              onChange={(e) => edit({ defaultValue: e.target.value })}
            >
              <option value="">No default</option>
              {options
                .filter((o) => o.value !== '')
                .map((o) => (
                  <option key={o.id} value={o.value}>
                    {o.label}
                  </option>
                ))}
            </Select>
            {fieldError('defaultValue')}
          </Row>
        </>
      ) : null}
    </Root>
  );
}
