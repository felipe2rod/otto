// A porta do worker lê o documento do banco: cada leitura devolve objetos novos. O ciclo comparava a árvore
// de antes com a de depois por identidade, e com a árvore reconstruída toda prancheta parecia alterada: o
// ajuste conferia a ÚLTIMA prancheta da peça, não a que mudou (achado pelo painel do Otto, 2026-10-02).
// Aqui o ambiente reconstrói a árvore a cada leitura, e o que mudou tem de sair certo mesmo assim.
import { describe, expect, it } from 'vitest';
import { ambienteDeTeste, comArvoreReconstruida, DIRECAO_VALIDA, idDe, pecaDoDesigner } from './apoio-de-teste';
import type { EntradaDaTarefa } from './contrato';
import { criarModeloRoteirizado, type Passo } from './modelo-roteirizado';
import { rodarTarefa } from './tarefa';

const lote = (descricao: string, operacoes: unknown[]) => ({ nome: 'aplicarOperacoes', argumentos: { descricao, operacoes } });
const entregar = (resumo: string, pendencias: unknown[] = []): Passo => ({ chamadas: [{ nome: 'entregar', argumentos: { resumo, pendencias } }] });
const azul = (alvo: string) => ({ op: 'alterar', alvo, props: { cor: '#1f5fbf' } });
const recusas = (amb: ReturnType<typeof ambienteDeTeste>) => amb.eventos.flatMap((e) => (e.tipo === 'lote-recusado' ? [e.motivo] : []));

async function rodar(passos: Passo[], entrada: EntradaDaTarefa) {
  const modelo = criarModeloRoteirizado({ passos });
  const amb = comArvoreReconstruida(ambienteDeTeste(modelo, pecaDoDesigner()));
  const { resultado } = await rodarTarefa(amb, entrada);
  return { modelo, amb, resultado };
}

describe('ajuste pontual com a árvore reconstruída a cada leitura', () => {
  const AJUSTE: EntradaDaTarefa = { tipo: 'ajuste', pedido: 'título em azul' };

  it('confere a prancheta que mudou (a primeira), não a última da peça', async () => {
    const { amb, resultado, modelo } = await rodar([{ chamadas: [lote('Título em azul', [azul('Feed/Título')])] }, entregar('Título em azul.')], AJUSTE);
    const feed = idDe(amb.documento(), 'Feed');
    expect(amb.renders).toEqual([{ prancheta: feed, ladoMaximo: 768 }]);
    expect(amb.eventos.flatMap((e) => (e.tipo === 'render' ? [e.pranchetaId] : []))).toEqual([feed]);
    // o evento de verificação diz qual prancheta foi conferida: o painel consegue mostrar "Feed conferido"
    expect(amb.eventos.flatMap((e) => (e.tipo === 'verificacao' ? [e.pranchetas] : []))).toEqual([[feed]]);
    expect(resultado).toMatchObject({ fim: 'entregue', conferida: true, lotes: 1 });
    expect(modelo.restantes()).toBe(0);
    const resposta = modelo.pedidos[1]?.mensagens.at(-1);
    expect(resposta?.papel === 'ferramentas' && resposta.resultados[0]?.texto).toContain('Verificação de "Feed"');
  });

  it('a prancheta do ajuste fica fixada: o lote seguinte em outra prancheta é recusado', async () => {
    const { amb } = await rodar([{ chamadas: [lote('Título em azul', [azul('Feed/Título')])] }, { chamadas: [lote('O do Story também', [azul('Story/Título')])] }, entregar('Só o Feed.')], AJUSTE);
    expect(recusas(amb)).toEqual(['fora_do_ajuste']);
    expect(amb.lotes).toHaveLength(1);
  });

  it('mexer na última prancheta confere a última', async () => {
    const { amb } = await rodar([{ chamadas: [lote('Título em azul', [azul('Story/Título')])] }, entregar('Título em azul.')], AJUSTE);
    expect(amb.renders).toEqual([{ prancheta: idDe(amb.documento(), 'Story'), ladoMaximo: 768 }]);
  });
});

describe('tarefa inteira com a árvore reconstruída a cada leitura', () => {
  const entrada: EntradaDaTarefa = { tipo: 'briefing', briefing: { formatos: [{ nome: 'Banner', largura: 1200, altura: 628 }] } };
  const banner = [
    { op: 'criarPrancheta', nome: 'Banner', largura: 1200, altura: 628, fundo: '#ffffff' },
    { op: 'criarNo', prancheta: 'Banner', no: { tipo: 'texto', nome: 'Título', conteudo: 'Jazz', x: 72, y: 100, largura: 900, altura: 200, fonte: 'Anton', tamanho: 120, cor: '#111111' } },
  ];
  const direcao: Passo = { papel: 'diretor', texto: JSON.stringify(DIRECAO_VALIDA) };
  const conferir: Passo = {
    chamadas: [
      { nome: 'renderizar', argumentos: { prancheta: 'Banner' } },
      { nome: 'verificar', argumentos: {} },
    ],
  };

  it('só a prancheta criada precisa de render: as do designer não ficam marcadas como alteradas', async () => {
    const { amb, resultado, modelo } = await rodar(
      [direcao, { chamadas: [lote('Banner', banner)] }, conferir, entregar('Banner montado.'), { papel: 'revisor', texto: 'ok' }, entregar('Banner montado.')],
      entrada,
    );
    expect(resultado).toMatchObject({ fim: 'entregue', conferida: true });
    expect(modelo.restantes()).toBe(0);
    const idDoBanner = idDe(amb.documento(), 'Banner');
    expect(amb.renders.map((r) => r.prancheta)).toEqual([idDoBanner, idDoBanner]); // o agente e a segunda conferência
    const producao = amb.eventos.filter((e) => e.tipo === 'etapa' && e.etapa === 'producao').at(-1);
    expect(producao).toMatchObject({ prancheta: { nome: 'Banner' } });
  });

  it('a guarda continua valendo: alterar o que já existia é recusado, criar o que o plano deixa passa', async () => {
    const { amb } = await rodar(
      [direcao, { chamadas: [lote('Mexo no Feed', [azul('Feed/Título')])] }, { chamadas: [lote('Banner', banner)] }, conferir, entregar('ok'), { papel: 'revisor', texto: 'ok' }, entregar('ok')],
      entrada,
    );
    expect(recusas(amb)).toEqual(['fora_do_plano']);
    expect(amb.documento().pranchetas.map((p) => p.nome)).toEqual(['Feed', 'Story', 'Banner']);
  });
});
