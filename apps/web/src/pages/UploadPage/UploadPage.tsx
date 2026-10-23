import { forwardRef, useCallback, useId, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent, JSX, MouseEvent } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Check,
  Download,
  File as FileIcon,
  FileUp,
  LayoutTemplate,
  Loader2,
  RefreshCw,
  Smartphone,
  UploadCloud,
} from 'lucide-react';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { SourceTile } from '@/components/SourceTile';
import { TemplateChip } from '@/components/TemplateChip';
import { GDriveLogo } from '@/features/gdriveImport/GDriveLogo';
import { useIsMobileViewport } from '@/hooks/useIsMobileViewport';
import type { UploadPageErrorCode, UploadPageProps } from './UploadPage.types';
import {
  Actions,
  AlertInline,
  Body,
  CheckIco,
  CheckItem,
  CheckNum,
  Checklist,
  ChipRow,
  DropHeading,
  DropIcon,
  DropSubheading,
  Dropzone,
  Eyebrow,
  FileCard,
  FileMeta,
  FileName,
  Grow,
  Heading,
  HeadingBlock,
  HiddenFileInput,
  IconMeta,
  Inner,
  Main,
  MetaRow,
  Mono,
  OpensHint,
  Progress,
  Sources,
  Subtitle,
  TemplateBanner,
  TemplateBannerClear,
  TemplateBannerStrong,
  TemplateBannerText,
  TemplatePromptDivider,
  TemplatePromptDot,
  TemplatePromptHint,
  TemplatePromptLink,
  Thumb,
} from './UploadPage.styles';

const DEFAULT_MAX_BYTES = 25 * 1024 * 1024;
const PDF_ACCEPT = 'application/pdf';
const WORD_ACCEPT =
  'application/pdf,.pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.docx,application/msword,.doc';
const DEFAULT_TITLE = 'New document';
const MULTI_DROP_HEADING = 'Drop your PDFs here';

/**
 * Returns true when the file matches `accept`. Accepts a comma-separated list
 * of MIME types and/or dotted extensions, matching the `<input accept>` spec.
 */
function matchesAccept(file: File, accept: string): boolean {
  const parts = accept
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  if (parts.length === 0) {
    return true;
  }
  const name = file.name.toLowerCase();
  const mime = file.type.toLowerCase();
  return parts.some((raw) => {
    const pat = raw.toLowerCase();
    if (pat.startsWith('.')) {
      return name.endsWith(pat);
    }
    if (pat.endsWith('/*')) {
      const prefix = pat.slice(0, -1);
      return mime.startsWith(prefix);
    }
    return mime === pat;
  });
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${String(Math.max(1, Math.round(bytes / 1024)))} KB`;
}

type StepState = 'done' | 'active' | 'todo';

interface LoaderStep {
  readonly label: string;
  readonly state: StepState;
  readonly num?: number | undefined;
}

function loaderSteps(
  status: 'analyzing' | 'converting',
  pages: number | undefined,
): ReadonlyArray<LoaderStep> {
  if (status === 'converting') {
    return [
      { label: 'Read file', state: 'done' },
      { label: 'Convert to PDF', state: 'active' },
      { label: 'Pages', state: 'todo' },
      { label: 'Ready', state: 'todo' },
    ];
  }
  const known = pages !== undefined && pages > 0;
  return [
    { label: 'Read file', state: 'done' },
    { label: 'Pages', state: known ? 'done' : 'active', num: known ? pages : undefined },
    { label: 'Ready', state: known ? 'active' : 'todo' },
  ];
}

interface LoaderCardProps {
  readonly status: 'analyzing' | 'converting';
  readonly fileName?: string | undefined;
  readonly fileSize?: number | undefined;
  readonly pages?: number | undefined;
  readonly failed: boolean;
  readonly onCancel?: (() => void) | undefined;
  readonly onRetry?: (() => void) | undefined;
}

function StepGlyph({ state }: { readonly state: StepState }): JSX.Element | null {
  if (state === 'done') return <Check size={12} strokeWidth={3} />;
  if (state === 'active') return <Loader2 size={12} strokeWidth={2.5} />;
  return null;
}

function LoaderCard(props: LoaderCardProps): JSX.Element {
  const { status, fileName, fileSize, pages, failed, onCancel, onRetry } = props;
  const steps = loaderSteps(status, pages);
  const done = steps.filter((s) => s.state === 'done').length;
  const pct = Math.round(((done + 0.5) / steps.length) * 100);
  const meta = [
    fileSize !== undefined ? formatBytes(fileSize) : null,
    pages !== undefined && pages > 0 ? `${String(pages)} ${pages === 1 ? 'page' : 'pages'}` : null,
  ]
    .filter((x): x is string => x !== null)
    .join(' · ');
  return (
    <>
      <FileCard role="status" aria-live="polite">
        <Thumb aria-hidden>
          <i />
          <i />
          <i />
          <i />
        </Thumb>
        <Grow>
          <FileName>
            {fileName !== undefined && fileName.length > 0 ? fileName : 'Your file'}
          </FileName>
          {meta ? <FileMeta>{meta}</FileMeta> : null}
          <Progress aria-hidden $error={failed}>
            <span style={{ width: failed ? '100%' : `${String(pct)}%` }} />
          </Progress>
          {failed ? (
            <>
              <AlertInline>
                <AlertCircle size={16} aria-hidden />
                Couldn&apos;t convert
              </AlertInline>
              <Actions>
                {onRetry ? (
                  <Button variant="primary" iconLeft={RefreshCw} onClick={onRetry}>
                    Retry
                  </Button>
                ) : null}
                {onCancel ? (
                  <Button variant="secondary" iconLeft={UploadCloud} onClick={onCancel}>
                    Upload another
                  </Button>
                ) : null}
              </Actions>
            </>
          ) : (
            <Checklist>
              {steps.map((step) => (
                <CheckItem key={step.label} $state={step.state}>
                  <CheckIco $state={step.state} aria-hidden>
                    <StepGlyph state={step.state} />
                  </CheckIco>
                  {step.label}
                  {step.num !== undefined ? <CheckNum>{step.num}</CheckNum> : null}
                </CheckItem>
              ))}
            </Checklist>
          )}
        </Grow>
        {onCancel && !failed ? (
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
      </FileCard>
      {failed ? null : (
        <OpensHint>
          <ArrowRight size={14} aria-hidden />
          Opens the editor when ready
        </OpensHint>
      )}
    </>
  );
}

export const UploadPage = forwardRef<HTMLDivElement, UploadPageProps>((props, ref) => {
  const {
    onFileSelected,
    onFilesSelected,
    multiple = false,
    onError,
    title = DEFAULT_TITLE,
    subtitle,
    hideHeader = false,
    dropHeading,
    dropSubheading,
    chooseLabel,
    accept,
    maxSizeBytes = DEFAULT_MAX_BYTES,
    allowWord = false,
    status = 'idle',
    analyzingFileName,
    analyzingFileSize,
    analyzedPages,
    onCancelAnalysis,
    conversionFailed = false,
    onRetryConversion,
    showSources = false,
    templateBannerTitle,
    templateBannerTone = 'info',
    onClearTemplate,
    onPickTemplate,
    templateCount,
    recentTemplates,
    onPickRecentTemplate,
    onScan,
    onPickDrive,
    onConnectDrive,
    ...rest
  } = props;

  const effectiveAccept = accept ?? (allowWord ? WORD_ACCEPT : PDF_ACCEPT);
  const defaultHeading = allowWord ? 'Drop a PDF or Word file' : 'Drop your PDF here';
  const effectiveHeading = dropHeading ?? (multiple ? MULTI_DROP_HEADING : defaultHeading);
  const effectiveChoose = chooseLabel ?? (multiple ? 'Choose files' : 'Choose file');

  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<{
    message: string;
    file: string;
    code: UploadPageErrorCode;
  } | null>(null);
  const reactId = useId();
  const inputId = `${reactId}-file`;
  const errorId = `${reactId}-error`;
  const isMobile = useIsMobileViewport();

  const sizeMb = Math.round(maxSizeBytes / (1024 * 1024));
  const effectiveDropSubheading =
    dropSubheading ?? `or choose a file from your computer · up to ${String(sizeMb)} MB`;

  const typeMessage = allowWord
    ? 'PDF or Word only'
    : "This file type isn't supported. Please upload a PDF.";
  const sizeMessage = allowWord
    ? `Max ${String(sizeMb)} MB`
    : `This file is larger than ${String(sizeMb)} MB. Please choose a smaller file.`;

  const raiseError = useCallback(
    (code: UploadPageErrorCode, message: string, file: File): void => {
      setError({ message, file: file.name, code });
      onError?.(code, message);
    },
    [onError],
  );

  const ingest = useCallback(
    (file: File): void => {
      if (!matchesAccept(file, effectiveAccept)) {
        raiseError('type', typeMessage, file);
        return;
      }
      if (file.size > maxSizeBytes) {
        raiseError('size', sizeMessage, file);
        return;
      }
      setError(null);
      onFileSelected(file);
    },
    [effectiveAccept, maxSizeBytes, onFileSelected, raiseError, sizeMessage, typeMessage],
  );

  /**
   * Several files at once (`multiple`). Each file is validated like a
   * single one; any rejection reports its error and drops only that file.
   */
  const ingestMany = useCallback(
    (files: ReadonlyArray<File>): void => {
      const valid: File[] = [];
      let failed = false;
      for (const file of files) {
        if (!matchesAccept(file, effectiveAccept)) {
          raiseError('type', `${file.name} isn't a PDF, so it was skipped.`, file);
          failed = true;
        } else if (file.size > maxSizeBytes) {
          raiseError(
            'size',
            `${file.name} is larger than ${String(sizeMb)} MB, so it was skipped.`,
            file,
          );
          failed = true;
        } else {
          valid.push(file);
        }
      }
      if (valid.length === 0) return;
      if (!failed) setError(null);
      if (onFilesSelected) onFilesSelected(valid);
      else {
        const [first] = valid;
        if (first) onFileSelected(first);
      }
    },
    [effectiveAccept, maxSizeBytes, onFileSelected, onFilesSelected, raiseError, sizeMb],
  );

  const openPicker = useCallback((): void => {
    setError(null);
    inputRef.current?.click();
  }, []);

  const handleChooseClick = useCallback(
    (e: MouseEvent<HTMLButtonElement>): void => {
      e.preventDefault();
      openPicker();
    },
    [openPicker],
  );

  const handleInputChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>): void => {
      if (multiple) {
        const files = Array.from(e.target.files ?? []);
        if (files.length > 0) ingestMany(files);
        e.target.value = '';
        return;
      }
      const file = e.target.files?.[0];
      if (file) {
        ingest(file);
      }
      // Allow re-selecting the same file later.
      e.target.value = '';
    },
    [ingest, ingestMany, multiple],
  );

  const handleDragEnter = useCallback((e: DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    e.stopPropagation();
    dragDepth.current += 1;
    setDragging(true);
  }, []);

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    e.stopPropagation();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) {
      setDragging(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>): void => {
      e.preventDefault();
      e.stopPropagation();
      dragDepth.current = 0;
      setDragging(false);
      if (multiple) {
        const files = Array.from(e.dataTransfer.files ?? []);
        if (files.length > 0) ingestMany(files);
        return;
      }
      const file = e.dataTransfer.files?.[0];
      if (file) {
        ingest(file);
      }
    },
    [ingest, ingestMany, multiple],
  );

  const driveHandler = onPickDrive ?? onConnectDrive;
  const hasSources = showSources;
  const loading = status === 'analyzing' || status === 'converting';
  const showRecent =
    hasSources &&
    !loading &&
    recentTemplates !== undefined &&
    recentTemplates.length > 0 &&
    onPickRecentTemplate !== undefined;

  const dropHeadingText = dragging ? 'Release to upload' : effectiveHeading;
  const noun = allowWord ? 'file' : 'PDF file';
  const inputLabel = `Choose ${noun}${multiple ? 's' : ''}`;
  const regionLabel = allowWord ? 'Upload a file' : 'Upload a PDF';

  return (
    <Body {...rest} ref={ref}>
      <Main>
        <Inner>
          {hideHeader ? null : (
            <HeadingBlock>
              <Heading>{title}</Heading>
              {subtitle ? <Subtitle>{subtitle}</Subtitle> : null}
            </HeadingBlock>
          )}
          {templateBannerTitle ? (
            <TemplateBanner
              $tone={templateBannerTone}
              role={templateBannerTone === 'warning' ? 'alert' : 'status'}
              aria-live="polite"
            >
              <TemplateBannerText>
                Using template: <TemplateBannerStrong>{templateBannerTitle}</TemplateBannerStrong>
              </TemplateBannerText>
              {onClearTemplate ? (
                <TemplateBannerClear type="button" onClick={onClearTemplate}>
                  Clear template
                </TemplateBannerClear>
              ) : null}
            </TemplateBanner>
          ) : null}

          {hasSources ? (
            <Sources role="radiogroup" aria-label="Source">
              <SourceTile
                icon={FileUp}
                label="Upload file"
                {...(isMobile ? {} : { meta: allowWord ? 'PDF, Word' : 'PDF' })}
                stacked={isMobile}
                selected
                onClick={openPicker}
              />
              {onPickTemplate ? (
                <SourceTile
                  icon={LayoutTemplate}
                  label="Template"
                  {...(!isMobile && templateCount !== undefined
                    ? { meta: `${String(templateCount)} saved` }
                    : {})}
                  stacked={isMobile}
                  onClick={onPickTemplate}
                />
              ) : null}
              {driveHandler ? (
                <SourceTile
                  icon={<GDriveLogo size={20} />}
                  label="Google Drive"
                  {...(!isMobile ? { meta: onPickDrive ? 'Docs, Word' : 'Connect' } : {})}
                  stacked={isMobile}
                  onClick={driveHandler}
                />
              ) : null}
              {onScan ? (
                <SourceTile
                  icon={Smartphone}
                  label="Scan with phone"
                  {...(!isMobile ? { meta: 'Camera' } : {})}
                  stacked={isMobile}
                  onClick={onScan}
                />
              ) : null}
            </Sources>
          ) : null}

          {loading ? (
            <LoaderCard
              status={status}
              fileName={analyzingFileName}
              fileSize={analyzingFileSize}
              pages={analyzedPages}
              failed={conversionFailed}
              onCancel={onCancelAnalysis}
              onRetry={onRetryConversion}
            />
          ) : (
            <Dropzone
              $dragging={dragging}
              $error={error !== null}
              onDragEnter={handleDragEnter}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              role="region"
              aria-label={regionLabel}
              {...(error ? { 'aria-describedby': errorId } : {})}
            >
              {error ? (
                <>
                  <DropIcon $error>
                    <AlertCircle size={48} strokeWidth={1.5} aria-hidden />
                  </DropIcon>
                  <AlertInline id={errorId}>{error.message}</AlertInline>
                  {allowWord ? <Mono>{error.file}</Mono> : null}
                  <Actions>
                    <Button variant="secondary" onClick={handleChooseClick}>
                      Choose another
                    </Button>
                    {error.code === 'size' && onPickDrive ? (
                      <Button variant="ghost" size="sm" onClick={onPickDrive}>
                        Try Google Drive
                      </Button>
                    ) : null}
                  </Actions>
                </>
              ) : (
                <>
                  <DropIcon $error={false}>
                    <UploadCloud size={48} strokeWidth={1.5} aria-hidden />
                  </DropIcon>
                  <DropHeading>{dropHeadingText}</DropHeading>
                  {hasSources ? null : <DropSubheading>{effectiveDropSubheading}</DropSubheading>}
                  <Actions>
                    <Button variant="primary" onClick={handleChooseClick}>
                      {effectiveChoose}
                    </Button>
                  </Actions>
                  {hasSources ? (
                    <MetaRow>
                      <IconMeta>
                        <Icon icon={FileIcon} size={14} />
                        {allowWord ? 'PDF, Word' : 'PDF'}
                      </IconMeta>
                      <IconMeta>
                        <Icon icon={Download} size={14} />
                        {`${String(sizeMb)} MB max`}
                      </IconMeta>
                    </MetaRow>
                  ) : null}
                  {!hasSources && (onPickTemplate || onPickDrive || onConnectDrive) ? (
                    <TemplatePromptDivider>
                      {onPickTemplate ? (
                        <TemplatePromptHint>Already have a layout saved?</TemplatePromptHint>
                      ) : null}
                      {onPickTemplate ? (
                        <TemplatePromptLink type="button" onClick={onPickTemplate}>
                          <Icon icon={LayoutTemplate} size={14} />
                          Start from a template
                        </TemplatePromptLink>
                      ) : null}
                      {onPickTemplate && (onPickDrive || onConnectDrive) ? (
                        <TemplatePromptDot aria-hidden>·</TemplatePromptDot>
                      ) : null}
                      {onPickDrive ? (
                        <TemplatePromptLink type="button" onClick={onPickDrive}>
                          <GDriveLogo size={14} />
                          Pick from Google Drive
                        </TemplatePromptLink>
                      ) : null}
                      {!onPickDrive && onConnectDrive ? (
                        <TemplatePromptLink type="button" onClick={onConnectDrive}>
                          <GDriveLogo size={14} />
                          Connect Google Drive
                        </TemplatePromptLink>
                      ) : null}
                    </TemplatePromptDivider>
                  ) : null}
                </>
              )}
              <HiddenFileInput
                ref={inputRef}
                id={inputId}
                type="file"
                accept={effectiveAccept}
                {...(multiple ? { multiple: true } : {})}
                onChange={handleInputChange}
                aria-label={inputLabel}
              />
            </Dropzone>
          )}

          {showRecent ? (
            <section aria-label="Recent templates">
              <Eyebrow>Recent templates</Eyebrow>
              <ChipRow>
                {recentTemplates.map((t) => (
                  <TemplateChip
                    key={t.id}
                    name={t.name}
                    signers={t.signers}
                    onClick={() => onPickRecentTemplate(t.id)}
                  />
                ))}
              </ChipRow>
            </section>
          ) : null}
        </Inner>
      </Main>
    </Body>
  );
});

UploadPage.displayName = 'UploadPage';
