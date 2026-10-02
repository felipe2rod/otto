// Os roteiros que o pacote do agente entrega ao worker e ao editor (packages/agente/roteiros) precisam
// continuar rodando do começo ao fim contra o ciclo, o catálogo e o motor de verdade, em peça vazia e em
// peça que já tem trabalho do designer. Se o catálogo ou o ciclo mudar e um roteiro parar de fechar, é aqui
// que aparece, antes de quebrar o desenvolvimento dos outros.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { criarModeloRoteirizado, EntradaDaTarefa, idsDoRoteiro, type Roteiro, rodarTarefa } from '../../packages/agente/src/index';
import { aplicarLote, type Documento, documentoVazio } from '../../packages/documento/src/index';
import { type AmbienteEmMemoria, criarAmbienteEmMemoria, RAIZ } from './ambiente';
import { documentoDoCaso, lerCaso } from './casos';

const PASTA = path.join(RAIZ, 'packages/agente/roteiros');
const ler = (nome: string): Roteiro => JSON.parse(readFileSync(path.join(PASTA, `${nome}.json`), 'utf8')) as Roteiro;
const abertos: AmbienteEmMemoria[] = [];
afterAll(() => {
  for (const a of abertos) a.fechar();
});

/** A peça do designer usada nos casos: Feed e Story, com tokens, textos e um logo bloqueado. */
const pecaExistente = () => documentoDoCaso(lerCaso('ajuste-titulo-em-destaque'));

async function rodar(nome: string, documento?: Documento) {
  const roteiro = ler(nome);
  const modelo = criarModeloRoteirizado(roteiro, { preco: { entrada: 2, saida: 10, cacheLido: 0.2, cacheCriado: 2.5 } });
  // a árvore é reconstruída a cada leitura, como na porta do worker
  const amb = await criarAmbienteEmMemoria({ modelo, novoId: idsDoRoteiro(roteiro), comBancoDeImagens: false, ...(documento ? { documento } : {}) });
  abertos.push(amb);
  const ler0 = amb.documento;
  amb.documento = () => structuredClone(ler0());
  const inicial = amb.documento();
  let pediu = 0;
  const { preparo, resultado } = await rodarTarefa(amb, EntradaDaTarefa.parse(roteiro.entrada), {
    confirmar: () => {
      pediu++;
      return 'pode';
    },
  });
  const final = amb.documento();
  const intacto = JSON.stringify(final.pranchetas.slice(0, inicial.pranchetas.length)) === JSON.stringify(inicial.pranchetas);
  return { roteiro, modelo, amb, preparo, resultado, pediu, inicial, final, intacto };
}

describe('roteiros entregues com o pacote do agente', () => {
  it('são cinco; todo roteiro tem nome, descrição, entrada válida e passos com duração e contagem de tokens', () => {
    const arquivos = readdirSync(PASTA).filter((n) => n.endsWith('.json'));
    expect(arquivos.sort()).toEqual(['ajuste-em-qualquer-peca.json', 'ajuste-titulo.json', 'briefing-dois-formatos.json', 'criar-uma-peca.json', 'pedido-dois-formatos.json']);
    for (const arquivo of arquivos) {
      const r = ler(arquivo.replace('.json', ''));
      expect(r.nome, arquivo).toBe(arquivo.replace('.json', ''));
      expect(r.descricao?.length ?? 0, arquivo).toBeGreaterThan(40);
      expect(EntradaDaTarefa.safeParse(r.entrada).success, arquivo).toBe(true);
      expect(
        r.passos.every((p) => (p.duracaoMs ?? 0) > 0),
        `${arquivo}: duração em todo passo, para simular a espera`,
      ).toBe(true);
      expect(
        r.passos.every((p) => (p.uso?.saida ?? 0) > 0 && (p.uso?.cacheLido ?? 0) + (p.uso?.cacheCriado ?? 0) > 0),
        `${arquivo}: tokens em todo passo, para exercitar custo e teto`,
      ).toBe(true);
    }
  });

  it('o tipo da entrada de cada roteiro é o que o nome diz', () => {
    expect(
      Object.fromEntries(['ajuste-em-qualquer-peca', 'ajuste-titulo', 'briefing-dois-formatos', 'criar-uma-peca', 'pedido-dois-formatos'].map((n) => [n, (ler(n).entrada as { tipo: string }).tipo])),
    ).toEqual({
      'ajuste-em-qualquer-peca': 'ajuste',
      'ajuste-titulo': 'ajuste',
      'briefing-dois-formatos': 'briefing',
      'criar-uma-peca': 'criar',
      'pedido-dois-formatos': 'pedido',
    });
  });

  for (const [onde, documento] of [
    ['peça vazia', undefined],
    ['peça que já tem Feed e Story', pecaExistente],
  ] as const) {
    describe(`em ${onde}`, () => {
      it('briefing de dois formatos: pede o "pode", passa por todas as etapas e entrega conferido, sem erro de verificação', async () => {
        const { preparo, resultado, modelo, amb, pediu, inicial, final, intacto } = await rodar('briefing-dois-formatos', documento?.());
        expect(pediu).toBe(1);
        expect(preparo?.motivos).toEqual(['varias_pranchetas']);
        expect(preparo?.cartao?.conceito).toContain('7h');
        expect(resultado).toMatchObject({ fim: 'entregue', conferida: true, lotes: 5 });
        expect(modelo.restantes()).toBe(0);
        expect(resultado.entrega.pendencias.filter((p) => p.origem === 'otto')).toHaveLength(1);
        expect(amb.verificarAgora().filter((a) => a.gravidade === 'erro' && final.pranchetas.slice(inicial.pranchetas.length).some((p) => p.nome === a.prancheta))).toEqual([]);
        expect(amb.registro.some((r) => r.evento.tipo === 'lote-recusado')).toBe(false);
        expect(intacto).toBe(true);
        const novas = final.pranchetas.slice(inicial.pranchetas.length).map((p) => `${p.nome} ${p.largura}×${p.altura}`);
        expect(novas).toEqual(inicial.pranchetas.length ? ['Feed 2 1080×1350', 'Story 2 1080×1920'] : ['Feed 1080×1350', 'Story 1080×1920']);
        // em peça existente a prancheta nasce com outro nome ("Feed 2") e a etapa de produção é avisada de novo: seguidas iguais contam uma vez
        const etapas = amb.registro.flatMap((r) => (r.evento.tipo === 'etapa' ? [`${r.evento.etapa}${r.evento.rodada ? ` ${r.evento.rodada}` : ''}`] : [])).filter((e, i, todas) => e !== todas[i - 1]);
        expect(etapas).toEqual(['leitura', 'direcao', 'producao', 'conferencia', 'producao', 'conferencia', 'producao', 'conferencia', 'revisao', 'ajustes', 'conferencia 2', 'entrega']);
        // a verificação acusou e o Otto corrigiu: o painel tem o que mostrar no registro fechado
        expect(amb.registro.flatMap((r) => (r.evento.tipo === 'verificacao' ? [r.evento.novos] : []))[0]).toBeGreaterThan(0);
      }, 60_000);

      it('briefing de dois formatos: o custo tem a ordem de grandeza de uma tarefa de verdade', async () => {
        const { resultado } = await rodar('briefing-dois-formatos', documento?.());
        const c = resultado.custo;
        expect(c.tokens.cacheLido).toBeGreaterThan(400_000);
        expect(c.tokens.saida).toBeGreaterThan(20_000);
        expect(c.dolares ?? 0).toBeGreaterThan(0.4);
        expect(c.dolares ?? 0).toBeLessThan(1.5);
      }, 60_000);

      it('criar uma peça por pedido livre: uma prancheta, sem "pode", entrega conferida com a pendência dos textos que o Otto escreveu', async () => {
        const { preparo, resultado, modelo, amb, pediu, inicial, final, intacto } = await rodar('criar-uma-peca', documento?.());
        expect(pediu).toBe(0);
        expect(preparo?.pedeConfirmacao).toBe(false);
        expect(preparo?.direcao?.arquetipo).toBe('C');
        expect(resultado).toMatchObject({ fim: 'entregue', conferida: true, lotes: 3 });
        expect(modelo.restantes()).toBe(0);
        expect(final.pranchetas).toHaveLength(inicial.pranchetas.length + 1);
        expect(intacto).toBe(true);
        expect(amb.registro.some((r) => r.evento.tipo === 'lote-recusado')).toBe(false);
        expect(resultado.entrega.pendencias.map((p) => p.tipo)).toContain('texto_escrito_pelo_otto');
        expect(resultado.entrega.pendencias.find((p) => p.tipo === 'texto_escrito_pelo_otto')?.camadas).toHaveLength(3);
        expect(resultado.entrega.pendencias.filter((p) => p.gravidade === 'erro')).toEqual([]);
      }, 60_000);

      it('pedido que cria dois formatos: o plano vem do planejador, pede o "pode" e não toca no que existia', async () => {
        const { preparo, resultado, modelo, amb, pediu, inicial, final, intacto } = await rodar('pedido-dois-formatos', documento?.());
        expect(pediu).toBe(1);
        expect(preparo?.motivos).toEqual(['varias_pranchetas']);
        expect(preparo?.plano.criar.map((f) => `${f.nome} ${f.largura}×${f.altura}`)).toEqual(['Quadrado 1080×1080', 'Banner 1200×628']);
        expect(preparo?.plano.resumo.length).toBeGreaterThan(40);
        expect(resultado).toMatchObject({ fim: 'entregue', conferida: true, lotes: 5 });
        expect(modelo.restantes()).toBe(0);
        expect(final.pranchetas.slice(inicial.pranchetas.length).map((p) => p.nome)).toEqual(['Quadrado', 'Banner']);
        expect(intacto).toBe(true);
        expect(amb.registro.some((r) => r.evento.tipo === 'lote-recusado')).toBe(false);
        expect(resultado.entrega.pendencias.filter((p) => p.gravidade === 'erro')).toEqual([]);
      }, 60_000);
    });
  }

  it('ajuste: serve em qualquer peça com texto. Acha a primeira camada de texto, confere a prancheta dela e entrega em duas chamadas', async () => {
    const { resultado, modelo, amb, final } = await rodar('ajuste-em-qualquer-peca', pecaExistente());
    expect(resultado).toMatchObject({ fim: 'entregue', lotes: 1 });
    expect(resultado.custo.chamadas).toBe(2);
    expect(modelo.restantes()).toBe(0);
    const feed = final.pranchetas[0];
    expect(feed?.filhos.find((n) => n.tipo === 'texto')).toMatchObject({ nome: 'Sobretítulo', cor: '#1F5FBF' });
    expect(amb.registro.flatMap((r) => (r.evento.tipo === 'render' ? [r.evento.pranchetaId] : []))).toEqual([feed?.id]);
    expect(resultado.entrega.resumo).toBe('Deixei "Sobretítulo" em azul, em Feed.');
  }, 60_000);

  it('ajuste: em peça com outros nomes, e com o texto só na segunda prancheta', async () => {
    const r = aplicarLote(
      documentoVazio(),
      [
        { op: 'criarPrancheta', nome: 'Capa do álbum', largura: 1000, altura: 1000, fundo: '#101010' },
        { op: 'criarNo', prancheta: 'Capa do álbum', no: { tipo: 'forma', forma: 'elipse', nome: 'Disco', x: 200, y: 200, largura: 600, altura: 600, preenchimento: '#f0f0f0' } },
        { op: 'criarPrancheta', nome: 'Verso', largura: 1000, altura: 1000, fundo: '#f0f0f0' },
        {
          op: 'criarNo',
          prancheta: 'Verso',
          no: { tipo: 'texto', nome: 'Lista de faixas', conteudo: '1. Abertura', x: 80, y: 80, largura: 800, altura: 120, fonte: 'IBM Plex Sans', tamanho: 48, cor: '#101010' },
        },
      ],
      { autoria: { tipo: 'designer' }, idDoLote: 'peca-de-outro-jeito' },
    );
    if (!r.ok) throw new Error(r.erro.mensagem);
    const { resultado, amb, final } = await rodar('ajuste-em-qualquer-peca', r.doc);
    expect(resultado).toMatchObject({ fim: 'entregue', conferida: true, lotes: 1 });
    expect(final.pranchetas[1]?.filhos[0]).toMatchObject({ nome: 'Lista de faixas', cor: '#1F5FBF' });
    expect(amb.registro.flatMap((x) => (x.evento.tipo === 'render' ? [x.evento.pranchetaId] : []))).toEqual([final.pranchetas[1]?.id]);
  }, 60_000);

  it('ajuste em peça vazia: não há texto, o roteiro falha com código e nada é alterado', async () => {
    const { resultado } = await rodar('ajuste-em-qualquer-peca');
    expect(resultado).toMatchObject({ fim: 'erro', erro: 'resposta_invalida', lotes: 0 });
  }, 60_000);
});

describe('o ajuste gravado com o modelo de verdade continua como o worker o usa', () => {
  it('pede a prancheta "Feed", a camada "Título" e o token "destaque"; entrega com a pendência de contraste', async () => {
    const { resultado, final } = await rodar('ajuste-titulo', pecaExistente());
    expect(resultado).toMatchObject({ fim: 'entregue', conferida: true, lotes: 1 });
    expect(final.pranchetas[0]?.filhos.find((n) => n.nome === 'Título')).toMatchObject({ cor: 'token:destaque', tamanho: 138 });
    expect(resultado.entrega.pendencias.some((p) => p.regra === 'contraste')).toBe(true);
  }, 60_000);
});
