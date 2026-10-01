// Adaptador falso de RepositorioDeExportacoes, para os testes de caso de uso.
import type { EscopoDaConta } from '../../../plataforma/escopo/escopo-da-conta';
import {
  type ArquivoGuardado,
  type Conclusao,
  type ExportacaoGuardada,
  type FalhaDePrancheta,
  type InicioDeExportacao,
  type NovaExportacao,
  RepositorioDeExportacoes,
} from '../../application/repositorio-de-exportacoes';

interface Guardada {
  contaId: string;
  exportacao: ExportacaoGuardada;
  batimentoEm?: Date;
}

const copia = (e: ExportacaoGuardada): ExportacaoGuardada => structuredClone(e);

export class RepositorioDeExportacoesEmMemoria extends RepositorioDeExportacoes {
  private readonly todas = new Map<string, Guardada>();
  private relogio = 0;

  private achar(escopo: EscopoDaConta, id: string): Guardada | undefined {
    const g = this.todas.get(id);
    return g && g.contaId === escopo.contaId ? g : undefined;
  }

  async criar(escopo: EscopoDaConta, nova: NovaExportacao): Promise<ExportacaoGuardada> {
    this.relogio += 1;
    const exportacao: ExportacaoGuardada = {
      id: nova.id,
      documentoId: nova.documentoId,
      versao: nova.versao,
      nome: nova.nome,
      opcoes: structuredClone(nova.opcoes),
      estado: 'na_fila',
      pranchetasNoTotal: nova.opcoes.pranchetas.length,
      pranchetasProntas: 0,
      arquivos: [],
      falhas: [],
      criadaEm: new Date(1_790_000_000_000 + this.relogio),
    };
    this.todas.set(nova.id, { contaId: escopo.contaId, exportacao });
    return copia(exportacao);
  }

  async buscar(escopo: EscopoDaConta, id: string): Promise<ExportacaoGuardada | undefined> {
    const g = this.achar(escopo, id);
    return g ? copia(g.exportacao) : undefined;
  }

  async contarEmAndamento(escopo: EscopoDaConta): Promise<number> {
    return [...this.todas.values()].filter((g) => g.contaId === escopo.contaId && (g.exportacao.estado === 'na_fila' || g.exportacao.estado === 'rodando')).length;
  }

  async iniciar(escopo: EscopoDaConta, id: string, agora: Date, semSinalDesde: Date): Promise<InicioDeExportacao> {
    for (const g of this.todas.values()) {
      if (g.contaId === escopo.contaId && g.exportacao.estado === 'rodando' && (g.batimentoEm ?? new Date(0)) < semSinalDesde) {
        g.exportacao = { ...g.exportacao, estado: 'falhou', erroCodigo: 'interrompida', terminadaEm: agora };
      }
    }
    const alvo = this.achar(escopo, id);
    if (alvo?.exportacao.estado !== 'na_fila') return { resultado: 'ignorada' };
    if ([...this.todas.values()].some((g) => g.contaId === escopo.contaId && g.exportacao.estado === 'rodando')) return { resultado: 'ocupada' };
    alvo.exportacao = { ...alvo.exportacao, estado: 'rodando' };
    alvo.batimentoEm = agora;
    return { resultado: 'iniciada', exportacao: copia(alvo.exportacao) };
  }

  async bater(escopo: EscopoDaConta, id: string, agora: Date): Promise<void> {
    const g = this.achar(escopo, id);
    if (g) g.batimentoEm = agora;
  }

  async registrarArquivo(escopo: EscopoDaConta, id: string, arquivo: ArquivoGuardado, pranchetas: number, agora: Date): Promise<void> {
    const g = this.achar(escopo, id);
    if (!g) return;
    g.exportacao.arquivos.push({ ...arquivo });
    g.exportacao.pranchetasProntas += pranchetas;
    g.batimentoEm = agora;
  }

  async registrarFalha(escopo: EscopoDaConta, id: string, falha: FalhaDePrancheta, agora: Date): Promise<void> {
    const g = this.achar(escopo, id);
    if (!g) return;
    g.exportacao.falhas.push({ ...falha });
    g.exportacao.pranchetasProntas += 1;
    g.batimentoEm = agora;
  }

  async concluir(escopo: EscopoDaConta, id: string, c: Conclusao): Promise<void> {
    const g = this.achar(escopo, id);
    if (!g) return;
    g.exportacao = {
      ...g.exportacao,
      estado: c.estado,
      terminadaEm: c.terminadaEm,
      duracaoMs: c.duracaoMs,
      ...(c.relatorio ? { relatorio: structuredClone(c.relatorio) } : {}),
      ...(c.erroCodigo ? { erroCodigo: c.erroCodigo } : {}),
      ...(c.expiraEm ? { expiraEm: c.expiraEm } : {}),
    };
  }
}
