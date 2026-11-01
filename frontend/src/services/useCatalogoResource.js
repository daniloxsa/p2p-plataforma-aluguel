import { useEffect, useState } from 'react';
import { catalogoApi } from '../api/catalogo';

// Refresh before signed URLs expire and when returning to the tab.
export function useCatalogoResource(key, detail = false) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState({});
  const requestKey = JSON.stringify([key, detail, attempt]);
  useEffect(() => {
    let active = true;
    (detail ? catalogoApi.detail(key) : catalogoApi.list(key)).then(data => {
      if (active) setState({ requestKey, data });
    }).catch(error => {
      if (active) setState({ requestKey, error });
    });
    return () => { active = false; };
  }, [key, detail, requestKey]);
  useEffect(() => {
    const refresh = () => setAttempt(n => n + 1);
    const visible = () => { if (document.visibilityState === 'visible') refresh(); };
    const timer = setInterval(refresh, 45000);
    document.addEventListener('visibilitychange', visible);
    window.addEventListener('focus', refresh);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', visible); window.removeEventListener('focus', refresh); };
  }, []);
  return { ...(state.requestKey === requestKey ? state : { loading: true }), retry: () => setAttempt(n => n + 1) };
}
