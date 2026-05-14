import styled, { css } from 'styled-components';

/**
 * Page wrapper. The TemplateFlowHeader sits flush at the top (no padding
 * around it), then the step body gets generous breathing room. Mirrors
 * the Design-Guide `UseTemplate.jsx` layout: header → centered narrow
 * column for steps 1 + 2.
 */
export const Page = styled.div`
  display: flex;
  flex-direction: column;
  min-height: 100%;
  background: ${({ theme }) => theme.color.bg.app};
`;

export const StepBody = styled.main`
  flex: 1;
  padding: ${({ theme }) => theme.space[10]} ${({ theme }) => theme.space[12]}
    ${({ theme }) => theme.space[20]};
`;

/**
 * Step body's inner column. Standardized on 960 px (the same width as
 * the embedded UploadPage's Inner) so content width doesn't jump when
 * the user toggles between the "Use saved document" and "Upload a new
 * one" segmented control. Audit A · UseTemplatePage L-18.
 *
 * The `$wide` prop is retained as a deprecated no-op so any legacy
 * callers continue to compile; both branches now render the same 960 px
 * column.
 */
export const StepInner = styled.div<{ $wide?: boolean }>`
  margin: 0 auto;
  max-width: 960px;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[6]};
`;

export const StepEyebrow = styled.div`
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.fg[3]};
`;

export const StepTitle = styled.h1`
  font-family: ${({ theme }) => theme.font.serif};
  font-size: 36px;
  font-weight: 500;
  letter-spacing: -0.02em;
  line-height: 1.15;
  margin: 0;
  color: ${({ theme }) => theme.color.fg[1]};
`;

export const StepLede = styled.p`
  font-size: 14px;
  color: ${({ theme }) => theme.color.fg[3]};
  margin: 0;
  line-height: 1.55;
  max-width: 560px;
`;

export const StepFooter = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${({ theme }) => theme.space[4]};
`;

export const FooterHint = styled.span`
  font-size: 12px;
  color: ${({ theme }) => theme.color.fg[3]};
`;

/* ---------------- Step 1: Signers picker trigger ---------------- */

export const PickerWrap = styled.div`
  position: relative;
`;

export const PickerTrigger = styled.button<{ $open: boolean }>`
  width: 100%;
  text-align: left;
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]};
  padding: ${({ theme }) => `${theme.space[3]} ${theme.space[4]}`};
  background: ${({ theme }) => theme.color.paper};
  border: 1px solid
    ${({ $open, theme }) => ($open ? theme.color.indigo[400] : theme.color.border[1])};
  border-radius: ${({ theme }) => theme.radius.lg};
  cursor: pointer;
  font-family: inherit;
  transition:
    border-color ${({ theme }) => theme.motion.durFast} ${({ theme }) => theme.motion.easeStandard},
    box-shadow ${({ theme }) => theme.motion.durFast} ${({ theme }) => theme.motion.easeStandard};

  ${({ $open, theme }) =>
    $open &&
    css`
      /* Picker-open focus glow. Uses the canonical theme focus shadow
         instead of the bespoke rgba literal so the indigo-tinted halo
         stays in sync with every other focus state on the surface.
         Audit A · UseTemplatePage M-17. */
      box-shadow: ${theme.shadow.focus};
    `}
`;

export const PickerPlaceholder = styled.span`
  flex: 1;
  font-size: 14px;
  color: ${({ theme }) => theme.color.fg[3]};
`;

export const PickerChips = styled.div`
  flex: 1;
  display: flex;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.space[2]};
  min-width: 0;
`;

export const SignerChip = styled.span`
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
  padding: 3px 10px 3px 4px;
  background: ${({ theme }) => theme.color.ink[50]};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.pill};
  /* Rounded 12.5 → 13 (caption) so the type scale stays on the theme.
     Audit A · UseTemplatePage M-16. */
  font-size: ${({ theme }) => theme.font.size.caption};
  color: ${({ theme }) => theme.color.fg[1]};
`;

export const SignerChipDot = styled.span<{ $color: string }>`
  width: 16px;
  height: 16px;
  border-radius: ${({ theme }) => theme.radius.pill};
  background: ${({ $color }) => $color};
  color: ${({ theme }) => theme.color.fg.inverse};
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 8.5px;
  font-weight: 700;
`;

export const PickerPanel = styled.div`
  position: absolute;
  top: calc(100% + ${({ theme }) => theme.space[2]});
  left: 0;
  right: 0;
  z-index: ${({ theme }) => theme.z.overlay};
  background: ${({ theme }) => theme.color.paper};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.lg};
  box-shadow: ${({ theme }) => theme.shadow.lg};
  overflow: hidden;
  max-height: 380px;
  display: flex;
  flex-direction: column;
`;

/* ---------------- Step 2: Document choice ---------------- */

export const DocumentTitleRow = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]};
  margin-bottom: ${({ theme }) => theme.space[5]};
`;

export const DocumentTitle = styled.h2`
  flex: 1;
  font-family: ${({ theme }) => theme.font.serif};
  font-size: 28px;
  font-weight: 500;
  letter-spacing: -0.02em;
  margin: 0;
  color: ${({ theme }) => theme.color.fg[1]};
`;

export const InfoIconButton = styled.button`
  all: unset;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: ${({ theme }) => theme.radius.pill};
  color: ${({ theme }) => theme.color.fg[3]};
  cursor: help;
  &:hover,
  &:focus-visible {
    color: ${({ theme }) => theme.color.fg[1]};
    background: ${({ theme }) => theme.color.ink[50]};
  }
`;

export const Segmented = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0;
  background: ${({ theme }) => theme.color.ink[100]};
  padding: 4px;
  border-radius: ${({ theme }) => theme.radius.lg};
  margin-bottom: ${({ theme }) => theme.space[6]};
`;

export const SegmentedButton = styled.button<{ $active: boolean }>`
  padding: ${({ theme }) => `${theme.space[3]} ${theme.space[4]}`};
  border: none;
  border-radius: ${({ theme }) => theme.radius.md};
  cursor: pointer;
  font-family: inherit;
  /* Rounded 13.5 → 14 (bodySm) so the type scale stays on the theme.
     Audit A · UseTemplatePage M-16. */
  font-size: ${({ theme }) => theme.font.size.bodySm};
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: ${({ theme }) => theme.space[2]};
  transition:
    background ${({ theme }) => theme.motion.durFast} ${({ theme }) => theme.motion.easeStandard},
    color ${({ theme }) => theme.motion.durFast} ${({ theme }) => theme.motion.easeStandard},
    box-shadow ${({ theme }) => theme.motion.durFast} ${({ theme }) => theme.motion.easeStandard};

  ${({ $active, theme }) =>
    $active
      ? css`
          background: ${theme.color.paper};
          color: ${theme.color.fg[1]};
          box-shadow: ${theme.shadow.xs};
        `
      : css`
          background: transparent;
          color: ${theme.color.fg[3]};
        `}
`;

export const SavedDocCard = styled.div`
  background: ${({ theme }) => theme.color.paper};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.lg};
  padding: ${({ theme }) => theme.space[5]};
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[5]};
`;

/**
 * Mini paper-stack preview — matches the saved-doc cover in the
 * Design-Guide (`UseTemplate.jsx:298-301`). Two faint pages tucked
 * behind the main one, so the card reads as a stack of pages rather
 * than a flat thumbnail.
 */
export const SavedDocCover = styled.div`
  position: relative;
  width: 56px;
  height: 72px;
  flex-shrink: 0;
`;

export const SavedDocStack = styled.span`
  position: absolute;
  inset: 0;
  background: ${({ theme }) => theme.color.paper};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.xs};
  box-shadow: ${({ theme }) => theme.shadow.xs};
  &:nth-child(1) {
    transform: translate(4px, 4px) rotate(2deg);
  }
  &:nth-child(2) {
    transform: translate(2px, 2px) rotate(-1deg);
  }
`;

export const SavedDocPaper = styled.span`
  position: absolute;
  inset: 0;
  background: ${({ theme }) => theme.color.paper};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.xs};
  padding: 7px 6px;
  box-shadow: ${({ theme }) => theme.shadow.paper};
  display: flex;
  flex-direction: column;
  gap: 3px;
`;

export const SavedDocStripe = styled.span`
  height: 3px;
  border-radius: 2px;
  background: ${({ theme }) => theme.color.indigo[300]};
  width: 62%;
`;

export const SavedDocLine = styled.span<{ $width: number }>`
  height: 1.8px;
  border-radius: 1px;
  background: ${({ theme }) => theme.color.ink[200]};
  width: ${({ $width }) => `${$width}%`};
`;

export const SavedDocBody = styled.div`
  flex: 1;
  min-width: 0;
`;

export const SavedDocName = styled.div`
  font-size: 14px;
  font-weight: 600;
  color: ${({ theme }) => theme.color.fg[1]};
`;

export const SavedDocMeta = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.space[3]};
  margin-top: 4px;
  font-size: 12px;
  color: ${({ theme }) => theme.color.fg[3]};

  & > span {
    white-space: nowrap;
  }
`;

/* ---------------- Tooltip (Design-Guide InfoTip) ---------------- */

export const TooltipWrap = styled.span`
  position: relative;
  display: inline-flex;
`;

export const TooltipBubble = styled.span`
  position: absolute;
  bottom: calc(100% + ${({ theme }) => theme.space[2]});
  left: 50%;
  transform: translateX(-50%);
  background: ${({ theme }) => theme.color.ink[900]};
  color: ${({ theme }) => theme.color.fg.inverse};
  /* Rounded 11.5 → 11 (micro) so the type scale stays on the theme.
     Audit A · UseTemplatePage M-16. */
  font-size: ${({ theme }) => theme.font.size.micro};
  padding: 7px 10px;
  border-radius: ${({ theme }) => theme.radius.sm};
  white-space: nowrap;
  z-index: ${({ theme }) => theme.z.toast};
  box-shadow: ${({ theme }) => theme.shadow.md};
  pointer-events: none;
`;

/* ---------------- Not-found surface ---------------- */

export const NotFoundCard = styled.section`
  background: ${({ theme }) => theme.color.paper};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.lg};
  padding: ${({ theme }) => theme.space[10]};
  text-align: center;
  margin: ${({ theme }) => theme.space[12]} auto 0;
  max-width: 640px;
`;

export const NotFoundTitle = styled.h1`
  font-family: ${({ theme }) => theme.font.serif};
  font-size: 28px;
  font-weight: 500;
  letter-spacing: -0.02em;
  margin: 0 0 ${({ theme }) => theme.space[3]};
  color: ${({ theme }) => theme.color.fg[1]};
`;

export const NotFoundLede = styled.p`
  font-size: 14px;
  color: ${({ theme }) => theme.color.fg[3]};
  margin: 0 0 ${({ theme }) => theme.space[5]};
  line-height: 1.55;
`;
