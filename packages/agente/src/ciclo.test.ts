// O ciclo do agente contra um modelo roteirizado. Cada bloco confere uma regra de caráter (ADR 029, item 3)
// ou um limite do ciclo: o que o código cumpre mesmo quando o modelo não cumpre.
import type { Aviso } from '@otto/documento';
import { describe, expect, it } from 'vitest';
import { ambienteDeTeste, DIRECAO_VALIDA, idDe, pecaDoDesigner } from './apoio-de-teste';
import { executarTarefa } from './ciclo';
import type { EntradaDaTarefa, EventoDaTarefa, Preparo } from './contrato';
import { criarModeloRoteirizado, type Passo } from './modelo-roteirizado';
import { prepararTarefa } from './preparo';

const chamada = (nome: string, argumentos: Record<string, unknown> = {}) => ({ nome, argumentos });
const lote = (descricao: string, operacoes: unknown[], extra: object = {}) => chamada('aplicarOperacoes', { descricao, operacoes, ...extra });
const titulo = (prancheta: string, conteudo = 'Cappuccino em dobro') => ({
  op: 'criarNo',
  prancheta,
  no: { tipo: 'texto', nome: 'Título', conteudo, x: 72, y: 300, largura: 900, altura: 200, fonte: 'Anton', tamanho: 120, cor: '#111111' },
});
const criarFeed = { op: 'criarPrancheta', nome: 'Feed', largura: 1080, altura: 1350, fundo: '#f4efe3' };
const conferir = (prancheta = 'Feed') => ({ chamadas: [chamada('renderizar', { prancheta }), chamada('verificar')] });
const entregar = (resumo = 'Montei o Feed.', pendencias: unknown[] = []) => ({ chamadas: [chamada('entregar', { resumo, pendencias })] });

const BRIEFING: EntradaDaTarefa = { tipo: 'briefing', briefing: { nome: 'Promoção', formatos: [{ nome: 'Feed', largura: 1080, altura: 1350 }], textos: { titulo: 'Cappuccino em dobro' } } };
const direcao: Passo = { papel: 'diretor', texto: JSON.stringify(DIRECAO_VALIDA) };
const etapas = (eventos: EventoDaTarefa[]) => eventos.flatMap((e) => (e.tipo === 'etapa' ? [e.etapa] : []));
const recusas = (eventos: EventoDaTarefa[]) => eventos.flatMap((e) => (e.tipo === 'lote-recusado' ? [e.motivo] : []));
const textoDaFerramenta = (m: ReturnType<typeof criarModeloRoteirizado>, indiceDoPedido: number, n = 0): string => {
  const ultima = m.pedidos[indiceDoPedido]?.mensagens.at(-1);
  return ultima?.papel === 'ferramentas' ? (ultima.resultados[n]?.texto ?? '') : '';
};

/** Roda as duas partes com o mesmo modelo, aprovando o que pedir "pode". */
async function rodar(
  passos: Passo[],
  entrada: EntradaDaTarefa = BRIEFING,
  preparar?: (amb: ReturnType<typeof ambienteDeTeste>) => void,
  inicial = undefined as ReturnType<typeof pecaDoDesigner> | undefined,
) {
  const modelo = criarModeloRoteirizado({ passos });
  const amb = ambienteDeTeste(modelo, inicial);
  preparar?.(amb);
  const preparo = await prepararTarefa(amb, entrada);
  const resultado = await executarTarefa(amb, entrada, preparo);
  return { modelo, amb, preparo, resultado };
}

describe('uma tarefa de briefing, do começo ao fim', () => {
  const passos: Passo[] = [
    direcao,
    { papel: 'agente', texto: 'Vou montar o Feed com o título em Anton.', chamadas: [lote('Prancheta e título', [criarFeed, titulo('Feed')])] },
    { papel: 'agente', ...conferir() },
    { papel: 'agente', ...entregar() },
    { papel: 'revisor', texto: 'Hierarquia fraca. 1. Feed / Título: suba para 160 px.' },
    { papel: 'agente', chamadas: [lote('Título maior', [{ op: 'alterar', alvo: 'Feed/Título', props: { tamanho: 160, altura: 260 } }])] },
    { papel: 'agente', ...conferir() },
    { papel: 'agente', ...entregar('Montei o Feed e subi o título depois da segunda conferência.') },
  ];

  it('entrega conferida, com as etapas na ordem e o conjunto de alterações aplicado', async () => {
    const { resultado, amb, modelo } = await rodar(passos);
    expect(resultado.fim).toBe('entregue');
    expect(resultado.conferida).toBe(true);
    expect(resultado.lotes).toBe(2);
    expect(resultado.entrega).toEqual({ resumo: 'Montei o Feed e subi o título depois da segunda conferência.', pendencias: [] });
    expect(modelo.restantes()).toBe(0);
    expect(etapas(amb.eventos)).toEqual(['leitura', 'direcao', 'producao', 'conferencia', 'revisao', 'ajustes', 'conferencia', 'entrega']);
    expect(amb.documento().pranchetas[0]?.filhos[0]).toMatchObject({ nome: 'Título', tamanho: 160 });
  });

  it('a etapa de produção diz qual prancheta está sendo montada', async () => {
    const { amb } = await rodar(passos);
    const producao = amb.eventos.find((e) => e.tipo === 'etapa' && e.etapa === 'producao');
    expect(producao).toMatchObject({ prancheta: { nome: 'Feed' } });
  });

  it('avisa as etapas previstas logo no começo, para o painel desenhar as que faltam', async () => {
    const { amb } = await rodar(passos);
    const previstas = amb.eventos.find((e) => e.tipo === 'etapas');
    expect(previstas?.tipo === 'etapas' && previstas.previstas.map((p) => p.etapa)).toEqual(['leitura', 'direcao', 'producao', 'conferencia', 'revisao', 'ajustes', 'conferencia', 'entrega']);
  });

  it('cada lote sai como evento, com as operações e os ids tocados', async () => {
    const { amb } = await rodar(passos);
    const lotes = amb.eventos.filter((e) => e.tipo === 'lote');
    expect(lotes).toHaveLength(2);
    expect(lotes[0]).toMatchObject({ descricao: 'Prancheta e título', versao: 1 });
    expect(lotes[0]?.tipo === 'lote' && lotes[0].operacoes).toHaveLength(2);
  });

  it('registra o custo: chamadas por papel, imagens vistas, voltas, lotes e tempo', async () => {
    const { resultado, amb } = await rodar(passos);
    const c = resultado.custo;
    expect(c.chamadas).toBe(8);
    expect(c.porPapel.diretor?.chamadas).toBe(1);
    expect(c.porPapel.revisor?.chamadas).toBe(1);
    expect(c.porPapel.agente?.chamadas).toBe(6);
    expect(c.imagensVistas).toBe(3); // dois renders do agente e um do revisor
    expect(c.voltasDeConferencia).toBe(2);
    expect(c.lotes).toBe(2);
    expect(c.duracaoMs).toBeGreaterThan(0);
    expect(amb.chamadas).toHaveLength(8);
    expect(amb.chamadas.every((x) => x.resultado === 'ok')).toBe(true);
  });

  it('o agente recebe a direção e o plano aprovado; o revisor recebe o pedido sem o histórico do agente', async () => {
    const { modelo } = await rodar(passos);
    const primeira = modelo.pedidos[1]?.mensagens[0];
    const texto = primeira?.papel === 'usuario' && primeira.partes[0]?.tipo === 'texto' ? primeira.partes[0].texto : '';
    expect(texto).toContain('Conceito: Gente de verdade');
    expect(texto).toContain('Feed 1080×1350');
    const revisor = modelo.pedidos[4];
    expect(revisor?.papel).toBe('revisor');
    expect(revisor?.mensagens).toHaveLength(1);
    expect(revisor?.ferramentas).toEqual([]);
    const partes = revisor?.mensagens[0]?.papel === 'usuario' ? revisor.mensagens[0].partes : [];
    expect(partes.filter((p) => p.tipo === 'imagem')).toHaveLength(1);
    expect(JSON.stringify(partes)).not.toContain('Vou montar o Feed');
  });

  it('as fontes da conta vão ao agente e ao diretor com o uso de cada família, mesmo que a porta não diga', async () => {
    const { modelo } = await rodar(passos);
    expect(modelo.pedidos[1]?.sistema[1]).toContain('"Anton" pesos 400: título condensado de impacto');
    const diretor = modelo.pedidos[0]?.mensagens[0];
    expect(diretor?.papel === 'usuario' && diretor.partes[0]?.tipo === 'texto' && diretor.partes[0].texto).toContain('- Anton (pesos 400): título condensado de impacto');
  });

  it('o prefixo do sistema é o mesmo em todas as chamadas do agente', async () => {
    const { modelo } = await rodar(passos);
    const doAgente = modelo.pedidos.filter((p) => p.papel === 'agente');
    expect(new Set(doAgente.map((p) => p.sistema[0])).size).toBe(1);
    expect(new Set(doAgente.map((p) => JSON.stringify(p.ferramentas))).size).toBe(1);
  });
});

describe('etapas quando a produção e a conferência se alternam', () => {
  it('a conferência só ganha número de rodada depois de uma segunda conferência', async () => {
    const { amb } = await rodar([
      direcao,
      { chamadas: [lote('Prancheta e título', [criarFeed, titulo('Feed')])] },
      conferir(),
      { chamadas: [lote('Corrijo', [{ op: 'mover', alvo: 'Feed/Título', x: 72, y: 320 }])] },
      conferir(),
      entregar(),
      { papel: 'revisor', texto: '1. Feed / Título: suba para 160 px.' },
      { chamadas: [lote('Título maior', [{ op: 'alterar', alvo: 'Feed/Título', props: { tamanho: 160, altura: 260 } }])] },
      conferir(),
      entregar(),
    ]);
    const vistas = amb.eventos.flatMap((e) => (e.tipo === 'etapa' ? [`${e.etapa}${e.rodada ? ` ${e.rodada}` : ''}`] : []));
    expect(vistas).toEqual(['leitura', 'direcao', 'producao', 'conferencia', 'producao', 'conferencia', 'revisao', 'ajustes', 'conferencia 2', 'entrega']);
  });
});

describe('regra 1: não diz "pronto" sem render e verificar', () => {
  it('entregar sem conferir é recusado, e o modelo ouve o que falta', async () => {
    const { modelo, resultado } = await rodar([
      direcao,
      { chamadas: [lote('Prancheta e título', [criarFeed, titulo('Feed')])] },
      entregar('Pronto!'),
      conferir(),
      entregar('Agora conferi.'),
      { papel: 'revisor', texto: 'Sem mudanças.' },
      entregar('Entregue.'),
    ]);
    const recusa = textoDaFerramenta(modelo, 3);
    expect(recusa).toContain('Ainda não');
    expect(recusa).toContain('verificar');
    expect(recusa).toContain('Feed');
    expect(resultado.fim).toBe('entregue');
    expect(resultado.conferida).toBe(true);
  });

  it('mexeu depois de conferir: precisa conferir de novo', async () => {
    const { modelo } = await rodar([
      direcao,
      { chamadas: [lote('Prancheta e título', [criarFeed, titulo('Feed')])] },
      conferir(),
      { chamadas: [lote('Mexi de novo', [{ op: 'mover', alvo: 'Feed/Título', x: 72, y: 400 }])] },
      entregar('Pronto!'),
      conferir(),
      entregar(),
      { papel: 'revisor', texto: 'Sem mudanças.' },
      entregar(),
    ]);
    expect(textoDaFerramenta(modelo, 5)).toContain('Ainda não');
  });

  it('renderizar só um recorte não conta como olhar a prancheta', async () => {
    const { modelo } = await rodar([
      direcao,
      { chamadas: [lote('Prancheta e título', [criarFeed, titulo('Feed')])] },
      { chamadas: [chamada('renderizar', { prancheta: 'Feed', regiao: [0, 0, 400, 400] }), chamada('verificar')] },
      entregar('Pronto!'),
      conferir(),
      entregar(),
      { papel: 'revisor', texto: 'Sem mudanças.' },
      entregar(),
    ]);
    expect(textoDaFerramenta(modelo, 4)).toContain('renderize e olhe: Feed');
  });

  it('o que a verificação ainda acusa vira pendência, mesmo que o modelo diga que não há nenhuma', async () => {
    const erro: Aviso = { regra: 'contraste', gravidade: 'erro', prancheta: 'Feed', no: 'n1', camada: 'Título', mensagem: 'contraste de "Título" com o fundo real é 2.1:1' };
    const { resultado } = await rodar(
      [direcao, { chamadas: [lote('Prancheta e título', [criarFeed, titulo('Feed')])] }, conferir(), entregar(), { papel: 'revisor', texto: 'ok' }, entregar('Pronto, sem pendências.', [])],
      BRIEFING,
      (amb) => {
        amb.avisos = () => [erro];
      },
    );
    expect(resultado.fim).toBe('entregue');
    expect(resultado.entrega.pendencias).toEqual([
      { tipo: 'aviso_da_verificacao', texto: erro.mensagem, camadas: ['n1'], prancheta: 'Feed', origem: 'verificacao', regra: 'contraste', gravidade: 'erro' },
    ]);
  });

  it('quando o Otto já declarou o aviso da verificação, a pendência não duplica: a dele ganha a regra e a gravidade', async () => {
    const montar = { chamadas: [lote('Prancheta e título', [criarFeed, titulo('Feed')])] };
    const modelo = criarModeloRoteirizado({
      passos: [
        direcao,
        montar,
        conferir(),
        entregar(),
        { papel: 'revisor', texto: 'ok' },
        entregar('Montei.', [{ texto: 'O título ficou com contraste baixo; a cor é a do briefing.', tipo: 'aviso_da_verificacao', camadas: ['Feed/Título'] }]),
      ],
    });
    const amb = ambienteDeTeste(modelo);
    amb.avisos = (doc) => [{ regra: 'contraste', gravidade: 'erro', prancheta: 'Feed', no: idDe(doc, 'Feed/Título'), camada: 'Título', mensagem: 'contraste de "Título" com o fundo real é 2.1:1' }];
    const r = await executarTarefa(amb, BRIEFING, await prepararTarefa(amb, BRIEFING));
    expect(r.entrega.pendencias).toEqual([
      {
        tipo: 'aviso_da_verificacao',
        texto: 'O título ficou com contraste baixo; a cor é a do briefing.',
        camadas: [idDe(amb.documento(), 'Feed/Título')],
        prancheta: 'Feed',
        origem: 'otto',
        regra: 'contraste',
        gravidade: 'erro',
      },
    ]);
  });

  it('pedir de novo o render de uma prancheta que não mudou não manda a imagem outra vez', async () => {
    const { modelo, amb, resultado } = await rodar([
      direcao,
      { chamadas: [lote('Prancheta e título', [criarFeed, titulo('Feed')])] },
      conferir(),
      { chamadas: [chamada('renderizar', { prancheta: 'Feed' })] },
      entregar(),
      { papel: 'revisor', texto: 'ok' },
      entregar(),
    ]);
    const repetido = modelo.pedidos[4]?.mensagens.at(-1);
    expect(repetido?.papel === 'ferramentas' && repetido.resultados[0]?.texto).toContain('Nada mudou em "Feed"');
    expect(repetido?.papel === 'ferramentas' && repetido.anexos).toEqual([]);
    expect(amb.renders.filter((r) => !r.regiao)).toHaveLength(2); // o do agente e o da segunda conferência
    expect(resultado.custo.imagensVistas).toBe(2);
  });

  it('as pendências que o Otto declara chegam com tipo e com a camada resolvida para id', async () => {
    const { resultado, amb } = await rodar([
      direcao,
      { chamadas: [lote('Prancheta e título', [criarFeed, titulo('Feed')])] },
      conferir(),
      entregar(),
      { papel: 'revisor', texto: 'ok' },
      entregar('Montei.', [{ texto: 'A foto do banco está ampliada 140%.', tipo: 'resolucao_da_imagem', camadas: ['Feed/Título'] }, { texto: 'Faltou a foto do produto.' }]),
    ]);
    expect(resultado.entrega.pendencias).toEqual([
      { tipo: 'resolucao_da_imagem', texto: 'A foto do banco está ampliada 140%.', camadas: [idDe(amb.documento(), 'Feed/Título')], origem: 'otto' },
      { tipo: 'outro', texto: 'Faltou a foto do produto.', camadas: [], origem: 'otto' },
    ]);
  });

  it('texto do briefing que não está literal na prancheta é erro de verificação', async () => {
    const { modelo } = await rodar([
      direcao,
      { chamadas: [lote('Prancheta e título', [criarFeed, titulo('Feed', 'Cappuccino duplo')])] },
      conferir(),
      entregar(),
      { papel: 'revisor', texto: 'ok' },
      entregar(),
    ]);
    const verificacao = textoDaFerramenta(modelo, 3, 1);
    expect(verificacao).toContain('texto-alterado');
    expect(verificacao).toContain('Cappuccino em dobro');
    expect(verificacao).toContain('dobro');
  });

  it('modelo que não lê imagem: a conferência é dita como parcial, não some em silêncio', async () => {
    const modelo = criarModeloRoteirizado(
      { passos: [direcao, { chamadas: [lote('Prancheta e título', [criarFeed, titulo('Feed')])] }, conferir(), entregar('Montei.')] },
      { capacidades: { imagem: false, ferramentas: true, cache: false } },
    );
    const amb = ambienteDeTeste(modelo);
    const preparo = await prepararTarefa(amb, BRIEFING);
    const r = await executarTarefa(amb, BRIEFING, preparo);
    expect(r.fim).toBe('entregue');
    expect(r.conferida).toBe(false);
    expect(r.entrega.pendencias.map((p) => p.tipo)).toContain('sem_conferencia');
    expect(amb.renders).toEqual([]);
    expect(r.custo.imagensVistas).toBe(0);
  });
});

describe('regra 2: admite quando não consegue', () => {
  it('operação que não existe volta como erro legível, e nada é aplicado', async () => {
    const { modelo, amb } = await rodar([
      direcao,
      { chamadas: [lote('Tento desenhar à mão', [criarFeed, { op: 'pincelar', prancheta: 'Feed' }])] },
      entregar('Não consigo.', [{ texto: 'O editor não tem pincel.', tipo: 'nao_consigo' }]),
    ]);
    expect(textoDaFerramenta(modelo, 2)).toContain('a operação "pincelar" não existe no catálogo');
    expect(amb.documento().pranchetas).toEqual([]);
    expect(recusas(amb.eventos)).toEqual(['operacao_recusada']);
  });

  it('sem nenhuma alteração, a entrega sai sem segunda conferência e com a pendência do Otto', async () => {
    const { resultado, modelo } = await rodar([direcao, entregar('Isso eu não consigo fazer aqui.', [{ texto: 'O editor não gera imagem.', tipo: 'nao_consigo' }])]);
    expect(resultado.fim).toBe('entregue');
    expect(resultado.lotes).toBe(0);
    expect(resultado.entrega.pendencias[0]).toMatchObject({ tipo: 'nao_consigo', origem: 'otto' });
    expect(modelo.pedidos.filter((p) => p.papel === 'revisor')).toEqual([]);
  });

  it('ferramenta que não existe volta como erro, sem derrubar a tarefa', async () => {
    const { modelo, resultado } = await rodar([
      direcao,
      { chamadas: [chamada('gerarImagem', { descricao: 'um café' })] },
      entregar('Não há geração de imagem.', [{ texto: 'Sem foto.', tipo: 'nao_consigo' }]),
    ]);
    expect(textoDaFerramenta(modelo, 2)).toContain('A ferramenta "gerarImagem" não existe');
    expect(resultado.fim).toBe('entregue');
  });
});

describe('regra 3: não remove nem sobrescreve o que o designer fez; camada bloqueada é intocável', () => {
  const noFeedNovo = { op: 'criarPrancheta', nome: 'Feed novo', largura: 1080, altura: 1350, fundo: '#ffffff' };
  const entrada: EntradaDaTarefa = { tipo: 'briefing', briefing: { formatos: [{ nome: 'Feed novo', largura: 1080, altura: 1350 }] } };

  it('lote que remove camada do designer é recusado, e o documento fica como estava', async () => {
    const inicial = pecaDoDesigner();
    const { modelo, amb, resultado } = await rodar(
      [direcao, { chamadas: [lote('Limpo o que tinha', [{ op: 'remover', alvo: 'Feed/Selo' }])] }, entregar('Não removi.', [{ texto: 'Remoção fora do plano.' }])],
      entrada,
      undefined,
      inicial,
    );
    expect(recusas(amb.eventos)).toEqual(['remocao_sem_plano']);
    expect(textoDaFerramenta(modelo, 2)).toContain('"Selo"');
    expect(amb.documento()).toBe(inicial);
    expect(resultado.lotes).toBe(0);
    expect(resultado.custo.lotesRecusados).toBe(1);
  });

  it('lote que altera camada do designer é recusado; criar na prancheta nova passa', async () => {
    const inicial = pecaDoDesigner();
    const { amb } = await rodar(
      [
        direcao,
        { chamadas: [lote('Mexo no título do designer', [{ op: 'alterar', alvo: 'Feed/Título', props: { cor: '#ff0000' } }])] },
        { chamadas: [lote('Prancheta nova', [noFeedNovo, titulo('Feed novo')])] },
        conferir('Feed novo'),
        entregar(),
        { papel: 'revisor', texto: 'ok' },
        entregar(),
      ],
      entrada,
      undefined,
      inicial,
    );
    expect(recusas(amb.eventos)).toEqual(['fora_do_plano']);
    expect(amb.documento().pranchetas.map((p) => p.nome)).toEqual(['Feed', 'Story', 'Feed novo']);
    expect(amb.documento().pranchetas[0]).toBe(inicial.pranchetas[0]);
  });

  it('camada bloqueada: o catálogo recusa, mesmo com a prancheta no plano', async () => {
    const inicial = pecaDoDesigner();
    const pedido: EntradaDaTarefa = { tipo: 'pedido', pedido: 'aumenta o logo' };
    const { modelo, amb } = await rodar(
      [
        { papel: 'planejador', texto: JSON.stringify({ resumo: 'Aumento o logo.', alterar: [{ prancheta: 'Feed', oQue: 'logo' }] }) },
        { chamadas: [lote('Logo maior', [{ op: 'alterar', alvo: 'Feed/Logo', props: { tamanho: 60 } }])] },
        entregar('O logo está bloqueado.', [{ texto: 'A camada Logo está bloqueada; não mexi.', tipo: 'nao_consigo', camadas: ['Feed/Logo'] }]),
      ],
      pedido,
      undefined,
      inicial,
    );
    expect(textoDaFerramenta(modelo, 2)).toContain('está bloqueada');
    expect(recusas(amb.eventos)).toEqual(['operacao_recusada']);
    expect(amb.documento()).toBe(inicial);
  });

  it('simular não grava nada, e também passa pela guarda', async () => {
    const inicial = pecaDoDesigner();
    const { modelo, amb } = await rodar(
      [direcao, { chamadas: [lote('Teste', [noFeedNovo], { simular: true }), lote('Teste de remoção', [{ op: 'remover', alvo: 'Feed/Selo' }], { simular: true })] }, entregar('Só simulei.', [])],
      entrada,
      undefined,
      inicial,
    );
    expect(textoDaFerramenta(modelo, 2, 0)).toContain('Simulação ok');
    expect(textoDaFerramenta(modelo, 2, 1)).toContain('Lote recusado');
    expect(amb.documento()).toBe(inicial);
    expect(amb.lotes).toEqual([]);
  });
});

describe('regra 4: tarefa grande só com plano aprovado', () => {
  it('prancheta além do plano é recusada', async () => {
    const { amb } = await rodar([
      direcao,
      { chamadas: [lote('Feed', [criarFeed, titulo('Feed')])] },
      { chamadas: [lote('Story também', [{ op: 'criarPrancheta', nome: 'Story', largura: 1080, altura: 1920, fundo: '#ffffff' }])] },
      conferir(),
      entregar(),
      { papel: 'revisor', texto: 'ok' },
      entregar('Fiz o Feed.', [{ texto: 'O Story não estava no plano.' }]),
    ]);
    expect(recusas(amb.eventos)).toEqual(['prancheta_a_mais']);
    expect(amb.documento().pranchetas.map((p) => p.nome)).toEqual(['Feed']);
  });

  it('remoção aprovada no plano passa', async () => {
    const inicial = pecaDoDesigner();
    const pedido: EntradaDaTarefa = { tipo: 'pedido', pedido: 'tira o selo do feed' };
    const { preparo, amb, resultado } = await rodar(
      [
        {
          papel: 'planejador',
          texto: JSON.stringify({ resumo: 'Tiro o selo.', alterar: [{ prancheta: 'Feed', oQue: 'sem o selo' }], remover: [{ alvo: 'Feed/Selo', motivo: 'o pedido manda tirar' }] }),
        },
        { chamadas: [lote('Sem o selo', [{ op: 'remover', alvo: 'Feed/Selo' }])] },
        conferir(),
        entregar('Tirei o selo.'),
      ],
      pedido,
      undefined,
      inicial,
    );
    expect(preparo.pedeConfirmacao).toBe(true);
    expect(preparo.motivos).toEqual(['remocao']);
    expect(recusas(amb.eventos)).toEqual([]);
    expect(resultado.fim).toBe('entregue');
    expect(amb.documento().pranchetas[0]?.filhos.map((n) => n.nome)).not.toContain('Selo');
  });

  it('pedido que só altera a peça não chama a segunda conferência: ninguém pediu direção de arte', async () => {
    const inicial = pecaDoDesigner();
    const { modelo, resultado } = await rodar(
      [
        { papel: 'planejador', texto: JSON.stringify({ resumo: 'Título em vermelho.', alterar: [{ prancheta: 'Feed', oQue: 'cor do título' }] }) },
        { chamadas: [lote('Título vermelho', [{ op: 'alterar', alvo: 'Feed/Título', props: { cor: '#c0392b' } }])] },
        conferir(),
        entregar('Troquei a cor.'),
      ],
      { tipo: 'pedido', pedido: 'título em vermelho' },
      undefined,
      inicial,
    );
    expect(resultado.fim).toBe('entregue');
    expect(modelo.pedidos.map((p) => p.papel)).toEqual(['planejador', 'agente', 'agente', 'agente']);
  });
});

describe('tetos e entrega parcial', () => {
  const montar: Passo = { chamadas: [lote('Prancheta e título', [criarFeed, titulo('Feed')])] };

  it('teto de voltas: o modelo é avisado, e a entrega sem conferir passa a ser aceita como parcial', async () => {
    const entrada: EntradaDaTarefa = { ...BRIEFING, esforco: 'SIMPLE' } as EntradaDaTarefa; // teto de 4 voltas
    const volta: Passo = { chamadas: [chamada('verificar')] };
    const mexer = (i: number): Passo => ({ chamadas: [lote(`Mexo ${i}`, [{ op: 'mover', alvo: 'Feed/Título', x: 72, y: 300 + i }])] });
    const { modelo, resultado } = await rodar([direcao, montar, volta, volta, volta, volta, volta, volta, mexer(1), entregar('Parei aqui.')], entrada);
    expect(textoDaFerramenta(modelo, 6)).toContain('teto de voltas');
    expect(resultado.fim).toBe('entregue');
    expect(resultado.conferida).toBe(false);
    expect(resultado.entrega.pendencias.map((p) => p.tipo)).toEqual(expect.arrayContaining(['limite_de_conferencias', 'sem_conferencia']));
    // no teto, a segunda conferência não é chamada: não haveria volta para aplicar o que ela pedisse
    expect(modelo.pedidos.filter((p) => p.papel === 'revisor')).toEqual([]);
  });

  it('teto de chamadas: para, entrega o que foi feito e diz o que ficou sem conferir', async () => {
    const modelo = criarModeloRoteirizado({
      passos: [direcao, montar, { chamadas: [chamada('resumirDocumento')] }, { chamadas: [chamada('resumirDocumento')] }, { chamadas: [chamada('resumirDocumento')] }],
    });
    const amb = ambienteDeTeste(modelo, undefined, { limites: { maximoDeChamadas: 4 } });
    const preparo = await prepararTarefa(amb, BRIEFING);
    const r = await executarTarefa(amb, BRIEFING, preparo);
    expect(r.fim).toBe('limite_de_passos');
    expect(r.conferida).toBe(false);
    expect(r.lotes).toBe(1);
    expect(r.custo.chamadas).toBe(4);
    expect(r.entrega.pendencias.map((p) => p.tipo)).toEqual(expect.arrayContaining(['limite_de_passos', 'sem_conferencia']));
    expect(amb.documento().pranchetas.map((p) => p.nome)).toEqual(['Feed']);
    expect(amb.eventos.at(-1)?.tipo).toBe('entrega');
  });

  it('teto de custo: para pelo dinheiro que o modelo declara', async () => {
    const caro = { uso: { entrada: 1_000_000, saida: 100_000 } };
    const modelo = criarModeloRoteirizado(
      {
        passos: [
          { ...direcao, ...caro },
          { ...montar, ...caro },
          { ...conferir(), ...caro },
        ],
      },
      { preco: { entrada: 2, saida: 10, cacheLido: 0.2, cacheCriado: 2.5 } },
    );
    const amb = ambienteDeTeste(modelo, undefined, { limites: { tetoDeCusto: 5 } });
    const preparo = await prepararTarefa(amb, BRIEFING);
    const r = await executarTarefa(amb, BRIEFING, preparo);
    expect(r.fim).toBe('limite_de_custo');
    expect(r.custo.dolares).toBeCloseTo(6, 5);
    expect(r.custo.chamadas).toBe(2);
    expect(r.entrega.pendencias.map((p) => p.tipo)).toContain('limite_de_custo');
  });

  it('a verificação que sobrou entra nas pendências da entrega parcial', async () => {
    const erro: Aviso = { regra: 'margem', gravidade: 'aviso', prancheta: 'Feed', no: 'n1', camada: 'Título', mensagem: 'as letras de "Título" estão a menos de 43 px da borda' };
    const modelo = criarModeloRoteirizado({ passos: [direcao, montar] });
    const amb = ambienteDeTeste(modelo, undefined, { limites: { maximoDeChamadas: 2 } });
    amb.avisos = () => [erro];
    const r = await executarTarefa(amb, BRIEFING, await prepararTarefa(amb, BRIEFING));
    expect(r.entrega.pendencias).toContainEqual(expect.objectContaining({ tipo: 'aviso_da_verificacao', regra: 'margem', origem: 'verificacao' }));
  });

  it('modelo que para de usar as ferramentas é cobrado duas vezes e depois a tarefa fecha como parcial', async () => {
    const { resultado, modelo } = await rodar([direcao, montar, { texto: 'Acho que ficou bom.' }, { texto: 'Pronto.' }, { texto: 'Terminei.' }]);
    expect(resultado.fim).toBe('limite_de_passos');
    expect(resultado.conferida).toBe(false);
    const cobranca = modelo.pedidos[3]?.mensagens.at(-1);
    expect(cobranca?.papel === 'usuario' && cobranca.partes[0]?.tipo === 'texto' && cobranca.partes[0].texto).toContain('entregar');
  });
});

describe('cancelamento e falha', () => {
  const montar: Passo = { chamadas: [lote('Prancheta e título', [criarFeed, titulo('Feed')])] };

  it('cancelar entre passos: para na hora, sem nova chamada ao modelo, com o que foi feito preservado', async () => {
    const modelo = criarModeloRoteirizado({ passos: [direcao, montar, conferir(), entregar()] });
    const amb = ambienteDeTeste(modelo);
    const preparo = await prepararTarefa(amb, BRIEFING);
    const aplicar = amb.aplicarLote;
    amb.aplicarLote = async (l) => {
      const r = await aplicar(l);
      amb.cancelar();
      return r;
    };
    const r = await executarTarefa(amb, BRIEFING, preparo);
    expect(r.fim).toBe('cancelada');
    expect(r.lotes).toBe(1);
    expect(r.conferida).toBe(false);
    expect(modelo.restantes()).toBe(2);
    expect(r.entrega.pendencias.map((p) => p.tipo)).toContain('interrompida');
    expect(amb.documento().pranchetas.map((p) => p.nome)).toEqual(['Feed']);
  });

  it('cancelar antes de começar: nada é chamado', async () => {
    const modelo = criarModeloRoteirizado({ passos: [direcao, montar] });
    const amb = ambienteDeTeste(modelo);
    const preparo = await prepararTarefa(amb, BRIEFING);
    amb.cancelar();
    const r = await executarTarefa(amb, BRIEFING, preparo);
    expect(r.fim).toBe('cancelada');
    expect(r.lotes).toBe(0);
    expect(modelo.restantes()).toBe(1);
  });

  it('falha do modelo no meio: fecha com o código, e o que foi feito fica', async () => {
    const { resultado, amb } = await rodar([direcao, montar, { erro: 'rede' }]);
    expect(resultado.fim).toBe('erro');
    expect(resultado.erro).toBe('rede');
    expect(resultado.lotes).toBe(1);
    expect(amb.chamadas.at(-1)).toMatchObject({ resultado: 'rede' });
    expect(amb.eventos.some((e) => e.tipo === 'erro' && e.codigo === 'rede')).toBe(true);
  });

  it('limite diário do fornecedor no meio da tarefa sai com código próprio', async () => {
    const { resultado } = await rodar([direcao, montar, { erro: 'limite_diario' }]);
    expect(resultado).toMatchObject({ fim: 'erro', erro: 'limite_diario', lotes: 1 });
  });

  it('porta que falha dentro de uma ferramenta vira resposta de erro para o modelo, não derruba a tarefa', async () => {
    const { modelo, resultado, amb } = await rodar([direcao, montar, conferir(), entregar('Não consegui ver.', [{ texto: 'O render falhou.' }])], BRIEFING, (a) => {
      a.renderizar = async () => {
        throw new Error('sem memória');
      };
    });
    expect(textoDaFerramenta(modelo, 3, 0)).toContain('Erro em renderizar');
    expect(amb.eventos.some((e) => e.tipo === 'erro' && e.ferramenta === 'renderizar')).toBe(true);
    expect(resultado.fim).toBe('entregue');
    expect(resultado.conferida).toBe(false);
  });
});

describe('o que o Claude manda fora do esperado', () => {
  it('operações como texto com o JSON dentro são lidas', async () => {
    const { amb } = await rodar([
      direcao,
      { chamadas: [chamada('aplicarOperacoes', { descricao: 'Prancheta', operacoes: JSON.stringify([criarFeed]) })] },
      conferir(),
      entregar(),
      { papel: 'revisor', texto: 'ok' },
      entregar(),
    ]);
    expect(amb.documento().pranchetas.map((p) => p.nome)).toEqual(['Feed']);
  });

  it('lote sem descrição ou sem operações é recusado com o motivo', async () => {
    const { modelo, amb } = await rodar([direcao, { chamadas: [chamada('aplicarOperacoes', { operacoes: [] })] }, entregar('Nada feito.', [{ texto: 'x' }])]);
    expect(textoDaFerramenta(modelo, 2)).toContain('Lote recusado');
    expect(recusas(amb.eventos)).toEqual(['lote_invalido']);
  });
});

describe('preparo guardado como dado', () => {
  it('a segunda parte funciona com o preparo que passou por JSON, sem depender da conversa da primeira', async () => {
    const modeloDaParte1 = criarModeloRoteirizado({ passos: [direcao] });
    const amb1 = ambienteDeTeste(modeloDaParte1);
    const guardado = JSON.parse(JSON.stringify(await prepararTarefa(amb1, BRIEFING))) as Preparo;

    const modeloDaParte2 = criarModeloRoteirizado({
      passos: [{ chamadas: [lote('Prancheta e título', [criarFeed, titulo('Feed')])] }, conferir(), entregar(), { papel: 'revisor', texto: 'ok' }, entregar()],
    });
    const amb2 = ambienteDeTeste(modeloDaParte2);
    const r = await executarTarefa(amb2, BRIEFING, guardado);
    expect(r.fim).toBe('entregue');
    expect(modeloDaParte2.pedidos[0]?.mensagens).toHaveLength(1);
    // o custo da primeira parte entra no total
    expect(r.custo.chamadas).toBe(6);
    expect(r.custo.porPapel.diretor?.chamadas).toBe(1);
  });
});
