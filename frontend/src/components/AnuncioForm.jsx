import { useRef, useState } from 'react';
import { anuncioPayload, moneyFields, vehicleName } from '../services/anuncioValidation';

export default function AnuncioForm({ initial = {}, creating = false, vehicles = [], onSave, disabled = false, children }) {
  const [form, setForm] = useState(() => ({
    veiculo_id: initial.veiculo_id || '', titulo: initial.titulo || '', descricao: initial.descricao || '',
    preco_diaria: initial.preco_diaria ?? '', valor_caucao: initial.valor_caucao ?? '0.00',
    preco_seguro_dia: initial.preco_seguro_dia ?? '0.00', aceite_automatico: initial.aceite_automatico ?? false,
  }));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const available = vehicles.some(v => v.id === form.veiculo_id && !v.desativado_em);
  const change = (key, value) => setForm(current => ({ ...current, [key]: value }));

  async function submit(event) {
    event.preventDefault();
    if (pending.current || disabled) return;
    let data;
    try {
      data = anuncioPayload(form, creating);
      if (creating && !available) throw new Error('Selecione um veículo disponível da sua conta.');
      if (!creating) {
        const original = anuncioPayload({ ...initial, descricao: initial.descricao || '' });
        data = Object.fromEntries(Object.entries(data).filter(([key, value]) => value !== original[key]));
        if (!Object.keys(data).length) throw new Error('Altere ao menos um campo.');
      }
    } catch (err) { setError(err.message); return; }
    pending.current = true; setBusy(true); setError('');
    try { await onSave(data); }
    catch (err) { setError(err.message || 'Não foi possível salvar o anúncio.'); }
    finally { pending.current = false; setBusy(false); }
  }

  return <form className="anuncio-form" onSubmit={submit} noValidate aria-busy={busy}>
    <fieldset disabled={busy || disabled}>
      {creating && <div className="field">
        <label htmlFor="anuncio-veiculo">Veículo</label>
        <select id="anuncio-veiculo" value={form.veiculo_id} onChange={e => change('veiculo_id', e.target.value)} required>
          <option value="">Selecione um veículo</option>
          {form.veiculo_id && !available && <option value={form.veiculo_id} disabled>Veículo indisponível</option>}
          {vehicles.filter(v => !v.desativado_em).map(v => <option key={v.id} value={v.id}>{vehicleName(v)} · {v.ano_modelo}</option>)}
        </select>
        <small className="muted">Veículos com cadastro pendente também podem ter rascunhos.</small>
      </div>}
      {children}
      <div className="field">
        <label htmlFor="anuncio-titulo">Título do anúncio</label>
        <input id="anuncio-titulo" value={form.titulo} maxLength={150} required onChange={e => change('titulo', e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="anuncio-descricao">Descrição (opcional)</label>
        <textarea id="anuncio-descricao" rows={4} value={form.descricao} onChange={e => change('descricao', e.target.value)} />
      </div>
      <div className="anuncio-prices">{moneyFields.map(([key, label]) => <div className="field" key={key}>
        <label htmlFor={`anuncio-${key}`}>{label}</label>
        <input id={`anuncio-${key}`} type="text" inputMode="decimal" required value={form[key]} onChange={e => change(key, e.target.value)} aria-describedby="anuncio-money-hint" />
      </div>)}</div>
      <p id="anuncio-money-hint" className="muted">Use vírgula ou ponto e até duas casas decimais, sem separador de milhar.</p>
      <label className="anuncio-checkbox"><input type="checkbox" checked={form.aceite_automatico} onChange={e => change('aceite_automatico', e.target.checked)} /> Aceitação automática de reservas</label>
      <p className="muted">Esta preferência será salva no rascunho. Reservas dependem da publicação futura.</p>
      {error && <div className="alert err" role="alert">{error}</div>}
      <button className="btn primary" type="submit" disabled={busy || disabled}>
        {busy ? creating ? 'Criando anúncio...' : 'Salvando alterações...' : creating ? 'Criar rascunho' : 'Salvar alterações'}
      </button>
    </fieldset>
  </form>;
}
