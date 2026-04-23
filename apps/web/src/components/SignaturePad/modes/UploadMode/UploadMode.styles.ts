import styled from 'styled-components';

export const Wrap = styled.div`
  display: grid;
  gap: ${({ theme }) => theme.space[4]};
`;

export const DropZone = styled.div<{ $isDragging: boolean }>`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: ${({ theme }) => theme.space[2]};
  min-height: 140px;
  padding: ${({ theme }) => theme.space[6]};
  background: ${({ theme, $isDragging }) =>
    $isDragging ? theme.color.bg.subtle : theme.color.bg.surface};
  border: 1px dashed ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.lg};
  color: ${({ theme }) => theme.color.fg[2]};
  cursor: pointer;
  outline: none;

  &:focus-visible {
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
`;

export const HiddenInput = styled.input`
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

export const PreviewRow = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]};
  padding: ${({ theme }) => theme.space[3]};
  background: ${({ theme }) => theme.color.bg.surface};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.lg};
  color: ${({ theme }) => theme.color.ink[900]};
`;

export const Thumb = styled.img`
  width: 56px;
  height: 56px;
  object-fit: contain;
  border-radius: ${({ theme }) => theme.radius.sm};
  background: ${({ theme }) => theme.color.bg.subtle};
`;

export const FileName = styled.span`
  font-size: ${({ theme }) => theme.font.size.bodySm};
  color: ${({ theme }) => theme.color.fg[1]};
`;

export const ErrorText = styled.div`
  padding: ${({ theme }) => theme.space[3]};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.lg};
  color: ${({ theme }) => theme.color.fg[1]};
  background: ${({ theme }) => theme.color.bg.subtle};
  font-size: ${({ theme }) => theme.font.size.bodySm};
`;

export const Actions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: ${({ theme }) => theme.space[2]};
`;
