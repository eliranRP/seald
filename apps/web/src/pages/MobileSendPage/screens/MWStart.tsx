import { ChevronRight, Camera, Upload } from 'lucide-react';
import styled from 'styled-components';
import { useRef } from 'react';
import { isFeatureEnabled } from 'shared';
import { GDriveLogo } from '@/features/gdriveImport/GDriveLogo';

const Wrap = styled.div`
  padding: 8px 16px 24px;
`;

const Title = styled.h1`
  font-family: ${({ theme }) => theme.font.serif};
  font-size: 30px;
  font-weight: 500;
  color: var(--fg-1);
  letter-spacing: -0.02em;
  line-height: 1.1;
  padding: 8px 4px 4px;
  margin: 0;
`;

const Subtitle = styled.div`
  font-size: 14px;
  color: var(--fg-3);
  padding: 0 4px 18px;
`;

const Tiles = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

const Tile = styled.button`
  text-align: left;
  border: 1px solid var(--border-1);
  background: #fff;
  border-radius: 18px;
  padding: 16px;
  display: flex;
  align-items: center;
  gap: 14px;
  cursor: pointer;
  box-shadow: 0 1px 2px rgba(11, 18, 32, 0.04);
  font: inherit;

  &:focus-visible {
    outline: 2px solid var(--indigo-600);
    outline-offset: 3px;
  }
`;

const TileIcon = styled.span<{ $accent: string }>`
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: var(--ink-100);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: ${({ $accent }) => $accent};
`;

const TileText = styled.div`
  flex: 1;
  min-width: 0;
`;

const TileTitle = styled.div`
  font-size: 15px;
  font-weight: 600;
  color: var(--fg-1);
`;

const TileSub = styled.div`
  font-size: 13px;
  color: var(--fg-3);
  margin-top: 2px;
`;

const HiddenFileInput = styled.input`
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  border: 0;
  white-space: nowrap;
`;

export interface MWStartProps {
  // Returns Promise<void> so the parent can run async work (e.g. image →
  // PDF conversion) without TS complaining about the floating promise.
  readonly onPickFile: (file: File) => void | Promise<void>;
  /**
   * Tapping the "Import from Google Drive" tile. When undefined, the
   * tile hides — feature flag off, or the parent page hasn't wired the
   * Drive picker yet.
   */
  readonly onPickFromDrive?: () => void;
}

// 2026-05-03 (per user): the "From a template" tile was removed. The
// templates list and per-template editor are desktop-only screens, and
// AppShell now redirects every mobile visitor back to /m/send — so the
// tile would have routed into a redirect loop. Picking a template from
// a phone is a future enhancement that needs its own mobile picker;
// for now mobile users start from a phone-side PDF (Upload PDF) or a
// camera capture (Take photo).
export function MWStart(props: MWStartProps) {
  const { onPickFile, onPickFromDrive } = props;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const cameraRef = useRef<HTMLInputElement | null>(null);
  // The Drive tile only renders when (a) the feature flag is on and (b)
  // the parent has wired a handler. Both gates must hold so the dark
  // build still tree-shakes the picker via the parent's flag check.
  const showDriveTile = isFeatureEnabled('gdriveIntegration') && Boolean(onPickFromDrive);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      // The parent may run async work (image → PDF). We deliberately
      // don't await — the picker shouldn't block the input element
      // freeing its file handle. Errors surface as inline alerts in the
      // parent, never as unhandled promise rejections.
      const result = onPickFile(selectedFile);
      if (result instanceof Promise) {
        result.catch(() => {
          /* parent surfaces the failure via fileError state */
        });
      }
    }
    // Reset so re-picking the same file fires onChange again.
    e.target.value = '';
  };

  return (
    <Wrap>
      <Title>New document</Title>
      <Subtitle>How do you want to start?</Subtitle>
      <Tiles>
        <Tile type="button" onClick={() => inputRef.current?.click()} aria-label="Upload PDF">
          <TileIcon $accent="var(--indigo-600)" aria-hidden>
            <Upload size={22} />
          </TileIcon>
          <TileText>
            <TileTitle>Upload PDF</TileTitle>
            <TileSub>Pick a file from your phone</TileSub>
          </TileText>
          <ChevronRight size={18} aria-hidden style={{ color: 'var(--fg-4)' }} />
        </Tile>
        <Tile type="button" onClick={() => cameraRef.current?.click()} aria-label="Take photo">
          <TileIcon $accent="var(--ink-900)" aria-hidden>
            <Camera size={22} />
          </TileIcon>
          <TileText>
            <TileTitle>Take photo</TileTitle>
            <TileSub>Scan a paper document</TileSub>
          </TileText>
          <ChevronRight size={18} aria-hidden style={{ color: 'var(--fg-4)' }} />
        </Tile>
        {showDriveTile && (
          <Tile type="button" onClick={onPickFromDrive} aria-label="Import from Google Drive">
            <TileIcon $accent="var(--indigo-600)" aria-hidden>
              <GDriveLogo size={22} />
            </TileIcon>
            <TileText>
              <TileTitle>Import from Google Drive</TileTitle>
              <TileSub>Pick a file from your Drive</TileSub>
            </TileText>
            <ChevronRight size={18} aria-hidden style={{ color: 'var(--fg-4)' }} />
          </Tile>
        )}
      </Tiles>
      <HiddenFileInput
        ref={inputRef}
        type="file"
        accept="application/pdf"
        onChange={handleFile}
        aria-label="PDF file"
      />
      <HiddenFileInput
        ref={cameraRef}
        type="file"
        accept="image/*,application/pdf"
        capture="environment"
        onChange={handleFile}
        aria-label="Camera capture"
      />
    </Wrap>
  );
}
