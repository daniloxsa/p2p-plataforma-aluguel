import { useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { CatalogError, CatalogPhoto } from '../components/CatalogoUi';
import { useCatalogoResource } from '../services/useCatalogoResource';
import { formatMoney } from '../services/anuncioValidation';

function Gallery({ fotos, title }) {
  const [selected, setSelected] = useState(0);
  return <div className="catalog-gallery"><CatalogPhoto photo={fotos[selected] || fotos[0]} alt={title} large />
    {fotos.length > 1 && <div className="catalog-thumbnails" aria-label="Galeria de fotografias">{fotos.map((photo, index) => <button key={photo.id} type="button" aria-label={`Ver foto ${index + 1}`} aria-pressed={index === selected} onClick={() => setSelected(index)}><CatalogPhoto photo={photo} alt={photo.descricao || `Foto ${index + 1}`} /></button>)}</div>}
  </div>;
}

export default function VehicleDetail() {
  const { id } = useParams();
  const { state } = useLocation();
  const { data: ad, error, loading, retry } = useCatalogoResource(id, true);
  return <div className="container page catalog-page"><Link className="btn ghost" to={state?.catalogo || '/'}>← Voltar ao catálogo</Link>
    {loading && <p role="status">Carregando anúncio...</p>}
    {error && <CatalogError error={error} retry={retry} />}
    {ad && <><h1>{ad.titulo}</h1><div className="split"><section className="panel">
      <Gallery key={ad.id} fotos={ad.fotos} title={`${ad.veiculo.marca} ${ad.veiculo.modelo}`} />
      <h2>{ad.veiculo.marca} {ad.veiculo.modelo}</h2>
      <dl className="catalog-specs">{[['Ano de fabricação', ad.veiculo.ano_fabricacao], ['Ano do modelo', ad.veiculo.ano_modelo], ['Categoria', ad.veiculo.categoria], ['Câmbio', ad.veiculo.cambio], ['Combustível', ad.veiculo.combustivel], ['Lugares', ad.veiculo.quantidade_lugares]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value ?? 'Não informado'}</dd></div>)}</dl>
      <h2>Sobre o veículo</h2><p className="catalog-description">{ad.descricao || 'Sem descrição adicional.'}</p>
    </section><aside className="panel"><h2>Valores anunciados</h2>
      <div className="kv"><span>Diária</span><strong>{formatMoney(ad.preco_diaria)}</strong></div>
      <div className="kv"><span>Caução</span><strong>{formatMoney(ad.valor_caucao)}</strong></div>
      <div className="kv"><span>Seguro por dia</span><strong>{formatMoney(ad.preco_seguro_dia)}</strong></div>
      <p className="alert info">Reservas e contratações ainda não estão disponíveis. Esta página permite apenas consultar o anúncio.</p>
      <button className="btn primary" disabled>Reservas indisponíveis</button>
    </aside></div></>}
  </div>;
}
