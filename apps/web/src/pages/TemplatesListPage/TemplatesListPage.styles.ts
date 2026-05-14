import styled, { keyframes } from 'styled-components';

/**
 * Mobile breakpoint for the templates list. Below this width we tighten
 * the page padding so cards don't get clipped on phones. Matches the
 * DashboardPage breakpoint so both L4 sender pages share one rhythm.
 */
const MOBILE = '768px';

export const Main = styled.div`
  flex: 1 1 auto;
  min-width: 0;
  overflow: auto;
  padding: ${({ theme }) => theme.space[10]} ${({ theme }) => theme.space[12]}
    ${({ theme }) => theme.space[20]};

  @media (max-width: ${MOBILE}) {
    padding: ${({ theme }) => theme.space[6]} ${({ theme }) => theme.space[4]}
      ${({ theme }) => theme.space[12]};
  }
`;

/**
 * Page-content container. Previously missing `margin: 0 auto`, which
 * left content hugging the left page edge at viewports ≥1320 px and
 * created the visible misalignment versus DashboardPage. Standardized
 * on the same 1280 px max-width DashboardPage uses so the three L4
 * list pages (Dashboard / Contacts / Templates) share one width.
 * Audit A · TemplatesListPage H-8 / TOP-1.
 */
export const Inner = styled.div`
  max-width: 1280px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
`;

/* ============================================================
 * Header (eyebrow + serif title + lede + primary CTA)
 *
 * The bespoke HeaderTitle / Lede / HeaderRow combo was replaced with
 * the shared `PageHeader` component in the .tsx so the page uses the
 * canonical 36/48 px title scale instead of the off-scale 32 px.
 * The exports below are retained as no-op aliases for any legacy
 * imports (none in the live tree); the empty-state card now uses
 * EmptyStateTitle / EmptyStateLede instead.
 * ============================================================ */

/* ============================================================
 * Toolbar — tag filter, active-tag chips, group toggle, search
 * ============================================================ */

export const Toolbar = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]};
  margin-bottom: ${({ theme }) => theme.space[5]};
  margin-top: ${({ theme }) => theme.space[6]};
  flex-wrap: wrap;
`;

export const ToolbarSpacer = styled.div`
  flex: 1;
`;

export const GroupToggleLabel = styled.label`
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
  font-size: ${({ theme }) => theme.font.size.caption};
  color: ${({ theme }) => theme.color.fg[2]};
  cursor: pointer;
  user-select: none;
  white-space: nowrap;

  & > input {
    accent-color: ${({ theme }) => theme.color.indigo[600]};
  }
`;

export const SearchBox = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
  padding: ${({ theme }) => `${theme.space[1]} ${theme.space[3]}`};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.sm};
  background: ${({ theme }) => theme.color.paper};
  width: 240px;

  & > input {
    flex: 1;
    border: none;
    outline: none;
    background: transparent;
    font-size: ${({ theme }) => theme.font.size.caption};
    font-family: inherit;
    color: ${({ theme }) => theme.color.fg[1]};
    padding: ${({ theme }) => `${theme.space[1]} 0`};
  }

  & > input::placeholder {
    color: ${({ theme }) => theme.color.fg[3]};
  }
`;

/* ============================================================
 * Active-tag chips row (next to filter trigger)
 * ============================================================ */

export const ActiveTagPill = styled.span<{ $bg: string; $fg: string }>`
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[1]};
  padding: ${({ theme }) =>
    `${theme.space[1]} ${theme.space[1]} ${theme.space[1]} ${theme.space[3]}`};
  border-radius: ${({ theme }) => theme.radius.pill};
  font-size: ${({ theme }) => theme.font.size.micro};
  font-weight: ${({ theme }) => theme.font.weight.bold};
  letter-spacing: 0.02em;
  background: ${({ $bg }) => $bg};
  color: ${({ $fg }) => $fg};
`;

export const ActiveTagRemove = styled.button`
  border: none;
  background: rgba(0, 0, 0, 0.08);
  color: inherit;
  width: 16px;
  height: 16px;
  border-radius: ${({ theme }) => theme.radius.pill};
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  font-family: inherit;
`;

export const ActiveTagOverflow = styled.span`
  font-size: ${({ theme }) => theme.font.size.micro};
  color: ${({ theme }) => theme.color.fg[3]};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
`;

/* ============================================================
 * Grid / Group sections
 * ============================================================ */

export const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: ${({ theme }) => theme.space[5]};
`;

export const GroupSection = styled.section`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[4]};

  & + & {
    margin-top: ${({ theme }) => theme.space[8]};
  }
`;

export const GroupHeader = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]};
`;

export const GroupTagPill = styled.span<{ $bg: string; $fg: string }>`
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[1]};
  padding: ${({ theme }) => `${theme.space[1]} ${theme.space[3]}`};
  border-radius: ${({ theme }) => theme.radius.pill};
  font-size: 12px;
  font-weight: ${({ theme }) => theme.font.weight.bold};
  letter-spacing: 0.02em;
  background: ${({ $bg }) => $bg};
  color: ${({ $fg }) => $fg};
`;

export const GroupTagDot = styled.span<{ $color: string }>`
  width: 7px;
  height: 7px;
  border-radius: ${({ theme }) => theme.radius.pill};
  background: ${({ $color }) => $color};
`;

export const GroupCount = styled.span`
  font-size: 12px;
  color: ${({ theme }) => theme.color.fg[3]};
  font-family: ${({ theme }) => theme.font.mono};
`;

export const GroupRule = styled.div`
  flex: 1;
  height: 1px;
  background: ${({ theme }) => theme.color.border[1]};
`;

/* ============================================================
 * Empty state — used both for the "no matches" panel inside a
 * filtered view AND for the centered first-run "Create your first
 * template" card. Audit A · TemplatesListPage M-11.
 * ============================================================ */

export const EmptyState = styled.div`
  margin-top: ${({ theme }) => theme.space[4]};
  padding: ${({ theme }) => `${theme.space[10]} ${theme.space[4]}`};
  border: 1px dashed ${({ theme }) => theme.color.border[2]};
  border-radius: ${({ theme }) => theme.radius.lg};
  background: ${({ theme }) => theme.color.paper};
  text-align: center;
  font-size: ${({ theme }) => theme.font.size.caption};
  color: ${({ theme }) => theme.color.fg[3]};
`;

/**
 * First-run welcome card rendered when the user has no templates
 * AND no active filter. Replaces the previous "single 'New template'
 * tile in the grid + duplicate 'New template' button in the header"
 * which read as a strange one-card grid. Audit A · TemplatesListPage
 * M-11.
 */
export const FirstRunCard = styled.section`
  margin: ${({ theme }) => `${theme.space[8]} auto 0`};
  max-width: 560px;
  padding: ${({ theme }) => `${theme.space[12]} ${theme.space[8]}`};
  border: 1px dashed ${({ theme }) => theme.color.indigo[300]};
  border-radius: ${({ theme }) => theme.radius.xl};
  background: ${({ theme }) => theme.color.paper};
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]};
`;

export const FirstRunIcon = styled.span`
  width: 64px;
  height: 64px;
  border-radius: ${({ theme }) => theme.radius.lg};
  background: ${({ theme }) => theme.color.indigo[50]};
  color: ${({ theme }) => theme.color.indigo[700]};
  display: inline-flex;
  align-items: center;
  justify-content: center;
`;

export const FirstRunTitle = styled.h2`
  margin: 0;
  font-family: ${({ theme }) => theme.font.serif};
  font-size: ${({ theme }) => theme.font.size.h4};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  color: ${({ theme }) => theme.color.fg[1]};
  letter-spacing: ${({ theme }) => theme.font.tracking.tight};
`;

export const FirstRunLede = styled.p`
  margin: 0;
  font-size: ${({ theme }) => theme.font.size.bodySm};
  color: ${({ theme }) => theme.color.fg[3]};
  line-height: ${({ theme }) => theme.font.lineHeight.normal};
  max-width: 40ch;
`;

/* ============================================================
 * "New template" tile (sits in the grid)
 * ============================================================ */

export const CreateCard = styled.button`
  all: unset;
  cursor: pointer;
  background: ${({ theme }) => theme.color.paper};
  border: 1.5px dashed ${({ theme }) => theme.color.indigo[300]};
  border-radius: ${({ theme }) => theme.radius.lg};
  padding: ${({ theme }) => theme.space[4]};
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[3]};
  transition:
    border-color ${({ theme }) => theme.motion.durFast} ${({ theme }) => theme.motion.easeStandard},
    background ${({ theme }) => theme.motion.durFast} ${({ theme }) => theme.motion.easeStandard},
    transform ${({ theme }) => theme.motion.durFast} ${({ theme }) => theme.motion.easeStandard};

  &:hover,
  &:focus-visible {
    background: ${({ theme }) => theme.color.indigo[50]};
    border-color: ${({ theme }) => theme.color.indigo[500]};
    transform: translateY(-1px);
  }
`;

export const CreateThumb = styled.div`
  position: relative;
  width: 100%;
  aspect-ratio: 4 / 3;
  background: ${({ theme }) => theme.color.indigo[50]};
  border-radius: ${({ theme }) => theme.radius.md};
  display: flex;
  align-items: center;
  justify-content: center;
`;

export const CreateBadge = styled.span`
  width: 54px;
  height: 54px;
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.color.paper};
  color: ${({ theme }) => theme.color.indigo[700]};
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-shadow: ${({ theme }) => theme.shadow.md};
`;

export const CreateBody = styled.div`
  padding: ${({ theme }) => `${theme.space[1]} ${theme.space[1]} ${theme.space[1]}`};
  text-align: left;
`;

export const CreateTitle = styled.div`
  font-family: ${({ theme }) => theme.font.serif};
  font-size: ${({ theme }) => theme.font.size.h5};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  color: ${({ theme }) => theme.color.fg[1]};
  letter-spacing: -0.01em;
`;

export const CreateSub = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.color.fg[3]};
  margin-top: ${({ theme }) => theme.space[1]};
`;

/* ============================================================
 * Delete confirm modal
 * ============================================================ */

const fadeIn = keyframes`
  from { opacity: 0; }
  to   { opacity: 1; }
`;

export const ModalBackdrop = styled.div`
  position: fixed;
  inset: 0;
  z-index: ${({ theme }) => theme.z.modal};
  background: rgba(15, 23, 42, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: ${({ theme }) => theme.space[6]};
  animation: ${fadeIn} 160ms ${({ theme }) => theme.motion.easeDecelerate};
`;

export const ModalCard = styled.div`
  width: 460px;
  max-width: 100%;
  background: ${({ theme }) => theme.color.paper};
  border-radius: ${({ theme }) => theme.radius.xl};
  box-shadow: ${({ theme }) => theme.shadow.lg};
  padding: ${({ theme }) => `${theme.space[8]} ${theme.space[8]} ${theme.space[6]}`};
`;

export const ModalHead = styled.div`
  display: flex;
  align-items: flex-start;
  gap: ${({ theme }) => theme.space[4]};
`;

export const ModalIcon = styled.div`
  width: 44px;
  height: 44px;
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.color.danger[50]};
  color: ${({ theme }) => theme.color.danger[700]};
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
`;

export const ModalTitle = styled.h2`
  font-family: ${({ theme }) => theme.font.serif};
  font-size: ${({ theme }) => theme.font.size.h4};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  color: ${({ theme }) => theme.color.fg[1]};
  letter-spacing: -0.01em;
  line-height: ${({ theme }) => theme.font.lineHeight.snug};
  margin: 0;
`;

export const ModalBody = styled.p`
  font-size: ${({ theme }) => theme.font.size.caption};
  color: ${({ theme }) => theme.color.fg[3]};
  margin: ${({ theme }) => `${theme.space[1]} 0 0`};
  line-height: ${({ theme }) => theme.font.lineHeight.normal};
`;

export const ModalFooter = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: ${({ theme }) => theme.space[2]};
  margin-top: ${({ theme }) => theme.space[6]};
`;

export const ModalCancelButton = styled.button`
  background: transparent;
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  color: ${({ theme }) => theme.color.fg[1]};
  font-size: ${({ theme }) => theme.font.size.caption};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  cursor: pointer;
  padding: ${({ theme }) => `${theme.space[2]} ${theme.space[4]}`};
  border-radius: ${({ theme }) => theme.radius.sm};
  font-family: inherit;
`;

export const ModalDeleteButton = styled.button`
  background: ${({ theme }) => theme.color.danger[700]};
  color: ${({ theme }) => theme.color.fg.inverse};
  border: none;
  font-size: ${({ theme }) => theme.font.size.caption};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  cursor: pointer;
  padding: ${({ theme }) => `${theme.space[2]} ${theme.space[4]}`};
  border-radius: ${({ theme }) => theme.radius.sm};
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[1]};
  font-family: inherit;

  &:hover,
  &:focus-visible {
    background: ${({ theme }) => theme.color.danger[500]};
  }
`;
