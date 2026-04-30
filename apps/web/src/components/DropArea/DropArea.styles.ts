import styled, { css } from 'styled-components';

/**
 * Drop-area visuals. A duplicate of the dropzone styling that lives
 * inside `apps/web/src/pages/UploadPage/UploadPage.styles.ts`. The
 * lint config blocks `components/**` from importing L4 page modules,
 * so the styles are duplicated rather than re-exported. Both copies
 * MUST stay visually identical — the signer upload page and any
 * embedded surface (the templates wizard's Step 2 today) share the
 * "drop a PDF" affordance, and a divergence would feel like a context
 * switch to the user.
 */
export const Dropzone = styled.div<{ readonly $dragging: boolean }>`
  background: ${({ theme }) => theme.color.bg.surface};
  border: 1.5px dashed ${({ theme }) => theme.color.indigo[300]};
  border-radius: ${({ theme }) => theme.radius['2xl']};
  padding: ${({ theme }) => theme.space[16]} ${({ theme }) => theme.space[8]};
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: ${({ theme }) => theme.space[5]};
  transition:
    background ${({ theme }) => theme.motion.durBase} ${({ theme }) => theme.motion.easeStandard},
    border-color ${({ theme }) => theme.motion.durBase} ${({ theme }) => theme.motion.easeStandard};

  ${({ $dragging, theme }) =>
    $dragging &&
    css`
      background: ${theme.color.indigo[50]};
      border-color: ${theme.color.indigo[500]};
    `}

  &:focus-visible {
    outline: none;
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
`;

export const IconCircle = styled.div`
  width: 64px;
  height: 64px;
  border-radius: ${({ theme }) => theme.radius.pill};
  background: ${({ theme }) => theme.color.indigo[50]};
  color: ${({ theme }) => theme.color.indigo[600]};
  display: inline-flex;
  align-items: center;
  justify-content: center;
`;

export const DropHeading = styled.div`
  font-family: ${({ theme }) => theme.font.serif};
  font-size: ${({ theme }) => theme.font.size.h3};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  color: ${({ theme }) => theme.color.fg[1]};
`;

export const DropSubheading = styled.div`
  font-size: ${({ theme }) => theme.font.size.bodySm};
  color: ${({ theme }) => theme.color.fg[3]};
`;

export const Actions = styled.div`
  display: inline-flex;
  gap: ${({ theme }) => theme.space[3]};
  margin-top: ${({ theme }) => theme.space[3]};
`;

export const HiddenFileInput = styled.input`
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
`;

export const ErrorText = styled.p`
  margin: 0;
  font-size: ${({ theme }) => theme.font.size.bodySm};
  color: ${({ theme }) => theme.color.danger[700]};
`;
