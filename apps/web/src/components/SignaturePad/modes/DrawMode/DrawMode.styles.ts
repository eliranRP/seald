import styled from 'styled-components';

export const Wrap = styled.div`
  display: grid;
  gap: ${({ theme }) => theme.space[4]};
`;

export const Canvas = styled.canvas`
  width: 100%;
  height: auto;
  background: ${({ theme }) => theme.color.bg.surface};
  border: 1px dashed ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.lg};
  touch-action: none;
  cursor: crosshair;
`;

export const Row = styled.div`
  display: flex;
  justify-content: space-between;
  gap: ${({ theme }) => theme.space[3]};
`;

export const Actions = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.space[2]};
`;

export const SrOnly = styled.div`
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
