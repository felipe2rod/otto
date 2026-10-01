// Enquanto o servidor busca a lista: cartões-esqueleto na mesma grade (experiencia.md, 3.2).
import { pecas as textos } from '../../textos/pecas';
import estilos from './pecas.module.css';

export default function CarregandoPecas() {
  return (
    <div className={estilos.pagina}>
      <header className={estilos.topo}>
        <span className={estilos.marca}>{textos.marca}</span>
      </header>
      <main className={estilos.conteudo} aria-busy="true">
        <h1 className={estilos.titulo}>{textos.titulo}</h1>
        <p className={estilos.carregando} role="status">
          {textos.carregando}
        </p>
        <div className={estilos.esqueletos} aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
        </div>
      </main>
    </div>
  );
}
