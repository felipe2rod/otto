// Adaptador falso de RepositorioDeCadastros, para os testes de caso de uso.
import type { EscopoDaConta } from '../../../plataforma/escopo/escopo-da-conta';
import { type BriefingGuardado, type DadosDeBriefing, type DadosDeMarca, type ItemDeBriefingGuardado, type MarcaGuardada, RepositorioDeCadastros } from '../../application/repositorio-de-cadastros';

const copia = <T>(valor: T): T => structuredClone(valor);

export class RepositorioDeCadastrosEmMemoria extends RepositorioDeCadastros {
  private readonly marcas = new Map<string, { contaId: string; marca: MarcaGuardada }>();
  private readonly briefings = new Map<string, { contaId: string; briefing: BriefingGuardado }>();

  private marcasDa(escopo: EscopoDaConta): MarcaGuardada[] {
    return [...this.marcas.values()].filter((m) => m.contaId === escopo.contaId).map((m) => m.marca);
  }
  private briefingsDa(escopo: EscopoDaConta): BriefingGuardado[] {
    return [...this.briefings.values()].filter((b) => b.contaId === escopo.contaId).map((b) => b.briefing);
  }
  private marcaValida(escopo: EscopoDaConta, dados: DadosDeBriefing): boolean {
    const id = dados.dados.marcaId;
    return id === undefined || this.marcas.get(id)?.contaId === escopo.contaId;
  }

  async criarMarca(escopo: EscopoDaConta, nova: { id: string; dados: DadosDeMarca; agora: Date }, limite: number): Promise<MarcaGuardada | 'limite'> {
    if (this.marcasDa(escopo).length >= limite) return 'limite';
    const marca: MarcaGuardada = { ...copia(nova.dados), id: nova.id, criadaEm: nova.agora, alteradaEm: nova.agora };
    this.marcas.set(nova.id, { contaId: escopo.contaId, marca });
    return copia(marca);
  }

  async listarMarcas(escopo: EscopoDaConta): Promise<MarcaGuardada[]> {
    return copia(this.marcasDa(escopo).sort((a, b) => a.nome.toLowerCase().localeCompare(b.nome.toLowerCase(), 'pt-BR')));
  }

  async buscarMarca(escopo: EscopoDaConta, id: string): Promise<MarcaGuardada | undefined> {
    const achada = this.marcas.get(id);
    return achada?.contaId === escopo.contaId ? copia(achada.marca) : undefined;
  }

  async substituirMarca(escopo: EscopoDaConta, id: string, dados: DadosDeMarca, agora: Date): Promise<MarcaGuardada | undefined> {
    const achada = this.marcas.get(id);
    if (achada?.contaId !== escopo.contaId) return undefined;
    achada.marca = { ...copia(dados), id, criadaEm: achada.marca.criadaEm, alteradaEm: agora };
    return copia(achada.marca);
  }

  async apagarMarca(escopo: EscopoDaConta, id: string): Promise<boolean> {
    if (this.marcas.get(id)?.contaId !== escopo.contaId) return false;
    this.marcas.delete(id);
    for (const b of this.briefingsDa(escopo)) if (b.dados.marcaId === id) delete b.dados.marcaId;
    return true;
  }

  async criarBriefing(escopo: EscopoDaConta, novo: { id: string; dados: DadosDeBriefing; agora: Date }, limite: number): Promise<BriefingGuardado | 'limite' | 'marca'> {
    if (this.briefingsDa(escopo).length >= limite) return 'limite';
    if (!this.marcaValida(escopo, novo.dados)) return 'marca';
    const briefing: BriefingGuardado = { ...copia(novo.dados), id: novo.id, usos: 0, criadoEm: novo.agora, alteradoEm: novo.agora };
    this.briefings.set(novo.id, { contaId: escopo.contaId, briefing });
    return copia(briefing);
  }

  async listarBriefings(escopo: EscopoDaConta): Promise<ItemDeBriefingGuardado[]> {
    return this.briefingsDa(escopo)
      .sort((a, b) => b.alteradoEm.getTime() - a.alteradoEm.getTime())
      .map((b) => ({ id: b.id, nome: b.nome, ...(b.dados.marcaId ? { marcaId: b.dados.marcaId } : {}), usos: b.usos, alteradoEm: b.alteradoEm }));
  }

  async buscarBriefing(escopo: EscopoDaConta, id: string): Promise<BriefingGuardado | undefined> {
    const achado = this.briefings.get(id);
    return achado?.contaId === escopo.contaId ? copia(achado.briefing) : undefined;
  }

  async substituirBriefing(escopo: EscopoDaConta, id: string, dados: DadosDeBriefing, agora: Date): Promise<BriefingGuardado | 'marca' | undefined> {
    const achado = this.briefings.get(id);
    if (achado?.contaId !== escopo.contaId) return undefined;
    if (!this.marcaValida(escopo, dados)) return 'marca';
    achado.briefing = { ...copia(dados), id, usos: achado.briefing.usos, criadoEm: achado.briefing.criadoEm, alteradoEm: agora };
    return copia(achado.briefing);
  }

  async apagarBriefing(escopo: EscopoDaConta, id: string): Promise<boolean> {
    if (this.briefings.get(id)?.contaId !== escopo.contaId) return false;
    return this.briefings.delete(id);
  }

  async contarUso(escopo: EscopoDaConta, id: string): Promise<boolean> {
    const achado = this.briefings.get(id);
    if (achado?.contaId !== escopo.contaId) return false;
    achado.briefing.usos++;
    return true;
  }
}
