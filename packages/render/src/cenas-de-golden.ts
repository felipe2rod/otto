// Cenas dos goldens: uma por recurso que o motor desenha, mais uma peça inteira.
// Pequenas de propósito: o golden é o PNG versionado, e o teste compara pixel a pixel, com tolerância zero.
import { MODOS_DE_MESCLAGEM } from '@otto/documento';
import { ajuste, FOTO, forma, grupo, imagem, type OpcoesDaPeca, peca, RECORTE, texto } from './apoio-de-teste';

type Nos = Parameters<typeof peca>[0];

export interface CenaDeGolden {
  nome: string;
  nos: Nos;
  opcoes: OpcoesDaPeca;
}

const SOMBRA = { cor: '#000000', opacidade: 0.45, angulo: 120, distancia: 8, desfoque: 14 };
const ESTRELA = 'M50 5C55 30 70 45 95 50C70 55 55 70 50 95C45 70 30 55 5 50C30 45 45 30 50 5Z';
const linear = (angulo: number, ...paradas: [string, number, number?][]) => ({
  tipo: 'linear',
  angulo,
  paradas: paradas.map(([cor, posicao, opacidade]) => ({ cor, posicao, ...(opacidade === undefined ? {} : { opacidade }) })),
});
const radial = (...paradas: [string, number, number?][]) => ({ ...linear(0, ...paradas), tipo: 'radial' });
const vetor = (nome: string, x: number, y: number, lado: number, caminhos: object[], extra: object = {}) => ({
  tipo: 'vetor',
  nome,
  x,
  y,
  largura: lado,
  altura: lado,
  moldura: [100, 100],
  caminhos,
  ...extra,
});

const paragrafo = 'O agente faz a produção, você faz o design. A partir de R$ 19,90 por pessoa, com entrada franca.';
const trecho = (parte: string, estilo: object) => ({ inicio: paragrafo.indexOf(parte), fim: paragrafo.indexOf(parte) + parte.length, ...estilo });

export function cenasDeGolden(): CenaDeGolden[] {
  return [
    {
      nome: 'formas',
      opcoes: { largura: 480, altura: 320, fundo: '#fafaf9' },
      nos: [
        forma('retangulo', 20, 20, 120, 80, '#c2410c'),
        forma('arredondado', 160, 20, 120, 80, '#1d4ed8', { raio: 20 }),
        forma('elipse', 300, 20, 160, 80, '#0f766e', { forma: 'elipse' }),
        forma('traco', 20, 120, 120, 80, '#e2e8f0', { raio: 16, traco: { cor: '#0f172a', espessura: 8 } }),
        forma('linear', 160, 120, 120, 80, linear(45, ['#0ea5e9', 0], ['#22c55e', 0.5], ['#fde047', 1])),
        forma('radial', 300, 120, 160, 80, radial(['#ffffff', 0], ['#7c3aed', 0.6], ['#1e1b4b', 1])),
        forma('girado', 40, 220, 140, 60, '#be123c', { rotacao: 12 }),
        forma('transparente', 220, 220, 140, 60, linear(0, ['#000000', 0, 0], ['#000000', 1])),
        forma('opacidade', 380, 220, 80, 60, '#000000', { opacidade: 0.35, forma: 'elipse' }),
      ],
    },
    {
      nome: 'texto',
      opcoes: { largura: 600, altura: 420, fundo: '#f4efe6' },
      nos: [
        texto('sobretitulo', 'FESTIVAL DE INVERNO', { x: 24, y: 20, largura: 500, altura: 30, peso: 700, tamanho: 16, espacamento: 250, cor: '#c2410c' }),
        texto('titulo', 'JAZZ NA PRAÇA', { x: 24, y: 44, largura: 560, altura: 90, fonte: 'Anton', tamanho: 72, espacamento: 20, entrelinha: 1, cor: '#1c1917' }),
        texto('paragrafo', paragrafo, {
          x: 24,
          y: 140,
          largura: 300,
          altura: 200,
          tamanho: 18,
          entrelinha: 1.45,
          cor: '#1c1917',
          trechos: [trecho('agente', { peso: 700 }), trecho('R$ 19,90', { fonte: 'Anton', tamanho: 34, cor: '#c2410c' }), trecho('entrada franca', { espacamento: 150, cor: '#1d4ed8' })],
        }),
        texto('centro', 'Sábado\n20 de junho', { x: 340, y: 140, largura: 240, altura: 90, fonte: 'DM Serif Display', tamanho: 32, alinhamento: 'centro', entrelinha: 1.1, cor: '#1c1917' }),
        texto('direita', 'até as 19h', { x: 340, y: 230, largura: 240, altura: 30, tamanho: 18, alinhamento: 'direita', cor: '#44403c' }),
        texto('caixa-alta', 'caixa alta', { x: 340, y: 262, largura: 240, altura: 30, tamanho: 20, caixaAlta: true, cor: '#1c1917' }),
        texto('versalete', 'Versalete Sintético', { x: 340, y: 292, largura: 240, altura: 30, tamanho: 20, versalete: true, cor: '#1c1917' }),
        texto('sem-kerning', 'AVATAR', { x: 24, y: 340, largura: 280, altura: 60, fonte: 'DM Serif Display', tamanho: 44, kerning: 'nenhum', cor: '#1c1917' }),
        texto('girado', 'girado', { x: 420, y: 340, largura: 140, altura: 50, fonte: 'DM Serif Display', tamanho: 40, rotacao: -8, cor: '#7c2d12' }),
      ],
    },
    {
      nome: 'imagem',
      opcoes: { largura: 600, altura: 300, fundo: '#e7e5e4' },
      nos: [
        imagem('cobrir', FOTO, 10, 10, 130, 130),
        imagem('conter', FOTO, 150, 10, 130, 130, { ajuste: 'conter' }),
        imagem('foco-e-zoom', FOTO, 290, 10, 130, 130, { foco: { x: 0.85, y: 0.5 }, zoom: 2.2 }),
        imagem('recorte-elipse', FOTO, 430, 10, 160, 130, { recorte: { forma: 'elipse', raio: 0 } }),
        imagem('recorte-arredondado-girado', FOTO, 20, 160, 120, 120, { recorte: { forma: 'retangulo', raio: 24 }, rotacao: 10 }),
        imagem('ajuste-de-cor', FOTO, 150, 150, 130, 130, { ajusteDeCor: { brilho: 15, contraste: 30, saturacao: -40 } }),
        imagem('duotone', FOTO, 290, 150, 130, 130, { ajusteDeCor: { duotone: { sombras: '#1b1f4b', luzes: '#e9b44c' } } }),
        imagem('com-alfa', RECORTE, 430, 150, 160, 140, { larguraOriginal: 600, alturaOriginal: 800, ajuste: 'conter' }),
      ],
    },
    {
      nome: 'vetor',
      opcoes: { largura: 300, altura: 200, fundo: '#fafaf9', tokens: { marca: '#7c3aed' } },
      nos: [
        vetor('preenchido', 10, 10, 80, [{ d: ESTRELA, preenchimento: '#0f766e' }]),
        vetor('traco-redondo', 110, 10, 80, [{ d: 'M10 80C10 80 50 10 50 10C50 10 90 80 90 80', traco: { cor: '#b45309', espessura: 10, ponta: 'redonda', juncao: 'redonda' } }]),
        vetor('traco-reto', 210, 10, 80, [{ d: 'M10 80C10 80 50 10 50 10C50 10 90 80 90 80', traco: { cor: '#1d4ed8', espessura: 10, ponta: 'quadrada', juncao: 'chanfrada' } }]),
        vetor('par-impar', 10, 110, 80, [
          { d: 'M5 5C5 5 95 5 95 5C95 5 95 95 95 95C95 95 5 95 5 95ZM30 30C30 30 70 30 70 30C70 30 70 70 70 70C70 70 30 70 30 70Z', preenchimento: '#be123c', regra: 'par-impar' },
        ]),
        vetor('duas-cores-girado', 110, 110, 80, [{ d: ESTRELA, preenchimento: '#fde047', traco: { cor: '#1c1917', espessura: 4 } }], {
          rotacao: 20,
          sombra: { ...SOMBRA, desfoque: 6, distancia: 4 },
        }),
        { ...vetor('esticado', 210, 120, 80, [{ d: ESTRELA, preenchimento: 'token:marca' }]), altura: 50 },
      ],
    },
    {
      nome: 'grupos',
      opcoes: { largura: 400, altura: 300, fundo: '#e7e5e4' },
      nos: [
        forma('fundo', 0, 150, 400, 150, '#ff8000'),
        grupo('opacidade', [forma('a', 20, 20, 100, 100, '#ff0000'), forma('b', 60, 60, 100, 100, '#0000ff')], { modoDeMesclagem: 'normal', opacidade: 0.5 }),
        grupo(
          'multiplicacao',
          [forma('c', 200, 100, 120, 120, '#f59e0b', { forma: 'elipse' }), texto('d', 'grupo', { x: 210, y: 130, largura: 150, altura: 60, fonte: 'Anton', tamanho: 48, cor: '#ffffff' })],
          { modoDeMesclagem: 'multiplicacao', opacidade: 0.8 },
        ),
        grupo('atravessar', [forma('e', 30, 190, 120, 80, '#808080', { modoDeMesclagem: 'multiplicacao' })]),
        grupo('com-mascara', [forma('f', 240, 20, 140, 60, '#14532d'), texto('g', 'some', { x: 250, y: 30, largura: 120, altura: 40, tamanho: 28, cor: '#ffffff' })], {
          modoDeMesclagem: 'normal',
          mascara: { tipo: 'degrade', angulo: 0, inicio: 0.2, fim: 0.9 },
        }),
        grupo('subtrair', [forma('h', 180, 230, 200, 50, '#404040', { raio: 25 })], { modoDeMesclagem: 'subtrair' }),
      ],
    },
    {
      nome: 'mascaras',
      opcoes: { largura: 600, altura: 300, fundo: '#e7e5e4' },
      nos: [
        imagem('degrade', FOTO, 10, 10, 180, 130, { mascara: { tipo: 'degrade', angulo: 0, inicio: 0.25, fim: 0.95 } }),
        forma('forma-suave', 200, 10, 120, 130, '#1d4ed8', { mascara: { tipo: 'forma', forma: 'elipse', x: 215, y: 25, largura: 90, altura: 100, suavizar: 8 } }),
        forma('invertida', 330, 10, 120, 130, '#be123c', { mascara: { tipo: 'forma', forma: 'retangulo', x: 350, y: 30, largura: 80, altura: 90, raio: 20, suavizar: 4, inverter: true } }),
        forma('degrade-vertical', 460, 10, 130, 130, '#000000', { mascara: { tipo: 'degrade', angulo: 90, inicio: 0.1, fim: 0.9 } }),
        texto('recorte-base', 'OTTO', { x: 10, y: 150, largura: 400, altura: 140, fonte: 'Anton', tamanho: 130, entrelinha: 1, cor: '#000000' }),
        imagem('recorte-foto', FOTO, 10, 150, 400, 140, { recortadaNaDeBaixo: true }),
        forma('recorte-pelicula', 10, 220, 400, 70, '#3b0764', { recortadaNaDeBaixo: true, modoDeMesclagem: 'multiplicacao', opacidade: 0.6 }),
        forma('recorte-base-2', 430, 160, 150, 120, '#22c55e', { forma: 'elipse' }),
        // ajuste recortado na elipse, e só na metade esquerda dela (a máscara do ajuste é em coordenadas da prancheta)
        ajuste('recorte-ajuste', { tipo: 'preto-e-branco' }, { recortadaNaDeBaixo: true, mascara: { tipo: 'forma', forma: 'retangulo', x: 430, y: 160, largura: 75, altura: 120 } }),
      ],
    },
    {
      nome: 'sombra-e-desfoque',
      opcoes: { largura: 480, altura: 240, fundo: '#fafaf9' },
      nos: [
        forma('sombra', 20, 20, 120, 80, '#ffffff', { raio: 12, sombra: SOMBRA }),
        forma('sombra-colorida', 170, 20, 80, 80, '#f97316', { forma: 'elipse', sombra: { cor: '#7c2d12', opacidade: 0.8, angulo: 45, distancia: 12, desfoque: 4 } }),
        texto('sombra-no-texto', 'Sombra', { x: 280, y: 20, largura: 190, altura: 70, fonte: 'Anton', tamanho: 56, cor: '#0f766e', sombra: { ...SOMBRA, distancia: 4, desfoque: 6 } }),
        imagem('sombra-na-imagem', RECORTE, 20, 120, 90, 110, { larguraOriginal: 600, alturaOriginal: 800, ajuste: 'conter', sombra: { ...SOMBRA, desfoque: 20 } }),
        forma('desfoque', 150, 130, 100, 90, '#dc2626', { forma: 'elipse', filtros: [{ tipo: 'desfoque', raio: 8 }] }),
        imagem('desfoque-na-foto', FOTO, 280, 120, 180, 100, { filtros: [{ tipo: 'desfoque', raio: 5 }] }),
      ],
    },
    {
      nome: 'modos',
      opcoes: { largura: 468, altura: 300, fundo: '#202020' },
      nos: [
        imagem('foto', FOTO, 0, 0, 468, 300),
        ...MODOS_DE_MESCLAGEM.map((modo, i) =>
          forma(modo, 10 + (i % 7) * 64, 10 + Math.floor(i / 7) * 72, 56, 60, radial(['#ffd166', 0], ['#ef476f', 0.55], ['#118ab2', 1, 0.7]), { raio: 8, modoDeMesclagem: modo, opacidade: 0.9 }),
        ),
      ],
    },
    {
      nome: 'ajustes',
      opcoes: { largura: 540, altura: 240, fundo: '#000000', tokens: { marca: '#ec8a00' } },
      nos: [
        imagem('foto', FOTO, 0, 0, 540, 240),
        ...(
          [
            {
              tipo: 'curvas',
              rgb: [
                [0, 0],
                [128, 170],
                [255, 255],
              ],
              azul: [
                [0, 30],
                [255, 220],
              ],
            },
            { tipo: 'niveis', pretoDeEntrada: 20, brancoDeEntrada: 200, gama: 1.3 },
            { tipo: 'matiz-saturacao', matiz: 150, saturacao: 30 },
            { tipo: 'brilho-contraste', brilho: 30, contraste: 50 },
            { tipo: 'vibracao', vibracao: 80, saturacao: -10 },
            { tipo: 'equilibrio-de-cor', sombras: [30, 0, -20], realces: [0, -15, 40] },
            { tipo: 'filtro-de-foto', cor: 'token:marca', densidade: 60 },
            { tipo: 'preto-e-branco' },
            {
              tipo: 'mapa-de-degrade',
              paradas: [
                { cor: '#1b1f4b', posicao: 0 },
                { cor: '#c2410c', posicao: 0.6 },
                { cor: '#e9b44c', posicao: 1 },
              ],
            },
          ] as { tipo: string }[]
        ).map((a, i) => ajuste(a.tipo, a, { mascara: { tipo: 'forma', forma: 'retangulo', x: i * 60, y: i % 2 ? 20 : 0, largura: 56, altura: 220 }, ...(i === 3 ? { opacidade: 0.6 } : {}) })),
      ],
    },
    {
      nome: 'peca',
      opcoes: { largura: 540, altura: 675, fundo: 'token:fundo', tokens: { fundo: '#0c0a09', marca: '#ea580c', claro: '#fff7ed' } },
      nos: [
        imagem('foto', FOTO, 0, 0, 540, 675, { foco: { x: 0.6, y: 0.5 } }),
        imagem('foto-desfocada', FOTO, 0, 0, 540, 675, { foco: { x: 0.6, y: 0.5 }, filtros: [{ tipo: 'desfoque', raio: 6 }], mascara: { tipo: 'degrade', angulo: 90, inicio: 0.45, fim: 0.75 } }),
        forma('pelicula', 0, 300, 540, 375, linear(270, ['token:fundo', 0, 0], ['token:fundo', 0.7, 0.92], ['token:fundo', 1, 1])),
        forma('luz', 270, 60, 310, 310, radial(['#fff7ed', 0, 0.9], ['#fb923c', 0.5, 0.5], ['#fb923c', 1, 0]), { forma: 'elipse', modoDeMesclagem: 'luz-linear', opacidade: 0.55 }),
        vetor('logo', 36, 36, 36, [{ d: ESTRELA, preenchimento: 'token:claro' }]),
        texto('sobretitulo', 'FESTIVAL DE INVERNO · 2026', { x: 36, y: 380, largura: 400, altura: 20, peso: 700, tamanho: 11, espacamento: 220, cor: '#fdba74' }),
        texto('titulo', 'JAZZ NA\nPRAÇA', {
          x: 36,
          y: 400,
          largura: 468,
          altura: 190,
          fonte: 'Anton',
          tamanho: 95,
          entrelinha: 0.98,
          cor: 'token:claro',
          sombra: { cor: '#000000', opacidade: 0.5, angulo: 90, distancia: 3, desfoque: 12 },
        }),
        grupo('botao', [
          forma('fundo-do-botao', 380, 598, 124, 36, 'token:marca', { raio: 18, sombra: { ...SOMBRA, desfoque: 8, distancia: 4 } }),
          texto('texto-do-botao', 'GARANTA O SEU', { x: 380, y: 609, largura: 124, altura: 14, peso: 700, tamanho: 10, espacamento: 120, cor: '#ffffff', alinhamento: 'centro' }),
        ]),
        grupo(
          'selo',
          [
            forma('disco', 410, 45, 90, 90, 'token:claro', { forma: 'elipse', traco: { cor: 'token:marca', espessura: 3 } }),
            texto('data', '20\nJUN', { x: 410, y: 59, largura: 90, altura: 65, fonte: 'Anton', tamanho: 31, entrelinha: 0.95, alinhamento: 'centro', cor: '#9a3412', rotacao: -10 }),
          ],
          { modoDeMesclagem: 'normal', opacidade: 0.92 },
        ),
        forma('veu', 0, 0, 540, 675, '#3b2f2f', { modoDeMesclagem: 'luz-suave', opacidade: 0.5 }),
        ajuste('niveis', { tipo: 'niveis', pretoDeEntrada: 8, brancoDeEntrada: 240, gama: 1.08 }),
      ],
    },
  ];
}
