import { aplicarLote, type Documento, documentoVazio } from '@otto/documento';
import { describe, expect, it } from 'vitest';
import { conferirTextoDoCliente, textosDoBriefing, textosEntreAspas } from './texto-do-cliente';

function peca(textos: Record<string, string>): Documento {
  const operacoes = [
    { op: 'criarPrancheta', nome: 'Feed', largura: 1080, altura: 1350, fundo: '#ffffff' },
    ...Object.entries(textos).map(([nome, conteudo], i) => ({
      op: 'criarNo',
      prancheta: 'Feed',
      no: { tipo: 'texto', nome, conteudo, x: 72, y: 72 + i * 200, largura: 900, altura: 160, fonte: 'Anton', tamanho: 80, cor: '#000000' },
    })),
  ];
  const r = aplicarLote(documentoVazio(), operacoes, { autoria: { tipo: 'agente', tarefaId: 't' }, idDoLote: 'lote-1' });
  if (!r.ok) throw new Error(r.erro.mensagem);
  return r.doc;
}

describe('texto do cliente é literal', () => {
  it('passa quando todas as palavras estão na prancheta, mesmo divididas em camadas', () => {
    const doc = peca({ Título: 'Cappuccino', 'Título 2': 'em dobro' });
    expect(conferirTextoDoCliente(doc, ['Cappuccino em dobro'])).toEqual([]);
  });

  it('acusa a palavra que sumiu, com a prancheta', () => {
    const doc = peca({ Título: 'Cappuccino duplo' });
    const [p] = conferirTextoDoCliente(doc, ['Cappuccino em dobro']);
    expect(p?.prancheta).toBe('Feed');
    expect(p?.faltam).toEqual(['em', 'dobro']);
    expect(p?.texto).toBe('Cappuccino em dobro');
  });

  it('não confunde caixa nem pontuação nas pontas, e preserva preço e arroba', () => {
    const doc = peca({ Título: 'CAPPUCCINO EM DOBRO!', Rodapé: '@cafeaurora · R$ 1' });
    expect(conferirTextoDoCliente(doc, ['Cappuccino em dobro', '@cafeaurora', 'R$ 1'])).toEqual([]);
  });

  it('só olha as pranchetas pedidas (as que a tarefa criou)', () => {
    const doc = peca({ Título: 'Outra coisa' });
    expect(conferirTextoDoCliente(doc, ['Cappuccino'], new Set(['id-que-nao-existe']))).toEqual([]);
  });

  it('camada oculta não conta como texto presente', () => {
    const doc = peca({ Título: 'Cappuccino em dobro' });
    const r = aplicarLote(doc, [{ op: 'alterar', alvo: 'Feed/Título', props: { visivel: false } }], { autoria: { tipo: 'agente', tarefaId: 't' }, idDoLote: 'lote-2' });
    if (!r.ok) throw new Error(r.erro.mensagem);
    expect(conferirTextoDoCliente(r.doc, ['Cappuccino em dobro'])).toHaveLength(1);
  });
});

describe('de onde vêm os textos obrigatórios', () => {
  it('do briefing: os campos de texto preenchidos', () => {
    expect(textosDoBriefing({ textos: { titulo: 'Jazz na Praça', subtitulo: '', chamada: 'Veja a programação' } })).toEqual(['Jazz na Praça', 'Veja a programação']);
    expect(textosDoBriefing({})).toEqual([]);
    expect(textosDoBriefing(undefined)).toEqual([]);
  });

  it('do pedido livre: o que está entre aspas retas ou curvas', () => {
    expect(textosEntreAspas('story da Crové, título "Chegou o verão" e rodapé “crove.com”')).toEqual(['Chegou o verão', 'crove.com']);
    expect(textosEntreAspas('post de café gelado, tom acolhedor')).toEqual([]);
  });
});
