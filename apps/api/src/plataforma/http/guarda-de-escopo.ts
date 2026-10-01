// Guarda global: decide a conta de toda requisição de negócio, pelo PONTO ÚNICO de escopo
// (ResolvedorDeEscopo). A conta nunca vem de corpo, query ou cabeçalho escolhido pelo cliente.
// Também barra escrita forjada por outro site: toda escrita exige um cabeçalho que um formulário
// ou um fetch simples de outra origem não consegue mandar (docs/mvp/backend.md, 7.1).
import { type CanActivate, type ExecutionContext, Inject } from '@nestjs/common';
import { VERSAO_DO_FORMATO } from '@otto/documento';
import { CABECALHOS, CODIGOS_DE_ERRO } from '@otto/shared';
import { ErroDaAplicacao } from '../erros/erro-da-aplicacao';
import { ResolvedorDeEscopo } from '../escopo/resolvedor-de-escopo';
import type { RequisicaoDoOtto } from './requisicao';

const ESCRITA = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const COOKIE_DE_SESSAO = 'otto_sessao';

function cookie(cabecalho: string | undefined, nome: string): string | undefined {
  for (const par of (cabecalho ?? '').split(';')) {
    const [chave, ...valor] = par.trim().split('=');
    if (chave === nome) return valor.join('=') || undefined;
  }
  return undefined;
}

export class GuardaDeEscopo implements CanActivate {
  constructor(@Inject(ResolvedorDeEscopo) private readonly resolvedor: ResolvedorDeEscopo) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const req = contexto.switchToHttp().getRequest<RequisicaoDoOtto>();
    // saúde não tem conta nem sessão
    if (req.path.startsWith('/api/saude/')) return true;
    // download por link assinado: o link é a credencial, não há sessão (arquivo/presentation/controlador-de-links.ts)
    if (req.method === 'GET' && req.path.startsWith('/api/links/')) return true;

    if (ESCRITA.has(req.method)) {
      if (req.get(CABECALHOS.cliente.nome) !== CABECALHOS.cliente.valor) throw new ErroDaAplicacao(CODIGOS_DE_ERRO.clienteNaoIdentificado);
      const catalogoDoEditor = req.get(CABECALHOS.catalogo);
      if (catalogoDoEditor !== undefined && Number(catalogoDoEditor) !== VERSAO_DO_FORMATO) throw new ErroDaAplicacao(CODIGOS_DE_ERRO.catalogoDesatualizado, { catalogoDoServidor: VERSAO_DO_FORMATO });
    }
    // Sem login no MVP, o adaptador em uso ignora a credencial e devolve a conta fixa (suposição a confirmar).
    req.escopo = await this.resolvedor.resolverDaRequisicao(cookie(req.get('cookie'), COOKIE_DE_SESSAO));
    return true;
  }
}
