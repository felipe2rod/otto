// Montadores de lote das ações do editor. Todo gesto vira operação do catálogo (ADR 027): estas
// funções não aplicam nada, só dizem QUAL lote o gesto é. Quem aplica é a sessão do documento.
import { type Caixa, caixaDe, type Documento, type No, type Operacao, type Prancheta, todasAsCamadas } from '@otto/documento';
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

const nomes = (nos: readonly No[]): string => nos.map((n) => n.nome).join(', ');

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
export function loteDeReordenarPara(doc: Documento, id: string, idDoAlvo: string, onde: 'acima' | 'abaixo'): LoteParaAplicar | null {
  const achado = acharNoPorId(doc, id);
  if (!achado || achado.no.bloqueado || id === idDoAlvo) return null;
  // o catálogo não muda camada de pai: o alvo tem de estar na mesma lista
  const semElaMesma = achado.irmaos.filter((n) => n.id !== id);
  const indiceDoAlvo = semElaMesma.findIndex((n) => n.id === idDoAlvo);
  if (indiceDoAlvo < 0) return null;
  // `posicao` é o índice na lista sem a camada (0 = embaixo)
  const posicao = onde === 'acima' ? indiceDoAlvo + 1 : indiceDoAlvo;
  if (posicao === achado.indice) return null;
  return { descricao: (posicao > achado.indice ? textos.historico.paraAFrente : textos.historico.paraTras)(achado.no.nome), operacoes: [{ op: 'reordenar', alvo: id, posicao }] };
}

/** Um nome que ainda não existe na prancheta (nomes são únicos dentro dela). */
function nomeLivre(ocupados: Set<string>, base: string, comNumero: (n: number) => string): string {
  if (!ocupados.has(base)) return base;
  for (let n = 2; ; n++) if (!ocupados.has(comNumero(n))) return comNumero(n);
}

/**
 * Duplica as camadas selecionadas: cada cópia nasce logo acima da original, como no Photoshop.
 * O catálogo não tem "duplicar camada": é `criarNo` com as propriedades da original e `reordenar`
 * para o lugar. Devolve também os nomes criados, para o editor selecionar as cópias.
 */
export function loteDeDuplicar(doc: Documento, selecao: Selecao): { lote: LoteParaAplicar; nomes: string[] } | null {
  if (selecao?.tipo !== 'camadas') return null;
  const operacoes: Operacao[] = [];
  const nomes: string[] = [];
  const originais: string[] = [];
  // nomes ocupados por prancheta, contando os que este lote cria
  const ocupados = new Map<string, Set<string>>();

  const copiar = (prancheta: Prancheta, no: No, grupo: string | undefined): string => {
    const nomesDaPrancheta = ocupados.get(prancheta.id) ?? new Set(todasAsCamadas(prancheta.filhos).map((n) => n.nome));
    ocupados.set(prancheta.id, nomesDaPrancheta);
    let numero = 1;
    while (nomesDaPrancheta.has(textos.camadas.copia(no.nome, numero))) numero++;
    const nome = textos.camadas.copia(no.nome, numero);
    nomesDaPrancheta.add(nome);
    const { id: _id, ...semId } = no;
    const novo = no.tipo === 'grupo' ? (({ filhos: _filhos, ...resto }) => resto)({ ...semId, filhos: undefined }) : semId;
    operacoes.push({ op: 'criarNo', prancheta: prancheta.id, no: { ...novo, nome, bloqueado: false } as never, ...(grupo ? { grupo } : {}) });
    // as filhas do grupo entram dentro da cópia, de baixo para cima
    if (no.tipo === 'grupo') for (const filha of no.filhos) copiar(prancheta, filha, `${prancheta.nome}/${nome}`);
    return nome;
  };

  for (const id of selecao.ids) {
    const achado = acharNoPorId(doc, id);
    if (!achado) continue;
    // dentro de grupo, a cópia nasce no mesmo grupo
    const pai = todasAsCamadas(achado.prancheta.filhos).find((n) => n.tipo === 'grupo' && n.filhos === achado.irmaos);
    const nome = copiar(achado.prancheta, achado.no, pai ? pai.id : undefined);
    operacoes.push({ op: 'reordenar', alvo: `${achado.prancheta.nome}/${nome}`, posicao: achado.indice + 1 });
    nomes.push(nome);
    originais.push(achado.no.nome);
  }
  if (operacoes.length === 0) return null;
  return { lote: { descricao: textos.historico.duplicar(originais.join(', ')), operacoes }, nomes };
}

export function loteDeRedimensionar(no: Pick<No, 'id' | 'nome'>, caixa: Caixa): LoteParaAplicar {
  return { descricao: textos.historico.redimensionar(no.nome), operacoes: [{ op: 'alterar', alvo: no.id, props: { x: caixa.x, y: caixa.y, largura: caixa.w, altura: caixa.h } }] };
}

/** O que o editor precisa de um arquivo enviado para pô-lo no documento (resposta de POST /api/arquivos). */
export interface ImagemEnviada {
  sha256: string;
  largura: number;
  altura: number;
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
