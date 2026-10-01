// Adaptador de RepositorioDeArquivos sobre PostgreSQL (Prisma), sob RLS.
import type { EscopoDaConta } from '../../../plataforma/escopo/escopo-da-conta';
import type { PrismaComEscopo, TransacaoComEscopo } from '../../../plataforma/persistencia/prisma-com-escopo';
import { type ArquivoRegistrado, type NovoArquivo, RepositorioDeArquivos } from '../../application/repositorio-de-arquivos';

const SHA256 = /^[0-9a-f]{64}$/;
const CAMPOS = { sha256: true, tipoMime: true, bytes: true, largura: true, altura: true, especie: true, chaveDoObjeto: true } as const;

export class RepositorioDeArquivosNoBanco extends RepositorioDeArquivos {
  constructor(private readonly prisma: PrismaComEscopo) {
    super();
  }

  private buscarNa(tx: TransacaoComEscopo, escopo: EscopoDaConta, sha256: string): Promise<ArquivoRegistrado | null> {
    return tx.arquivo.findUnique({ where: { contaId_sha256: { contaId: escopo.contaId, sha256 } }, select: CAMPOS });
  }

  async buscar(escopo: EscopoDaConta, sha256: string): Promise<ArquivoRegistrado | undefined> {
    if (!SHA256.test(sha256)) return undefined;
    return (await this.prisma.executar(escopo, (tx) => this.buscarNa(tx, escopo, sha256))) ?? undefined;
  }

  async quaisExistem(escopo: EscopoDaConta, sha256s: readonly string[]): Promise<Set<string>> {
    const validos = sha256s.filter((s) => SHA256.test(s));
    if (validos.length === 0) return new Set();
    const linhas = await this.prisma.executar(escopo, (tx) => tx.arquivo.findMany({ where: { contaId: escopo.contaId, sha256: { in: validos } }, select: { sha256: true } }));
    return new Set(linhas.map((l) => l.sha256));
  }

  async registrar(escopo: EscopoDaConta, novo: NovoArquivo): Promise<ArquivoRegistrado> {
    return this.prisma.executar(escopo, async (tx) => {
      // ON CONFLICT DO NOTHING: o mesmo conteúdo enviado duas vezes não é erro, e otto_app não tem
      // UPDATE nesta tabela. (Um INSERT que falha abortaria a transação inteira no PostgreSQL.)
      await tx.$executeRaw`
        INSERT INTO arquivos (id, conta_id, sha256, tipo_mime, bytes, largura, altura, especie, chave_do_objeto, nome_original, origem_banco, origem_autor, origem_licenca, origem_url)
        VALUES (${novo.id}::uuid, ${escopo.contaId}::uuid, ${novo.sha256}, ${novo.tipoMime}, ${novo.bytes}, ${novo.largura}, ${novo.altura}, ${novo.especie}::especie_de_arquivo, ${novo.chaveDoObjeto},
                ${novo.nomeOriginal ?? null}, ${novo.origem?.banco ?? null}, ${novo.origem?.autor ?? null}, ${novo.origem?.licenca ?? null}, ${novo.origem?.url ?? null})
        ON CONFLICT (conta_id, sha256) DO NOTHING`;
      const registrado = await this.buscarNa(tx, escopo, novo.sha256);
      if (!registrado) throw new Error('arquivo não ficou registrado');
      return registrado;
    });
  }
}
