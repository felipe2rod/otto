// Ambiente em memória para rodar uma tarefa do Otto fora da API: o documento é uma variável, o motor de
// render é o de verdade (@otto/render, raster de CPU), a verificação é a de verdade (@otto/documento), e as
// fontes e as fotos vêm do disco. É o que a avaliação usa (ADR 029, item 6) e o que mede custo e tempo.
//
// É borda: lê disco e carrega o WebAssembly. Por isso mora aqui, e não em packages/agente, que é puro.
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { AmbienteDaTarefa, ChamadaRegistrada, EventoDaTarefa, FamiliaDeFonte, ImagemParaOModelo, LimitesDoSistema, LoteDoAgente, ModeloDoAgente } from '../../packages/agente/src/index';
import { aplicarLote, type Documento, documentoVazio, type No, resumirDocumento, todasAsCamadas, verificarDocumento } from '../../packages/documento/src/index';
import { codificarPng, criarMedidor, criarMeiosDeVerificacao, criarSessao, type FonteDeArquivo, type RenderEmPixels, renderizarPrancheta, type Sessao } from '../../packages/render/src/index';
import { carregarCanvasKit } from '../../packages/render/src/node';
import { type BancoLocal, criarBancoLocal } from './banco-local';

export const RAIZ = path.resolve(import.meta.dirname, '../..');
const PASTA_DE_FONTES = path.join(RAIZ, 'apps/api/recursos/fontes');
const PASTA_DE_ARQUIVOS = path.join(RAIZ, 'poc/dados/arquivos');

function fontesDaBiblioteca(): { arquivos: FonteDeArquivo[]; familias: FamiliaDeFonte[] } {
  const indice = JSON.parse(readFileSync(path.join(PASTA_DE_FONTES, 'indice.json'), 'utf8')) as { fontes: { familia: string; peso: number; arquivo: string }[] };
  const arquivos = indice.fontes.map((f) => ({ familia: f.familia, peso: f.peso, bytes: new Uint8Array(readFileSync(path.join(PASTA_DE_FONTES, f.arquivo))) }));
  const porFamilia = new Map<string, number[]>();
  for (const f of indice.fontes)
    porFamilia.set(
      f.familia,
      [...(porFamilia.get(f.familia) ?? []), f.peso].sort((a, b) => a - b),
    );
  // o uso de cada família entra no prompt pelo próprio pacote do agente (fontes-base.ts)
  return { arquivos, familias: [...porFamilia.entries()].map(([familia, pesos]) => ({ familia, pesos })) };
}

function codificarJpeg(sessao: Sessao, render: RenderEmPixels, qualidade = 85): Uint8Array {
  const { ck } = sessao;
  const img = ck.MakeImage(
    { width: render.largura, height: render.altura, colorType: ck.ColorType.RGBA_8888, alphaType: ck.AlphaType.Unpremul, colorSpace: ck.ColorSpace.SRGB },
    render.rgba,
    render.largura * 4,
  );
  if (!img) throw new Error('não foi possível montar a imagem do render');
  const bytes = img.encodeToBytes(ck.ImageFormat.JPEG, qualidade);
  img.delete();
  if (!bytes) throw new Error('este motor não codifica JPEG: carregue a variante completa');
  return bytes;
}

const emBase64 = (bytes: Uint8Array): string => Buffer.from(bytes).toString('base64');

/** Reduz uma foto para o modelo ver: lado maior de `ladoMaximo`, em JPEG. */
function reduzirFoto(sessao: Sessao, bytes: Uint8Array, ladoMaximo: number): ImagemParaOModelo | undefined {
  const { ck } = sessao;
  const img = ck.MakeImageFromEncoded(bytes);
  if (!img) return undefined;
  const escala = Math.min(1, ladoMaximo / Math.max(img.width(), img.height()));
  const largura = Math.max(1, Math.round(img.width() * escala));
  const altura = Math.max(1, Math.round(img.height() * escala));
  const superficie = ck.MakeSurface(largura, altura);
  if (!superficie) {
    img.delete();
    return undefined;
  }
  const tinta = new ck.Paint();
  superficie.getCanvas().drawImageRectOptions(img, ck.XYWHRect(0, 0, img.width(), img.height()), ck.XYWHRect(0, 0, largura, altura), ck.FilterMode.Linear, ck.MipmapMode.Linear, tinta);
  const reduzida = superficie.makeImageSnapshot();
  const jpeg = reduzida.encodeToBytes(ck.ImageFormat.JPEG, 82);
  tinta.delete();
  reduzida.delete();
  superficie.delete();
  img.delete();
  return jpeg ? { mime: 'image/jpeg', base64: emBase64(jpeg), largura, altura } : undefined;
}

export interface OpcoesDoAmbienteEmMemoria {
  modelo: ModeloDoAgente;
  modeloDoJulgamento?: ModeloDoAgente;
  documento?: Documento;
  /** Nome da peça, para o resumo. */
  nome?: string;
  /** Onde gravar cada render que o modelo viu. Ausente: não grava. */
  pastaDeRenders?: string;
  /** Padrão: sorteado. Para reproduzir um roteiro gravado, os ids da gravação (idsDoRoteiro). */
  novoId?: () => string;
  sinal?: AbortSignal;
  limites?: Partial<LimitesDoSistema>;
  /** Falso: a tarefa roda sem buscarImagens nem trazerImagem. */
  comBancoDeImagens?: boolean;
  /** Chamado a cada evento, depois de registrado. */
  aoEmitir?(evento: EventoDaTarefa, decorridoMs: number): void;
}

export interface AmbienteEmMemoria extends AmbienteDaTarefa {
  /** Os eventos, com o tempo desde o começo. */
  registro: { decorridoMs: number; evento: EventoDaTarefa }[];
  chamadas: ChamadaRegistrada[];
  lotes: LoteDoAgente[];
  /** Os ids que a porta novoId devolveu, na ordem: vão no roteiro gravado. */
  ids: string[];
  banco: BancoLocal;
  /** PNG da prancheta em tamanho real. */
  pngDaPrancheta(pranchetaId: string): Uint8Array;
  /** Verificação do documento atual, sem contar como volta do agente. */
  verificarAgora(prancheta?: string): ReturnType<typeof verificarDocumento>;
  fechar(): void;
}

function arquivosDoNo(n: No): string[] {
  const lista: string[] = [];
  if (n.tipo === 'imagem') lista.push(n.arquivo);
  if (n.mascara?.tipo === 'sujeito') lista.push(n.mascara.arquivo);
  return lista;
}

export async function criarAmbienteEmMemoria(opcoes: OpcoesDoAmbienteEmMemoria): Promise<AmbienteEmMemoria> {
  // a variante completa codifica JPEG; os pixels são os mesmos da padrão (docs/tecnico/spike-render.md)
  const ck = await carregarCanvasKit('completa');
  const { arquivos, familias } = fontesDaBiblioteca();
  const sessao = criarSessao(ck, { fontes: arquivos, imagens: [] });
  const banco = criarBancoLocal(PASTA_DE_ARQUIVOS, (bytes) => reduzirFoto(sessao, bytes, 768));
  const inicio = Date.now();
  let doc = opcoes.documento ?? documentoVazio();
  let renders = 0;

  /** Entrega ao motor as fotos que o documento cita e que existem no disco. O que faltar, o motor desenha em cinza. */
  const garantirImagens = (d: Documento) => {
    for (const p of d.pranchetas)
      for (const n of todasAsCamadas(p.filhos))
        for (const arquivo of arquivosDoNo(n)) {
          if (sessao.imagem(arquivo)) continue;
          const bytes = banco.bytes(arquivo);
          if (bytes) sessao.adicionarImagem({ arquivo, bytes });
        }
  };
  garantirImagens(doc);

  const pranchetaDe = (d: Documento, id: string) => {
    const p = d.pranchetas.find((x) => x.id === id);
    if (!p) throw new Error('prancheta desconhecida');
    return p;
  };
  if (opcoes.pastaDeRenders) mkdirSync(opcoes.pastaDeRenders, { recursive: true });

  const amb: AmbienteEmMemoria = {
    modelo: opcoes.modelo,
    ...(opcoes.modeloDoJulgamento ? { modeloDoJulgamento: opcoes.modeloDoJulgamento } : {}),
    registro: [],
    chamadas: [],
    lotes: [],
    ids: [],
    banco,
    documento: () => doc,
    resumir: (d, prancheta) => resumirDocumento(d, { medidor: criarMedidor(sessao), ...(prancheta ? { prancheta } : {}), ...(opcoes.nome ? { nome: opcoes.nome } : {}) }),
    async aplicarLote(lote) {
      // as fotos do lote entram antes: quem mede o texto e desenha é a mesma sessão
      const r = aplicarLote(doc, lote.operacoes, { autoria: { tipo: 'agente', tarefaId: 'avaliacao' }, idDoLote: lote.id, medidor: criarMedidor(sessao) });
      if (!r.ok) return { ok: false, erro: r.erro };
      doc = r.doc;
      garantirImagens(doc);
      amb.lotes.push(lote);
      return { ok: true, tocados: r.tocados, versao: amb.lotes.length };
    },
    async renderizar(d, pedido) {
      const p = pranchetaDe(d, pedido.prancheta);
      const [x, y, w, h] = pedido.regiao ?? [0, 0, p.largura, p.altura];
      const regiao = { x: Math.max(0, x), y: Math.max(0, y), w: Math.max(1, Math.min(w, p.largura - Math.max(0, x))), h: Math.max(1, Math.min(h, p.altura - Math.max(0, y))) };
      const escala = Math.min(1, pedido.ladoMaximo / Math.max(regiao.w, regiao.h));
      const render = renderizarPrancheta(sessao, d, p, { escala, ...(pedido.regiao ? { regiao } : {}) });
      const jpeg = codificarJpeg(sessao, render);
      if (opcoes.pastaDeRenders)
        writeFileSync(path.join(opcoes.pastaDeRenders, `${String(++renders).padStart(3, '0')}-${p.nome.replace(/[^\p{L}\p{N}]+/gu, '_')}${pedido.regiao ? '-detalhe' : ''}.jpg`), jpeg);
      return { mime: 'image/jpeg', base64: emBase64(jpeg), largura: render.largura, altura: render.altura };
    },
    verificar: async (d, prancheta) => verificarDocumento(d, criarMeiosDeVerificacao(sessao), prancheta),
    async previaDeArquivo(arquivo, ladoMaximo) {
      const bytes = banco.bytes(arquivo);
      return bytes ? reduzirFoto(sessao, bytes, ladoMaximo) : undefined;
    },
    ...(opcoes.comBancoDeImagens !== false && banco.total > 0 ? { imagens: banco } : {}),
    fontes: { daConta: () => familias },
    relogio: { agora: () => Date.now() },
    novoId: () => {
      const id = opcoes.novoId ? opcoes.novoId() : randomUUID();
      amb.ids.push(id);
      return id;
    },
    emitir(evento) {
      const decorridoMs = Date.now() - inicio;
      amb.registro.push({ decorridoMs, evento });
      opcoes.aoEmitir?.(evento, decorridoMs);
    },
    registrarChamada: (c) => void amb.chamadas.push(c),
    sinal: opcoes.sinal ?? new AbortController().signal,
    ...(opcoes.limites ? { limites: opcoes.limites } : {}),
    pngDaPrancheta: (id) => codificarPng(sessao, renderizarPrancheta(sessao, doc, pranchetaDe(doc, id))),
    verificarAgora: (prancheta) => verificarDocumento(doc, criarMeiosDeVerificacao(sessao), prancheta),
    fechar: () => sessao.destruir(),
  };
  return amb;
}

/** Lê um documento salvo: a árvore pura, ou o registro da POC ({ doc, historico, tarefas }). */
export function lerDocumento(caminho: string): { documento: unknown; nome: string | undefined } {
  if (!existsSync(caminho)) throw new Error(`documento não encontrado: ${caminho}`);
  const bruto = JSON.parse(readFileSync(caminho, 'utf8')) as { doc?: { nome?: string }; nome?: string };
  const arvore = bruto.doc ?? bruto;
  return { documento: arvore, nome: typeof (arvore as { nome?: unknown }).nome === 'string' ? (arvore as { nome: string }).nome : undefined };
}
