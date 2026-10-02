import { describe, expect, it } from 'vitest';
import { ambienteDeTeste, DIRECAO_VALIDA, idDe, pecaDoDesigner } from './apoio-de-teste';
import { type EntradaDaTarefa, Preparo } from './contrato';
import { criarModeloRoteirizado } from './modelo-roteirizado';
import { prepararTarefa } from './preparo';

const feed = { nome: 'Feed', largura: 1080, altura: 1350 };
const story = { nome: 'Story', largura: 1080, altura: 1920 };
const direcao = { papel: 'diretor' as const, texto: JSON.stringify(DIRECAO_VALIDA) };
const texto = (m: ReturnType<typeof criarModeloRoteirizado>, i = 0): string => {
  const msg = m.pedidos[i]?.mensagens.at(-1);
  return msg?.papel === 'usuario' ? msg.partes.flatMap((p) => (p.tipo === 'texto' ? [p.texto] : [])).join('\n') : '';
};

describe('primeira parte da tarefa: entender e planejar', () => {
  it('briefing com dois formatos: direção, plano do formulário e espera pelo "pode"', async () => {
    const modelo = criarModeloRoteirizado({ passos: [direcao] });
    const amb = ambienteDeTeste(modelo);
    const p = await prepararTarefa(amb, { tipo: 'briefing', briefing: { formatos: [feed, story], textos: { titulo: 'Jazz na Praça' } } });
    expect(Preparo.safeParse(p).success).toBe(true);
    expect(p.pedeConfirmacao).toBe(true);
    expect(p.motivos).toEqual(['varias_pranchetas']);
    expect(p.plano.criar).toEqual([feed, story]);
    expect(p.direcao?.conceito).toBe(DIRECAO_VALIDA.conceito);
    expect(p.cartao?.tipografia).toEqual({ titulo: 'Inter', texto: 'Inter' });
    expect(p.custo.chamadas).toBe(1);
    expect(amb.eventos.map((e) => e.tipo)).toEqual(['etapa', 'etapa', 'direcao', 'plano', 'etapas']);
    expect(amb.lotes).toEqual([]);
  });

  it('briefing com um formato não espera', async () => {
    const amb = ambienteDeTeste(criarModeloRoteirizado({ passos: [direcao] }));
    const p = await prepararTarefa(amb, { tipo: 'briefing', briefing: { formatos: [feed] } });
    expect(p.pedeConfirmacao).toBe(false);
    expect(p.motivos).toEqual([]);
  });

  it('o diretor recebe o briefing cercado, as fontes disponíveis e a nota de esforço', async () => {
    const modelo = criarModeloRoteirizado({ passos: [direcao] });
    const amb = ambienteDeTeste(modelo);
    await prepararTarefa(amb, { tipo: 'briefing', briefing: { formatos: [feed], textos: { titulo: 'Jazz na Praça' } }, esforco: 'CONCEPTUAL' });
    const t = texto(modelo);
    expect(t).toMatch(/<material-[0-9a-z]{8} origem="briefing">/);
    expect(t).toContain('Jazz na Praça');
    expect(t).toContain('IBM Plex Sans');
    expect(t).toContain('CONCEPTUAL (6 de 7)');
    expect(modelo.pedidos[0]?.raciocinio).toBe('alto');
    expect(modelo.pedidos[0]?.ferramentas).toEqual([]);
  });

  it('direção inválida duas vezes: sem direção, e o "pode" pergunta se segue só com o briefing', async () => {
    const modelo = criarModeloRoteirizado({ passos: [{ texto: 'não sei' }, { texto: '{"conceito":"x"}' }] });
    const amb = ambienteDeTeste(modelo);
    const p = await prepararTarefa(amb, { tipo: 'briefing', briefing: { formatos: [feed] } });
    expect(p.direcao).toBeNull();
    expect(p.cartao).toBeNull();
    expect(p.pedeConfirmacao).toBe(true);
    expect(p.motivos).toEqual(['sem_direcao']);
    expect(texto(modelo, 1)).toContain('não passou na validação');
  });

  it('falha de rede na direção não vira "sem direção": a tarefa falha com o código', async () => {
    const amb = ambienteDeTeste(criarModeloRoteirizado({ passos: [{ erro: 'rede' }] }));
    await expect(prepararTarefa(amb, { tipo: 'briefing', briefing: { formatos: [feed] } })).rejects.toMatchObject({ codigo: 'rede' });
  });

  it('criação por pedido livre: direção, uma prancheta, sem espera', async () => {
    const modelo = criarModeloRoteirizado({ passos: [direcao] });
    const p = await prepararTarefa(ambienteDeTeste(modelo), { tipo: 'criar', pedido: 'story da Crové com o título "Chegou o verão"' });
    expect(p.plano.criar).toHaveLength(1);
    expect(p.pedeConfirmacao).toBe(false);
    expect(texto(modelo)).toMatch(/<material-[0-9a-z]{8} origem="pedido">\nstory da Crové/);
  });

  it('pedido sobre a peça: o plano vem do modelo, com ids, e remoção pede o "pode"', async () => {
    const doc = pecaDoDesigner();
    const modelo = criarModeloRoteirizado({
      passos: [
        {
          papel: 'planejador',
          texto: JSON.stringify({
            resumo: 'Adapto para banner e tiro o selo do Feed.',
            criar: [{ nome: 'Banner', largura: 1200, altura: 628 }],
            alterar: [{ prancheta: 'Feed', oQue: 'sem o selo' }],
            remover: [{ alvo: 'Feed/Selo', motivo: 'pedido' }],
          }),
        },
      ],
    });
    const amb = ambienteDeTeste(modelo, doc);
    const p = await prepararTarefa(amb, { tipo: 'pedido', pedido: 'adapta para banner e tira o selo', selecao: [idDe(doc, 'Feed/Selo')] });
    expect(p.direcao).toBeNull();
    expect(p.motivos).toEqual(['varias_pranchetas', 'remocao']);
    expect(p.plano.remover[0]).toMatchObject({ alvo: idDe(doc, 'Feed/Selo'), tipo: 'camada' });
    expect(p.plano.resumo).toBe('Adapto para banner e tiro o selo do Feed.');
    const t = texto(modelo);
    expect(t).toMatch(/origem="documento"/);
    expect(t).toContain('"Feed/Selo"');
    expect(amb.eventos.map((e) => e.tipo)).toEqual(['etapa', 'etapa', 'plano', 'etapas']);
  });

  it('pedido que o Otto diz que não consegue: fica registrado e não pede "pode"', async () => {
    const modelo = criarModeloRoteirizado({ passos: [{ papel: 'planejador', texto: '{"naoConsigo":"Este editor não gera vídeo."}' }] });
    const p = await prepararTarefa(ambienteDeTeste(modelo, pecaDoDesigner()), { tipo: 'pedido', pedido: 'faz um vídeo' });
    expect(p.naoConsigo).toBe('Este editor não gera vídeo.');
    expect(p.pedeConfirmacao).toBe(false);
  });

  it('plano inválido duas vezes: falha com código, sem plano inventado', async () => {
    const modelo = criarModeloRoteirizado({ passos: [{ texto: 'vou fazer' }, { texto: '{"alterar":[{"prancheta":"Não existe"}]}' }] });
    await expect(prepararTarefa(ambienteDeTeste(modelo, pecaDoDesigner()), { tipo: 'pedido', pedido: 'x' })).rejects.toMatchObject({ codigo: 'resposta_invalida' });
  });

  it('ajuste pontual: nenhuma chamada ao modelo, sem direção, sem espera', async () => {
    const modelo = criarModeloRoteirizado({ passos: [] });
    const amb = ambienteDeTeste(modelo, pecaDoDesigner());
    const p = await prepararTarefa(amb, { tipo: 'ajuste', pedido: 'título em azul' });
    expect(modelo.pedidos).toEqual([]);
    expect(p.plano.pontual).toBe(true);
    expect(p.pedeConfirmacao).toBe(false);
    expect(p.custo.chamadas).toBe(0);
  });

  it('entrada inválida é recusada antes de qualquer chamada', async () => {
    const modelo = criarModeloRoteirizado({ passos: [] });
    await expect(prepararTarefa(ambienteDeTeste(modelo), { tipo: 'pedido', pedido: '   ' } as EntradaDaTarefa)).rejects.toThrow();
    await expect(prepararTarefa(ambienteDeTeste(modelo), { tipo: 'briefing', briefing: { formatos: [] } } as EntradaDaTarefa)).rejects.toThrow();
    expect(modelo.pedidos).toEqual([]);
  });
});

describe('"ajustar a direção"', () => {
  it('refaz a direção com a anterior e o pedido do designer, e soma o custo', async () => {
    const modelo = criarModeloRoteirizado({ passos: [direcao, { papel: 'diretor', texto: JSON.stringify({ ...DIRECAO_VALIDA, conceito: 'Agora com o fundo escuro e o título em latão.' }) }] });
    const amb = ambienteDeTeste(modelo);
    const entrada: EntradaDaTarefa = { tipo: 'briefing', briefing: { formatos: [feed, story] } };
    const primeiro = await prepararTarefa(amb, entrada);
    const segundo = await prepararTarefa(amb, entrada, { ajuste: { anterior: primeiro, texto: 'fundo escuro, por favor' } });
    expect(segundo.direcao?.conceito).toBe('Agora com o fundo escuro e o título em latão.');
    expect(segundo.custo.chamadas).toBe(2);
    const t = texto(modelo, 1);
    expect(t).toContain(DIRECAO_VALIDA.assinatura);
    expect(t).toMatch(/<material-[0-9a-z]{8} origem="ajuste-do-designer">\nfundo escuro, por favor/);
  });
});
