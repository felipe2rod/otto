// Casos de uso dos cadastros da conta: marcas e briefings salvos (docs/mvp/backend.md, 17.12). Classe pura.
// Tudo o que entra aqui é conteúdo da conta: o evento de uso leva só identificadores e contagens (ADR 031).
// Arquivo citado (logo, ícone, imagem) é conferido contra a conta: o hash não é autorização.
import {
  BRIEFINGS_POR_CONTA,
  type BriefingSalvo,
  CODIGOS_DE_ERRO,
  type DadosDaMarca,
  type DadosDoBriefingSalvo,
  type ListaDeBriefings,
  type ListaDeMarcas,
  MARCAS_POR_CONTA,
  type Marca,
  type RascunhoDeBriefing,
} from '@otto/shared';
import type { RepositorioDeArquivos } from '../../arquivo/application/repositorio-de-arquivos';
import { ErroDaAplicacao, NaoEncontrado } from '../../plataforma/erros/erro-da-aplicacao';
import type { EscopoDaConta } from '../../plataforma/escopo/escopo-da-conta';
import { type RegistroDeUso, RegistroDeUsoMudo } from '../../plataforma/uso/registro-de-uso';
import type { BriefingGuardado, DadosDeBriefing, DadosDeMarca, MarcaGuardada, RepositorioDeCadastros } from './repositorio-de-cadastros';

export interface DependenciasDoCadastro {
  cadastros: RepositorioDeCadastros;
  arquivos: RepositorioDeArquivos;
  gerarId: () => string;
  agora?: () => Date;
  uso?: RegistroDeUso;
  limites?: { marcas: number; briefings: number };
}

function paraGuardar(d: DadosDaMarca): DadosDeMarca {
  return {
    nome: d.nome,
    ...(d.site ? { site: d.site } : {}),
    cores: d.cores ?? {},
    ...(d.fonteDeTitulo ? { fonteDeTitulo: d.fonteDeTitulo } : {}),
    ...(d.fonteDeTexto ? { fonteDeTexto: d.fonteDeTexto } : {}),
    ...(d.logo ? { logo: d.logo.arquivo } : {}),
    icones: (d.icones ?? []).map((i) => i.arquivo),
    ...(d.rodape ? { rodape: d.rodape } : {}),
    restricoes: d.restricoes ?? [],
  };
}

/** O que está vazio não vai: marca sem identidade não ganha campo de identidade. */
export function marcaDoContrato(m: MarcaGuardada): Marca {
  return {
    id: m.id,
    nome: m.nome,
    ...(m.site ? { site: m.site } : {}),
    ...(Object.keys(m.cores).length > 0 ? { cores: m.cores } : {}),
    ...(m.fonteDeTitulo ? { fonteDeTitulo: m.fonteDeTitulo } : {}),
    ...(m.fonteDeTexto ? { fonteDeTexto: m.fonteDeTexto } : {}),
    ...(m.logo ? { logo: { arquivo: m.logo } } : {}),
    ...(m.icones.length > 0 ? { icones: m.icones.map((arquivo) => ({ arquivo })) } : {}),
    ...(m.rodape ? { rodape: m.rodape } : {}),
    ...(m.restricoes.length > 0 ? { restricoes: m.restricoes } : {}),
    criadaEm: m.criadaEm.toISOString(),
    alteradaEm: m.alteradaEm.toISOString(),
  };
}

function briefingDoContrato(b: BriefingGuardado): BriefingSalvo {
  return { id: b.id, nome: b.nome, dados: b.dados, ...(b.cuidado ? { cuidado: b.cuidado } : {}), usos: b.usos, criadoEm: b.criadoEm.toISOString(), alteradoEm: b.alteradoEm.toISOString() };
}

const semIndefinidos = (d: DadosDoBriefingSalvo): DadosDeBriefing => ({ nome: d.nome, dados: d.dados, ...(d.cuidado ? { cuidado: d.cuidado } : {}) });

/** Os arquivos que um formulário (inteiro ou pela metade) cita, e quais deles precisam ser imagem. */
export function arquivosDoFormulario(dados: Pick<RascunhoDeBriefing, 'imagens' | 'logo' | 'icones'>): { todos: string[]; imagens: string[] } {
  const imagens = dados.imagens?.fonte === 'minhas' ? dados.imagens.arquivos : [];
  return { todos: [...new Set([...imagens, ...(dados.logo ? [dados.logo.arquivo] : []), ...(dados.icones ?? []).map((i) => i.arquivo)])], imagens: [...new Set(imagens)] };
}

export class CasosDeUsoDeCadastro {
  private readonly agora: () => Date;
  private readonly uso: RegistroDeUso;
  private readonly limites: { marcas: number; briefings: number };

  constructor(private readonly d: DependenciasDoCadastro) {
    this.agora = d.agora ?? (() => new Date());
    this.uso = d.uso ?? new RegistroDeUsoMudo();
    this.limites = d.limites ?? { marcas: MARCAS_POR_CONTA, briefings: BRIEFINGS_POR_CONTA };
  }

  // ---------------------------------------------------------------- marcas

  async listarMarcas(escopo: EscopoDaConta): Promise<ListaDeMarcas> {
    return { itens: (await this.d.cadastros.listarMarcas(escopo)).map(marcaDoContrato) };
  }

  async obterMarca(escopo: EscopoDaConta, id: string): Promise<Marca> {
    const marca = await this.d.cadastros.buscarMarca(escopo, id);
    if (!marca) throw new NaoEncontrado();
    return marcaDoContrato(marca);
  }

  async criarMarca(escopo: EscopoDaConta, dados: DadosDaMarca): Promise<Marca> {
    const guardar = paraGuardar(dados);
    await this.exigirArquivos(escopo, [...(guardar.logo ? [guardar.logo] : []), ...guardar.icones]);
    const criada = await this.d.cadastros.criarMarca(escopo, { id: this.d.gerarId(), dados: guardar, agora: this.agora() }, this.limites.marcas);
    if (criada === 'limite') throw new ErroDaAplicacao(CODIGOS_DE_ERRO.limiteDeCadastros, { limite: this.limites.marcas });
    this.marcaSalva(escopo, criada, true);
    return marcaDoContrato(criada);
  }

  async substituirMarca(escopo: EscopoDaConta, id: string, dados: DadosDaMarca): Promise<Marca> {
    // primeiro "existe nesta conta?": marca de outra conta responde o mesmo que marca que não existe, qualquer que seja o corpo
    if (!(await this.d.cadastros.buscarMarca(escopo, id))) throw new NaoEncontrado();
    const guardar = paraGuardar(dados);
    await this.exigirArquivos(escopo, [...(guardar.logo ? [guardar.logo] : []), ...guardar.icones]);
    const trocada = await this.d.cadastros.substituirMarca(escopo, id, guardar, this.agora());
    if (!trocada) throw new NaoEncontrado();
    this.marcaSalva(escopo, trocada, false);
    return marcaDoContrato(trocada);
  }

  async apagarMarca(escopo: EscopoDaConta, id: string): Promise<void> {
    if (!(await this.d.cadastros.apagarMarca(escopo, id))) throw new NaoEncontrado();
    this.uso.registrar(escopo, { evento: 'marca_apagada', marcaId: id });
  }

  private marcaSalva(escopo: EscopoDaConta, m: MarcaGuardada, nova: boolean): void {
    this.uso.registrar(escopo, {
      evento: 'marca_salva',
      marcaId: m.id,
      nova,
      cores: Object.keys(m.cores).length,
      fontes: (m.fonteDeTitulo ? 1 : 0) + (m.fonteDeTexto ? 1 : 0),
      comLogo: m.logo !== undefined,
      icones: m.icones.length,
      restricoes: m.restricoes.length,
    });
  }

  // ---------------------------------------------------------------- briefings salvos

  async listarBriefings(escopo: EscopoDaConta): Promise<ListaDeBriefings> {
    const itens = await this.d.cadastros.listarBriefings(escopo);
    return { itens: itens.map((b) => ({ id: b.id, nome: b.nome, ...(b.marcaId ? { marcaId: b.marcaId } : {}), usos: b.usos, alteradoEm: b.alteradoEm.toISOString() })) };
  }

  async obterBriefing(escopo: EscopoDaConta, id: string): Promise<BriefingSalvo> {
    const briefing = await this.d.cadastros.buscarBriefing(escopo, id);
    if (!briefing) throw new NaoEncontrado();
    return briefingDoContrato(briefing);
  }

  async criarBriefing(escopo: EscopoDaConta, dados: DadosDoBriefingSalvo): Promise<BriefingSalvo> {
    await this.exigirArquivosDoFormulario(escopo, dados.dados);
    const criado = await this.d.cadastros.criarBriefing(escopo, { id: this.d.gerarId(), dados: semIndefinidos(dados), agora: this.agora() }, this.limites.briefings);
    if (criado === 'limite') throw new ErroDaAplicacao(CODIGOS_DE_ERRO.limiteDeCadastros, { limite: this.limites.briefings });
    if (criado === 'marca') throw new ErroDaAplicacao(CODIGOS_DE_ERRO.marcaDesconhecida);
    this.briefingSalvo(escopo, criado, true);
    return briefingDoContrato(criado);
  }

  async substituirBriefing(escopo: EscopoDaConta, id: string, dados: DadosDoBriefingSalvo): Promise<BriefingSalvo> {
    if (!(await this.d.cadastros.buscarBriefing(escopo, id))) throw new NaoEncontrado();
    await this.exigirArquivosDoFormulario(escopo, dados.dados);
    const trocado = await this.d.cadastros.substituirBriefing(escopo, id, semIndefinidos(dados), this.agora());
    if (!trocado) throw new NaoEncontrado();
    if (trocado === 'marca') throw new ErroDaAplicacao(CODIGOS_DE_ERRO.marcaDesconhecida);
    this.briefingSalvo(escopo, trocado, false);
    return briefingDoContrato(trocado);
  }

  async apagarBriefing(escopo: EscopoDaConta, id: string): Promise<void> {
    if (!(await this.d.cadastros.apagarBriefing(escopo, id))) throw new NaoEncontrado();
    this.uso.registrar(escopo, { evento: 'briefing_apagado', briefingId: id });
  }

  private briefingSalvo(escopo: EscopoDaConta, b: BriefingGuardado, novo: boolean): void {
    this.uso.registrar(escopo, { evento: 'briefing_salvo', briefingId: b.id, novo, formatos: b.dados.formatos?.length ?? 0, comMarca: b.dados.marcaId !== undefined });
  }

  // ---------------------------------------------------------------- apoio

  private async exigirArquivosDoFormulario(escopo: EscopoDaConta, dados: RascunhoDeBriefing): Promise<void> {
    await this.exigirArquivos(escopo, arquivosDoFormulario(dados).todos);
  }

  /** Diz QUANTOS a conta não tem, nunca quais: confirmar hash é confirmar que o conteúdo existe em algum lugar. */
  private async exigirArquivos(escopo: EscopoDaConta, hashes: readonly string[]): Promise<void> {
    const unicos = [...new Set(hashes)];
    if (unicos.length === 0) return;
    const existem = await this.d.arquivos.quaisExistem(escopo, unicos);
    const quantos = unicos.filter((h) => !existem.has(h)).length;
    if (quantos > 0) throw new ErroDaAplicacao(CODIGOS_DE_ERRO.arquivoDesconhecido, { quantos });
  }
}
