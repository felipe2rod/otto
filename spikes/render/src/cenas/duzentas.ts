// Documento sintético de 200 camadas, com a mistura de uma peça real: foto, forma, texto, grupo,
// sombra, modo de mesclagem, máscara, máscara de recorte, desfoque e camada de ajuste.
// Quatro pranchetas de 50 camadas (grupos contam como camada, como no Photoshop).
// Determinístico: nenhuma posição vem de Math.random.
import { type Degrade, type Documento, type No, type NoForma, type NoImagem, type NoTexto, type Prancheta, todasAsCamadas } from '../motor/tipos.ts';

const SOMBRA = { cor: '#000000', opacidade: 0.4, angulo: 120, distancia: 8, desfoque: 16 };
const ESTRELA = 'M50 5 C55 30 70 45 95 50 C70 55 55 70 50 95 C45 70 30 55 5 50 C30 45 45 30 50 5 Z';

const FORMATOS: { nome: string; largura: number; altura: number }[] = [
  { nome: 'Feed', largura: 1080, altura: 1350 },
  { nome: 'Story', largura: 1080, altura: 1920 },
  { nome: 'Quadrado', largura: 1080, altura: 1080 },
  { nome: 'Banner', largura: 1200, altura: 628 },
];

const linear = (angulo: number, ...paradas: [string, number, number?][]): Degrade => ({ tipo: 'linear', angulo, paradas: paradas.map(([cor, posicao, opacidade]) => ({ cor, posicao, ...(opacidade === undefined ? {} : { opacidade }) })) });

function prancheta(indice: number, formato: (typeof FORMATOS)[number], x: number): Prancheta {
  const { largura: L, altura: A } = formato;
  let n = 0;
  const id = (tipo: string): string => `p${indice}-${tipo}-${++n}`;
  const txt = (nome: string, conteudo: string, x0: number, y0: number, largura: number, extra: Partial<Omit<NoTexto, 'tipo'>> = {}): NoTexto => ({ id: id('texto'), nome, tipo: 'texto', conteudo, x: x0, y: y0, largura, altura: 60, fonte: 'IBM Plex Sans', peso: 400, tamanho: 24, cor: '#fafaf9', entrelinha: 1.25, espacamento: 0, alinhamento: 'esquerda', ...extra });
  const frm = (nome: string, x0: number, y0: number, largura: number, altura: number, preenchimento: NoForma['preenchimento'], extra: Partial<Omit<NoForma, 'tipo'>> = {}): NoForma => ({ id: id('forma'), nome, tipo: 'forma', forma: 'retangulo', x: x0, y: y0, largura, altura, preenchimento, ...extra });
  const img = (nome: string, arquivo: string, x0: number, y0: number, largura: number, altura: number, extra: Partial<Omit<NoImagem, 'tipo'>> = {}): NoImagem => ({ id: id('imagem'), nome, tipo: 'imagem', arquivo, x: x0, y: y0, largura, altura, ajuste: 'cobrir', ...extra });

  const m = Math.round(L * 0.06);
  const retrato = A > L;
  const filhos: No[] = [];

  // 1 a 3: fundo
  filhos.push(img('Foto de fundo', retrato ? 'foto-retrato' : 'foto-paisagem', 0, 0, L, A, { foco: { x: 0.5, y: 0.6 } }));
  filhos.push(frm('Película', 0, A * 0.35, L, A * 0.65, linear(270, ['#0c0a09', 0, 0], ['#0c0a09', 0.75, 0.9], ['#0c0a09', 1, 0.96])));
  filhos.push(frm('Cor da marca', 0, 0, L, A, '#7c2d12', { modoDeMesclagem: 'luz-suave', opacidade: 0.6, mascara: { tipo: 'degrade', angulo: 0, inicio: 0.1, fim: 0.9 } }));

  // 4 a 9: elementos decorativos, alguns com modo e desfoque
  filhos.push(frm('Luz', L * 0.45, A * 0.05, L * 0.6, L * 0.6, { tipo: 'radial', angulo: 0, paradas: [{ cor: '#fff7ed', posicao: 0, opacidade: 0.9 }, { cor: '#fb923c', posicao: 1, opacidade: 0 }] }, { forma: 'elipse', modoDeMesclagem: 'tela', opacidade: 0.7 }));
  filhos.push(frm('Disco', -L * 0.12, A * 0.1, L * 0.5, L * 0.5, '#f59e0b', { forma: 'elipse', modoDeMesclagem: 'multiplicacao', opacidade: 0.5 }));
  filhos.push(frm('Mancha', L * 0.55, A * 0.3, L * 0.4, L * 0.25, '#0ea5e9', { forma: 'elipse', desfoque: 18, opacidade: 0.5 }));
  filhos.push(frm('Faixa', 0, A * 0.48, L, 8, '#fdba74', { opacidade: 0.9 }));
  filhos.push(frm('Moldura', m / 2, m / 2, L - m, A - m, '#fff7ed', { opacidade: 0.12, traco: { cor: '#fff7ed', espessura: 3 } }));
  filhos.push(frm('Sobreposição', 0, A * 0.6, L, A * 0.4, '#1e1b4b', { modoDeMesclagem: 'multiplicacao', opacidade: 0.35 }));

  // 10 a 34: grupo de 6 cartões, cada um com fundo com sombra, foto recortada e dois textos
  const cartoes: No[] = [];
  const colunas = retrato ? 2 : 3;
  const lc = (L - 2 * m - (colunas - 1) * 16) / colunas;
  const ac = retrato ? lc * 0.62 : lc * 0.5;
  const topo = A * (retrato ? 0.52 : 0.5);
  for (let k = 0; k < 6; k++) {
    const cx = m + (k % colunas) * (lc + 16);
    const cy = topo + Math.floor(k / colunas) * (ac + 16);
    cartoes.push(frm(`Cartão ${k + 1}`, cx, cy, lc, ac, '#fafaf9', { raio: 14, sombra: SOMBRA }));
    cartoes.push(img(`Foto ${k + 1}`, k % 2 ? 'foto-paisagem' : 'foto-retrato', cx + 8, cy + 8, ac - 16, ac - 16, { recorte: { forma: k % 3 === 0 ? 'elipse' : 'retangulo', raio: 10 }, foco: { x: 0.2 + 0.12 * k, y: 0.6 }, zoom: 1.4 }));
    cartoes.push(txt(`Título ${k + 1}`, ['Quinta', 'Sexta', 'Sábado', 'Domingo', 'Feriado', 'Extra'][k]!, cx + ac, cy + 10, lc - ac - 8, { peso: 700, tamanho: Math.max(14, ac * 0.2), cor: '#1c1917', altura: ac * 0.3 }));
    cartoes.push(txt(`Detalhe ${k + 1}`, `${18 + k}h · R$ ${19 + k * 5},90`, cx + ac, cy + 10 + ac * 0.32, lc - ac - 8, { tamanho: Math.max(11, ac * 0.13), cor: '#57534e', altura: ac * 0.25 }));
  }
  filhos.push({ id: id('grupo'), nome: 'Programação', tipo: 'grupo', modoDeMesclagem: 'atravessar', filhos: cartoes });

  // 35 a 40: textos
  filhos.push(txt('Sobretítulo', 'FESTIVAL DE INVERNO · 2026', m, A * 0.2, L - 2 * m, { peso: 700, tamanho: L * 0.02, espacamento: 220, cor: '#fdba74' }));
  filhos.push(txt('Título', 'JAZZ NA PRAÇA', m, A * 0.23, L - 2 * m, { fonte: 'Anton', tamanho: retrato ? L * 0.15 : L * 0.1, entrelinha: 1, altura: L * 0.18, sombra: { ...SOMBRA, desfoque: 24, distancia: 6 } }));
  filhos.push(txt('Subtítulo', 'Três noites de música na praça central', m, A * (retrato ? 0.36 : 0.4), L * 0.7, { fonte: 'DM Serif Display', tamanho: L * 0.035, altura: L * 0.05 }));
  filhos.push(txt('Texto', 'Entrada a partir de R$ 19,90 por pessoa, com programação para todas as idades e praça de alimentação.', m, A * (retrato ? 0.4 : 0.455), L * 0.62, { tamanho: L * 0.02, entrelinha: 1.4, cor: '#e7e5e4', altura: L * 0.07, trechos: [{ inicio: 19, fim: 27, peso: 700, cor: '#fdba74' }] }));
  filhos.push(txt('Rodapé', 'jazznapraca.com.br', m, A - m - L * 0.02, L * 0.5, { fonte: 'Space Mono', tamanho: L * 0.016, cor: '#d6d3d1', altura: L * 0.03 }));
  filhos.push(txt('Data lateral', '20 · 21 · 22 JUN', L - m - L * 0.3, A - m - L * 0.02, L * 0.3, { peso: 500, tamanho: L * 0.016, espacamento: 100, alinhamento: 'direita', altura: L * 0.03 }));

  // 41 e 42: botão
  filhos.push(frm('Botão', L - m - L * 0.24, A * 0.2, L * 0.24, L * 0.06, '#ea580c', { raio: L * 0.03, sombra: SOMBRA }));
  filhos.push(txt('Texto do botão', 'GARANTA O SEU', L - m - L * 0.24, A * 0.2 + L * 0.019, L * 0.24, { peso: 700, tamanho: L * 0.017, espacamento: 120, alinhamento: 'centro', altura: L * 0.03 }));

  // 43 e 44: máscara de recorte (foto dentro da palavra)
  filhos.push(txt('Palavra com foto', 'AO VIVO', m, A * 0.08, L * 0.6, { fonte: 'Anton', tamanho: L * 0.1, entrelinha: 1, altura: L * 0.12, cor: '#000000' }));
  filhos.push(img('Foto na palavra', 'foto-paisagem', m, A * 0.08, L * 0.6, L * 0.12, { recortadaNaDeBaixo: true, foco: { x: 0.7, y: 0.5 } }));

  // 45 a 47: selo (grupo com opacidade, forma e texto girado)
  filhos.push({
    id: id('grupo'), nome: 'Selo', tipo: 'grupo', modoDeMesclagem: 'normal', opacidade: 0.92,
    filhos: [
      frm('Disco do selo', L - m - L * 0.16, A * 0.05, L * 0.16, L * 0.16, '#fff7ed', { forma: 'elipse', traco: { cor: '#ea580c', espessura: 5 } }),
      txt('Texto do selo', '20\nJUN', L - m - L * 0.16, A * 0.05 + L * 0.025, L * 0.16, { fonte: 'Anton', tamanho: L * 0.055, entrelinha: 0.95, alinhamento: 'centro', cor: '#9a3412', altura: L * 0.12, rotacao: -10 }),
    ],
  });

  // 48 e 49: camadas de ajuste na peça inteira
  filhos.push({ id: id('ajuste'), nome: 'Níveis', tipo: 'ajuste', opacidade: 0.6, ajuste: { tipo: 'niveis', pretoDeEntrada: 10, brancoDeEntrada: 238, gama: 1.1, pretoDeSaida: 0, brancoDeSaida: 255 } });
  filhos.push({ id: id('ajuste'), nome: 'Matiz e saturação', tipo: 'ajuste', ajuste: { tipo: 'matiz-saturacao', matiz: -8, saturacao: 12, luminosidade: 0 }, mascara: { tipo: 'degrade', angulo: 90, inicio: 0.2, fim: 0.9 } });

  // 50: logo em vetor, acima dos ajustes
  filhos.push({ id: id('vetor'), nome: 'Logo', tipo: 'vetor', x: m, y: m, largura: L * 0.06, altura: L * 0.06, moldura: [100, 100], caminhos: [{ d: ESTRELA, preenchimento: '#fff7ed' }] });

  return { id: `p${indice}`, nome: formato.nome, x, y: 0, largura: L, altura: A, fundo: '#0c0a09', filhos };
}

export function documentoDe200Camadas(): Documento {
  let x = 0;
  const pranchetas = FORMATOS.map((f, i) => {
    const p = prancheta(i + 1, f, x);
    x += f.largura + 200;
    return p;
  });
  return { nome: 'Sintético de 200 camadas', pranchetas };
}

export function contarCamadas(doc: Documento): { total: number; porTipo: Record<string, number>; comSombra: number; comModo: number; comMascara: number; comDesfoque: number; recortadas: number } {
  const todas = doc.pranchetas.flatMap((p) => todasAsCamadas(p.filhos));
  const porTipo: Record<string, number> = {};
  for (const n of todas) porTipo[n.tipo] = (porTipo[n.tipo] ?? 0) + 1;
  return {
    total: todas.length,
    porTipo,
    comSombra: todas.filter((n) => 'sombra' in n && n.sombra).length,
    comModo: todas.filter((n) => 'modoDeMesclagem' in n && n.modoDeMesclagem && n.modoDeMesclagem !== 'normal' && n.modoDeMesclagem !== 'atravessar').length,
    comMascara: todas.filter((n) => n.mascara).length,
    comDesfoque: todas.filter((n) => 'desfoque' in n && n.desfoque).length,
    recortadas: todas.filter((n) => n.recortadaNaDeBaixo).length,
  };
}
