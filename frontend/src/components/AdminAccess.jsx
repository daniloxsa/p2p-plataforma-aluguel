import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useApp } from '../store/AppContext';
import { adminApi, onAdminDenied } from '../api/admin';
const AdminContext = createContext(null);
export const useAdminAccess = () => useContext(AdminContext);
export function AdminAccessProvider({ children }) {
  const { user, isAuthenticated, isAuthLoading } = useApp();
  const [state,setState] = useState({ checking: true });
  const generation = useRef(0), pending = useRef(null);
  const identity = user?.id;
  async function verify() {
    if (!isAuthenticated || isAuthLoading) return;
    if (pending.current) return pending.current;
    const request = generation.current;
    setState({ checking: true, identity });
    const operation = adminApi.me().then(account => {
      if (request === generation.current) setState({ allowed: account.papel === 'ADMIN' && account.id === identity, identity });
    }).catch(error => {
      if (request === generation.current) setState({ allowed: false, identity, denied: error.status === 403, error: error.message });
    }).finally(() => { if (pending.current === operation) pending.current = null; });
    pending.current = operation; return operation;
  }
  useEffect(() => {
    generation.current++; pending.current = null;
    if (isAuthenticated && !isAuthLoading) void verify(); else setState({ allowed: false, checking: isAuthLoading });
    return () => { generation.current++; };
  }, [identity,isAuthenticated,isAuthLoading]);
  useEffect(() => onAdminDenied(() => { generation.current++; setState({ allowed: false, denied: true, identity }); }), [identity]);
  return <AdminContext.Provider value={{ ...state, allowed: Boolean(state.allowed && state.identity === identity && isAuthenticated && !isAuthLoading), verify }}>{children}</AdminContext.Provider>;
}
export default function AdminRoute() {
  const access = useAdminAccess(), location = useLocation();
  useEffect(() => { void access.verify(); }, [location.pathname]);
  if (access.checking) return <div className="container page" role="status">Verificando acesso administrativo...</div>;
  if (!access.allowed) return <div className="container page"><div className="alert err" role="alert">{access.denied ? 'Acesso administrativo negado.' : access.error || 'Acesso administrativo indisponível.'}</div><button className="btn ghost" onClick={() => access.verify()}>Verificar novamente</button></div>;
  return <Outlet />;
}
