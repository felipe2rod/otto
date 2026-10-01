// Peças: a lista da conta (docs/mvp/experiencia.md, seção 3.2). Componente de servidor.
// A primeira página da lista vem pronta do servidor; as ações (criar, renomear, duplicar, excluir)
// são do componente de cliente. Se a API falhar, a tela mostra o erro: nunca uma lista vazia no lugar.
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { criarCliente } from '../../api/cliente';
import { criarApiDePecas } from '../../api/pecas';
import { Pecas } from '../../pecas/Pecas';
import { pecas as textos } from '../../textos/pecas';
import estilos from './pecas.module.css';

export const metadata: Metadata = { title: textos.tituloDaPagina };

export default async function PaginaDePecas() {
  // A conta nunca vai na requisição: repassa só o cookie que o navegador mandou, e a API decide.
  // Hoje não há cookie (ADR 035); quando o login entrar, esta linha já faz a coisa certa.
  const cookie = (await headers()).get('cookie');
  const api = criarApiDePecas(criarCliente({ base: process.env.API_ENDERECO_INTERNO ?? 'http://api:3000', ...(cookie ? { cabecalhos: { cookie } } : {}) }));
  const inicial = await api.listar();

  return (
    <div className={estilos.pagina}>
      <header className={estilos.topo}>
        <a className={estilos.marca} href="/">
          {textos.marca}
        </a>
        <nav aria-label={textos.navegacao}>
          <a className={estilos.secao} href="/editor" aria-current="page">
            {textos.titulo}
          </a>
        </nav>
      </header>
      <main className={estilos.conteudo}>
        <h1 className={estilos.titulo}>{textos.titulo}</h1>
        <Pecas inicial={inicial} agora={new Date().toISOString()} />
      </main>
    </div>
  );
}
