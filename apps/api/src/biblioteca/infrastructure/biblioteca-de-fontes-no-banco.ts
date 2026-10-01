// Adaptador de BibliotecaDeFontes: registro em catálogo global no PostgreSQL, bytes no armazenamento
// (prefixo biblioteca/). A biblioteca é igual para todas as contas, então os bytes ficam em memória
// do processo depois da primeira leitura: não há dado de conta neste cache.
import { createHash } from 'node:crypto';
import type { ArmazenamentoDeArquivo } from '../../arquivo/application/armazenamento-de-arquivo';
import { chaveDeFonteDaBiblioteca } from '../../arquivo/application/chave-de-objeto';
import { uuidV7 } from '../../plataforma/identidade/uuid-v7';
import type { PrismaComEscopo } from '../../plataforma/persistencia/prisma-com-escopo';
import { BibliotecaDeFontes, type FonteRegistrada, type NovaFonte } from '../application/biblioteca-de-fontes';

const CAMPOS = { familia: true, peso: true, nomePostScript: true, sha256: true, bytes: true } as const;
const FONTES_EM_MEMORIA = 96;

export class BibliotecaDeFontesNoBanco extends BibliotecaDeFontes {
  private readonly emMemoria = new Map<string, Uint8Array>();

  constructor(
    private readonly prisma: PrismaComEscopo,
    private readonly armazenamento: ArmazenamentoDeArquivo,
  ) {
    super();
  }

  async listar(busca?: string): Promise<{ familia: string; pesos: number[] }[]> {
    const q = busca?.trim();
    const linhas = await this.prisma.noCatalogoGlobal((tx) =>
      tx.fonteDaBiblioteca.findMany({ where: q ? { familia: { contains: q, mode: 'insensitive' } } : {}, select: { familia: true, peso: true }, orderBy: [{ familia: 'asc' }, { peso: 'asc' }] }),
    );
    const porFamilia = new Map<string, number[]>();
    for (const l of linhas) porFamilia.set(l.familia, [...(porFamilia.get(l.familia) ?? []), l.peso]);
    return [...porFamilia.entries()].map(([familia, pesos]) => ({ familia, pesos }));
  }

  async pesosDa(familia: string): Promise<FonteRegistrada[]> {
    return this.prisma.noCatalogoGlobal((tx) => tx.fonteDaBiblioteca.findMany({ where: { familia }, select: CAMPOS, orderBy: { peso: 'asc' } }));
  }

  async bytes(fonte: FonteRegistrada): Promise<Uint8Array | undefined> {
    const guardado = this.emMemoria.get(fonte.sha256);
    if (guardado) return guardado;
    const lido = await this.armazenamento.lerDaBiblioteca(chaveDeFonteDaBiblioteca(fonte.sha256));
    if (lido) {
      if (this.emMemoria.size >= FONTES_EM_MEMORIA) this.emMemoria.delete(this.emMemoria.keys().next().value as string);
      this.emMemoria.set(fonte.sha256, lido);
    }
    return lido;
  }

  async registrar(nova: NovaFonte): Promise<FonteRegistrada> {
    const sha256 = createHash('sha256').update(nova.conteudo).digest('hex');
    const chave = chaveDeFonteDaBiblioteca(sha256);
    // primeiro o arquivo, depois a linha: uma linha nunca aponta para arquivo que não existe
    await this.armazenamento.guardarNaBiblioteca(chave, nova.conteudo, 'font/ttf');
    return this.prisma.noCatalogoGlobal(async (tx) => {
      // ON CONFLICT DO NOTHING: otto_app só lê e acrescenta neste catálogo
      await tx.$executeRaw`
        INSERT INTO fontes_da_biblioteca (id, familia, peso, nome_postscript, sha256, bytes, chave_do_objeto, licenca)
        VALUES (${uuidV7()}::uuid, ${nova.familia}, ${nova.peso}, ${nova.nomePostScript}, ${sha256}, ${nova.conteudo.byteLength}, ${chave}, ${nova.licenca})
        ON CONFLICT (familia, peso) DO NOTHING`;
      const registrada = await tx.fonteDaBiblioteca.findUnique({ where: { familia_peso: { familia: nova.familia, peso: nova.peso } }, select: CAMPOS });
      if (!registrada) throw new Error('fonte não ficou registrada');
      return registrada;
    });
  }
}
