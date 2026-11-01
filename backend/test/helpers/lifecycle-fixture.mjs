import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { AnunciosService } from '../../src/anuncios/anuncios.service.ts';
import { PublicationPolicyService } from '../../src/anuncios/publication-policy.service.ts';

// Transactional in-memory database only for unit/HTTP tests. No application mocks.
export function fixture(status = 'RASCUNHO') {
  const owner = randomUUID(), id = randomUUID(), vehicleId = randomUUID();
  const vehicle = { id: vehicleId, proprietario_id: owner, placa: 'ABC1D23', marca: 'Toyota', modelo: 'Yaris', ano_fabricacao: 2022,
    ano_modelo: 2023, categoria: 'Hatch', cambio: 'Manual', combustivel: 'Flex', quantidade_lugares: 5, status_cadastro: 'APROVADO', desativado_em: null };
  const rows = [{ id, veiculo_id: vehicleId, titulo: 'Yaris de teste', descricao: null, preco_diaria: new Prisma.Decimal('0.01'),
    valor_caucao: new Prisma.Decimal(0), preco_seguro_dia: new Prisma.Decimal(0), aceite_automatico: false, status, criado_em: new Date() }];
  const documentId = randomUUID(), photoId = randomUUID();
  const documents = [{ id: documentId, veiculo_id: vehicleId, tipo: 'CRLV', arquivo_url: `${vehicleId}/${documentId}.pdf`, status_validacao: 'APROVADO', validade_ate: new Date('2099-12-31'), criado_em: new Date() }];
  const photos = [{ id: photoId, veiculo_id: vehicleId, arquivo_url: `${vehicleId}/${photoId}.jpg`, conteudo_hash: 'a'.repeat(64) }];
  const history = [], reservations = [], locks = [];
  let tail = Promise.resolve(), failAudit = false;
  const matches = (row, where = {}) => Object.entries(where).every(([key, value]) => {
    if (key === 'veiculo') return vehicle.proprietario_id === value.proprietario_id && row.veiculo_id === vehicle.id;
    if (key === 'anuncio') return rows.some(a => a.id === row.anuncio_id && a.veiculo_id === value.veiculo_id);
    if (value && typeof value === 'object' && !(value instanceof Date)) {
      if (value.in) return value.in.includes(row[key]);
      if (value.notIn) return !value.notIn.includes(row[key]);
      if (value.not !== undefined) return row[key] !== value.not;
    }
    return row[key] === value;
  });
  const project = (row, select) => !row ? null : !select ? { ...row } : Object.fromEntries(Object.entries(select).map(([key,value]) => [key, key === 'veiculo' ? project(vehicle, value.select) : row[key] ?? null]));
  const model = list => ({
    async findFirst({ where, select, orderBy }) { const found = list.filter(row => matches(row, where)); return project(orderBy ? found.at(-1) : found[0], select); },
    async findUnique({ where, select }) { return project(list.find(row => matches(row, where)), select); },
    async findMany({ where, select, skip = 0, take = 1000 } = {}) { return list.filter(row => matches(row, where)).slice(skip, skip + take).map(row => project(row, select)); },
    async count({ where } = {}) { return list.filter(row => matches(row, where)).length; },
    async create({ data, select }) { const row = { id: randomUUID(), criado_em: new Date(), ...data }; list.push(row); return project(row, select); },
    async updateMany({ where, data }) { const found = list.filter(row => matches(row, where)); found.forEach(row => Object.assign(row, data)); return { count: found.length }; },
    async update({ where, data, select }) { const row = list.find(row => matches(row, where)); Object.assign(row, data); return project(row, select); },
  });
  const db = { anuncio: model(rows), veiculo: model([vehicle]), documento_veiculo: model(documents), foto_veiculo: model(photos), reserva: model(reservations),
    historico_anuncio: { ...model(history), async create({ data }) { if (failAudit) throw Error('audit failed'); history.push({ id: randomUUID(), criado_em: new Date(), ...data }); } },
    async $queryRaw(strings) { locks.push(strings.join('?')); return []; },
    async $transaction(operation) {
      const previous = tail; let release; tail = new Promise(resolve => { release = resolve; }); await previous;
      const originalVehicle = { ...vehicle }, snapshots = [rows, documents, photos, history, reservations].map(list => list.map(row => ({ ...row })));
      try { return await operation(db); }
      catch (error) { Object.assign(vehicle, originalVehicle); [rows, documents, photos, history, reservations].forEach((list,index) => list.splice(0,list.length,...snapshots[index])); throw error; }
      finally { release(); }
    },
  };
  const storageCalls = [];
  const storage = { async verifyDocument(...args) { storageCalls.push(['document', ...args]); }, async verifyPhoto(...args) { storageCalls.push(['photo', ...args]); } };
  const policy = new PublicationPolicyService(storage), service = new AnunciosService(db, policy);
  return { owner, id, vehicle, rows, documents, photos, history, reservations, db, storage, policy, service, locks, storageCalls, failAudit() { failAudit = true; } };
}
