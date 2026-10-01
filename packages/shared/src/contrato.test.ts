// O contrato HTTP da fatia 1 (docs/mvp/backend.md, seções 7.1 a 7.4), como esquemas.
// A API valida o pedido e monta a resposta com estes esquemas; o editor valida a resposta.
import { documentoVazio } from '@otto/documento';
import { describe, expect, it } from 'vitest';
import {
  ArquivoEnviado,
  CABECALHOS,
  CODIGOS_DE_ERRO,
  DocumentoAberto,
  DocumentoRenomeado,
  Historico,
  LIMITES,
  ListaDeDocumentos,
  ListaDeFontes,
  PedidoDeCriarDocumento,
  PedidoDeDesfazer,
  PedidoDeLote,
  PedidoDeRenomearDocumento,
  RespostaDeDesfazer,
  RespostaDeLote,
  VetorImportado,
} from './index';

const ID = '0199a3f0-0000-7000-8000-000000000001';
const QUANDO = '2026-10-01T12:00:00.000Z';

describe('lista de documentos', () => {
  it('aceita item com pranchetas, versão e data; tarefa é opcional; miniatura nula', () => {
    const lista = ListaDeDocumentos.parse({ itens: [{ id: ID, nome: 'Promoção', pranchetas: 2, versao: 7, alteradoEm: QUANDO, miniatura: null }], proximoCursor: null });
    expect(lista.itens[0]?.pranchetas).toBe(2);
    expect(lista.itens[0]?.tarefa).toBeUndefined();
  });

  it('aceita o estado da tarefa viva', () => {
    const lista = ListaDeDocumentos.parse({
      itens: [{ id: ID, nome: 'x', pranchetas: 0, versao: 0, alteradoEm: QUANDO, miniatura: null, tarefa: { id: ID, estado: 'rodando' } }],
      proximoCursor: 'abc',
    });
    expect(lista.itens[0]?.tarefa?.estado).toBe('rodando');
  });

  it('recusa data que não é ISO e id que não é UUID', () => {
    expect(ListaDeDocumentos.safeParse({ itens: [{ id: 'x', nome: 'x', pranchetas: 0, versao: 0, alteradoEm: QUANDO, miniatura: null }], proximoCursor: null }).success).toBe(false);
    expect(ListaDeDocumentos.safeParse({ itens: [{ id: ID, nome: 'x', pranchetas: 0, versao: 0, alteradoEm: 'ontem', miniatura: null }], proximoCursor: null }).success).toBe(false);
  });
});

describe('documento aberto', () => {
  it('traz nome, versão e a árvore validada pelo esquema do núcleo', () => {
    const aberto = DocumentoAberto.parse({ id: ID, nome: 'Promoção', versao: 0, arvore: documentoVazio() });
    expect(aberto.arvore.pranchetas).toEqual([]);
  });

  it('recusa árvore fora do formato', () => {
    expect(DocumentoAberto.safeParse({ id: ID, nome: 'x', versao: 0, arvore: { pranchetas: 'nenhuma' } }).success).toBe(false);
  });

  it('aceita tarefa ativa e conjunto pendente, para a tela se remontar', () => {
    const aberto = DocumentoAberto.parse({
      id: ID,
      nome: 'x',
      versao: 3,
      arvore: documentoVazio(),
      tarefaAtiva: { id: ID, estado: 'na_fila' },
      conjuntoPendente: { tarefaId: ID, versaoInicial: 1, tocados: ['a'] },
    });
    expect(aberto.conjuntoPendente?.tocados).toEqual(['a']);
  });
});

describe('pedidos de documento', () => {
  it('criar: nome é opcional, sem espaço nas pontas, de 1 a 120 caracteres', () => {
    expect(PedidoDeCriarDocumento.parse({})).toEqual({});
    expect(PedidoDeCriarDocumento.parse({ nome: '  Promoção  ' })).toEqual({ nome: 'Promoção' });
    expect(PedidoDeCriarDocumento.safeParse({ nome: '   ' }).success).toBe(false);
    expect(PedidoDeCriarDocumento.safeParse({ nome: 'x'.repeat(LIMITES.caracteresDoNome + 1) }).success).toBe(false);
  });

  it('criar e renomear recusam campo desconhecido (nada de conta, id ou árvore vindos do cliente)', () => {
    expect(PedidoDeCriarDocumento.safeParse({ nome: 'x', contaId: ID }).success).toBe(false);
    expect(PedidoDeCriarDocumento.safeParse({ nome: 'x', arvore: documentoVazio() }).success).toBe(false);
    expect(PedidoDeRenomearDocumento.safeParse({ nome: 'x', id: ID }).success).toBe(false);
  });

  it('renomear exige nome', () => {
    expect(PedidoDeRenomearDocumento.safeParse({}).success).toBe(false);
    expect(DocumentoRenomeado.parse({ id: ID, nome: 'Novo' }).nome).toBe('Novo');
  });
});

describe('lote', () => {
  const lote = { id: ID, versaoBase: 0, descricao: 'cria a prancheta', operacoes: [{ op: 'criarPrancheta', nome: 'Feed', largura: 1080, altura: 1350, fundo: '#ffffff' }] };

  it('pede id, versão base, descrição e ao menos uma operação', () => {
    expect(PedidoDeLote.parse(lote).operacoes).toHaveLength(1);
    for (const campo of ['id', 'versaoBase', 'descricao', 'operacoes'] as const) {
      const { [campo]: _fora, ...sem } = lote;
      expect(PedidoDeLote.safeParse(sem).success, campo).toBe(false);
    }
    expect(PedidoDeLote.safeParse({ ...lote, operacoes: [] }).success).toBe(false);
  });

  it('as operações não são validadas aqui: quem valida é o catálogo, com erro por operação', () => {
    expect(PedidoDeLote.safeParse({ ...lote, operacoes: [{ op: 'inventada' }] }).success).toBe(true);
  });

  it('limita o número de operações e aceita devolver a árvore', () => {
    expect(PedidoDeLote.safeParse({ ...lote, operacoes: Array.from({ length: LIMITES.operacoesPorLote + 1 }, () => ({ op: 'x' })) }).success).toBe(false);
    expect(PedidoDeLote.parse({ ...lote, devolver: 'arvore' }).devolver).toBe('arvore');
    expect(PedidoDeLote.safeParse({ ...lote, devolver: 'tudo' }).success).toBe(false);
  });

  it('versão base é inteiro não negativo', () => {
    expect(PedidoDeLote.safeParse({ ...lote, versaoBase: -1 }).success).toBe(false);
    expect(PedidoDeLote.safeParse({ ...lote, versaoBase: 1.5 }).success).toBe(false);
  });

  it('a resposta traz a versão e os tocados; a árvore só quando pedida', () => {
    expect(RespostaDeLote.parse({ versao: 1, lote: { id: ID, tocados: ['a', 'b'] } }).arvore).toBeUndefined();
    expect(RespostaDeLote.parse({ versao: 1, lote: { id: ID, tocados: [] }, arvore: documentoVazio() }).arvore?.pranchetas).toEqual([]);
  });
});

describe('desfazer, refazer e histórico', () => {
  it('desfazer e refazer pedem só a versão base e devolvem versão e árvore', () => {
    expect(PedidoDeDesfazer.parse({ versaoBase: 3 })).toEqual({ versaoBase: 3 });
    expect(RespostaDeDesfazer.parse({ versao: 4, arvore: documentoVazio() }).versao).toBe(4);
  });

  it('item do histórico: autoria, tipo, tocados, contagem e se foi desfeito; sem as operações', () => {
    const h = Historico.parse({
      itens: [
        { id: ID, versao: 2, autoria: 'designer', tipo: 'edicao', descricao: 'move o título', tocados: ['a'], quantidadeDeOperacoes: 1, quando: QUANDO, desfeito: false },
        { id: ID, versao: 3, autoria: 'agente', tarefaId: ID, tipo: 'reversao', descricao: '', tocados: [], quantidadeDeOperacoes: 0, quando: QUANDO, desfeito: false },
      ],
      proximoCursor: null,
    });
    expect(h.itens.map((i) => i.tipo)).toEqual(['edicao', 'reversao']);
    expect('operacoes' in (h.itens[0] as object)).toBe(false);
  });
});

describe('arquivos e fontes', () => {
  const sha256 = 'a'.repeat(64);

  it('arquivo enviado: hash, tipo, medidas e bytes', () => {
    expect(ArquivoEnviado.parse({ sha256, tipo: 'image/png', largura: 10, altura: 20, bytes: 123 }).largura).toBe(10);
    expect(ArquivoEnviado.safeParse({ sha256: 'curto', tipo: 'image/png', largura: 1, altura: 1, bytes: 1 }).success).toBe(false);
    expect(ArquivoEnviado.safeParse({ sha256, tipo: 'image/gif', largura: 1, altura: 1, bytes: 1 }).success).toBe(false);
  });

  it('vetor importado: o nó pronto para criarNo e os avisos', () => {
    const v = VetorImportado.parse({
      no: { tipo: 'vetor', moldura: [24, 24], caminhos: [{ d: 'M0 0', preenchimento: '#000000' }], origem: { arquivo: sha256, nome: 'logo.svg' } },
      avisos: ['traço ignorado'],
    });
    expect(v.no.moldura).toEqual([24, 24]);
  });

  it('lista de fontes: família e pesos', () => {
    expect(ListaDeFontes.parse({ itens: [{ familia: 'IBM Plex Sans', pesos: [400, 700] }] }).itens[0]?.pesos).toEqual([400, 700]);
  });
});

describe('constantes do contrato', () => {
  it('os códigos de erro são estáveis, em minúsculas com sublinhado', () => {
    for (const codigo of Object.values(CODIGOS_DE_ERRO)) expect(codigo).toMatch(/^[a-z][a-z0-9_]*$/);
    expect(CODIGOS_DE_ERRO.versaoDesatualizada).toBe('versao_desatualizada');
    expect(new Set(Object.values(CODIGOS_DE_ERRO)).size).toBe(Object.values(CODIGOS_DE_ERRO).length);
  });

  it('os cabeçalhos têm nome fixo', () => {
    expect(CABECALHOS.cliente).toEqual({ nome: 'X-Otto-Cliente', valor: 'editor' });
    expect(CABECALHOS.catalogo).toBe('X-Otto-Catalogo');
  });
});
