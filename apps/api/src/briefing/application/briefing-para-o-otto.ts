// Do formulário de briefing para o ciclo do Otto (ADR 033: o briefing chega ao agente como dado estruturado).
// Implementa a porta BriefingDaTarefa. Classe pura: lê cadastros e arquivos por porta.
//
// PARA O TREINADOR-DO-OTTO: a forma do material (`materialParaOOtto`) é a da POC (Briefing.tsx, paraOAgente),
// que é a que o prompt e `vetoresDoBriefing`/`referenciasDoBriefing` esperam: `imagens.usarEstas[].no`,
// `logo.usarEste` com moldura, caminhos e origem. As frases ("não definida: a direção de arte escolhe",
// "upload do designer") vieram de lá; a do banco de imagens perdeu o nome do banco (ADR 020: fornecedor só no adaptador). Quem decide a forma e o texto é o treinador.
import { type EntradaDaTarefa, esforcoDaOpcao } from '@otto/agente';
import { CODIGOS_DE_ERRO, FormularioDeBriefing, type PedidoDeTarefaPorBriefing } from '@otto/shared';
import type { CasosDeUsoDeArquivo } from '../../arquivo/application/casos-de-uso-de-arquivo';
import type { RepositorioDeArquivos } from '../../arquivo/application/repositorio-de-arquivos';
import { ErroDaAplicacao } from '../../plataforma/erros/erro-da-aplicacao';
import type { EscopoDaConta } from '../../plataforma/escopo/escopo-da-conta';
import { BriefingDaTarefa } from '../../tarefa/application/briefing-da-tarefa';
import { arquivosDoFormulario } from './casos-de-uso-de-cadastro';
import type { MarcaGuardada, RepositorioDeCadastros } from './repositorio-de-cadastros';

const RESTRICOES_NO_MAXIMO = 12;

/**
 * A marca completa o que o formulário não trouxe; o que ele trouxe vence, campo a campo. Marca sem identidade
 * não inventa identidade. O resultado continua sendo um formulário válido, só com referências.
 */
export function aplicarMarca(formulario: FormularioDeBriefing, marca: MarcaGuardada | undefined): FormularioDeBriefing {
  if (!marca) return formulario;
  const cores = { ...marca.cores, ...formulario.identidade?.cores };
  const fonteDeTitulo = formulario.identidade?.fonteDeTitulo ?? marca.fonteDeTitulo;
  const fonteDeTexto = formulario.identidade?.fonteDeTexto ?? marca.fonteDeTexto;
  const identidade = { ...(Object.keys(cores).length > 0 ? { cores } : {}), ...(fonteDeTitulo ? { fonteDeTitulo } : {}), ...(fonteDeTexto ? { fonteDeTexto } : {}) };
  const logo = formulario.logo ?? (marca.logo ? { arquivo: marca.logo } : undefined);
  const icones = formulario.icones ?? (marca.icones.length > 0 ? marca.icones.map((arquivo) => ({ arquivo })) : undefined);
  const rodape = formulario.textos.rodape || marca.rodape;
  // as permanentes da marca primeiro; se não couber tudo, as da marca ficam
  const restricoes = [...new Set([...marca.restricoes, ...(formulario.restricoes ?? [])])].slice(0, RESTRICOES_NO_MAXIMO);
  return {
    ...formulario,
    textos: { ...formulario.textos, ...(rodape ? { rodape } : {}) },
    ...(Object.keys(identidade).length > 0 ? { identidade } : {}),
    ...(logo ? { logo } : {}),
    ...(icones ? { icones } : {}),
    ...(restricoes.length > 0 ? { restricoes } : {}),
  };
}

export class BriefingParaOOtto extends BriefingDaTarefa {
  constructor(private readonly d: { cadastros: RepositorioDeCadastros; registros: RepositorioDeArquivos; arquivos: CasosDeUsoDeArquivo }) {
    super();
  }

  async preparar(escopo: EscopoDaConta, pedido: PedidoDeTarefaPorBriefing): Promise<{ entrada: EntradaDaTarefa; briefingId?: string }> {
    const marca = pedido.briefing.marcaId ? await this.d.cadastros.buscarMarca(escopo, pedido.briefing.marcaId) : undefined;
    if (pedido.briefing.marcaId && !marca) throw new ErroDaAplicacao(CODIGOS_DE_ERRO.marcaDesconhecida);
    const briefing = aplicarMarca(pedido.briefing, marca);

    // o hash não é autorização: tudo o que o formulário cita tem de ser da conta, e "minhas imagens" tem de ser imagem
    const citados = arquivosDoFormulario(briefing);
    let quantos = 0;
    for (const sha256 of citados.todos) {
      const registro = await this.d.registros.buscar(escopo, sha256);
      if (!registro || (citados.imagens.includes(sha256) && registro.especie !== 'imagem')) quantos++;
    }
    if (quantos > 0) throw new ErroDaAplicacao(CODIGOS_DE_ERRO.arquivoDesconhecido, { quantos });

    const esforco = esforcoDaOpcao(pedido.cuidado);
    const salvo = pedido.briefingId ? await this.d.cadastros.buscarBriefing(escopo, pedido.briefingId) : undefined;
    // `cuidado` vai junto para o editor ler de volta ("nova peça com este briefing"); o ciclo lê `esforco`
    const entrada = { tipo: 'briefing' as const, briefing, ...(esforco ? { esforco } : {}), cuidado: pedido.cuidado } as unknown as EntradaDaTarefa;
    return { entrada, ...(salvo ? { briefingId: salvo.id } : {}) };
  }

  async usado(escopo: EscopoDaConta, briefingId: string): Promise<void> {
    await this.d.cadastros.contarUso(escopo, briefingId);
  }

  async paraOCiclo(escopo: EscopoDaConta, entrada: EntradaDaTarefa): Promise<EntradaDaTarefa> {
    if (entrada.tipo !== 'briefing') return entrada;
    const formulario = FormularioDeBriefing.safeParse(entrada.briefing);
    if (!formulario.success) return entrada;
    const briefing = await this.materialParaOOtto(escopo, formulario.data);
    return { tipo: 'briefing', briefing, ...(entrada.esforco ? { esforco: entrada.esforco } : {}) } as unknown as EntradaDaTarefa;
  }

  /** Cada arquivo é relido sob a conta: o que a conta não tem fica de fora, sem erro (a criação já conferiu). */
  private async materialParaOOtto(escopo: EscopoDaConta, f: FormularioDeBriefing): Promise<Record<string, unknown>> {
    const textos = Object.fromEntries(Object.entries(f.textos).filter(([, valor]) => typeof valor === 'string' && valor.trim().length > 0));
    return {
      ...(f.nome ? { nome: f.nome } : {}),
      ...(f.objetivo ? { objetivo: f.objetivo } : {}),
      ...(f.publico ? { publico: f.publico } : {}),
      formatos: f.formatos,
      textos,
      // sem identidade, dizer isso: mandar cor de exemplo como se fosse da marca estraga a peça (POC, rodada 7)
      identidade: f.identidade ?? 'não definida: a direção de arte escolhe',
      imagens: await this.imagens(escopo, f),
      ...(f.estilo?.length ? { estilo: f.estilo.join(', ') } : {}),
      ...(f.logo ? await this.comVetor(escopo, 'logo', f.logo.arquivo) : {}),
      ...(f.icones?.length ? { icones: (await Promise.all(f.icones.map((i) => this.item(escopo, i.arquivo)))).filter((i) => i !== undefined) } : {}),
      restricoes: f.restricoes ?? [],
      ...(f.observacoes ? { observacoes: f.observacoes } : {}),
    };
  }

  private async imagens(escopo: EscopoDaConta, f: FormularioDeBriefing): Promise<Record<string, unknown>> {
    if (f.imagens.fonte === 'nenhuma') return { fonte: 'nenhuma: peça só tipográfica e com formas' };
    if (f.imagens.fonte === 'banco') return { fonte: 'banco de imagens', termos: f.imagens.termos?.trim() || '(escolha pelos textos)' };
    const usarEstas: unknown[] = [];
    for (const [i, sha256] of f.imagens.arquivos.entries()) {
      const r = await this.d.registros.buscar(escopo, sha256);
      if (r?.especie !== 'imagem' || !r.largura || !r.altura) continue;
      const origem = r.origem ? { banco: r.origem.banco, autor: r.origem.autor, licenca: r.origem.licenca, url: '' } : { banco: 'Upload do designer', autor: 'conta', licenca: 'da conta', url: '' };
      usarEstas.push({ descricao: r.nomeOriginal ?? `imagem ${i + 1}`, no: { tipo: 'imagem', arquivo: sha256, larguraOriginal: r.largura, alturaOriginal: r.altura, ajuste: 'cobrir', origem } });
    }
    return { fonte: 'upload do designer', usarEstas };
  }

  private async comVetor(escopo: EscopoDaConta, chave: 'logo', sha256: string): Promise<Record<string, unknown>> {
    const item = await this.item(escopo, sha256);
    return item ? { [chave]: item } : {};
  }

  /** Logo ou ícone: o desenho do vetor (o ciclo o guarda fora da conversa com o modelo), ou a imagem. */
  private async item(escopo: EscopoDaConta, sha256: string): Promise<Record<string, unknown> | undefined> {
    const r = await this.d.registros.buscar(escopo, sha256);
    if (!r) return undefined;
    if (r.especie === 'vetor') {
      try {
        const vetor = await this.d.arquivos.vetor(escopo, sha256);
        return { arquivo: vetor.no.origem.nome, usarEste: { moldura: vetor.no.moldura, caminhos: vetor.no.caminhos, origem: vetor.no.origem }, avisosDaImportacao: vetor.avisos };
      } catch {
        return undefined;
      }
    }
    if (r.especie !== 'imagem' || !r.largura || !r.altura) return undefined;
    return {
      arquivo: r.nomeOriginal ?? 'logo',
      usarEste: { tipo: 'imagem', arquivo: sha256, larguraOriginal: r.largura, alturaOriginal: r.altura },
      nota: 'em imagem (não é vetor): não muda de cor nem ganha versão monocromática',
    };
  }
}
