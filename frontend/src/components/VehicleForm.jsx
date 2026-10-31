import { useRef, useState } from 'react';
import { vehicleFields, vehiclePayload, validateVehicle } from '../services/vehicleValidation';
export default function VehicleForm({ initial = {}, onSave, editing = false }) {
  const [form, setForm] = useState(() => Object.fromEntries(vehicleFields.map(([key]) => [key, initial[key] ?? ''])));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  async function submit(event) {
    event.preventDefault();
    if (pending.current) return;
    const data = vehiclePayload(form), invalid = validateVehicle(data);
    if (invalid) { setError(invalid); return; }
    const patch = editing ? Object.fromEntries(Object.entries(data).filter(([key, value]) => value !== initial[key])) : data;
    if (!Object.keys(patch).length) { setError('Altere ao menos um campo.'); return; }
    pending.current = true; setBusy(true); setError('');
    try { await onSave(patch); }
    catch (err) { setError(err.message || 'Não foi possível salvar o veículo.'); }
    finally { pending.current = false; setBusy(false); }
  }
  return <form onSubmit={submit} noValidate>
    <div className="grid2">{vehicleFields.map(([key, label, type, maxLength]) => <div className="field" key={key}>
      <label htmlFor={`vehicle-${key}`}>{label}</label>
      <input id={`vehicle-${key}`} type={type} maxLength={maxLength} required disabled={busy}
        value={form[key]} onChange={e => setForm(current => ({ ...current, [key]: e.target.value }))} />
    </div>)}</div>
    {error && <div className="alert err" role="alert">{error}</div>}
    <button className="btn primary" type="submit" disabled={busy} style={{ width: '100%', marginTop: 12 }}>
      {busy ? 'Salvando...' : editing ? 'Salvar alterações' : 'Cadastrar veículo'}
    </button>
  </form>;
}
