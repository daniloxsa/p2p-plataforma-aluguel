import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useApp } from "../store/AppContext";

export default function ProtectedRoute() {
  const { isAuthenticated, isAuthLoading } = useApp();
  const location = useLocation();
  if (isAuthLoading) return <div className="container page" role="status">Verificando sessão...</div>;
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return <Outlet />;
}
