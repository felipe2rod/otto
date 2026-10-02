// O contrato HTTP da importação de PSD (docs/mvp/backend.md, seção 17.14).
import { describe, expect, it } from 'vitest';
import {
  BYTES_DO_PSD_NO_MAXIMO,
  CODIGOS_DE_ERRO,
  DocumentoDaLista,
  ESTADOS_FINAIS_DA_IMPORTACAO,
  Importacao,
  ListaDeImportacoes,
  MOTIVOS_DE_PSD_RECUSADO,
  PedidoDeImportacao,
  RelatorioDeImportacao,
  TIPO_DO_PSD,
} from './index';

const ID = '0199a3f0-0000-7000-8000-000000000001';
const OUTRO = '0199a3f0-0000-7000-8000-000000000002';
const QUANDO = '2026-10-06T12:00:00.000Z';

const relatorio = {
  arquivo: { formato: 'psd', largura: 1080, altura: 1350, camadas: 9, conversaoDeCor: 'srgb' },
  camadas: [
    { prancheta: 'Feed', camada: 'Título', idDoNo: 'n1', tipo: 'texto', destino: 'editavel', mapeamento: 'no.texto' },
    { prancheta: 'Feed', camada: 'Curvas 1', destino: 'ignorado', mapeamento: 'psd:ajuste-desconhecido', observacao: 'O Otto não tem este ajuste.' },
    { prancheta: 'Feed', camada: 'Selo', idDoNo: 'n2', nomeNoOtto: 'Selo 2', tipo: 'imagem', destino: 'imagem', mapeamento: 'psd:efeito', perdas: [{ mapeamento: 'psd:efeito', detalhe: 'chanfro' }] },
  ],
  fontes: [{ familia: 'Anton', peso: 400, postScript: 'Anton-Regular' }],
  substituicoes: [{ camada: 'Feed / Rodapé', pedida: 'Futura-Bold', usada: { familia: 'Anton', peso: 400, postScript: 'Anton-Regular' } }],
  emFalta: { fontes: [{ postScript: 'Gotham-Black', camadas: ['Feed / Preço'] }] },
  avisos: [{ codigo: 'fonte-em-falta', texto: 'Há texto com fonte que o Otto não tem.' }],
};

const enviada = {
  id: ID,
  estado: 'enviada',
  arquivo: { nome: 'campanha.psd', bytes: 1_234_567, formato: 'psd', largura: 1080, altura: 1350, camadas: 9 },
  fontes: [
    { postScript: 'Anton-Regular', situacao: 'na_biblioteca', familia: 'Anton', peso: 400 },
    { postScript: 'Poppins-Bold', situacao: 'no_catalogo', familia: 'Poppins', peso: 700 },
    { postScript: 'Gotham-Black', situacao: 'em_falta' },
    { postScript: 'Anton-Black', situacao: 'em_falta', sugestao: { familia: 'Anton', peso: 400 } },
  ],
  criadaEm: QUANDO,
  expiraEm: QUANDO,
};

describe('constantes do envio', () => {
  it('o tipo do envio é o do PSD e o teto do MVP é de 100 MB', () => {
    expect(TIPO_DO_PSD).toBe('image/vnd.adobe.photoshop');
    expect(BYTES_DO_PSD_NO_MAXIMO).toBe(100 * 1024 * 1024);
  });

  it('os códigos de erro novos existem, e os motivos de recusa são os do pacote de PSD', () => {
    expect(CODIGOS_DE_ERRO.psdRecusado).toBe('psd_recusado');
    expect(CODIGOS_DE_ERRO.limiteDeImportacoes).toBe('limite_de_importacoes');
    expect(CODIGOS_DE_ERRO.importacaoForaDoEstado).toBe('importacao_fora_do_estado');
    expect(MOTIVOS_DE_PSD_RECUSADO).toEqual(expect.arrayContaining(['nao-e-psd', 'modo-de-cor', 'profundidade', 'camadas-demais', 'pixels-demais', 'arquivo-truncado', 'arquivo-malformado']));
  });
});

describe('PedidoDeImportacao', () => {
  it('vazio vale: sem nome, sem marca e com as fontes no padrão', () => {
    expect(PedidoDeImportacao.parse({})).toEqual({ fontes: [] });
  });

  it('aceita nome, marca e uma escolha por fonte: virar imagem, baixar do catálogo ou trocar por outra', () => {
    const pedido = {
      nome: 'Campanha de verão',
      marcaId: OUTRO,
      fontes: [
        { postScript: 'Gotham-Black', fazer: 'imagem' },
        { postScript: 'Poppins-Bold', fazer: 'baixar' },
        { postScript: 'Futura-Bold', fazer: 'substituir', por: { familia: 'Anton', peso: 400 } },
      ],
    };
    expect(PedidoDeImportacao.parse(pedido)).toEqual(pedido);
  });

  it('recusa campo a mais, troca sem destino, a mesma fonte duas vezes e chave de objeto vinda do cliente', () => {
    expect(PedidoDeImportacao.safeParse({ chaveDoObjeto: 'contas/x/importacoes/y/original.psd' }).success).toBe(false);
    expect(PedidoDeImportacao.safeParse({ fontes: [{ postScript: 'Futura-Bold', fazer: 'substituir' }] }).success).toBe(false);
    expect(PedidoDeImportacao.safeParse({ fontes: [{ postScript: 'A', fazer: 'imagem', por: { familia: 'Anton', peso: 400 } }] }).success).toBe(false);
    expect(
      PedidoDeImportacao.safeParse({
        fontes: [
          { postScript: 'A', fazer: 'imagem' },
          { postScript: 'A', fazer: 'baixar' },
        ],
      }).success,
    ).toBe(false);
    expect(PedidoDeImportacao.safeParse({ nome: '' }).success).toBe(false);
  });
});

describe('Importacao', () => {
  it('enviada: traz o que a inspeção viu e a situação de cada fonte, e ainda não tem peça', () => {
    const lida = Importacao.parse(enviada);
    expect(lida.fontes.map((f) => f.situacao)).toEqual(['na_biblioteca', 'no_catalogo', 'em_falta', 'em_falta']);
    expect(lida.documentoId).toBeUndefined();
  });

  it('pronta: traz a peça criada e o relatório', () => {
    const lida = Importacao.parse({ ...enviada, estado: 'pronta', documentoId: OUTRO, relatorio, prontaEm: QUANDO, duracaoMs: 2400 });
    expect(lida.documentoId).toBe(OUTRO);
    expect(lida.relatorio?.camadas).toHaveLength(3);
  });

  it('falhou: traz o código, e o motivo e a frase quando foi o arquivo que não pôde ser importado', () => {
    const lida = Importacao.parse({ ...enviada, estado: 'falhou', erro: { codigo: 'psd_recusado', motivo: 'modo-de-cor', mensagem: 'O arquivo está em CMYK.' } });
    expect(lida.erro).toEqual({ codigo: 'psd_recusado', motivo: 'modo-de-cor', mensagem: 'O arquivo está em CMYK.' });
    expect(Importacao.parse({ ...enviada, estado: 'falhou', erro: { codigo: 'interrompida' } }).erro).toEqual({ codigo: 'interrompida' });
  });

  it('nunca carrega chave de objeto, e os estados finais são os que não adianta mais consultar', () => {
    expect(Object.keys(Importacao.shape)).not.toContain('chaveDoObjeto');
    expect(ESTADOS_FINAIS_DA_IMPORTACAO).toEqual(['pronta', 'falhou', 'descartada']);
  });

  it('a lista traz as importações sem o relatório', () => {
    expect(ListaDeImportacoes.parse({ itens: [enviada] }).itens).toHaveLength(1);
  });
});

describe('RelatorioDeImportacao', () => {
  it('aceita o relatório como @otto/psd o produz', () => {
    expect(RelatorioDeImportacao.parse(relatorio)).toEqual(relatorio);
  });
});

describe('a peça que nasceu de um PSD', () => {
  it('a lista de peças diz de qual importação ela veio', () => {
    const item = { id: ID, nome: 'Campanha', pranchetas: 1, versao: 0, alteradoEm: QUANDO, miniatura: null, importacaoId: OUTRO };
    expect(DocumentoDaLista.parse(item).importacaoId).toBe(OUTRO);
  });
});
