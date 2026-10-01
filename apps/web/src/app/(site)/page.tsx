// Página pública, uma só no MVP. Componente de servidor, sem JavaScript próprio no navegador.
// Não importa nada de src/editor: testes/fronteira-do-site.test.ts e o teste de pacote conferem.
import { site } from '../../textos/site';
import estilos from './pagina.module.css';

export default function PaginaInicial() {
  return (
    <div className={estilos.pagina}>
      <header className={estilos.topo}>
        <span className={estilos.marca}>{site.marca}</span>
        <a className={estilos.entrada} href="/editor">
          {site.abrirOEditor}
        </a>
      </header>

      <main className={estilos.palco}>
        <div className={estilos.fala}>
          <h1 className={estilos.slogan}>
            <span>{site.slogan.producao}</span> <em>{site.slogan.design}</em>
          </h1>
          <p className={estilos.apoio}>{site.apoio}</p>
          <a className={estilos.chamada} href="/editor">
            {site.abrirOEditor}
          </a>
        </div>

        {/* três pranchetas sobrepostas; a do meio leva a marca das alterações do Otto, como no editor */}
        <div className={estilos.pranchetas} role="img" aria-label={site.ilustracao}>
          <span className={estilos.prancheta} data-ordem="1" />
          <span className={estilos.prancheta} data-ordem="2">
            <span className={estilos.etiqueta}>{site.legendaDaIlustracao}</span>
          </span>
          <span className={estilos.prancheta} data-ordem="3" />
        </div>
      </main>

      <ul className={estilos.pontos}>
        {site.pontos.map((ponto) => (
          <li key={ponto.rotulo}>
            <span className={estilos.numero}>{ponto.rotulo}</span>
            <h2>{ponto.titulo}</h2>
            <p>{ponto.texto}</p>
          </li>
        ))}
      </ul>

      <footer className={estilos.rodape}>{site.rodape}</footer>
    </div>
  );
}
