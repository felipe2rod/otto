import { describe, expect, it } from 'vitest';
import { comGravacao, criarModeloRoteirizado, idsDoRoteiro, variaveisDoPedido } from './modelo-roteirizado';
import { ErroDoModelo, type PedidoAoModelo } from './portas';

const pedido = (papel: PedidoAoModelo['papel'] = 'agente', sinal?: AbortSignal): PedidoAoModelo => ({
  papel,
  sistema: ['s'],
  mensagens: [{ papel: 'usuario', partes: [{ tipo: 'texto', texto: 'oi' }] }],
  ferramentas: [],
  raciocinio: 'medio',
  ...(sinal ? { sinal } : {}),
});

describe('modelo roteirizado', () => {
  it('responde os passos na ordem, com id em cada chamada de ferramenta', async () => {
    const m = criarModeloRoteirizado({ passos: [{ texto: 'vou fazer' }, { chamadas: [{ nome: 'verificar', argumentos: {} }] }] });
    expect(await m.responder(pedido())).toMatchObject({ texto: 'vou fazer', chamadas: [], parada: 'fim' });
    const r = await m.responder(pedido());
    expect(r.parada).toBe('ferramentas');
    expect(r.chamadas).toEqual([{ id: 'chamada-2-1', nome: 'verificar', argumentos: {} }]);
    expect(m.restantes()).toBe(0);
  });

  it('guarda o que recebeu, para o teste conferir o que o modelo viu', async () => {
    const m = criarModeloRoteirizado({ passos: [{ texto: 'a' }] });
    await m.responder(pedido('diretor'));
    expect(m.pedidos).toHaveLength(1);
    expect(m.pedidos[0]?.papel).toBe('diretor');
  });

  it('passo pode ser função do pedido', async () => {
    const m = criarModeloRoteirizado({ passos: [(p) => ({ texto: `papel ${p.papel}` })] });
    expect((await m.responder(pedido('revisor'))).texto).toBe('papel revisor');
  });

  it('acusa roteiro fora de sincronia e roteiro que acabou, com código', async () => {
    const m = criarModeloRoteirizado({ passos: [{ papel: 'diretor', texto: '{}' }] });
    await expect(m.responder(pedido('agente'))).rejects.toMatchObject({ codigo: 'resposta_invalida' });
    await expect(m.responder(pedido('agente'))).rejects.toBeInstanceOf(ErroDoModelo);
  });

  it('falha roteirizada sai com o código pedido', async () => {
    const m = criarModeloRoteirizado({ passos: [{ erro: 'rede' }] });
    await expect(m.responder(pedido())).rejects.toMatchObject({ codigo: 'rede' });
  });

  it('com velocidade, espera o tempo da gravação; o cancelamento interrompe a espera', async () => {
    const esperas: number[] = [];
    const m = criarModeloRoteirizado({ passos: [{ texto: 'a', duracaoMs: 8000 }] }, { velocidade: 0.5, esperar: async (ms) => void esperas.push(ms) });
    await m.responder(pedido());
    expect(esperas).toEqual([4000]);

    const controle = new AbortController();
    const lento = criarModeloRoteirizado({ passos: [{ texto: 'a', duracaoMs: 60_000 }] }, { velocidade: 1 });
    const resposta = lento.responder(pedido('agente', controle.signal));
    controle.abort();
    await expect(resposta).rejects.toMatchObject({ codigo: 'cancelada' });
  });

  it('sem velocidade, não espera nada', async () => {
    const m = criarModeloRoteirizado({ passos: [{ texto: 'a', duracaoMs: 60_000 }] }, { esperar: async () => Promise.reject(new Error('não devia esperar')) });
    expect((await m.responder(pedido())).texto).toBe('a');
  });
});

describe('gravação de roteiro', () => {
  it('grava texto, chamadas, uso e duração de cada resposta, e o roteiro gravado reproduz as mesmas respostas', async () => {
    let t = 0;
    const original = criarModeloRoteirizado({
      passos: [{ texto: 'plano', uso: { entrada: 10, saida: 5 } }, { chamadas: [{ nome: 'entregar', argumentos: { resumo: 'fiz', pendencias: [] }, id: 'x1' }] }],
    });
    const g = comGravacao(original, () => (t += 1500));
    await g.modelo.responder(pedido('agente'));
    await g.modelo.responder(pedido('agente'));
    const passos = g.passos();
    expect(passos).toEqual([
      { papel: 'agente', texto: 'plano', uso: { entrada: 10, cacheLido: 0, cacheCriado: 0, saida: 5 }, duracaoMs: 1500 },
      { papel: 'agente', chamadas: [{ id: 'x1', nome: 'entregar', argumentos: { resumo: 'fiz', pendencias: [] } }], uso: { entrada: 0, cacheLido: 0, cacheCriado: 0, saida: 0 }, duracaoMs: 1500 },
    ]);
    const replay = criarModeloRoteirizado({ passos });
    expect((await replay.responder(pedido('agente'))).texto).toBe('plano');
    expect((await replay.responder(pedido('agente'))).chamadas[0]?.id).toBe('x1');
  });

  it('os ids da gravação voltam na mesma ordem', () => {
    const novoId = idsDoRoteiro({ ids: ['a', 'b'] });
    expect([novoId(), novoId()]).toEqual(['a', 'b']);
    expect(novoId()).toMatch(/^0199ffff-/);
  });
});

describe('roteiro que se adapta à peça', () => {
  const comDocumento = (conteudo: string, papel: PedidoAoModelo['papel'] = 'agente'): PedidoAoModelo => ({
    ...pedido(papel),
    mensagens: [
      {
        papel: 'usuario',
        partes: [
          {
            tipo: 'texto',
            texto: `Código do material desta tarefa: a1b2c3d4.\n<material-a1b2c3d4 origem="pedido">\nqualquer coisa\n</material-a1b2c3d4>\nO documento agora:\n<material-a1b2c3d4 origem="documento">\n${conteudo}\n</material-a1b2c3d4>`,
          },
        ],
      },
    ],
  });
  const resumo = JSON.stringify({
    tokens: {},
    pranchetas: [
      { id: 'p1', nome: 'Capa', camadasDeBaixoParaCima: [{ id: 'n1', nome: 'Fundo', tipo: 'forma' }] },
      {
        id: 'p2',
        nome: 'Post',
        camadasDeBaixoParaCima: [
          { id: 'n2', nome: 'Grupo', tipo: 'grupo', filhosDeBaixoParaCima: [{ id: 'n3', nome: 'Chamada "nova"', tipo: 'texto' }] },
          { id: 'n4', nome: 'Rodapé', tipo: 'texto' },
        ],
      },
      { id: 'p3', nome: 'Feed', camadasDeBaixoParaCima: [] },
    ],
  });

  it('lê do pedido as pranchetas da peça e a primeira camada de texto, mesmo dentro de grupo', () => {
    expect(variaveisDoPedido(comDocumento(resumo))).toEqual({ pranchetas: ['Capa', 'Post', 'Feed'], prancheta: 'Post', texto: 'Chamada "nova"' });
  });

  it('lê a lista de pranchetas que a tarefa de criação recebe, e peça vazia não tem nenhuma', () => {
    expect(variaveisDoPedido(comDocumento('Feed 1080×1350\nStory de verão 1080×1920'))).toEqual({ pranchetas: ['Feed', 'Story de verão'], prancheta: 'Feed' });
    expect(variaveisDoPedido(pedido())).toEqual({ pranchetas: [] });
  });

  it('troca as marcas do passo: a prancheta, o texto e um nome de prancheta que ainda não existe', async () => {
    const m = criarModeloRoteirizado({
      passos: [
        {
          texto: 'Mexo em {{prancheta}}/{{texto}}.',
          chamadas: [
            {
              nome: 'aplicarOperacoes',
              argumentos: {
                descricao: 'x',
                operacoes: [
                  { op: 'alterar', alvo: '{{prancheta}}/{{texto}}', props: { cor: '#1F5FBF' } },
                  { op: 'criarPrancheta', nome: '{{nova:Feed}}', largura: 1080, altura: 1350, fundo: '#ffffff' },
                  { op: 'criarPrancheta', nome: '{{nova:Banner}}', largura: 1200, altura: 628, fundo: '#ffffff' },
                ],
              },
            },
          ],
        },
      ],
    });
    const r = await m.responder(comDocumento(resumo));
    expect(r.texto).toBe('Mexo em Post/Chamada "nova".');
    const operacoes = r.chamadas[0]?.argumentos.operacoes as { alvo?: string; nome?: string }[];
    expect(operacoes.map((o) => o.alvo ?? o.nome)).toEqual(['Post/Chamada "nova"', 'Feed 2', 'Banner']);
  });

  it('o nome novo é o mesmo em todos os passos da tarefa, mesmo depois de a prancheta ter sido criada', async () => {
    const m = criarModeloRoteirizado({ passos: [{ texto: '{{nova:Feed}}' }, { texto: '{{nova:Feed}}' }] });
    const p = comDocumento('Feed 1080×1350\nFeed 2 1080×1350');
    expect([(await m.responder(p)).texto, (await m.responder(p)).texto]).toEqual(['Feed 3', 'Feed 3']);
  });

  it('roteiro que pede camada de texto numa peça sem texto falha com código, dizendo o que faltou', async () => {
    const m = criarModeloRoteirizado({ passos: [{ texto: '{{texto}}' }] });
    await expect(m.responder(comDocumento('Feed 1080×1350'))).rejects.toMatchObject({ codigo: 'resposta_invalida', message: expect.stringContaining('camada de texto') });
  });

  it('passo sem marca nenhuma sai como está', async () => {
    const m = criarModeloRoteirizado({ passos: [{ texto: 'chaves {soltas} e {{ desconhecida }}' }] });
    expect((await m.responder(pedido())).texto).toBe('chaves {soltas} e {{ desconhecida }}');
  });
});
