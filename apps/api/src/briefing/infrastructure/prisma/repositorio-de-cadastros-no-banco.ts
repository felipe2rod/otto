// Adaptador de RepositorioDeCadastros sobre PostgreSQL (Prisma), sob RLS.
// O limite por conta é contado e criado na mesma transação, com trava por conta (como nas exportações):
// dois pedidos ao mesmo tempo não passam do limite.
import type { CoresDaIdentidade, OpcaoDeCuidado, RascunhoDeBriefing } from '@otto/shared';
import type { EscopoDaConta } from '../../../plataforma/escopo/escopo-da-conta';
import type { JsonDoBanco, PrismaComEscopo, TransacaoComEscopo } from '../../../plataforma/persistencia/prisma-com-escopo';
import { type BriefingGuardado, type DadosDeBriefing, type DadosDeMarca, type ItemDeBriefingGuardado, type MarcaGuardada, RepositorioDeCadastros } from '../../application/repositorio-de-cadastros';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface LinhaDeMarca {
  id: string;
  nome: string;
  site: string | null;
  cores: unknown;
  fonteDeTitulo: string | null;
  fonteDeTexto: string | null;
  logoSha256: string | null;
  icones: unknown;
  rodape: string | null;
  restricoes: unknown;
  criadaEm: Date;
  alteradaEm: Date;
}

function marcaDe(l: LinhaDeMarca): MarcaGuardada {
  return {
    id: l.id,
    nome: l.nome,
    ...(l.site ? { site: l.site } : {}),
    cores: l.cores as CoresDaIdentidade,
    ...(l.fonteDeTitulo ? { fonteDeTitulo: l.fonteDeTitulo } : {}),
    ...(l.fonteDeTexto ? { fonteDeTexto: l.fonteDeTexto } : {}),
    ...(l.logoSha256 ? { logo: l.logoSha256 } : {}),
    icones: l.icones as string[],
    ...(l.rodape ? { rodape: l.rodape } : {}),
    restricoes: l.restricoes as string[],
    criadaEm: l.criadaEm,
    alteradaEm: l.alteradaEm,
  };
}

const colunasDaMarca = (d: DadosDeMarca) => ({
  nome: d.nome,
  site: d.site ?? null,
  cores: d.cores as JsonDoBanco,
  fonteDeTitulo: d.fonteDeTitulo ?? null,
  fonteDeTexto: d.fonteDeTexto ?? null,
  logoSha256: d.logo ?? null,
  icones: d.icones as JsonDoBanco,
  rodape: d.rodape ?? null,
  restricoes: d.restricoes as JsonDoBanco,
});

interface LinhaDeBriefing {
  id: string;
  nome: string;
  marcaId: string | null;
  dados: unknown;
  cuidado: string | null;
  usos: number;
  criadoEm: Date;
  alteradoEm: Date;
}

/** A marca do briefing é a da COLUNA (a chave estrangeira a anula quando a marca é apagada), não a que ficou no JSON. */
function briefingDe(l: LinhaDeBriefing): BriefingGuardado {
  const { marcaId: _m, ...semMarca } = l.dados as RascunhoDeBriefing;
  return {
    id: l.id,
    nome: l.nome,
    dados: { ...semMarca, ...(l.marcaId ? { marcaId: l.marcaId } : {}) } as RascunhoDeBriefing,
    ...(l.cuidado ? { cuidado: l.cuidado as OpcaoDeCuidado } : {}),
    usos: l.usos,
    criadoEm: l.criadoEm,
    alteradoEm: l.alteradoEm,
  };
}

export class RepositorioDeCadastrosNoBanco extends RepositorioDeCadastros {
  constructor(private readonly prisma: PrismaComEscopo) {
    super();
  }

  /** Um cadastro por vez por conta, para a contagem do limite valer. */
  private travar(tx: TransacaoComEscopo, escopo: EscopoDaConta, o: 'marcas' | 'briefings'): Promise<unknown> {
    return tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${o}:${escopo.contaId}`}, 0))`;
  }

  private async marcaExiste(tx: TransacaoComEscopo, escopo: EscopoDaConta, id: string | undefined): Promise<boolean> {
    if (id === undefined) return true;
    if (!UUID.test(id)) return false;
    return (await tx.marca.count({ where: { id, contaId: escopo.contaId } })) > 0;
  }

  criarMarca(escopo: EscopoDaConta, nova: { id: string; dados: DadosDeMarca; agora: Date }, limite: number): Promise<MarcaGuardada | 'limite'> {
    return this.prisma.executar(escopo, async (tx) => {
      await this.travar(tx, escopo, 'marcas');
      if ((await tx.marca.count({ where: { contaId: escopo.contaId } })) >= limite) return 'limite';
      return marcaDe(await tx.marca.create({ data: { id: nova.id, contaId: escopo.contaId, ...colunasDaMarca(nova.dados), criadaEm: nova.agora, alteradaEm: nova.agora } }));
    });
  }

  async listarMarcas(escopo: EscopoDaConta): Promise<MarcaGuardada[]> {
    const linhas = await this.prisma.executar(escopo, (tx) => tx.$queryRaw<{ id: string }[]>`SELECT id FROM marcas WHERE conta_id = ${escopo.contaId}::uuid ORDER BY lower(nome), id`);
    if (linhas.length === 0) return [];
    const marcas = await this.prisma.executar(escopo, (tx) => tx.marca.findMany({ where: { contaId: escopo.contaId, id: { in: linhas.map((l) => l.id) } } }));
    const porId = new Map(marcas.map((m) => [m.id, m]));
    return linhas.flatMap((l) => {
      const m = porId.get(l.id);
      return m ? [marcaDe(m)] : [];
    });
  }

  async buscarMarca(escopo: EscopoDaConta, id: string): Promise<MarcaGuardada | undefined> {
    if (!UUID.test(id)) return undefined;
    const linha = await this.prisma.executar(escopo, (tx) => tx.marca.findFirst({ where: { id, contaId: escopo.contaId } }));
    return linha ? marcaDe(linha) : undefined;
  }

  async substituirMarca(escopo: EscopoDaConta, id: string, dados: DadosDeMarca, agora: Date): Promise<MarcaGuardada | undefined> {
    if (!UUID.test(id)) return undefined;
    return this.prisma.executar(escopo, async (tx) => {
      const { count } = await tx.marca.updateMany({ where: { id, contaId: escopo.contaId }, data: { ...colunasDaMarca(dados), alteradaEm: agora } });
      if (count === 0) return undefined;
      const linha = await tx.marca.findFirst({ where: { id, contaId: escopo.contaId } });
      return linha ? marcaDe(linha) : undefined;
    });
  }

  async apagarMarca(escopo: EscopoDaConta, id: string): Promise<boolean> {
    if (!UUID.test(id)) return false;
    // a chave estrangeira anula marca_id nos briefings que apontavam para ela
    return (await this.prisma.executar(escopo, (tx) => tx.marca.deleteMany({ where: { id, contaId: escopo.contaId } }))).count > 0;
  }

  criarBriefing(escopo: EscopoDaConta, novo: { id: string; dados: DadosDeBriefing; agora: Date }, limite: number): Promise<BriefingGuardado | 'limite' | 'marca'> {
    return this.prisma.executar(escopo, async (tx) => {
      await this.travar(tx, escopo, 'briefings');
      if ((await tx.briefing.count({ where: { contaId: escopo.contaId } })) >= limite) return 'limite';
      if (!(await this.marcaExiste(tx, escopo, novo.dados.dados.marcaId))) return 'marca';
      const linha = await tx.briefing.create({
        data: {
          id: novo.id,
          contaId: escopo.contaId,
          nome: novo.dados.nome,
          marcaId: novo.dados.dados.marcaId ?? null,
          dados: novo.dados.dados as JsonDoBanco,
          cuidado: novo.dados.cuidado ?? null,
          criadoEm: novo.agora,
          alteradoEm: novo.agora,
        },
      });
      return briefingDe(linha);
    });
  }

  async listarBriefings(escopo: EscopoDaConta): Promise<ItemDeBriefingGuardado[]> {
    const linhas = await this.prisma.executar(escopo, (tx) =>
      tx.briefing.findMany({ where: { contaId: escopo.contaId }, orderBy: [{ alteradoEm: 'desc' }, { id: 'desc' }], select: { id: true, nome: true, marcaId: true, usos: true, alteradoEm: true } }),
    );
    return linhas.map((l) => ({ id: l.id, nome: l.nome, ...(l.marcaId ? { marcaId: l.marcaId } : {}), usos: l.usos, alteradoEm: l.alteradoEm }));
  }

  async buscarBriefing(escopo: EscopoDaConta, id: string): Promise<BriefingGuardado | undefined> {
    if (!UUID.test(id)) return undefined;
    const linha = await this.prisma.executar(escopo, (tx) => tx.briefing.findFirst({ where: { id, contaId: escopo.contaId } }));
    return linha ? briefingDe(linha) : undefined;
  }

  async substituirBriefing(escopo: EscopoDaConta, id: string, dados: DadosDeBriefing, agora: Date): Promise<BriefingGuardado | 'marca' | undefined> {
    if (!UUID.test(id)) return undefined;
    return this.prisma.executar(escopo, async (tx) => {
      if ((await tx.briefing.count({ where: { id, contaId: escopo.contaId } })) === 0) return undefined;
      if (!(await this.marcaExiste(tx, escopo, dados.dados.marcaId))) return 'marca';
      await tx.briefing.updateMany({
        where: { id, contaId: escopo.contaId },
        data: { nome: dados.nome, marcaId: dados.dados.marcaId ?? null, dados: dados.dados as JsonDoBanco, cuidado: dados.cuidado ?? null, alteradoEm: agora },
      });
      const linha = await tx.briefing.findFirst({ where: { id, contaId: escopo.contaId } });
      return linha ? briefingDe(linha) : undefined;
    });
  }

  async apagarBriefing(escopo: EscopoDaConta, id: string): Promise<boolean> {
    if (!UUID.test(id)) return false;
    return (await this.prisma.executar(escopo, (tx) => tx.briefing.deleteMany({ where: { id, contaId: escopo.contaId } }))).count > 0;
  }

  async contarUso(escopo: EscopoDaConta, id: string): Promise<boolean> {
    if (!UUID.test(id)) return false;
    return (await this.prisma.executar(escopo, (tx) => tx.briefing.updateMany({ where: { id, contaId: escopo.contaId }, data: { usos: { increment: 1 } } }))).count > 0;
  }
}
