// Adaptador de CacheDeBuscas sobre PostgreSQL. A tabela é catálogo global (sem conta_id, sem RLS, só
// SELECT e INSERT para otto_app): por isso `noCatalogoGlobal`, que não abre escopo de conta.
import type { JsonDoBanco, PrismaComEscopo } from '../../../plataforma/persistencia/prisma-com-escopo';
import type { ImagemNoBanco } from '../../application/banco-de-imagens';
import { CacheDeBuscas } from '../../application/cache-de-buscas';

export class CacheDeBuscasNoBanco extends CacheDeBuscas {
  constructor(private readonly prisma: PrismaComEscopo) {
    super();
  }

  async recente(banco: string, chave: string, desde: Date): Promise<ImagemNoBanco[] | undefined> {
    const linha = await this.prisma.noCatalogoGlobal((tx) =>
      tx.buscaDeImagens.findFirst({ where: { banco, chave, buscadaEm: { gte: desde } }, orderBy: { buscadaEm: 'desc' }, select: { resultados: true } }),
    );
    return linha ? (linha.resultados as unknown as ImagemNoBanco[]) : undefined;
  }

  async guardar(banco: string, chave: string, resultados: readonly ImagemNoBanco[], agora: Date): Promise<void> {
    await this.prisma.noCatalogoGlobal(
      (tx) =>
        // duas buscas iguais no mesmo milissegundo: a segunda não acrescenta nada
        tx.$executeRaw`INSERT INTO buscas_de_imagens (banco, chave, buscada_em, resultados) VALUES (${banco}, ${chave}, ${agora}, ${JSON.stringify(resultados)}::jsonb) ON CONFLICT DO NOTHING`,
    );
  }

  async vista(banco: string, id: string, desde: Date): Promise<ImagemNoBanco | undefined> {
    // contenção no JSON (índice GIN): "alguma busca recente trouxe um resultado com este id?"
    const contem: JsonDoBanco = [{ id }];
    const linhas = await this.prisma.noCatalogoGlobal(
      (tx) =>
        tx.$queryRaw<{ resultados: ImagemNoBanco[] }[]>`
        SELECT resultados FROM buscas_de_imagens
        WHERE banco = ${banco} AND buscada_em >= ${desde} AND resultados @> ${JSON.stringify(contem)}::jsonb
        ORDER BY buscada_em DESC LIMIT 1`,
    );
    return linhas[0]?.resultados.find((r) => r.id === id);
  }
}
