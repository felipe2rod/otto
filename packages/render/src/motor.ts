// A porta que o editor consome (docs/tecnico/spike-render.md, seção 11.2) e o motor atrás dela.
// O motor recebe documento, prévia e câmera, e agenda o próprio quadro: quem usa não chama "desenhar".
// A tela (WebGL no navegador, CPU nos testes) entra por parâmetro; o resto é o mesmo código.
import { type Caixa, type Documento, type Medidor, todasAsCamadas } from '@otto/documento';
import type { CanvasKit, Surface } from 'canvaskit-wasm';
import { type RecursosEmFalta, type RenderEmPixels, recursosEmFalta, renderizarPrancheta } from './compositor';
import { CenaDoEditor, type FabricaDeImagens, fabricaNaCpu, type PreviaDeGesto } from './editor';
import { criarSessao, type Sessao } from './sessao';
import { criarMedidor } from './verificacao';

/** A câmera do editor: onde o documento aparece na área do canvas e em que escala. */
export interface Camera {
  /** posição, em pixels de tela (CSS), da origem do plano do editor dentro da área do canvas */
  x: number;
  y: number;
  /** pixels de tela por unidade do documento */
  zoom: number;
}

/** Fontes e imagens entram por aqui, como bytes: o motor não conhece endereço da API e decodifica por dentro. */
export interface RecursosDoRender {
  imagem(hash: string): Promise<ArrayBuffer | Uint8Array>;
  fonte(familia: string, peso: number): Promise<ArrayBuffer | Uint8Array>;
}

export interface MotorDeRender {
  redimensionar(larguraCss: number, alturaCss: number, pixelsPorPonto: number): void;
  /** O cache é por identidade da prancheta (e do objeto de tokens de cor). `tocados` é atalho, não substituto. */
  definirDocumento(doc: Documento, mudanca?: { tocados: ReadonlySet<string> }): void;
  /** Gesto em andamento: desloca nós sem criar documento novo. null encerra. Ao soltar, chame definirDocumento antes (ou no mesmo quadro). */
  definirPrevia(previa: PreviaDeGesto | null): void;
  definirCamera(camera: Camera): void;
  /** Busca e entrega ao motor as fontes e imagens que o documento usa. Resolve mesmo quando alguma falta: veja `emFalta`. */
  prepararRecursos(doc: Documento): Promise<void>;
  /** Mede pela tinta, com o mesmo motor de texto do servidor: é o medidor do aplicarLote local. */
  readonly medidor: Medidor;
  readonly contadores: { composicoesDePrancheta: number; partes: number; quadros: number };
  /** Fontes e imagens do documento corrente que a porta de recursos não entregou. O texto sem fonte não é desenhado. */
  readonly emFalta: RecursosEmFalta;
  /** O render de referência (CPU), igual ao do servidor. Para "ver como exporta" e para o lint local. */
  renderizarReferencia(idDaPrancheta: string, opcoes?: { escala?: number; regiao?: Caixa }): Promise<RenderEmPixels>;
  /** O WebGL pode perder o contexto; o editor precisa saber para avisar e recriar o motor. */
  aoPerderContexto(aviso: () => void): void;
  destruir(): void;
}

/** Onde o motor desenha. No navegador é um canvas WebGL (navegador.ts); nos testes, uma superfície de CPU. */
export interface Tela {
  /** A superfície corrente. Muda quando a tela é redimensionada. */
  superficie(): Surface;
  /** Quem rasteriza as imagens do cache nesta tela. */
  fabrica(sessao: Sessao): FabricaDeImagens;
  redimensionar(largura: number, altura: number): void;
  /** O canvas guarda o quadro anterior? Só então a região suja pode ser usada. */
  readonly guardaOQuadroAnterior: boolean;
  aoPerderContexto(aviso: () => void): void;
  destruir(): void;
}

export function telaDeCpu(ck: CanvasKit, largura: number, altura: number): Tela {
  const criar = (w: number, h: number): Surface => {
    const s = ck.MakeSurface(Math.max(1, w), Math.max(1, h));
    if (!s) throw new Error(`O motor não conseguiu alocar a tela de ${w} × ${h} px`);
    return s;
  };
  let superficie = criar(largura, altura);
  return {
    superficie: () => superficie,
    fabrica: (sessao) => fabricaNaCpu(sessao),
    redimensionar(w, h) {
      superficie.delete();
      superficie = criar(w, h);
    },
    guardaOQuadroAnterior: true,
    aoPerderContexto() {},
    destruir: () => superficie.delete(),
  };
}

export interface OpcoesDoMotor {
  /** Como pedir o próximo quadro. Padrão: requestAnimationFrame. Os testes passam um agendador próprio. */
  agendar?: (quadro: () => void) => void;
  /** Cor da área de trabalho, atrás das pranchetas, em #rrggbb. */
  fundo?: string;
}

const bytesDe = (dados: ArrayBuffer | Uint8Array): Uint8Array => (dados instanceof Uint8Array ? dados : new Uint8Array(dados));

export function criarMotorSobreTela(ck: CanvasKit, tela: Tela, recursos: RecursosDoRender, opcoes: OpcoesDoMotor = {}): MotorDeRender {
  const sessao = criarSessao(ck, { fontes: [], imagens: [] });
  const cena = new CenaDoEditor(sessao, tela.fabrica(sessao));
  const agendar = opcoes.agendar ?? ((quadro: () => void) => void (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(quadro) : setTimeout(quadro, 16)));
  const corDeFundo = Number.parseInt((opcoes.fundo ?? '#262422').slice(1), 16);
  const fundo = ck.Color((corDeFundo >> 16) & 255, (corDeFundo >> 8) & 255, corDeFundo & 255, 1);
  const entregues = new Set<string>();
  let doc: Documento | undefined;
  let camera: Camera = { x: 0, y: 0, zoom: 1 };
  let pixelsPorPonto = 1;
  let agendado = false;
  let destruido = false;
  /** Desde o último quadro, mudou algo além do deslocamento da prévia? Se não, a região suja basta. */
  let tudoMudou = true;
  let quadros = 0;

  const quadro = (): void => {
    agendado = false;
    if (destruido) return;
    cena.comporTudo();
    const superficie = tela.superficie();
    cena.desenharQuadro(
      superficie.getCanvas(),
      { x: camera.x * pixelsPorPonto, y: camera.y * pixelsPorPonto, zoom: camera.zoom * pixelsPorPonto },
      { fundo, regiaoSuja: tela.guardaOQuadroAnterior && !tudoMudou },
    );
    superficie.flush();
    tudoMudou = false;
    quadros++;
  };
  const pedirQuadro = (tudo: boolean): void => {
    if (destruido) return;
    if (tudo) tudoMudou = true;
    if (agendado) return;
    agendado = true;
    agendar(quadro);
  };

  return {
    redimensionar(larguraCss, alturaCss, ppp) {
      if (destruido) return;
      pixelsPorPonto = ppp;
      tela.redimensionar(Math.round(larguraCss * ppp), Math.round(alturaCss * ppp));
      pedirQuadro(true);
    },
    definirDocumento(novo) {
      if (destruido) return;
      doc = novo;
      cena.definirDocumento(novo);
      pedirQuadro(true);
    },
    definirPrevia(previa) {
      if (destruido) return;
      const antes = cena.modoDaPrevia;
      cena.definirPrevia(previa);
      // começar ou encerrar a prévia redesenha tudo; mover dentro dela, só a região da camada
      pedirQuadro(previa === null || antes === undefined || cena.modoDaPrevia !== 'partes');
    },
    definirCamera(nova) {
      if (destruido) return;
      camera = nova;
      pedirQuadro(true);
    },
    async prepararRecursos(alvo) {
      const fontes = new Map<string, { familia: string; peso: number }>();
      const imagens = new Set<string>();
      for (const p of alvo.pranchetas) {
        for (const n of todasAsCamadas(p.filhos)) {
          if (n.tipo === 'texto')
            for (const f of [{ familia: n.fonte, peso: n.peso }, ...(n.trechos ?? []).map((t) => ({ familia: t.fonte ?? n.fonte, peso: t.peso ?? n.peso }))])
              fontes.set(`fonte:${f.familia}#${f.peso}`, f);
          if (n.tipo === 'imagem') imagens.add(n.arquivo);
          if (n.mascara?.tipo === 'sujeito') imagens.add(n.mascara.arquivo);
        }
      }
      let chegou = false;
      // o que a porta não entregar fica de fora, e aparece em emFalta; a próxima chamada tenta de novo
      await Promise.all([
        ...[...fontes]
          .filter(([chave]) => !entregues.has(chave))
          .map(async ([chave, f]) => {
            const bytes = await recursos.fonte(f.familia, f.peso).catch(() => undefined);
            if (!bytes || destruido) return;
            sessao.adicionarFonte({ familia: f.familia, peso: f.peso, bytes: bytesDe(bytes) });
            entregues.add(chave);
            chegou = true;
          }),
        ...[...imagens]
          .filter((hash) => !entregues.has(`imagem:${hash}`))
          .map(async (hash) => {
            const bytes = await recursos.imagem(hash).catch(() => undefined);
            if (!bytes || destruido) return;
            sessao.adicionarImagem({ arquivo: hash, bytes: bytesDe(bytes) });
            entregues.add(`imagem:${hash}`);
            chegou = true;
          }),
      ]);
      if (chegou && !destruido) {
        // o que estava em cache foi desenhado sem o recurso que acabou de chegar
        cena.invalidarTudo();
        pedirQuadro(true);
      }
    },
    medidor: criarMedidor(sessao),
    get contadores() {
      return { composicoesDePrancheta: cena.contadores.composicoesDePrancheta, partes: cena.contadores.partes, quadros };
    },
    get emFalta() {
      return doc ? recursosEmFalta(sessao, doc) : { fontes: [], imagens: [] };
    },
    async renderizarReferencia(idDaPrancheta, o = {}) {
      const p = doc?.pranchetas.find((x) => x.id === idDaPrancheta);
      if (!doc || !p) throw new Error(`a prancheta "${idDaPrancheta}" não existe no documento que o motor tem`);
      return renderizarPrancheta(sessao, doc, p, { ...(o.escala !== undefined ? { escala: o.escala } : {}), ...(o.regiao ? { regiao: o.regiao } : {}) });
    },
    aoPerderContexto: (aviso) => tela.aoPerderContexto(aviso),
    destruir() {
      if (destruido) return;
      destruido = true;
      cena.destruir();
      sessao.destruir();
      tela.destruir();
    },
  };
}
