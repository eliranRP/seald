import { Check } from 'lucide-react';
import { GDriveLogo } from '@/features/gdriveImport/GDriveLogo';
import {
  Card,
  DoneCheck,
  DriveIconBox,
  FlowArrow,
  FlowArrows,
  ImportSub,
  ImportTitle,
  InnerDot,
  Overlay,
  PdfDoc,
  PdfLine,
  ProgressFill,
  ProgressTrack,
  ScanLine,
  Step,
  StepDot,
  Steps,
  Visual,
} from './ImportOverlay.styles';

/**
 * Import phase driven by `useDriveImport`:
 * - `fetching`   = starting (POSTing conversion job)
 * - `converting` = running (polling Gotenberg)
 * - `preparing`  = final prep before handing off
 * - `done`       = all steps green, auto-closes after 800ms
 */
export type ImportPhase = 'fetching' | 'converting' | 'preparing' | 'done';

export interface ImportOverlayProps {
  /** When false the overlay is not rendered at all. */
  readonly open: boolean;
  /** Current phase of the import pipeline. */
  readonly phase: ImportPhase;
  /** Original file name displayed under the title. */
  readonly fileName: string;
}

const STEPS = [
  { id: 'fetch', label: 'Fetching from Google Drive' },
  { id: 'convert', label: 'Converting to PDF' },
  { id: 'prepare', label: 'Preparing document' },
] as const;

function stepState(phase: ImportPhase, idx: number): 'pending' | 'active' | 'done' {
  if (phase === 'done') return 'done';
  const activeIdx = phase === 'fetching' ? 0 : phase === 'converting' ? 1 : 2;
  if (idx < activeIdx) return 'done';
  if (idx === activeIdx) return 'active';
  return 'pending';
}

function progressPct(phase: ImportPhase): number {
  if (phase === 'fetching') return 25;
  if (phase === 'converting') return 65;
  if (phase === 'preparing') return 85;
  return 100;
}

function CheckIcon({ size = 14 }: { readonly size?: number }) {
  return <Check size={size} strokeWidth={3} color="#fff" />;
}

/**
 * Full-screen animated overlay shown during Google Drive file import.
 * Mirrors the visual language of `SendingOverlay` (same z-index, radial
 * gradient backdrop, progress bar with shimmer, step checklist with
 * pulse-ring active state and pop-in green checks).
 *
 * The component is purely presentational --- phase transitions are driven
 * by the caller (MobileSendPage / UploadRoute) mapping `useDriveImport`
 * state onto `ImportPhase`.
 */
export function ImportOverlay({ open, phase, fileName }: ImportOverlayProps) {
  if (!open) return null;

  const pct = progressPct(phase);

  return (
    <Overlay role="dialog" aria-label="Importing from Google Drive">
      <Card>
        {phase === 'done' ? (
          <>
            <DoneCheck aria-hidden>
              <CheckIcon size={28} />
            </DoneCheck>
            <ImportTitle>Import complete</ImportTitle>
            <ImportSub>Your document is ready to edit</ImportSub>
          </>
        ) : (
          <>
            {/* Visual: Drive icon -> dot cascade -> PDF with scanning beam */}
            <Visual aria-hidden>
              <DriveIconBox>
                <GDriveLogo size={32} />
              </DriveIconBox>
              <FlowArrows>
                <FlowArrow $delay={0} />
                <FlowArrow $delay={0.2} />
                <FlowArrow $delay={0.4} />
              </FlowArrows>
              <PdfDoc>
                <ScanLine />
                <PdfLine />
                <PdfLine $short />
                <PdfLine />
                <PdfLine />
                <PdfLine $short />
                <PdfLine />
              </PdfDoc>
            </Visual>

            <ImportTitle>Importing from Google Drive</ImportTitle>
            <ImportSub>{fileName}</ImportSub>

            {/* Progress bar with shimmer */}
            <ProgressTrack>
              <ProgressFill $pct={pct} />
            </ProgressTrack>

            {/* Step checklist */}
            <Steps aria-live="polite">
              {STEPS.map((step, i) => {
                const state = stepState(phase, i);
                return (
                  <Step key={step.id} $state={state} $delay={i * 80}>
                    <StepDot $state={state}>
                      {state === 'done' && <CheckIcon size={12} />}
                      {state === 'active' && <InnerDot />}
                    </StepDot>
                    <span>{step.label}</span>
                  </Step>
                );
              })}
            </Steps>
          </>
        )}
      </Card>
    </Overlay>
  );
}
