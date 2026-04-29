import styled from 'styled-components';

export const Main = styled.div`
  flex: 1 1 auto;
  min-width: 0;
  overflow: auto;
  padding: ${({ theme }) => theme.space[12]} ${({ theme }) => theme.space[12]}
    ${({ theme }) => theme.space[20]};
`;

export const Inner = styled.div`
  max-width: 1320px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
`;

export const HeaderSlot = styled.div`
  margin-bottom: ${({ theme }) => theme.space[8]};
`;

export const Lede = styled.p`
  margin: ${({ theme }) => theme.space[2]} 0 0;
  max-width: 560px;
  font-size: 14px;
  line-height: 1.55;
  color: ${({ theme }) => theme.color.fg[3]};
`;

export const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: ${({ theme }) => theme.space[5]};
  margin-top: ${({ theme }) => theme.space[6]};
`;

export const CreateCard = styled.button`
  all: unset;
  cursor: pointer;
  background: ${({ theme }) => theme.color.paper};
  border: 1.5px dashed ${({ theme }) => theme.color.indigo[300]};
  border-radius: ${({ theme }) => theme.radius.lg};
  padding: ${({ theme }) => theme.space[6]};
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: ${({ theme }) => theme.space[3]};
  min-height: 208px;
  text-align: left;
  transition:
    background ${({ theme }) => theme.motion.durFast} ${({ theme }) => theme.motion.easeStandard},
    border-color ${({ theme }) => theme.motion.durFast} ${({ theme }) => theme.motion.easeStandard};
  &:hover,
  &:focus-visible {
    background: ${({ theme }) => theme.color.indigo[50]};
    border-color: ${({ theme }) => theme.color.indigo[500]};
  }
  &:focus-visible {
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
`;

export const CreateBadge = styled.span`
  width: 44px;
  height: 44px;
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.color.indigo[100]};
  color: ${({ theme }) => theme.color.indigo[700]};
  display: inline-flex;
  align-items: center;
  justify-content: center;
`;

export const CreateTitle = styled.span`
  font-family: ${({ theme }) => theme.font.serif};
  font-size: 22px;
  font-weight: ${({ theme }) => theme.font.weight.medium};
  color: ${({ theme }) => theme.color.fg[1]};
  letter-spacing: -0.01em;
`;

export const CreateSub = styled.span`
  font-size: 13px;
  color: ${({ theme }) => theme.color.fg[3]};
  line-height: 1.5;
`;
