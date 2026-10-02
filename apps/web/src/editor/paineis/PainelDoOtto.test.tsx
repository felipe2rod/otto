// @vitest-environment jsdom
// O painel do Otto, com um controle de mentira: pedir, a espera, o "pode", a revisão e o resultado.
import type { LimitesDeTarefa, Tarefa } from '@otto/shared';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { erros } from '../../textos/erros';
import { duracao, otto as textos } from '../../textos/otto';
import { criarArmazem } from '../nucleo/armazem';
import type { ControleDoOtto, EstadoDoOtto } from '../nucleo/controleDoOtto';
import { novaTarefaNaTela, receberEvento } from '../nucleo/tarefaDoOtto';
import { ambienteDeTeste, documentoDeTeste } from './apoioDeTeste';
import { type EstadoDoAviso, fraseDaPendencia, PainelDoOtto } from './PainelDoOtto';

afterEach(cleanup);

const forma = (nome: string) => ({ tipo: 'forma', nome, forma: 'retangulo', x: 0, y: 0, largura: 100, altura: 100, preenchimento: '#ff5b1f' });
const doc = () =>
  documentoDeTeste([
    { op: 'criarPrancheta', nome: 'Feed', largura: 1080, altura: 1350, fundo: '#ffffff' },
    { op: 'criarPrancheta', nome: 'Story', largura: 1080, altura: 1920, fundo: '#ffffff' },
    { op: 'criarNo', prancheta: 'Feed', no: forma('Título') },
    { op: 'criarNo', prancheta: 'Feed', no: forma('Selo') },
  ]);

const AGORA = Date.parse('2026-10-02T12:08:00.000Z');
const tarefa = (extra: Partial<Tarefa> = {}): Tarefa => ({
  id: '0199a000-0000-7000-8000-0000000000a1',
  documentoId: '0199a000-0000-7000-8000-000000000001',
  tipo: 'criar',
  estado: 'rodando',
  entrada: { tipo: 'criar', pedido: 'cartaz do novo horário' },
  etapas: [{ etapa: 'leitura' }, { etapa: 'producao', prancheta: { nome: 'Feed' } }, { etapa: 'conferencia' }, { etapa: 'entrega' }],
  etapa: { etapa: 'producao', prancheta: { nome: 'Feed' } },
  versaoInicial: 0,
  lotes: 0,
  tocados: [],
  pendencias: [],
  ultimoEvento: -1,
  criadaEm: '2026-10-02T11:59:00.000Z',
  iniciadaEm: '2026-10-02T12:00:00.000Z',
  ...extra,
});
const LIMITES: LimitesDeTarefa = { podeEnviar: true, tarefasHoje: 4, tarefasPorDia: 30, naFila: 0, naFilaNoMaximo: 3 };

function montar(opcoes: { documento?: ReturnType<typeof doc> | 'vazio'; estado?: Partial<EstadoDoOtto>; aviso?: EstadoDoAviso } = {}) {
  const documento = opcoes.documento === 'vazio' ? documentoDeTeste([]) : (opcoes.documento ?? doc());
  const a = ambienteDeTeste(documento);
  const armazem = criarArmazem<EstadoDoOtto>({ pendencias: [], ocupado: false, semAoVivo: false, limites: LIMITES, ...opcoes.estado });
  const otto = {
    armazem,
    iniciar: vi.fn(async () => undefined),
    pedir: vi.fn(async () => true),
    aprovar: vi.fn(async () => undefined),
    ajustar: vi.fn(async () => undefined),
    cancelar: vi.fn(async () => undefined),
    aceitar: vi.fn(async () => true),
    desfazer: vi.fn(async () => undefined),
    descartar: vi.fn(async () => undefined),
    tentarDeNovo: vi.fn(async () => undefined),
    dispensarPendencia: vi.fn(async () => undefined),
    dispensarRecusa: vi.fn(),
    fecharResultado: vi.fn(),
    parar: vi.fn(),
  } satisfies ControleDoOtto;
  const aoVerOAntes = vi.fn();
  const pedirAviso = vi.fn();
  render(<PainelDoOtto otto={otto} aoVerOAntes={aoVerOAntes} aviso={{ estado: criarArmazem<EstadoDoAviso>(opcoes.aviso ?? 'a-pedir'), pedir: pedirAviso }} agora={() => AGORA} />, {
    wrapper: a.Moldura,
  });
  const feed = documento.pranchetas[0];
  return { ...a, otto, armazem, aoVerOAntes, pedirAviso, feed, story: documento.pranchetas[1], id: (nome: string) => feed?.filhos.find((n) => n.nome === nome)?.id ?? '' };
}
const campoDoPedido = () => screen.getByRole('textbox', { name: textos.pedir.campo });
const botaoDePedir = () => screen.getByRole('button', { name: textos.pedir.enviar });

describe('painel do Otto: pedir', () => {
  it('sem texto não envia; com texto, manda o ajuste rápido (o padrão) e limpa o campo', async () => {
    const { otto } = montar();
    expect(botaoDePedir()).toHaveProperty('disabled', true);
    fireEvent.change(campoDoPedido(), { target: { value: '  título em azul  ' } });
    await act(async () => fireEvent.click(botaoDePedir()));
    expect(otto.pedir).toHaveBeenCalledWith({ tipo: 'ajuste', pedido: 'título em azul' });
    expect((campoDoPedido() as HTMLTextAreaElement).value).toBe('');
  });

  it('"pedido maior" manda o tipo pedido; Ctrl+Enter envia', async () => {
    const { otto } = montar();
    fireEvent.click(screen.getByRole('radio', { name: textos.pedir.tipos.pedido }));
    expect(screen.getByText(textos.pedir.oQueE.pedido)).toBeDefined();
    fireEvent.change(campoDoPedido(), { target: { value: 'adapta para banner' } });
    await act(async () => fireEvent.keyDown(campoDoPedido(), { key: 'Enter', ctrlKey: true }));
    expect(otto.pedir).toHaveBeenCalledWith({ tipo: 'pedido', pedido: 'adapta para banner' });
  });

  it('a camada selecionada vai como dado do pedido ("sobre: Título"), e dá para tirar', async () => {
    const { otto, iface, id } = montar();
    act(() => iface.selecionar({ tipo: 'camadas', ids: [id('Título')] }));
    expect(screen.getByText(textos.pedir.sobre(['Título']))).toBeDefined();
    fireEvent.change(campoDoPedido(), { target: { value: 'em azul' } });
    await act(async () => fireEvent.click(botaoDePedir()));
    expect(otto.pedir).toHaveBeenLastCalledWith({ tipo: 'ajuste', pedido: 'em azul', selecao: [id('Título')] });

    fireEvent.click(screen.getByRole('button', { name: textos.pedir.tirarSelecao }));
    fireEvent.change(campoDoPedido(), { target: { value: 'maior' } });
    await act(async () => fireEvent.click(botaoDePedir()));
    expect(otto.pedir).toHaveBeenLastCalledWith({ tipo: 'ajuste', pedido: 'maior' });
  });

  it('peça vazia: não há escolha de tamanho, e o pedido cria a peça', async () => {
    const { otto } = montar({ documento: 'vazio' });
    expect(screen.queryByRole('radio')).toBeNull();
    expect(screen.getByText(textos.pedir.oQueE.criar)).toBeDefined();
    fireEvent.change(campoDoPedido(), { target: { value: 'cartaz do novo horário' } });
    await act(async () => fireEvent.click(botaoDePedir()));
    expect(otto.pedir).toHaveBeenCalledWith({ tipo: 'criar', pedido: 'cartaz do novo horário' });
  });

  it('mostra quantas tarefas a conta pediu hoje; sem limite, diz o motivo em tarefas e não deixa enviar', () => {
    montar();
    expect(screen.getByText(textos.pedir.tarefasHoje(4, 30))).toBeDefined();
    cleanup();

    montar({ estado: { limites: { ...LIMITES, podeEnviar: false, motivo: 'fila_cheia', naFila: 3 } } });
    fireEvent.change(campoDoPedido(), { target: { value: 'x' } });
    expect(screen.getByRole('alert').textContent).toBe(textos.pedir.semLimite.fila_cheia(3));
    expect(botaoDePedir()).toHaveProperty('disabled', true);
  });

  it('pedido recusado: a frase vem do código, e dá para fechar', () => {
    const { otto } = montar({ estado: { recusa: { codigo: 'tarefa_em_andamento' } } });
    expect(screen.getByRole('alert').textContent).toContain(erros.doCodigo('tarefa_em_andamento'));
    fireEvent.click(within(screen.getByRole('alert')).getByRole('button', { name: textos.resultado.fechar }));
    expect(otto.dispensarRecusa).toHaveBeenCalled();
  });
});

describe('painel do Otto: a espera', () => {
  const rodando = (extra: Partial<Tarefa> = {}) => ({ atual: novaTarefaNaTela(tarefa(extra)) });

  it('mostra o estado, o tempo decorrido e as etapas com nome, cada uma com a situação dela', () => {
    montar({ estado: rodando() });
    expect(screen.getByRole('status').textContent).toBe(`${textos.estados.rodando} · ${textos.espera.ha(duracao(8 * 60_000))}`);

    const etapas = within(screen.getByRole('list', { name: textos.espera.etapas })).getAllByRole('listitem');
    expect(etapas.map((e) => e.getAttribute('data-situacao'))).toEqual(['feita', 'atual', 'por-vir', 'por-vir']);
    expect(etapas[1]?.textContent).toContain(textos.espera.etapa.producao('Feed'));
    expect(etapas[1]?.getAttribute('aria-current')).toBe('step');
    expect(screen.getByText('cartaz do novo horário')).toBeDefined();
  });

  it('não há barra de porcentagem: o ciclo não é previsível', () => {
    montar({ estado: rodando() });
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(document.body.textContent).not.toMatch(/\d\s?%/);
  });

  it('o passo a passo fica fechado, com a contagem; a fala do Otto vai como veio', () => {
    let atual = novaTarefaNaTela(tarefa());
    atual = receberEvento(atual, 0, { tipo: 'mensagem', texto: 'Monto o Feed.' });
    atual = receberEvento(atual, 1, { tipo: 'lote', loteId: 'l', descricao: 'Feed: bloco e título', tocados: [], operacoes: [] });
    atual = receberEvento(atual, 2, { tipo: 'verificacao', avisos: [], novos: 0 });
    montar({ estado: { atual } });
    const registro = screen.getByText(textos.espera.registro(3)).closest('details');
    expect(registro?.open).toBe(false);
    expect(registro?.textContent).toContain('Monto o Feed.');
    expect(registro?.textContent).toContain(textos.espera.linha.lote('Feed: bloco e título'));
    expect(registro?.textContent).toContain(textos.espera.linha.verificacaoLimpa);
  });

  it('o que o Otto acabou de dizer aparece na espera, sem abrir o passo a passo; a fala seguinte toma o lugar', () => {
    let atual = novaTarefaNaTela(tarefa());
    atual = receberEvento(atual, 0, { tipo: 'mensagem', texto: 'Monto o Feed.' });
    atual = receberEvento(atual, 1, { tipo: 'lote', loteId: 'l', descricao: 'Feed: bloco e título', tocados: [], operacoes: [] });
    const { otto } = montar({ estado: { atual } });
    const fala = () => document.querySelector('[data-ultima-fala]');
    expect(fala()?.textContent).toBe('Monto o Feed.');
    expect(fala()?.closest('details')).toBeNull();

    atual = receberEvento(atual, 2, { tipo: 'mensagem', texto: 'Agora o Story.' });
    act(() => otto.armazem.definir((e) => ({ ...e, atual })));
    expect(fala()?.textContent).toBe('Agora o Story.');
  });

  it('antes de o Otto dizer qualquer coisa, a espera não mostra fala nenhuma', () => {
    montar({ estado: { atual: novaTarefaNaTela(tarefa()) } });
    expect(document.querySelector('[data-ultima-fala]')).toBeNull();
  });

  it('interromper chama o cancelar; na fila, o botão diz cancelar e a tela diz que está na fila', () => {
    const { otto } = montar({ estado: rodando() });
    fireEvent.click(screen.getByRole('button', { name: textos.espera.interromper }));
    expect(otto.cancelar).toHaveBeenCalled();
    cleanup();

    montar({ estado: rodando({ estado: 'na_fila', etapas: [] }) });
    expect(screen.getByText(textos.espera.naFila)).toBeDefined();
    expect(screen.getByRole('button', { name: textos.espera.cancelar })).toBeDefined();
    expect(screen.getByRole('status').textContent).toBe(textos.estados.na_fila);
  });

  it('diz que pode fechar a aba, e pede a permissão de avisar aqui, em contexto', () => {
    const { pedirAviso } = montar({ estado: rodando() });
    expect(screen.getByText(textos.espera.podeFechar)).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: textos.espera.avisar }));
    expect(pedirAviso).toHaveBeenCalled();
    cleanup();

    montar({ estado: rodando(), aviso: 'ligado' });
    expect(screen.queryByRole('button', { name: textos.espera.avisar })).toBeNull();
    expect(screen.getByText(textos.espera.avisoLigado)).toBeDefined();
  });

  it('fluxo caído: avisa que segue com o último estado conhecido, sem tratar como erro da tarefa', () => {
    montar({ estado: { ...rodando(), semAoVivo: true } });
    expect(screen.getByText(textos.espera.semAoVivo)).toBeDefined();
    expect(screen.getByRole('list', { name: textos.espera.etapas })).toBeDefined();
  });
});

describe('painel do Otto: o "pode"', () => {
  const cartao = {
    conceito: 'A hora de abrir como letreiro.',
    assinatura: 'Um disco mostarda no canto.',
    paleta: [
      { papel: 'dominante' as const, cor: '#0F3B2C' },
      { papel: 'acento' as const, cor: '#F4C430' },
    ],
    tipografia: { titulo: 'DM Serif Display', texto: 'IBM Plex Sans' },
    imagem: 'sem imagem',
  };
  const plano = {
    resumo: '',
    criar: [
      { nome: 'Feed', largura: 1080, altura: 1350 },
      { nome: 'Story', largura: 1080, altura: 1920 },
    ],
    alterar: [],
    remover: [],
    pontual: false,
  };
  const noPode = (extra: Partial<NonNullable<Tarefa['confirmacao']>> = {}) => ({
    atual: novaTarefaNaTela(tarefa({ estado: 'aguardando_confirmacao', confirmacao: { cartao, plano, motivos: ['varias_pranchetas'], ...extra } })),
  });

  it('mostra a direção em campos curtos, o que vai criar e por que pediu o "pode"', () => {
    montar({ estado: noPode() });
    expect(screen.getByText(textos.pode.pergunta)).toBeDefined();
    expect(screen.getByText('A hora de abrir como letreiro.')).toBeDefined();
    expect(screen.getByText(textos.pode.fontes('DM Serif Display', 'IBM Plex Sans'))).toBeDefined();
    expect(screen.getByText(`${textos.pode.formato('Feed', 1080, 1350)} · ${textos.pode.formato('Story', 1080, 1920)}`)).toBeDefined();
    expect(screen.getByText(textos.pode.motivos.varias_pranchetas as string)).toBeDefined();
    expect(screen.getByRole('status').textContent).toBe(textos.estados.aguardando_confirmacao);
  });

  it('o que será removido tem linha própria, nunca misturado', () => {
    montar({ estado: noPode({ cartao: null, plano: { ...plano, criar: [], remover: [{ alvo: 'n1', nome: 'Selo', prancheta: 'Feed', tipo: 'camada', motivo: 'duplicado' }] }, motivos: ['remocao'] }) });
    expect(screen.getByText(textos.pode.perguntaSemDirecao)).toBeDefined();
    expect(screen.getByText(textos.pode.vouRemover).parentElement?.textContent).toContain(textos.pode.remover('Selo', 'Feed', 'duplicado'));
  });

  it('Pode aprova; cancelar cancela', () => {
    const { otto } = montar({ estado: noPode() });
    fireEvent.click(screen.getByRole('button', { name: textos.pode.aprovar }));
    expect(otto.aprovar).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: textos.pode.cancelar }));
    expect(otto.cancelar).toHaveBeenCalled();
  });

  it('ajustar a direção abre o campo "o que muda?" e manda o texto', () => {
    const { otto } = montar({ estado: noPode() });
    fireEvent.click(screen.getByRole('button', { name: textos.pode.ajustar }));
    const campo = screen.getByRole('textbox', { name: textos.pode.oQueMuda });
    expect(screen.getByRole('button', { name: textos.pode.mandarAjuste })).toHaveProperty('disabled', true);
    fireEvent.change(campo, { target: { value: 'paleta mais quente' } });
    fireEvent.click(screen.getByRole('button', { name: textos.pode.mandarAjuste }));
    expect(otto.ajustar).toHaveBeenCalledWith('paleta mais quente');
  });

  it('direção que não saiu: pergunta se pode seguir só com o pedido', () => {
    montar({ estado: noPode({ cartao: null, motivos: ['sem_direcao'] }) });
    expect(screen.getByText(textos.pode.semDirecao)).toBeDefined();
  });
});

describe('painel do Otto: revisão', () => {
  const emRevisao = (extra: Partial<Tarefa> = {}) => ({
    atual: novaTarefaNaTela(tarefa({ estado: 'em_revisao', fim: 'entregue', lotes: 5, conferida: true, resumo: 'Feed e Story prontos.', duracaoMs: 21 * 60_000, ...extra })),
  });

  it('mostra o resumo do Otto, quanto levou e, sem pendência, diz que não há (zero também é informação)', () => {
    montar({ estado: emRevisao() });
    expect(screen.getByText('Feed e Story prontos.')).toBeDefined();
    expect(screen.getByText(new RegExp(textos.revisao.levou(duracao(21 * 60_000))))).toBeDefined();
    expect(screen.getByText(textos.revisao.semPendencia)).toBeDefined();
    expect(screen.getByRole('status').textContent).toBe(textos.estados.em_revisao);
  });

  it('pendências vêm antes dos botões; a do sistema usa a frase da tela, a do Otto vai com a fala dele, e "ver" seleciona as camadas', () => {
    const base = montar();
    const titulo = base.id('Título');
    cleanup();
    const pendencias: Tarefa['pendencias'] = [
      { tipo: 'outro', texto: 'O rodapé está no mínimo legível.', camadas: [titulo], origem: 'otto' },
      { tipo: 'sem_conferencia', texto: 'TEXTO PROVISÓRIO DO SISTEMA', camadas: [], prancheta: 'Story', origem: 'sistema' },
      { tipo: 'aviso_da_verificacao', texto: 'TEXTO PROVISÓRIO DA VERIFICAÇÃO', camadas: [titulo], origem: 'verificacao', regra: 'texto-transbordando' },
    ];
    const { iface, id } = montar({ estado: emRevisao({ pendencias, tocados: [titulo] }) });
    expect(id('Título')).toBe(titulo);

    const secao = screen.getByRole('region', { name: textos.revisao.pendencias(3) });
    expect(within(secao).getByText('O rodapé está no mínimo legível.')).toBeDefined();
    expect(within(secao).getByText((textos.pendencia.doTipo.sem_conferencia as (p: string | undefined) => string)('Story'))).toBeDefined();
    expect(within(secao).getByText(textos.pendencia.daVerificacao(textos.pendencia.daRegra['texto-transbordando'] as string, 'Título'))).toBeDefined();
    expect(document.body.textContent).not.toContain('TEXTO PROVISÓRIO');
    // antes dos botões
    expect(secao.compareDocumentPosition(screen.getByRole('button', { name: textos.revisao.aceitar })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    fireEvent.click(within(secao).getAllByRole('button', { name: new RegExp(`^${textos.revisao.verPendencia('').slice(0, 10)}`) })[0] as HTMLElement);
    expect(iface.armazem.obter().selecao).toEqual({ tipo: 'camadas', ids: [titulo] });
  });

  it('aceitar e desfazer tudo chamam o controle; ocupado desliga os dois', () => {
    const { otto, armazem } = montar({ estado: emRevisao() });
    fireEvent.click(screen.getByRole('button', { name: textos.revisao.aceitar }));
    fireEvent.click(screen.getByRole('button', { name: textos.revisao.desfazer }));
    expect(otto.aceitar).toHaveBeenCalled();
    expect(otto.desfazer).toHaveBeenCalled();
    act(() => armazem.definir((e) => ({ ...e, ocupado: true })));
    expect(screen.getByRole('button', { name: textos.revisao.aceitar })).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: textos.revisao.desfazer })).toHaveProperty('disabled', true);
  });

  it('prancheta que a tarefa criou: "ver" a seleciona; descartar pede confirmação e leva só ela', () => {
    const base = montar();
    const story = base.story?.id ?? '';
    cleanup();
    const { otto, iface } = montar({ estado: emRevisao({ pranchetasNovas: [story] }) });
    fireEvent.click(screen.getByRole('button', { name: textos.revisao.verPrancheta('Story') }));
    expect(iface.armazem.obter().selecao).toEqual({ tipo: 'prancheta', id: story });

    fireEvent.click(screen.getByRole('button', { name: textos.revisao.descartarPrancheta('Story') }));
    expect(otto.descartar).not.toHaveBeenCalled();
    expect(screen.getByText(textos.revisao.confirmarDescarte('Story'))).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: textos.revisao.descartar }));
    expect(otto.descartar).toHaveBeenCalledWith(story);
  });

  it('segurar mostra o antes; soltar, sair de cima ou perder o foco volta. Pelo teclado, segurar Espaço', () => {
    const { aoVerOAntes } = montar({ estado: emRevisao() });
    const botao = screen.getByRole('button', { name: textos.revisao.verOAntes });
    fireEvent.pointerDown(botao);
    expect(aoVerOAntes).toHaveBeenLastCalledWith(true);
    fireEvent.pointerUp(botao);
    expect(aoVerOAntes).toHaveBeenLastCalledWith(false);

    fireEvent.keyDown(botao, { key: ' ' });
    expect(aoVerOAntes).toHaveBeenLastCalledWith(true);
    fireEvent.keyUp(botao, { key: ' ' });
    expect(aoVerOAntes).toHaveBeenLastCalledWith(false);
    fireEvent.pointerDown(botao);
    fireEvent.blur(botao);
    expect(aoVerOAntes).toHaveBeenLastCalledWith(false);
  });

  it('"aceitar e pedir ajuste" aceita e abre a tarefa de ajuste por cima', async () => {
    const { otto } = montar({ estado: emRevisao() });
    fireEvent.change(screen.getByRole('textbox', { name: textos.revisao.quaseLa }), { target: { value: 'título maior' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: textos.revisao.aceitarEAjustar })));
    expect(otto.aceitar).toHaveBeenCalled();
    expect(otto.pedir).toHaveBeenCalledWith({ tipo: 'ajuste', pedido: 'título maior' });
  });

  it('tarefa que não terminou: diz o que aconteceu em uma frase, guarda o que foi feito e oferece tentar de novo, avisando que recomeça', () => {
    const { otto } = montar({ estado: emRevisao({ fim: 'interrompida', conferida: false, resumo: 'TEXTO DO SISTEMA', lotes: 2 }) });
    expect(screen.getByText(textos.revisao.naoTerminou.interrompida as string)).toBeDefined();
    expect(screen.getByRole('status').textContent).toBe(textos.estados.naoTerminou);
    expect(document.body.textContent).not.toContain('TEXTO DO SISTEMA');
    expect(screen.getByText(textos.revisao.avisoDeTentarDeNovo)).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: textos.revisao.tentarDeNovo }));
    expect(otto.tentarDeNovo).toHaveBeenCalled();
    // continua dando para ficar com o que foi feito, ou desfazer
    expect(screen.getByRole('button', { name: textos.revisao.aceitar })).toBeDefined();
    expect(screen.getByRole('button', { name: textos.revisao.desfazer })).toBeDefined();
  });
});

describe('painel do Otto: depois que a tarefa terminou', () => {
  it('ajuste que não cabia: "não alterei nada", com o motivo, e o campo de pedir de volta', () => {
    const atual = novaTarefaNaTela(
      tarefa({ tipo: 'ajuste', estado: 'aceita', fim: 'entregue', lotes: 0, pendencias: [{ tipo: 'fora_do_ajuste', texto: 'PROVISÓRIO', camadas: [], origem: 'sistema' }] }),
    );
    montar({ estado: { atual } });
    expect(screen.getByText(textos.resultado.semAlteracao)).toBeDefined();
    expect(screen.getByText(textos.pendencia.doTipo.fora_do_ajuste as string)).toBeDefined();
    expect(screen.queryByRole('button', { name: textos.resultado.voltarParaAntes })).toBeNull();
    expect(campoDoPedido()).toBeDefined();
  });

  it('tarefa aceita: dá para voltar para antes dela; com edições depois, a tela diz quantas vão junto e pergunta', () => {
    const atual = novaTarefaNaTela(tarefa({ estado: 'aceita', fim: 'entregue', lotes: 5 }));
    const { otto, armazem } = montar({ estado: { atual } });
    fireEvent.click(screen.getByRole('button', { name: textos.resultado.voltarParaAntes }));
    expect(otto.desfazer).toHaveBeenCalledWith();

    act(() => armazem.definir((e) => ({ ...e, recusa: { codigo: 'editado_depois', detalhe: { edicoes: 3 } } })));
    expect(screen.getByRole('alert').textContent).toContain(textos.resultado.comEdicoesDepois(3));
    fireEvent.click(screen.getByRole('button', { name: textos.resultado.voltarMesmoAssim }));
    expect(otto.desfazer).toHaveBeenLastCalledWith(true);
  });

  it('falhou antes de alterar qualquer coisa: diz que nada mudou e oferece tentar de novo', () => {
    const { otto } = montar({ estado: { atual: novaTarefaNaTela(tarefa({ estado: 'falhou', fim: 'erro', erro: { codigo: 'rede' } })) } });
    expect(screen.getByText(textos.resultado.falhou.padrao as string)).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: textos.resultado.tentarDeNovo }));
    expect(otto.tentarDeNovo).toHaveBeenCalled();
  });

  it('as pendências da peça continuam depois do aceite, com "dispensar"', () => {
    const pendencia = {
      id: 'p1',
      tarefaId: 't',
      tipo: 'outro',
      texto: 'Rodapé no mínimo legível.',
      camadas: [],
      origem: 'otto' as const,
      estado: 'aberta' as const,
      criadaEm: '2026-10-02T12:00:00.000Z',
    };
    const { otto } = montar({ estado: { pendencias: [pendencia] } });
    const secao = screen.getByRole('region', { name: textos.pendencia.titulo(1) });
    fireEvent.click(within(secao).getByRole('button', { name: textos.revisao.dispensarPendencia('Rodapé no mínimo legível.') }));
    expect(otto.dispensarPendencia).toHaveBeenCalledWith('p1');
  });
});

describe('frase da pendência', () => {
  it('regra desconhecida da verificação e tipo desconhecido caem em frase genérica, nunca no texto provisório', () => {
    expect(fraseDaPendencia({ tipo: 'aviso_da_verificacao', texto: 'PROVISÓRIO', camadas: [], origem: 'verificacao', regra: 'regra-nova' }, [])).toBe(
      textos.pendencia.daVerificacao(textos.pendencia.regraSemNome, undefined),
    );
    expect(fraseDaPendencia({ tipo: 'tipo_novo', texto: 'PROVISÓRIO', camadas: [], origem: 'sistema' }, [])).toBe(textos.pendencia.doTipo.outro);
  });
});
