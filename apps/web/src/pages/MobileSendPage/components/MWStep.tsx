import { ChevronLeft } from 'lucide-react';
import {
  StepBackBtn,
  StepDot,
  StepDots,
  StepEyebrow,
  StepLabelGroup,
  Stepper,
  StepTitle,
} from '../MobileSendPage.styles';

export interface MWStepProps {
  readonly step: number;
  readonly total?: number;
  readonly label: string;
  readonly onBack: (() => void) | null;
}

/**
 * Top stepper bar for the mobile-web sender flow. Mirrors the Design-Guide
 * `MWStep` component:
 *   ⟵  ───  Step N of 6 / Heading                ●●●●● + dot row
 */
export function MWStep(props: MWStepProps) {
  const { step, total = 6, label, onBack } = props;
  return (
    <Stepper aria-label={`Step ${step} of ${total}`}>
      {onBack && (
        <StepBackBtn type="button" onClick={onBack} aria-label="Back">
          <ChevronLeft size={20} aria-hidden />
        </StepBackBtn>
      )}
      <StepLabelGroup>
        <StepEyebrow>
          Step {step} of {total}
        </StepEyebrow>
        <StepTitle>{label}</StepTitle>
      </StepLabelGroup>
      <StepDots aria-hidden>
        {Array.from({ length: total }, (_, i) => (
          <StepDot key={`step-dot-${i + 1}`} $active={i + 1 === step} $reached={i + 1 <= step} />
        ))}
      </StepDots>
    </Stepper>
  );
}
