// Um recurso por cena, para atribuir a cada um a diferença entre o raster de GPU e o de CPU.
import type { No, Prancheta } from '../motor/tipos.ts';
import { degrade, forma, imagem, radial, texto } from './cenas.ts';

const SOMBRA = { cor: '#000000', opacidade: 0.5, angulo: 120, distancia: 10, desfoque: 18 };
const ESTRELA = 'M50 5 C55 30 70 45 95 50 C70 55 55 70 50 95 C45 70 30 55 5 50 C30 45 45 30 50 5 Z';
const foto = (): No => imagem('foto-paisagem', 0, 0, 600, 400);

function cena(nome: string, filhos: No[], fundo = '#e7e5e4'): { nome: string; prancheta: Prancheta } {
  return { nome, prancheta: { id: `causa-${nome}`, nome, x: 0, y: 0, largura: 600, altura: 400, fundo, filhos } };
}

export function cenasDeCausa(): { nome: string; prancheta: Prancheta }[] {
  return [
    cena('retângulo alinhado ao pixel', [forma(100, 100, 400, 200, '#c2410c')]),
    cena('retângulo em meio pixel', [forma(100.5, 100.5, 400, 200, '#c2410c')]),
    cena('retângulo arredondado', [forma(100, 100, 400, 200, '#c2410c', { raio: 40 })]),
    cena('elipse', [forma(100, 60, 400, 280, '#1d4ed8', { forma: 'elipse' })]),
    cena('retângulo girado 12°', [forma(150, 100, 300, 200, '#0f766e', { rotacao: 12 })]),
    cena('traço interno', [forma(100, 100, 400, 200, '#e2e8f0', { raio: 30, traco: { cor: '#0f172a', espessura: 10 } })]),
    cena('vetor preenchido e em traço', [
      { id: 'v1', nome: 'v1', tipo: 'vetor', x: 60, y: 80, largura: 220, altura: 220, moldura: [100, 100], caminhos: [{ d: ESTRELA, preenchimento: '#0f766e' }] },
      { id: 'v2', nome: 'v2', tipo: 'vetor', x: 320, y: 80, largura: 220, altura: 220, moldura: [100, 100], caminhos: [{ d: ESTRELA, traco: { cor: '#b45309', espessura: 6 } }] },
    ]),
    cena('texto de 22 px', [texto('O agente faz a produção, você faz o design. Texto corrido em caixa, com acentuação e número 1234567890.', 40, 40, 520, { tamanho: 22, entrelinha: 1.4 })]),
    cena('texto de 96 px', [texto('JAZZ na praça', 30, 60, 560, { fonte: 'Anton', tamanho: 96 })]),
    cena('texto de 220 px', [texto('Otto', 30, 40, 560, { fonte: 'Anton', tamanho: 220, entrelinha: 1 })]),
    cena('texto girado', [texto('girado 8 graus', 60, 150, 480, { fonte: 'Instrument Serif', tamanho: 64, rotacao: -8 })]),
    cena('degradê linear', [forma(0, 0, 600, 400, degrade(30, ['#111827', 0], ['#f43f5e', 0.5], ['#fde047', 1]))]),
    cena('degradê radial', [forma(0, 0, 600, 400, radial(['#ffffff', 0], ['#7c3aed', 0.6], ['#1e1b4b', 1]))]),
    cena('degradê com transparência', [foto(), forma(0, 0, 600, 400, degrade(270, ['#0c0a09', 0, 0], ['#0c0a09', 1, 0.95]))]),
    cena('foto ampliada (cobrir)', [imagem('foto-paisagem', 0, 0, 600, 400, { zoom: 2.4 })]),
    cena('foto reduzida a 47%', [foto()]),
    cena('foto reduzida a 12%', [imagem('foto-paisagem', 220, 150, 154, 102)]),
    cena('foto girada com recorte arredondado', [imagem('foto-retrato', 180, 60, 240, 280, { rotacao: 12, recorte: { forma: 'retangulo', raio: 36 } })]),
    cena('imagem com alfa', [imagem('recorte-com-alfa', 150, 0, 300, 400, { ajuste: 'conter' })]),
    cena('opacidade 50%', [foto(), forma(100, 100, 400, 200, '#c2410c', { opacidade: 0.5 })]),
    cena('sombra projetada', [forma(150, 100, 300, 200, '#ffffff', { raio: 16, sombra: SOMBRA })]),
    cena('desfoque de forma (σ 14)', [forma(150, 80, 300, 240, '#dc2626', { forma: 'elipse', desfoque: 14 })]),
    cena('desfoque de foto (σ 8)', [imagem('foto-paisagem', 100, 60, 400, 280, { desfoque: 8 })]),
    cena('máscara em degradê', [forma(0, 0, 600, 400, '#000000', { mascara: { tipo: 'degrade', angulo: 0, inicio: 0.1, fim: 0.9 } })]),
    cena('máscara de forma suave (σ 12)', [forma(0, 0, 600, 400, '#1d4ed8', { mascara: { tipo: 'forma', forma: 'elipse', x: 150, y: 80, largura: 300, altura: 240, raio: 0, suavizar: 12, inverter: false } })]),
    cena('máscara de recorte', [texto('OTTO', 30, 60, 560, { fonte: 'Anton', tamanho: 220, entrelinha: 1, altura: 240 }), imagem('foto-paisagem', 30, 60, 560, 260, { recortadaNaDeBaixo: true })]),
    cena('grupo com opacidade', [foto(), { id: 'g', nome: 'g', tipo: 'grupo', modoDeMesclagem: 'normal', opacidade: 0.7, filhos: [forma(100, 80, 240, 240, '#f59e0b', { forma: 'elipse' }), forma(260, 120, 240, 200, '#0ea5e9')] }]),
    ...(['multiplicacao', 'tela', 'sobrepor', 'luz-suave', 'matiz', 'luminosidade', 'luz-linear', 'subtrair', 'luz-intensa', 'dividir', 'mistura-solida', 'cor-mais-clara'] as const).map((modo) =>
      cena(`modo ${modo}`, [foto(), forma(100, 60, 400, 280, radial(['#ffd166', 0], ['#ef476f', 0.55], ['#118ab2', 1]), { modoDeMesclagem: modo, opacidade: 0.9 })]),
    ),
    cena('ajuste níveis', [foto(), { id: 'a', nome: 'a', tipo: 'ajuste', ajuste: { tipo: 'niveis', pretoDeEntrada: 10, brancoDeEntrada: 238, gama: 1.1, pretoDeSaida: 0, brancoDeSaida: 255 } }]),
    cena('ajuste matiz e saturação', [foto(), { id: 'a', nome: 'a', tipo: 'ajuste', ajuste: { tipo: 'matiz-saturacao', matiz: 150, saturacao: 30, luminosidade: 0 } }]),
    cena('ajuste com máscara em degradê', [foto(), { id: 'a', nome: 'a', tipo: 'ajuste', ajuste: { tipo: 'preto-e-branco' }, mascara: { tipo: 'degrade', angulo: 0, inicio: 0.2, fim: 0.8 } }]),
  ];
}
