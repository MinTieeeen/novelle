import { useEffect } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthModal } from '@/auth/AuthModalProvider';
import { useAuth } from '@/auth/AuthProvider';
import type { AuthTab } from '@/components/auth/AuthModal';
import { FullPageSpinner } from '@/components/common/FullPageSpinner';
import HomePage from '@/pages/reader/HomePage';
import { safeRedirect } from '@/utils/redirect';

/**
 * A1 / A2: the home page with the login or register popup open (/login?redirect=…, /register).
 * Used by RequireRole and the 401 handler; the header opens the same popup in place instead.
 * Once logged in (here or in another tab), the visitor goes to `redirect` or home.
 */
export function AuthEntryPage({ tab }: { tab: AuthTab }) {
  const { user, status } = useAuth();
  const authModal = useAuthModal();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const redirect = safeRedirect(params.get('redirect'));

  useEffect(() => {
    if (status !== 'guest') return;
    authModal.open(tab, { onDismiss: () => navigate('/', { replace: true }) });
    // Leaving the route (back button, a link) closes the popup without the dismiss redirect.
    return () => authModal.close();
  }, [status, tab, authModal, navigate]);

  if (status === 'loading') return <FullPageSpinner />;
  if (user) return <Navigate to={redirect} replace />;
  return <HomePage />;
}
