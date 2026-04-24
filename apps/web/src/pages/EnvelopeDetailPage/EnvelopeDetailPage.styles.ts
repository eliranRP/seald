import styled from 'styled-components';

export const Wrap = styled.div`
  min-height: 100vh;
  background: ${({ theme }) => theme.color.ink[100]};
  font-family: ${({ theme }) => theme.font.sans};
`;

export const Inner = styled.div`
  max-width: 720px;
  margin: 0 auto;
  padding: 48px 24px 80px;
`;

export const Card = styled.section`
  background: ${({ theme }) => theme.color.paper};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.lg};
  padding: ${({ theme }) => `${theme.space[6]} ${theme.space[8]}`};
`;

export const HeadRow = styled.header`
  display: flex;
  align-items: flex-start;
  gap: ${({ theme }) => theme.space[5]};
  margin-bottom: ${({ theme }) => theme.space[5]};
`;

export const HeadText = styled.div`
  flex: 1;
  min-width: 0;
`;

export const Title = styled.h1`
  font-family: ${({ theme }) => theme.font.serif};
  font-size: 30px;
  line-height: 1.15;
  letter-spacing: -0.01em;
  margin: 0;
  color: ${({ theme }) => theme.color.fg[1]};
  overflow-wrap: anywhere;
`;

export const Code = styled.div`
  margin-top: ${({ theme }) => theme.space[2]};
  font-family: ${({ theme }) => theme.font.mono};
  font-size: ${({ theme }) => theme.font.size.caption};
  color: ${({ theme }) => theme.color.fg[3]};
`;

export const Section = styled.section`
  margin-top: ${({ theme }) => theme.space[6]};
  padding-top: ${({ theme }) => theme.space[5]};
  border-top: 1px solid ${({ theme }) => theme.color.border[1]};
`;

export const SectionHead = styled.h2`
  font-size: ${({ theme }) => theme.font.size.micro};
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-weight: ${({ theme }) => theme.font.weight.bold};
  color: ${({ theme }) => theme.color.fg[3]};
  margin: 0 0 ${({ theme }) => theme.space[3]};
`;

export const SignerList = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[2]};
`;

export const SignerItem = styled.li`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[4]};
  padding: ${({ theme }) => `${theme.space[3]} ${theme.space[4]}`};
  background: ${({ theme }) => theme.color.ink[50]};
  border-radius: ${({ theme }) => theme.radius.md};
`;

export const SignerNames = styled.div`
  flex: 1;
  min-width: 0;
`;

export const SignerName = styled.div`
  font-size: ${({ theme }) => theme.font.size.bodySm};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.fg[1]};
`;

export const SignerEmail = styled.div`
  margin-top: 2px;
  font-size: ${({ theme }) => theme.font.size.caption};
  color: ${({ theme }) => theme.color.fg[3]};
`;

export const MetaGrid = styled.dl`
  margin: 0;
  display: grid;
  grid-template-columns: 160px 1fr;
  row-gap: ${({ theme }) => theme.space[2]};
  column-gap: ${({ theme }) => theme.space[4]};
  font-size: ${({ theme }) => theme.font.size.caption};
`;

export const MetaKey = styled.dt`
  color: ${({ theme }) => theme.color.fg[3]};
`;

export const MetaValue = styled.dd`
  margin: 0;
  color: ${({ theme }) => theme.color.fg[1]};
  font-family: ${({ theme }) => theme.font.mono};
`;

export const Actions = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.space[2]};
  margin-top: ${({ theme }) => theme.space[5]};
`;
