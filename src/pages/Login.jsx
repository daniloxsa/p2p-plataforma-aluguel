import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useApp } from "../store/AppContext";

export default function Login() {
  const { loginAs, flash } = useApp();
  const nav = useNavigate();
  const [email, setEmail] = useState("ana.souza@email.com");
  const [pass, setPass] = useState("demo1234");
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  function submit(e) {
    e.preventDefault();
    setErr("");
    if (!/^\S+@\S+\.\S+$/.test(email)) { setErr("Informe um e-mail válido."); return; }
    if (pass.length < 6) { setErr("A senha precisa de ao menos 6 caracteres."); return; }
    setLoading(true);
    setTimeout(() => {
      const name = email.split("@")[0].replace(/[._-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      loginAs(name || "Usuário Verificado");
      flash("Login efetuado — usuário Verificado (RN01).");
      nav("/");
    }, 800);
  }

  function demo() {
    loginAs("Ana Souza");
    flash("Entrada demo — usuário Verificado (RN01).");
    nav("/");
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
          <p className="muted">Acesse para buscar, reservar ou anunciar. Somente contas verificadas operam (RN01).</p>

          {err && <div className="alert err">{err}</div>}

          <div className="field"><label>E-mail</label><input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@email.com" /></div>
          <div className="field">
            <label>Senha</label>
            <div className="pass-row">
              <input type={show ? "text" : "password"} autoComplete="current-password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="••••••••" />
              <button type="button" className="btn ghost small" onClick={() => setShow(!show)}>{show ? "Ocultar" : "Mostrar"}</button>
            </div>
          </div>

          <div className="row" style={{ marginBottom: 14 }}>
            <label className="row" style={{ fontSize: 13, color: "var(--muted)" }}>
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Lembrar de mim
            </label>
            <span className="spacer" />
            <a href="#/login" onClick={(e) => e.preventDefault()} style={{ fontSize: 13, fontWeight: 600 }}>Esqueci a senha</a>
          </div>

          <button className="btn primary" style={{ width: "100%" }} disabled={loading}>
            {loading ? "Entrando..." : "Entrar"}
          </button>

          <div className="divider"><span>ou</span></div>

          <div className="grid2">
            <button type="button" className="btn ghost" onClick={demo}>Conta demo</button>
            <button type="button" className="btn ghost" onClick={() => { flash("Login social indisponível no protótipo."); }}>Google / Apple</button>
          </div>

          <div className="muted" style={{ fontSize: 13, marginTop: 16, textAlign: "center" }}>
            Novo por aqui? <Link to="/cadastro" style={{ fontWeight: 700, color: "#000" }}>Criar conta e verificar KYC</Link>
          </div>
          <div className="muted" style={{ fontSize: 11, marginTop: 8, textAlign: "center" }}>Protótipo front-end · qualquer e-mail/senha ≥ 6 entra · dados protegidos (LGPD)</div>
        </form>
      </section>
    </div>
  );
}
