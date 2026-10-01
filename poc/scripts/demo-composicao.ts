// Monta um documento que usa todos os recursos de composição e renderiza em dados/amostras.
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { documentoVazio } from '../src/documento/esquema';
import { aplicarLote } from '../src/documento/operacoes';
import { carregarImagens, criarCanvasNode, fonteDeImagens, medidorNode, novoCanvas } from '../src/servidor/canvas-node';
import { type Ctx, renderizarPrancheta } from '../src/render/render';

const FOTO = { arquivo: 'ea06e29d42846e9e92d344a00597e109ec6c2da954e370505e20de4286e79110', larguraOriginal: 1280, alturaOriginal: 853 };
const r = aplicarLote(documentoVazio('demo de composição'), [
  { op: 'criarPrancheta', nome: 'P', largura: 1080, altura: 1350, fundo: '#10131f' },
  // foto de fundo desfocada, esmaecendo para baixo
  { op: 'criarNo', prancheta: 'P', no: { tipo: 'imagem', nome: 'Fundo desfocado', x: 0, y: 0, largura: 1080, altura: 1350, ...FOTO, filtros: [{ tipo: 'desfoque', raio: 18 }], mascara: { tipo: 'degrade', angulo: 270, inicio: 0.2, fim: 0.9 }, opacidade: 0.55 } },
  // título com a foto dentro (máscara de recorte)
  { op: 'criarNo', prancheta: 'P', no: { tipo: 'texto', nome: 'Título', x: 60, y: 120, largura: 960, altura: 620, conteudo: 'JAZZ', fonte: 'Anton', tamanho: 560, entrelinha: 1, espacamento: -20, cor: '#ffffff' } },
  { op: 'criarNo', prancheta: 'P', no: { tipo: 'imagem', nome: 'Foto no título', x: 0, y: 80, largura: 1080, altura: 720, ...FOTO, recortadaNaDeBaixo: true } },
  // luz em "luz linear" (modo não nativo) com borda suave
  { op: 'criarNo', prancheta: 'P', no: { tipo: 'forma', forma: 'elipse', nome: 'Luz', x: 600, y: 700, largura: 700, altura: 700, preenchimento: '#e9b44c', modoDeMesclagem: 'luz-linear', opacidade: 0.5, mascara: { tipo: 'forma', forma: 'elipse', x: 600, y: 700, largura: 700, altura: 700, suavizar: 80 } } },
  // subtítulo e grupo em multiplicação
  { op: 'criarNo', prancheta: 'P', no: { tipo: 'texto', nome: 'Subtítulo', x: 72, y: 830, largura: 900, altura: 160, conteudo: 'na Praça · 14 a 16 de novembro', fonte: 'Instrument Serif', tamanho: 64, cor: '#f3ecdd' } },
  { op: 'criarNo', prancheta: 'P', no: { tipo: 'forma', forma: 'retangulo', nome: 'Faixa', x: 0, y: 1150, largura: 1080, altura: 200, preenchimento: '#e9b44c' } },
  { op: 'criarNo', prancheta: 'P', no: { tipo: 'texto', nome: 'Rodapé', x: 72, y: 1215, largura: 900, altura: 60, conteudo: 'ENTRADA GRATUITA', fonte: 'IBM Plex Sans', peso: 700, tamanho: 40, espacamento: 200, cor: '#10131f' } },
  { op: 'agrupar', alvos: ['P/Faixa', 'P/Rodapé'], nome: 'Base', modoDeMesclagem: 'multiplicacao' },
  // grão sobre tudo, em sobrepor
  { op: 'criarNo', prancheta: 'P', no: { tipo: 'forma', forma: 'retangulo', nome: 'Grão', x: 0, y: 0, largura: 1080, altura: 1350, preenchimento: '#808080', modoDeMesclagem: 'sobrepor', opacidade: 0.35, filtros: [{ tipo: 'ruido', quantidade: 0.25, monocromatico: true }] } },
  // tratamento de cor da peça inteira
  { op: 'criarNo', prancheta: 'P', no: { tipo: 'ajuste', nome: 'Curvas', ajuste: { tipo: 'curvas', rgb: [[0, 12], [70, 55], [190, 205], [255, 250]] } } },
  { op: 'criarNo', prancheta: 'P', no: { tipo: 'ajuste', nome: 'Filtro quente', opacidade: 0.6, ajuste: { tipo: 'filtro-de-foto', cor: '#e9b44c', densidade: 30 } } },
], { tipo: 'designer' }, medidorNode);
if (!r.ok) throw new Error(JSON.stringify(r.erro));
await carregarImagens(r.doc);
const p = r.doc.pranchetas[0]!;
const t0 = performance.now();
const canvas = novoCanvas(p.largura, p.altura);
renderizarPrancheta(canvas.getContext('2d') as unknown as Ctx, r.doc, p, fonteDeImagens, { criarCanvas: criarCanvasNode });
console.log(`render em ${Math.round(performance.now() - t0)} ms`);
await writeFile(path.resolve(import.meta.dirname, '../dados/amostras/demo-composicao.png'), await canvas.encode('png'));
await writeFile(path.resolve(import.meta.dirname, '../dados/amostras/demo-composicao.json'), JSON.stringify(r.doc));
