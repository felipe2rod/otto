// Peças: a lista da conta (docs/mvp/experiencia.md, seção 3.2). Componente de servidor.
// A primeira página da lista vem pronta do servidor; as ações (renomear, duplicar, excluir) são do
// componente de cliente. Se a API falhar, a tela mostra o erro: nunca uma lista vazia no lugar.
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { criarCliente } from '../../api/cliente';
import { criarApiDePecas } from '../../api/pecas';
import { Pecas } from '../../pecas/Pecas';
import { Pagina } from '../../produto/Pagina';
import { pecas as textos } from '../../textos/pecas';

export const metadata: Metadata = { title: textos.tituloDaPagina };

const um = (valor: string | string[] | undefined): string | undefined => (Array.isArray(valor) ? valor[0] : valor);

export default async function PaginaDePecas({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  // ?marca=<id>: só as peças criadas pelo formulário com essa marca
  const marcaId = um((await searchParams).marca);
  // A conta nunca vai na requisição: repassa só o cookie que o navegador mandou, e a API decide.
  // Hoje não há cookie (ADR 035); quando o login entrar, esta linha já faz a coisa certa.
  const cookie = (await headers()).get('cookie');
  const api = criarApiDePecas(criarCliente({ base: process.env.API_ENDERECO_INTERNO ?? 'http://api:3000', ...(cookie ? { cabecalhos: { cookie } } : {}) }));
  const inicial = await api.listar(undefined, marcaId);

  return (
    <Pagina secao="pecas" titulo={textos.titulo}>
      <Pecas inicial={inicial} agora={new Date().toISOString()} {...(marcaId ? { marcaId } : {})} />
    </Pagina>
  );
}
