// Montadores de lote das ações do editor. Todo gesto vira operação do catálogo (ADR 027): estas
// funções não aplicam nada, só dizem QUAL lote o gesto é. Quem aplica é a sessão do documento.
import { caixaDe, type Documento, type No, type Operacao, type Prancheta, todasAsCamadas } from '@otto/documento';
import { editor as textos } from '../../textos/editor';
import type { Selecao } from './interface';

export interface LoteParaAplicar {
  /** Como o lote aparece no histórico da peça. */
  descricao: string;
  operacoes: Operacao[];
}

export interface NoNoDocumento {
  prancheta: Prancheta;
  no: No;
  /** A lista que contém o nó: filhos da prancheta ou do grupo. */
  irmaos: readonly No[];
  indice: number;
}

function procurar(irmaos: readonly No[], id: string): Omit<NoNoDocumento, 'prancheta'> | undefined {
  for (let indice = 0; indice < irmaos.length; indice++) {
    const no = irmaos[indice] as No;
    if (no.id === id) return { no, irmaos, indice };
    const dentro = no.tipo === 'grupo' ? procurar(no.filhos, id) : undefined;
    if (dentro) return dentro;
  }
  return undefined;
}

export function acharNoPorId(doc: Documento, id: string): NoNoDocumento | undefined {
  for (const prancheta of doc.pranchetas) {
    const achado = procurar(prancheta.filhos, id);
    if (achado) return { prancheta, ...achado };
  }
  return undefined;
}

/** As camadas da seleção que existem no documento e podem ser alteradas (bloqueada fica de fora). */
function editaveis(doc: Documento, selecao: Selecao): No[] {
  if (selecao?.tipo !== 'camadas') return [];
  return selecao.ids.flatMap((id) => {
    const no = acharNoPorId(doc, id)?.no;
    return no && !no.bloqueado ? [no] : [];
  });
}

const nomes = (nos: readonly Pick<No, 'nome'>[]): string => nos.map((n) => n.nome).join(', ');

export function loteDeMoverPorSeta(doc: Documento, selecao: Selecao, dx: number, dy: number): LoteParaAplicar | null {
  const operacoes = editaveis(doc, selecao).flatMap((no): Operacao[] => {
    const caixa = caixaDe(no);
    return caixa ? [{ op: 'mover', alvo: no.id, x: caixa.x + dx, y: caixa.y + dy }] : [];
  });
  if (operacoes.length === 0) return null;
  const movidos = editaveis(doc, selecao).filter((no) => caixaDe(no));
  return { descricao: textos.historico.mover(nomes(movidos)), operacoes };
}

export function loteDeRemover(doc: Documento, selecao: Selecao): LoteParaAplicar | null {
  const nos = editaveis(doc, selecao);
  if (nos.length === 0) return null;
  return { descricao: textos.historico.remover(nomes(nos)), operacoes: nos.map((no) => ({ op: 'remover', alvo: no.id })) };
}

export function loteDeVisibilidade(no: No): LoteParaAplicar {
  return { descricao: (no.visivel ? textos.historico.ocultar : textos.historico.mostrar)(no.nome), operacoes: [{ op: 'alterar', alvo: no.id, props: { visivel: !no.visivel } }] };
}

export function loteDeBloqueio(no: No): LoteParaAplicar {
  return { descricao: (no.bloqueado ? textos.historico.desbloquear : textos.historico.bloquear)(no.nome), operacoes: [{ op: 'alterar', alvo: no.id, props: { bloqueado: !no.bloqueado } }] };
}

export function loteDeRenomear(no: Pick<No, 'id' | 'nome'>, nome: string): LoteParaAplicar | null {
  const novo = nome.trim();
  if (novo === '' || novo === no.nome) return null;
  return { descricao: textos.historico.renomear(no.nome, novo), operacoes: [{ op: 'alterar', alvo: no.id, props: { nome: novo } }] };
}

/** Troca de propriedades de uma camada. `propriedade` é o rótulo da tela, para a descrição do lote. */
export function loteDeAlterar(no: Pick<No, 'id' | 'nome'>, props: Record<string, unknown>, propriedade: string): LoteParaAplicar {
  return { descricao: textos.historico.alterar(propriedade, no.nome), operacoes: [{ op: 'alterar', alvo: no.id, props }] };
}

/** Um passo na pilha, entre as irmãs: 1 traz para a frente, -1 envia para trás. */
export function loteDeReordenar(doc: Documento, id: string, sentido: 1 | -1): LoteParaAplicar | null {
  const achado = acharNoPorId(doc, id);
  if (!achado || achado.no.bloqueado) return null;
  const posicao = achado.indice + sentido;
  if (posicao < 0 || posicao >= achado.irmaos.length) return null;
  return { descricao: (sentido === 1 ? textos.historico.paraAFrente : textos.historico.paraTras)(achado.no.nome), operacoes: [{ op: 'reordenar', alvo: id, posicao }] };
}

/** Soltar a camada sobre uma irmã, no painel: `acima` é mais para a frente na pilha. Só entre irmãs. */
/** Onde a camada arrastada foi solta no painel de Camadas: ao lado de uma linha, ou dentro dela (grupo ou prancheta). */
export interface DestinoNoPainel {
  id: string;
  onde: 'acima' | 'abaixo' | 'dentro';
}

/**
 * Soltar uma camada no painel de Camadas. Entre irmãs é `reordenar`; para dentro de grupo, para a
 * raiz ou para outra prancheta é `transferir`. Sempre UMA operação. A posição no documento é o
 * índice de baixo para cima; o painel mostra de cima para baixo, então "acima" é o índice seguinte.
 */
export function loteDeSoltarNoPainel(doc: Documento, id: string, destino: DestinoNoPainel): LoteParaAplicar | null {
  const achado = acharNoPorId(doc, id);
  if (!achado || achado.no.bloqueado || id === destino.id) return null;
  const { no } = achado;
  const dentroDeSi = (alvo: string) => no.tipo === 'grupo' && todasAsCamadas(no.filhos).some((n) => n.id === alvo);
  const paiDe = (irmaos: readonly No[], prancheta: Prancheta) => todasAsCamadas(prancheta.filhos).find((n) => n.tipo === 'grupo' && n.filhos === irmaos);

  // dentro de uma prancheta: o topo da raiz dela
  const prancheta = doc.pranchetas.find((p) => p.id === destino.id);
  if (prancheta) {
    if (destino.onde !== 'dentro') return null;
    if (achado.irmaos === prancheta.filhos) {
      if (achado.indice === prancheta.filhos.length - 1) return null;
      return { descricao: textos.historico.paraAFrente(no.nome), operacoes: [{ op: 'reordenar', alvo: id, posicao: 'frente' }] };
    }
    return { descricao: textos.historico.transferir(no.nome, prancheta.nome), operacoes: [{ op: 'transferir', alvo: id, prancheta: prancheta.id, posicao: 'frente' }] };
  }

  const alvo = acharNoPorId(doc, destino.id);
  if (!alvo || dentroDeSi(destino.id)) return null;

  // dentro de um grupo: o topo dele
  if (destino.onde === 'dentro') {
    if (alvo.no.tipo !== 'grupo' || alvo.no.bloqueado) return null;
    if (achado.irmaos === alvo.no.filhos && achado.indice === alvo.no.filhos.length - 1) return null;
    return { descricao: textos.historico.transferir(no.nome, alvo.no.nome), operacoes: [{ op: 'transferir', alvo: id, grupo: alvo.no.id, posicao: 'frente' }] };
  }

  // ao lado de uma irmã: só muda a ordem
  if (alvo.irmaos === achado.irmaos) {
    const semElaMesma = achado.irmaos.filter((n) => n.id !== id);
    const indiceDoAlvo = semElaMesma.findIndex((n) => n.id === destino.id);
    const posicao = destino.onde === 'acima' ? indiceDoAlvo + 1 : indiceDoAlvo;
    if (posicao === achado.indice) return null;
    return { descricao: (posicao > achado.indice ? textos.historico.paraAFrente : textos.historico.paraTras)(no.nome), operacoes: [{ op: 'reordenar', alvo: id, posicao }] };
  }

  // ao lado de uma camada de outro lugar: entra na lista dela (grupo, raiz, outra prancheta)
  const grupo = paiDe(alvo.irmaos, alvo.prancheta);
  if (grupo?.bloqueado) return null;
  const posicao = destino.onde === 'acima' ? alvo.indice + 1 : alvo.indice;
  return {
    descricao: textos.historico.transferir(no.nome, grupo?.nome ?? alvo.prancheta.nome),
    operacoes: [{ op: 'transferir', alvo: id, ...(grupo ? { grupo: grupo.id } : { prancheta: alvo.prancheta.id }), posicao }],
  };
}

/** Um nome que ainda não existe na prancheta (nomes são únicos dentro dela). */
function nomeLivre(ocupados: Set<string>, base: string, comNumero: (n: number) => string): string {
  if (!ocupados.has(base)) return base;
  for (let n = 2; ; n++) if (!ocupados.has(comNumero(n))) return comNumero(n);
}

/** As camadas selecionadas, sem as que já estão dentro de um grupo também selecionado. */
function selecionadasDeCima(doc: Documento, selecao: Selecao): NoNoDocumento[] {
  if (selecao?.tipo !== 'camadas') return [];
  const achados = selecao.ids.flatMap((id) => acharNoPorId(doc, id) ?? []);
  const dentroDeOutra = (id: string) => achados.some((a) => a.no.id !== id && a.no.tipo === 'grupo' && todasAsCamadas(a.no.filhos).some((n) => n.id === id));
  return achados.filter((a) => !dentroDeOutra(a.no.id));
}

/**
 * Duplica as camadas selecionadas: UM `duplicar` por camada (grupo vai inteiro). A cópia nasce logo
 * acima da original, com o nome que o catálogo dá. Quem aplica acha as cópias com `camadasNovas`.
 */
export function loteDeDuplicar(doc: Documento, selecao: Selecao): LoteParaAplicar | null {
  const camadas = selecionadasDeCima(doc, selecao);
  if (camadas.length === 0) return null;
  return { descricao: textos.historico.duplicar(nomes(camadas.map((a) => a.no))), operacoes: camadas.map((a) => ({ op: 'duplicar', alvo: a.no.id, dx: 0, dy: 0 })) };
}

/** As camadas que existem em `depois` e não em `antes`, sem as de dentro de um grupo também novo. */
export function camadasNovas(antes: Documento, depois: Documento): string[] {
  const velhas = new Set(antes.pranchetas.flatMap((p) => todasAsCamadas(p.filhos).map((n) => n.id)));
  const novas: string[] = [];
  const andar = (nos: readonly No[]) => {
    for (const no of nos) {
      if (!velhas.has(no.id)) novas.push(no.id);
      else if (no.tipo === 'grupo') andar(no.filhos);
    }
  };
  for (const p of depois.pranchetas) andar(p.filhos);
  return novas;
}

/**
 * Agrupa as camadas selecionadas num grupo novo, com nome livre na prancheta. O catálogo só agrupa
 * camadas do mesmo nível: quando não são, devolve o motivo para a tela dizer, em vez de um lote que falha.
 */
export function loteDeAgrupar(doc: Documento, selecao: Selecao): LoteParaAplicar | 'niveis-diferentes' | null {
  const camadas = selecionadasDeCima(doc, selecao);
  const [primeira] = camadas;
  if (!primeira) return null;
  if (camadas.some((a) => a.irmaos !== primeira.irmaos)) return 'niveis-diferentes';
  if (camadas.some((a) => a.no.bloqueado)) return null;
  const ocupados = new Set(todasAsCamadas(primeira.prancheta.filhos).map((n) => n.nome));
  const nome = nomeLivre(ocupados, textos.camadas.grupoNovo(1), textos.camadas.grupoNovo);
  return { descricao: textos.historico.agrupar(nomes(camadas.map((a) => a.no))), operacoes: [{ op: 'agrupar', alvos: camadas.map((a) => a.no.id), nome }] };
}

/** Desfaz os grupos selecionados. `soltas` são as camadas que saem de dentro, para o editor selecioná-las. */
export function loteDeDesagrupar(doc: Documento, selecao: Selecao): { lote: LoteParaAplicar; soltas: string[] } | null {
  const grupos = selecionadasDeCima(doc, selecao).flatMap((a) => (a.no.tipo === 'grupo' && !a.no.bloqueado ? [a.no] : []));
  if (grupos.length === 0) return null;
  return {
    lote: { descricao: textos.historico.desagrupar(nomes(grupos)), operacoes: grupos.map((g) => ({ op: 'desagrupar', alvo: g.id })) },
    soltas: grupos.flatMap((g) => g.filhos.map((f) => f.id)),
  };
}

/** Uma camada como estava e como ficou depois de redimensionar ou girar pela alça. */
export interface Transformada {
  no: Pick<No, 'id' | 'nome'>;
  antes: { x: number; y: number; w: number; h: number; rotacao: number };
  depois: { x: number; y: number; w: number; h: number; rotacao: number };
}

/**
 * Redimensionar ou girar pela alça: UM `alterar` por camada que mudou, só com o que mudou (girar uma
 * camada em torno do centro manda só a rotação). Nada mudou: não há lote.
 */
export function loteDeTransformar(camadas: readonly Transformada[], gesto: 'redimensionar' | 'girar'): LoteParaAplicar | null {
  const mudadas: Pick<No, 'id' | 'nome'>[] = [];
  const operacoes = camadas.flatMap(({ no, antes, depois }): Operacao[] => {
    const props: Record<string, number> = {};
    if (depois.x !== antes.x || depois.y !== antes.y || depois.w !== antes.w || depois.h !== antes.h) Object.assign(props, { x: depois.x, y: depois.y, largura: depois.w, altura: depois.h });
    if (depois.rotacao !== antes.rotacao) props.rotacao = depois.rotacao;
    if (Object.keys(props).length === 0) return [];
    mudadas.push(no);
    return [{ op: 'alterar', alvo: no.id, props }];
  });
  if (operacoes.length === 0) return null;
  return { descricao: textos.historico[gesto](nomes(mudadas)), operacoes };
}

/** O que o editor precisa de um arquivo enviado para pô-lo no documento (resposta de POST /api/arquivos). */
export interface ImagemEnviada {
  sha256: string;
  largura: number;
  altura: number;
  /** De onde veio a imagem que não é do designer (banco de imagens): vai no nó, para o relatório de exportação (ADR 032). */
  origem?: { banco: string; autor: string; licenca: string; url: string } | undefined;
}

/** Fração da prancheta que uma imagem solta ocupa no máximo, e a largura de um vetor importado. */
const FRACAO_DA_IMAGEM = 0.6;
const FRACAO_DO_VETOR = 0.25;
const PRANCHETA_PADRAO = { largura: 1080, altura: 1350 };

const semExtensao = (arquivo: string): string => arquivo.replace(/\.[^.]+$/, '').trim() || arquivo;

/** Onde a camada nova entra: a prancheta pedida, ou a primeira; sem prancheta nenhuma, o lote cria uma antes. */
function destino(doc: Documento, pranchetaId: string | undefined): { alvo: string; largura: number; altura: number; ocupados: Set<string>; antes: Operacao[] } {
  const prancheta = doc.pranchetas.find((p) => p.id === pranchetaId) ?? doc.pranchetas[0];
  if (prancheta) return { alvo: prancheta.id, largura: prancheta.largura, altura: prancheta.altura, ocupados: new Set(todasAsCamadas(prancheta.filhos).map((n) => n.nome)), antes: [] };
  const nome = textos.camadas.pranchetaNova;
  return { alvo: nome, ...PRANCHETA_PADRAO, ocupados: new Set(), antes: [{ op: 'criarPrancheta', nome, ...PRANCHETA_PADRAO, fundo: '#ffffff' }] };
}

/** A imagem enviada vira camada: reduzida para caber (nunca ampliada), centrada no ponto pedido ou na prancheta. */
export function loteDeInserirImagem(doc: Documento, pranchetaId: string | undefined, arquivo: ImagemEnviada, nomeDoArquivo: string, ponto?: { x: number; y: number }): LoteParaAplicar {
  const d = destino(doc, pranchetaId);
  const escala = Math.min((d.largura * FRACAO_DA_IMAGEM) / arquivo.largura, (d.altura * FRACAO_DA_IMAGEM) / arquivo.altura, 1);
  const largura = Math.max(1, Math.round(arquivo.largura * escala));
  const altura = Math.max(1, Math.round(arquivo.altura * escala));
  const centro = ponto ?? { x: d.largura / 2, y: d.altura / 2 };
  const base = semExtensao(nomeDoArquivo);
  const nome = nomeLivre(d.ocupados, base, (n) => `${base} ${n}`);
  const no = {
    tipo: 'imagem',
    nome,
    arquivo: arquivo.sha256,
    larguraOriginal: arquivo.largura,
    alturaOriginal: arquivo.altura,
    ajuste: 'cobrir',
    x: Math.round(centro.x - largura / 2),
    y: Math.round(centro.y - altura / 2),
    largura,
    altura,
    ...(arquivo.origem ? { origem: arquivo.origem } : {}),
  };
  return { descricao: textos.historico.inserir(nome), operacoes: [...d.antes, { op: 'criarNo', prancheta: d.alvo, no: no as never }] };
}

/** O vetor que a API importou do SVG (`no` pronto para criarNo): faltam nome, posição e tamanho. */
export function loteDeInserirVetor(
  doc: Documento,
  pranchetaId: string | undefined,
  vetor: { moldura: [number, number] } & Record<string, unknown>,
  nomeDoArquivo: string,
  ponto?: { x: number; y: number },
): LoteParaAplicar {
  const d = destino(doc, pranchetaId);
  const largura = Math.max(1, Math.round(d.largura * FRACAO_DO_VETOR));
  const altura = Math.max(1, Math.round((largura * vetor.moldura[1]) / vetor.moldura[0]));
  const centro = ponto ?? { x: d.largura / 2, y: d.altura / 2 };
  const base = semExtensao(nomeDoArquivo);
  const nome = nomeLivre(d.ocupados, base, (n) => `${base} ${n}`);
  const no = { ...vetor, nome, x: Math.round(centro.x - largura / 2), y: Math.round(centro.y - altura / 2), largura, altura };
  return { descricao: textos.historico.inserir(nome), operacoes: [...d.antes, { op: 'criarNo', prancheta: d.alvo, no: no as never }] };
}

/** Trocar a imagem de uma camada de foto: muda o arquivo e as medidas de origem; a caixa e o enquadramento ficam. */
/**
 * A origem (banco, autor, licença) é da imagem antiga: sai junto com ela. `null` é como o catálogo
 * tira uma propriedade opcional. Sem isso, o relatório de exportação daria a foto do designer ao
 * autor do banco (ADR 032).
 */
export function loteDeTrocarImagem(no: Pick<No, 'id' | 'nome'> & { origem?: unknown }, arquivo: ImagemEnviada): LoteParaAplicar {
  const semOrigem = no.origem === undefined ? {} : { origem: null };
  return {
    descricao: textos.historico.trocarImagem(no.nome),
    operacoes: [{ op: 'alterar', alvo: no.id, props: { arquivo: arquivo.sha256, larguraOriginal: arquivo.largura, alturaOriginal: arquivo.altura, ...semOrigem } }],
  };
}

interface Trecho {
  inicio: number;
  fim: number;
}

/**
 * Os trechos de estilo (posições no conteúdo) depois de o texto mudar. A mudança é o miolo entre o
 * começo e o fim que os dois textos têm em comum: o que está antes fica, o que está depois anda, e o
 * trecho que a contém cresce ou encolhe com ela. Trecho que ficou vazio some.
 */
export function ajustarTrechos<T extends Trecho>(antes: string, depois: string, trechos: readonly T[]): T[] {
  if (antes === depois) return [...trechos];
  const menor = Math.min(antes.length, depois.length);
  let comeco = 0;
  while (comeco < menor && antes[comeco] === depois[comeco]) comeco++;
  let fim = 0;
  while (fim < menor - comeco && antes[antes.length - 1 - fim] === depois[depois.length - 1 - fim]) fim++;
  const fimAntigo = antes.length - fim;
  const fimNovo = depois.length - fim;
  const levar = (posicao: number): number => (posicao <= comeco ? posicao : posicao >= fimAntigo ? posicao + (fimNovo - fimAntigo) : Math.min(posicao, fimNovo));
  return trechos.map((t) => ({ ...t, inicio: levar(t.inicio), fim: levar(t.fim) })).filter((t) => t.fim > t.inicio);
}

/**
 * O texto de uma camada editado no canvas: UM `alterar` do conteúdo, com os trechos de estilo nas
 * posições novas. Texto igual não vira lote; texto vazio também não (a camada ficaria invisível).
 */
export function loteDeEditarTexto(no: Pick<No, 'id' | 'nome'> & { conteudo: string; trechos?: readonly Trecho[] | undefined }, novo: string): LoteParaAplicar | null {
  if (novo === no.conteudo || novo.trim() === '') return null;
  const trechos = no.trechos ? ajustarTrechos(no.conteudo, novo, no.trechos) : undefined;
  const props = { conteudo: novo, ...(trechos ? { trechos: trechos.length > 0 ? trechos : null } : {}) };
  return { descricao: textos.historico.editarTexto(no.nome), operacoes: [{ op: 'alterar', alvo: no.id, props }] };
}
