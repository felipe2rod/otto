// O mapeamento vetorial em ação (ADR 034): do documento do Otto para as camadas de um arquivo vetorial e o relatório.
// O modelo de saída é o mesmo da porta (porta.ts); o que muda é a decisão: aqui o que não tem equivalente vetorial
// vira imagem embutida (com aviso) ou fica de fora (com aviso), em vez de virar recurso do Photoshop.
// Como em montar.ts, não toca em pixel: o texto diagramado e as imagens vêm de MeiosDoVetorial, e sem eles sai só o relatório.
import {
  type Degrade,
  type Documento,
  type Filtro,
  hexParaRgb,
  type ModoDoGrupo,
  type No,
  type NoImagem,
  type NoTexto,
  type NoVetor,
  type NoVisual,
  type Prancheta,
  type Preenchimento,
  resolverCor,
  todasAsCamadas,
} from '@otto/documento';
import { escolherFonte, extremosDoDegrade, textoExibido } from '@otto/render';
import { type Mapa, mapearNos, nosDaForma, nosDoSubcaminho, subcaminhosDe } from './caminho';
import { type ChaveDoMapeamento, MAPEAMENTO } from './mapeamento';
import { cantosDaFoto, type FonteDisponivel, type ImagemDisponivel } from './montar';
import type { CamadaDoArquivo, CaminhoDoArquivo, DegradeDoArquivo, EstiloDeTextoDoArquivo, ImagemDoArquivo, LinhaDeTextoDoArquivo, PreenchimentoDoArquivo, Rgb } from './porta';
import { type DestinoVetorial, nomeDaCamada, type RelatorioDeExportacaoVetorial } from './relatorio';

/** O que a montagem vetorial pede ao motor. Tudo em coordenadas da prancheta. */
export interface MeiosDoVetorial {
  /** As linhas do texto como o motor as quebrou: onde começam, a linha de base, e que trecho do conteúdo mostram. */
  linhas(no: NoTexto): { x: number; base: number; inicio: number; fim: number }[];
  /** Os nós desenhados juntos numa imagem PNG, já posicionada. Sem nada a desenhar, undefined. */
  rasterizar(p: Prancheta, nos: readonly No[]): ImagemDoArquivo | undefined;
}

export interface PedidoDeMontagemVetorial {
  doc: Documento;
  prancheta: Prancheta;
  fontes: readonly FonteDisponivel[];
  imagens: readonly ImagemDisponivel[];
  /** sem eles, a montagem não tem texto diagramado nem imagem: serve para o relatório */
  meios?: MeiosDoVetorial;
  /** o formato não guarda degradê com parada transparente (PDF): a forma vira imagem */
  semDegradeTransparente?: boolean;
  rel: RelatorioDeExportacaoVetorial;
}

export interface MontagemVetorial {
  largura: number;
  altura: number;
  camadas: CamadaDoArquivo[];
  /** nomes PostScript das fontes do texto que saiu como texto */
  fontesUsadas: string[];
  /** alguma camada tinha modo de mesclagem que o formato não tem, e saiu em normal */
  modoTrocado: boolean;
}

interface Contexto extends PedidoDeMontagemVetorial {
  p: Prancheta;
  imagensPorChave: ReadonlyMap<string, ImagemDisponivel>;
  fontesUsadas: Set<string>;
  modoTrocado: boolean;
}

const cor = (doc: Documento, c: string): Rgb => {
  const [r, g, b] = hexParaRgb(resolverCor(doc, c));
  return { r, g, b };
};

type Matriz = [number, number, number, number, number, number];
/** Rotação de "graus" em torno de (ox, oy), como matriz afim [a, b, c, d, e, f]. */
function rotacaoEmTorno(graus: number, ox: number, oy: number): Matriz {
  const a = (graus * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  return [cos, sin, 0 - sin, cos, ox - ox * cos + oy * sin, oy - ox * sin - oy * cos];
}
const centro = (no: NoVisual): [number, number] => [no.x + no.largura / 2, no.y + no.altura / 2];
const mapeador = (no: NoVisual): Mapa => {
  if (!no.rotacao) return (x, y) => [x, y];
  const [a, b, c, d, e, f] = rotacaoEmTorno(no.rotacao, ...centro(no));
  return (x, y) => [a * x + c * y + e, b * x + d * y + f];
};

function degrade(doc: Documento, d: Degrade, no: NoVisual): DegradeDoArquivo {
  const paradas = [...d.paradas].sort((a, b) => a.posicao - b.posicao).map((q) => ({ cor: cor(doc, q.cor), posicao: q.posicao, opacidade: q.opacidade }));
  const matriz = no.rotacao ? { matriz: rotacaoEmTorno(no.rotacao, ...centro(no)) } : {};
  // os mesmos pontos que o motor usa para desenhar
  if (d.tipo === 'radial') {
    const [cx, cy] = centro(no);
    return { estilo: 'radial', angulo: d.angulo, paradas, geometria: { x0: cx, y0: cy, x1: cx + Math.max(no.largura, no.altura) / 2, y1: cy, ...matriz } };
  }
  return { estilo: 'linear', angulo: d.angulo, paradas, geometria: { ...extremosDoDegrade(d.angulo, no.x, no.y, no.largura, no.altura), ...matriz } };
}
const preenchimento = (doc: Documento, pr: Preenchimento, no: NoVisual): PreenchimentoDoArquivo =>
  typeof pr === 'string' ? { tipo: 'cor', cor: cor(doc, pr) } : { tipo: 'degrade', ...degrade(doc, pr, no) };

/** Os modos que o SVG (mix-blend-mode) e o PDF têm. Os outros são do Photoshop só. */
const TEM_NO_VETORIAL = (modo: ModoDoGrupo): boolean => MAPEAMENTO[`modo:${modo}`].vetorial?.destino === 'Nativo';

const NOME_DO_FILTRO: Record<Filtro['tipo'], string> = { desfoque: 'desfoque', 'desfoque-de-movimento': 'desfoque de movimento', ruido: 'ruído', nitidez: 'nitidez' };
const NOME_DO_EFEITO = {
  sombraInterna: 'sombra interna',
  brilhoExterno: 'brilho externo',
  brilhoInterno: 'brilho interno',
  sobreposicaoDeCor: 'sobreposição de cor',
  sobreposicaoDeDegrade: 'sobreposição de degradê',
} as const;

interface Motivo {
  chave: ChaveDoMapeamento;
  texto: string;
}

/** Por que uma camada visual não tem como sair em vetor. Vazio: sai em vetor. */
function motivosParaImagem(no: NoVisual, cx: Contexto): Motivo[] {
  const motivos: Motivo[] = [];
  if (no.sombra) motivos.push({ chave: 'efeito:sombra', texto: 'sombra projetada' });
  for (const [k, nome] of Object.entries(NOME_DO_EFEITO) as [keyof typeof NOME_DO_EFEITO, string][]) if (no.efeitos?.[k]) motivos.push({ chave: `efeito:${k}`, texto: nome });
  for (const f of no.filtros ?? []) motivos.push({ chave: no.tipo === 'imagem' ? `filtro:${f.tipo}` : 'filtro-fora-de-foto', texto: `filtro de ${NOME_DO_FILTRO[f.tipo]}` });
  const m = no.mascara;
  if (m?.tipo === 'degrade') motivos.push({ chave: 'mascara:degrade', texto: 'máscara em degradê' });
  if (m?.tipo === 'sujeito') motivos.push({ chave: 'mascara:sujeito', texto: 'máscara do sujeito' });
  if (m?.tipo === 'forma' && (m.suavizar > 0 || m.inverter)) motivos.push({ chave: 'mascara-suave-ou-invertida', texto: `máscara de forma ${m.inverter ? 'invertida' : 'com borda suave'}` });
  if (no.tipo === 'imagem') {
    const a = no.ajusteDeCor;
    if (a && (a.brilho !== 0 || a.contraste !== 0 || a.saturacao !== 0 || a.duotone)) motivos.push({ chave: 'ajuste-de-cor-da-foto', texto: 'ajuste de cor da foto' });
    if (cx.imagensPorChave.get(no.arquivo)?.tipo === 'image/webp') motivos.push({ chave: 'foto-em-webp', texto: 'foto em WebP' });
  }
  if (cx.semDegradeTransparente && no.tipo === 'forma' && typeof no.preenchimento !== 'string' && no.preenchimento.paradas.some((q) => q.opacidade < 1))
    motivos.push({ chave: 'degrade-transparente-no-pdf', texto: 'degradê com parada transparente' });
  if (no.tipo === 'vetor' && no.caminhos.some((c) => !subcaminhosDe(c.d))) motivos.push({ chave: 'vetor-fora-do-padrao', texto: 'caminho fora do padrão (só M, C e Z)' });
  if (no.tipo === 'texto' && fontesDoTexto(no, cx).some((f) => !f.usada)) motivos.push({ chave: 'texto-sem-fonte', texto: 'fonte não encontrada' });
  return motivos;
}

function fontesDoTexto(no: NoTexto, cx: Contexto): { pedida: { familia: string; peso: number }; usada: FonteDisponivel | undefined }[] {
  const pedidas = [{ familia: no.fonte, peso: no.peso }, ...(no.trechos ?? []).map((t) => ({ familia: t.fonte ?? no.fonte, peso: t.peso ?? no.peso }))];
  const vistas = new Set<string>();
  return pedidas
    .filter((f) => {
      const chave = `${f.familia}#${f.peso}`;
      if (vistas.has(chave)) return false;
      vistas.add(chave);
      return true;
    })
    .map((pedida) => ({ pedida, usada: escolherFonte(cx.fontes, pedida.familia, pedida.peso) }));
}

/** O recorte vetorial de uma máscara de forma sem borda suave e sem inverter. */
function recorteDaMascara(no: No): CaminhoDoArquivo[] | undefined {
  const m = no.mascara;
  if (m?.tipo !== 'forma' || m.suavizar > 0 || m.inverter) return undefined;
  return [{ aberto: false, regra: 'nao-zero', nos: nosDaForma(m.forma, m.x, m.y, m.largura, m.altura, m.raio) }];
}

/** O nó como vai para a imagem: com efeitos, filtros e máscara, e sem o que fica no elemento (opacidade, modo, visibilidade, recorte). */
const paraImagem = <T extends No>(no: T): T => ({ ...no, opacidade: 1, modoDeMesclagem: no.tipo === 'grupo' ? 'atravessar' : 'normal', visivel: true, recortadaNaDeBaixo: false });

function comum(no: No, cx: Contexto): CamadaDoArquivo {
  const temModo = TEM_NO_VETORIAL(no.modoDeMesclagem);
  if (!temModo) cx.modoTrocado = true;
  return { nome: no.nome, opacidade: no.opacidade, modo: temModo ? no.modoDeMesclagem : 'normal', oculta: !no.visivel, recortadaNaDeBaixo: false, bloqueada: false };
}

function linha(cx: Contexto, no: No, destino: DestinoVetorial, mapeamento: ChaveDoMapeamento, observacao: string): void {
  const extras = [
    no.modoDeMesclagem !== 'normal' && no.modoDeMesclagem !== 'atravessar'
      ? TEM_NO_VETORIAL(no.modoDeMesclagem)
        ? `modo ${no.modoDeMesclagem}`
        : `modo ${no.modoDeMesclagem} não existe no formato: saiu em modo normal`
      : '',
    ehVisualComRotacao(no) ? `girada ${no.rotacao}°` : '',
  ].filter(Boolean);
  cx.rel.camadas.push({ prancheta: cx.p.nome, camada: no.nome, idDoNo: no.id, tipo: no.tipo, destino, mapeamento, observacao: [observacao, ...extras].filter(Boolean).join('; ') });
}
const ehVisualComRotacao = (no: No): no is NoVisual => 'rotacao' in no && no.rotacao !== 0;

/** Estilo de cada caractere do texto exibido: o da camada, os trechos por cima, e o versalete (minúscula vira maiúscula a 75% do corpo). */
function linhasDoTexto(no: NoTexto, cx: Contexto): LinhaDeTextoDoArquivo[] | undefined {
  if (!cx.meios) return undefined;
  const exibido = textoExibido(no);
  type Estilo = LinhaDeTextoDoArquivo['pedacos'][number]['estilo'];
  const estilos: { chave: string; estilo: Estilo }[] = [];
  for (let i = 0; i < exibido.length; i++) {
    const t = [...(no.trechos ?? [])].reverse().find((x) => i >= x.inicio && i < x.fim);
    const fonte = escolherFonte(cx.fontes, t?.fonte ?? no.fonte, t?.peso ?? no.peso) as FonteDisponivel;
    const original = no.conteudo[i] ?? '';
    const menor = no.versalete && !no.caixaAlta && original !== original.toLocaleUpperCase('pt-BR');
    const estilo: Estilo = {
      fonte: fonte.postScript,
      familia: fonte.familia,
      peso: fonte.peso,
      tamanho: (t?.tamanho ?? no.tamanho) * (menor ? 0.75 : 1),
      cor: cor(cx.doc, t?.cor ?? no.cor),
      espacamento: t?.espacamento ?? no.espacamento,
    };
    estilos.push({ chave: JSON.stringify(estilo), estilo });
  }
  return cx.meios.linhas(no).map((l) => {
    // o espaço (ou a quebra) que sobra no fim da linha não desenha nada
    let fim = l.fim;
    while (fim > l.inicio && /\s/.test(exibido[fim - 1] ?? '')) fim--;
    const pedacos: LinhaDeTextoDoArquivo['pedacos'] = [];
    for (let i = l.inicio; i < fim; i++) {
      const e = estilos[i] as (typeof estilos)[number];
      const ultimo = pedacos[pedacos.length - 1];
      if (ultimo && i > l.inicio && estilos[i - 1]?.chave === e.chave) ultimo.texto += exibido[i];
      else pedacos.push({ texto: exibido[i] as string, estilo: e.estilo });
    }
    return { x: l.x - no.x, base: l.base - no.y, pedacos };
  });
}

function camadaDeTexto(no: NoTexto, cx: Contexto): CamadaDoArquivo {
  const { rel, p } = cx;
  const fontes = fontesDoTexto(no, cx);
  for (const { pedida, usada } of fontes) {
    if (!usada) continue;
    cx.fontesUsadas.add(usada.postScript);
    if (!rel.fontes.some((x) => x.postScript === usada.postScript))
      rel.fontes.push({ familia: usada.familia, peso: usada.peso, postScript: usada.postScript, ...(usada.arquivo ? { arquivo: usada.arquivo } : {}) });
    if (usada.peso !== pedida.peso && !rel.substituicoes.some((s) => s.camada === nomeDaCamada(p, no.nome) && s.pedida.peso === pedida.peso))
      rel.substituicoes.push({ camada: nomeDaCamada(p, no.nome), pedida, usada: { familia: usada.familia, peso: usada.peso, postScript: usada.postScript } });
  }
  const principal = fontes[0]?.usada as FonteDisponivel;
  const a = (no.rotacao * Math.PI) / 180;
  const [tx, ty] = mapeador(no)(no.x, no.y);
  const estilo: EstiloDeTextoDoArquivo = {
    fonte: principal.postScript,
    familia: principal.familia,
    peso: principal.peso,
    tamanho: no.tamanho,
    cor: cor(cx.doc, no.cor),
    entrelinha: Math.round(no.tamanho * no.entrelinha * 100) / 100,
    espacamento: no.espacamento,
    caixa: no.caixaAlta ? 'alta' : no.versalete ? 'versalete' : 'normal',
    kerning: no.kerning !== 'nenhum',
  };
  const linhas = linhasDoTexto(no, cx);
  linha(cx, no, 'nativo-editavel', 'no:texto', `texto como texto, ${principal.postScript}, ${no.tamanho} px`);
  return {
    ...comum(no, cx),
    texto: {
      conteudo: no.conteudo,
      transformacao: [Math.cos(a), Math.sin(a), 0 - Math.sin(a), Math.cos(a), tx, ty],
      caixa: { largura: no.largura, altura: no.altura },
      alinhamento: no.alinhamento,
      estilo,
      ...(linhas ? { linhas } : {}),
    },
  };
}

function camadaDaFoto(no: NoImagem, cx: Contexto): CamadaDoArquivo {
  const { rel, p } = cx;
  const original = cx.imagensPorChave.get(no.arquivo);
  const recorte = no.recorte ?? { forma: 'retangulo' as const, raio: 0 };
  const mascaraVetorial: CaminhoDoArquivo[] = [{ aberto: false, regra: 'nao-zero', nos: mapearNos(nosDaForma(recorte.forma, no.x, no.y, no.largura, no.altura, recorte.raio), mapeador(no)) }];
  if (!original) {
    const registro = rel.emFalta.imagens.find((r) => r.arquivo === no.arquivo);
    if (registro) registro.camadas.push(nomeDaCamada(p, no.nome));
    else rel.emFalta.imagens.push({ arquivo: no.arquivo, camadas: [nomeDaCamada(p, no.nome)] });
    linha(cx, no, 'nativo-pixel', 'no:imagem', 'o arquivo da foto não foi encontrado: a camada saiu como um retângulo cinza');
    const imagem = cx.meios?.rasterizar(p, [paraImagem(no)]);
    return { ...comum(no, cx), ...(imagem ? { imagem } : {}) };
  }
  const largura = original.largura ?? no.larguraOriginal;
  const altura = original.altura ?? no.alturaOriginal;
  // a foto inteira, posicionada: escala e deslocamento do enquadramento, e a rotação da camada por cima
  const cantos = cantosDaFoto(largura, altura, no);
  const k = ((cantos[2] as number) - (cantos[0] as number)) / largura;
  const [a, b, c, d, e, f] = no.rotacao ? rotacaoEmTorno(no.rotacao, ...centro(no)) : ([1, 0, 0, 1, 0, 0] as Matriz);
  const x0 = cantos[0] as number;
  const y0 = cantos[1] as number;
  const transformacao: Matriz = [a * k, b * k, c * k, d * k, a * x0 + c * y0 + e, b * x0 + d * y0 + f];
  linha(
    cx,
    no,
    'nativo-editavel',
    'no:imagem',
    `imagem embutida (${no.larguraOriginal} × ${no.alturaOriginal} px), com o corte da caixa como recorte vetorial${no.recorte ? ` (${no.recorte.forma === 'elipse' ? 'elipse' : 'retângulo'})` : ''}`,
  );
  const recorteVetorial = recorteDaMascara(no);
  return {
    ...comum(no, cx),
    ...(original.bytes ? { imagem: { tipo: original.tipo === 'image/png' ? 'png' : 'jpeg', bytes: original.bytes, largura, altura, transformacao } } : {}),
    mascaraVetorial,
    ...(recorteVetorial ? { recorteVetorial } : {}),
  };
}

function camadaDoVetor(no: NoVetor, cx: Contexto): CamadaDoArquivo {
  const sx = no.largura / no.moldura[0];
  const sy = no.altura / no.moldura[1];
  const girar = mapeador(no);
  const f: Mapa = (x, y) => girar(no.x + x * sx, no.y + y * sy);
  const filhos = no.caminhos.map((c, i): CamadaDoArquivo => {
    const principal = c.preenchimento ?? (c.traco?.cor as string);
    const camada: CamadaDoArquivo = {
      nome: `${no.nome} · ${resolverCor(cx.doc, principal)}${no.caminhos.length > 1 ? ` (${i + 1})` : ''}`,
      opacidade: 1,
      modo: 'normal',
      oculta: false,
      recortadaNaDeBaixo: false,
      bloqueada: false,
      preenchimento: { tipo: 'cor', cor: cor(cx.doc, principal) },
      mascaraVetorial: (subcaminhosDe(c.d) ?? []).map((sub) => ({ ...nosDoSubcaminho(sub, f), regra: c.regra })),
    };
    if (c.traco)
      camada.tracoVetorial = {
        cor: cor(cx.doc, c.traco.cor),
        espessura: c.traco.espessura * Math.sqrt(sx * sy),
        ponta: c.traco.ponta,
        juncao: c.traco.juncao,
        comPreenchimento: c.preenchimento !== undefined,
      };
    return camada;
  });
  linha(cx, no, 'nativo-editavel', 'no:vetor', `vetor: grupo com ${filhos.length} ${filhos.length === 1 ? 'caminho' : 'caminhos'}`);
  const recorteVetorial = recorteDaMascara(no);
  return { ...comum(no, cx), filhos, ...(recorteVetorial ? { recorteVetorial } : {}) };
}

/** A camada (ou o conjunto) como uma imagem só, e a linha de cada nó dela no relatório. */
function comoImagem(nos: readonly No[], motivo: Motivo, observacao: string, cx: Contexto): CamadaDoArquivo {
  const base = nos[0] as No;
  linha(cx, base, 'raster-com-aviso', motivo.chave, observacao);
  const dentro = [...nos.slice(1), ...(base.tipo === 'grupo' ? todasAsCamadas(base.filhos) : [])];
  // o que vai dentro da imagem já está desenhado nela, com o modo e a opacidade que tinha
  for (const n of dentro)
    cx.rel.camadas.push({
      prancheta: cx.p.nome,
      camada: n.nome,
      idDoNo: n.id,
      tipo: n.tipo,
      destino: 'raster-com-aviso',
      mapeamento: motivo.chave,
      observacao: `está dentro da imagem de "${base.nome}"`,
    });
  if (base.tipo === 'texto') {
    for (const f of fontesDoTexto(base, cx).filter((x) => !x.usada)) {
      const registro = cx.rel.emFalta.fontes.find((r) => r.familia === f.pedida.familia);
      if (registro) registro.camadas.push(nomeDaCamada(cx.p, base.nome));
      else cx.rel.emFalta.fontes.push({ familia: f.pedida.familia, camadas: [nomeDaCamada(cx.p, base.nome)] });
    }
  }
  const imagem = cx.meios?.rasterizar(
    cx.p,
    nos.map((n, i) => (i === 0 ? paraImagem(n) : n)),
  );
  return { ...comum(base, cx), ...(imagem ? { imagem } : {}) };
}

/** A camada tem forma que serve de recorte para as presas a ela? */
const serveDeBase = (c: CamadaDoArquivo): boolean => !c.imagem || Boolean(c.mascaraVetorial);

function camadaDoNo(no: No, cx: Contexto): CamadaDoArquivo | undefined {
  if (no.tipo === 'ajuste') {
    linha(cx, no, 'omitido-com-aviso', `ajuste:${no.ajuste.tipo}`, 'camada de ajuste: não vai para o arquivo vetorial');
    return undefined;
  }
  if (no.tipo === 'grupo') {
    const m = no.mascara;
    if (m && !recorteDaMascara(no)) {
      const motivo: Motivo =
        m.tipo === 'degrade'
          ? { chave: 'mascara:degrade', texto: 'máscara em degradê' }
          : m.tipo === 'sujeito'
            ? { chave: 'mascara:sujeito', texto: 'máscara do sujeito' }
            : { chave: 'mascara-suave-ou-invertida', texto: 'máscara de forma com borda suave ou invertida' };
      return comoImagem([no], motivo, `grupo com ${motivo.texto}: virou uma imagem só`, cx);
    }
    linha(cx, no, 'nativo-editavel', 'no:grupo', 'grupo');
    const recorteVetorial = recorteDaMascara(no);
    return { ...comum(no, cx), filhos: camadasDaLista(no.filhos, cx), ...(recorteVetorial ? { recorteVetorial } : {}) };
  }
  const motivos = motivosParaImagem(no, cx);
  if (motivos.length > 0) return comoImagem([no], motivos[0] as Motivo, `virou imagem: ${motivos.map((m) => m.texto).join(', ')}`, cx);
  switch (no.tipo) {
    case 'forma': {
      const f = mapeador(no);
      linha(
        cx,
        no,
        'nativo-editavel',
        'no:forma',
        `caminho (${no.forma === 'elipse' ? 'elipse' : 'retângulo'}${no.raio ? `, raio ${no.raio}` : ''})${typeof no.preenchimento === 'string' ? '' : `, degradê ${no.preenchimento.tipo}`}${no.traco ? ', com traço por dentro' : ''}`,
      );
      const recorteVetorial = recorteDaMascara(no);
      return {
        ...comum(no, cx),
        preenchimento: preenchimento(cx.doc, no.preenchimento, no),
        mascaraVetorial: [{ aberto: false, regra: 'nao-zero', nos: mapearNos(nosDaForma(no.forma, no.x, no.y, no.largura, no.altura, no.raio), f) }],
        ...(no.traco ? { efeitos: { tracoInterno: { cor: cor(cx.doc, no.traco.cor), espessura: no.traco.espessura } } } : {}),
        ...(recorteVetorial ? { recorteVetorial } : {}),
      };
    }
    case 'texto': {
      const camada = camadaDeTexto(no, cx);
      const recorteVetorial = recorteDaMascara(no);
      return recorteVetorial ? { ...camada, recorteVetorial } : camada;
    }
    case 'imagem':
      return camadaDaFoto(no, cx);
    case 'vetor':
      return camadaDoVetor(no, cx);
  }
}

/** As camadas de uma lista de irmãs, juntando cada base de recorte com as camadas presas a ela. */
function camadasDaLista(nos: readonly No[], cx: Contexto): CamadaDoArquivo[] {
  const saida: CamadaDoArquivo[] = [];
  for (let i = 0; i < nos.length; i++) {
    const base = nos[i] as No;
    const presas: No[] = [];
    while (base.tipo !== 'ajuste' && nos[i + 1]?.recortadaNaDeBaixo) presas.push(nos[++i] as No);
    if (presas.length === 0) {
      const c = camadaDoNo(base, cx);
      if (c) saida.push(c);
      continue;
    }
    // a base precisa ter forma vetorial para cortar as presas: forma, vetor ou foto. Texto e camada que virou imagem não têm
    const baseEmVetor = base.tipo !== 'grupo' && base.tipo !== 'texto' && motivosParaImagem(base as NoVisual, cx).length === 0;
    if (!baseEmVetor) {
      saida.push(
        comoImagem(
          [base, ...presas],
          { chave: 'recorte-em-texto', texto: '' },
          `base de um recorte que o vetor não tem como fazer (${base.tipo === 'texto' ? 'texto' : base.tipo === 'grupo' ? 'grupo' : 'camada que virou imagem'}): a base e as camadas presas a ela viraram uma imagem só`,
          cx,
        ),
      );
      continue;
    }
    const c = camadaDoNo(base, cx);
    if (c && serveDeBase(c)) saida.push(c);
    for (const presa of presas) {
      const p = camadaDoNo(presa, cx);
      if (p) saida.push({ ...p, recortadaNaDeBaixo: true });
    }
  }
  return saida;
}

/** Monta as camadas de uma prancheta para a saída vetorial e preenche o relatório. */
export function montarVetorial(pedido: PedidoDeMontagemVetorial): MontagemVetorial {
  const p = pedido.prancheta;
  const cx: Contexto = { ...pedido, p, imagensPorChave: new Map(pedido.imagens.map((i) => [i.arquivo, i])), fontesUsadas: new Set(), modoTrocado: false };
  const fundo = cor(pedido.doc, p.fundo);
  cx.rel.camadas.push({ prancheta: p.nome, camada: 'Fundo', tipo: 'prancheta', destino: 'nativo-editavel', mapeamento: 'fundo-da-prancheta', observacao: 'retângulo do tamanho da prancheta' });
  const camadaDeFundo: CamadaDoArquivo = {
    nome: 'Fundo',
    opacidade: 1,
    modo: 'normal',
    oculta: false,
    recortadaNaDeBaixo: false,
    bloqueada: false,
    preenchimento: { tipo: 'cor', cor: fundo },
    mascaraVetorial: [{ aberto: false, regra: 'nao-zero', nos: nosDaForma('retangulo', 0, 0, p.largura, p.altura, 0) }],
  };
  const camadas = [camadaDeFundo, ...camadasDaLista(p.filhos, cx)];
  return { largura: p.largura, altura: p.altura, camadas, fontesUsadas: [...cx.fontesUsadas], modoTrocado: cx.modoTrocado };
}
