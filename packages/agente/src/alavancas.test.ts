// As quatro alavancas de custo, cada uma atrás de opção. Desligadas, nada muda (o prompt medido em 2026-10-02
// continua byte a byte). Ligadas, o teste confere o que cada uma faz no ciclo, com o modelo roteirizado.
import { describe, expect, it } from 'vitest';
import { lerAlavancas, TODAS_AS_ALAVANCAS } from './alavancas';
import { ambienteDeTeste, DIRECAO_VALIDA } from './apoio-de-teste';
import type { EntradaDaTarefa } from './contrato';
import { criarModeloRoteirizado, type Passo } from './modelo-roteirizado';
import { CAPACIDADES_MINIMAS } from './prompt/repertorio';
import { montarPromptDoSistema } from './prompt/sistema';
import { rodarTarefa } from './tarefa';

const chamada = (nome: string, argumentos: Record<string, unknown> = {}) => ({ nome, argumentos });
const lote = (descricao: string, operacoes: unknown[]) => chamada('aplicarOperacoes', { descricao, operacoes });
const texto = (prancheta: string, nome: string, conteudo: string, y = 300) => ({
  op: 'criarNo',
  prancheta,
  no: { tipo: 'texto', nome, conteudo, x: 72, y, largura: 900, altura: 200, fonte: 'Anton', tamanho: 120, cor: '#111111' },
});
const prancheta = (nome: string, altura = 1350) => ({ op: 'criarPrancheta', nome, largura: 1080, altura, fundo: '#f4efe3' });
const entregar = (resumo = 'Montei.', pendencias: unknown[] = []): Passo => ({ chamadas: [chamada('entregar', { resumo, pendencias })] });
const direcao: Passo = { papel: 'diretor', texto: JSON.stringify(DIRECAO_VALIDA) };
const UM: EntradaDaTarefa = { tipo: 'briefing', briefing: { formatos: [{ nome: 'Feed', largura: 1080, altura: 1350 }], textos: { titulo: 'Cappuccino em dobro' } } };
const DOIS: EntradaDaTarefa = {
  tipo: 'briefing',
  briefing: {
    formatos: [
      { nome: 'Feed', largura: 1080, altura: 1350 },
      { nome: 'Story', largura: 1080, altura: 1920 },
    ],
  },
};
const resposta = (m: ReturnType<typeof criarModeloRoteirizado>, i: number, n = 0) => {
  const ultima = m.pedidos[i]?.mensagens.at(-1);
  return ultima?.papel === 'ferramentas' ? { texto: ultima.resultados[n]?.texto ?? '', imagens: ultima.anexos.filter((p) => p.tipo === 'imagem').length } : { texto: '', imagens: 0 };
};

describe('ler as alavancas da linha de comando', () => {
  it('todas, nenhuma, por número e por nome', () => {
    expect(lerAlavancas('todas')).toEqual(TODAS_AS_ALAVANCAS);
    expect(lerAlavancas(undefined)).toEqual({});
    expect(lerAlavancas('nenhuma')).toEqual({});
    expect(lerAlavancas('1,3')).toEqual({ esquemaCompacto: true, avisoEJulgamento: true });
    expect(lerAlavancas('conferenciaNoLote, julgamentoEmMedio')).toEqual({ conferenciaNoLote: true, julgamentoEmMedio: true });
    expect(() => lerAlavancas('turbo')).toThrow(/alavanca desconhecida/);
  });
});

describe('desligadas, nada muda', () => {
  it('o prompt do sistema e as chamadas são os de sempre', async () => {
    const semOpcao = montarPromptDoSistema({ modo: 'tarefa', capacidades: CAPACIDADES_MINIMAS, fontes: [] });
    expect(montarPromptDoSistema({ modo: 'tarefa', capacidades: CAPACIDADES_MINIMAS, fontes: [], alavancas: {} })).toEqual(semOpcao);
    expect(semOpcao.join('\n')).not.toContain('Aviso é julgamento');
    expect(semOpcao.join('\n')).not.toContain('O sistema já confere');
    const modelo = criarModeloRoteirizado({ passos: [direcao, { chamadas: [lote('Feed', [prancheta('Feed'), texto('Feed', 'Título', 'Cappuccino em dobro')])] }, entregar()] });
    await rodarTarefa(ambienteDeTeste(modelo), UM);
    expect(resposta(modelo, 2)).toEqual({ texto: expect.stringMatching(/^Lote aplicado: "Feed", 2 operações\. Ids criados ou alterados: [^\n]+\.$/), imagens: 0 });
    expect(modelo.pedidos[0]?.raciocinio).toBe('alto');
  });
});

describe('alavanca 1: esquema compacto das operações no ciclo inteiro', () => {
  it('o catálogo vai só pelos nomes, e o prefixo encolhe mais da metade', async () => {
    const tamanho = async (alavancas: object) => {
      const modelo = criarModeloRoteirizado({ passos: [direcao, entregar('Nada.')] });
      await rodarTarefa(ambienteDeTeste(modelo), UM, { alavancas });
      const p = modelo.pedidos[1];
      return JSON.stringify(p?.ferramentas).length + (p?.sistema.join('').length ?? 0);
    };
    const [completo, compacto] = [await tamanho({}), await tamanho({ esquemaCompacto: true })];
    expect(compacto).toBeLessThan(completo / 2);
  });
});

describe('alavanca 2: a conferência do sistema volta na resposta do lote', () => {
  const montarFeed: Passo = { chamadas: [lote('Feed', [prancheta('Feed'), texto('Feed', 'Título', 'Cappuccino em dobro')])] };

  it('a resposta do lote traz a verificação e o render; a entrega é aceita sem o modelo pedir conferência', async () => {
    const modelo = criarModeloRoteirizado({ passos: [direcao, montarFeed, entregar(), { papel: 'revisor', texto: 'ok' }, entregar('Feed montado.')] });
    const amb = ambienteDeTeste(modelo);
    const { resultado } = await rodarTarefa(amb, UM, { alavancas: { conferenciaNoLote: true } });
    const r = resposta(modelo, 2);
    expect(r.texto).toContain('Lote aplicado');
    expect(r.texto).toMatch(/Verificação de "Feed" depois do lote \(0 novo\(s\)\)/);
    expect(r.texto).toContain('não chame verificar nem renderizar');
    expect(r.imagens).toBe(1);
    expect(resultado).toMatchObject({ fim: 'entregue', conferida: true, lotes: 1 });
    expect(resultado.custo.chamadas).toBe(5); // sem a alavanca seriam 6: uma só para pedir render e verificação
    expect(amb.eventos.flatMap((e) => (e.tipo === 'etapa' ? [e.etapa] : []))).toEqual(['leitura', 'direcao', 'producao', 'conferencia', 'revisao', 'entrega']);
    expect(amb.eventos.filter((e) => e.tipo === 'verificacao')).toHaveLength(1);
  });

  it('o prompt e a mensagem da segunda conferência dizem que a conferência já vem com o lote', async () => {
    const modelo = criarModeloRoteirizado({ passos: [direcao, montarFeed, entregar(), { papel: 'revisor', texto: '1. Feed / Título: maior.' }, entregar()] });
    await rodarTarefa(ambienteDeTeste(modelo), UM, { alavancas: { conferenciaNoLote: true } });
    expect(modelo.pedidos[1]?.sistema[0]).toContain('O sistema já confere');
    expect(resposta(modelo, 4).texto).toContain('olhe a verificação e o render que voltam com o lote');
    expect(resposta(modelo, 4).texto).not.toContain('Depois renderize, verifique');
  });

  it('lote que só cria pranchetas vazias não gasta verificação nem imagem', async () => {
    const modelo = criarModeloRoteirizado({
      passos: [direcao, { chamadas: [lote('Pranchetas', [prancheta('Feed'), prancheta('Story', 1920)])] }, { chamadas: [chamada('resumirDocumento')] }, { erro: 'rede' }],
    });
    const amb = ambienteDeTeste(modelo);
    await rodarTarefa(amb, DOIS, { alavancas: { conferenciaNoLote: true } });
    expect(resposta(modelo, 2)).toEqual({ texto: expect.not.stringContaining('Verificação'), imagens: 0 });
    expect(amb.eventos.filter((e) => e.tipo === 'verificacao' || e.tipo === 'render')).toEqual([]);
  });

  it('lote que mexe em duas pranchetas confere as duas; a que não mudou não é renderizada de novo', async () => {
    const modelo = criarModeloRoteirizado({
      passos: [
        direcao,
        { chamadas: [lote('As duas', [prancheta('Feed'), texto('Feed', 'Título', 'Jazz'), prancheta('Story', 1920), texto('Story', 'Título', 'Jazz', 500)])] },
        { chamadas: [lote('Só o Story', [{ op: 'mover', alvo: 'Story/Título', x: 72, y: 520 }])] },
        entregar(),
        { papel: 'revisor', texto: 'ok' },
        entregar(),
      ],
    });
    const amb = ambienteDeTeste(modelo);
    const { resultado } = await rodarTarefa(amb, DOIS, { alavancas: { conferenciaNoLote: true } });
    expect(resposta(modelo, 2).imagens).toBe(2);
    expect(resposta(modelo, 2).texto).toMatch(/Verificação de "Feed", "Story" depois do lote/);
    expect(resposta(modelo, 3).imagens).toBe(1);
    expect(resposta(modelo, 3).texto).toMatch(/Verificação de "Story" depois do lote/);
    expect(resultado).toMatchObject({ fim: 'entregue', conferida: true });
  });

  it('montar uma prancheta não conta volta; cada lote de correção conta uma, e o teto dobra', async () => {
    const corrigir = (i: number): Passo => ({ chamadas: [lote(`Corrijo ${i}`, [{ op: 'mover', alvo: 'Feed/Título', x: 72, y: 300 + i }])] });
    const entrada = { ...UM, esforco: 'SIMPLE' } as EntradaDaTarefa; // teto de 4 voltas: com a alavanca, 8
    const modelo = criarModeloRoteirizado({ passos: [direcao, montarFeed, ...Array.from({ length: 8 }, (_, i) => corrigir(i + 1)), entregar('Parei.')] });
    const { resultado } = await rodarTarefa(ambienteDeTeste(modelo), entrada, { alavancas: { conferenciaNoLote: true } });
    expect(resultado.custo.voltasDeConferencia).toBe(8);
    expect(resposta(modelo, 9).texto).not.toContain('teto de voltas');
    expect(resposta(modelo, 10).texto).toContain('teto de voltas');
    // no teto, a segunda conferência não é chamada
    expect(modelo.pedidos.filter((p) => p.papel === 'revisor')).toEqual([]);
    expect(resultado).toMatchObject({ fim: 'entregue', conferida: true });
  });

  it('o que a verificação acusa depois do lote aparece na resposta, dentro da cerca', async () => {
    const modelo = criarModeloRoteirizado({ passos: [direcao, montarFeed, entregar('Montei.')] });
    const amb = ambienteDeTeste(modelo);
    amb.avisos = () => [{ regra: 'margem', gravidade: 'aviso', prancheta: 'Feed', no: 'n1', camada: 'Título', mensagem: 'as letras de "Título" estão a menos de 43 px da borda' }];
    await rodarTarefa(amb, UM, { alavancas: { conferenciaNoLote: true } });
    expect(resposta(modelo, 2).texto).toMatch(/<material-[0-9a-z]{8} origem="verificacao">\n\[aviso\] Feed \/ Título \(margem\)/);
  });

  it('render que falha não derruba o lote: a resposta diz que não foi visto, e a entrega sai sem conferência declarada', async () => {
    const modelo = criarModeloRoteirizado({ passos: [direcao, montarFeed, entregar('Não vi.')] });
    const amb = ambienteDeTeste(modelo);
    amb.renderizar = async () => {
      throw new Error('sem memória');
    };
    const { resultado } = await rodarTarefa(amb, UM, { alavancas: { conferenciaNoLote: true } });
    expect(resposta(modelo, 2).texto).toContain('O render de "Feed" falhou');
    expect(resultado).toMatchObject({ fim: 'entregue', conferida: false, lotes: 1 });
  });
});

describe('alavanca 3: aviso é julgamento, não erro', () => {
  it('o prompt diz, e a verificação só com avisos lembra', async () => {
    const modelo = criarModeloRoteirizado({
      passos: [
        direcao,
        { chamadas: [lote('Feed', [prancheta('Feed'), texto('Feed', 'Título', 'Cappuccino em dobro')])] },
        { chamadas: [chamada('renderizar', { prancheta: 'Feed' }), chamada('verificar')] },
        entregar('Montei.'),
      ],
    });
    const amb = ambienteDeTeste(modelo);
    amb.avisos = () => [{ regra: 'faixa-vazia', gravidade: 'aviso', prancheta: 'Feed', mensagem: 'a faixa de cima ficou com o fundo liso' }];
    await rodarTarefa(amb, UM, { alavancas: { avisoEJulgamento: true } });
    const prefixo = modelo.pedidos[1]?.sistema[0] ?? '';
    expect(prefixo).toContain('Aviso é julgamento');
    expect(prefixo).toContain('nunca acrescente elemento só para calar uma regra');
    expect(resposta(modelo, 3, 1).texto).toContain('Nenhum erro. Os avisos são julgamento');
  });

  it('com erro na verificação, o lembrete não aparece: erro se corrige', async () => {
    const modelo = criarModeloRoteirizado({
      passos: [direcao, { chamadas: [lote('Feed', [prancheta('Feed'), texto('Feed', 'Título', 'Cappuccino em dobro')])] }, { chamadas: [chamada('verificar')] }, entregar('x')],
    });
    const amb = ambienteDeTeste(modelo);
    amb.avisos = () => [{ regra: 'contraste', gravidade: 'erro', prancheta: 'Feed', mensagem: 'contraste baixo' }];
    await rodarTarefa(amb, UM, { alavancas: { avisoEJulgamento: true } });
    expect(resposta(modelo, 3).texto).not.toContain('Os avisos são julgamento');
  });
});

describe('alavanca 4: direção e segunda conferência em raciocínio médio', () => {
  const passos: Passo[] = [
    direcao,
    { chamadas: [lote('Feed', [prancheta('Feed'), texto('Feed', 'Título', 'Cappuccino em dobro')])] },
    { chamadas: [chamada('renderizar', { prancheta: 'Feed' }), chamada('verificar')] },
    entregar(),
    { papel: 'revisor', texto: 'ok' },
    entregar(),
  ];
  const raciocinios = async (alavancas: object) => {
    const modelo = criarModeloRoteirizado({ passos });
    await rodarTarefa(ambienteDeTeste(modelo), UM, { alavancas });
    return Object.fromEntries(modelo.pedidos.map((p) => [p.papel, p.raciocinio]));
  };

  it('sem a alavanca: alto no diretor e no revisor; com ela: médio. O ciclo não muda', async () => {
    expect(await raciocinios({})).toEqual({ diretor: 'alto', agente: 'medio', revisor: 'alto' });
    expect(await raciocinios({ julgamentoEmMedio: true })).toEqual({ diretor: 'medio', agente: 'medio', revisor: 'medio' });
  });
});

describe('todas ligadas', () => {
  it('uma tarefa de dois formatos fecha em menos chamadas, conferida', async () => {
    const montar = (p: string, y: number): Passo => ({ chamadas: [lote(p, [texto(p, 'Título', 'Jazz', y)])] });
    const modelo = criarModeloRoteirizado({
      passos: [
        direcao,
        { chamadas: [lote('Pranchetas', [prancheta('Feed'), prancheta('Story', 1920)])] },
        montar('Feed', 300),
        montar('Story', 500),
        entregar(),
        { papel: 'revisor', texto: 'ok' },
        entregar('Feed e Story.'),
      ],
    });
    const amb = ambienteDeTeste(modelo);
    const { resultado } = await rodarTarefa(amb, DOIS, { alavancas: TODAS_AS_ALAVANCAS });
    expect(resultado).toMatchObject({ fim: 'entregue', conferida: true, lotes: 3 });
    expect(resultado.custo.chamadas).toBe(7);
    expect(resultado.custo.voltasDeConferencia).toBe(0);
    expect(amb.renders.filter((r) => !r.regiao)).toHaveLength(4); // uma por prancheta montada e duas da segunda conferência
  });
});
