// Todo gesto vira lote do catálogo (ADR 027). Aqui: os montadores de lote das ações do editor.
// Nenhum deles aplica nada: devolvem descrição e operações, e quem aplica é a sessão.
import { aplicarLote, type Documento, documentoVazio } from '@otto/documento';
import { describe, expect, it } from 'vitest';
import { editor as textos } from '../../textos/editor';
import {
  acharNoPorId,
  loteDeAlterar,
  loteDeBloqueio,
  loteDeDuplicar,
  loteDeInserirImagem,
  loteDeInserirVetor,
  loteDeMoverPorSeta,
  loteDeRedimensionar,
  loteDeRemover,
  loteDeRenomear,
  loteDeReordenar,
  loteDeReordenarPara,
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

describe('reordenar soltando sobre outra camada (arraste no painel)', () => {
  // dentro do grupo: A embaixo (0), B em cima (1). Na prancheta: Grupo (0)... e Travada por cima.
  it('soltar na metade de cima da irmã põe a camada logo acima dela; na de baixo, logo abaixo', () => {
    expect(loteDeReordenarPara(doc, id('A'), id('B'), 'acima')?.operacoes).toEqual([{ op: 'reordenar', alvo: id('A'), posicao: 1 }]);
    expect(loteDeReordenarPara(doc, id('B'), id('A'), 'abaixo')?.operacoes).toEqual([{ op: 'reordenar', alvo: id('B'), posicao: 0 }]);
    const lote = loteDeReordenarPara(doc, id('B'), id('A'), 'abaixo');
    const r = lote && aplicarLote(doc, lote.operacoes, { autoria: { tipo: 'designer' }, idDoLote: 'x' });
    const grupo = r?.ok ? acharNoPorId(r.doc, id('Grupo'))?.no : undefined;
    expect(grupo?.tipo === 'grupo' && grupo.filhos.map((n) => n.nome)).toEqual(['B', 'A']);
  });

  it('soltar onde a camada já está não vira lote', () => {
    expect(loteDeReordenarPara(doc, id('A'), id('B'), 'abaixo')).toBeNull();
    expect(loteDeReordenarPara(doc, id('A'), id('A'), 'acima')).toBeNull();
  });

  it('só entre irmãs: soltar sobre camada de outro grupo não vira lote (o catálogo não muda camada de pai)', () => {
    expect(loteDeReordenarPara(doc, id('A'), id('Travada'), 'acima')).toBeNull();
  });
});

describe('duplicar', () => {
  it('cria a cópia logo acima da original, com nome novo, e diz quais nomes criou', () => {
    const r = loteDeDuplicar(doc, { tipo: 'camadas', ids: [id('A')] });
    expect(r?.nomes).toEqual([textos.camadas.copia('A', 1)]);
    const aplicado = r && aplicarLote(doc, r.lote.operacoes, { autoria: { tipo: 'designer' }, idDoLote: 'dup' });
    if (!aplicado?.ok) throw new Error('duplicar devia aplicar');
    const grupo = acharNoPorId(aplicado.doc, id('Grupo'))?.no;
    expect(grupo?.tipo === 'grupo' && grupo.filhos.map((n) => n.nome)).toEqual(['A', textos.camadas.copia('A', 1), 'B']);
    const copia = grupo?.tipo === 'grupo' ? grupo.filhos[1] : undefined;
    expect(copia).toMatchObject({ tipo: 'forma', x: 100, y: 100, largura: 200 });
    expect(copia?.id).not.toBe(id('A'));
  });

  it('duplicar de novo não repete o nome', () => {
    const primeira = loteDeDuplicar(doc, { tipo: 'camadas', ids: [id('A')] });
    const d1 = primeira && aplicarLote(doc, primeira.lote.operacoes, { autoria: { tipo: 'designer' }, idDoLote: 'd1' });
    if (!d1?.ok) throw new Error('devia aplicar');
    expect(loteDeDuplicar(d1.doc, { tipo: 'camadas', ids: [id('A')] })?.nomes).toEqual([textos.camadas.copia('A', 2)]);
  });

  it('grupo é duplicado com as filhas', () => {
    const r = loteDeDuplicar(doc, { tipo: 'camadas', ids: [id('Grupo')] });
    const aplicado = r && aplicarLote(doc, r.lote.operacoes, { autoria: { tipo: 'designer' }, idDoLote: 'dg' });
    if (!aplicado?.ok) throw new Error(aplicado ? aplicado.erro.mensagem : 'sem lote');
    const copia = aplicado.doc.pranchetas[0]?.filhos.find((n) => n.nome === textos.camadas.copia('Grupo', 1));
    expect(copia?.tipo === 'grupo' && copia.filhos).toHaveLength(2);
  });

  it('sem camada selecionada não há o que duplicar', () => {
    expect(loteDeDuplicar(doc, null)).toBeNull();
  });
});

describe('redimensionar', () => {
  it('vira `alterar` de posição e tamanho', () => {
    const a = acharNoPorId(doc, id('A'))?.no;
    if (!a) throw new Error('falta A');
    expect(loteDeRedimensionar(a, { x: 90, y: 100, w: 250, h: 120 })).toEqual({
      descricao: textos.historico.redimensionar('A'),
      operacoes: [{ op: 'alterar', alvo: a.id, props: { x: 90, y: 100, largura: 250, altura: 120 } }],
    });
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
