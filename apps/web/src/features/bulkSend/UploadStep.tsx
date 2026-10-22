import { useId, useState, type FormEvent } from 'react';
import { Download, Upload } from 'lucide-react';
import { bulkCsvTemplate, type BulkSchema } from 'shared';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { EXPIRY_CHOICES } from './model';
import {
  ColumnItem,
  ColumnList,
  Field,
  FieldLabel,
  FileInput,
  Intro,
  Mono,
  Notice,
  Section,
  SectionTitle,
  Select,
  Actions,
  TextLink,
} from './BulkSend.styles';

export interface UploadStepProps {
  readonly schema: BulkSchema;
  readonly busy: boolean;
  /** Plain-English problem from the last attempt. */
  readonly error: string | null;
  readonly onSubmit: (input: { readonly file: File; readonly expiresInDays?: number }) => void;
}

function sampleHref(slotCount: number): string {
  return `data:text/csv;charset=utf-8,${encodeURIComponent(bulkCsvTemplate(slotCount))}`;
}

/**
 * Step 1: say what the file must contain, offer a sample, take the file.
 * Nothing is sent from here; the next step is a preview.
 */
export function UploadStep({ schema, busy, error, onSubmit }: UploadStepProps) {
  const fileId = useId();
  const expiryId = useId();
  const [file, setFile] = useState<File | null>(null);
  const [expiry, setExpiry] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    if (!file) {
      setLocalError('Choose a CSV file first.');
      return;
    }
    if (file.size > schema.max_file_bytes) {
      setLocalError('That file is too large. Keep it under 512 KB.');
      return;
    }
    setLocalError(null);
    onSubmit({ file, ...(expiry !== '' ? { expiresInDays: Number(expiry) } : {}) });
  };

  const problem = localError ?? error;

  return (
    <Section aria-labelledby="bulk-upload-title">
      <SectionTitle id="bulk-upload-title">Upload your recipients</SectionTitle>
      <Intro>
        One row makes one envelope from <b>{schema.template_title}</b>, up to {schema.max_rows} rows
        per file. Each signer in the template needs a name and an email:
      </Intro>
      <ColumnList aria-label="Columns the file needs">
        {schema.slots.map((slot) => (
          <ColumnItem key={slot.slot}>
            <span>{slot.label}:</span>
            <Mono>{slot.name_column}</Mono>
            <Mono>{slot.email_column}</Mono>
          </ColumnItem>
        ))}
        {schema.optional_columns.map((column) => (
          <ColumnItem key={column}>
            <span>Optional envelope title:</span>
            <Mono>{column}</Mono>
          </ColumnItem>
        ))}
      </ColumnList>
      <Actions>
        <TextLink href={sampleHref(schema.slots.length)} download="bulk-send-template.csv">
          <Icon icon={Download} size={16} aria-hidden />
          Download a sample CSV
        </TextLink>
      </Actions>

      <form onSubmit={handleSubmit} noValidate>
        <Section>
          <Field>
            <FieldLabel htmlFor={fileId}>CSV file</FieldLabel>
            <FileInput
              id={fileId}
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setLocalError(null);
              }}
              aria-describedby={problem ? `${fileId}-problem` : undefined}
              aria-invalid={problem ? true : undefined}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={expiryId}>Each request expires in</FieldLabel>
            <Select
              id={expiryId}
              value={expiry}
              onChange={(e) => {
                setExpiry(e.target.value);
              }}
            >
              {EXPIRY_CHOICES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </Select>
          </Field>
          {problem ? (
            <Notice $tone="error" role="alert" id={`${fileId}-problem`}>
              {problem}
            </Notice>
          ) : null}
          <Actions>
            <Button type="submit" variant="primary" iconLeft={Upload} loading={busy}>
              Preview
            </Button>
          </Actions>
        </Section>
      </form>
    </Section>
  );
}
