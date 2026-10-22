import { forwardRef, useCallback, useEffect, useId, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent, JSX, MouseEvent } from 'react';
import { LayoutTemplate, UploadCloud } from 'lucide-react';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { GDriveLogo } from '@/features/gdriveImport/GDriveLogo';
import type { UploadPageErrorCode, UploadPageProps } from './UploadPage.types';
import {
  Actions,
  Body,
  DropHeading,
  DropSubheading,
  Dropzone,
  ErrorText,
  Heading,
  HeadingBlock,
  HiddenFileInput,
  IconCircle,
  Inner,
  LoaderCard,
  LoaderLine,
  LoaderPage,
  LoaderProgress,
  LoaderScan,
  LoaderStep,
  LoaderStepDot,
  LoaderSteps,
  LoaderSubtitle,
  LoaderTitle,
  Main,
  Subtitle,
  TemplateBanner,
  TemplateBannerClear,
  TemplateBannerStrong,
  TemplateBannerText,
  TemplatePromptDivider,
  TemplatePromptDot,
  TemplatePromptHint,
  TemplatePromptLink,
} from './UploadPage.styles';

const DEFAULT_MAX_BYTES = 25 * 1024 * 1024;
const DEFAULT_ACCEPT = 'application/pdf';
const DEFAULT_TITLE = 'Start a new document';
const DEFAULT_SUBTITLE =
  "Drop a PDF, or choose from your computer. We'll walk you through placing signature fields and sending it off.";
const DEFAULT_DROP_HEADING = 'Drop your PDF here';
const DEFAULT_CHOOSE = 'Choose file';
const MULTI_SUBTITLE =
  "Drop one or more PDFs, or choose them from your computer. We'll walk you through placing signature fields and sending them off.";
const MULTI_DROP_HEADING = 'Drop your PDFs here';
const MULTI_CHOOSE = 'Choose files';

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

/* ---- Internal ---- */

const ANALYZING_STEPS: ReadonlyArray<string> = [
  'Reading PDF bytes',
  'Extracting pages',
  'Detecting fillable regions',
  'Preparing canvas',
];

function AnalyzingLoader({ fileName }: { readonly fileName?: string | undefined }): JSX.Element {
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    // Cycle through steps; the caller is responsible for unmounting
    // the loader once the real async work finishes — we don't try to
    // sync with actual progress (which is already complete by the
    // time jsdom / a real browser renders a big PDF).
    const id = window.setInterval(() => {
      setActiveStep((n) => (n + 1) % ANALYZING_STEPS.length);
    }, 650);
    return () => window.clearInterval(id);
  }, []);

  return (
    <LoaderCard role="status" aria-live="polite">
      <LoaderPage aria-hidden>
        <LoaderLine $width="70%" />
        <LoaderLine $width="90%" />
        <LoaderLine $width="82%" />
        <LoaderLine $width="76%" />
        <LoaderLine $width="60%" />
        <LoaderLine $width="85%" />
        <LoaderLine $width="72%" />
        <LoaderScan />
      </LoaderPage>
      <LoaderTitle>Analyzing your document</LoaderTitle>
      <LoaderSubtitle>
        {fileName !== undefined && fileName.length > 0 ? fileName : 'Looking for signature fields…'}
      </LoaderSubtitle>
      <LoaderProgress aria-hidden />
      <LoaderSteps>
        {ANALYZING_STEPS.map((label, i) => {
          const active = i === activeStep;
          const done = i < activeStep;
          return (
            <LoaderStep key={label} $active={active}>
              <LoaderStepDot $active={active} $done={done} aria-hidden />
              {label}
            </LoaderStep>
          );
        })}
      </LoaderSteps>
    </LoaderCard>
  );
}

export const UploadPage = forwardRef<HTMLDivElement, UploadPageProps>((props, ref) => {
  const {
    onFileSelected,
    onFilesSelected,
    multiple = false,
    onError,
    title = DEFAULT_TITLE,
    subtitle = multiple ? MULTI_SUBTITLE : DEFAULT_SUBTITLE,
    hideHeader = false,
    dropHeading = multiple ? MULTI_DROP_HEADING : DEFAULT_DROP_HEADING,
    dropSubheading,
    chooseLabel = multiple ? MULTI_CHOOSE : DEFAULT_CHOOSE,
    accept = DEFAULT_ACCEPT,
    maxSizeBytes = DEFAULT_MAX_BYTES,
    status = 'idle',
    analyzingFileName,
    templateBannerTitle,
    templateBannerTone = 'info',
    onClearTemplate,
    onPickTemplate,
    onPickDrive,
    onConnectDrive,
    ...rest
  } = props;

  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reactId = useId();
  const inputId = `${reactId}-file`;
  const errorId = `${reactId}-error`;

  const sizeMb = Math.round(maxSizeBytes / (1024 * 1024));
  const effectiveDropSubheading =
    dropSubheading ?? `or choose a file from your computer · up to ${sizeMb} MB`;

  const raiseError = useCallback(
    (code: UploadPageErrorCode, message: string): void => {
      setError(message);
      onError?.(code, message);
    },
    [onError],
  );

  const ingest = useCallback(
    (file: File): void => {
      if (!matchesAccept(file, accept)) {
        raiseError('type', `This file type isn't supported. Please upload a PDF.`);
        return;
      }
      if (file.size > maxSizeBytes) {
        raiseError('size', `This file is larger than ${sizeMb} MB. Please choose a smaller file.`);
        return;
      }
      setError(null);
      onFileSelected(file);
    },
    [accept, maxSizeBytes, onFileSelected, raiseError, sizeMb],
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
        if (!matchesAccept(file, accept)) {
          raiseError('type', `${file.name} isn't a PDF, so it was skipped.`);
          failed = true;
        } else if (file.size > maxSizeBytes) {
          raiseError('size', `${file.name} is larger than ${sizeMb} MB, so it was skipped.`);
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
    [accept, maxSizeBytes, onFileSelected, onFilesSelected, raiseError, sizeMb],
  );

  const openPicker = useCallback((): void => {
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

  return (
    <Body {...rest} ref={ref}>
      <Main>
        <Inner>
          {hideHeader ? null : (
            <HeadingBlock>
              <Heading>{title}</Heading>
              <Subtitle>{subtitle}</Subtitle>
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
          {status === 'analyzing' ? (
            <AnalyzingLoader fileName={analyzingFileName} />
          ) : (
            <Dropzone
              $dragging={dragging}
              onDragEnter={handleDragEnter}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              role="region"
              aria-label="Upload a PDF"
              {...(error ? { 'aria-describedby': errorId } : {})}
            >
              <IconCircle>
                <UploadCloud size={28} strokeWidth={1.75} aria-hidden />
              </IconCircle>
              <DropHeading>{dropHeading}</DropHeading>
              <DropSubheading>{effectiveDropSubheading}</DropSubheading>
              <Actions>
                <Button variant="primary" onClick={handleChooseClick}>
                  {chooseLabel}
                </Button>
              </Actions>
              {error ? <ErrorText id={errorId}>{error}</ErrorText> : null}
              {/*
                Secondary-actions row. Hosts the "Start from a template"
                CTA and (when the gdrive flag is on) the "Pick from /
                Connect Google Drive" CTA side-by-side. Pre-2026-05-04
                Drive lived in a wide standalone card below the
                dropzone — too much visual weight relative to the
                primary "Choose file" affordance. The compact-row
                composition matches the design feedback and treats
                Drive as a peer of templates.
              */}
              {onPickTemplate || onPickDrive || onConnectDrive ? (
                <TemplatePromptDivider>
                  {onPickTemplate ? (
                    <TemplatePromptHint>Already have a layout saved?</TemplatePromptHint>
                  ) : null}
                  {onPickTemplate ? (
                    // The parent Dropzone has no onClick handler so
                    // calling `stopPropagation` here was a code-smell
                    // no-op. Removed per Audit A · UploadPage L-7.
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
              <HiddenFileInput
                ref={inputRef}
                id={inputId}
                type="file"
                accept={accept}
                {...(multiple ? { multiple: true } : {})}
                onChange={handleInputChange}
                aria-label={multiple ? 'Choose PDF files' : 'Choose PDF file'}
              />
            </Dropzone>
          )}
        </Inner>
      </Main>
    </Body>
  );
});

UploadPage.displayName = 'UploadPage';
