import styled from 'styled-components';

export const Page = styled.div`
  min-height: 100vh;
  background: ${({ theme }) => theme.color.ink[100]};
  font-family: ${({ theme }) => theme.font.sans};
  color: ${({ theme }) => theme.color.fg[2]};
`;

export const Inner = styled.div`
  max-width: 560px;
  margin: 0 auto;
  padding: 48px 24px 80px;
`;

export const Chip = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 4px 12px;
  border-radius: ${({ theme }) => theme.radius.pill};
  background: ${({ theme }) => theme.color.indigo[50]};
  color: ${({ theme }) => theme.color.indigo[700]};
  font-size: ${({ theme }) => theme.font.size.caption};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  margin-bottom: ${({ theme }) => theme.space[5]};
`;

export const Hero = styled.h1`
  font-family: ${({ theme }) => theme.font.serif};
  font-size: 40px;
  font-weight: ${({ theme }) => theme.font.weight.medium};
  color: ${({ theme }) => theme.color.fg[1]};
  letter-spacing: -0.02em;
  line-height: 1.1;
  margin: 0;
`;

export const Subhero = styled.p`
  font-size: 15px;
  color: ${({ theme }) => theme.color.fg[3]};
  margin: ${({ theme }) => theme.space[4]} 0 0;
  line-height: 1.6;
`;

export const IdCard = styled.div`
  margin-top: ${({ theme }) => theme.space[8]};
  background: ${({ theme }) => theme.color.paper};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.lg};
  padding: 24px;
`;

export const SigningAsLabel = styled.div`
  font-size: ${({ theme }) => theme.font.size.micro};
  font-weight: ${({ theme }) => theme.font.weight.bold};
  letter-spacing: 0.08em;
  color: ${({ theme }) => theme.color.fg[3]};
  text-transform: uppercase;
  margin-bottom: ${({ theme }) => theme.space[4]};
`;

export const IdRow = styled.div`
  display: flex;
  align-items: center;
  gap: 14px;
`;

export const IdName = styled.div`
  font-size: ${({ theme }) => theme.font.size.bodySm};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.fg[1]};
`;

export const IdEmail = styled.div`
  font-size: ${({ theme }) => theme.font.size.caption};
  color: ${({ theme }) => theme.color.fg[3]};
  margin-top: 2px;
`;

export const NotMe = styled.button`
  background: transparent;
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.sm};
  padding: 6px 12px;
  font-size: ${({ theme }) => theme.font.size.caption};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.fg[2]};
  cursor: pointer;
`;

export const TosRow = styled.label`
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-top: ${({ theme }) => theme.space[5]};
  padding-top: ${({ theme }) => theme.space[5]};
  border-top: 1px solid ${({ theme }) => theme.color.border[1]};
  font-size: ${({ theme }) => theme.font.size.caption};
  color: ${({ theme }) => theme.color.fg[2]};
  cursor: pointer;
  line-height: 1.55;
`;

export const Checkbox = styled.input`
  width: 18px;
  height: 18px;
  margin-top: 1px;
  accent-color: ${({ theme }) => theme.color.ink[900]};
  cursor: pointer;
`;

export const PrimaryBtn = styled.button`
  margin-top: ${({ theme }) => theme.space[6]};
  width: 100%;
  height: 52px;
  border: none;
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.color.ink[900]};
  color: ${({ theme }) => theme.color.paper};
  font-size: 15px;
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  &:disabled {
    background: ${({ theme }) => theme.color.ink[300]};
    cursor: not-allowed;
  }
`;

export const DeclineLink = styled.button`
  margin-top: ${({ theme }) => theme.space[4]};
  background: transparent;
  border: none;
  color: ${({ theme }) => theme.color.fg[3]};
  font-size: ${({ theme }) => theme.font.size.caption};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  text-align: center;
  display: block;
  width: 100%;
  cursor: pointer;
  text-decoration: underline;
`;

export const ErrorBanner = styled.div`
  margin-top: ${({ theme }) => theme.space[4]};
  background: ${({ theme }) => theme.color.danger[50]};
  border: 1px solid ${({ theme }) => theme.color.danger[500]};
  color: ${({ theme }) => theme.color.danger[700]};
  font-size: ${({ theme }) => theme.font.size.caption};
  padding: 10px 12px;
  border-radius: ${({ theme }) => theme.radius.sm};
`;
