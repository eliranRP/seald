import styled, { css, type DefaultTheme } from 'styled-components';
import { rise } from '@/styles/motion';
import { visuallyHidden } from '@/styles/mixins';

const MOBILE = '@media (max-width: 640px)';

export const Body = styled.div`
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  background: ${({ theme }) => theme.color.bg.app};
  font-family: ${({ theme }) => theme.font.sans};
  color: ${({ theme }) => theme.color.fg[1]};
`;

/** Canvas `.container` (32 / 48 / 64 padding; 16px on phones). */
export const Main = styled.main`
  display: flex;
  justify-content: center;
  padding: ${({ theme }) => `${theme.space[8]} ${theme.space[12]} ${theme.space[16]}`};
  ${MOBILE} {
    padding: ${({ theme }) => theme.space[4]};
  }
`;

/** The board's 880px container minus its 48px side padding. */
export const Inner = styled.div`
  width: 100%;
  max-width: 784px;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[6]};
  ${MOBILE} {
    gap: ${({ theme }) => theme.space[4]};
  }
`;

/** Canvas `.h1`: serif 32px medium. */
export const Heading = styled.h1`
  margin: 0;
  font-family: ${({ theme }) => theme.font.serif};
  font-size: ${({ theme }) => theme.font.size.x4l};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  line-height: ${({ theme }) => theme.font.lineHeight.tight};
  letter-spacing: ${({ theme }) => theme.font.tracking.tight};
  color: ${({ theme }) => theme.color.fg[1]};
  ${MOBILE} {
    ${visuallyHidden}
  }
`;

export const HeadingBlock = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[2]};
`;

export const Subtitle = styled.p`
  margin: 0;
  font-size: ${({ theme }) => theme.font.size.body};
  color: ${({ theme }) => theme.color.fg[3]};
`;

/* ----- sources ----- */

/** One row of equal tiles; phones use three columns (two when four tiles). */
export const Sources = styled.div<{ readonly $count: number }>`
  display: grid;
  grid-template-columns: repeat(${({ $count }) => $count}, minmax(0, 1fr));
  gap: ${({ theme }) => theme.space[4]};
  ${MOBILE} {
    grid-template-columns: repeat(${({ $count }) => ($count === 4 ? 2 : 3)}, minmax(0, 1fr));
    gap: ${({ theme }) => theme.space[2]};
  }
`;

/* ----- dropzone ----- */

function dropBorder(theme: DefaultTheme, dragging: boolean, error: boolean): string {
  if (error) return theme.color.danger[500];
  return dragging ? theme.color.indigo[600] : theme.color.border[2];
}

function dropBackground(theme: DefaultTheme, dragging: boolean, error: boolean): string {
  if (error) return theme.color.danger[50];
  return dragging ? theme.color.indigo[50] : theme.color.paper;
}

export const Dropzone = styled.div<{ $dragging: boolean; $error: boolean }>`
  min-height: 280px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: ${({ theme }) => theme.space[3]};
  padding: ${({ theme }) => theme.space[8]};
  text-align: center;
  border-radius: ${({ theme }) => theme.radius.xl};
  border: 1.5px dashed ${({ theme, $dragging, $error }) => dropBorder(theme, $dragging, $error)};
  background: ${({ theme, $dragging, $error }) => dropBackground(theme, $dragging, $error)};
  transition:
    border-color ${({ theme }) => theme.motion.durFast},
    background ${({ theme }) => theme.motion.durFast};
  ${MOBILE} {
    min-height: 0;
    padding: ${({ theme }) => `${theme.space[6]} ${theme.space[4]}`};
  }
`;

/** 48px glyph; the phone board uses 32px for the idle upload icon. */
export const DropIcon = styled.span<{ $error: boolean }>`
  display: inline-flex;
  ${MOBILE} {
    & > svg {
      width: ${({ $error }) => ($error ? '48px' : '32px')};
      height: ${({ $error }) => ($error ? '48px' : '32px')};
    }
  }
  color: ${({ theme, $error }) => ($error ? theme.color.danger[500] : theme.color.indigo[600])};
`;

/** Canvas `.h2`: serif 24px medium. */
export const DropHeading = styled.h2`
  margin: 0;
  font-family: ${({ theme }) => theme.font.serif};
  font-size: ${({ theme }) => theme.font.size.x2l};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  line-height: ${({ theme }) => theme.font.lineHeight.snug};
  color: ${({ theme }) => theme.color.fg[1]};
`;

export const DropSubheading = styled.p`
  margin: 0;
  font-size: ${({ theme }) => theme.font.size.bodySm};
  color: ${({ theme }) => theme.color.fg[3]};
`;

/** On phones the button goes full width under the meta row (UploadMobile). */
export const Actions = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: ${({ theme }) => theme.space[2]};
  ${MOBILE} {
    order: 1;
    align-self: stretch;
    & > button {
      flex: 1;
    }
  }
`;

export const MetaRow = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
  ${MOBILE} {
    gap: ${({ theme }) => theme.space[3]};
  }
`;

export const IconMeta = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: ${({ theme }) => theme.font.size.caption};
  color: ${({ theme }) => theme.color.fg[3]};
`;

export const AlertInline = styled.p`
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
  margin: 0;
  font-size: ${({ theme }) => theme.font.size.bodySm};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.danger[700]};
`;

export const Mono = styled.span`
  font-family: ${({ theme }) => theme.font.mono};
  font-size: ${({ theme }) => theme.font.size.xs};
  color: ${({ theme }) => theme.color.fg[2]};
`;

export const HiddenFileInput = styled.input`
  ${visuallyHidden}
`;

/* ----- old secondary links row (hosts without source tiles) ----- */

export const TemplatePromptDivider = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: ${({ theme }) => theme.space[2]};
  margin-top: ${({ theme }) => theme.space[4]};
  padding-top: ${({ theme }) => theme.space[4]};
  border-top: 1px solid ${({ theme }) => theme.color.border[1]};
  width: 100%;
`;

export const TemplatePromptHint = styled.span`
  font-size: ${({ theme }) => theme.font.size.bodySm};
  color: ${({ theme }) => theme.color.fg[3]};
`;

export const TemplatePromptLink = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 0;
  background: transparent;
  padding: ${({ theme }) => theme.space[1]};
  font-family: inherit;
  font-size: ${({ theme }) => theme.font.size.bodySm};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  color: ${({ theme }) => theme.color.indigo[600]};
  cursor: pointer;
  &:hover {
    text-decoration: underline;
  }
`;

export const TemplatePromptDot = styled.span`
  color: ${({ theme }) => theme.color.fg[4]};
`;

/* ----- file card + checklist ----- */

export const FileCard = styled.div`
  display: flex;
  align-items: flex-start;
  gap: ${({ theme }) => theme.space[4]};
  padding: ${({ theme }) => theme.space[5]};
  background: ${({ theme }) => theme.color.paper};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.lg};
  box-shadow: ${({ theme }) => theme.shadow.sm};
  ${rise}
  ${MOBILE} {
    flex-wrap: wrap;
    padding: ${({ theme }) => theme.space[4]};
  }
`;

export const Thumb = styled.div`
  flex-shrink: 0;
  width: 56px;
  height: 72px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: ${({ theme }) => `${theme.space[3]} 10px`};
  background: ${({ theme }) => theme.color.paper};
  border: 1px solid ${({ theme }) => theme.color.ink[150]};
  border-radius: ${({ theme }) => theme.radius.xxs};
  box-shadow: ${({ theme }) => theme.shadow.xs};
  & > i {
    display: block;
    height: 3px;
    border-radius: 2px;
    background: ${({ theme }) => theme.color.ink[150]};
  }
  & > i:last-child {
    width: 60%;
  }
`;

export const Grow = styled.div`
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[2]};
`;

export const FileName = styled.h2`
  margin: 0;
  font-size: ${({ theme }) => theme.font.size.lg};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.fg[1]};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

export const FileMeta = styled.p`
  margin: 0;
  font-size: ${({ theme }) => theme.font.size.caption};
  color: ${({ theme }) => theme.color.fg[3]};
`;

export const Progress = styled.div<{ $error?: boolean }>`
  height: 6px;
  border-radius: ${({ theme }) => theme.radius.pill};
  background: ${({ theme }) => theme.color.ink[100]};
  overflow: hidden;
  & > span {
    display: block;
    height: 100%;
    width: 100%;
    border-radius: ${({ theme }) => theme.radius.pill};
    background: ${({ theme, $error }) =>
      $error ? theme.color.danger[500] : theme.color.indigo[600]};
    transform-origin: left;
  }
`;

export const Checklist = styled.ul`
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: ${({ theme }) => `${theme.space[2]} 0 0`};
  padding: 0;
  list-style: none;
`;

export const CheckItem = styled.li<{ $state: 'done' | 'active' | 'todo' }>`
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: ${({ theme }) => theme.font.size.bodySm};
  color: ${({ theme, $state }) => ($state === 'todo' ? theme.color.fg[3] : theme.color.fg[1])};
  font-weight: ${({ theme, $state }) =>
    $state === 'active' ? theme.font.weight.semibold : theme.font.weight.regular};
`;

export const CheckIco = styled.span<{ $state: 'done' | 'active' | 'todo' }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 1.5px solid ${({ theme }) => theme.color.border[2]};
  ${({ theme, $state }) =>
    $state === 'done' &&
    css`
      background: ${theme.color.success[500]};
      border-color: ${theme.color.success[500]};
      color: ${theme.color.fgOnAccent};
    `}
  ${({ theme, $state }) =>
    $state === 'active' &&
    css`
      border-color: ${theme.color.indigo[600]};
      color: ${theme.color.indigo[600]};
    `}
`;

export const CheckNum = styled.span`
  margin-left: auto;
  font-family: ${({ theme }) => theme.font.mono};
  font-size: ${({ theme }) => theme.font.size.xs};
  color: ${({ theme }) => theme.color.fg[3]};
`;

export const OpensHint = styled.p`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin: 0;
  font-size: ${({ theme }) => theme.font.size.caption};
  color: ${({ theme }) => theme.color.fg[3]};
`;

/* ----- recent templates ----- */

export const Eyebrow = styled.h2`
  margin: 0 0 ${({ theme }) => theme.space[3]};
  line-height: 1.5;
  ${MOBILE} {
    margin-bottom: ${({ theme }) => theme.space[2]};
  }
  font-size: ${({ theme }) => theme.font.size.xs};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  letter-spacing: ${({ theme }) => theme.font.tracking.wider};
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.fg[3]};
`;

export const ChipRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.space[2]};
  ${MOBILE} {
    flex-direction: column;
  }
`;

/* ----- template banner ----- */

export const TemplateBanner = styled.div<{ $tone: 'info' | 'warning' }>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${({ theme }) => theme.space[3]};
  padding: ${({ theme }) => `${theme.space[3]} ${theme.space[4]}`};
  border-radius: ${({ theme }) => theme.radius.md};
  border: 1px solid
    ${({ theme, $tone }) => ($tone === 'warning' ? theme.color.warn[500] : theme.color.indigo[200])};
  background: ${({ theme, $tone }) =>
    $tone === 'warning' ? theme.color.warn[50] : theme.color.indigo[50]};
  color: ${({ theme, $tone }) =>
    $tone === 'warning' ? theme.color.warn[700] : theme.color.indigo[800]};
  font-size: ${({ theme }) => theme.font.size.bodySm};
`;

export const TemplateBannerText = styled.span``;

export const TemplateBannerStrong = styled.strong`
  font-weight: ${({ theme }) => theme.font.weight.semibold};
`;

export const TemplateBannerClear = styled.button`
  border: 0;
  background: transparent;
  font-family: inherit;
  font-size: ${({ theme }) => theme.font.size.bodySm};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: inherit;
  text-decoration: underline;
  cursor: pointer;
`;
