import { useCallback, useEffect, useRef, useState } from 'react';
import { fotosVeiculosApi as api } from '../api/fotosVeiculos';

export default function VehiclePhotos({ vehicle }) {
  const [photos, setPhotos] = useState([]);
  const [selected, setSelected] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [confirm, setConfirm] = useState(null);
  const pending = useRef(false);
  const previews = useRef([]);
  const mounted = useRef(false);
  const fileInput = useRef(null);
  const disabled = Boolean(vehicle.desativado_em);
  const load = useCallback(async () => {
    const rows = await api.list(vehicle.id);
    if (mounted.current) setPhotos(rows);
  }, [vehicle.id]);
  useEffect(() => {
    mounted.current = true;
    load().catch(err => { if (mounted.current) setError(err.message); })
      .finally(() => { if (mounted.current) setLoading(false); });
    return () => { mounted.current = false; previews.current.forEach(item => URL.revokeObjectURL(item.url)); };
  }, [load]);
  // Refresh signed URLs before the earliest expiry; refresh again on tab focus.
  useEffect(() => {
    const expiry = Math.min(...photos.map(photo => Date.parse(photo.expira_em)).filter(Number.isFinite));
    const refresh = () => { if (!pending.current) load().catch(err => { if (mounted.current) setError(err.message); }); };
    const timer = Number.isFinite(expiry) ? setTimeout(refresh, Math.max(10000, expiry - Date.now() - 30000)) : null;
    window.addEventListener('focus', refresh);
    return () => { clearTimeout(timer); window.removeEventListener('focus', refresh); };
  }, [photos, load]);
  function updateSelection(items) { previews.current = items; setSelected(items); }
  function clearSelection() { previews.current.forEach(item => URL.revokeObjectURL(item.url)); updateSelection([]); }
  function choose(event) {
    const files = [...event.target.files]; event.target.value = '';
    setError(''); setMessage('');
    if (photos.length + selected.length + files.length > 10) { setError('Limite de 10 fotos por veículo. Remova imagens da seleção.'); return; }
    const invalid = files.find(file => !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024 || !file.size);
    if (invalid) { setError('Selecione JPEG, PNG ou WebP de até 5 MB por arquivo.'); return; }
    const keys = new Set(selected.map(item => item.key));
    const items = [];
    for (const file of files) {
      const key = `${file.name}:${file.size}:${file.lastModified}`;
      if (keys.has(key)) { setError('Arquivo já selecionado.'); continue; }
      keys.add(key); items.push({ file, key, url: URL.createObjectURL(file) });
    }
    updateSelection([...selected, ...items]);
  }
  async function action(operation, success) {
    if (pending.current || disabled) return;
    pending.current = true; setBusy(true); setError(''); setMessage('');
    try { await operation(); if (mounted.current) { await load(); setMessage(success); } }
    catch (err) { if (mounted.current) setError(err.message); }
    finally { pending.current = false; if (mounted.current) setBusy(false); }
  }
  function move(index, delta) {
    const ids = photos.map(photo => photo.id);
    [ids[index], ids[index + delta]] = [ids[index + delta], ids[index]];
    void action(() => api.reorder(vehicle.id, ids), 'Ordem atualizada.');
  }
  const remaining = Math.max(0, 10 - photos.length - selected.length);
  return <section aria-label="Gerenciar fotos" id="fotos" className="vehicle-photos" aria-busy={loading || busy}>
    <h3>Fotos do veículo</h3>
    <p className="muted vehicle-photos-intro">{photos.length} de 10 fotos · Defina a imagem de capa para identificar seu veículo.</p>
    {disabled && <div className="alert warn">Veículo desativado. Fotos preservadas para consulta privada.</div>}
    {error && <div className="alert err" role="alert">{error} <button className="btn small" disabled={busy} onClick={() => { setError(''); load().catch(err => setError(err.message)); }}>Atualizar galeria</button></div>}
    {message && <p className="alert ok" role="status">{message}</p>}
    {loading && <p role="status">Carregando fotos...</p>}
    {!disabled && <fieldset disabled={busy || loading} className="vehicle-photos-upload">
      <legend className="vehicle-photos-sr-only">Adicionar fotos ao veículo</legend>
      <input ref={fileInput} className="vehicle-photos-sr-only" aria-label="Selecionar imagens" type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={choose} disabled={remaining === 0} />
      <div className="vehicle-photos-upload-bar">
        <span className="vehicle-photos-upload-icon" aria-hidden="true">+</span>
        <div className="vehicle-photos-upload-copy">
          <h4>Adicionar fotos</h4>
          <p className="muted">Escolha imagens JPEG, PNG ou WebP · até 5 MB por foto.</p>
        </div>
        <button type="button" className="btn primary" disabled={remaining === 0} onClick={() => fileInput.current?.click()}>Selecionar imagens</button>
      </div>
      <p className="muted vehicle-photos-capacity">{remaining === 0 ? 'Limite de 10 imagens atingido.' : `${remaining} vagas restantes.`}</p>
      {selected.length > 0 && <>
        <div className="vehicle-photos-selection-heading">
          <h4>Selecionadas para envio <span className="muted">({selected.length})</span></h4>
          <span className="muted">Confira as imagens antes de enviar.</span>
        </div>
        <div className="vehicle-photos-grid">{selected.map(item => <figure key={item.key} className="vehicle-photo-card">
          <div className="vehicle-photo-image"><img src={item.url} alt={`Prévia de ${item.file.name}`} /></div>
          <figcaption className="vehicle-photo-caption">
            <span className="vehicle-photo-filename" title={item.file.name}>{item.file.name}</span>
            <button type="button" className="btn ghost small" aria-label={`Remover seleção de ${item.file.name}`} onClick={() => { URL.revokeObjectURL(item.url); updateSelection(selected.filter(s => s.key !== item.key)); }}>Remover</button>
          </figcaption>
        </figure>)}</div>
        <div className="vehicle-photos-send"><button type="button" className="btn primary" disabled={busy} onClick={() => action(async () => { await api.upload(vehicle.id, selected.map(item => item.file)); clearSelection(); }, 'Fotos enviadas.')}>Enviar {selected.length} foto(s)</button></div>
      </>}
    </fieldset>}
    {busy && <p role="status">Processando fotos. Aguarde...</p>}
    <div className="vehicle-photos-gallery-heading">
      <h4>Galeria</h4>
      <p className="muted">{disabled ? 'Fotos salvas do veículo.' : 'Organize a ordem das fotos ou selecione uma nova capa.'}</p>
    </div>
    {!loading && !photos.length && <p className="muted">Nenhuma foto cadastrada.</p>}
    <div className="vehicle-photos-grid">{photos.map((photo, index) => <figure key={photo.id} className={`vehicle-photo-card${photo.principal ? ' vehicle-photo-card-primary' : ''}`}>
      <div className="vehicle-photo-image">
        <img src={photo.url} alt={photo.descricao || `Foto ${index + 1} do veículo`} referrerPolicy="no-referrer" />
        {photo.principal && <strong className="vehicle-photo-primary"><span aria-hidden="true">★ </span>Principal</strong>}
      </div>
      <figcaption className="vehicle-photo-caption">
        <strong>Foto {index + 1}</strong>
        {!disabled && <div className="vehicle-photo-actions">
          <button type="button" className="btn ghost small vehicle-photo-cover" disabled={busy || photo.principal} onClick={() => action(() => api.principal(vehicle.id, photo.id), 'Foto principal atualizada.')}>Definir principal</button>
          <button type="button" className="btn ghost small vehicle-photo-move" aria-label={`Mover foto ${index + 1} para antes`} disabled={busy || index === 0} onClick={() => move(index, -1)}>←</button>
          <button type="button" className="btn ghost small vehicle-photo-move" aria-label={`Mover foto ${index + 1} para depois`} disabled={busy || index === photos.length - 1} onClick={() => move(index, 1)}>→</button>
          <button type="button" className="btn danger small" aria-label={`Excluir foto ${index + 1}`} disabled={busy} onClick={() => setConfirm(photo)}>Excluir</button>
        </div>}
      </figcaption>
    </figure>)}
      {!disabled && !loading && remaining > 0 && <button type="button" className="vehicle-photo-add" disabled={busy} onClick={() => fileInput.current?.click()}>
        <span className="vehicle-photo-add-icon" aria-hidden="true">+</span>
        <strong>Adicione mais fotos</strong>
        <span className="muted">Até {remaining} {remaining === 1 ? 'imagem adicional' : 'imagens adicionais'}</span>
      </button>}
    </div>
    {confirm && <div role="dialog" aria-modal="true" aria-label="Excluir foto" className="alert warn">
      <p>Excluir esta foto do veículo?</p>
      <button className="btn danger" disabled={busy} onClick={() => action(async () => { await api.remove(vehicle.id, confirm.id); setConfirm(null); }, 'Foto excluída.')}>Confirmar exclusão</button>
      <button className="btn ghost" disabled={busy} onClick={() => setConfirm(null)}>Cancelar</button>
    </div>}
    <p className="vehicle-photos-note muted">As fotos ficam salvas na sua conta. Adicioná-las não publica automaticamente o veículo.</p>
  </section>;
}
