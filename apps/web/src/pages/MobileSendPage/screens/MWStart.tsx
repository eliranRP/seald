import { ChevronRight, LayoutTemplate, Camera, Upload } from 'lucide-react';
import styled from 'styled-components';
import { useRef } from 'react';

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
  readonly onPickFile: (file: File) => void;
}

export function MWStart(props: MWStartProps) {
  const { onPickFile } = props;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const cameraRef = useRef<HTMLInputElement | null>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const f = e.target.files?.[0];
    if (f) onPickFile(f);
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
        <Tile type="button" disabled aria-label="From a template (coming soon)">
          <TileIcon $accent="var(--success-700)" aria-hidden>
            <LayoutTemplate size={22} />
          </TileIcon>
          <TileText>
            <TileTitle>From a template</TileTitle>
            <TileSub>Reuse a saved layout</TileSub>
          </TileText>
          <ChevronRight size={18} aria-hidden style={{ color: 'var(--fg-4)' }} />
        </Tile>
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
