import styled from 'styled-components';

export const Stack = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[6]};
  width: 100%;
  max-width: 720px;
  margin: 0 auto;
  min-width: 0;
`;

export const Intro = styled.p`
  margin: 0;
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
  font-size: ${({ theme }) => theme.font.size.body};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.fg[1]};
`;

export const Actions = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]};
`;

export const DisclosureButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[1]};
  min-height: 44px;
  padding: 0 ${({ theme }) => theme.space[2]};
  border: none;
  background: transparent;
  font: inherit;
  font-size: ${({ theme }) => theme.font.size.bodySm};
  color: ${({ theme }) => theme.color.indigo[600]};
  cursor: pointer;
  border-radius: ${({ theme }) => theme.radius.sm};

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.color.indigo[500]};
    outline-offset: 2px;
  }
`;

export const AdvancedBox = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[3]};
  padding: ${({ theme }) => theme.space[4]};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.color.bg.sunken};
`;

export const Field = styled.label`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[1]};
  font-size: ${({ theme }) => theme.font.size.bodySm};
  color: ${({ theme }) => theme.color.fg[2]};
`;

export const TextInput = styled.input`
  min-height: 44px;
  padding: 0 ${({ theme }) => theme.space[3]};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.sm};
  font: inherit;
  font-size: 16px;
  color: ${({ theme }) => theme.color.fg[1]};
  background: ${({ theme }) => theme.color.paper};

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.color.indigo[500]};
    outline-offset: 1px;
  }
`;

export const Fieldset = styled.fieldset`
  margin: 0;
  padding: 0;
  border: none;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[1]};
  min-width: 0;
`;

export const Legend = styled.legend`
  padding: 0;
  margin-bottom: ${({ theme }) => theme.space[1]};
  font-size: ${({ theme }) => theme.font.size.bodySm};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.fg[2]};
`;

export const ChoiceRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.space[2]};
`;

export const Choice = styled.label`
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
  min-height: 44px;
  padding: 0 ${({ theme }) => theme.space[3]};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.sm};
  font-size: ${({ theme }) => theme.font.size.body};
  color: ${({ theme }) => theme.color.fg[1]};
  background: ${({ theme }) => theme.color.paper};
  cursor: pointer;
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

export const KeyListRoot = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.color.paper};
  overflow: hidden;
`;

export const KeyRow = styled.li`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[2]};
  padding: ${({ theme }) => theme.space[3]} ${({ theme }) => theme.space[4]};

  & + & {
    border-top: 1px solid ${({ theme }) => theme.color.border[1]};
  }
`;

export const KeyMain = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${({ theme }) => theme.space[3]};
  min-width: 0;
`;

export const KeyText = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
`;

export const KeyName = styled.span`
  font-size: ${({ theme }) => theme.font.size.body};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.fg[1]};
  overflow-wrap: anywhere;
`;

export const KeyMeta = styled.span`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
  font-size: ${({ theme }) => theme.font.size.caption};
  color: ${({ theme }) => theme.color.fg[3]};
`;

export const Mono = styled.code`
  font-family: ${({ theme }) => theme.font.mono};
  overflow-wrap: anywhere;
`;

export const Detail = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[1]};
  font-size: ${({ theme }) => theme.font.size.caption};
  color: ${({ theme }) => theme.color.fg[3]};
`;

export const ScopeList = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.space[1]};
`;

export const ScopeChip = styled.li`
  padding: 2px ${({ theme }) => theme.space[2]};
  border-radius: ${({ theme }) => theme.radius.sm};
  background: ${({ theme }) => theme.color.bg.sunken};
  color: ${({ theme }) => theme.color.fg[2]};
`;

export const TileGrid = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: ${({ theme }) => theme.space[3]};
`;

export const Tile = styled.li`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${({ theme }) => theme.space[2]};
  min-height: 44px;
  padding: ${({ theme }) => theme.space[3]};
  border: 1px dashed ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.md};
  font-size: ${({ theme }) => theme.font.size.body};
  color: ${({ theme }) => theme.color.fg[3]};
`;

export const DialogActions = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[2]};
  margin-top: ${({ theme }) => theme.space[4]};
`;
