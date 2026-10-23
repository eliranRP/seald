import { Navigate, useParams } from 'react-router-dom';
import { useAuth } from '@/providers/AuthProvider';

/**
 * `/document/:id/sent` no longer has a page: after Send the user lands on
 * the Documents list, which shows the confirmation toast and the new row.
 * Old links and any caller still navigating here are sent on with the same
 * `justSent` state the editor passes. Guest senders have no Documents list
 * (it needs an account), so they go back to the editor.
 */
export function SentRedirect() {
  const { id } = useParams<{ id: string }>();
  const { user, guest } = useAuth();
  if (!user && guest) return <Navigate to="/document/new" replace />;
  return <Navigate to="/documents" replace state={id ? { justSent: id } : null} />;
}
