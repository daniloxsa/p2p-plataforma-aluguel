export const vehicleFields = [
  ['placa', 'Placa', 'text', 8], ['marca', 'Marca', 'text', 80], ['modelo', 'Modelo', 'text', 100],
  ['ano_fabricacao', 'Ano de fabricação', 'number'], ['ano_modelo', 'Ano do modelo', 'number'],
  ['categoria', 'Categoria', 'text', 50], ['cambio', 'Câmbio', 'text', 30],
  ['combustivel', 'Combustível', 'text', 30], ['quantidade_lugares', 'Quantidade de lugares', 'number'],
];
export function vehiclePayload(form) {
  return Object.fromEntries(vehicleFields.map(([key, , type]) => [key, type === 'number' ? Number(form[key]) :
    key === 'placa' ? form[key].trim().toUpperCase().replace(/[-\s]/g, '') : form[key].trim()]));
}
export function validateVehicle(data) {
  if (vehicleFields.some(([key]) => data[key] === '' || data[key] == null)) return 'Preencha todos os campos.';
  if (!/^[A-Z]{3}(?:\d{4}|\d[A-Z]\d{2})$/.test(data.placa)) return 'Informe uma placa brasileira válida, como ABC1234 ou ABC1D23.';
  const max = new Date().getFullYear() + 1;
  if (![data.ano_fabricacao, data.ano_modelo].every(n => Number.isInteger(n) && n >= 1900 && n <= max) ||
    data.ano_modelo < data.ano_fabricacao || data.ano_modelo > data.ano_fabricacao + 1) return 'Confira os anos: modelo igual à fabricação ou ao ano seguinte.';
  if (!Number.isInteger(data.quantidade_lugares) || data.quantidade_lugares < 1 || data.quantidade_lugares > 60) return 'Informe entre 1 e 60 lugares.';
  return '';
}
