// O contrato HTTP da exportação (docs/mvp/backend.md, seção 7.6) e os acréscimos da fatia 2 ao de documento.
import { documentoVazio } from '@otto/documento';
import { describe, expect, it } from 'vitest';
import {
  CODIGOS_DE_ERRO,
  DocumentoAberto,
  Exportacao,
  ListaDeExportacoes,
  PedidoDeExportacao,
  pesoMaisProximo,
  RelatorioDeExportacao,
  RespostaDeDesfazer,
  RespostaDeLote,
  VALIDADE_DO_LINK_EM_SEGUNDOS,
} from './index';

const ID = '0199a3f0-0000-7000-8000-000000000001';
const QUANDO = '2026-10-01T12:00:00.000Z';

const relatorio = {
  arquivos: ['Peça - Feed.psd'],
  camadas: [{ prancheta: 'Feed', camada: 'Título', idDoNo: 'n1', tipo: 'texto', destino: 'nativo-editavel', mapeamento: 'no.texto' }],
  tokens: [{ nome: 'primaria', valor: '#ff5500', usadoEm: ['Feed / Fundo'] }],
  fontes: [{ familia: 'Anton', peso: 400, postScript: 'Anton-Regular' }],
  substituicoes: [{ camada: 'Feed / Título', pedida: { familia: 'Anton', peso: 700 }, usada: { familia: 'Anton', peso: 400, postScript: 'Anton-Regular' } }],
  emFalta: { fontes: [{ familia: 'Comic Sans', camadas: ['Feed / Rodapé'] }], imagens: [] },
  imagens: [{ camada: 'Feed / Foto', banco: 'Banco', autor: 'fulano', licenca: 'livre', url: 'https://exemplo.invalid' }],
  avisos: [{ codigo: 'instalar-fontes', texto: 'Instale as fontes.' }],
};

describe('PedidoDeExportacao', () => {
  it('PSD: um arquivo por prancheta por padrão, ou todas juntas', () => {
    expect(PedidoDeExportacao.parse({ formato: 'psd' })).toEqual({ formato: 'psd', arquivos: 'por-prancheta' });
    expect(PedidoDeExportacao.parse({ formato: 'psd', arquivos: 'juntas', pranchetas: ['p1', 'p2'] })).toEqual({ formato: 'psd', arquivos: 'juntas', pranchetas: ['p1', 'p2'] });
  });

  it('PNG: escala 1 ou 2 e fundo, com padrão', () => {
    expect(PedidoDeExportacao.parse({ formato: 'png' })).toEqual({ formato: 'png', escala: 1, semFundo: false });
    expect(PedidoDeExportacao.parse({ formato: 'png', escala: 2, semFundo: true })).toEqual({ formato: 'png', escala: 2, semFundo: true });
    expect(PedidoDeExportacao.safeParse({ formato: 'png', escala: 8 }).success).toBe(false);
  });

  it('SVG: um arquivo por prancheta, sem opção de juntar', () => {
    expect(PedidoDeExportacao.parse({ formato: 'svg' })).toEqual({ formato: 'svg' });
    expect(PedidoDeExportacao.safeParse({ formato: 'svg', arquivos: 'juntas' }).success).toBe(false);
  });

  it('PDF: uma página por prancheta num arquivo só por padrão, ou um arquivo por prancheta', () => {
    expect(PedidoDeExportacao.parse({ formato: 'pdf' })).toEqual({ formato: 'pdf', arquivos: 'juntas' });
    expect(PedidoDeExportacao.parse({ formato: 'pdf', arquivos: 'por-prancheta', pranchetas: ['p1'] })).toEqual({ formato: 'pdf', arquivos: 'por-prancheta', pranchetas: ['p1'] });
  });

  it('pacote: qualquer formato pode sair como um .zip; sem o campo, não é pacote', () => {
    for (const formato of ['psd', 'png', 'svg', 'pdf']) expect(PedidoDeExportacao.parse({ formato, pacote: true })).toMatchObject({ formato, pacote: true });
    expect(PedidoDeExportacao.parse({ formato: 'psd' })).not.toHaveProperty('pacote');
    expect(PedidoDeExportacao.safeParse({ formato: 'psd', pacote: 'sim' }).success).toBe(false);
  });

  it('recusa formato desconhecido, opção de outro formato, lista vazia de pranchetas e campo desconhecido', () => {
    expect(PedidoDeExportacao.safeParse({ formato: 'ai' }).success).toBe(false);
    expect(PedidoDeExportacao.safeParse({ formato: 'png', arquivos: 'juntas' }).success).toBe(false);
    expect(PedidoDeExportacao.safeParse({ formato: 'psd', escala: 2 }).success).toBe(false);
    expect(PedidoDeExportacao.safeParse({ formato: 'psd', pranchetas: [] }).success).toBe(false);
    expect(PedidoDeExportacao.safeParse({ formato: 'psd', contaId: ID }).success).toBe(false);
  });
});

describe('RelatorioDeExportacao', () => {
  it('aceita o relatório que @otto/psd produz: camadas com destino, fontes, substituições, o que falta e avisos com código', () => {
    const r = RelatorioDeExportacao.parse(relatorio);
    expect(r.camadas[0]?.destino).toBe('nativo-editavel');
    expect(r.avisos[0]?.codigo).toBe('instalar-fontes');
  });

  it('aceita código de aviso que este esquema ainda não conhece (o catálogo de avisos é do pacote psd)', () => {
    expect(RelatorioDeExportacao.safeParse({ ...relatorio, avisos: [{ codigo: 'aviso-do-futuro', texto: 'x' }] }).success).toBe(true);
  });

  it('recusa destino desconhecido', () => {
    expect(RelatorioDeExportacao.safeParse({ ...relatorio, camadas: [{ ...relatorio.camadas[0], destino: 'sumiu' }] }).success).toBe(false);
  });
});

describe('Exportacao', () => {
  const base = { id: ID, documentoId: ID, versao: 3, formato: 'psd', estado: 'na_fila', progresso: { pranchetasProntas: 0, pranchetasNoTotal: 2 }, arquivos: [], falhas: [], criadaEm: QUANDO };

  it('na fila: sem arquivos, sem relatório, com o progresso zerado', () => {
    expect(Exportacao.parse(base).progresso).toEqual({ pranchetasProntas: 0, pranchetasNoTotal: 2 });
  });

  it('pronta: arquivos com nome, tamanho e endereço de download; relatório; data de vencimento', () => {
    const e = Exportacao.parse({
      ...base,
      estado: 'pronta',
      progresso: { pranchetasProntas: 2, pranchetasNoTotal: 2 },
      arquivos: [{ indice: 0, nome: 'Peça - Feed.psd', tipo: 'image/vnd.adobe.photoshop', bytes: 123, pranchetaId: 'p1', baixar: `/api/exportacoes/${ID}/arquivos/0` }],
      relatorio,
      prontaEm: QUANDO,
      expiraEm: QUANDO,
      duracaoMs: 1500,
    });
    expect(e.arquivos[0]?.baixar).toBe(`/api/exportacoes/${ID}/arquivos/0`);
  });

  it('pronta em parte: os arquivos que saíram e a falha de cada prancheta que não saiu', () => {
    const e = Exportacao.parse({ ...base, estado: 'pronta_em_parte', falhas: [{ pranchetaId: 'p2', codigo: 'falha_na_prancheta' }] });
    expect(e.falhas).toHaveLength(1);
  });

  it('falhou: com código de erro', () => {
    expect(Exportacao.parse({ ...base, estado: 'falhou', erro: { codigo: 'falha_na_exportacao' } }).erro?.codigo).toBe('falha_na_exportacao');
  });

  it('recusa estado desconhecido', () => {
    expect(Exportacao.safeParse({ ...base, estado: 'quase' }).success).toBe(false);
  });
});

describe('acréscimos ao contrato de documento', () => {
  it('documento aberto diz se dá para desfazer e refazer, e os pesos que existem de cada família que ele usa', () => {
    const d = DocumentoAberto.parse({
      id: ID,
      nome: 'x',
      versao: 2,
      arvore: documentoVazio(),
      podeDesfazer: true,
      podeRefazer: false,
      fontes: [
        { familia: 'Anton', pesos: [400] },
        { familia: 'Sumida', pesos: [] },
      ],
    });
    expect([d.podeDesfazer, d.podeRefazer]).toEqual([true, false]);
    expect(d.fontes[1]).toEqual({ familia: 'Sumida', pesos: [] });
  });

  it('as respostas de lote, desfazer e refazer também dizem', () => {
    expect(RespostaDeLote.parse({ versao: 1, lote: { id: ID, tocados: [] }, podeDesfazer: true, podeRefazer: false }).podeDesfazer).toBe(true);
    expect(RespostaDeDesfazer.parse({ versao: 2, arvore: documentoVazio(), podeDesfazer: false, podeRefazer: true }).podeRefazer).toBe(true);
    // resposta sem os campos (API mais velha que o editor) vale como "não dá": o botão fica apagado, não quebra
    expect(RespostaDeLote.parse({ versao: 1, lote: { id: ID, tocados: [] } })).toMatchObject({ podeDesfazer: false, podeRefazer: false });
    expect(DocumentoAberto.parse({ id: ID, nome: 'x', versao: 0, arvore: documentoVazio() })).toMatchObject({ podeDesfazer: false, podeRefazer: false, fontes: [] });
  });
});

describe('pesoMaisProximo (a mesma regra no servidor e no editor)', () => {
  it('o próprio peso quando existe; senão o mais perto; no empate, o mais pesado', () => {
    expect(pesoMaisProximo([300, 400, 700], 400)).toBe(400);
    expect(pesoMaisProximo([400, 700], 600)).toBe(700);
    expect(pesoMaisProximo([400, 600], 500)).toBe(600);
    expect(pesoMaisProximo([], 400)).toBeUndefined();
  });
});

describe('constantes', () => {
  it('códigos de erro da exportação e a validade do link', () => {
    expect(CODIGOS_DE_ERRO.exportacaoNaoPronta).toBe('exportacao_nao_pronta');
    expect(CODIGOS_DE_ERRO.exportacaoExpirada).toBe('exportacao_expirada');
    expect(CODIGOS_DE_ERRO.limiteDeExportacoes).toBe('limite_de_exportacoes');
    expect(CODIGOS_DE_ERRO.pranchetaDesconhecida).toBe('prancheta_desconhecida');
    expect(VALIDADE_DO_LINK_EM_SEGUNDOS).toBe(300);
  });
});

describe('acréscimos da rodada de fechamento', () => {
  it('o relatório vetorial tem o destino "omitido-com-aviso"', () => {
    const vetorial = {
      ...relatorio,
      camadas: [{ prancheta: 'Feed', camada: 'Curvas', tipo: 'ajuste', destino: 'omitido-com-aviso', mapeamento: 'ajuste:curvas', observacao: 'camada de ajuste: não vai para o arquivo vetorial' }],
    };
    expect(RelatorioDeExportacao.parse(vetorial).camadas[0]?.destino).toBe('omitido-com-aviso');
  });

  it('o relatório de um pacote diz, fonte a fonte, se o arquivo vai dentro e, se não vai, por quê', () => {
    const fontes = [
      { familia: 'Anton', peso: 400, postScript: 'Anton-Regular', licenca: 'SIL Open Font License 1.1', incluida: true, arquivo: 'Fontes/Anton-Regular.ttf' },
      { familia: 'Fechada', peso: 400, postScript: 'Fechada-Regular', licenca: null, incluida: false, motivo: 'licenca_desconhecida' },
    ];
    expect(RelatorioDeExportacao.parse({ ...relatorio, pacote: { fontes } }).pacote?.fontes).toEqual(fontes);
    expect(RelatorioDeExportacao.parse(relatorio).pacote).toBeUndefined();
    expect(RelatorioDeExportacao.safeParse({ ...relatorio, pacote: { fontes: [{ ...fontes[1], motivo: 'porque sim' }] } }).success).toBe(false);
  });

  it('a exportação aceita os formatos novos e diz se é pacote; a lista é um envelope de exportações', () => {
    const base = { id: ID, documentoId: ID, versao: 3, estado: 'pronta', progresso: { pranchetasProntas: 2, pranchetasNoTotal: 2 }, arquivos: [], falhas: [], criadaEm: QUANDO };
    expect(Exportacao.parse({ ...base, formato: 'svg' }).formato).toBe('svg');
    expect(Exportacao.parse({ ...base, formato: 'pdf', pacote: true }).pacote).toBe(true);
    expect(ListaDeExportacoes.parse({ itens: [{ ...base, formato: 'psd' }] }).itens).toHaveLength(1);
    expect(ListaDeExportacoes.safeParse({ itens: [{ ...base, formato: 'ai' }] }).success).toBe(false);
  });
});
