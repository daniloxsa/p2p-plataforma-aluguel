import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CatalogError, CatalogPhoto } from '../components/CatalogoUi';
import { useCatalogoResource } from '../services/useCatalogoResource';
import { formatMoney } from '../services/anuncioValidation';

const fields = [
  ['q', 'Marca, modelo ou título', 100], ['categoria', 'Categoria', 50],
  ['cambio', 'Câmbio', 30], ['combustivel', 'Combustível', 30],
  ['preco_min', 'Diária mínima (R$)'], ['preco_max', 'Diária máxima (R$)'],
];
function Filters({ params, onSubmit }) {
  const [form, setForm] = useState(Object.fromEntries(fields.map(([key]) => [key, params.get(key) || ''])));
  const [ordem, setOrdem] = useState(params.get('ordem') || 'recentes');
  const [error, setError] = useState('');
  function submit(event) {
    event.preventDefault();
    if (form.preco_min && form.preco_max && Number(form.preco_min) > Number(form.preco_max)) { setError('A diária mínima deve ser menor ou igual à máxima.'); return; }
    setError('');
    const next = new URLSearchParams({ ordem, page: '1' });
    fields.forEach(([key]) => { if (form[key].trim()) next.set(key, form[key].trim()); });
    onSubmit(next);
  }
  return <form className="panel catalog-filters" onSubmit={submit} aria-label="Filtros do catálogo">
    {fields.map(([key, label, maxLength]) => <div className="field" key={key}><label htmlFor={`catalog-${key}`}>{label}</label>
      <input id={`catalog-${key}`} type="text" inputMode={maxLength ? 'text' : 'decimal'} maxLength={maxLength || 13}
        pattern={maxLength ? undefined : '[0-9]{1,10}(\\.[0-9]{1,2})?'} placeholder={maxLength ? undefined : 'Ex.: 150.90'}
        value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })} /></div>)}
    <div className="field"><label htmlFor="catalog-order">Ordenar por</label><select id="catalog-order" value={ordem} onChange={e => setOrdem(e.target.value)}>
      <option value="recentes">Mais recentes</option><option value="menor_preco">Menor preço</option><option value="maior_preco">Maior preço</option>
    </select></div>
    <div className="row"><button className="btn primary" type="submit">Buscar</button><button className="btn" type="button" onClick={() => onSubmit(new URLSearchParams())}>Limpar filtros</button></div>
    <p className="muted catalog-filter-help">Categoria, câmbio e combustível usam o valor cadastrado, sem diferenciar maiúsculas e minúsculas. Preços com ponto decimal.</p>
    {error && <p role="alert">{error}</p>}
  </form>;
}

export default function Home() {
  const [params, setParams] = useSearchParams();
  const query = params.toString();
  const { data, error, loading, retry } = useCatalogoResource(query);
  const changePage = page => { const next = new URLSearchParams(params); next.set('page', String(page)); setParams(next); };
  return <div className="container page catalog-page">
    <header className="catalog-heading"><p className="muted">UniVia · Catálogo público</p><h1>Encontre seu próximo caminho</h1><p>Conheça os veículos e consulte os detalhes dos anúncios publicados.</p><p className="muted">Reservas e contratações ainda não estão disponíveis.</p></header>
    <Filters key={query} params={params} onSubmit={setParams} />
    <section aria-label="Resultados do catálogo" aria-busy={loading}>
      {loading && <p role="status">Carregando anúncios...</p>}
      {error && <CatalogError error={error} retry={retry} />}
      {data && <><p role="status">{data.total} {data.total === 1 ? 'anúncio encontrado' : 'anúncios encontrados'}</p>
        {data.items.length === 0 && <div className="alert info">Nenhum anúncio nesta página. Ajuste os filtros ou volte à primeira página.{data.page > 1 && <button className="btn" onClick={() => changePage(1)}>Primeira página</button>}</div>}
        <div className="cards">{data.items.map(ad => <article className="card" key={ad.id}>
          <CatalogPhoto photo={ad.fotos[0]} alt={`${ad.veiculo.marca} ${ad.veiculo.modelo}`} />
          <div className="card-body"><h2>{ad.titulo}</h2><p className="muted">{ad.veiculo.marca} {ad.veiculo.modelo} · {ad.veiculo.ano_modelo}</p>
            <div className="row"><span className="tag">{ad.veiculo.categoria}</span><span className="tag">{ad.veiculo.cambio}</span></div>
            <p><strong>{formatMoney(ad.preco_diaria)}</strong> / dia</p>
            <Link className="btn primary" to={`/veiculo/${ad.id}`} state={{ catalogo: `/?${query}` }}>Ver detalhes de {ad.titulo}</Link>
          </div></article>)}</div>
        <nav className="row catalog-pagination" aria-label="Paginação"><button className="btn" disabled={data.page <= 1} onClick={() => changePage(data.page - 1)}>Anterior</button>
          <span>Página {data.page} de {Math.max(1, data.pages)}</span><button className="btn" disabled={data.page >= data.pages} onClick={() => changePage(data.page + 1)}>Próxima</button></nav>
      </>}
    </section>
  </div>;
}
