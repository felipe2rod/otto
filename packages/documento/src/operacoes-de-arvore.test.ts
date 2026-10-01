// duplicar e transferir: as duas operações que mexem na forma da árvore sem criar conteúdo novo.
import { describe, expect, it } from 'vitest';
import { agente, aplicar, congelar, contexto, novoDocumento } from './apoio-de-teste';
import { type Documento, type No, type NoGrupo, todasAsCamadas, VERSAO_DO_CATALOGO, VERSAO_DO_FORMATO } from './esquema';
import { acharNo, aplicarLote } from './operacoes';

const forma = (nome: string, x: number, y: number, extra: object = {}) => ({ tipo: 'forma', forma: 'retangulo', nome, x, y, largura: 100, altura: 100, preenchimento: '#000000', ...extra });

/** Feed: A, G[ B, H[ C ] ], D (base de recorte), E (presa em D), F. Story: A, Z. */
function doc(): Documento {
  return novoDocumento([
    { op: 'criarPrancheta', nome: 'Feed', largura: 1080, altura: 1350, fundo: '#ffffff' },
    { op: 'criarPrancheta', nome: 'Story', largura: 1080, altura: 1920, fundo: '#ffffff' },
    { op: 'criarNo', prancheta: 'Feed', no: forma('A', 10, 10, { mascara: { tipo: 'forma', forma: 'elipse', x: 10, y: 10, largura: 50, altura: 50 } }) },
    { op: 'criarNo', prancheta: 'Feed', no: forma('B', 200, 10) },
    { op: 'criarNo', prancheta: 'Feed', no: forma('C', 400, 10) },
    { op: 'agrupar', alvos: ['Feed/C'], nome: 'H' },
    { op: 'agrupar', alvos: ['Feed/B', 'Feed/H'], nome: 'G' },
    { op: 'criarNo', prancheta: 'Feed', no: forma('D', 10, 300) },
    { op: 'criarNo', prancheta: 'Feed', no: forma('E', 10, 300, { recortadaNaDeBaixo: true }) },
    { op: 'criarNo', prancheta: 'Feed', no: forma('F', 10, 600) },
    { op: 'criarNo', prancheta: 'Story', no: forma('A', 0, 0) },
    { op: 'criarNo', prancheta: 'Story', no: forma('Z', 0, 200) },
  ]);
}
const arvore = (lista: readonly No[]): unknown[] => lista.map((n) => (n.tipo === 'grupo' ? { [n.nome]: arvore(n.filhos) } : n.nome));
const feed = (d: Documento) => arvore(d.pranchetas[0]?.filhos ?? []);
const story = (d: Documento) => arvore(d.pranchetas[1]?.filhos ?? []);

describe('versão do catálogo', () => {
  it('é própria: operação nova muda o catálogo, não o formato do documento salvo', () => {
    expect(VERSAO_DO_FORMATO).toBe(1);
    expect(VERSAO_DO_CATALOGO).toBe(2);
  });
});

describe('duplicar', () => {
  it('põe a cópia logo acima da original, no mesmo pai, com id novo e nome livre', () => {
    const d = aplicar(doc(), [{ op: 'duplicar', alvo: 'Feed/A' }]);
    expect(feed(d)).toEqual(['A', 'A cópia', { G: ['B', { H: ['C'] }] }, 'D', 'E', 'F']);
    const original = acharNo(d, 'Feed/A').no;
    const copia = acharNo(d, 'Feed/A cópia').no;
    expect(copia.id).not.toBe(original.id);
    expect({ ...copia, id: '', nome: '' }).toEqual({ ...original, id: '', nome: '' });
    // cópia funda: nada dividido com a original
    expect(copia.mascara).not.toBe(original.mascara);
  });

  it('o nome da cópia pode vir no pedido; sem ele, "cópia", "cópia 2", ...', () => {
    const d = aplicar(doc(), [
      { op: 'duplicar', alvo: 'Feed/A' },
      { op: 'duplicar', alvo: 'Feed/A' },
      { op: 'duplicar', alvo: 'Feed/A', nome: 'Selo' },
    ]);
    expect(feed(d).slice(0, 4)).toEqual(['A', 'Selo', 'A cópia 2', 'A cópia']);
    const r = aplicarLote(doc(), [{ op: 'duplicar', alvo: 'Feed/A', nome: 'F' }], contexto());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toMatchObject({ op: 'duplicar', campo: 'nome' });
  });

  it('com deslocamento, a cópia sai deslocada, e a máscara de forma vai junto', () => {
    const d = aplicar(doc(), [{ op: 'duplicar', alvo: 'Feed/A', dx: 30, dy: -5 }]);
    expect(acharNo(d, 'Feed/A cópia').no).toMatchObject({ x: 40, y: 5, mascara: { x: 40, y: 5 } });
    expect(acharNo(d, 'Feed/A').no).toMatchObject({ x: 10, y: 10 });
  });

  it('grupo: copia tudo dentro, cada nó com id novo e nome livre', () => {
    const antes = doc();
    const d = aplicar(antes, [{ op: 'duplicar', alvo: 'Feed/G' }]);
    expect(feed(d)).toEqual(['A', { G: ['B', { H: ['C'] }] }, { 'G cópia': ['B cópia', { 'H cópia': ['C cópia'] }] }, 'D', 'E', 'F']);
    const ids = todasAsCamadas(d.pranchetas[0]?.filhos ?? []).map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
    // dentro de um grupo, a cópia fica no mesmo grupo
    expect(feed(aplicar(antes, [{ op: 'duplicar', alvo: 'Feed/C' }]))).toEqual(['A', { G: ['B', { H: ['C', 'C cópia'] }] }, 'D', 'E', 'F']);
  });

  it('base de um recorte: a cópia vai acima do conjunto inteiro, para não roubar as camadas presas; a presa copiada continua presa', () => {
    expect(feed(aplicar(doc(), [{ op: 'duplicar', alvo: 'Feed/D' }]))).toEqual(['A', { G: ['B', { H: ['C'] }] }, 'D', 'E', 'D cópia', 'F']);
    const d = aplicar(doc(), [{ op: 'duplicar', alvo: 'Feed/E' }]);
    expect(feed(d)).toEqual(['A', { G: ['B', { H: ['C'] }] }, 'D', 'E', 'E cópia', 'F']);
    expect(acharNo(d, 'Feed/E cópia').no.recortadaNaDeBaixo).toBe(true);
  });

  it('os ids saem do id do lote: aplicar de novo com o mesmo id dá a mesma árvore, e com outro id, outros ids', () => {
    const ops = [{ op: 'duplicar', alvo: 'Feed/G' }];
    const antes = doc();
    const a = aplicarLote(antes, ops, contexto({ idDoLote: 'lote-x' }));
    const b = aplicarLote(antes, ops, contexto({ idDoLote: 'lote-x' }));
    const c = aplicarLote(antes, ops, contexto({ idDoLote: 'lote-y' }));
    if (!a.ok || !b.ok || !c.ok) throw new Error('falhou');
    expect(a.doc).toEqual(b.doc);
    expect(acharNo(a.doc, 'Feed/G cópia').no.id).not.toBe(acharNo(c.doc, 'Feed/G cópia').no.id);
    // toca só os nós novos
    expect(a.tocados.sort()).toEqual(
      todasAsCamadas([acharNo(a.doc, 'Feed/G cópia').no])
        .map((n) => n.id)
        .sort(),
    );
  });

  it('não muta nada, e o que não foi tocado continua sendo o mesmo objeto', () => {
    const antes = congelar(doc());
    const d = aplicar(antes, [{ op: 'duplicar', alvo: 'Feed/C' }]);
    expect(d.pranchetas[1]).toBe(antes.pranchetas[1]);
    expect(d.pranchetas[0]?.filhos[0]).toBe(antes.pranchetas[0]?.filhos[0]);
    expect(acharNo(d, 'Feed/C').no).toBe(acharNo(antes, 'Feed/C').no);
  });

  it('camada bloqueada pode ser duplicada (a original não muda), e a cópia nasce desbloqueada', () => {
    const travado = aplicar(doc(), [{ op: 'alterar', alvo: 'Feed/A', props: { bloqueado: true } }]);
    const r = aplicarLote(travado, [{ op: 'duplicar', alvo: 'Feed/A' }], contexto({ autoria: agente }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(acharNo(r.doc, 'Feed/A cópia').no.bloqueado).toBe(false);
  });
});

describe('transferir: mover a camada para outro pai', () => {
  it('para dentro de um grupo, no topo dele por padrão; a posição na prancheta não muda', () => {
    const d = aplicar(doc(), [{ op: 'transferir', alvo: 'Feed/A', grupo: 'Feed/G' }]);
    expect(feed(d)).toEqual([{ G: ['B', { H: ['C'] }, 'A'] }, 'D', 'E', 'F']);
    expect(acharNo(d, 'Feed/A').no).toMatchObject({ x: 10, y: 10 });
  });

  it('para fora do grupo: sem "grupo", vai para a raiz da prancheta', () => {
    expect(feed(aplicar(doc(), [{ op: 'transferir', alvo: 'Feed/C' }]))).toEqual(['A', { G: ['B', { H: [] }] }, 'D', 'E', 'F', 'C']);
    expect(feed(aplicar(doc(), [{ op: 'transferir', alvo: 'Feed/C', posicao: 1 }]))).toEqual(['A', 'C', { G: ['B', { H: [] }] }, 'D', 'E', 'F']);
    expect(feed(aplicar(doc(), [{ op: 'transferir', alvo: 'Feed/C', posicao: 'tras' }]))).toEqual(['C', 'A', { G: ['B', { H: [] }] }, 'D', 'E', 'F']);
  });

  it('de um grupo para outro, e com índice (0 = embaixo, já sem a camada na lista)', () => {
    expect(feed(aplicar(doc(), [{ op: 'transferir', alvo: 'Feed/B', grupo: 'Feed/H', posicao: 0 }]))).toEqual(['A', { G: [{ H: ['B', 'C'] }] }, 'D', 'E', 'F']);
    // no mesmo pai, é um reordenar
    expect(feed(aplicar(doc(), [{ op: 'transferir', alvo: 'Feed/F', posicao: 0 }]))).toEqual(['F', 'A', { G: ['B', { H: ['C'] }] }, 'D', 'E']);
    expect(feed(aplicar(doc(), [{ op: 'transferir', alvo: 'Feed/A', posicao: 99 }]))).toEqual([{ G: ['B', { H: ['C'] }] }, 'D', 'E', 'F', 'A']);
  });

  it('um grupo inteiro vai junto; e não entra em si mesmo nem em um descendente', () => {
    expect(feed(aplicar(doc(), [{ op: 'transferir', alvo: 'Feed/H' }]))).toEqual(['A', { G: ['B'] }, 'D', 'E', 'F', { H: ['C'] }]);
    for (const grupo of ['Feed/G', 'Feed/H']) {
      const r = aplicarLote(doc(), [{ op: 'transferir', alvo: 'Feed/G', grupo }], contexto());
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.erro).toMatchObject({ op: 'transferir', campo: 'grupo' });
      if (!r.ok) expect(r.erro.mensagem).toContain('dentro dele mesmo');
    }
  });

  it('para outra prancheta: sai de uma e entra na outra, com as mesmas coordenadas', () => {
    const d = aplicar(doc(), [{ op: 'transferir', alvo: 'Feed/F', prancheta: 'Story' }]);
    expect(feed(d)).toEqual(['A', { G: ['B', { H: ['C'] }] }, 'D', 'E']);
    expect(story(d)).toEqual(['A', 'Z', 'F']);
    expect(acharNo(d, 'Story/F').no).toMatchObject({ x: 10, y: 600 });
  });

  it('nome que já existe na prancheta de destino ganha número, no nó e no que vai dentro dele; o id não muda', () => {
    const antes = aplicar(doc(), [{ op: 'criarNo', prancheta: 'Story', no: forma('B', 0, 400) }]);
    const idDoA = acharNo(antes, 'Feed/A').no.id;
    const idDoB = acharNo(antes, 'Feed/B').no.id;
    const r = aplicarLote(
      antes,
      [
        { op: 'transferir', alvo: 'Feed/A', prancheta: 'Story', posicao: 'tras' },
        { op: 'transferir', alvo: 'Feed/G', prancheta: 'Story' },
      ],
      contexto(),
    );
    if (!r.ok) throw new Error(r.erro.mensagem);
    expect(story(r.doc)).toEqual(['A 2', 'A', 'Z', 'B', { G: ['B 2', { H: ['C'] }] }]);
    expect(acharNo(r.doc, 'Story/A 2').no.id).toBe(idDoA);
    expect(acharNo(r.doc, 'Story/B 2').no.id).toBe(idDoB);
    // o que mudou de nome está em "tocados", junto com o que foi transferido
    expect(r.tocados).toEqual(expect.arrayContaining([idDoA, idDoB, acharNo(r.doc, 'Story/G').no.id]));
  });

  it('para um grupo de outra prancheta: basta o grupo, a prancheta é a dele; os dois juntos precisam concordar', () => {
    const antes = aplicar(doc(), [{ op: 'agrupar', alvos: ['Story/Z'], nome: 'Rodapé' }]);
    expect(story(aplicar(antes, [{ op: 'transferir', alvo: 'Feed/F', grupo: 'Story/Rodapé' }]))).toEqual(['A', { Rodapé: ['Z', 'F'] }]);
    const r = aplicarLote(antes, [{ op: 'transferir', alvo: 'Feed/F', grupo: 'Story/Rodapé', prancheta: 'Feed' }], contexto());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro.campo).toBe('grupo');
  });

  it('recusa: destino que não é grupo, camada bloqueada, grupo de destino bloqueado', () => {
    const erro = (d: Documento, op: object) => {
      const r = aplicarLote(d, [op], contexto({ autoria: agente }));
      return r.ok ? undefined : r.erro;
    };
    expect(erro(doc(), { op: 'transferir', alvo: 'Feed/A', grupo: 'Feed/F' })).toMatchObject({ campo: 'grupo', mensagem: '"F" não é um grupo' });
    const travada = aplicar(doc(), [{ op: 'alterar', alvo: 'Feed/A', props: { bloqueado: true } }]);
    expect(erro(travada, { op: 'transferir', alvo: 'Feed/A', grupo: 'Feed/G' })?.mensagem).toContain('bloqueada');
    const grupoTravado = aplicar(doc(), [{ op: 'alterar', alvo: 'Feed/G', props: { bloqueado: true } }]);
    expect(erro(grupoTravado, { op: 'transferir', alvo: 'Feed/A', grupo: 'Feed/G' })?.mensagem).toContain('bloqueado');
    expect(erro(doc(), { op: 'transferir', alvo: 'Feed/Nada' })?.mensagem).toContain('não existe');
  });

  it('não muta nada; a prancheta que não participa continua sendo o mesmo objeto, e o nó transferido também', () => {
    const antes = congelar(doc());
    const dentro = aplicar(antes, [{ op: 'transferir', alvo: 'Feed/A', grupo: 'Feed/H' }]);
    expect(dentro.pranchetas[1]).toBe(antes.pranchetas[1]);
    expect(acharNo(dentro, 'Feed/A').no).toBe(acharNo(antes, 'Feed/A').no);
    expect((acharNo(dentro, 'Feed/G').no as NoGrupo).filhos[0]).toBe((acharNo(antes, 'Feed/G').no as NoGrupo).filhos[0]);
    const fora = aplicar(antes, [{ op: 'transferir', alvo: 'Feed/F', prancheta: 'Story' }]);
    expect(fora.pranchetas[0]).not.toBe(antes.pranchetas[0]);
    expect(fora.pranchetas[1]).not.toBe(antes.pranchetas[1]);
  });
});
