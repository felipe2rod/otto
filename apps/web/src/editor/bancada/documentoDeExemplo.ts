// Documento de exemplo da bancada (rota só de desenvolvimento): existe para ver o motor desenhando
// antes de a API ter documentos. É montado pelas operações do catálogo, como qualquer peça.
// O que está escrito nas camadas é conteúdo de documento de teste, não texto de interface.
import { aplicarLote, type Documento, documentoVazio } from '@otto/documento';

/** Fontes que a bancada entrega ao motor (arquivos em ./fontes). O documento só usa estas. */
export const FONTES_DE_EXEMPLO = [
  { familia: 'Anton', peso: 400, arquivo: 'Anton-Regular.ttf' },
  { familia: 'IBM Plex Sans', peso: 400, arquivo: 'IBMPlexSans-Regular.ttf' },
] as const;

export interface ImagemDeExemplo {
  /** sha256 dos bytes, em hexadecimal */
  hash: string;
  largura: number;
  altura: number;
}

export function montarDocumentoDeExemplo(imagem: ImagemDeExemplo): Documento {
  const foto = { tipo: 'imagem', arquivo: imagem.hash, larguraOriginal: imagem.largura, alturaOriginal: imagem.altura, ajuste: 'cobrir' };
  const resultado = aplicarLote(
    documentoVazio(),
    [
      { op: 'definirToken', nome: 'papel', valor: '#f4efe3' },
      { op: 'criarPrancheta', nome: 'Feed', largura: 1080, altura: 1350, fundo: '#f4efe3' },
      { op: 'criarPrancheta', nome: 'Story', largura: 1080, altura: 1920, fundo: '#0f3b2c' },

      { op: 'criarNo', prancheta: 'Feed', no: { ...foto, nome: 'Foto', x: 90, y: 90, largura: 900, altura: 620, recorte: { forma: 'retangulo', raio: 24 } } },
      {
        op: 'criarNo',
        prancheta: 'Feed',
        no: {
          tipo: 'forma',
          nome: 'Selo',
          forma: 'elipse',
          x: 760,
          y: 560,
          largura: 260,
          altura: 260,
          preenchimento: '#f4c430',
          modoDeMesclagem: 'multiplicacao',
          sombra: { cor: '#000000', opacidade: 0.35, distancia: 12, angulo: 90, desfoque: 24 },
        },
      },
      { op: 'criarNo', prancheta: 'Feed', no: { tipo: 'forma', nome: 'Fio', forma: 'retangulo', x: 90, y: 790, largura: 180, altura: 10, preenchimento: '#ff5b1f' } },
      {
        op: 'criarNo',
        prancheta: 'Feed',
        no: {
          tipo: 'texto',
          nome: 'Apoio',
          conteudo: 'O agente faz a produção, você faz o design.',
          fonte: 'IBM Plex Sans',
          peso: 400,
          tamanho: 38,
          x: 90,
          y: 1180,
          largura: 760,
          altura: 110,
          cor: '#17171c',
        },
      },
      {
        op: 'criarNo',
        prancheta: 'Feed',
        no: {
          tipo: 'texto',
          nome: 'Título',
          conteudo: 'Camadas de verdade',
          fonte: 'Anton',
          peso: 400,
          tamanho: 132,
          entrelinha: 1,
          caixaAlta: true,
          x: 90,
          y: 840,
          largura: 900,
          altura: 320,
          cor: '#0f3b2c',
        },
      },

      {
        op: 'criarNo',
        prancheta: 'Story',
        no: {
          tipo: 'forma',
          nome: 'Faixa',
          forma: 'retangulo',
          x: 0,
          y: 700,
          largura: 1080,
          altura: 520,
          preenchimento: {
            tipo: 'linear',
            angulo: 90,
            paradas: [
              { cor: '#ff5b1f', posicao: 0 },
              { cor: '#f4c430', posicao: 1 },
            ],
          },
        },
      },
      {
        op: 'criarNo',
        prancheta: 'Story',
        no: {
          tipo: 'texto',
          nome: 'Chamada',
          conteudo: 'Arraste esta camada',
          fonte: 'Anton',
          peso: 400,
          tamanho: 110,
          entrelinha: 1,
          caixaAlta: true,
          x: 80,
          y: 820,
          largura: 920,
          altura: 260,
          cor: 'token:papel',
        },
      },
    ],
    // id de lote fixo: os ids dos nós derivam dele, então o documento é sempre o mesmo
    { autoria: { tipo: 'designer' }, idDoLote: 'documento-de-exemplo-da-bancada' },
  );
  if (!resultado.ok) throw new Error(`documento de exemplo inválido: ${resultado.erro.mensagem} (operação ${resultado.erro.indice}, ${resultado.erro.op})`);
  return resultado.doc;
}
