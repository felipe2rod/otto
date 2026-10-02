// O formulário de briefing como estado de tela, e as três formas em que ele sai: o pedido de tarefa,
// o briefing salvo (pela metade) e o rascunho local. Contrato: packages/shared/src/briefing.ts.
import { DadosDoBriefingSalvo, FormularioDeBriefing, type Marca, PedidoDeTarefaPorBriefing } from '@otto/shared';
import { describe, expect, it } from 'vitest';
import { alternarFormato, daTarefa, doRascunho, ESTADO_VAZIO, type EstadoDoBriefing, faltas, guardarRascunhoLocal, lerRascunhoLocal, paraOPedido, paraSalvar, podeMaisUmFormato } from './formulario';

const SHA = 'a'.repeat(64);
const SHB = 'b'.repeat(64);
const MARCA = '0199a000-0000-7000-8000-00000000000a';
const FEED = { nome: 'Feed', largura: 1080, altura: 1350 };
const STORY = { nome: 'Story', largura: 1080, altura: 1920 };
const preenchido: EstadoDoBriefing = { ...ESTADO_VAZIO, titulo: 'Abrimos às 7h', formatos: [FEED], fonteDasImagens: 'nenhuma' };

describe('o que falta para enviar', () => {
  it('vazio: falta o título, o formato e a foto (minhas imagens vem marcado)', () => {
    expect(ESTADO_VAZIO.fonteDasImagens).toBe('minhas');
    expect(faltas(ESTADO_VAZIO)).toEqual(['titulo', 'formato', 'imagem']);
  });

  it('título só com espaço não conta; com banco ou sem imagem, foto não falta', () => {
    expect(faltas({ ...preenchido, titulo: '   ' })).toEqual(['titulo']);
    expect(faltas({ ...preenchido, fonteDasImagens: 'banco' })).toEqual([]);
    expect(faltas({ ...preenchido, fonteDasImagens: 'minhas', imagens: [{ sha256: SHA }] })).toEqual([]);
  });

  it('formato próprio com nome repetido ou medida fora do limite é falta', () => {
    expect(faltas({ ...preenchido, formatos: [FEED, { nome: 'feed', largura: 500, altura: 500 }] })).toEqual(['formato_repetido']);
    expect(faltas({ ...preenchido, formatos: [{ nome: 'Faixa', largura: 8, altura: 500 }] })).toEqual(['formato_invalido']);
    expect(faltas({ ...preenchido, formatos: [{ nome: ' ', largura: 500, altura: 500 }] })).toEqual(['formato_invalido']);
  });
});

describe('formatos', () => {
  it('alterna o formato sugerido; o quarto não entra', () => {
    const um = alternarFormato(ESTADO_VAZIO, FEED);
    expect(um.formatos).toEqual([FEED]);
    expect(alternarFormato(um, FEED).formatos).toEqual([]);
    const tres = { ...ESTADO_VAZIO, formatos: [FEED, STORY, { nome: 'Banner', largura: 1200, altura: 628 }] };
    expect(podeMaisUmFormato(tres)).toBe(false);
    expect(alternarFormato(tres, { nome: 'Capa', largura: 1584, altura: 396 }).formatos).toHaveLength(3);
  });
});

describe('o pedido de tarefa', () => {
  it('o mínimo: versão, título, formatos e de onde vêm as imagens; campo vazio não vai', () => {
    const pedido = paraOPedido(preenchido);
    expect(pedido).toEqual({ tipo: 'briefing', cuidado: 'cuidadoso', briefing: { versao: 1, formatos: [FEED], textos: { titulo: 'Abrimos às 7h' }, imagens: { fonte: 'nenhuma' } } });
    expect(PedidoDeTarefaPorBriefing.safeParse(pedido).success).toBe(true);
  });

  it('tudo preenchido passa pelo esquema fechado do servidor, com os textos aparados', () => {
    const cheio: EstadoDoBriefing = {
      ...preenchido,
      nome: ' Novo horário ',
      marcaId: MARCA,
      subtitulo: 'Café coado na hora',
      chamada: 'Venha',
      rodape: '@cafe',
      formatos: [FEED, STORY],
      fonteDasImagens: 'minhas',
      imagens: [{ sha256: SHA, nome: 'a.jpg', largura: 800, altura: 600 }, { sha256: SHB }],
      objetivo: 'vender',
      publico: 'clientes do bairro',
      cuidado: 'autoral',
      estilo: ['sóbrio'],
      restricoes: 'sem foto de pessoa\n\n  nada de vermelho ',
      observacoes: 'manter o tom',
      briefingId: MARCA,
    };
    const pedido = paraOPedido(cheio);
    expect(PedidoDeTarefaPorBriefing.safeParse(pedido).success).toBe(true);
    expect(pedido).toMatchObject({ cuidado: 'autoral', briefingId: MARCA });
    expect(pedido.briefing).toMatchObject({
      nome: 'Novo horário',
      marcaId: MARCA,
      imagens: { fonte: 'minhas', arquivos: [SHA, SHB] },
      restricoes: ['sem foto de pessoa', 'nada de vermelho'],
      textos: { titulo: 'Abrimos às 7h', subtitulo: 'Café coado na hora', chamada: 'Venha', rodape: '@cafe' },
    });
  });

  it('banco de imagens: os termos vão como sugestão, só se houver', () => {
    expect(paraOPedido({ ...preenchido, fonteDasImagens: 'banco', termos: ' pão quente ' }).briefing.imagens).toEqual({ fonte: 'banco', termos: 'pão quente' });
    expect(paraOPedido({ ...preenchido, fonteDasImagens: 'banco' }).briefing.imagens).toEqual({ fonte: 'banco' });
  });

  it('sem marca e sem identidade avulsa, não vai identidade nenhuma: cor de exemplo nunca é mandada como se fosse da marca', () => {
    const { briefing } = paraOPedido(preenchido);
    expect(briefing).not.toHaveProperty('identidade');
    expect(briefing).not.toHaveProperty('marcaId');
    expect(briefing).not.toHaveProperty('logo');
  });
});

describe('briefing salvo', () => {
  it('guarda o formulário pela metade: sem título e sem formato ainda é um briefing salvo válido', () => {
    const dados = paraSalvar({ ...ESTADO_VAZIO, marcaId: MARCA, formatos: [FEED], cuidado: 'direto' });
    expect(dados).toEqual({ dados: { versao: 1, marcaId: MARCA, formatos: [FEED], imagens: { fonte: 'minhas', arquivos: [] } }, cuidado: 'direto' });
    expect(DadosDoBriefingSalvo.safeParse({ nome: 'Avisos', ...dados }).success).toBe(true);
  });

  it('abrir um briefing salvo preenche o que ele tem e deixa o resto vazio; o pedido leva o id dele', () => {
    const estado = doRascunho(
      { versao: 1, marcaId: MARCA, formatos: [FEED, STORY], textos: { rodape: '@cafe' }, imagens: { fonte: 'banco', termos: 'café' }, restricoes: ['a', 'b'] },
      { cuidado: 'autoral', briefingId: MARCA },
    );
    expect(estado).toMatchObject({
      marcaId: MARCA,
      formatos: [FEED, STORY],
      titulo: '',
      rodape: '@cafe',
      fonteDasImagens: 'banco',
      termos: 'café',
      restricoes: 'a\nb',
      cuidado: 'autoral',
      briefingId: MARCA,
    });
    expect(doRascunho({ versao: 1 })).toEqual(ESTADO_VAZIO);
  });

  it('ida e volta: salvar e abrir devolve o mesmo estado (as medidas das fotos são relidas depois)', () => {
    const estado: EstadoDoBriefing = {
      ...preenchido,
      fonteDasImagens: 'minhas',
      imagens: [{ sha256: SHA }],
      estilo: ['ousado'],
      objetivo: 'informar',
      publico: 'bairro',
      observacoes: 'x',
      nome: 'Peça',
    };
    const salvo = paraSalvar(estado);
    expect(doRascunho(salvo.dados, { cuidado: salvo.cuidado })).toEqual(estado);
  });
});

describe('nova peça com o briefing de uma tarefa', () => {
  const marca = { id: MARCA, nome: 'Café', rodape: '@cafe', restricoes: ['nunca foto de pessoa'], criadaEm: '2026-10-02T12:00:00.000Z', alteradaEm: '2026-10-02T12:00:00.000Z' } satisfies Marca;
  const daTarefaAceita = FormularioDeBriefing.parse({
    versao: 1,
    marcaId: MARCA,
    formatos: [FEED],
    textos: { titulo: 'Abrimos às 7h', rodape: '@cafe' },
    imagens: { fonte: 'nenhuma' },
    identidade: { cores: { primaria: '#0f3b2c' }, fonteDeTitulo: 'Anton' },
    logo: { arquivo: SHA },
    restricoes: ['nunca foto de pessoa', 'sem vermelho'],
  });

  it('a marca ainda existe: o que veio dela não é repetido no formulário (ela completa de novo, como está hoje)', () => {
    const estado = daTarefa({ briefing: daTarefaAceita, cuidado: 'direto' }, [marca]);
    expect(estado).toMatchObject({ marcaId: MARCA, avulsa: null, rodape: '', restricoes: 'sem vermelho', titulo: 'Abrimos às 7h', cuidado: 'direto', briefingId: null });
    expect(paraOPedido(estado).briefing).not.toHaveProperty('identidade');
  });

  it('a marca foi apagada: a identidade daquele dia continua no formulário, como identidade avulsa', () => {
    const estado = daTarefa({ briefing: daTarefaAceita, cuidado: 'cuidadoso' }, []);
    expect(estado.marcaId).toBeNull();
    expect(estado.avulsa).toEqual({ identidade: { cores: { primaria: '#0f3b2c' }, fonteDeTitulo: 'Anton' }, logo: { arquivo: SHA } });
    expect(estado.rodape).toBe('@cafe');
    const { briefing } = paraOPedido(estado);
    expect(briefing).toMatchObject({ identidade: { fonteDeTitulo: 'Anton' }, logo: { arquivo: SHA } });
    expect(FormularioDeBriefing.safeParse(briefing).success).toBe(true);
  });
});

describe('rascunho local', () => {
  const guarda = () => {
    const dados = new Map<string, string>();
    return { getItem: (k: string) => dados.get(k) ?? null, setItem: (k: string, v: string) => void dados.set(k, v), removeItem: (k: string) => void dados.delete(k), dados };
  };

  it('guarda e lê de volta; formulário vazio apaga o rascunho', () => {
    const g = guarda();
    guardarRascunhoLocal(g, preenchido);
    expect(lerRascunhoLocal(g)).toEqual(preenchido);
    guardarRascunhoLocal(g, ESTADO_VAZIO);
    expect(g.dados.size).toBe(0);
    expect(lerRascunhoLocal(g)).toBeUndefined();
  });

  it('rascunho estragado ou de outra versão é ignorado, sem quebrar a tela', () => {
    const g = guarda();
    g.setItem('otto.briefing.rascunho.v1', '{não é json');
    expect(lerRascunhoLocal(g)).toBeUndefined();
    g.setItem('otto.briefing.rascunho.v1', JSON.stringify({ titulo: 3 }));
    expect(lerRascunhoLocal(g)).toBeUndefined();
  });

  it('navegador que recusa o armazenamento não derruba o formulário', () => {
    const recusa = {
      getItem: () => {
        throw new Error('negado');
      },
      setItem: () => {
        throw new Error('cheio');
      },
      removeItem: () => {
        throw new Error('negado');
      },
    };
    expect(() => guardarRascunhoLocal(recusa, preenchido)).not.toThrow();
    expect(lerRascunhoLocal(recusa)).toBeUndefined();
  });
});
