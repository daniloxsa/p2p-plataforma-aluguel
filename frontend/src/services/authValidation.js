export function validCpf(cpf) {
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  return [9, 10].every(size => {
    let sum = 0;
    for (let i = 0; i < size; i++) sum += Number(cpf[i]) * (size + 1 - i);
    return (sum * 10) % 11 % 10 === Number(cpf[size]);
  });
}

export function registrationPayload(form) {
  const nome = form.nome.trim();
  const rawCpf = form.cpf.trim();
  const cpf = rawCpf.replace(/\D/g, "");
  const email = form.email.trim().toLowerCase();
  const telefone = form.telefone.trim();
  if (nome.length < 2 || nome.length > 150) throw new Error("Informe um nome de 2 a 150 caracteres.");
  if (!/^(\d{11}|\d{3}\.\d{3}\.\d{3}-\d{2})$/.test(rawCpf) || !validCpf(cpf)) throw new Error("Informe um CPF válido.");
  if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 255) throw new Error("Informe um e-mail válido.");
  if (telefone && (telefone.length < 8 || telefone.length > 20 || !/^[+\d()\s-]+$/.test(telefone))) throw new Error("Informe um telefone válido.");
  if (form.senha.length < 12 || form.senha.length > 128 || !/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/s.test(form.senha)) {
    throw new Error("Use uma senha de 12 a 128 caracteres com maiúscula, minúscula, número e símbolo.");
  }
  if (form.senha !== form.confirmacao) throw new Error("As senhas precisam ser iguais.");
  return { nome, cpf, email, ...(telefone ? { telefone } : {}), senha: form.senha };
}
