import { useRef, useState } from 'react';
import type { ChangeEvent, DragEvent, KeyboardEvent, ReactNode } from 'react';
import { Button } from '@/components/Button';
import {
  Actions,
  DropZone,
  ErrorText,
  FileName,
  HiddenInput,
  PreviewRow,
  Thumb,
  Wrap,
} from './UploadMode.styles';
import type { UploadModeProps } from './UploadMode.types';

const DEFAULT_MAX_BYTES = 2 * 1024 * 1024;
const ACCEPTED_TYPES = ['image/png', 'image/jpeg'];

export function UploadMode(props: UploadModeProps) {
  const { onCommit, onCancel, maxBytes = DEFAULT_MAX_BYTES } = props;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [preview, setPreview] = useState<{ url: string; name: string } | null>(null);

  const openPicker = (): void => {
    inputRef.current?.click();
  };

  const handleFile = (file: File): void => {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError('Unsupported file type. Please upload a PNG or JPEG image.');
      return;
    }
    if (file.size > maxBytes) {
      setError('File is too large.');
      return;
    }
    setError(null);
    const reader = new FileReader();
    reader.onload = () => {
      const { result } = reader;
      if (typeof result !== 'string') return;
      setPreview({ url: result, name: file.name });
      onCommit({ kind: 'upload', pngDataUrl: result, fileName: file.name });
    };
    reader.onerror = () => {
      setError('Could not read file.');
    };
    reader.readAsDataURL(file);
  };

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>): void => {
    const { files } = e.target;
    if (!files || files.length === 0) return;
    const file = files[0];
    if (!file) return;
    handleFile(file);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openPicker();
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
  };

  const handleDragEnter = (e: DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;
    const file = files[0];
    if (!file) return;
    handleFile(file);
  };

  let errorNode: ReactNode = null;
  if (error !== null) {
    errorNode = <ErrorText role="alert">{error}</ErrorText>;
  }

  let previewNode: ReactNode = null;
  if (preview !== null) {
    previewNode = (
      <PreviewRow data-testid="upload-mode-preview">
        <Thumb src={preview.url} alt="" />
        <FileName>{preview.name}</FileName>
      </PreviewRow>
    );
  }

  return (
    <Wrap>
      <DropZone
        role="button"
        tabIndex={0}
        aria-label="Upload a signature image. PNG or JPEG."
        $isDragging={isDragging}
        onClick={openPicker}
        onKeyDown={handleKeyDown}
        onDragOver={handleDragOver}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <span>Drop a PNG or JPEG here, or click to choose a file.</span>
        <HiddenInput
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg"
          onChange={handleInputChange}
          data-testid="upload-mode-input"
        />
      </DropZone>
      {errorNode}
      {previewNode}
      <Actions>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </Actions>
    </Wrap>
  );
}
