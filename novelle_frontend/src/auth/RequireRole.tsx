import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/auth/AuthProvider';
import { FullPageSpinner } from '@/components/common/FullPageSpinner';
import ForbiddenPage from '@/pages/errors/ForbiddenPage';
import type { Role } from '@/types/user';

interface RequireRoleProps {
  /** Allowed roles; omit to allow any logged-in user. */
  roles?: Role[];
  children?: ReactNode;
}

/**
 * Route guard. Guest → /login?redirect=<current path>; wrong role → 403 page. Hiding links is only a
 * convenience: the backend checks the role again on every request.
 */
export function RequireRole({ roles, children }: RequireRoleProps) {
  const { status, user } = useAuth();
  const location = useLocation();

  if (status === 'loading') return <FullPageSpinner />;

  if (!user) {
    const redirect = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?redirect=${redirect}`} replace />;
  }

  if (roles && !roles.includes(user.role)) return <ForbiddenPage />;

  return children ?? <Outlet />;
}
