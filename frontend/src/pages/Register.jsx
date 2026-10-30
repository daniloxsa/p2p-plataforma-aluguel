import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useApp } from "../store/AppContext";
import { authService } from "../services/authService";
import { registrationPayload } from "../services/authValidation";

export default function Register() {
  const { flash } = useApp();
  const nav = useNavigate();
  const submitting = useRef(false);
  const [form, setForm] = useState({ nome: "", cpf: "", email: "", telefone: "", senha: "", confirmacao: "" });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const set = (field, value) => setForm(current => ({ ...current, [field]: value }));

  async function submit(event) {
    event.preventDefault();
    if (submitting.current) return;
    setErr("");
    let payload;
    try { payload = registrationPayload(form); }
    catch (error) { setErr(error.message); return; }
    submitting.current = true;
    setLoading(true);
    try {
      await authService.register(payload);
      flash("Cadastro concluído. Entre com seu e-mail e senha.");
      nav("/login", { replace: true, state: { registered: true } });
    } catch (error) { setErr(error.message); }
    finally { submitting.current = false; setLoading(false); }
  }

  return (
    <div className="container page" style={{ maxWidth: 640 }}>
      <form className="panel" onSubmit={submit} noValidate>
        <h2 style={{ marginTop: 0 }}>Criar conta</h2>
        <p className="muted">Cadastre-se para acessar o UniVia.</p>
        {err && <div className="alert err" role="alert">{err}</div>}
        <div className="field"><label htmlFor="register-name">Nome completo</label><input id="register-name" autoComplete="name" maxLength={150} required value={form.nome} onChange={e => set("nome", e.target.value)} /></div>
        <div className="grid2">
          <div className="field"><label htmlFor="register-cpf">CPF</label><input id="register-cpf" inputMode="numeric" placeholder="000.000.000-00" maxLength={14} required value={form.cpf} onChange={e => set("cpf", e.target.value)} /></div>
          <div className="field"><label htmlFor="register-phone">Telefone (opcional)</label><input id="register-phone" type="tel" autoComplete="tel" maxLength={20} value={form.telefone} onChange={e => set("telefone", e.target.value)} /></div>
        </div>
        <div className="field"><label htmlFor="register-email">E-mail</label><input id="register-email" type="email" autoComplete="email" maxLength={255} required value={form.email} onChange={e => set("email", e.target.value)} /></div>
        <div className="grid2">
          <div className="field"><label htmlFor="register-password">Senha</label><input id="register-password" type="password" autoComplete="new-password" maxLength={128} required value={form.senha} onChange={e => set("senha", e.target.value)} /></div>
          <div className="field"><label htmlFor="register-confirm">Confirmar senha</label><input id="register-confirm" type="password" autoComplete="new-password" maxLength={128} required value={form.confirmacao} onChange={e => set("confirmacao", e.target.value)} /></div>
        </div>
        <p className="muted" style={{ fontSize: 13 }}>Use de 12 a 128 caracteres, com maiúscula, minúscula, número e símbolo.</p>
        <div className="alert info">Sua conta será criada com verificação pendente. KYC e biometria ainda não estão disponíveis; você poderá entrar e consultar veículos.</div>
        <div className="row" style={{ marginTop: 12 }}>
          <Link to="/login" className="btn ghost">Já tenho conta</Link>
          <span className="spacer" />
          <button className="btn primary" disabled={loading}>{loading ? "Cadastrando..." : "Criar conta"}</button>
        </div>
      </form>
    </div>
  );
}
