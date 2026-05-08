import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuth } from '../auth/useAuth';
import { LoadingState } from '../components/DataState';

export function RequireAuth() {
  const auth = useAuth();
  const location = useLocation();

  if (auth.state === 'checking') {
    return (
      <div className="centered-page">
        <LoadingState label="Checking session" />
      </div>
    );
  }

  if (!auth.isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}
