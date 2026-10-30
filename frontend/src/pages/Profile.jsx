import { useState, useEffect, useRef } from "react";
import { useApp } from "../store/AppContext";
import { ApiError } from "../api/client";

export default function Profile() {
  const { user, flash, updateProfile, isAuthLoading: authLoading } = useApp();
  const [formData, setFormData] = useState({ nome: "", telefone: "" });
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const submitting = useRef(false);

  useEffect(() => {
    if (user && !isEditing) {
      setFormData({
        nome: user.nome || "",
        telefone: user.telefone || "",
      });
    }
  }, [user, isEditing]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (error) setError(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isEditing || isLoading || submitting.current) return;
    submitting.current = true;
    setIsLoading(true);
    setError(null);

    try {
      const updatedUser = await updateProfile(formData);
      setFormData({ nome: updatedUser.nome || "", telefone: updatedUser.telefone || "" });
      flash("Perfil atualizado com sucesso!");
      setIsEditing(false);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message || "Erro ao atualizar perfil");
        flash("Erro ao atualizar perfil. Tente novamente.");
      } else {
        setError("Erro inesperado. Tente novamente.");
        flash("Erro inesperado. Tente novamente.");
      }
    } finally {
      submitting.current = false;
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    setFormData({
      nome: user.nome || "",
      telefone: user.telefone || "",
    });
    setIsEditing(false);
    setError(null);
  };

  const formatDate = (dateString) => {
    if (!dateString) return "Não informado";
    try {
      return new Date(dateString).toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      });
    } catch {
      return dateString;
    }
  };

  const getStatusLabel = (status) => {
    const statusMap = {
      "PENDENTE_VERIFICACAO": "Pendente de verificação",
      "ATIVO": "Ativo",
      "VERIFICADO": "Verificado",
    };
    return statusMap[status] || status;
  };

  const getStatusColor = (status) => {
    const colorMap = {
      "PENDENTE_VERIFICACAO": "warn",
      "ATIVO": "ok",
      "VERIFICADO": "ok",
    };
    return colorMap[status] || "info";
  };

  if (authLoading) {
    return (
      <div className="container page">
        <div className="panel">
          <h3>Carregando perfil...</h3>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="container page">
        <div className="panel">
          <h3>Usuário não autenticado</h3>
          <p>Faça login para acessar seu perfil.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container page">
      <div className="panel">
        <h3>Meu Perfil</h3>

        <div className="kv">
          <span>ID do Usuário</span>
          <strong>{user.id}</strong>
        </div>

        <div className="kv">
          <span>E-mail</span>
          <strong>{user.email}</strong>
        </div>

        <div className="kv">
          <span>Data de Criação</span>
          <strong>{formatDate(user.criado_em)}</strong>
        </div>

        <div className="kv">
          <span>Status da Conta</span>
          <strong>
            <span className={`status st-${getStatusColor(user.status)}`}>
              {getStatusLabel(user.status)}
            </span>
          </strong>
        </div>

        {user.status === "PENDENTE_VERIFICACAO" && (
          <div className="alert warn">
            <strong>⚠️ Verificação Pendente</strong>
            <p>Seu perfil está aguardando verificação. Você pode continuar usando todos os recursos disponíveis enquanto isso.</p>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ marginTop: "20px" }}>
          <div style={{ display: "grid", gap: "16px" }}>
            <div>
              <label htmlFor="nome" style={{ display: "block", marginBottom: "8px", fontWeight: "500" }}>Nome</label>
              <input
                id="nome"
                name="nome"
                type="text"
                value={formData.nome}
                onChange={handleChange}
                disabled={!isEditing || isLoading}
                style={{ width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid var(--line)" }}
                placeholder="Seu nome completo"
              />
            </div>

            <div>
              <label htmlFor="telefone" style={{ display: "block", marginBottom: "8px", fontWeight: "500" }}>Telefone</label>
              <input
                id="telefone"
                name="telefone"
                type="tel"
                value={formData.telefone}
                onChange={handleChange}
                disabled={!isEditing || isLoading}
                style={{ width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid var(--line)" }}
                placeholder="(99) 99999-9999"
              />
            </div>

            {error && (
              <div className="alert danger" style={{ marginBottom: "0" }}>{error}</div>
            )}

            <div style={{ display: "flex", gap: "12px", marginTop: "8px" }}>
              {!isEditing ? (
                <button
                  key="edit-profile"
                  type="button"
                  onClick={(event) => { event.preventDefault(); setIsEditing(true); }}
                  className="btn primary"
                  disabled={isLoading}
                >
                  Editar Perfil
                </button>
              ) : (
                <>
                  <button
                    key="save-profile"
                    type="submit"
                    className="btn primary"
                    disabled={isLoading}
                  >
                    {isLoading ? "Salvando..." : "Salvar Alterações"}
                  </button>
                  <button
                    key="cancel-profile"
                    type="button"
                    onClick={handleCancel}
                    className="btn ghost"
                    disabled={isLoading}
                  >
                    Cancelar
                  </button>
                </>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
