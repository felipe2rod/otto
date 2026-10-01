// Regras da fila de lotes otimista (docs/mvp/frontend.md, seção 3.1; contrato em docs/mvp/backend.md, seção 7.3).
// O documento aqui é de brinquedo: a sessão não conhece o formato da árvore, recebe o aplicador por parâmetro.
import { describe, expect, it, vi } from 'vitest';
import { criarSessaoDoDocumento, type LoteDoEditor, type RespostaDoEnvio } from './sessaoDoDocumento';

type Doc = { itens: readonly string[] };
type Op = { op: 'acrescentar'; item: string } | { op: 'invalida' };

/** Cada chamada do aplicador, com o id do lote que a sessão passou. */
const aplicacoes: string[] = [];

function aplicar(doc: Doc, operacoes: readonly Op[], idDoLote: string) {
  aplicacoes.push(idDoLote);
  let itens = doc.itens;
  for (const o of operacoes) {
    if (o.op === 'invalida') return { ok: false as const, motivo: 'operacao_invalida' };
    itens = [...itens, o.item];
  }
  return { ok: true as const, doc: { itens }, tocados: operacoes.flatMap((o) => (o.op === 'acrescentar' ? [o.item] : [])) };
}

/** Servidor de mentira: guarda cada envio e deixa o teste responder quando quiser. */
function montar(inicial: Doc = { itens: [] }, versao = 7) {
  aplicacoes.length = 0;
  const envios: { lote: LoteDoEditor<Op>; responder: (r: RespostaDoEnvio<Doc>) => void }[] = [];
  let proximoId = 0;
  const recarregar = vi.fn(async () => ({ doc: { itens: ['do-servidor'] } as Doc, versao: 99 }));
  const sessao = criarSessaoDoDocumento<Doc, Op>(
    { doc: inicial, versao },
    {
      aplicar,
      enviar: (lote) => new Promise((responder) => envios.push({ lote, responder })),
      recarregar,
      gerarId: () => `lote-${++proximoId}`,
    },
  );
  /** Responde o envio de índice i e espera a sessão processar. */
  const responder = async (i: number, r: RespostaDoEnvio<Doc>) => {
    envios[i]?.responder(r);
    await new Promise((ok) => setTimeout(ok, 0));
  };
  return { sessao, envios, responder, recarregar };
}

const acrescentar = (item: string): Op[] => [{ op: 'acrescentar', item }];

describe('sessão do documento: aplicação otimista', () => {
  it('mostra o lote na hora, antes de a API confirmar', () => {
    const { sessao } = montar();
    const resultado = sessao.aplicar('acrescentar a', acrescentar('a'));

    expect(resultado).toEqual({ ok: true, id: 'lote-1' });
    expect(sessao.obter().visivel.itens).toEqual(['a']);
    expect(sessao.obter().confirmado.itens).toEqual([]);
    expect(sessao.obter().salvamento).toBe('salvando');
  });

  it('envia com id gerado no navegador e a versão confirmada como base', () => {
    const { sessao, envios } = montar({ itens: [] }, 7);
    sessao.aplicar('acrescentar a', acrescentar('a'));

    expect(envios).toHaveLength(1);
    expect(envios[0]?.lote).toEqual({ id: 'lote-1', versaoBase: 7, descricao: 'acrescentar a', operacoes: acrescentar('a') });
  });

  it('lote que falha aqui não sai do navegador nem muda o documento', () => {
    const { sessao, envios } = montar();
    const resultado = sessao.aplicar('quebrar', [{ op: 'invalida' }]);

    expect(resultado).toEqual({ ok: false, motivo: 'operacao_invalida' });
    expect(envios).toHaveLength(0);
    expect(sessao.obter().visivel.itens).toEqual([]);
    expect(sessao.obter().salvamento).toBe('salvo');
  });

  it('avisa quem assinou e diz o que foi tocado', () => {
    const { sessao } = montar();
    const ouvinte = vi.fn();
    sessao.assinar(ouvinte);
    sessao.aplicar('acrescentar a', acrescentar('a'));

    expect(ouvinte).toHaveBeenCalled();
    expect([...sessao.obter().tocados]).toEqual(['a']);
  });
});

describe('sessão do documento: o id do lote chega a quem aplica', () => {
  // o id de nó novo deriva do id do lote (@otto/documento): aplicar de novo com outro id daria outra árvore
  it('aplica com o id que vai ser enviado, e reaplica com o MESMO id quando o servidor devolve a árvore', async () => {
    const { sessao, envios, responder } = montar();
    sessao.aplicar('a', acrescentar('a'));
    sessao.aplicar('b', acrescentar('b'));
    expect(aplicacoes).toEqual(['lote-1', 'lote-2']);
    expect(envios[0]?.lote.id).toBe('lote-1');

    await responder(0, { tipo: 'confirmado', versao: 8, arvore: { itens: ['a'] } });

    // o lote-2 ainda não foi confirmado: é reaplicado sobre a árvore do servidor, com o id dele
    expect(aplicacoes).toEqual(['lote-1', 'lote-2', 'lote-2']);
  });

  it('lote que chega de fora é aplicado com o id que veio com ele', () => {
    const { sessao } = montar({ itens: [] }, 7);
    sessao.receberLote({ id: 'lote-do-otto', versao: 8, operacoes: acrescentar('x') });
    expect(aplicacoes).toEqual(['lote-do-otto']);
  });
});

describe('sessão do documento: fila em ordem', () => {
  it('manda um lote por vez; o segundo espera o primeiro e usa a versão que ele devolveu', async () => {
    const { sessao, envios, responder } = montar({ itens: [] }, 7);
    sessao.aplicar('a', acrescentar('a'));
    sessao.aplicar('b', acrescentar('b'));

    expect(envios).toHaveLength(1);
    expect(sessao.obter().visivel.itens).toEqual(['a', 'b']);
    expect(sessao.obter().pendentes).toBe(2);

    await responder(0, { tipo: 'confirmado', versao: 8 });

    expect(envios).toHaveLength(2);
    expect(envios[1]?.lote.versaoBase).toBe(8);
    expect(sessao.obter().confirmado.itens).toEqual(['a']);
    expect(sessao.obter().salvamento).toBe('salvando');

    await responder(1, { tipo: 'confirmado', versao: 9 });

    expect(sessao.obter()).toMatchObject({ versao: 9, pendentes: 0, salvamento: 'salvo' });
    expect(sessao.obter().confirmado.itens).toEqual(['a', 'b']);
  });

  it('confirmação sem árvore não troca o documento visível: o motor não recompõe o que já desenhou', async () => {
    const { sessao, responder } = montar();
    sessao.aplicar('a', acrescentar('a'));
    sessao.aplicar('b', acrescentar('b'));
    const visivel = sessao.obter().visivel;
    const aplicacoesAntes = aplicacoes.length;

    await responder(0, { tipo: 'confirmado', versao: 8 });

    expect(sessao.obter().visivel).toBe(visivel);
    expect(sessao.obter().confirmado.itens).toEqual(['a']);
    // nada foi aplicado de novo: o confirmado é o resultado que a sessão já tinha
    expect(aplicacoes.length).toBe(aplicacoesAntes);

    await responder(1, { tipo: 'confirmado', versao: 9 });
    expect(sessao.obter().visivel).toBe(visivel);
    expect(sessao.obter().confirmado).toBe(visivel);
  });

  it('adota a árvore que o servidor devolve e reaplica por cima o que ainda não foi confirmado', async () => {
    const { sessao, responder } = montar();
    sessao.aplicar('a', acrescentar('a'));
    sessao.aplicar('b', acrescentar('b'));

    await responder(0, { tipo: 'confirmado', versao: 8, arvore: { itens: ['a-como-o-servidor-mediu'] } });

    expect(sessao.obter().confirmado.itens).toEqual(['a-como-o-servidor-mediu']);
    expect(sessao.obter().visivel.itens).toEqual(['a-como-o-servidor-mediu', 'b']);
  });
});

describe('sessão do documento: recusa', () => {
  it('lote recusado sai junto com os que vieram depois dele, e o documento volta ao confirmado', async () => {
    const { sessao, envios, responder } = montar();
    sessao.aplicar('a', acrescentar('a'));
    sessao.aplicar('b', acrescentar('b'));

    await responder(0, { tipo: 'recusado', codigo: 'lote_invalido', detalhe: { indice: 0 } });

    expect(sessao.obter().visivel.itens).toEqual([]);
    expect(sessao.obter().pendentes).toBe(0);
    expect(sessao.obter().recusa).toEqual({ codigo: 'lote_invalido', detalhe: { indice: 0 }, descartados: 2 });
    expect(envios).toHaveLength(1);
  });

  it('versão desatualizada descarta a fila e busca o documento de novo', async () => {
    const { sessao, responder, recarregar } = montar();
    sessao.aplicar('a', acrescentar('a'));

    await responder(0, { tipo: 'versao_desatualizada', versaoAtual: 99 });

    expect(recarregar).toHaveBeenCalledTimes(1);
    expect(sessao.obter()).toMatchObject({ versao: 99, pendentes: 0, salvamento: 'salvo' });
    expect(sessao.obter().visivel.itens).toEqual(['do-servidor']);
    expect(sessao.obter().recusa?.codigo).toBe('versao_desatualizada');
  });

  it('dispensar a recusa limpa o aviso', async () => {
    const { sessao, responder } = montar();
    sessao.aplicar('a', acrescentar('a'));
    await responder(0, { tipo: 'recusado', codigo: 'lote_invalido' });

    sessao.dispensarRecusa();

    expect(sessao.obter().recusa).toBeUndefined();
  });
});

describe('sessão do documento: sem conexão', () => {
  it('guarda o lote, trava a edição e reenvia com o MESMO id quando pedem de novo', async () => {
    const { sessao, envios, responder } = montar();
    sessao.aplicar('a', acrescentar('a'));

    await responder(0, { tipo: 'sem_conexao' });

    expect(sessao.obter().salvamento).toBe('sem-conexao');
    expect(sessao.obter().visivel.itens).toEqual(['a']);
    // sem conexão a edição trava: melhor travar do que deixar editar algo que não será salvo (experiencia.md, 3.9)
    expect(sessao.aplicar('b', acrescentar('b'))).toEqual({ ok: false, motivo: 'sem_conexao' });

    sessao.tentarDeNovo();

    expect(envios).toHaveLength(2);
    expect(envios[1]?.lote.id).toBe(envios[0]?.lote.id);

    await responder(1, { tipo: 'confirmado', versao: 8 });
    expect(sessao.obter()).toMatchObject({ versao: 8, salvamento: 'salvo' });
  });

  it('tentar de novo sem nada na fila não envia nada', () => {
    const { sessao, envios } = montar();
    sessao.tentarDeNovo();
    expect(envios).toHaveLength(0);
  });
});

describe('sessão do documento: só leitura', () => {
  it('recusa edição enquanto o Otto trabalha na peça', () => {
    const { sessao, envios } = montar();
    sessao.definirSomenteLeitura(true);

    expect(sessao.aplicar('a', acrescentar('a'))).toEqual({ ok: false, motivo: 'somente_leitura' });
    expect(envios).toHaveLength(0);

    sessao.definirSomenteLeitura(false);
    expect(sessao.aplicar('a', acrescentar('a')).ok).toBe(true);
  });
});

describe('sessão do documento: lote que chega de fora', () => {
  it('lote do Otto com a versão seguinte entra no confirmado; versão já vista é ignorada', () => {
    const { sessao } = montar({ itens: [] }, 7);

    expect(sessao.receberLote({ id: 'lote-do-otto', versao: 8, operacoes: acrescentar('do-otto') })).toBe('aplicado');
    expect(sessao.receberLote({ id: 'lote-do-otto', versao: 8, operacoes: acrescentar('do-otto') })).toBe('ignorado');

    expect(sessao.obter().confirmado.itens).toEqual(['do-otto']);
    expect(sessao.obter().versao).toBe(8);
  });

  it('lote que pula versão pede para buscar o documento de novo', () => {
    const { sessao, recarregar } = montar({ itens: [] }, 7);
    expect(sessao.receberLote({ id: 'lote-do-otto', versao: 10, operacoes: acrescentar('x') })).toBe('recarregar');
    expect(recarregar).toHaveBeenCalledTimes(1);
  });
});

describe('sessão do documento: adotar a árvore do servidor (desfazer e refazer)', () => {
  it('troca confirmado e visível pela árvore que veio, na versão nova', () => {
    const { sessao } = montar({ itens: ['a'] }, 7);
    const ouvinte = vi.fn();
    sessao.assinar(ouvinte);

    expect(sessao.adotar({ doc: { itens: [] }, versao: 8 })).toBe(true);

    expect(sessao.obter()).toMatchObject({ versao: 8, pendentes: 0, salvamento: 'salvo' });
    expect(sessao.obter().visivel.itens).toEqual([]);
    expect(sessao.obter().confirmado).toBe(sessao.obter().visivel);
    expect(ouvinte).toHaveBeenCalled();
  });

  it('com lote ainda por confirmar não adota: quem pede espera a fila esvaziar', () => {
    const { sessao } = montar();
    sessao.aplicar('a', acrescentar('a'));

    expect(sessao.adotar({ doc: { itens: [] }, versao: 99 })).toBe(false);
    expect(sessao.obter().visivel.itens).toEqual(['a']);
  });
});
