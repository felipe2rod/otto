// Adaptador falso de RepositorioDeImportacoes, para teste de caso de uso. Cumpre o mesmo contrato do banco.
import type { PedidoDeImportacao } from '@otto/shared';
import type { EscopoDaConta } from '../../../plataforma/escopo/escopo-da-conta';
import {
  type ConclusaoDaImportacao,
  ESTADOS_ABERTOS,
  type ImportacaoGuardada,
  type InicioDeImportacao,
  type NovaImportacao,
  RepositorioDeImportacoes,
  type RetomadaDeImportacao,
} from '../../application/repositorio-de-importacoes';

interface Linha extends ImportacaoGuardada {
  contaId: string;
  batimentoEm?: Date;
}

export class RepositorioDeImportacoesEmMemoria extends RepositorioDeImportacoes {
  private readonly linhas = new Map<string, Linha>();

  private achar(escopo: EscopoDaConta, id: string): Linha | undefined {
    const l = this.linhas.get(id);
    return l && l.contaId === escopo.contaId ? l : undefined;
  }

  private daConta(escopo: EscopoDaConta): Linha[] {
    return [...this.linhas.values()].filter((l) => l.contaId === escopo.contaId);
  }

  private copia(l: Linha): ImportacaoGuardada {
    const { contaId: _conta, batimentoEm: _batimento, ...resto } = l;
    return structuredClone(resto);
  }

  async criarSeCouber(escopo: EscopoDaConta, nova: NovaImportacao, limite: number): Promise<ImportacaoGuardada | undefined> {
    if (this.daConta(escopo).filter((l) => ESTADOS_ABERTOS.includes(l.estado)).length >= limite) return undefined;
    const linha: Linha = { ...structuredClone(nova), contaId: escopo.contaId, estado: 'enviada', tentativas: 0 };
    this.linhas.set(nova.id, linha);
    return this.copia(linha);
  }

  async buscar(escopo: EscopoDaConta, id: string): Promise<ImportacaoGuardada | undefined> {
    const l = this.achar(escopo, id);
    return l ? this.copia(l) : undefined;
  }

  async daPeca(escopo: EscopoDaConta, documentoId: string): Promise<ImportacaoGuardada | undefined> {
    const l = this.daConta(escopo).find((x) => x.documentoId === documentoId);
    return l ? this.copia(l) : undefined;
  }

  async listar(escopo: EscopoDaConta, filtro: { criadasDesde: Date; limite: number }): Promise<ImportacaoGuardada[]> {
    return this.daConta(escopo)
      .filter((l) => l.criadaEm >= filtro.criadasDesde)
      .sort((a, b) => b.criadaEm.getTime() - a.criadaEm.getTime())
      .slice(0, filtro.limite)
      .map((l) => this.copia(l));
  }

  async pedir(escopo: EscopoDaConta, id: string, pedido: PedidoDeImportacao, agora: Date): Promise<{ importacao: ImportacaoGuardada; naFrente: number } | 'fora-do-estado' | undefined> {
    const l = this.achar(escopo, id);
    if (!l) return undefined;
    if (l.estado !== 'enviada' || l.expiraEm <= agora) return 'fora-do-estado';
    const naFrente = this.daConta(escopo).filter((x) => x.estado === 'na_fila' || x.estado === 'rodando').length;
    Object.assign(l, { estado: 'na_fila', pedido: structuredClone(pedido), pedidaEm: agora });
    return { importacao: this.copia(l), naFrente };
  }

  async devolver(escopo: EscopoDaConta, id: string): Promise<void> {
    const l = this.achar(escopo, id);
    if (l?.estado !== 'na_fila') return;
    l.estado = 'enviada';
    delete l.pedido;
    delete l.pedidaEm;
  }

  async descartar(escopo: EscopoDaConta, id: string, agora: Date): Promise<boolean> {
    const l = this.achar(escopo, id);
    if (l?.estado !== 'enviada') return false;
    Object.assign(l, { estado: 'descartada', terminadaEm: agora });
    return true;
  }

  private interromper(l: Linha, agora: Date): void {
    Object.assign(l, { estado: 'falhou', erro: { codigo: 'interrompida' }, terminadaEm: agora });
  }

  async iniciar(escopo: EscopoDaConta, id: string, agora: Date, semSinalDesde: Date, retomar?: RetomadaDeImportacao): Promise<InicioDeImportacao> {
    const semSinal = (l: Linha, desde: Date) => !l.batimentoEm || l.batimentoEm < desde;
    for (const outra of this.daConta(escopo)) {
      if (outra.estado === 'rodando' && !(retomar && outra.id === id) && semSinal(outra, semSinalDesde)) this.interromper(outra, agora);
    }
    const l = this.achar(escopo, id);
    if (l?.estado === 'rodando' && retomar) {
      if (!semSinal(l, retomar.semSinalDesde)) return { resultado: 'ignorada' };
      if (l.tentativas < retomar.maximoDeTentativas) {
        Object.assign(l, { batimentoEm: agora, tentativas: l.tentativas + 1 });
        return { resultado: 'iniciada', importacao: this.copia(l), retomada: true };
      }
      this.interromper(l, agora);
      return { resultado: 'ignorada' };
    }
    if (l?.estado !== 'na_fila') return { resultado: 'ignorada' };
    if (this.daConta(escopo).some((x) => x.estado === 'rodando')) return { resultado: 'ocupada' };
    Object.assign(l, { estado: 'rodando', batimentoEm: agora, tentativas: l.tentativas + 1 });
    return { resultado: 'iniciada', importacao: this.copia(l) };
  }

  async bater(escopo: EscopoDaConta, id: string, agora: Date): Promise<void> {
    const l = this.achar(escopo, id);
    if (l?.estado === 'rodando') l.batimentoEm = agora;
  }

  async concluir(escopo: EscopoDaConta, id: string, c: ConclusaoDaImportacao): Promise<void> {
    const l = this.achar(escopo, id);
    if (!l || (l.estado !== 'rodando' && l.estado !== 'na_fila')) return;
    Object.assign(l, { estado: c.estado, terminadaEm: c.terminadaEm, duracaoMs: c.duracaoMs });
    if (c.estado === 'pronta') Object.assign(l, { documentoId: c.documentoId, relatorio: structuredClone(c.relatorio) });
    else l.erro = { ...c.erro };
  }

  async darBaixaNasParadas(escopo: EscopoDaConta, agora: Date, limites: { naFilaDesde: Date; semSinalDesde: Date }): Promise<ImportacaoGuardada[]> {
    const fechadas: ImportacaoGuardada[] = [];
    for (const l of this.daConta(escopo)) {
      if (l.estado === 'enviada' && l.expiraEm <= agora) Object.assign(l, { estado: 'descartada', terminadaEm: agora });
      else if (l.estado === 'na_fila' && (l.pedidaEm ?? l.criadaEm) < limites.naFilaDesde) Object.assign(l, { estado: 'falhou', erro: { codigo: 'abandonada' }, terminadaEm: agora });
      else if (l.estado === 'rodando' && (!l.batimentoEm || l.batimentoEm < limites.semSinalDesde)) this.interromper(l, agora);
      else continue;
      fechadas.push(this.copia(l));
    }
    return fechadas;
  }

  async marcarArquivoRemovido(escopo: EscopoDaConta, id: string, agora: Date): Promise<void> {
    const l = this.achar(escopo, id);
    if (l) l.arquivoRemovidoEm = agora;
  }
}
