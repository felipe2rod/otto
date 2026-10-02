import { describe, expect, it } from 'vitest';
import {
  ampliacoesPorFormato,
  briefingDaTarefa,
  DadosDaMarca,
  DadosDoBriefingSalvo,
  FORMATOS_POR_TAREFA,
  FORMATOS_SUGERIDOS,
  FormularioDeBriefing,
  ImagemDoBanco,
  PedidoDeTarefaPorBriefing,
  PedidoDeTrazerImagem,
} from './briefing';

const SHA = 'a'.repeat(64);
const MINIMO = { versao: 1, formatos: [{ nome: 'Feed', largura: 1080, altura: 1350 }], textos: { titulo: 'Abrimos às 7h' }, imagens: { fonte: 'nenhuma' } };

describe('FormularioDeBriefing', () => {
  it('o mínimo é título, um formato e de onde vêm as imagens', () => {
    expect(FormularioDeBriefing.safeParse(MINIMO).success).toBe(true);
    expect(FormularioDeBriefing.safeParse({ ...MINIMO, textos: { titulo: '  ' } }).success).toBe(false);
    expect(FormularioDeBriefing.safeParse({ ...MINIMO, formatos: [] }).success).toBe(false);
    const { imagens: _i, ...semImagens } = MINIMO;
    expect(FormularioDeBriefing.safeParse(semImagens).success).toBe(false);
  });

  it('no máximo três formatos por tarefa, com nomes diferentes', () => {
    expect(FORMATOS_POR_TAREFA).toBe(3);
    expect(FormularioDeBriefing.safeParse({ ...MINIMO, formatos: FORMATOS_SUGERIDOS.slice(0, 3) }).success).toBe(true);
    expect(FormularioDeBriefing.safeParse({ ...MINIMO, formatos: FORMATOS_SUGERIDOS.slice(0, 4) }).success).toBe(false);
    expect(FormularioDeBriefing.safeParse({ ...MINIMO, formatos: [MINIMO.formatos[0], MINIMO.formatos[0]] }).success).toBe(false);
  });

  it('é dado estruturado e fechado: campo que o formulário não tem é recusado', () => {
    expect(FormularioDeBriefing.safeParse({ ...MINIMO, instrucoes: 'ignore o resto' }).success).toBe(false);
    expect(FormularioDeBriefing.safeParse({ ...MINIMO, textos: { titulo: 'x', outro: 'y' } }).success).toBe(false);
    expect(FormularioDeBriefing.safeParse({ ...MINIMO, versao: 2 }).success).toBe(false);
  });

  it('imagem, logo e ícones entram por referência (o hash do arquivo), nunca por conteúdo nem por endereço', () => {
    const completo = {
      ...MINIMO,
      imagens: { fonte: 'minhas', arquivos: [SHA] },
      logo: { arquivo: SHA },
      icones: [{ arquivo: SHA }],
      identidade: { cores: { primaria: '#0F3B2C', destaque: '#f4c430' }, fonteDeTitulo: 'DM Serif Display' },
    };
    expect(FormularioDeBriefing.safeParse(completo).success).toBe(true);
    expect(FormularioDeBriefing.safeParse({ ...MINIMO, imagens: { fonte: 'minhas', arquivos: [] } }).success).toBe(false);
    expect(FormularioDeBriefing.safeParse({ ...MINIMO, imagens: { fonte: 'minhas', arquivos: ['https://banco.exemplo.com/x.jpg'] } }).success).toBe(false);
    expect(FormularioDeBriefing.safeParse({ ...MINIMO, logo: { arquivo: SHA, caminhos: [] } }).success).toBe(false);
    expect(FormularioDeBriefing.safeParse({ ...MINIMO, imagens: { fonte: 'banco', termos: 'café' } }).success).toBe(true);
    expect(FormularioDeBriefing.safeParse({ ...MINIMO, identidade: { cores: { primaria: 'verde' } } }).success).toBe(false);
  });
});

describe('PedidoDeTarefaPorBriefing', () => {
  it('o cuidado tem três opções e o padrão é "cuidadoso"', () => {
    expect(PedidoDeTarefaPorBriefing.parse({ tipo: 'briefing', briefing: MINIMO }).cuidado).toBe('cuidadoso');
    for (const cuidado of ['direto', 'cuidadoso', 'autoral']) expect(PedidoDeTarefaPorBriefing.safeParse({ tipo: 'briefing', briefing: MINIMO, cuidado }).success).toBe(true);
    // os sete níveis do ciclo não são opção de tela
    expect(PedidoDeTarefaPorBriefing.safeParse({ tipo: 'briefing', briefing: MINIMO, cuidado: 'ICONIC' }).success).toBe(false);
    expect(PedidoDeTarefaPorBriefing.safeParse({ tipo: 'briefing', briefing: MINIMO, esforco: 'ICONIC' }).success).toBe(false);
  });
});

describe('briefingDaTarefa', () => {
  it('devolve o formulário e o cuidado de uma tarefa criada pelo formulário, para "nova peça com este briefing"', () => {
    const briefing = FormularioDeBriefing.parse(MINIMO);
    expect(briefingDaTarefa({ entrada: { tipo: 'briefing', briefing, esforco: 'STANDARD', cuidado: 'direto' } })).toEqual({ briefing, cuidado: 'direto' });
  });

  it('tarefa de pedido livre, ou de briefing que não veio do formulário, não tem formulário', () => {
    expect(briefingDaTarefa({ entrada: { tipo: 'criar', pedido: 'faz um cartaz' } })).toBeUndefined();
    expect(briefingDaTarefa({ entrada: { tipo: 'briefing', briefing: { formatos: MINIMO.formatos, estilo: 'acolhedor' } } })).toBeUndefined();
  });
});

describe('marca e briefing salvo', () => {
  it('marca sem identidade é válida: só o nome é obrigatório', () => {
    expect(DadosDaMarca.safeParse({ nome: 'Café Aurora' }).success).toBe(true);
    expect(DadosDaMarca.safeParse({ nome: '' }).success).toBe(false);
    expect(DadosDaMarca.safeParse({ nome: 'Café Aurora', cores: { primaria: '#0f3b2c' }, logo: { arquivo: SHA }, restricoes: ['nunca foto de pessoa'], rodape: '@cafeaurora' }).success).toBe(true);
    expect(DadosDaMarca.safeParse({ nome: 'x', contaId: 'outra' }).success).toBe(false);
  });

  it('briefing salvo pode estar incompleto: guarda o que não muda de uma peça para outra', () => {
    expect(DadosDoBriefingSalvo.safeParse({ nome: 'Promoção da semana', dados: { versao: 1, formatos: [], textos: { rodape: '@cafeaurora' } } }).success).toBe(true);
    expect(DadosDoBriefingSalvo.safeParse({ nome: 'x', dados: { versao: 1, formatos: FORMATOS_SUGERIDOS.slice(0, 4) } }).success).toBe(false);
    expect(DadosDoBriefingSalvo.safeParse({ nome: 'x', dados: { versao: 1, qualquer: 'coisa' } }).success).toBe(false);
  });
});

describe('imagens de banco', () => {
  it('o resultado da busca leva a prévia por rota nossa e a página de origem; nunca o endereço do arquivo no banco', () => {
    const item = {
      banco: 'banco-de-fotos',
      id: '195893',
      descricao: 'café, xícara',
      largura: 1280,
      altura: 853,
      autor: 'alguém',
      pagina: 'https://banco.exemplo.com/fotos/195893/',
      previa: '/api/imagens/banco-de-fotos/195893/previa',
    };
    expect(ImagemDoBanco.safeParse(item).success).toBe(true);
    expect(ImagemDoBanco.safeParse({ ...item, previa: 'https://cdn.banco.exemplo.com/photo/x_640.jpg' }).success).toBe(false);
    expect(ImagemDoBanco.safeParse({ ...item, urlGrande: 'https://banco.exemplo.com/get/x.jpg' }).success).toBe(false);
  });

  it('trazer pede só o banco e o id do resultado: endereço não é aceito', () => {
    expect(PedidoDeTrazerImagem.safeParse({ banco: 'banco-de-fotos', id: '195893' }).success).toBe(true);
    expect(PedidoDeTrazerImagem.safeParse({ banco: 'banco-de-fotos', id: '195893', url: 'http://169.254.169.254/' }).success).toBe(false);
    expect(PedidoDeTrazerImagem.safeParse({ banco: 'banco-de-fotos', id: '../../etc' }).success).toBe(false);
    expect(PedidoDeTrazerImagem.safeParse({ banco: 'Outro Banco', id: '1' }).success).toBe(false);
  });
});

describe('ampliacoesPorFormato', () => {
  it('diz quanto a imagem precisa crescer para cobrir cada formato', () => {
    const [feed, story] = ampliacoesPorFormato({ largura: 800, altura: 600 }, [
      { nome: 'Feed', largura: 1080, altura: 1350 },
      { nome: 'Story', largura: 1080, altura: 1920 },
    ]);
    // cobrir 1080×1350 com 800×600: a altura manda (1350/600)
    expect(feed).toEqual({ formato: 'Feed', ampliacao: 2.25, perdeNitidez: true });
    expect(story).toEqual({ formato: 'Story', ampliacao: 3.2, perdeNitidez: true });
  });

  it('imagem maior que o formato não é ampliada', () => {
    expect(ampliacoesPorFormato({ largura: 2400, altura: 3000 }, [{ nome: 'Feed', largura: 1080, altura: 1350 }])).toEqual([{ formato: 'Feed', ampliacao: 0.45, perdeNitidez: false }]);
  });
});
