import { describe, expect, it } from 'vitest';
import { agente, aplicar, congelar, contexto, designer, medidorDeMentira, novoDocumento } from './apoio-de-teste';
import { caixaVisual, type Documento, documentoVazio, girarCaixa, type No, type NoGrupo, type NoTexto, type NoVetor, type NoVisual, todasAsCamadas } from './esquema';
import { acharNo, aplicarLote, caixaDe, descreverErro, loteDependeDeMedida } from './operacoes';

/** Os filhos da prancheta de índice dado; falha com mensagem clara se ela não existe. */
function filhosDe(d: Documento, indice: number): No[] {
  const p = d.pranchetas[indice];
  if (!p) throw new Error(`o documento do teste não tem a prancheta ${indice}`);
  return p.filhos;
}

const texto = (nome: string, extra: object = {}) => ({
  tipo: 'texto',
  nome,
  x: 80,
  y: 80,
  largura: 900,
  altura: 200,
  conteudo: 'Promoção',
  fonte: 'Anton',
  tamanho: 120,
  cor: 'token:primaria',
  ...extra,
});
const forma = (nome: string, x: number, y: number, extra: object = {}) => ({ tipo: 'forma', forma: 'retangulo', nome, x, y, largura: 100, altura: 100, preenchimento: '#000000', ...extra });

function base(): Documento {
  return novoDocumento([
    { op: 'definirToken', nome: 'primaria', valor: '#0F3B2C' },
    { op: 'criarPrancheta', nome: 'Feed', largura: 1080, altura: 1350, fundo: '#ffffff' },
    { op: 'criarNo', prancheta: 'Feed', no: texto('Título') },
  ]);
}

describe('aplicarLote', () => {
  it('aplica em transação: um erro no meio desfaz o lote inteiro', () => {
    const doc = base();
    const r = aplicarLote(
      doc,
      [
        { op: 'mover', alvo: 'Feed/Título', x: 10, y: 10 },
        { op: 'alterar', alvo: 'Feed/Inexistente', props: { tamanho: 10 } },
      ],
      contexto(),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toMatchObject({ indice: 1, op: 'alterar', alvo: 'Feed/Inexistente' });
    expect((filhosDe(doc, 0)[0] as NoVisual).x).toBe(80);
  });

  it('devolve o campo inválido e o motivo em português, para o agente corrigir', () => {
    const r = aplicarLote(base(), [{ op: 'alterar', alvo: 'Feed/Título', props: { tamanho: -3 } }], contexto());
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro.campo).toBe('tamanho');
    expect(r.erro.mensagem).toMatch(/pequeno|maior|> ?0/i);
    expect(r.erro.mensagem).not.toMatch(/Too small|expected|Invalid/);
    expect(descreverErro(r.erro)).toContain('Nada do lote foi aplicado');
  });

  it('operação desconhecida ou malformada diz o índice, em português', () => {
    const r = aplicarLote(base(), [{ op: 'mover', alvo: 'Feed/Título', x: 'dez', y: 0 }], contexto());
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro).toMatchObject({ indice: 0, op: 'mover', campo: 'x' });
    expect(r.erro.mensagem).not.toMatch(/Invalid input/);
  });

  it('recusa nome repetido na mesma prancheta', () => {
    expect(aplicarLote(base(), [{ op: 'criarNo', prancheta: 'Feed', no: forma('Título', 0, 0) }], contexto()).ok).toBe(false);
  });

  it('camada bloqueada é intocável para o agente, e o designer pode desbloquear', () => {
    const travado = aplicar(base(), [{ op: 'alterar', alvo: 'Feed/Título', props: { bloqueado: true } }]);
    const r = aplicarLote(travado, [{ op: 'mover', alvo: 'Feed/Título', x: 0, y: 0 }], contexto({ autoria: agente }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro.mensagem).toContain('bloqueada');
    expect(aplicarLote(travado, [{ op: 'alterar', alvo: 'Feed/Título', props: { bloqueado: false } }], contexto()).ok).toBe(true);
  });

  it('duplica prancheta para outro formato mantendo camadas e tokens, com ids novos', () => {
    const doc = aplicar(base(), [{ op: 'duplicarPrancheta', prancheta: 'Feed', nome: 'Story', largura: 1080, altura: 1920 }]);
    const story = doc.pranchetas[1];
    expect(story?.filhos[0]).toMatchObject({ nome: 'Título', cor: 'token:primaria' });
    expect(story?.filhos[0]?.id).not.toBe(filhosDe(doc, 0)[0]?.id);
    expect(story?.id).not.toBe(doc.pranchetas[0]?.id);
  });

  it('aceita degradê, sombra e traço, e null remove o efeito', () => {
    const doc = aplicar(base(), [
      {
        op: 'criarNo',
        prancheta: 'Feed',
        no: forma('Película', 0, 600, {
          largura: 1080,
          altura: 750,
          preenchimento: {
            tipo: 'linear',
            angulo: 90,
            paradas: [
              { cor: 'token:primaria', posicao: 0, opacidade: 0.9 },
              { cor: 'token:primaria', posicao: 1, opacidade: 0 },
            ],
          },
          sombra: { distancia: 10, desfoque: 30 },
          traco: { cor: '#ffffff', espessura: 2 },
        }),
      },
      { op: 'alterar', alvo: 'Feed/Película', props: { sombra: null } },
    ]);
    const pel = filhosDe(doc, 0).find((n) => n.nome === 'Película') as NoVisual;
    expect(pel.sombra).toBeUndefined();
    expect(pel.tipo === 'forma' && pel.traco?.espessura).toBe(2);
  });

  it('o nome do documento não é da árvore: não existe operação para ele', () => {
    expect(Object.keys(documentoVazio())).toEqual(['versaoDoFormato', 'tokens', 'pranchetas']);
    const r = aplicarLote(base(), [{ op: 'renomearDocumento', nome: 'x' }], contexto());
    expect(r.ok).toBe(false);
  });
});

describe('ids de nó novo saem do id do lote', () => {
  const ops = [
    { op: 'criarPrancheta', nome: 'P', largura: 500, altura: 500, fundo: '#ffffff' },
    { op: 'criarNo', prancheta: 'P', no: forma('A', 0, 0) },
    { op: 'criarNo', prancheta: 'P', no: forma('B', 10, 10) },
    { op: 'agrupar', alvos: ['P/A', 'P/B'], nome: 'G' },
    { op: 'duplicarPrancheta', prancheta: 'P', nome: 'Q', largura: 1000, altura: 500 },
  ];

  it('navegador e servidor, com o mesmo lote, chegam à mesma árvore', () => {
    const noNavegador = aplicarLote(documentoVazio(), ops, { autoria: designer, idDoLote: '0199a2b4-7c11-7d3e-9f00-5a5b5c5d5e5f' });
    const noServidor = aplicarLote(documentoVazio(), structuredClone(ops), { autoria: designer, idDoLote: '0199a2b4-7c11-7d3e-9f00-5a5b5c5d5e5f' });
    expect(noNavegador.ok && noServidor.ok && noNavegador.doc).toEqual(noServidor.ok && noServidor.doc);
  });

  it('outro lote dá outros ids, e nenhum id se repete dentro do documento', () => {
    const a = aplicar(documentoVazio(), ops, { idDoLote: 'lote-um' });
    const b = aplicar(documentoVazio(), ops, { idDoLote: 'lote-dois' });
    const ids = (d: Documento): string[] => d.pranchetas.flatMap((p) => [p.id, ...todasAsCamadas(p.filhos).map((n) => n.id)]);
    expect(new Set(ids(a)).size).toBe(ids(a).length);
    expect(ids(a).length).toBe(8);
    expect(ids(a).filter((id) => ids(b).includes(id))).toEqual([]);
  });

  it('o lote seguinte pode citar o id que o nó ganhou localmente', () => {
    const doc = aplicar(documentoVazio(), ops, { idDoLote: 'lote-um' });
    const id = acharNo(doc, 'P/A').no.id;
    const outroLado = aplicar(documentoVazio(), ops, { idDoLote: 'lote-um' });
    expect(aplicarLote(outroLado, [{ op: 'mover', alvo: id, x: 5, y: 5 }], contexto()).ok).toBe(true);
  });

  it('aceita um gerador de id próprio', () => {
    const doc = aplicar(documentoVazio(), [{ op: 'criarPrancheta', nome: 'P', largura: 10, altura: 10, fundo: '#ffffff' }], { gerarId: (i, s) => `meu-${i}-${s}` });
    expect(doc.pranchetas[0]?.id).toBe('meu-0-0');
  });
});

describe('aplicarLote preserva a referência do que não tocou', () => {
  function duas(): Documento {
    return novoDocumento([
      { op: 'criarPrancheta', nome: 'Feed', largura: 1080, altura: 1350, fundo: '#ffffff' },
      { op: 'criarPrancheta', nome: 'Story', largura: 1080, altura: 1920, fundo: '#ffffff' },
      { op: 'criarNo', prancheta: 'Feed', no: forma('A', 0, 0) },
      { op: 'criarNo', prancheta: 'Feed', no: forma('B', 200, 0) },
      { op: 'criarNo', prancheta: 'Feed', no: forma('C', 400, 0) },
      { op: 'agrupar', alvos: ['Feed/B', 'Feed/C'], nome: 'Grupo' },
      { op: 'criarNo', prancheta: 'Story', no: forma('S', 0, 0) },
    ]);
  }

  it('mover uma camada não troca a outra prancheta nem as irmãs', () => {
    const antes = duas();
    const depois = aplicar(antes, [{ op: 'mover', alvo: 'Feed/A', x: 50, y: 50 }]);
    expect(depois).not.toBe(antes);
    expect(depois.pranchetas[1]).toBe(antes.pranchetas[1]);
    expect(depois.tokens).toBe(antes.tokens);
    expect(depois.pranchetas[0]).not.toBe(antes.pranchetas[0]);
    expect(filhosDe(depois, 0)[1]).toBe(filhosDe(antes, 0)[1]);
    expect(filhosDe(depois, 0)[0]).not.toBe(filhosDe(antes, 0)[0]);
  });

  it('alterar um nó dentro de grupo troca só o caminho até ele', () => {
    const antes = duas();
    const depois = aplicar(antes, [{ op: 'alterar', alvo: 'Feed/C', props: { opacidade: 0.5 } }]);
    const [gAntes, gDepois] = [antes, depois].map((d) => filhosDe(d, 0)[1] as NoGrupo);
    expect(gDepois).not.toBe(gAntes);
    expect(gDepois?.filhos[0]).toBe(gAntes?.filhos[0]);
    expect(gDepois?.filhos[1]).not.toBe(gAntes?.filhos[1]);
    expect(filhosDe(depois, 0)[0]).toBe(filhosDe(antes, 0)[0]);
    expect(depois.pranchetas[1]).toBe(antes.pranchetas[1]);
  });

  it('trocar um token mantém as pranchetas e troca só o objeto de tokens', () => {
    const antes = duas();
    const depois = aplicar(antes, [{ op: 'definirToken', nome: 'primaria', valor: '#FF0000' }]);
    expect(depois.pranchetas[0]).toBe(antes.pranchetas[0]);
    expect(depois.tokens.cores).not.toBe(antes.tokens.cores);
    expect(depois.tokens.cores.primaria).toBe('#ff0000');
  });

  it('trocar um token marca como tocadas as camadas que o usam', () => {
    const antes = aplicar(duas(), [
      { op: 'definirToken', nome: 'marca', valor: '#112233' },
      { op: 'alterar', alvo: 'Feed/A', props: { preenchimento: 'token:marca' } },
    ]);
    const r = aplicarLote(antes, [{ op: 'definirToken', nome: 'marca', valor: '#445566' }], contexto());
    expect(r.ok && r.tocados).toEqual([acharNo(antes, 'Feed/A').no.id]);
  });

  it('nunca muta o documento de entrada: com a árvore congelada, todas as operações funcionam', () => {
    const antes = congelar(
      aplicar(duas(), [
        { op: 'criarNo', prancheta: 'Feed', no: texto('Título', { cor: '#000000' }) },
        {
          op: 'criarNo',
          prancheta: 'Feed',
          no: { tipo: 'vetor', nome: 'Logo', x: 0, y: 500, largura: 100, altura: 100, moldura: [10, 10], caminhos: [{ d: 'M0 0C0 0 10 0 10 10Z', preenchimento: '#0037a6' }] },
        },
      ]),
    );
    const copia = structuredClone(antes);
    const r = aplicarLote(
      antes,
      [
        { op: 'mover', alvo: 'Feed/Grupo', x: 300, y: 300 },
        { op: 'alterar', alvo: 'Feed/A', props: { nome: 'A2', raio: 8 } },
        { op: 'reordenar', alvo: 'Feed/A2', posicao: 'frente' },
        { op: 'recolorir', alvo: 'Feed/Logo', cores: { '*': '#ffffff' } },
        { op: 'alinhar', alvos: ['Feed/Título', 'Feed/A2'], borda: 'esquerda' },
        { op: 'distribuir', alvos: ['Feed/Título', 'Feed/A2'], espaco: 20 },
        { op: 'definirEstiloDeTexto', nome: 'titulo', estilo: { fonte: 'Anton', tamanho: 90 } },
        { op: 'aplicarEstiloDeTexto', alvos: ['Feed/Título'], estilo: 'titulo' },
        { op: 'definirEstiloDeTexto', nome: 'titulo', estilo: { fonte: 'Anton', tamanho: 100 } },
        { op: 'desagrupar', alvo: 'Feed/Grupo' },
        { op: 'agrupar', alvos: ['Feed/B', 'Feed/C'], nome: 'De novo' },
        { op: 'criarNo', prancheta: 'Feed', grupo: 'Feed/De novo', no: forma('D', 0, 0) },
        { op: 'remover', alvo: 'Feed/D' },
        { op: 'alterarPrancheta', prancheta: 'Story', props: { fundo: '#eeeeee' } },
        { op: 'duplicarPrancheta', prancheta: 'Feed', nome: 'Quadrado', largura: 1080, altura: 1080 },
        { op: 'definirToken', nome: 'x', valor: '#123456' },
        { op: 'removerPrancheta', prancheta: 'Story' },
      ],
      contexto({ medidor: medidorDeMentira }),
    );
    if (!r.ok) throw new Error(descreverErro(r.erro));
    expect(antes).toEqual(copia);
    expect(r.doc.pranchetas.map((p) => p.nome)).toEqual(['Feed', 'Quadrado']);
  });

  it('redefinir um estilo de texto só troca as camadas ligadas a ele', () => {
    const antes = aplicar(duas(), [
      { op: 'criarNo', prancheta: 'Story', no: texto('Título', { cor: '#000000' }) },
      { op: 'definirEstiloDeTexto', nome: 'titulo', estilo: { fonte: 'Anton', tamanho: 90 } },
      { op: 'aplicarEstiloDeTexto', alvos: ['Story/Título'], estilo: 'titulo' },
    ]);
    const depois = aplicar(antes, [{ op: 'definirEstiloDeTexto', nome: 'titulo', estilo: { fonte: 'Anton', tamanho: 140 } }]);
    expect(depois.pranchetas[0]).toBe(antes.pranchetas[0]);
    expect(filhosDe(depois, 1)[0]).toBe(filhosDe(antes, 1)[0]);
    expect((filhosDe(depois, 1)[1] as NoTexto).tamanho).toBe(140);
  });
});

describe('grupos', () => {
  const doc = (): Documento =>
    novoDocumento([
      { op: 'criarPrancheta', nome: 'P', largura: 1000, altura: 1000, fundo: '#ffffff' },
      { op: 'criarNo', prancheta: 'P', no: forma('A', 100, 100) },
      { op: 'criarNo', prancheta: 'P', no: forma('B', 300, 300) },
      { op: 'criarNo', prancheta: 'P', no: forma('C', 500, 500) },
    ]);

  it('agrupa irmãs na posição da mais alta, mantendo a ordem', () => {
    const filhos = aplicar(doc(), [{ op: 'agrupar', alvos: ['P/A', 'P/B'], nome: 'Bloco', modoDeMesclagem: 'multiplicacao' }]).pranchetas[0]?.filhos ?? [];
    expect(filhos.map((n) => n.nome)).toEqual(['Bloco', 'C']);
    const g = filhos[0] as NoGrupo;
    expect(g.filhos.map((n) => n.nome)).toEqual(['A', 'B']);
    expect(g.modoDeMesclagem).toBe('multiplicacao');
  });

  it('cria dentro de grupo e acha pelo caminho de nome', () => {
    const d = aplicar(doc(), [
      { op: 'agrupar', alvos: ['P/A'], nome: 'Bloco' },
      {
        op: 'criarNo',
        prancheta: 'P',
        grupo: 'P/Bloco',
        no: {
          tipo: 'ajuste',
          nome: 'Curvas',
          ajuste: {
            tipo: 'curvas',
            rgb: [
              [0, 0],
              [128, 150],
              [255, 255],
            ],
          },
        },
      },
    ]);
    const achado = acharNo(d, 'P/Curvas');
    expect(achado.pai?.nome).toBe('Bloco');
    expect(achado.no.tipo).toBe('ajuste');
  });

  it('mover o grupo move tudo dentro, com a máscara de forma junto', () => {
    const d = aplicar(doc(), [
      { op: 'agrupar', alvos: ['P/A', 'P/B'], nome: 'Bloco' },
      { op: 'alterar', alvo: 'P/Bloco', props: { mascara: { tipo: 'forma', forma: 'elipse', x: 100, y: 100, largura: 300, altura: 300 } } },
      { op: 'mover', alvo: 'P/Bloco', x: 150, y: 100 },
    ]);
    const g = filhosDe(d, 0)[0] as NoGrupo;
    expect((g.filhos[0] as NoVisual).x).toBe(150);
    expect((g.filhos[1] as NoVisual).x).toBe(350);
    expect(g.mascara).toMatchObject({ tipo: 'forma', x: 150 });
  });

  it('desagrupa no mesmo lugar', () => {
    const d = aplicar(doc(), [
      { op: 'agrupar', alvos: ['P/A', 'P/B'], nome: 'Bloco' },
      { op: 'desagrupar', alvo: 'P/Bloco' },
    ]);
    expect(filhosDe(d, 0).map((n) => n.nome)).toEqual(['A', 'B', 'C']);
  });

  it('grupo com camada bloqueada dentro é intocável para o agente', () => {
    const d = aplicar(doc(), [
      { op: 'alterar', alvo: 'P/A', props: { bloqueado: true } },
      { op: 'agrupar', alvos: ['P/B', 'P/C'], nome: 'Livre' },
    ]);
    expect(aplicarLote(d, [{ op: 'agrupar', alvos: ['P/A', 'P/Livre'], nome: 'X' }], contexto({ autoria: agente })).ok).toBe(false);
  });

  it('nome é único em toda a prancheta, inclusive dentro de grupo', () => {
    expect(
      aplicarLote(
        doc(),
        [
          { op: 'agrupar', alvos: ['P/A'], nome: 'Bloco' },
          { op: 'criarNo', prancheta: 'P', no: forma('A', 0, 0) },
        ],
        contexto(),
      ).ok,
    ).toBe(false);
  });

  it('aceita a máscara antiga da foto, sem tipo, como degradê', () => {
    const d = aplicar(doc(), [{ op: 'alterar', alvo: 'P/A', props: { mascara: { angulo: 90, inicio: 0, fim: 0.5 } } }]);
    expect(todasAsCamadas(filhosDe(d, 0))[0]?.mascara).toMatchObject({ tipo: 'degrade' });
  });

  it('reordenar leva para a frente, para trás ou para um índice', () => {
    const nomes = (d: Documento): string[] => filhosDe(d, 0).map((n) => n.nome) ?? [];
    expect(nomes(aplicar(doc(), [{ op: 'reordenar', alvo: 'P/A', posicao: 'frente' }]))).toEqual(['B', 'C', 'A']);
    expect(nomes(aplicar(doc(), [{ op: 'reordenar', alvo: 'P/C', posicao: 'tras' }]))).toEqual(['C', 'A', 'B']);
    expect(nomes(aplicar(doc(), [{ op: 'reordenar', alvo: 'P/C', posicao: 1 }]))).toEqual(['A', 'C', 'B']);
  });
});

describe('rotação', () => {
  it('a caixa de uma camada girada 90° troca largura e altura em torno do centro', () => {
    const c = girarCaixa({ x: 0, y: 0, w: 200, h: 100 }, 100, 50, 90);
    expect(c.w).toBeCloseTo(100, 5);
    expect(c.h).toBeCloseTo(200, 5);
    expect(c.x).toBeCloseTo(50, 5);
  });

  it('mover uma camada girada leva a caixa girada ao ponto pedido', () => {
    const d = novoDocumento([
      { op: 'criarPrancheta', nome: 'P', largura: 1000, altura: 1000, fundo: '#ffffff' },
      { op: 'criarNo', prancheta: 'P', no: forma('Selo', 100, 100, { largura: 200, rotacao: 45 }) },
      { op: 'mover', alvo: 'P/Selo', x: 50, y: 60 },
    ]);
    const no = filhosDe(d, 0)[0] as NoVisual;
    const c = caixaDe(no);
    expect(c?.x).toBeCloseTo(50, 1);
    expect(c?.y).toBeCloseTo(60, 1);
    expect(caixaVisual(no).w).toBeGreaterThan(200);
  });
});

describe('estilos de texto', () => {
  it('redefinir o estilo muda todas as camadas ligadas, em todas as pranchetas', () => {
    const t = (nome: string) => texto(nome, { conteudo: 'Título', tamanho: 100, cor: '#000000', x: 0, y: 0 });
    const d = novoDocumento([
      { op: 'criarPrancheta', nome: 'Feed', largura: 1080, altura: 1350, fundo: '#ffffff' },
      { op: 'criarPrancheta', nome: 'Story', largura: 1080, altura: 1920, fundo: '#ffffff' },
      { op: 'criarNo', prancheta: 'Feed', no: t('Título do feed') },
      { op: 'criarNo', prancheta: 'Story', no: t('Título do story') },
      { op: 'definirEstiloDeTexto', nome: 'titulo', estilo: { fonte: 'Playfair Display', peso: 700, tamanho: 120, entrelinha: 0.95 } },
      { op: 'aplicarEstiloDeTexto', alvos: ['Feed/Título do feed', 'Story/Título do story'], estilo: 'titulo' },
      { op: 'definirEstiloDeTexto', nome: 'titulo', estilo: { fonte: 'Playfair Display', peso: 700, tamanho: 140 } },
    ]);
    const [a, b] = d.pranchetas.map((p) => p.filhos[0] as NoTexto);
    expect(a?.tamanho).toBe(140);
    expect(b).toMatchObject({ tamanho: 140, fonte: 'Playfair Display', estiloDeTexto: 'titulo' });
  });

  it('aplicar estilo inexistente devolve erro legível', () => {
    const r = aplicarLote(base(), [{ op: 'aplicarEstiloDeTexto', alvos: ['Feed/Título'], estilo: 'nada' }], contexto());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro.mensagem).toContain('definirEstiloDeTexto');
  });
});

describe('recolorir vetor', () => {
  const LOGO = {
    tipo: 'vetor',
    nome: 'Logo',
    x: 100,
    y: 100,
    largura: 200,
    altura: 100,
    moldura: [200, 100],
    caminhos: [
      { d: 'M0 0C0 0 100 0 100 0C100 0 100 100 100 100C100 100 0 100 0 100Z', preenchimento: '#0037a6', regra: 'nao-zero' },
      { d: 'M110 0C110 0 200 0 200 0C200 0 200 100 200 100Z', preenchimento: '#ff0000', regra: 'nao-zero' },
    ],
    origem: { arquivo: 'abc', nome: 'logo.svg' },
  };
  const comLogo = (): Documento =>
    novoDocumento([
      { op: 'definirToken', nome: 'texto', valor: '#ffffff' },
      { op: 'criarPrancheta', nome: 'Feed', largura: 400, altura: 300, fundo: '#0037a6' },
      { op: 'criarNo', prancheta: 'Feed', no: LOGO },
    ]);
  const logo = (d: Documento): NoVetor => filhosDe(d, 0)[0] as NoVetor;

  it('troca uma cor pelo valor atual sem tocar no desenho', () => {
    const d = comLogo();
    const r = aplicar(d, [{ op: 'recolorir', alvo: 'Feed/Logo', cores: { '#0037A6': 'token:texto' } }], { autoria: agente });
    expect(logo(r).caminhos.map((c) => c.preenchimento)).toEqual(['token:texto', '#ff0000']);
    expect(logo(r).caminhos.map((c) => c.d)).toEqual(logo(d).caminhos.map((c) => c.d));
  });

  it('"*" deixa o vetor monocromático, inclusive o traço', () => {
    const d = aplicar(comLogo(), [
      { op: 'criarNo', prancheta: 'Feed', no: { ...LOGO, nome: 'Ícone', caminhos: [{ d: 'M0 0C0 0 50 50 50 50', traco: { cor: '#0037a6', espessura: 4 } }] } },
      { op: 'recolorir', alvo: 'Feed/Logo', cores: { '*': 'token:texto' } },
      { op: 'recolorir', alvo: 'Feed/Ícone', cores: { '*': 'token:texto' } },
    ]);
    const [l, i] = filhosDe(d, 0) as NoVetor[];
    expect(l?.caminhos.every((c) => c.preenchimento === 'token:texto')).toBe(true);
    expect(i?.caminhos[0]?.traco?.cor).toBe('token:texto');
  });

  it('acusa cor que não existe no vetor, dizendo quais existem', () => {
    const r = aplicarLote(comLogo(), [{ op: 'recolorir', alvo: 'Feed/Logo', cores: { '#123456': '#ffffff' } }], contexto());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro.mensagem).toContain('#0037a6');
  });

  it('alterar não redesenha o vetor importado (logo do cliente), mas troca a cor quando o desenho fica igual', () => {
    const d = comLogo();
    const r = aplicarLote(d, [{ op: 'alterar', alvo: 'Feed/Logo', props: { caminhos: [{ d: 'M0 0C1 1 2 2 3 3Z', preenchimento: '#ffffff' }] } }], contexto({ autoria: agente }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro.mensagem).toContain('recolorir');
    const caminhos = logo(d).caminhos.map((c) => ({ ...c, preenchimento: '#ffffff' }));
    expect(aplicarLote(d, [{ op: 'alterar', alvo: 'Feed/Logo', props: { caminhos } }], contexto()).ok).toBe(true);
  });

  it('recusa caminho sem preenchimento e sem traço', () => {
    expect(aplicarLote(comLogo(), [{ op: 'criarNo', prancheta: 'Feed', no: { ...LOGO, nome: 'Nada', caminhos: [{ d: 'M0 0C0 0 1 1 1 1' }] } }], contexto()).ok).toBe(false);
  });
});

describe('alinhar e distribuir pela tinta', () => {
  const doc = (): Documento =>
    novoDocumento([
      { op: 'criarPrancheta', nome: 'P', largura: 1080, altura: 1350, fundo: '#ffffff' },
      { op: 'criarNo', prancheta: 'P', no: texto('Sobretítulo', { x: 80, y: 100, altura: 40, conteudo: 'SOBRE', tamanho: 26, cor: '#000000' }) },
      { op: 'criarNo', prancheta: 'P', no: texto('Título', { x: 90, y: 300, conteudo: 'Jazz', tamanho: 180, cor: '#000000' }) },
      { op: 'criarNo', prancheta: 'P', no: forma('Botão', 120, 700, { largura: 300, altura: 80 }) },
    ]);
  const no = (d: Documento, nome: string): NoVisual => filhosDe(d, 0).find((n) => n.nome === nome) as NoVisual;
  const tinta = (d: Documento, nome: string) => medidorDeMentira.tinta(no(d, nome));

  it('distribuir põe espaço exato entre as tintas, na ordem dada, sem mover o primeiro', () => {
    const d = aplicar(doc(), [{ op: 'distribuir', alvos: ['P/Sobretítulo', 'P/Título', 'P/Botão'], eixo: 'vertical', espaco: 24 }], { medidor: medidorDeMentira });
    const [a, b, c] = ['Sobretítulo', 'Título', 'Botão'].map((n) => tinta(d, n));
    expect(no(d, 'Sobretítulo').y).toBe(100);
    expect(Math.round((b?.y ?? 0) - ((a?.y ?? 0) + (a?.h ?? 0)))).toBe(24);
    expect(Math.round((c?.y ?? 0) - ((b?.y ?? 0) + (b?.h ?? 0)))).toBe(24);
  });

  it('alinhar leva a borda esquerda da tinta à do primeiro alvo', () => {
    const d = aplicar(doc(), [{ op: 'alinhar', alvos: ['P/Sobretítulo', 'P/Título', 'P/Botão'], borda: 'esquerda' }], { medidor: medidorDeMentira });
    expect(new Set(['Sobretítulo', 'Título', 'Botão'].map((n) => Math.round(tinta(d, n).x))).size).toBe(1);
  });

  it('centraliza na prancheta e alinha a um valor dado', () => {
    expect(no(aplicar(doc(), [{ op: 'alinhar', alvos: ['P/Botão'], borda: 'centro-horizontal', referencia: 'prancheta' }], { medidor: medidorDeMentira }), 'Botão').x).toBe(390);
    expect(Math.round(tinta(aplicar(doc(), [{ op: 'alinhar', alvos: ['P/Título'], borda: 'topo', valor: 400 }], { medidor: medidorDeMentira }), 'Título').y)).toBe(400);
  });

  it('sem medidor, mede pela caixa (não falha)', () => {
    expect(no(aplicar(doc(), [{ op: 'alinhar', alvos: ['P/Título'], borda: 'topo', valor: 400 }]), 'Título').y).toBe(400);
  });

  it('o catálogo diz quais operações dependem de medida de texto', () => {
    expect(loteDependeDeMedida([{ op: 'mover', alvo: 'a', x: 0, y: 0 }])).toBe(false);
    expect(
      loteDependeDeMedida([
        { op: 'mover', alvo: 'a', x: 0, y: 0 },
        { op: 'distribuir', alvos: ['a', 'b'], espaco: 8 },
      ]),
    ).toBe(true);
    expect(loteDependeDeMedida([{ op: 'alinhar', alvos: ['a'], borda: 'topo' }])).toBe(true);
  });
});
