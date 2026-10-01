// Montadores de lote das ações do editor. Todo gesto vira operação do catálogo (ADR 027): estas
// funções não aplicam nada, só dizem QUAL lote o gesto é. Quem aplica é a sessão do documento.
import { caixaDe, type Documento, type No, type Operacao, type Prancheta } from '@otto/documento';
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
