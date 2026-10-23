import { useNavigate } from 'react-router-dom';
import { HeaderBell } from '@/components/HeaderBell';
import { usePendingApprovalCount } from './approvalsApi';

/**
 * The header bell: pending approvals, linking to the queue. The caller
 * renders it only for a signed-in owner with the feature on, so the count
 * is never fetched for a guest or when the flag is off.
 */
export function ApprovalsBell() {
  const navigate = useNavigate();
  const { data } = usePendingApprovalCount(true);
  return (
    <HeaderBell
      count={data ?? 0}
      onClick={() => {
        navigate('/settings/approvals');
      }}
    />
  );
}
