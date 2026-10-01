// Verificação por regras (lint de design, ADR 027 item 5.3).
// Mede texto pela TINTA (onde as letras estão), não pela caixa da fonte: é assim que o designer vê.
//
// Veio de poc/src/documento/lint.ts. Na POC o lint importava o motor de render; aqui ele não conhece motor nenhum.
// As duas coisas que precisam de motor (diagramar um texto e renderizar a prancheta reduzida) entram por porta:
// MeiosDeVerificacao. Quem implementa é @otto/render, com o render de referência (CPU).
import { type Caixa, camadasVisuaisVisiveis, coresDoNo, type Documento, type NoVisual as No, type NoTexto, type Prancheta, resolverCor, todasAsCamadas } from './esquema';

export type Gravidade = 'erro' | 'aviso';

export interface Aviso {
  regra:
    | 'texto-transbordando'
    | 'texto-descentralizado'
    | 'texto-pequeno'
    | 'fora-da-prancheta'
    | 'contraste'
    | 'fonte-ausente'
    | 'resolucao-baixa'
    | 'zona-segura'
    | 'margem'
    | 'textos-sobrepostos'
    | 'valor-solto'
    | 'prancheta-vazia'
    | 'ritmo'
    | 'quase-alinhado'
    | 'encostado'
    | 'quebra-de-linha'
    | 'hierarquia'
    | 'botao-sem-contraste'
    | 'faixa-vazia'
    | 'texto-alterado'
    | 'camada-invisivel';
  gravidade: Gravidade;
  prancheta: string;
  no?: string;
  camada?: string;
  mensagem: string;
}

export interface LinhaDeTexto {
  /** o texto da linha, como foi quebrado */
  texto: string;
  /** x de início da linha, já com o alinhamento, em coordenadas da prancheta */
  x: number;
  largura: number;
  /** y da linha de base */
  base: number;
}

export interface TextoDiagramado {
  linhas: LinhaDeTexto[];
  /** altura pela caixa da fonte: é o que precisa caber na caixa da camada */
  alturaUsada: number;
  /** onde as letras estão, em coordenadas da prancheta, antes da rotação */
  tinta: Caixa;
  /** palavra que não coube na largura da caixa */
  palavraEstourada: string | undefined;
  fonteEncontrada: boolean;
}

export interface RenderDeVerificacao {
  largura: number;
  altura: number;
  /** RGBA de 8 bits, não premultiplicado, linha por linha */
  rgba: Uint8Array | Uint8ClampedArray;
}

/** O que o lint precisa de um motor de render. É uma porta: a implementação vem de fora deste pacote. */
export interface MeiosDeVerificacao {
  diagramar(no: NoTexto): TextoDiagramado;
  /** A prancheta inteira, reduzida pela escala, sem os nós de "excluir". */
  renderizar(doc: Documento, prancheta: Prancheta, opcoes: { escala: number; excluir?: ReadonlySet<string> }): RenderDeVerificacao;
}

const r0 = (v: number) => Math.round(v);

function intersecta(a: Caixa, b: Caixa): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

function contem(a: Caixa, b: Caixa, folga = 2): boolean {
  return b.x >= a.x - folga && b.y >= a.y - folga && b.x + b.w <= a.x + a.w + folga && b.y + b.h <= a.y + a.h + folga;
}

function luminancia(r: number, g: number, b: number): number {
  const c = [r, g, b].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (c[0] as number) + 0.7152 * (c[1] as number) + 0.0722 * (c[2] as number);
}

export function hexParaRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function razaoDeContraste(l1: number, l2: number): number {
  const [a, b] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (a + 0.05) / (b + 0.05);
}

/** Razões de contraste de uma cor contra o que está atrás da camada, na área dada, medido no render. */
function contrastesContraOFundo(doc: Documento, p: Prancheta, no: No, caixa: Caixa, cor: string, meios: MeiosDeVerificacao): number[] {
  const escala = Math.min(1, 320 / Math.max(p.largura, p.altura));
  // só o que está embaixo da camada (na ordem de pintura, dentro dos grupos) conta como fundo
  const ordem = todasAsCamadas(p.filhos);
  const acima = new Set(
    ordem
      .slice(ordem.findIndex((n) => n.id === no.id))
      .filter((n) => n.tipo !== 'grupo')
      .map((n) => n.id),
  );
  const { largura: w, altura: h, rgba } = meios.renderizar(doc, p, { escala, excluir: acima });
  const x0 = Math.max(0, Math.floor(caixa.x * escala));
  const y0 = Math.max(0, Math.floor(caixa.y * escala));
  const x1 = Math.min(w, Math.ceil((caixa.x + caixa.w) * escala));
  const y1 = Math.min(h, Math.ceil((caixa.y + caixa.h) * escala));
  if (x1 <= x0 || y1 <= y0) return [21];
  const [tr, tg, tb] = hexParaRgb(cor);
  const lt = luminancia(tr, tg, tb);
  const razoes: number[] = [];
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * w + x) * 4;
      razoes.push(razaoDeContraste(lt, luminancia(rgba[i] as number, rgba[i + 1] as number, rgba[i + 2] as number)));
    }
  }
  return razoes.sort((a, b) => a - b);
}

function ehStory(p: Prancheta): boolean {
  return Math.abs(p.largura / p.altura - 9 / 16) < 0.02;
}

const PALAVRAS_DE_LIGACAO = new Set([
  'a',
  'o',
  'as',
  'os',
  'e',
  'de',
  'do',
  'da',
  'dos',
  'das',
  'em',
  'no',
  'na',
  'nos',
  'nas',
  'com',
  'para',
  'por',
  'pelo',
  'pela',
  'que',
  'um',
  'uma',
  'à',
  'ao',
  'aos',
  'às',
  'ou',
  'se',
  'sem',
  'sob',
  'entre',
  'até',
]);

const papel = (n: No) => n.nome.toLowerCase();
const ehSobretitulo = (n: No) => /sobret[ií]tulo|eyebrow|chap[eé]u/.test(papel(n));
const ehSubtitulo = (n: No) => /subt[ií]tulo/.test(papel(n));
const ehTitulo = (n: No) => /t[ií]tulo/.test(papel(n)) && !ehSobretitulo(n) && !ehSubtitulo(n);

export function verificarPrancheta(doc: Documento, p: Prancheta, meios: MeiosDeVerificacao): Aviso[] {
  const avisos: Aviso[] = [];
  const add = (a: Omit<Aviso, 'prancheta'>) => avisos.push({ prancheta: p.nome, ...a });
  const ref = (no: No) => ({ no: no.id, camada: no.nome });
  const visiveis = camadasVisuaisVisiveis(p.filhos);
  if (visiveis.length === 0) add({ regra: 'prancheta-vazia', gravidade: 'aviso', mensagem: 'a prancheta não tem camadas visíveis' });

  const margem = Math.round(Math.min(p.largura, p.altura) * 0.04);
  const valoresDeToken = new Map(Object.entries(doc.tokens.cores).map(([k, v]) => [v.toLowerCase(), k]));
  const diagramas = new Map<string, TextoDiagramado>();
  /** onde cada camada visível de fato aparece */
  const tintas = new Map<string, Caixa>();

  for (const no of visiveis) {
    const bbox: Caixa = { x: no.x, y: no.y, w: no.largura, h: no.altura };
    if (!intersecta(bbox, { x: 0, y: 0, w: p.largura, h: p.altura })) {
      add({ regra: 'fora-da-prancheta', gravidade: 'erro', ...ref(no), mensagem: `"${no.nome}" está inteira fora da prancheta (${r0(no.x)}, ${r0(no.y)})` });
      continue;
    }
    for (const cor of new Set(coresDoNo(no))) {
      if (!cor.startsWith('token:') && valoresDeToken.has(cor.toLowerCase())) {
        add({ regra: 'valor-solto', gravidade: 'aviso', ...ref(no), mensagem: `"${no.nome}" usa ${cor} solto; existe o token "token:${valoresDeToken.get(cor.toLowerCase())}"` });
      }
    }
    if (no.tipo === 'imagem') {
      const ampliacao = Math.max(no.largura / no.larguraOriginal, no.altura / no.alturaOriginal) * no.zoom;
      if (ampliacao > 1.1) {
        add({
          regra: 'resolucao-baixa',
          gravidade: 'aviso',
          ...ref(no),
          mensagem: `"${no.nome}" está ampliada ${Math.round(ampliacao * 100)}% (${no.larguraOriginal}×${no.alturaOriginal} px de origem); vai perder nitidez na saída`,
        });
      }
    }
    if (no.tipo !== 'texto') {
      tintas.set(no.id, bbox);
      continue;
    }
    const d = meios.diagramar(no);
    diagramas.set(no.id, d);
    tintas.set(no.id, d.tinta);
  }

  // ---------- regras de cada texto ----------
  for (const no of visiveis) {
    if (no.tipo !== 'texto') continue;
    const d = diagramas.get(no.id);
    if (!d) continue;
    const t = d.tinta;
    if (!d.fonteEncontrada) add({ regra: 'fonte-ausente', gravidade: 'erro', ...ref(no), mensagem: `uma fonte de "${no.nome}" não está na biblioteca` });
    if (d.palavraEstourada) {
      add({
        regra: 'texto-transbordando',
        gravidade: 'erro',
        ...ref(no),
        mensagem: `em "${no.nome}", a palavra "${d.palavraEstourada}" é mais larga que a caixa (${r0(no.largura)} px); alargue a caixa`,
      });
    } else if (d.alturaUsada > no.altura + 2) {
      add({
        regra: 'texto-transbordando',
        gravidade: 'erro',
        ...ref(no),
        mensagem: `"${no.nome}" precisa de ${r0(d.alturaUsada)} px de altura de caixa e tem ${r0(no.altura)} px (${d.linhas.length} linhas); aumente a caixa, não diminua o texto`,
      });
    }
    const minimoLegivel = Math.round(p.largura * 0.024);
    const menor = Math.min(no.tamanho, ...(no.trechos ?? []).map((x) => x.tamanho ?? no.tamanho));
    if (menor < minimoLegivel) {
      add({
        regra: 'texto-pequeno',
        gravidade: 'aviso',
        ...ref(no),
        mensagem: `"${no.nome}" tem ${menor} px; numa prancheta de ${p.largura} px de largura, o mínimo legível no celular é ${minimoLegivel} px`,
      });
    }
    if (t.x < 0 || t.y < 0 || t.x + t.w > p.largura || t.y + t.h > p.altura) {
      add({ regra: 'fora-da-prancheta', gravidade: 'erro', ...ref(no), mensagem: `as letras de "${no.nome}" saem da prancheta` });
    } else if (t.x < margem || t.y < margem || t.x + t.w > p.largura - margem || t.y + t.h > p.altura - margem) {
      add({ regra: 'margem', gravidade: 'aviso', ...ref(no), mensagem: `as letras de "${no.nome}" estão a menos de ${margem} px da borda` });
    }
    if (ehStory(p)) {
      const topo = p.altura * (250 / 1920);
      const base = p.altura * (1 - 340 / 1920);
      if (t.y < topo || t.y + t.h > base) {
        add({ regra: 'zona-segura', gravidade: 'aviso', ...ref(no), mensagem: `"${no.nome}" invade a faixa coberta pela interface do story (texto só entre ${r0(topo)} e ${r0(base)} px)` });
      }
    }

    // quebra de linha pelo sentido
    if (d.linhas.length > 1 && !no.caixaAlta) {
      d.linhas.forEach((l, i) => {
        if (i === d.linhas.length - 1) return;
        const palavras = l.texto.trim().split(/\s+/);
        const ultimaPalavra = palavras.at(-1) ?? '';
        const ultima = ultimaPalavra.toLowerCase().replace(/[.,;:!?]$/, '');
        if (PALAVRAS_DE_LIGACAO.has(ultima))
          add({
            regra: 'quebra-de-linha',
            gravidade: 'aviso',
            ...ref(no),
            mensagem: `em "${no.nome}", a linha ${i + 1} termina em "${ultimaPalavra}"; leve a palavra de ligação para a linha de baixo ("\\n" antes dela)`,
          });
        const proxima = (d.linhas[i + 1] as LinhaDeTexto).texto.trim().split(/\s+/)[0] ?? '';
        const fimMaiusculo = /^\p{Lu}/u.test(ultimaPalavra) && palavras.length > 1;
        if (fimMaiusculo && /^\p{Lu}/u.test(proxima) && !/[.!?:]$/.test(ultimaPalavra)) {
          add({ regra: 'quebra-de-linha', gravidade: 'aviso', ...ref(no), mensagem: `em "${no.nome}", o nome "${ultimaPalavra} ${proxima}" ficou partido entre linhas` });
        }
      });
    }
    if (d.linhas.length > 1 && no.tamanho >= 60) {
      const ultima = (d.linhas.at(-1) as LinhaDeTexto).texto.trim().split(/\s+/);
      if (ultima.length === 1 && (d.linhas.at(-2) as LinhaDeTexto).texto.trim().split(/\s+/).length > 1) {
        add({ regra: 'quebra-de-linha', gravidade: 'aviso', ...ref(no), mensagem: `"${no.nome}" termina com uma palavra sozinha ("${ultima[0]}"); equilibre as linhas` });
      }
    }

    // texto dentro de botão ou selo: centro da tinta no centro da forma
    const indiceDoTexto = visiveis.indexOf(no);
    const recipiente = visiveis
      .slice(0, indiceDoTexto)
      .filter((f): f is Extract<No, { tipo: 'forma' }> => f.tipo === 'forma' && f.altura < p.altura * 0.3)
      .filter((f) => t.x >= f.x - 2 && t.x + t.w <= f.x + f.largura + 2 && t.y + t.h / 2 > f.y && t.y + t.h / 2 < f.y + f.altura)
      // botão ou selo: forma do tamanho do texto, não uma faixa de fundo
      .filter((f) => f.altura <= Math.max(t.h * 3, 160))
      .sort((a, b) => a.largura * a.altura - b.largura * b.altura)[0];
    if (recipiente) {
      // centro ótico: numa linha, do topo da tinta até a linha de base (descendente não conta)
      const centroY = d.linhas.length === 1 ? (t.y + (d.linhas[0] as LinhaDeTexto).base) / 2 : t.y + t.h / 2;
      const dy = centroY - (recipiente.y + recipiente.altura / 2);
      const dx = t.x + t.w / 2 - (recipiente.x + recipiente.largura / 2);
      if (Math.abs(dy) > Math.max(3, recipiente.altura * 0.06)) {
        add({
          regra: 'texto-descentralizado',
          gravidade: 'aviso',
          ...ref(no),
          mensagem: `as letras de "${no.nome}" estão ${r0(Math.abs(dy))} px ${dy < 0 ? 'acima' : 'abaixo'} do centro de "${recipiente.nome}" (medido pela altura da maiúscula); use alinhar com borda centro-vertical`,
        });
      } else if (no.alinhamento === 'centro' && Math.abs(dx) > Math.max(3, recipiente.largura * 0.03)) {
        add({ regra: 'texto-descentralizado', gravidade: 'aviso', ...ref(no), mensagem: `as letras de "${no.nome}" estão ${r0(Math.abs(dx))} px fora do centro horizontal de "${recipiente.nome}"` });
      }
    }

    const razoes = contrastesContraOFundo(doc, p, no, t, resolverCor(doc, no.cor), meios);
    const razao = razoes[Math.floor(razoes.length * 0.1)] ?? 21;
    const minimo = no.tamanho >= 48 ? 3 : 4.5;
    if (razao < minimo) {
      add({
        regra: 'contraste',
        gravidade: 'erro',
        ...ref(no),
        mensagem: `contraste de "${no.nome}" com o fundo real é ${razao.toFixed(1)}:1 no pior trecho; o mínimo para ${no.tamanho} px é ${minimo}:1`,
      });
    }
  }

  // ---------- textos sobrepostos (pela tinta) ----------
  const textos = visiveis.filter((n): n is NoTexto => n.tipo === 'texto' && tintas.has(n.id));
  for (let i = 0; i < textos.length; i++) {
    for (let j = i + 1; j < textos.length; j++) {
      const a = textos[i] as NoTexto;
      const b = textos[j] as NoTexto;
      if (intersecta(tintas.get(a.id) as Caixa, tintas.get(b.id) as Caixa))
        add({ regra: 'textos-sobrepostos', gravidade: 'erro', no: b.id, camada: b.nome, mensagem: `as letras de "${a.nome}" e "${b.nome}" se sobrepõem` });
    }
  }

  // ---------- hierarquia pelos papéis ----------
  const sobre = textos.find(ehSobretitulo);
  const sub = textos.find(ehSubtitulo);
  const titulo = textos.find(ehTitulo);
  if (sobre && sub && sobre.tamanho >= sub.tamanho)
    add({
      regra: 'hierarquia',
      gravidade: 'aviso',
      ...ref(sobre),
      mensagem: `o sobretítulo (${sobre.tamanho} px) está maior ou igual ao subtítulo (${sub.tamanho} px); o sobretítulo é o menor dos três`,
    });
  if (titulo) {
    for (const t of textos) {
      if (t !== titulo && !ehTitulo(t) && t.tamanho > titulo.tamanho)
        add({ regra: 'hierarquia', gravidade: 'aviso', ...ref(t), mensagem: `"${t.nome}" (${t.tamanho} px) está maior que o título (${titulo.tamanho} px)` });
    }
  }

  // ---------- elementos de composição: tudo menos fundo e fotos grandes ----------
  const areaDaPrancheta = p.largura * p.altura;
  const candidatos = visiveis.filter((n) => tintas.has(n.id) && (n.tipo === 'texto' || n.largura * n.altura < areaDaPrancheta * 0.2));
  const elementos = candidatos.filter((n) => !candidatos.some((o) => o !== n && o.tipo === 'forma' && contem(tintas.get(o.id) as Caixa, tintas.get(n.id) as Caixa)));

  // ritmo: vãos verticais entre elementos que dividem a mesma coluna
  const vaos: { de: No; para: No; vao: number }[] = [];
  for (const a of elementos) {
    const ta = tintas.get(a.id) as Caixa;
    let melhor: { no: No; vao: number } | undefined;
    for (const b of elementos) {
      if (a === b) continue;
      const tb = tintas.get(b.id) as Caixa;
      const sobrepoeX = Math.min(ta.x + ta.w, tb.x + tb.w) - Math.max(ta.x, tb.x) > 8;
      if (!sobrepoeX || contem(ta, tb) || contem(tb, ta)) continue;
      const vao = tb.y - (ta.y + ta.h);
      if (vao < -1) continue;
      if (!melhor || vao < melhor.vao) melhor = { no: b, vao };
    }
    if (melhor) vaos.push({ de: a, para: melhor.no, vao: melhor.vao });
  }
  for (const v of vaos) {
    if (v.vao < 12)
      add({ regra: 'ritmo', gravidade: 'aviso', ...ref(v.para), mensagem: `"${v.para.nome}" está a ${r0(v.vao)} px de "${v.de.nome}"; blocos diferentes pedem pelo menos 16 px (use distribuir)` });
  }
  // vãos vizinhos numa mesma pilha (a → b → c) que quase se igualam parecem erro, não intenção
  for (const ab of vaos) {
    const bc = vaos.find((v) => v.de === ab.para);
    if (!bc || ab.vao < 12 || bc.vao < 12) continue;
    const dif = Math.abs(ab.vao - bc.vao);
    if (dif >= 1.5 && dif <= 6) {
      add({
        regra: 'ritmo',
        gravidade: 'aviso',
        ...ref(ab.para),
        mensagem: `"${ab.para.nome}" tem ${r0(ab.vao)} px acima e ${r0(bc.vao)} px abaixo; quase simétrico parece erro: iguale ou diferencie de propósito`,
      });
    }
  }

  // colado a uma faixa ou cartão grande: o elemento acima termina quase em cima da borda da forma
  const faixas = visiveis.filter((n) => n.tipo === 'forma' && !elementos.includes(n));
  for (const e of elementos) {
    const te = tintas.get(e.id) as Caixa;
    for (const f of faixas) {
      const tf = tintas.get(f.id) as Caixa;
      if (contem(tf, te)) continue;
      const sobrepoeX = Math.min(te.x + te.w, tf.x + tf.w) - Math.max(te.x, tf.x) > 8;
      const vao = tf.y - (te.y + te.h);
      if (sobrepoeX && vao >= -1 && vao < 16)
        add({ regra: 'ritmo', gravidade: 'aviso', ...ref(e), mensagem: `"${e.nome}" está a ${r0(vao)} px da borda de "${f.nome}"; afaste pelo menos 24 px ou coloque dentro dela` });
    }
  }

  // quase alinhado: bordas esquerdas que erram por poucos pixels
  const avisados = new Set<string>();
  for (let i = 0; i < elementos.length; i++) {
    for (let j = i + 1; j < elementos.length; j++) {
      const a = elementos[i] as No;
      const b = elementos[j] as No;
      const grande = (n: No) => n.tipo === 'texto' && n.tamanho >= 100;
      if (grande(a) || grande(b)) continue;
      const dif = Math.abs((tintas.get(a.id) as Caixa).x - (tintas.get(b.id) as Caixa).x);
      if (dif >= 1.5 && dif <= 8 && !avisados.has(b.id)) {
        avisados.add(b.id);
        add({
          regra: 'quase-alinhado',
          gravidade: 'aviso',
          ...ref(b),
          mensagem: `a borda esquerda de "${b.nome}" está a ${r0(dif)} px da de "${a.nome}"; alinhe (use alinhar) ou afaste de propósito`,
        });
      }
    }
  }

  // encostado: ou sangra ou respira
  for (const no of visiveis) {
    if (no.tipo === 'texto') continue;
    const c = tintas.get(no.id);
    if (!c) continue;
    const perto = (dist: number) => dist >= 0 && dist < margem * 0.6;
    const lados = [
      ['esquerda', c.x],
      ['direita', p.largura - (c.x + c.w)],
      ['topo', c.y],
      ['base', p.altura - (c.y + c.h)],
    ] as const;
    const sangra = lados.some(([, d]) => d < 0);
    for (const [lado, d] of lados) {
      if (perto(d) && !(d === 0 && sangra) && c.w < p.largura && c.h < p.altura) {
        add({ regra: 'encostado', gravidade: 'aviso', ...ref(no), mensagem: `"${no.nome}" encosta na borda ${lado} (${r0(d)} px); ou sangra (passa da borda) ou respira (fica na margem)` });
      }
    }
  }

  // botão que some contra o fundo
  for (const no of visiveis) {
    if (no.tipo !== 'forma' || !/bot[aã]o|cta/.test(papel(no)) || typeof no.preenchimento !== 'string') continue;
    const razoes = contrastesContraOFundo(doc, p, no, { x: no.x, y: no.y, w: no.largura, h: no.altura }, resolverCor(doc, no.preenchimento), meios);
    const mediana = razoes[Math.floor(razoes.length / 2)] ?? 21;
    if (mediana < 1.6)
      add({
        regra: 'botao-sem-contraste',
        gravidade: 'aviso',
        ...ref(no),
        mensagem: `"${no.nome}" tem contraste de ${mediana.toFixed(1)}:1 com o que está atrás; a chamada precisa se destacar (troque a cor ou o fundo)`,
      });
  }

  // story: as faixas da interface não levam texto, mas não podem ficar com o fundo liso sobrando
  if (ehStory(p)) {
    const faixasDaInterface = [
      ['de cima', 0, p.altura * (250 / 1920)],
      ['de baixo', p.altura * (1 - 340 / 1920), p.altura],
    ] as const;
    for (const [nome, y0, y1] of faixasDaInterface) {
      const cobertura = visiveis
        .filter((n) => n.tipo !== 'texto')
        .map((n) => tintas.get(n.id) as Caixa)
        .filter((c) => c && c.y < y1 && c.y + c.h > y0)
        .reduce((soma, c) => soma + Math.min(c.w, p.largura) * (Math.min(c.y + c.h, y1) - Math.max(c.y, y0)), 0);
      if (cobertura < p.largura * (y1 - y0) * 0.5) {
        add({
          regra: 'faixa-vazia',
          gravidade: 'aviso',
          mensagem: `a faixa ${nome} do story (${r0(y0)} a ${r0(y1)} px) ficou com o fundo liso; texto não entra ali, mas foto, cor ou forma devem ocupá-la (sangre a foto ou use uma faixa de cor)`,
        });
      }
    }
  }

  avisos.push(...camadasInvisiveis(doc, p, meios));
  return avisos;
}

/**
 * Camada que não muda nada no render: coberta por outra, da mesma cor do que está atrás, ou com o desenho quebrado.
 * O agente olhava o render e procurava a camada "no papel" sem achar o motivo (rodadas A e C do CROVÉ, 2026-09-28).
 * Compara a prancheta reduzida com e sem cada camada.
 */
function camadasInvisiveis(doc: Documento, p: Prancheta, meios: MeiosDeVerificacao): Aviso[] {
  const escala = Math.min(1, 320 / Math.max(p.largura, p.altura));
  const pixels = (excluir?: ReadonlySet<string>) => meios.renderizar(doc, p, excluir ? { escala, excluir } : { escala }).rgba;
  const completo = pixels();
  const ordem = camadasVisuaisVisiveis(p.filhos);
  const avisos: Aviso[] = [];
  ordem.forEach((no, i) => {
    if (no.opacidade === 0) return;
    const sem = pixels(new Set([no.id]));
    for (let k = 0; k < completo.length; k++) if (Math.abs((completo[k] as number) - (sem[k] as number)) > 8) return;
    const caixa: Caixa = { x: no.x, y: no.y, w: no.largura, h: no.altura };
    const cobrem = ordem.slice(i + 1).filter((n) => intersecta(caixa, { x: n.x, y: n.y, w: n.largura, h: n.altura }) && n.opacidade === 1);
    const motivo = cobrem.length
      ? `está coberta por ${cobrem
          .slice(0, 3)
          .map((n) => `"${n.nome}"`)
          .join(', ')} (crie-a depois ou use reordenar para trazê-la para a frente)`
      : 'tem a mesma cor do que está atrás, ou o desenho está vazio (mude a cor ou confira a camada)';
    avisos.push({ regra: 'camada-invisivel', gravidade: 'erro', prancheta: p.nome, no: no.id, camada: no.nome, mensagem: `"${no.nome}" não aparece no render: ${motivo}` });
  });
  return avisos;
}

export function verificarDocumento(doc: Documento, meios: MeiosDeVerificacao, prancheta?: string): Aviso[] {
  return doc.pranchetas.filter((p) => !prancheta || p.id === prancheta || p.nome === prancheta).flatMap((p) => verificarPrancheta(doc, p, meios));
}
