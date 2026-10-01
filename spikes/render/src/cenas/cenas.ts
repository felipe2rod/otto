// Cenas de paridade: uma por assunto de risco, mais uma peça inteira. As mesmas cenas são renderizadas
// no Node e no navegador e comparadas pixel a pixel.
import { MODOS_DE_MESCLAGEM, type Degrade, type No, type NoForma, type NoImagem, type NoTexto, type Prancheta } from '../motor/tipos.ts';
import { documentoDe200Camadas } from './duzentas.ts';

let contador = 0;
const id = (prefixo: string): string => `${prefixo}-${++contador}`;

type Parcial<T> = Partial<Omit<T, 'tipo'>>;

export function texto(conteudo: string, x: number, y: number, largura: number, extra: Parcial<NoTexto> = {}): NoTexto {
  return { id: id('texto'), nome: conteudo.slice(0, 24), tipo: 'texto', conteudo, x, y, largura, altura: 60, fonte: 'IBM Plex Sans', peso: 400, tamanho: 24, cor: '#1c1917', entrelinha: 1.25, espacamento: 0, alinhamento: 'esquerda', ...extra };
}

export function forma(x: number, y: number, largura: number, altura: number, preenchimento: NoForma['preenchimento'], extra: Parcial<NoForma> = {}): NoForma {
  return { id: id('forma'), nome: 'Forma', tipo: 'forma', forma: 'retangulo', x, y, largura, altura, preenchimento, ...extra };
}

export function imagem(arquivo: string, x: number, y: number, largura: number, altura: number, extra: Parcial<NoImagem> = {}): NoImagem {
  return { id: id('imagem'), nome: arquivo, tipo: 'imagem', arquivo, x, y, largura, altura, ajuste: 'cobrir', ...extra };
}

export const degrade = (angulo: number, ...paradas: [string, number, number?][]): Degrade => ({ tipo: 'linear', angulo, paradas: paradas.map(([cor, posicao, opacidade]) => ({ cor, posicao, ...(opacidade === undefined ? {} : { opacidade }) })) });
export const radial = (...paradas: [string, number, number?][]): Degrade => ({ ...degrade(0, ...paradas), tipo: 'radial' });

/** Trecho de estilo sobre uma parte do texto, achada pelo conteúdo e não por índice contado à mão. */
function trecho(conteudo: string, parte: string, estilo: Omit<NonNullable<NoTexto['trechos']>[number], 'inicio' | 'fim'>): NonNullable<NoTexto['trechos']>[number] {
  const inicio = conteudo.indexOf(parte);
  if (inicio < 0) throw new Error(`Trecho "${parte}" não está no texto`);
  return { inicio, fim: inicio + parte.length, ...estilo };
}

const SOMBRA = { cor: '#000000', opacidade: 0.45, angulo: 120, distancia: 10, desfoque: 18 };

/** Estrela com curvas: caminho só com M, C e Z, como o importador de SVG da POC normaliza. */
const ESTRELA = 'M50 5 C55 30 70 45 95 50 C70 55 55 70 50 95 C45 70 30 55 5 50 C30 45 45 30 50 5 Z';

function cenaDeTexto(): Prancheta {
  const paragrafo = 'O agente faz a produção, você faz o design. A partir de R$ 19,90 por pessoa, com entrada franca para quem chegar até as 19h na praça.';
  return {
    id: 'cena-texto', nome: 'texto', x: 0, y: 0, largura: 900, altura: 700, fundo: '#f4efe6',
    filhos: [
      texto('FESTIVAL DE INVERNO', 48, 40, 500, { peso: 700, tamanho: 18, espacamento: 250, cor: '#c2410c' }),
      texto('JAZZ NA PRAÇA', 48, 70, 640, { fonte: 'Anton', tamanho: 96, espacamento: 20, entrelinha: 1, altura: 110 }),
      texto(paragrafo, 48, 200, 380, {
        tamanho: 22, entrelinha: 1.45, altura: 260,
        trechos: [
          trecho(paragrafo, 'agente', { peso: 700 }),
          trecho(paragrafo, 'A partir de', { fonte: 'IBM Plex Serif', cor: '#1d4ed8' }),
          trecho(paragrafo, 'R$ 19,90', { fonte: 'Anton', tamanho: 44, cor: '#c2410c' }),
          trecho(paragrafo, 'entrada franca', { espacamento: 150, peso: 500 }),
        ],
      }),
      texto('Sábado\n20 de junho', 480, 210, 360, { fonte: 'DM Serif Display', tamanho: 44, alinhamento: 'centro', entrelinha: 1.1 }),
      texto('entrada franca\naté as 19h', 480, 330, 360, { fonte: 'Space Mono', tamanho: 20, alinhamento: 'direita', cor: '#44403c' }),
      texto('Versalete Desenhado', 48, 470, 420, { fonte: 'Anton', tamanho: 44, recursosOpenType: ['smcp'] }),
      texto('Versalete Desenhado', 48, 530, 420, { fonte: 'Anton', tamanho: 44 }),
      texto('a g 0 1234 ß', 480, 420, 360, { tamanho: 40, recursosOpenType: ['ss01', 'ss02', 'zero'] }),
      texto('a g 0 1234 ß', 480, 475, 360, { tamanho: 40 }),
      texto('AVATAR Toyota', 480, 540, 380, { fonte: 'DM Serif Display', tamanho: 44, kerning: 'nenhum' }),
      texto('AVATAR Toyota', 480, 590, 380, { fonte: 'DM Serif Display', tamanho: 44 }),
      texto('girado', 700, 60, 160, { fonte: 'Instrument Serif', tamanho: 56, rotacao: -8, cor: '#7c2d12', altura: 70 }),
      texto('Sombra e luz', 48, 610, 420, { fonte: 'Fraunces', peso: 600, tamanho: 48, cor: '#0f766e', sombra: { ...SOMBRA, distancia: 4, desfoque: 6 }, opacidade: 0.9 }),
    ],
  };
}

function cenaDeMesclagem(): Prancheta {
  const colunas = 7;
  const lado = 140;
  const filhos: No[] = [imagem('foto-paisagem', 0, 0, colunas * lado + 40, 4 * (lado + 20) + 20)];
  MODOS_DE_MESCLAGEM.forEach((modo, i) => {
    const x = 20 + (i % colunas) * lado;
    const y = 20 + Math.floor(i / colunas) * (lado + 20);
    filhos.push(forma(x + 8, y + 8, lado - 16, lado - 30, radial(['#ffd166', 0], ['#ef476f', 0.55], ['#118ab2', 1, 0.7]), { raio: 14, modoDeMesclagem: modo, opacidade: 0.9, nome: modo }));
    filhos.push(texto(modo, x + 8, y + lado - 20, lado - 16, { tamanho: 11, cor: '#ffffff', peso: 500, altura: 16 }));
  });
  return { id: 'cena-mesclagem', nome: 'mesclagem', x: 0, y: 0, largura: colunas * lado + 40, altura: 4 * (lado + 20) + 20, fundo: '#202020', filhos };
}

function cenaDeMascaras(): Prancheta {
  return {
    id: 'cena-mascaras', nome: 'mascaras', x: 0, y: 0, largura: 900, altura: 620, fundo: '#e7e5e4',
    filhos: [
      imagem('foto-paisagem', 20, 20, 420, 280, { mascara: { tipo: 'degrade', angulo: 0, inicio: 0.25, fim: 0.95 } }),
      forma(470, 20, 190, 280, '#1d4ed8', { mascara: { tipo: 'forma', forma: 'elipse', x: 490, y: 60, largura: 150, altura: 200, raio: 0, suavizar: 12, inverter: false } }),
      forma(690, 20, 190, 280, '#be123c', { mascara: { tipo: 'forma', forma: 'retangulo', x: 720, y: 60, largura: 130, altura: 200, raio: 30, suavizar: 6, inverter: true } }),
      // foto dentro do título: máscara de recorte
      texto('OTTO', 20, 300, 520, { fonte: 'Anton', tamanho: 220, entrelinha: 1, altura: 240, cor: '#000000' }),
      imagem('foto-retrato', 20, 300, 520, 300, { recortadaNaDeBaixo: true, foco: { x: 0.5, y: 0.6 } }),
      forma(20, 430, 520, 170, degrade(90, ['#000000', 0, 0], ['#000000', 1, 0.6]), { recortadaNaDeBaixo: true, modoDeMesclagem: 'multiplicacao' }),
      {
        id: id('grupo'), nome: 'Grupo com opacidade e modo', tipo: 'grupo', modoDeMesclagem: 'multiplicacao', opacidade: 0.7,
        filhos: [forma(560, 330, 180, 180, '#f59e0b', { forma: 'elipse' }), forma(660, 400, 200, 180, '#0ea5e9', { raio: 24 }), texto('grupo', 600, 410, 200, { fonte: 'Anton', tamanho: 64, cor: '#ffffff' })],
      },
      {
        id: id('grupo'), nome: 'Grupo com máscara', tipo: 'grupo', modoDeMesclagem: 'normal', mascara: { tipo: 'degrade', angulo: 90, inicio: 0.1, fim: 0.9 },
        filhos: [forma(560, 520, 300, 80, '#14532d'), texto('some para cima', 570, 540, 280, { cor: '#ffffff', tamanho: 28 })],
      },
      { id: id('grupo'), nome: 'Atravessar', tipo: 'grupo', modoDeMesclagem: 'atravessar', filhos: [forma(380, 240, 160, 120, '#fde047', { forma: 'elipse', modoDeMesclagem: 'diferenca' })] },
    ],
  };
}

function cenaDeEfeitos(): Prancheta {
  return {
    id: 'cena-efeitos', nome: 'efeitos', x: 0, y: 0, largura: 900, altura: 620, fundo: '#fafaf9',
    filhos: [
      forma(30, 30, 160, 110, '#ffffff', { raio: 16, sombra: SOMBRA }),
      forma(220, 30, 110, 110, '#f97316', { forma: 'elipse', sombra: { ...SOMBRA, angulo: 45, distancia: 16, desfoque: 4, cor: '#7c2d12' } }),
      forma(360, 30, 160, 110, degrade(0, ['#111827', 0], ['#f43f5e', 1])),
      forma(540, 30, 160, 110, degrade(45, ['#0ea5e9', 0], ['#22c55e', 0.5], ['#fde047', 1])),
      forma(720, 30, 150, 110, degrade(90, ['#000000', 0, 0], ['#000000', 1])),
      forma(30, 170, 160, 160, radial(['#ffffff', 0], ['#7c3aed', 0.6], ['#1e1b4b', 1]), { forma: 'elipse', traco: { cor: '#facc15', espessura: 6 } }),
      forma(220, 170, 160, 160, '#e2e8f0', { raio: 28, traco: { cor: '#0f172a', espessura: 10 } }),
      imagem('foto-paisagem', 410, 170, 140, 160),
      imagem('foto-paisagem', 570, 170, 140, 160, { ajuste: 'conter' }),
      imagem('foto-paisagem', 730, 170, 140, 160, { foco: { x: 0.85, y: 0.5 }, zoom: 2.2 }),
      imagem('foto-retrato', 30, 360, 170, 170, { recorte: { forma: 'elipse', raio: 0 }, sombra: SOMBRA }),
      imagem('foto-retrato', 230, 360, 170, 170, { recorte: { forma: 'retangulo', raio: 36 }, rotacao: 12, sombra: SOMBRA }),
      imagem('recorte-com-alfa', 430, 350, 150, 200, { ajuste: 'conter', sombra: { ...SOMBRA, desfoque: 30, distancia: 18 } }),
      imagem('foto-paisagem', 600, 360, 130, 170, { desfoque: 8 }),
      forma(750, 360, 120, 170, '#dc2626', { desfoque: 14, forma: 'elipse' }),
      { id: id('vetor'), nome: 'Estrela', tipo: 'vetor', x: 30, y: 545, largura: 60, altura: 60, moldura: [100, 100], caminhos: [{ d: ESTRELA, preenchimento: '#0f766e' }] },
      { id: id('vetor'), nome: 'Estrela em traço', tipo: 'vetor', x: 110, y: 545, largura: 60, altura: 60, moldura: [100, 100], rotacao: 20, caminhos: [{ d: ESTRELA, traco: { cor: '#b45309', espessura: 8 } }], sombra: { ...SOMBRA, desfoque: 6, distancia: 4 } },
      texto('efeitos de camada, degradê, enquadramento e desfoque', 200, 560, 680, { tamanho: 22, cor: '#44403c' }),
    ],
  };
}

function cenaDeAjustes(): Prancheta {
  return {
    id: 'cena-ajustes', nome: 'ajustes', x: 0, y: 0, largura: 900, altura: 600, fundo: '#000000',
    filhos: [
      imagem('foto-paisagem', 0, 0, 900, 600),
      { id: id('ajuste'), nome: 'Matiz e saturação', tipo: 'ajuste', ajuste: { tipo: 'matiz-saturacao', matiz: 150, saturacao: 30, luminosidade: 0 }, mascara: { tipo: 'degrade', angulo: 0, inicio: 0.2, fim: 0.5 } },
      { id: id('ajuste'), nome: 'Brilho e contraste', tipo: 'ajuste', ajuste: { tipo: 'brilho-contraste', brilho: 30, contraste: 50 }, mascara: { tipo: 'forma', forma: 'elipse', x: 520, y: 80, largura: 300, altura: 300, raio: 0, suavizar: 20, inverter: false } },
      { id: id('ajuste'), nome: 'Níveis', tipo: 'ajuste', opacidade: 0.7, ajuste: { tipo: 'niveis', pretoDeEntrada: 20, brancoDeEntrada: 200, gama: 1.3, pretoDeSaida: 0, brancoDeSaida: 255 }, mascara: { tipo: 'forma', forma: 'retangulo', x: 0, y: 420, largura: 900, altura: 180, raio: 0, suavizar: 0, inverter: false } },
      { id: id('ajuste'), nome: 'Preto e branco', tipo: 'ajuste', ajuste: { tipo: 'preto-e-branco' }, mascara: { tipo: 'forma', forma: 'retangulo', x: 60, y: 60, largura: 780, altura: 480, raio: 40, suavizar: 10, inverter: true } },
      texto('ajuste só age no que está abaixo', 60, 470, 780, { fonte: 'Anton', tamanho: 56, cor: '#f97316' }),
    ],
  };
}

const CHAMADA = 'Três noites de música na praça central, a partir de R$ 19,90 por pessoa.';

function cenaDaPeca(): Prancheta {
  return {
    id: 'cena-peca', nome: 'peca', x: 0, y: 0, largura: 1080, altura: 1350, fundo: '#0c0a09',
    filhos: [
      imagem('foto-retrato', 0, 0, 1080, 1350, { foco: { x: 0.5, y: 0.7 } }),
      imagem('foto-retrato', 0, 0, 1080, 1350, { foco: { x: 0.5, y: 0.7 }, desfoque: 10, mascara: { tipo: 'degrade', angulo: 90, inicio: 0.45, fim: 0.75 } }),
      forma(0, 600, 1080, 750, degrade(270, ['#0c0a09', 0, 0], ['#0c0a09', 0.7, 0.92], ['#0c0a09', 1, 1])),
      forma(540, 120, 620, 620, radial(['#fff7ed', 0, 0.9], ['#fb923c', 0.5, 0.5], ['#fb923c', 1, 0]), { forma: 'elipse', modoDeMesclagem: 'luz-linear', opacidade: 0.55 }),
      { id: id('vetor'), nome: 'Logo', tipo: 'vetor', x: 72, y: 72, largura: 72, altura: 72, moldura: [100, 100], caminhos: [{ d: ESTRELA, preenchimento: '#fff7ed' }] },
      texto('FESTIVAL DE INVERNO · 2026', 72, 760, 800, { peso: 700, tamanho: 22, espacamento: 220, cor: '#fdba74' }),
      texto('JAZZ NA\nPRAÇA', 72, 800, 936, { fonte: 'Anton', tamanho: 190, entrelinha: 0.98, cor: '#fff7ed', altura: 380, sombra: { cor: '#000000', opacidade: 0.5, angulo: 90, distancia: 6, desfoque: 24 } }),
      texto(CHAMADA, 72, 1180, 640, { tamanho: 30, entrelinha: 1.35, cor: '#e7e5e4', altura: 90, trechos: [trecho(CHAMADA, 'R$ 19,90', { peso: 700, cor: '#fdba74' })] }),
      {
        id: id('grupo'), nome: 'Botão', tipo: 'grupo', modoDeMesclagem: 'atravessar',
        filhos: [forma(760, 1196, 248, 72, '#ea580c', { raio: 36, sombra: SOMBRA }), texto('GARANTA O SEU', 760, 1218, 248, { peso: 700, tamanho: 20, espacamento: 120, cor: '#ffffff', alinhamento: 'centro', altura: 28 })],
      },
      {
        id: id('grupo'), nome: 'Selo', tipo: 'grupo', modoDeMesclagem: 'normal', opacidade: 0.92,
        filhos: [forma(820, 90, 180, 180, '#fff7ed', { forma: 'elipse', traco: { cor: '#ea580c', espessura: 6 } }), texto('20\nJUN', 820, 118, 180, { fonte: 'Anton', tamanho: 62, entrelinha: 0.95, alinhamento: 'centro', cor: '#9a3412', altura: 130, rotacao: -10 })],
      },
      forma(0, 0, 1080, 1350, '#3b2f2f', { modoDeMesclagem: 'luz-suave', opacidade: 0.5 }),
      { id: id('ajuste'), nome: 'Níveis da peça', tipo: 'ajuste', ajuste: { tipo: 'niveis', pretoDeEntrada: 8, brancoDeEntrada: 240, gama: 1.08, pretoDeSaida: 0, brancoDeSaida: 255 } },
    ],
  };
}

export interface Cena {
  nome: string;
  prancheta: Prancheta;
}

export function cenasDeParidade(): Cena[] {
  contador = 0;
  const duzentas = documentoDe200Camadas();
  return [
    { nome: 'texto', prancheta: cenaDeTexto() },
    { nome: 'mesclagem', prancheta: cenaDeMesclagem() },
    { nome: 'mascaras', prancheta: cenaDeMascaras() },
    { nome: 'efeitos', prancheta: cenaDeEfeitos() },
    { nome: 'ajustes', prancheta: cenaDeAjustes() },
    { nome: 'peca', prancheta: cenaDaPeca() },
    ...duzentas.pranchetas.map((p) => ({ nome: `duzentas-${p.nome.toLowerCase()}`, prancheta: p })),
  ];
}
