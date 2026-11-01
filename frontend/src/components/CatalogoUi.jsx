import { useEffect, useState } from 'react';

export function CatalogPhoto({ photo, alt, large = false }) {
  const [failed, setFailed] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  const expiry = Date.parse(photo?.expira_em);
  useEffect(() => {
    if (!Number.isFinite(expiry)) return;
    const timer = setTimeout(() => setNow(Date.now()), Math.max(0, expiry - Date.now()));
    return () => clearTimeout(timer);
  }, [expiry]);
  if (!photo?.url || failed === photo.url || !Number.isFinite(expiry) || expiry <= now)
    return <div className={`catalog-photo-placeholder ${large ? 'large' : ''}`} role="img" aria-label="Fotografia indisponível">Fotografia indisponível</div>;
  return <img className={`catalog-photo ${large ? 'large' : ''}`} src={photo.url} alt={alt} loading={large ? 'eager' : 'lazy'} referrerPolicy="no-referrer" onError={() => setFailed(photo.url)} />;
}

export function CatalogError({ error, retry }) {
  return <div className="alert err" role="alert"><p>{error?.status === 404 ? 'Este anúncio não está mais disponível.' : 'Não foi possível carregar o catálogo. Tente novamente.'}</p><button type="button" className="btn" onClick={retry}>Tentar novamente</button></div>;
}
