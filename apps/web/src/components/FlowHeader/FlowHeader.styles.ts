import styled, { css } from 'styled-components';
import { visuallyHidden } from '@/styles/mixins';
import type { FlowStepState } from './FlowHeader.types';

const MOBILE = '@media (max-width: 640px)';
const DESKTOP = '@media (min-width: 641px)';

/**
 * Desktop: the canvas `.flowbar` (64px, three columns). Phones: the
 * `.m-top` row (56px, its own bottom border drawn by `::after`) with the
 * `.segbar` track under it. `$padBar` adds the 12px gap above the track
 * that the Prepare board has; Upload's track sits right under the row.
 */
export const Root = styled.header<{ readonly $padBar: boolean }>`
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  height: 64px;
  padding: 0 ${({ theme }) => theme.space[6]};
  background: ${({ theme }) => theme.color.paper};
  border-bottom: 1px solid ${({ theme }) => theme.color.border[1]};
  flex-shrink: 0;

  ${MOBILE} {
    position: relative;
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-rows: 56px auto;
    grid-template-areas:
      'left right'
      'steps steps';
    height: auto;
    padding: 0;
    border-bottom: 0;

    &::after {
      content: '';
      position: absolute;
      top: 55px;
      left: 0;
      right: 0;
      height: 1px;
      background: ${({ theme }) => theme.color.border[1]};
    }
  }

  ${MOBILE} {
    & > ol {
      padding-top: ${({ $padBar, theme }) => ($padBar ? theme.space[3] : '0')};
    }
  }
`;

export const Left = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
  min-width: 0;
  ${MOBILE} {
    grid-area: left;
    gap: 0;
    padding-left: ${({ theme }) => theme.space[4]};
  }
`;

export const TitleBlock = styled.div`
  display: flex;
  flex-direction: column;
  min-width: 0;
`;

/** Canvas `.h3`: 16px semibold. */
export const Title = styled.span`
  font-size: ${({ theme }) => theme.font.size.body};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  line-height: 24px;
  color: ${({ theme }) => theme.color.fg[1]};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

/** Canvas `.meta`; phones show the title only. */
export const Meta = styled.span`
  font-size: ${({ theme }) => theme.font.size.caption};
  line-height: 1.5;
  color: ${({ theme }) => theme.color.fg[3]};
  ${MOBILE} {
    display: none;
  }
`;

export const MobileTitle = styled(Title)`
  ${DESKTOP} {
    display: none;
  }
`;

/** Canvas `.logo` (desktop Upload header). */
export const Logo = styled.span`
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
  ${MOBILE} {
    display: none;
  }
`;

export const LogoMark = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: ${({ theme }) => theme.radius.sm};
  background: ${({ theme }) => theme.color.indigo[600]};
  color: ${({ theme }) => theme.color.fgOnAccent};
  font-family: ${({ theme }) => theme.font.script};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  font-size: ${({ theme }) => theme.font.size.xl};
  line-height: 1;
`;

export const LogoWord = styled.span`
  font-family: ${({ theme }) => theme.font.serif};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  font-size: ${({ theme }) => theme.font.size.xl};
  line-height: 1.5;
  color: ${({ theme }) => theme.color.fg[1]};
`;

export const Right = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
  justify-self: end;
  ${MOBILE} {
    grid-area: right;
    padding-right: ${({ theme }) => theme.space[2]};
  }
`;

/** Canvas `.count` pill ("1/3"), phones only. */
export const StepCount = styled.span`
  display: none;
  ${MOBILE} {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 20px;
    height: 20px;
    padding: 0 6px;
    border-radius: ${({ theme }) => theme.radius.pill};
    background: ${({ theme }) => theme.color.ink[100]};
    color: ${({ theme }) => theme.color.ink[600]};
    font-size: ${({ theme }) => theme.font.size.xs};
    font-weight: ${({ theme }) => theme.font.weight.semibold};
    line-height: 1;
  }
`;

export const StepList = styled.ol`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]};
  margin: 0;
  padding: 0;
  list-style: none;

  ${MOBILE} {
    grid-area: steps;
    gap: 3px;
    padding: 0 ${({ theme }) => theme.space[4]};
  }
`;

export const StepItem = styled.li<{ $state: FlowStepState }>`
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
  font-size: ${({ theme }) => theme.font.size.bodySm};
  line-height: 1.5;
  font-weight: ${({ theme, $state }) =>
    $state === 'active' ? theme.font.weight.semibold : theme.font.weight.medium};
  color: ${({ theme, $state }) => ($state === 'todo' ? theme.color.fg[3] : theme.color.fg[1])};

  ${MOBILE} {
    flex: 1;
    height: 4px;
    border-radius: ${({ theme }) => theme.radius.pill};
    background: ${({ theme, $state }) =>
      $state === 'todo' ? theme.color.ink[100] : theme.color.indigo[300]};
  }
`;

export const StepNum = styled.span<{ $state: FlowStepState }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  font-size: ${({ theme }) => theme.font.size.xs};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  line-height: 1;
  border: 1.5px solid ${({ theme }) => theme.color.border[2]};
  ${({ theme, $state }) =>
    $state === 'active' &&
    css`
      background: ${theme.color.indigo[600]};
      border-color: ${theme.color.indigo[600]};
      color: ${theme.color.fgOnAccent};
    `}
  ${({ theme, $state }) =>
    $state === 'done' &&
    css`
      background: ${theme.color.success[500]};
      border-color: ${theme.color.success[500]};
      color: ${theme.color.fgOnAccent};
    `}
  ${MOBILE} {
    display: none;
  }
`;

export const StepLabel = styled.span`
  ${MOBILE} {
    ${visuallyHidden}
  }
`;

/** 12px each side of the line, like the canvas stepper gap (8px item gap + 4px). */
export const StepSep = styled.span`
  width: 32px;
  margin-right: ${({ theme }) => theme.space[1]};
  height: 1.5px;
  background: ${({ theme }) => theme.color.border[2]};
  ${MOBILE} {
    display: none;
  }
`;
