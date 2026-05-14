import { ChevronRight, Camera, Clock, Upload } from 'lucide-react';
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

const SectionHeading = styled.h2`
  font-family: ${({ theme }) => theme.font.mono};
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: var(--fg-3);
  text-transform: uppercase;
  margin: 28px 4px 8px;
`;

const RecentList = styled.ul`
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const RecentItem = styled.li`
  margin: 0;
`;

const RecentBtn = styled.button`
  width: 100%;
  text-align: left;
  border: 1px solid var(--border-1);
  background: #fff;
  border-radius: 14px;
  padding: 12px 14px;
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
  font: inherit;

  &:focus-visible {
    outline: 2px solid var(--indigo-600);
    outline-offset: 2px;
  }
`;

const RecentIcon = styled.span`
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: var(--ink-100);
  color: var(--indigo-600);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
`;

const RecentMeta = styled.div`
  flex: 1;
  min-width: 0;
`;

const RecentTitle = styled.div`
  font-size: 14px;
  font-weight: 600;
  color: var(--fg-1);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const RecentSub = styled.div`
  font-size: 12px;
  color: var(--fg-3);
  margin-top: 2px;
`;

/**
 * Slice-D §2 MEDIUM: a sender re-sending the same agreement should
 * land back at the start screen and see "Recent" so they can jump
 * straight into placing fields, instead of uploading the original
 * PDF again. The parent passes the last N envelopes (we render at
 * most 3 — design ref calls this out at MobileWebSend.jsx:113-134).
 *
 * Tap behaviour is up to the parent (it might fast-forward to
 * `place` after re-uploading the prior file, or just open the
 * envelope on desktop). On mobile today the dashboard at /documents
 * is desktop-only — so tapping a recent envelope navigates to
 * `/document/<id>` and AppShell will keep that user there.
 */
export interface MWRecentEnvelope {
  readonly id: string;
  readonly title: string;
  readonly status: string;
  readonly updatedAt: string;
}

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
  /**
   * At most 3 most-recent envelopes. When empty/undefined, the Recent
   * section hides — start screen looks identical to its old self.
   */
  readonly recent?: ReadonlyArray<MWRecentEnvelope>;
  /** Called when a Recent row is tapped. Receives the envelope id. */
  readonly onPickRecent?: (id: string) => void;
}

// 2026-05-03 (per user): the "From a template" tile was removed. The
// templates list and per-template editor are desktop-only screens, and
// AppShell now redirects every mobile visitor back to /m/send — so the
// tile would have routed into a redirect loop. Picking a template from
// a phone is a future enhancement that needs its own mobile picker;
// for now mobile users start from a phone-side PDF (Upload PDF) or a
// camera capture (Take photo).
function formatRecentDate(iso: string): string {
  // Compact mobile date format: "May 5" / "May 14, 2025" — good enough
  // for a 320 px row. We deliberately avoid a localized weekday because
  // the Recent rows usually span days/weeks; the dashboard already does
  // the deep formatting.
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

function humanStatus(status: string): string {
  switch (status) {
    case 'draft':
      return 'Draft';
    case 'awaiting_others':
    case 'awaiting-others':
      return 'Awaiting signers';
    case 'completed':
      return 'Completed';
    case 'sealing':
      return 'Sealing';
    case 'canceled':
      return 'Canceled';
    default:
      return status;
  }
}

export function MWStart(props: MWStartProps) {
  const { onPickFile, onPickFromDrive, recent, onPickRecent } = props;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const cameraRef = useRef<HTMLInputElement | null>(null);
  // The Drive tile only renders when (a) the feature flag is on and (b)
  // the parent has wired a handler. Both gates must hold so the dark
  // build still tree-shakes the picker via the parent's flag check.
  const showDriveTile = isFeatureEnabled('gdriveIntegration') && Boolean(onPickFromDrive);
  const recentItems = (recent ?? []).slice(0, 3);
  const showRecent = recentItems.length > 0 && Boolean(onPickRecent);

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
      {/* Slice-D §2 LOW (audit fix): `aria-label` was overriding the
          visible <TileTitle>+<TileSub> for screen readers — the
          descriptive sub-label was hidden. Removed; SR users now hear
          both lines, matching what sighted users see. */}
      <Tiles>
        <Tile type="button" onClick={() => inputRef.current?.click()}>
          <TileIcon $accent="var(--indigo-600)" aria-hidden>
            <Upload size={22} />
          </TileIcon>
          <TileText>
            <TileTitle>Upload PDF</TileTitle>
            <TileSub>Pick a file from your phone</TileSub>
          </TileText>
          <ChevronRight size={18} aria-hidden style={{ color: 'var(--fg-4)' }} />
        </Tile>
        <Tile type="button" onClick={() => cameraRef.current?.click()}>
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
          <Tile type="button" onClick={onPickFromDrive}>
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
      {/* Slice-D §2 recommendation: older iOS reports the PDF mime as
          `application/octet-stream` — defensive fallback keeps the
          picker functional on those devices. */}
      <HiddenFileInput
        ref={inputRef}
        type="file"
        accept="application/pdf,application/octet-stream"
        onChange={handleFile}
        aria-label="PDF file"
      />
      <HiddenFileInput
        ref={cameraRef}
        type="file"
        accept="image/*,application/pdf,application/octet-stream"
        capture="environment"
        onChange={handleFile}
        aria-label="Camera capture"
      />
      {showRecent && (
        <>
          <SectionHeading>Recent</SectionHeading>
          <RecentList aria-label="Recent envelopes">
            {recentItems.map((env) => (
              <RecentItem key={env.id}>
                <RecentBtn type="button" onClick={() => onPickRecent?.(env.id)}>
                  <RecentIcon aria-hidden>
                    <Clock size={18} />
                  </RecentIcon>
                  <RecentMeta>
                    <RecentTitle>{env.title}</RecentTitle>
                    <RecentSub>
                      {humanStatus(env.status)}
                      {env.updatedAt ? ` · ${formatRecentDate(env.updatedAt)}` : ''}
                    </RecentSub>
                  </RecentMeta>
                  <ChevronRight size={18} aria-hidden style={{ color: 'var(--fg-4)' }} />
                </RecentBtn>
              </RecentItem>
            ))}
          </RecentList>
        </>
      )}
    </Wrap>
  );
}
