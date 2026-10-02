// Todo gesto vira lote do catálogo (ADR 027). Aqui: os montadores de lote das ações do editor.
// Nenhum deles aplica nada: devolvem descrição e operações, e quem aplica é a sessão.
import { aplicarLote, type Documento, documentoVazio } from '@otto/documento';
import { describe, expect, it } from 'vitest';
import { editor as textos } from '../../textos/editor';
import {
  acharNoPorId,
  ajustarTrechos,
  camadasNovas,
  loteDeAgrupar,
  loteDeAlterar,
  loteDeBloqueio,
  loteDeDesagrupar,
  loteDeDuplicar,
  loteDeEditarTexto,
  loteDeInserirImagem,
  loteDeInserirTextura,
  loteDeInserirVetor,
  loteDeMoverPorSeta,
  loteDeRemover,
  loteDeRenomear,
  loteDeReordenar,
  loteDeSoltarNoPainel,
  loteDeTransformar,
  loteDeTrocarImagem,
  loteDeVisibilidade,
} from './acoes';

function montar(): Documento {
  const forma = (nome: string, x: number, extra: Record<string, unknown> = {}) => ({
    tipo: 'forma',
    nome,
    forma: 'retangulo',
    x,
    y: 100,
    largura: 200,
    altura: 100,
    preenchimento: '#ff5b1f',
    ...extra,
  });
  const r = aplicarLote(
    documentoVazio(),
    [
      { op: 'criarPrancheta', nome: 'Feed', largura: 1080, altura: 1350, fundo: '#ffffff' },
      { op: 'criarNo', prancheta: 'Feed', no: forma('A', 100) },
      { op: 'criarNo', prancheta: 'Feed', no: forma('B', 400) },
      { op: 'criarNo', prancheta: 'Feed', no: forma('Travada', 700, { bloqueado: true }) },
      { op: 'agrupar', alvos: ['Feed/A', 'Feed/B'], nome: 'Grupo' },
    ],
    { autoria: { tipo: 'designer' }, idDoLote: 'acoes' },
  );
  if (!r.ok) throw new Error(r.erro.mensagem);
  return r.doc;
}
const doc = montar();
const id = (nome: string) => {
  const feed = doc.pranchetas[0];
  const todos = feed ? [...feed.filhos, ...feed.filhos.flatMap((n) => (n.tipo === 'grupo' ? n.filhos : []))] : [];
  const no = todos.find((n) => n.nome === nome);
  if (!no) throw new Error(`falta ${nome}`);
  return no.id;
};
const aplica = (lote: { operacoes: unknown[] } | null) => lote !== null && aplicarLote(doc, lote.operacoes, { autoria: { tipo: 'designer' }, idDoLote: 'x' }).ok;

describe('achar nó por id', () => {
  it('acha camada dentro de grupo, e devolve a prancheta', () => {
    expect(acharNoPorId(doc, id('A'))?.no.nome).toBe('A');
    expect(acharNoPorId(doc, id('A'))?.prancheta.nome).toBe('Feed');
    expect(acharNoPorId(doc, 'nao-existe')).toBeUndefined();
  });
});

describe('mover por seta', () => {
  it('move cada camada selecionada pela distância pedida, num lote só', () => {
    const lote = loteDeMoverPorSeta(doc, { tipo: 'camadas', ids: [id('A'), id('B')] }, 10, 0);
    expect(lote?.operacoes).toEqual([
      { op: 'mover', alvo: id('A'), x: 110, y: 100 },
      { op: 'mover', alvo: id('B'), x: 410, y: 100 },
    ]);
    expect(lote?.descricao).toBe(textos.historico.mover('A, B'));
    expect(aplica(lote)).toBe(true);
  });

  it('camada bloqueada fica de fora; se só há bloqueada, não há lote', () => {
    expect(loteDeMoverPorSeta(doc, { tipo: 'camadas', ids: [id('A'), id('Travada')] }, 1, 0)?.operacoes).toHaveLength(1);
    expect(loteDeMoverPorSeta(doc, { tipo: 'camadas', ids: [id('Travada')] }, 1, 0)).toBeNull();
  });

  it('sem camada selecionada não há lote', () => {
    expect(loteDeMoverPorSeta(doc, null, 1, 0)).toBeNull();
    expect(loteDeMoverPorSeta(doc, { tipo: 'prancheta', id: 'p' }, 1, 0)).toBeNull();
  });
});

describe('remover', () => {
  it('remove as camadas selecionadas que não estão bloqueadas', () => {
    const lote = loteDeRemover(doc, { tipo: 'camadas', ids: [id('Grupo'), id('Travada')] });
    expect(lote?.operacoes).toEqual([{ op: 'remover', alvo: id('Grupo') }]);
    expect(lote?.descricao).toBe(textos.historico.remover('Grupo'));
    expect(aplica(lote)).toBe(true);
  });

  it('prancheta selecionada não é removida pelo Delete', () => {
    expect(loteDeRemover(doc, { tipo: 'prancheta', id: doc.pranchetas[0]?.id ?? '' })).toBeNull();
  });
});

describe('visibilidade, bloqueio e nome', () => {
  const a = acharNoPorId(doc, id('A'))?.no;
  const travada = acharNoPorId(doc, id('Travada'))?.no;
  if (!a || !travada) throw new Error('faltam camadas');

  it('ocultar e mostrar são `alterar` da propriedade visivel', () => {
    expect(loteDeVisibilidade(a)).toEqual({ descricao: textos.historico.ocultar('A'), operacoes: [{ op: 'alterar', alvo: a.id, props: { visivel: false } }] });
    expect(loteDeVisibilidade({ ...a, visivel: false }).descricao).toBe(textos.historico.mostrar('A'));
    expect(aplica(loteDeVisibilidade(a))).toBe(true);
  });

  it('desbloquear uma camada bloqueada é permitido ao designer', () => {
    const lote = loteDeBloqueio(travada);
    expect(lote).toEqual({ descricao: textos.historico.desbloquear('Travada'), operacoes: [{ op: 'alterar', alvo: travada.id, props: { bloqueado: false } }] });
    expect(aplica(lote)).toBe(true);
  });

  it('renomear apara o nome; nome vazio ou igual não vira lote', () => {
    expect(loteDeRenomear(a, '  Título ')?.operacoes).toEqual([{ op: 'alterar', alvo: a.id, props: { nome: 'Título' } }]);
    expect(loteDeRenomear(a, '   ')).toBeNull();
    expect(loteDeRenomear(a, 'A')).toBeNull();
  });

  it('alterar propriedade leva o nome da propriedade na descrição', () => {
    expect(loteDeAlterar(a, { opacidade: 0.5 }, textos.propriedades.opacidade)).toEqual({
      descricao: textos.historico.alterar(textos.propriedades.opacidade, 'A'),
      operacoes: [{ op: 'alterar', alvo: a.id, props: { opacidade: 0.5 } }],
    });
  });
});

describe('reordenar um passo', () => {
  it('sobe e desce entre as irmãs, pelo índice', () => {
    // dentro do grupo: A embaixo (0), B em cima (1)
    expect(loteDeReordenar(doc, id('A'), 1)?.operacoes).toEqual([{ op: 'reordenar', alvo: id('A'), posicao: 1 }]);
    expect(loteDeReordenar(doc, id('B'), -1)?.operacoes).toEqual([{ op: 'reordenar', alvo: id('B'), posicao: 0 }]);
    expect(aplica(loteDeReordenar(doc, id('A'), 1))).toBe(true);
  });

  it('quem já está no topo não sobe, e quem está embaixo não desce', () => {
    expect(loteDeReordenar(doc, id('B'), 1)).toBeNull();
    expect(loteDeReordenar(doc, id('A'), -1)).toBeNull();
  });
});

describe('soltar uma camada no painel de Camadas', () => {
  // Feed: Grupo (A embaixo, B em cima) e Travada por cima. Story: Solta.
  const comStory = (() => {
    const r = aplicarLote(
      doc,
      [
        { op: 'criarPrancheta', nome: 'Story', largura: 1080, altura: 1920, fundo: '#ffffff' },
        { op: 'criarNo', prancheta: 'Story', no: { tipo: 'forma', nome: 'Solta', forma: 'retangulo', x: 0, y: 0, largura: 10, altura: 10, preenchimento: '#000000' } },
        { op: 'criarNo', prancheta: 'Feed', no: { tipo: 'forma', nome: 'Raiz', forma: 'retangulo', x: 0, y: 0, largura: 10, altura: 10, preenchimento: '#000000' } },
      ],
      { autoria: { tipo: 'designer' }, idDoLote: 'story' },
    );
    if (!r.ok) throw new Error(r.erro.mensagem);
    return r.doc;
  })();
  const feed = comStory.pranchetas[0];
  const story = comStory.pranchetas[1];
  const solta = story?.filhos[0];
  const raiz = feed?.filhos.at(-1);
  if (!feed || !story || !solta || !raiz) throw new Error('faltam camadas');
  const aplicar = (lote: { operacoes: unknown[] } | null) => {
    const r = lote && aplicarLote(comStory, lote.operacoes, { autoria: { tipo: 'designer' }, idDoLote: 'x' });
    if (!r?.ok) throw new Error(r ? r.erro.mensagem : 'sem lote');
    return r.doc;
  };
  const nomesDe = (d: Documento, pai: string) => {
    const no = d.pranchetas.flatMap((p) => p.filhos).find((n) => n.nome === pai);
    return no?.tipo === 'grupo' ? no.filhos.map((n) => n.nome) : [];
  };

  it('entre irmãs é `reordenar`: acima da irmã, logo acima dela; abaixo, logo abaixo', () => {
    expect(loteDeSoltarNoPainel(comStory, id('A'), { id: id('B'), onde: 'acima' })?.operacoes).toEqual([{ op: 'reordenar', alvo: id('A'), posicao: 1 }]);
    expect(loteDeSoltarNoPainel(comStory, id('B'), { id: id('A'), onde: 'abaixo' })?.operacoes).toEqual([{ op: 'reordenar', alvo: id('B'), posicao: 0 }]);
  });

  it('soltar onde a camada já está, ou nela mesma, não vira lote', () => {
    expect(loteDeSoltarNoPainel(comStory, id('A'), { id: id('B'), onde: 'abaixo' })).toBeNull();
    expect(loteDeSoltarNoPainel(comStory, id('A'), { id: id('A'), onde: 'acima' })).toBeNull();
  });

  it('para fora do grupo: soltar ao lado de uma camada da raiz é `transferir` para a raiz, na posição dela', () => {
    const lote = loteDeSoltarNoPainel(comStory, id('A'), { id: raiz.id, onde: 'abaixo' });
    expect(lote?.operacoes).toEqual([{ op: 'transferir', alvo: id('A'), prancheta: feed.id, posicao: feed.filhos.indexOf(raiz) }]);
    const depois = aplicar(lote);
    const nomes = depois.pranchetas[0]?.filhos.map((n) => n.nome) ?? [];
    expect(nomes.indexOf('A')).toBe(nomes.indexOf('Raiz') - 1);
    expect(nomesDe(depois, 'Grupo')).toEqual(['B']);
  });

  it('para dentro do grupo: soltar NO grupo põe a camada no topo dele; soltar ao lado de uma de dentro, na posição dela', () => {
    const noGrupo = loteDeSoltarNoPainel(comStory, raiz.id, { id: id('Grupo'), onde: 'dentro' });
    expect(noGrupo?.operacoes).toEqual([{ op: 'transferir', alvo: raiz.id, grupo: id('Grupo'), posicao: 'frente' }]);
    expect(nomesDe(aplicar(noGrupo), 'Grupo')).toEqual(['A', 'B', 'Raiz']);

    const aoLado = loteDeSoltarNoPainel(comStory, raiz.id, { id: id('B'), onde: 'abaixo' });
    expect(aoLado?.operacoes).toEqual([{ op: 'transferir', alvo: raiz.id, grupo: id('Grupo'), posicao: 1 }]);
    expect(nomesDe(aplicar(aoLado), 'Grupo')).toEqual(['A', 'Raiz', 'B']);
  });

  it('para outra prancheta: soltar NA prancheta leva a camada para o topo dela; ao lado de uma camada de lá, para a posição', () => {
    const naPrancheta = loteDeSoltarNoPainel(comStory, id('A'), { id: story.id, onde: 'dentro' });
    expect(naPrancheta?.operacoes).toEqual([{ op: 'transferir', alvo: id('A'), prancheta: story.id, posicao: 'frente' }]);
    expect(aplicar(naPrancheta).pranchetas[1]?.filhos.map((n) => n.nome)).toEqual(['Solta', 'A']);

    const aoLado = loteDeSoltarNoPainel(comStory, id('A'), { id: solta.id, onde: 'abaixo' });
    expect(aoLado?.operacoes).toEqual([{ op: 'transferir', alvo: id('A'), prancheta: story.id, posicao: 0 }]);
    expect(aplicar(aoLado).pranchetas[1]?.filhos.map((n) => n.nome)).toEqual(['A', 'Solta']);
  });

  it('a descrição diz para onde foi', () => {
    expect(loteDeSoltarNoPainel(comStory, raiz.id, { id: id('Grupo'), onde: 'dentro' })?.descricao).toBe(textos.historico.transferir('Raiz', 'Grupo'));
    expect(loteDeSoltarNoPainel(comStory, id('A'), { id: story.id, onde: 'dentro' })?.descricao).toBe(textos.historico.transferir('A', 'Story'));
    expect(loteDeSoltarNoPainel(comStory, id('A'), { id: raiz.id, onde: 'abaixo' })?.descricao).toBe(textos.historico.transferir('A', 'Feed'));
  });

  it('grupo não entra nele mesmo, camada bloqueada não sai do lugar, grupo bloqueado não recebe', () => {
    expect(loteDeSoltarNoPainel(comStory, id('Grupo'), { id: id('Grupo'), onde: 'dentro' })).toBeNull();
    expect(loteDeSoltarNoPainel(comStory, id('Grupo'), { id: id('A'), onde: 'acima' })).toBeNull();
    expect(loteDeSoltarNoPainel(comStory, id('Travada'), { id: story.id, onde: 'dentro' })).toBeNull();
    const travado = aplicarLote(comStory, [{ op: 'alterar', alvo: id('Grupo'), props: { bloqueado: true } }], { autoria: { tipo: 'designer' }, idDoLote: 't' });
    if (!travado.ok) throw new Error('devia bloquear');
    expect(loteDeSoltarNoPainel(travado.doc, raiz.id, { id: id('Grupo'), onde: 'dentro' })).toBeNull();
  });

  it('soltar na própria prancheta, estando na raiz dela, traz para o topo; já no topo, não há lote', () => {
    expect(loteDeSoltarNoPainel(comStory, id('Grupo'), { id: feed.id, onde: 'dentro' })?.operacoes).toEqual([{ op: 'reordenar', alvo: id('Grupo'), posicao: 'frente' }]);
    expect(loteDeSoltarNoPainel(comStory, raiz.id, { id: feed.id, onde: 'dentro' })).toBeNull();
  });
});

describe('duplicar', () => {
  it('é UM `duplicar` por camada selecionada; a cópia nasce logo acima da original', () => {
    const lote = loteDeDuplicar(doc, { tipo: 'camadas', ids: [id('A')] });
    expect(lote).toEqual({ descricao: textos.historico.duplicar('A'), operacoes: [{ op: 'duplicar', alvo: id('A'), dx: 0, dy: 0 }] });
    const aplicado = lote && aplicarLote(doc, lote.operacoes, { autoria: { tipo: 'designer' }, idDoLote: 'dup' });
    if (!aplicado?.ok) throw new Error('duplicar devia aplicar');
    const grupo = acharNoPorId(aplicado.doc, id('Grupo'))?.no;
    expect(grupo?.tipo === 'grupo' && grupo.filhos.map((n) => n.nome)).toEqual(['A', 'A cópia', 'B']);
  });

  it('grupo é duplicado inteiro, com um `duplicar` só', () => {
    const lote = loteDeDuplicar(doc, { tipo: 'camadas', ids: [id('Grupo')] });
    expect(lote?.operacoes).toEqual([{ op: 'duplicar', alvo: id('Grupo'), dx: 0, dy: 0 }]);
    const aplicado = lote && aplicarLote(doc, lote.operacoes, { autoria: { tipo: 'designer' }, idDoLote: 'dg' });
    if (!aplicado?.ok) throw new Error(aplicado ? aplicado.erro.mensagem : 'sem lote');
    const copia = aplicado.doc.pranchetas[0]?.filhos.find((n) => n.nome === 'Grupo cópia');
    expect(copia?.tipo === 'grupo' && copia.filhos).toHaveLength(2);
  });

  it('camada que já vai na cópia do grupo selecionado não é duplicada duas vezes', () => {
    expect(loteDeDuplicar(doc, { tipo: 'camadas', ids: [id('Grupo'), id('A')] })?.operacoes).toEqual([{ op: 'duplicar', alvo: id('Grupo'), dx: 0, dy: 0 }]);
  });

  it('sem camada selecionada não há o que duplicar', () => {
    expect(loteDeDuplicar(doc, null)).toBeNull();
    expect(loteDeDuplicar(doc, { tipo: 'prancheta', id: 'x' })).toBeNull();
  });
});

describe('o que um lote criou', () => {
  it('devolve as camadas novas de cima: a cópia do grupo, não as filhas dela', () => {
    const lote = loteDeDuplicar(doc, { tipo: 'camadas', ids: [id('Grupo'), id('Travada')] });
    const aplicado = lote && aplicarLote(doc, lote.operacoes, { autoria: { tipo: 'designer' }, idDoLote: 'novas' });
    if (!aplicado?.ok) throw new Error('devia aplicar');
    const novas = camadasNovas(doc, aplicado.doc);
    expect(novas.map((n) => acharNoPorId(aplicado.doc, n)?.no.nome).sort()).toEqual(['Grupo cópia', 'Travada cópia']);
  });
});

describe('agrupar e desagrupar', () => {
  it('agrupar é UM `agrupar` com as camadas selecionadas e um nome livre na prancheta', () => {
    const lote = loteDeAgrupar(doc, { tipo: 'camadas', ids: [id('A'), id('B')] });
    // "Grupo" já existe na prancheta
    expect(lote).toEqual({ descricao: textos.historico.agrupar('A, B'), operacoes: [{ op: 'agrupar', alvos: [id('A'), id('B')], nome: textos.camadas.grupoNovo(2) }] });
    expect(aplica(lote as { operacoes: unknown[] })).toBe(true);
  });

  it('uma camada só também agrupa, como no Photoshop', () => {
    expect((loteDeAgrupar(doc, { tipo: 'camadas', ids: [id('A')] }) as { operacoes: unknown[] }).operacoes).toHaveLength(1);
  });

  it('camadas de níveis diferentes não agrupam: devolve o motivo, para a tela dizer', () => {
    expect(loteDeAgrupar(doc, { tipo: 'camadas', ids: [id('A'), id('Travada')] })).toBe('niveis-diferentes');
  });

  it('com camada bloqueada na seleção, ou sem seleção, não há lote', () => {
    expect(loteDeAgrupar(doc, { tipo: 'camadas', ids: [id('Travada')] })).toBeNull();
    expect(loteDeAgrupar(doc, null)).toBeNull();
  });

  it('desagrupar é um `desagrupar` por grupo selecionado, e diz quais camadas saíram de dentro', () => {
    const r = loteDeDesagrupar(doc, { tipo: 'camadas', ids: [id('Grupo')] });
    expect(r?.lote).toEqual({ descricao: textos.historico.desagrupar('Grupo'), operacoes: [{ op: 'desagrupar', alvo: id('Grupo') }] });
    expect(r?.soltas).toEqual([id('A'), id('B')]);
    expect(aplica(r?.lote ?? null)).toBe(true);
  });

  it('sem grupo na seleção não há o que desagrupar', () => {
    expect(loteDeDesagrupar(doc, { tipo: 'camadas', ids: [id('A')] })).toBeNull();
  });
});

describe('redimensionar e girar pela alça', () => {
  const a = { id: 'a', nome: 'A' };
  const b = { id: 'b', nome: 'B' };
  const q = { x: 100, y: 100, w: 200, h: 100, rotacao: 0 };

  it('redimensionar vira `alterar` de posição e tamanho, sem rotação', () => {
    expect(loteDeTransformar([{ no: a, antes: q, depois: { ...q, x: 90, w: 250, h: 120 } }], 'redimensionar')).toEqual({
      descricao: textos.historico.redimensionar('A'),
      operacoes: [{ op: 'alterar', alvo: 'a', props: { x: 90, y: 100, largura: 250, altura: 120 } }],
    });
  });

  it('girar uma camada manda só a rotação; girar várias manda também a posição de quem andou', () => {
    expect(loteDeTransformar([{ no: a, antes: q, depois: { ...q, rotacao: 45 } }], 'girar')).toEqual({
      descricao: textos.historico.girar('A'),
      operacoes: [{ op: 'alterar', alvo: 'a', props: { rotacao: 45 } }],
    });
    const varias = loteDeTransformar(
      [
        { no: a, antes: q, depois: { ...q, x: 300, y: 50, rotacao: 90 } },
        { no: b, antes: q, depois: { ...q, rotacao: 90 } },
      ],
      'girar',
    );
    expect(varias?.descricao).toBe(textos.historico.girar('A, B'));
    expect(varias?.operacoes).toEqual([
      { op: 'alterar', alvo: 'a', props: { x: 300, y: 50, largura: 200, altura: 100, rotacao: 90 } },
      { op: 'alterar', alvo: 'b', props: { rotacao: 90 } },
    ]);
  });

  it('camada que não mudou fica de fora; se nenhuma mudou, não há lote', () => {
    expect(loteDeTransformar([{ no: a, antes: q, depois: q }], 'redimensionar')).toBeNull();
    const r = loteDeTransformar(
      [
        { no: a, antes: q, depois: q },
        { no: b, antes: q, depois: { ...q, w: 300 } },
      ],
      'redimensionar',
    );
    expect(r?.operacoes).toHaveLength(1);
    expect(r?.descricao).toBe(textos.historico.redimensionar('B'));
  });
});

describe('inserir imagem e vetor', () => {
  const feed = doc.pranchetas[0];
  if (!feed) throw new Error('falta a prancheta');
  const arquivo = { sha256: 'a'.repeat(64), largura: 4000, altura: 2000 };

  it('a imagem entra por `criarNo`, reduzida para caber e centrada no ponto pedido', () => {
    const lote = loteDeInserirImagem(doc, feed.id, arquivo, 'foto.jpg', { x: 540, y: 600 });
    const no = (lote.operacoes[0] as { no: Record<string, unknown> }).no;
    expect(lote.operacoes[0]).toMatchObject({ op: 'criarNo', prancheta: feed.id });
    expect(no).toMatchObject({ tipo: 'imagem', arquivo: arquivo.sha256, larguraOriginal: 4000, alturaOriginal: 2000, largura: 648, altura: 324, x: 216, y: 438, nome: 'foto' });
    expect(aplica(lote)).toBe(true);
  });

  it('imagem trazida do banco entra com a origem (banco, autor, licença) no nó, e a operação é aceita pelo catálogo', () => {
    const origem = { banco: 'Banco de Teste', autor: 'Fulana', licenca: 'Licença livre', url: '' as const };
    const lote = loteDeInserirImagem(doc, feed.id, { ...arquivo, origem }, 'padaria');
    const no = (lote.operacoes[0] as { no: Record<string, unknown> }).no;
    expect(no).toMatchObject({ tipo: 'imagem', arquivo: arquivo.sha256, nome: 'padaria', origem });
    expect(aplica(lote)).toBe(true);
    // foto do designer não ganha origem
    expect((loteDeInserirImagem(doc, feed.id, arquivo, 'foto.jpg').operacoes[0] as { no: Record<string, unknown> }).no).not.toHaveProperty('origem');
  });

  it('a textura cobre a prancheta inteira, por cima de tudo, com o modo de mesclagem e a opacidade de costume', () => {
    const textura = {
      sha256: 'd'.repeat(64),
      largura: 1600,
      altura: 1600,
      no: { tipo: 'imagem' as const, arquivo: 'd'.repeat(64), larguraOriginal: 1600, alturaOriginal: 1600, modoDeMesclagem: 'multiplicacao', opacidade: 0.6 },
    };
    const lote = loteDeInserirTextura(doc, feed.id, textura, 'papel');
    expect(lote.operacoes).toHaveLength(1);
    const no = (lote.operacoes[0] as { no: Record<string, unknown> }).no;
    expect(lote.operacoes[0]).toMatchObject({ op: 'criarNo', prancheta: feed.id });
    expect(no).toMatchObject({
      tipo: 'imagem',
      nome: 'papel',
      arquivo: 'd'.repeat(64),
      x: 0,
      y: 0,
      largura: feed.largura,
      altura: feed.altura,
      ajuste: 'cobrir',
      modoDeMesclagem: 'multiplicacao',
      opacidade: 0.6,
    });
    expect(aplica(lote)).toBe(true);
  });

  it('imagem pequena entra no tamanho dela, sem ampliar; sem ponto, vai para o centro da prancheta', () => {
    const lote = loteDeInserirImagem(doc, feed.id, { sha256: 'b'.repeat(64), largura: 200, altura: 100 }, 'A.png');
    const no = (lote.operacoes[0] as { no: Record<string, unknown> }).no;
    // já existe uma camada "A": o nome novo não repete
    expect(no).toMatchObject({ largura: 200, altura: 100, x: 440, y: 625, nome: 'A 2' });
  });

  it('em peça sem prancheta, o mesmo lote cria a prancheta antes', () => {
    const lote = loteDeInserirImagem({ ...doc, pranchetas: [] }, undefined, arquivo, 'foto.jpg');
    expect(lote.operacoes.map((o) => o.op)).toEqual(['criarPrancheta', 'criarNo']);
  });

  it('o vetor importado entra com a largura de um quarto da prancheta e a altura pela moldura', () => {
    const vetor = {
      tipo: 'vetor' as const,
      moldura: [200, 100] as [number, number],
      caminhos: [{ d: 'M0 0C1 1 2 2 10 10Z', preenchimento: '#000000', regra: 'nao-zero' as const }],
      origem: { arquivo: 'c'.repeat(64), nome: 'logo.svg' },
    };
    const lote = loteDeInserirVetor(doc, feed.id, vetor, 'logo.svg');
    const no = (lote.operacoes[0] as { no: Record<string, unknown> }).no;
    expect(no).toMatchObject({ tipo: 'vetor', nome: 'logo', largura: 270, altura: 135 });
    expect(aplica(lote)).toBe(true);
  });

  it('trocar a imagem de uma camada muda só o arquivo e as medidas de origem', () => {
    expect(loteDeTrocarImagem({ id: 'n1', nome: 'Foto' }, arquivo)).toEqual({
      descricao: textos.historico.trocarImagem('Foto'),
      operacoes: [{ op: 'alterar', alvo: 'n1', props: { arquivo: arquivo.sha256, larguraOriginal: 4000, alturaOriginal: 2000 } }],
    });
  });

  // A origem (banco, autor, licença) é da imagem ANTIGA. Se ficasse, o relatório de exportação
  // atribuiria a foto enviada pelo designer ao autor do banco (ADR 032).
  it('trocar a imagem de uma camada que veio de banco tira a origem antiga', () => {
    const origem = { banco: 'Banco de exemplo', autor: 'alguém', licenca: 'Licença de Conteúdo', url: 'https://exemplo.test/1' };
    expect(loteDeTrocarImagem({ id: 'n1', nome: 'Foto', origem }, arquivo).operacoes).toEqual([
      { op: 'alterar', alvo: 'n1', props: { arquivo: arquivo.sha256, larguraOriginal: 4000, alturaOriginal: 2000, origem: null } },
    ]);
  });
});

describe('editar o texto no canvas', () => {
  const texto = { id: 't', nome: 'Título', conteudo: 'Cappuccino em dobro' };

  it('vira UM `alterar` do conteúdo; texto igual, ou vazio, não vira lote', () => {
    expect(loteDeEditarTexto(texto, 'Cappuccino em triplo')).toEqual({
      descricao: textos.historico.editarTexto('Título'),
      operacoes: [{ op: 'alterar', alvo: 't', props: { conteudo: 'Cappuccino em triplo' } }],
    });
    expect(loteDeEditarTexto(texto, 'Cappuccino em dobro')).toBeNull();
    // camada de texto sem texto fica invisível e sem como achar: a edição não apaga tudo
    expect(loteDeEditarTexto(texto, '   ')).toBeNull();
  });

  it('trecho com estilo próprio acompanha a edição: o lote leva os trechos nas posições novas', () => {
    // "dobro" (14 a 19) em destaque
    const comTrecho = { ...texto, trechos: [{ inicio: 14, fim: 19, cor: '#ff0000' }] };
    expect(loteDeEditarTexto(comTrecho, 'Um cappuccino em dobro')?.operacoes).toEqual([
      { op: 'alterar', alvo: 't', props: { conteudo: 'Um cappuccino em dobro', trechos: [{ inicio: 17, fim: 22, cor: '#ff0000' }] } },
    ]);
  });

  it('se nenhum trecho sobra, a propriedade sai da camada', () => {
    const comTrecho = { ...texto, trechos: [{ inicio: 14, fim: 19, cor: '#ff0000' }] };
    expect(loteDeEditarTexto(comTrecho, 'Cappuccino em')?.operacoes).toEqual([{ op: 'alterar', alvo: 't', props: { conteudo: 'Cappuccino em', trechos: null } }]);
  });
});

describe('trechos de estilo quando o texto muda', () => {
  const trecho = (inicio: number, fim: number) => ({ inicio, fim, peso: 700 as const });

  it('antes da mudança fica onde está; depois dela, anda pelo quanto o texto cresceu ou encolheu', () => {
    // "abc DEF ghi": troca "DEF" por "XYZW"
    expect(ajustarTrechos('abc DEF ghi', 'abc XYZW ghi', [trecho(0, 3), trecho(8, 11)])).toEqual([trecho(0, 3), trecho(9, 12)]);
  });

  it('o trecho que contém a mudança cresce ou encolhe com ela', () => {
    expect(ajustarTrechos('abc DEF ghi', 'abc DEXXF ghi', [trecho(4, 7)])).toEqual([trecho(4, 9)]);
    expect(ajustarTrechos('abc DEF ghi', 'abc DF ghi', [trecho(4, 7)])).toEqual([trecho(4, 6)]);
  });

  it('o trecho apagado por inteiro some', () => {
    expect(ajustarTrechos('abc DEF ghi', 'abc  ghi', [trecho(4, 7)])).toEqual([]);
  });

  it('texto igual devolve os mesmos trechos', () => {
    const trechos = [trecho(1, 2)];
    expect(ajustarTrechos('abc', 'abc', trechos)).toEqual(trechos);
  });
});
