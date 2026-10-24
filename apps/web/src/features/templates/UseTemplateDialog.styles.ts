import styled from 'styled-components';

const MOBILE = '@media (max-width: 640px)';

/** One row per signer slot: dot, role name, the person picker (canvas `.role-row`). */
export const Roles = styled.div`
  display: flex;
  flex-direction: column;
`;

export const RoleRow = styled.div`
  display: grid;
  grid-template-columns: 12px 88px minmax(0, 1fr);
  align-items: start;
  gap: ${({ theme }) => theme.space[3]};
  min-height: 56px;
  padding: ${({ theme }) => `${theme.space[2]} 0`};
  border-top: 1px solid ${({ theme }) => theme.color.ink[150]};

  &:first-child {
    border-top: 0;
  }
  ${MOBILE} {
    grid-template-columns: 12px 72px minmax(0, 1fr);
  }
`;

export const RoleDot = styled.span<{ $color: string }>`
  width: 12px;
  height: 12px;
  margin-top: 18px;
  border-radius: 50%;
  background: ${({ $color }) => $color};
`;

export const RoleName = styled.span`
  margin-top: 14px;
  font-size: ${({ theme }) => theme.font.size.caption};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.fg[2]};
`;

/** The saved or replaced document (canvas `.file-card`). */
export const FileCard = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]};
  padding: ${({ theme }) => `${theme.space[3]} ${theme.space[4]}`};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.md};
  color: ${({ theme }) => theme.color.fg[2]};
`;

export const FileText = styled.div`
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

export const FileName = styled.span`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: ${({ theme }) => theme.font.size.bodySm};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.fg[1]};
`;

export const Quiet = styled.span`
  font-size: ${({ theme }) => theme.font.size.caption};
  color: ${({ theme }) => theme.color.fg[3]};
`;

/** Compact drop area for a replacement PDF (canvas `.dropzone`). */
export const Dropzone = styled.div<{ $over: boolean }>`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]};
  padding: ${({ theme }) => theme.space[5]};
  border: 1.5px dashed
    ${({ theme, $over }) => ($over ? theme.color.indigo[600] : theme.color.indigo[300])};
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme, $over }) => ($over ? theme.color.indigo[50] : 'transparent')};
  color: ${({ theme }) => theme.color.indigo[600]};
  text-align: center;
  transition: background-color ${({ theme }) => theme.motion.durFast}
    ${({ theme }) => theme.motion.easeStandard};
`;

export const DropTitle = styled.div`
  font-size: ${({ theme }) => theme.font.size.bodyMd};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.fg[1]};
`;

export const DropActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: ${({ theme }) => theme.space[2]};
`;

export const HiddenInput = styled.input`
  display: none;
`;

export const MetaLine = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
  font-size: ${({ theme }) => theme.font.size.caption};
  color: ${({ theme }) => theme.color.fg[3]};
`;

export const FootButtons = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: ${({ theme }) => theme.space[2]};
  width: 100%;
`;
