import styled from 'styled-components';

export const Stack = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[6]};
  width: 100%;
  max-width: 960px;
  margin: 0 auto;
  min-width: 0;
`;

export const Intro = styled.p`
  margin: 0;
  max-width: 65ch;
  font-size: ${({ theme }) => theme.font.size.body};
  line-height: ${({ theme }) => theme.font.lineHeight.relaxed};
  color: ${({ theme }) => theme.color.fg[2]};
`;

export const Section = styled.section`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[3]};
  min-width: 0;
`;

export const SectionTitle = styled.h2`
  margin: 0;
  font-size: ${({ theme }) => theme.font.size.h5};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.fg[1]};
`;

export const Actions = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]};
`;

export const ColumnList = styled.ul`
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[2]};
`;

export const ColumnItem = styled.li`
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: ${({ theme }) => theme.space[2]};
  font-size: ${({ theme }) => theme.font.size.bodySm};
  color: ${({ theme }) => theme.color.fg[2]};
`;

export const Mono = styled.code`
  font-family: ${({ theme }) => theme.font.mono};
  font-size: ${({ theme }) => theme.font.size.caption};
  color: ${({ theme }) => theme.color.fg[1]};
  background: ${({ theme }) => theme.color.bg.sunken};
  padding: 2px ${({ theme }) => theme.space[1]};
  border-radius: ${({ theme }) => theme.radius.xs};
  overflow-wrap: anywhere;
`;

/** Label above control; capped at 480px so a short select isn't page-wide. */
export const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[1]};
  width: 100%;
  max-width: calc(${({ theme }) => theme.space[24]} * 5);
  font-size: ${({ theme }) => theme.font.size.bodySm};
  color: ${({ theme }) => theme.color.fg[2]};
`;

export const FieldLabel = styled.label`
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.fg[1]};
`;

export const FileInput = styled.input`
  min-height: 44px;
  padding: ${({ theme }) => theme.space[2]} ${({ theme }) => theme.space[3]};
  border: 1px dashed ${({ theme }) => theme.color.border[2]};
  border-radius: ${({ theme }) => theme.radius.sm};
  font: inherit;
  font-size: ${({ theme }) => theme.font.size.body};
  color: ${({ theme }) => theme.color.fg[1]};
  background: ${({ theme }) => theme.color.paper};
  max-width: 100%;
  cursor: pointer;

  /* The browser's grey "Choose File" button, drawn as our secondary button. */
  &::file-selector-button {
    margin-right: ${({ theme }) => theme.space[3]};
    padding: ${({ theme }) => `${theme.space[2]} ${theme.space[4]}`};
    border: 1px solid ${({ theme }) => theme.color.border[2]};
    border-radius: ${({ theme }) => theme.radius.sm};
    background: ${({ theme }) => theme.color.paper};
    color: ${({ theme }) => theme.color.fg[1]};
    font: inherit;
    font-size: ${({ theme }) => theme.font.size.bodySm};
    font-weight: ${({ theme }) => theme.font.weight.semibold};
    cursor: pointer;
  }
  &:hover::file-selector-button {
    background: ${({ theme }) => theme.color.bg.sunken};
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.color.indigo[500]};
    outline-offset: 2px;
  }
`;

export const Select = styled.select`
  min-height: 44px;
  padding: 0 ${({ theme }) => theme.space[3]};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.sm};
  font: inherit;
  font-size: ${({ theme }) => theme.font.size.body};
  color: ${({ theme }) => theme.color.fg[1]};
  background: ${({ theme }) => theme.color.paper};
  max-width: 100%;

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.color.indigo[500]};
    outline-offset: 1px;
  }
`;

export const Notice = styled.div<{ $tone?: 'error' | 'info' }>`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: ${({ theme }) => theme.space[2]};
  padding: ${({ theme }) => theme.space[3]} ${({ theme }) => theme.space[4]};
  border-radius: ${({ theme }) => theme.radius.md};
  border: 1px solid
    ${({ theme, $tone }) => ($tone === 'error' ? theme.color.danger[500] : theme.color.border[1])};
  background: ${({ theme, $tone }) =>
    $tone === 'error' ? theme.color.danger[50] : theme.color.bg.sunken};
  font-size: ${({ theme }) => theme.font.size.bodySm};
  color: ${({ theme }) => theme.color.fg[1]};
`;

export const SummaryLine = styled.p`
  margin: 0;
  font-size: ${({ theme }) => theme.font.size.body};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.fg[1]};
`;

export const TableScroll = styled.div`
  width: 100%;
  /* Desktop safety net only: under 640px the rows are cards and never scroll. */
  overflow-x: auto;
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.color.paper};

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.color.indigo[500]};
    outline-offset: 2px;
  }
`;

export const Table = styled.table`
  width: 100%;
  min-width: 560px;
  border-collapse: collapse;
  font-size: ${({ theme }) => theme.font.size.bodySm};
  color: ${({ theme }) => theme.color.fg[1]};
  text-align: left;

  caption {
    padding: ${({ theme }) => theme.space[3]} ${({ theme }) => theme.space[4]};
    text-align: left;
    font-weight: ${({ theme }) => theme.font.weight.semibold};
    color: ${({ theme }) => theme.color.fg[1]};
  }

  th,
  td {
    padding: ${({ theme }) => theme.space[3]} ${({ theme }) => theme.space[4]};
    vertical-align: top;
    border-top: 1px solid ${({ theme }) => theme.color.border[1]};
  }

  th {
    font-weight: ${({ theme }) => theme.font.weight.semibold};
    color: ${({ theme }) => theme.color.fg[2]};
    background: ${({ theme }) => theme.color.bg.sunken};
    white-space: nowrap;
  }

  /* The row number is a number: tabular figures so the column lines up. */
  tbody th[scope='row'] {
    font-variant-numeric: tabular-nums;
  }

  /*
   * Phones: no sideways scroll. Each row becomes a card. Line 1: recipients
   * (who) and the row number; line 2: the check/result; line 3: the title.
   */
  @media (max-width: 640px) {
    min-width: 0;

    thead {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
    }

    tbody tr {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      grid-template-areas:
        'who row'
        'state state'
        'title title';
      gap: ${({ theme }) => theme.space[2]};
      padding: ${({ theme }) => theme.space[3]} ${({ theme }) => theme.space[4]};
      border-top: 1px solid ${({ theme }) => theme.color.border[1]};
    }

    tbody th,
    tbody td {
      padding: 0;
      border-top: 0;
      background: transparent;
      min-width: 0;
    }

    tbody th[scope='row'] {
      grid-area: row;
      font-weight: ${({ theme }) => theme.font.weight.regular};
      color: ${({ theme }) => theme.color.fg[3]};
    }
    tbody th[scope='row']::before {
      content: 'Row ';
    }
    tbody td:nth-of-type(1) {
      grid-area: who;
    }
    tbody td:nth-of-type(2) {
      grid-area: title;
      color: ${({ theme }) => theme.color.fg[2]};
    }
    tbody td:nth-of-type(2)::before {
      content: 'Title: ';
      color: ${({ theme }) => theme.color.fg[3]};
    }
    tbody td:nth-of-type(3) {
      grid-area: state;
    }
  }
`;

export const Recipient = styled.div`
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow-wrap: anywhere;
`;

export const Muted = styled.span`
  color: ${({ theme }) => theme.color.fg[3]};
`;

export const ProblemList = styled.ul`
  margin: 0;
  padding-left: ${({ theme }) => theme.space[4]};
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[1]};
  color: ${({ theme }) => theme.color.danger[700]};
`;

export const ProgressBlock = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[2]};
`;

export const VisuallyHidden = styled.span`
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
`;

export const TextLink = styled.a`
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
  min-height: 44px;
  font-size: ${({ theme }) => theme.font.size.bodySm};
  color: ${({ theme }) => theme.color.indigo[600]};
  text-decoration: underline;
  border-radius: ${({ theme }) => theme.radius.sm};

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.color.indigo[500]};
    outline-offset: 2px;
  }
`;
