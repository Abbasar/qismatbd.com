import { Navigate } from 'react-router-dom';
import { getCurrentUser, isAdmin } from '../utils/auth';

function RequireAuth({ children, adminOnly = false }) {
  const user = getCurrentUser();
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  if (adminOnly && !isAdmin()) {
    return <Navigate to="/" replace />;
  }
  return children;
}

export default RequireAuth;
