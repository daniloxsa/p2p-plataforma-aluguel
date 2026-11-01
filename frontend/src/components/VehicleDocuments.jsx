import { useCallback, useEffect, useRef, useState } from 'react';
import { documentosVeiculosApi as api } from '../api/documentosVeiculos';

const labels = { PENDENTE: 'Aguardando análise', EM_ANALISE: 'Em análise', APROVADO: 'Documento aprovado', REJEITADO: 'Documento rejeitado', EXPIRADO: 'Documento expirado' };
export default function VehicleDocuments({ vehicle }) {
  const [data, setData] = useState(null), [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const preview = useRef(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const [signed, setSigned] = useState(null);
  const mounted = useRef(false), pending = useRef(false);
  const load = useCallback(async () => {
    const result = await api.list(vehicle.id);
    if (mounted.current) { setData(result); setSigned(null); }
  }, [vehicle.id]);
  useEffect(() => {
    mounted.current = true;
    const refresh = () => { if (!pending.current) load().catch(err => { if (mounted.current) setError(err.message); }); };
    load().catch(err => { if (mounted.current) setError(err.message); }).finally(() => { if (mounted.current) setLoading(false); });
    window.addEventListener('focus', refresh);
    return () => { mounted.current = false; window.removeEventListener('focus', refresh); };
  }, [load]);
  useEffect(() => {
    if (!selected?.type.startsWith('image/')) return;
    const url = URL.createObjectURL(selected);
    if (preview.current) preview.current.src = url;
    return () => URL.revokeObjectURL(url);
  }, [selected]);
  useEffect(() => {
    if (!signed) return;
    const timer = setTimeout(() => setSigned(null), Math.max(0, Date.parse(signed.expira_em) - Date.now()));
    return () => clearTimeout(timer);
  }, [signed]);
  const limit = data?.limite_bytes ?? 10 * 1024 * 1024;
  const disabled = Boolean(vehicle.desativado_em) || vehicle.status_cadastro === 'APROVADO' || !data?.pode_enviar;
  function choose(event) {
    const file = event.target.files?.[0]; event.target.value = '';
    setError(''); setMessage(''); setSelected(null);
    if (!file) return;
    const extension = /\.([a-z0-9]+)$/i.exec(file.name)?.[1]?.toLowerCase();
    const types = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
    if (!extension || types[extension] !== file.type || !file.size || file.size > limit) {
      setError(`Selecione PDF, JPEG, PNG ou WebP não vazio de até ${limit / 1024 / 1024} MB, com extensão compatível.`); return;
    }
    setSelected(file);
  }
  async function action(operation) {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError(''); setMessage('');
    try { await operation(); }
    catch (err) { if (mounted.current) setError(err.message); }
    finally { pending.current = false; if (mounted.current) setBusy(false); }
  }
  async function upload() {
    if (!selected || disabled) return;
    await action(async () => {
      const result = await api.upload(vehicle.id, selected);
      if (mounted.current) { setData(result); setSelected(null); setSigned(null); setMessage('CRLV enviado. Aguardando nova análise administrativa.'); }
    });
  }
  const doc = data?.documento;
  return <section className="vehicle-documents" aria-label="Documentação do veículo" aria-busy={loading || busy}>
    <div className="row"><h3>Documentação do veículo</h3><button className="btn ghost small" disabled={busy || loading} onClick={() => action(load)}>Atualizar documentação</button></div>
    {loading && <p role="status">Carregando documentação...</p>}
    {error && <p className="alert err" role="alert">{error}</p>}
    {message && <p className="alert ok" role="status">{message}</p>}
    {data && <>
      <span className="status">{doc ? labels[doc.status_validacao] || doc.status_validacao : 'Nenhum documento enviado'}</span>
      {doc && <article className="vehicle-document-current">
        <h4>CRLV mais recente</h4>
        <p className="muted">Enviado em {new Date(doc.criado_em).toLocaleString('pt-BR')}{doc.validade_ate ? ` · Validade: ${doc.validade_ate.slice(0, 10).split('-').reverse().join('/')}` : ''}</p>
        {doc.status_validacao === 'REJEITADO' && doc.motivo_rejeicao && <p className="alert warn">Motivo da rejeição: {doc.motivo_rejeicao}</p>}
        <button className="btn ghost small" disabled={busy} onClick={() => action(async () => { const result = await api.file(vehicle.id, doc.id); if (mounted.current) setSigned(result); })}>Consultar meu documento</button>
        {signed && <p><a className="btn ghost small" href={signed.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">Abrir documento (acesso temporário)</a></p>}
      </article>}
      {disabled ? <p className="alert warn">{data.bloqueio || 'Este veículo não permite envio de documentos.'}</p> : <fieldset disabled={busy} className="vehicle-photos-upload">
        <legend>{doc ? 'Reenviar CRLV' : 'Enviar CRLV'}</legend>
        <p className="muted">PDF, JPEG, PNG ou WebP · até {limit / 1024 / 1024} MB. O novo documento passará por análise. Os documentos anteriores serão preservados.</p>
        <label className="field">Escolher CRLV<input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={choose} /></label>
        {selected && <div className="vehicle-document-selection"><p>{selected.name} · {(selected.size / 1024 / 1024).toFixed(2)} MB</p>
          {selected.type.startsWith('image/') && <img ref={preview} className="vehicle-document-preview" alt="Prévia do CRLV selecionado" />}
          <button className="btn primary" disabled={busy} onClick={upload}>Enviar documento</button>
        </div>}
      </fieldset>}
    </>}
    {busy && <p role="status">Processando documento. Aguarde...</p>}
    <p className="muted">Acesso privado. O envio não aprova o veículo nem publica anúncios.</p>
  </section>;
}
