export const moneyFields = [
  ['preco_diaria', 'Preço da diária (R$)'],
  ['valor_caucao', 'Valor da caução (R$)'],
  ['preco_seguro_dia', 'Seguro por dia (R$)'],
];
export const anuncioStatus = { RASCUNHO: 'Rascunho', ATIVO: 'Publicado', PAUSADO: 'Pausado', ENCERRADO: 'Encerrado' };

export function decimal(value, positive = false) {
  // Strings throughout: never multiply/round money using floating point.
  const text = String(value ?? '').trim().replace(',', '.');
  if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(text) || (positive && !/[1-9]/.test(text))) {
    throw new Error(`${positive ? 'A diária deve ser maior que zero' : 'Caução e seguro devem ser zero ou positivos'}. Use até duas casas decimais e no máximo 9999999999,99, sem separador de milhar.`);
  }
  const [integer, fraction = ''] = text.split('.');
  return `${integer.replace(/^0+(?=\d)/, '')}.${fraction.padEnd(2, '0')}`;
}

export function anuncioPayload(form, creating = false) {
  const titulo = form.titulo.trim();
  if (!titulo || titulo.length > 150) throw new Error('Informe um título de 1 a 150 caracteres.');
  if (creating && !form.veiculo_id) throw new Error('Selecione um veículo disponível da sua conta.');
  return {
    ...(creating ? { veiculo_id: form.veiculo_id } : {}),
    titulo, descricao: form.descricao.trim() || null,
    preco_diaria: decimal(form.preco_diaria, true),
    valor_caucao: decimal(form.valor_caucao), preco_seguro_dia: decimal(form.preco_seguro_dia),
    aceite_automatico: form.aceite_automatico === true,
  };
}

export function formatMoney(value) {
  if (value === null || value === undefined) return '—';
  const [integer, fraction = '00'] = String(value).split('.');
  if (!/^\d+$/.test(integer) || !/^\d{1,2}$/.test(fraction)) return '—';
  return `R$ ${integer.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${fraction.padEnd(2, '0')}`;
}

export const vehicleName = vehicle => vehicle ? `${vehicle.marca} ${vehicle.modelo}` : 'Veículo indisponível';
