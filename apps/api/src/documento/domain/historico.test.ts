// Desfazer e refazer sobre um histórico que só cresce (docs/mvp/backend.md, 6.3).
// Cada versão tem uma "versão de conteúdo": a própria, se o lote é edição; a que a reversão restaurou.
import { describe, expect, it } from 'vitest';
import { conteudoDe, type LoteNoHistorico, planejarDesfazer, planejarRefazer } from './historico';

/** Histórico de brinquedo: aplica comandos e guarda os lotes como o banco guardaria. */
function historico() {
  const lotes: LoteNoHistorico[] = [];
  const lote = (versao: number) => lotes[versao - 1];
  const conteudoAtual = () => conteudoDe(lotes.at(-1));
  const caudaDeReversoes = () => {
    const cauda: LoteNoHistorico[] = [];
    for (let i = lotes.length - 1; i >= 0 && lotes[i]?.tipo === 'reversao'; i--) cauda.push(lotes[i] as LoteNoHistorico);
    return cauda;
  };
  return {
    editar() {
      lotes.push({ versao: lotes.length + 1, tipo: 'edicao', reverteAteVersao: null });
      return conteudoAtual();
    },
    desfazer() {
      const plano = planejarDesfazer(lotes.at(-1), lote);
      if (!plano) return undefined;
      lotes.push({ versao: lotes.length + 1, tipo: 'reversao', reverteAteVersao: plano.restaurar });
      return plano;
    },
    refazer() {
      const cauda = caudaDeReversoes();
      const antes = lotes[lotes.length - cauda.length - 1];
      const plano = planejarRefazer(cauda, conteudoDe(antes));
      if (!plano) return undefined;
      lotes.push({ versao: lotes.length + 1, tipo: 'reversao', reverteAteVersao: plano.restaurar });
      return plano;
    },
    conteudoAtual,
    versao: () => lotes.length,
  };
}

describe('conteudoDe', () => {
  it('documento sem lote tem conteúdo 0; edição tem o da própria versão; reversão, o que restaurou', () => {
    expect(conteudoDe(undefined)).toBe(0);
    expect(conteudoDe({ versao: 3, tipo: 'edicao', reverteAteVersao: null })).toBe(3);
    expect(conteudoDe({ versao: 4, tipo: 'reversao', reverteAteVersao: 2 })).toBe(2);
  });
});

describe('desfazer', () => {
  it('sem nenhum lote não há o que desfazer', () => {
    expect(historico().desfazer()).toBeUndefined();
  });

  it('desfaz o último passo: restaura o conteúdo anterior e diz qual lote foi desfeito', () => {
    const h = historico();
    h.editar();
    h.editar();
    expect(h.desfazer()).toEqual({ restaurar: 1, desfaz: 2 });
    expect(h.conteudoAtual()).toBe(1);
    expect(h.versao()).toBe(3);
  });

  it('desfazer repetido volta um passo de cada vez, até o documento vazio, e depois não há mais o que desfazer', () => {
    const h = historico();
    h.editar();
    h.editar();
    h.editar();
    expect(h.desfazer()).toEqual({ restaurar: 2, desfaz: 3 });
    expect(h.desfazer()).toEqual({ restaurar: 1, desfaz: 2 });
    expect(h.desfazer()).toEqual({ restaurar: 0, desfaz: 1 });
    expect(h.desfazer()).toBeUndefined();
    expect(h.versao()).toBe(6);
  });

  it('edição depois de desfazer: o próximo desfazer tira a edição nova, e o seguinte continua de onde o primeiro parou', () => {
    const h = historico();
    h.editar(); // 1
    h.editar(); // 2
    h.editar(); // 3
    h.desfazer(); // v4, conteúdo 2
    expect(h.editar()).toBe(5); // v5 em cima do conteúdo 2
    expect(h.desfazer()).toEqual({ restaurar: 2, desfaz: 5 });
    expect(h.desfazer()).toEqual({ restaurar: 1, desfaz: 2 });
  });
});

describe('refazer', () => {
  it('sem desfazer antes, não há o que refazer', () => {
    const h = historico();
    h.editar();
    expect(h.refazer()).toBeUndefined();
  });

  it('refaz o que o desfazer tirou, na ordem inversa', () => {
    const h = historico();
    h.editar();
    h.editar();
    h.editar();
    h.desfazer();
    h.desfazer();
    expect(h.refazer()).toEqual({ restaurar: 2, refaz: 2 });
    expect(h.refazer()).toEqual({ restaurar: 3, refaz: 3 });
    expect(h.refazer()).toBeUndefined();
    expect(h.conteudoAtual()).toBe(3);
  });

  it('desfazer depois de refazer desfaz o que foi refeito', () => {
    const h = historico();
    h.editar();
    h.editar();
    h.desfazer();
    h.refazer();
    expect(h.desfazer()).toEqual({ restaurar: 1, desfaz: 2 });
    expect(h.refazer()).toEqual({ restaurar: 2, refaz: 2 });
  });

  it('edição nova depois de desfazer apaga a possibilidade de refazer', () => {
    const h = historico();
    h.editar();
    h.editar();
    h.desfazer();
    h.editar();
    expect(h.refazer()).toBeUndefined();
  });

  it('desfazer até o vazio e refazer tudo devolve o conteúdo final', () => {
    const h = historico();
    for (let i = 0; i < 5; i++) h.editar();
    for (let i = 0; i < 5; i++) h.desfazer();
    expect(h.conteudoAtual()).toBe(0);
    for (let i = 0; i < 5; i++) h.refazer();
    expect(h.conteudoAtual()).toBe(5);
    expect(h.refazer()).toBeUndefined();
  });
});
