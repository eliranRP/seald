import styled, { type DefaultTheme } from 'styled-components';

function progressFillBg(theme: DefaultTheme, complete: boolean, declined: boolean): string {
  if (complete) return theme.color.success[500];
  if (declined) return theme.color.danger[500];
  return theme.color.indigo[600];
}

export const Wrap = styled.div`
  min-height: 100vh;
  background: ${({ theme }) => theme.color.bg.app};
  font-family: ${({ theme }) => theme.font.sans};
`;

export const Inner = styled.div`
  max-width: 1240px;
  margin: 0 auto;
  padding: ${({ theme }) => `${theme.space[8]} ${theme.space[12]} ${theme.space[20]}`};
`;

export const Breadcrumb = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
  font-size: 13px;
  color: ${({ theme }) => theme.color.fg[3]};
  margin-bottom: ${({ theme }) => theme.space[4]};
  min-width: 0;
`;

export const BreadcrumbLink = styled.button`
  all: unset;
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
  color: ${({ theme }) => theme.color.fg[2]};
  cursor: pointer;
  flex-shrink: 0;
  &:hover {
    color: ${({ theme }) => theme.color.fg[1]};
  }
  &:focus-visible {
    box-shadow: ${({ theme }) => theme.shadow.focus};
    border-radius: ${({ theme }) => theme.radius.sm};
  }
`;

export const BreadcrumbCode = styled.span`
  font-family: ${({ theme }) => theme.font.mono};
  color: ${({ theme }) => theme.color.fg[2]};
`;

/**
 * Trailing title in the breadcrumb. Truncates with an ellipsis on a
 * single line so a long envelope title never pushes the breadcrumb past
 * the action buttons — `max-width: 60ch` matches the brief.
 */
export const BreadcrumbTitle = styled.span`
  color: ${({ theme }) => theme.color.fg[2]};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 60ch;
  min-width: 0;
`;

export const HeadRow = styled.header`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: ${({ theme }) => theme.space[6]};
  margin-bottom: ${({ theme }) => theme.space[8]};
`;

export const HeadText = styled.div`
  min-width: 0;
  flex: 1;
`;

export const Eyebrow = styled.div`
  font-family: ${({ theme }) => theme.font.mono};
  font-size: 11px;
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  letter-spacing: 0.08em;
  color: ${({ theme }) => theme.color.fg[3]};
  text-transform: uppercase;
  margin-bottom: ${({ theme }) => theme.space[1]};
`;

export const Title = styled.h1`
  font-family: ${({ theme }) => theme.font.serif};
  font-size: 36px;
  font-weight: ${({ theme }) => theme.font.weight.medium};
  letter-spacing: -0.02em;
  color: ${({ theme }) => theme.color.fg[1]};
  margin: 0 0 ${({ theme }) => theme.space[3]};
  line-height: 1.15;
  overflow-wrap: anywhere;
`;

/**
 * Combined status + meta + tags row. All bits sit on a single line:
 * Sealed pill · short_code · pages · Sent date · existing chips · inline
 * "+ tag" affordance. `gap: 12px` (= space[3]) tightens the previous
 * uneven spacing into one rhythm, and the row wraps gracefully when the
 * viewport can't hold every chip on one line.
 */
export const HeadMeta = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.space[3]};
  align-items: center;
  flex-wrap: wrap;
  font-size: 13px;
  color: ${({ theme }) => theme.color.fg[3]};
`;

export const HeadCode = styled.span`
  font-family: ${({ theme }) => theme.font.mono};
`;

/**
 * Single-character separator between the bits of the status meta row.
 * Renders the `·` glyph with a slightly muted color so it visually
 * delimits without competing with the values it separates.
 */
export const MetaSeparator = styled.span.attrs({ 'aria-hidden': true })`
  color: ${({ theme }) => theme.color.fg[4]};
  user-select: none;
`;

/**
 * Inline slot for the TagEditor inside HeadMeta. Capping it tightly so
 * the chips + "+ tag" affordance sit naturally at the end of the row
 * rather than expanding into a full-width input bar.
 */
export const HeadMetaTagSlot = styled.div`
  display: inline-flex;
  align-items: center;
  min-width: 0;
`;

export const HeadActions = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.space[2]};
  flex-shrink: 0;
`;

/**
 * Slim progress card — bar + headline only. The previous tri-pillar
 * mini-stats (Signed / Waiting / Events) was non-canonical: the canon
 * design has just a bar + headline, and the headline already conveys
 * the signers count. Padding tightened to `16px 20px` so the now-empty
 * right side doesn't make the card feel airy.
 */
export const ProgressCard = styled.div`
  background: ${({ theme }) => theme.color.bg.surface};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.xl};
  padding: 16px 20px;
  margin-bottom: ${({ theme }) => theme.space[6]};
  display: flex;
  gap: ${({ theme }) => theme.space[8]};
  align-items: center;
`;

export const ProgressLeft = styled.div`
  flex: 1;
`;

export const ProgressLabel = styled.div`
  font-size: 13px;
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.fg[3]};
  margin-bottom: ${({ theme }) => theme.space[2]};
`;

export const ProgressTrack = styled.div`
  height: 8px;
  border-radius: ${({ theme }) => theme.radius.pill};
  background: ${({ theme }) => theme.color.ink[100]};
  overflow: hidden;
  position: relative;
`;

interface FillProps {
  readonly $pct: number;
  readonly $complete: boolean;
  readonly $declined: boolean;
}
export const ProgressFill = styled.div<FillProps>`
  height: 100%;
  width: ${({ $pct }) => `${$pct}%`};
  background: ${({ theme, $complete, $declined }) => progressFillBg(theme, $complete, $declined)};
  border-radius: ${({ theme }) => theme.radius.pill};
  transition: width 900ms cubic-bezier(0.2, 0.8, 0.2, 1);
`;

export const Grid = styled.div`
  display: grid;
  grid-template-columns: 1fr 340px;
  gap: ${({ theme }) => theme.space[6]};
  align-items: flex-start;
`;

export const TimelineCard = styled.section`
  background: ${({ theme }) => theme.color.bg.surface};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.xl};
  padding: ${({ theme }) => `${theme.space[6]} ${theme.space[6]} ${theme.space[4]}`};
`;

export const TimelineHeading = styled.h2`
  font-family: ${({ theme }) => theme.font.serif};
  font-size: 22px;
  font-weight: ${({ theme }) => theme.font.weight.medium};
  color: ${({ theme }) => theme.color.fg[1]};
  margin: 0 0 ${({ theme }) => theme.space[1]};
`;

export const TimelineSubtitle = styled.div`
  font-size: 13px;
  color: ${({ theme }) => theme.color.fg[3]};
  margin-bottom: ${({ theme }) => theme.space[6]};
`;

export const Sidebar = styled.aside`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[4]};
  position: sticky;
  top: 80px;
`;

export const SignersCard = styled.div`
  background: ${({ theme }) => theme.color.bg.surface};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.xl};
  padding: ${({ theme }) => `${theme.space[5]} ${theme.space[5]}`};
`;

export const SignersHeading = styled.div`
  font-size: 12px;
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  letter-spacing: 0.08em;
  color: ${({ theme }) => theme.color.fg[3]};
  text-transform: uppercase;
  margin-bottom: ${({ theme }) => theme.space[3]};
`;

/**
 * Audit-trail callout — neutral border (border[1]) so the card itself
 * never reads as "interactive"; only the "Download audit trail →" link
 * keeps the indigo accent. Title rendered fg-1 + semibold so users
 * don't mistake it for a link.
 */
export const AuditCallout = styled.div`
  background: ${({ theme }) => theme.color.ink[50]};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.xl};
  padding: 16px;
  display: flex;
  gap: ${({ theme }) => theme.space[3]};
  align-items: flex-start;
  font-size: 12px;
  color: ${({ theme }) => theme.color.fg[2]};
  line-height: 1.55;
  & strong {
    color: ${({ theme }) => theme.color.fg[1]};
    font-weight: ${({ theme }) => theme.font.weight.semibold};
  }
`;

export const Muted = styled.div`
  color: ${({ theme }) => theme.color.fg[2]};
  margin-top: ${({ theme }) => theme.space[1]};
  line-height: 1.55;
`;

export const AuditAction = styled.button`
  all: unset;
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[1]};
  color: ${({ theme }) => theme.color.indigo[600]};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  font-size: 12px;
  margin-top: ${({ theme }) => theme.space[2]};
  cursor: pointer;
  &:hover {
    color: ${({ theme }) => theme.color.indigo[800]};
  }
  &:focus-visible {
    box-shadow: ${({ theme }) => theme.shadow.focus};
    border-radius: ${({ theme }) => theme.radius.sm};
  }
`;

export const StatusToast = styled.div<{ $kind: 'success' | 'danger' }>`
  margin: 0 0 ${({ theme }) => theme.space[4]};
  padding: ${({ theme }) => `${theme.space[3]} ${theme.space[4]}`};
  background: ${({ theme, $kind }) =>
    $kind === 'danger' ? theme.color.danger[50] : theme.color.success[50]};
  color: ${({ theme, $kind }) =>
    $kind === 'danger' ? theme.color.danger[700] : theme.color.success[700]};
  border: 1px solid
    ${({ theme, $kind }) =>
      $kind === 'danger' ? theme.color.danger[500] : theme.color.success[500]};
  border-radius: ${({ theme }) => theme.radius.md};
  font-size: 13px;
  font-weight: ${({ theme }) => theme.font.weight.semibold};
`;

export const ErrorBanner = StatusToast;

export const NotFoundHint = styled.div`
  margin-top: ${({ theme }) => theme.space[3]};
  color: ${({ theme }) => theme.color.fg[3]};
  font-size: 14px;
`;

export const SignersEmpty = styled.div`
  font-size: 13px;
  color: ${({ theme }) => theme.color.fg[3]};
`;

export const SignerList = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
`;

export const SignerItem = styled.li`
  display: flex;
  gap: ${({ theme }) => theme.space[3]};
  align-items: center;
  padding: ${({ theme }) => `${theme.space[2]} 0`};
  &:not(:last-child) {
    border-bottom: 1px solid ${({ theme }) => theme.color.border[1]};
  }
`;

export const SignerNames = styled.div`
  flex: 1;
  min-width: 0;
`;

export const SignerName = styled.div`
  font-size: 13px;
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.fg[1]};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

export const SignerEmail = styled.div`
  font-size: 11px;
  color: ${({ theme }) => theme.color.fg[3]};
  font-family: ${({ theme }) => theme.font.mono};
  max-width: 200px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

export const Card = styled.section`
  background: ${({ theme }) => theme.color.bg.surface};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.xl};
  padding: ${({ theme }) => `${theme.space[6]} ${theme.space[8]}`};
`;

export const Actions = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.space[2]};
  margin-top: ${({ theme }) => theme.space[5]};
`;
