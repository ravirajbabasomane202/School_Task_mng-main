import { Navigate, Outlet, useLocation } from 'react-router-dom';
import type { Role } from '../constants/roles';
import { useAppSelector } from '../store/hooks';

interface ProtectedRouteProps {
  allowedRoles?: Role[];
}

function ProtectedRoute({ allowedRoles }: ProtectedRouteProps) {
  const location = useLocation();
  const { isAuthenticated, user } = useAppSelector((state) => state.auth);

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (allowedRoles && (!user || !allowedRoles.includes(user.role))) {
    return <Navigate to="/unauthorized" replace />;
  }

  return <Outlet />;
}

export default ProtectedRoute;
