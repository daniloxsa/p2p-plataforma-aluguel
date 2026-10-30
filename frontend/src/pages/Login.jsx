import { useRef, useState } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { useApp } from "../store/AppContext";

export default function Login() {
  const { login, flash, isAuthLoading } = useApp();
  const nav = useNavigate();
  const location = useLocation();
  const submitting = useRef(false);
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  async function submit(e) {
    e.preventDefault();
    if (submitting.current || isAuthLoading) return;
    setErr("");
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) { setErr("Informe um e-mail válido."); return; }
    if (!pass || pass.length > 128) { setErr("Informe sua senha (até 128 caracteres)."); return; }
    submitting.current = true;
    setLoading(true);
    try {
      await login({ email, senha: pass });
      flash("Login realizado com sucesso.");
      const from = location.state?.from;
      nav(typeof from === "string" && from.startsWith("/") && !from.startsWith("//") && !['/login', '/cadastro'].includes(from.split('?')[0]) ? from : "/", { replace: true });
    } catch (error) { setErr(error.message); }
    finally { submitting.current = false; setLoading(false); }
  }

  return (
    <div className="login-wrap">
      <section className="login-brand">
        <div className="login-brand-inner">
          <div className="logo" style={{ color: "#fff" }}>DRIVESHARE <span className="mark" style={{ background: "#fff", color: "#000" }}>P2P</span></div>
          <h1>Alugue carros de pessoas. Dirija em minutos.</h1>
          <p>KYC com biometria · documentos validados · seguro por dia · caução separada · reputação mútua.</p>
          <ul>
            <li><strong>R$ 61,7 Bi</strong><span>Faturamento locação 2025</span></li>
            <li><strong>1,71 Mi</strong><span>Frota no Brasil</span></li>
            <li><strong>79,7 Mi</strong><span>Usuários acumulados</span></li>
          </ul>
          <div className="login-quote">“Retirei o carro a 5 min de casa, vistoria por foto, tudo no app.” — locatário verificado</div>
        </div>
      </section>

      <section className="login-form-col">
        <form className="login-card" onSubmit={submit}>
          <h2>Entrar</h2>
          <p className="muted">Acesse sua conta. A verificação de identidade não é necessária para entrar e consultar veículos.</p>

          {location.state?.registered && <div className="alert ok" role="status">Cadastro concluído. Entre com seu e-mail e senha.</div>}
          {err && <div className="alert err" role="alert">{err}</div>}

          <div className="field"><label htmlFor="login-email">E-mail</label><input id="login-email" type="email" autoComplete="email" required maxLength={255} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@email.com" /></div>
          <div className="field">
            <label htmlFor="login-password">Senha</label>
            <div className="pass-row">
              <input id="login-password" type={show ? "text" : "password"} required maxLength={128} autoComplete="current-password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="••••••••" />
              <button type="button" className="btn ghost small" onClick={() => setShow(!show)}>{show ? "Ocultar" : "Mostrar"}</button>
            </div>
          </div>

          <div className="row" style={{ marginBottom: 14 }}>
            <span className="muted" style={{ fontSize: 13 }}>Sessão renovável por até 7 dias.</span>
            <span className="spacer" />
            <button type="button" className="btn ghost small" onClick={() => flash("Recuperação de senha ainda não disponível.")}>Esqueci a senha</button>
          </div>

          <button className="btn primary" style={{ width: "100%" }} disabled={loading || isAuthLoading}>
            {loading ? "Entrando..." : isAuthLoading ? "Verificando sessão..." : "Entrar"}
          </button>


          <div className="muted" style={{ fontSize: 13, marginTop: 16, textAlign: "center" }}>
            Novo por aqui? <Link to="/cadastro" style={{ fontWeight: 700, color: "var(--ink)" }}>Criar conta</Link>
          </div>
          <div className="muted" style={{ fontSize: 11, marginTop: 8, textAlign: "center" }}>Use as credenciais da sua conta UniVia.</div>
        </form>
      </section>
    </div>
  );
}
