// O `test` dos testes de navegador: cada teste cria a peça que usa (pela API) e ela é arquivada ao
// terminar. Nenhum teste depende de peça que já exista na conta, nem altera uma.
//
// Seletores: por papel e por rótulo acessível vindo de `src/textos/` (a constante, não a frase), ou
// por atributo de teste. A redação da tela vai mudar; os testes não podem quebrar por causa dela.
import { test as base, expect, type Locator, type Page } from '@playwright/test';
import { editor as textos } from '../../src/textos/editor';
import { Api, type NoDoServidor, type PecaDoServidor } from './api';
import { lerPng, png } from './arquivos';

export { expect };
export type Cor = readonly [number, number, number];

/** A distância entre pranchetas no plano do editor (VAO_ENTRE_PRANCHETAS, de @otto/documento). */
const VAO_ENTRE_PRANCHETAS = 160;

/** As cores da peça padrão: chapadas e distantes entre si, para conferir o canvas por pixel. */
export const CORES = {
  fundoDoFeed: [244, 239, 227],
  bloco: [192, 57, 43],
  disco: [31, 111, 165],
  foto: [46, 160, 90],
  faixa: [15, 59, 44],
  texto: [23, 23, 28],
} as const satisfies Record<string, Cor>;

const hex = (c: Cor): string => `#${c.map((n) => n.toString(16).padStart(2, '0')).join('')}`;
const escapar = (texto: string): string => texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * A peça padrão dos testes. Feed 1080×1350: Bloco (retângulo), Disco (elipse), Título e Legenda
 * (texto) e Foto (imagem de uma cor só). Quadrado 1080×1080: Faixa. Tudo reto e sem sobreposição.
 * (A segunda prancheta não é um story de propósito: o story ganha as guias da zona da interface por cima.)
 */
export function operacoesDaPecaPadrao(foto: { sha256: string; largura: number; altura: number }): unknown[] {
  const forma = (nome: string, formato: string, x: number, y: number, largura: number, altura: number, cor: Cor) => ({
    tipo: 'forma',
    nome,
    forma: formato,
    x,
    y,
    largura,
    altura,
    preenchimento: hex(cor),
  });
  const texto = (nome: string, conteudo: string, y: number, altura: number, tamanho: number, peso: number) => ({
    tipo: 'texto',
    nome,
    conteudo,
    fonte: 'IBM Plex Sans',
    peso,
    tamanho,
    x: 100,
    y,
    largura: 880,
    altura,
    cor: hex(CORES.texto),
  });
  return [
    { op: 'criarPrancheta', nome: 'Feed', largura: 1080, altura: 1350, fundo: hex(CORES.fundoDoFeed) },
    { op: 'criarPrancheta', nome: 'Quadrado', largura: 1080, altura: 1080, fundo: '#ffffff' },
    { op: 'criarNo', prancheta: 'Feed', no: forma('Bloco', 'retangulo', 100, 100, 400, 300, CORES.bloco) },
    { op: 'criarNo', prancheta: 'Feed', no: forma('Disco', 'elipse', 600, 150, 300, 300, CORES.disco) },
    { op: 'criarNo', prancheta: 'Feed', no: texto('Título', 'Otto em teste', 560, 160, 120, 700) },
    { op: 'criarNo', prancheta: 'Feed', no: texto('Legenda', 'linha de apoio', 760, 80, 48, 400) },
    {
      op: 'criarNo',
      prancheta: 'Feed',
      no: { tipo: 'imagem', nome: 'Foto', arquivo: foto.sha256, larguraOriginal: foto.largura, alturaOriginal: foto.altura, x: 100, y: 950, largura: 400, altura: 300 },
    },
    { op: 'criarNo', prancheta: 'Quadrado', no: forma('Faixa', 'retangulo', 0, 0, 1080, 200, CORES.faixa) },
  ];
}

export interface Ponto {
  x: number;
  y: number;
}

/** O editor aberto numa peça, visto como o designer o usa: mouse, teclado, painéis. */
export class Editor {
  private pranchetas: { largura: number }[] = [];
  pecaId = '';

  constructor(
    readonly page: Page,
    private readonly api: Api,
  ) {}

  get area(): Locator {
    return this.page.locator('[data-area-do-canvas]');
  }
  /** O estado do salvamento, no topo. */
  get salvamento(): Locator {
    // pelo atributo, não pela ordem: o topo tem outra região de estado (a da exportação)
    return this.page.getByRole('banner').locator('[role=status][data-estado]');
  }
  /** O aviso de erro do editor. (O Next mantém um `role=alert` próprio, vazio, para anunciar a rota.) */
  get alerta(): Locator {
    return this.page.locator('[role=alert]:not(#__next-route-announcer__)');
  }
  get arvore(): Locator {
    return this.page.getByRole('tree', { name: textos.paineis.camadas.titulo });
  }
  botaoDoTopo(nome: string): Locator {
    return this.page.getByRole('banner').getByRole('button', { name: nome, exact: true });
  }
  /** A linha da camada (ou da prancheta) no painel de Camadas. */
  linha(nome: string): Locator {
    return this.page.getByRole('treeitem', { name: new RegExp(`^${escapar(nome)},`) });
  }
  campo(rotulo: string): Locator {
    return this.page.getByLabel(rotulo, { exact: true });
  }

  /** Abre a peça e espera o editor estar pronto: peça salva, câmera posta e canvas respondendo. */
  async abrir(peca: Pick<PecaDoServidor, 'id'>): Promise<void> {
    this.pecaId = peca.id;
    this.pranchetas = (await this.api.abrir(peca.id)).arvore.pranchetas;
    await this.page.goto(`/editor/p/${peca.id}`);
    await this.pronto();
  }

  async pronto(): Promise<void> {
    // Em desenvolvimento a API recarrega sozinha quando um arquivo dela muda. Se a peça não abriu por
    // isso, o teste faz o que o designer faria: "Tentar de novo".
    const deNovo = this.page.getByRole('button', { name: textos.canvas.tentarDeNovo });
    for (let tentativa = 0; tentativa < 6; tentativa++) {
      const abriu = await this.salvamento
        .or(deNovo)
        .first()
        .waitFor({ timeout: 90_000 })
        .then(() => this.salvamento.isVisible());
      if (abriu) break;
      await this.page.waitForTimeout(3000);
      await deNovo.click().catch(() => undefined);
    }
    // salva, ou somente leitura (a peça com tarefa do Otto viva abre assim)
    await expect(this.salvamento).toHaveAttribute('data-estado', /^(salvo|leitura)$/, { timeout: 90_000 });
    await expect(this.area).toHaveAttribute('data-camera', /\d/);
    // a árvore de camadas só aparece com o documento entregue aos painéis
    if (this.pranchetas.length > 0) await expect(this.page.getByRole('treeitem').first()).toBeVisible();
  }

  servidor(): Promise<PecaDoServidor> {
    return this.api.abrir(this.pecaId);
  }

  /** Um ponto da prancheta (em unidades do documento) como ponto da tela, pela câmera que o editor publica. */
  async naTela(ponto: Ponto, prancheta = 0): Promise<Ponto> {
    const camera = (await this.area.getAttribute('data-camera'))?.split(',').map(Number);
    const caixa = await this.area.boundingBox();
    if (camera?.length !== 3 || !caixa) throw new Error('o canvas ainda não publicou a câmera');
    const [cx, cy, zoom] = camera as [number, number, number];
    const origem = this.pranchetas.slice(0, prancheta).reduce((soma, p) => soma + p.largura + VAO_ENTRE_PRANCHETAS, 0);
    return { x: caixa.x + cx + (origem + ponto.x) * zoom, y: caixa.y + cy + ponto.y * zoom };
  }

  async zoom(): Promise<number> {
    return Number((await this.area.getAttribute('data-camera'))?.split(',')[2]);
  }

  async clicar(ponto: Ponto, prancheta = 0): Promise<void> {
    const p = await this.naTela(ponto, prancheta);
    await this.page.mouse.click(p.x, p.y);
  }

  /** Clique com Shift: acrescenta a camada à seleção. */
  async clicarComShift(ponto: Ponto, prancheta = 0): Promise<void> {
    const p = await this.naTela(ponto, prancheta);
    await this.page.keyboard.down('Shift');
    await this.page.mouse.click(p.x, p.y);
    await this.page.keyboard.up('Shift');
  }

  /** Aperta em `de`, anda até `ate` em passos (um quadro cada) e solta. Pontos em unidades do documento. */
  async arrastar(de: Ponto, ate: Ponto, opcoes: { prancheta?: number; shift?: boolean } = {}): Promise<void> {
    await this.arrastarNaTela(await this.naTela(de, opcoes.prancheta), await this.naTela(ate, opcoes.prancheta), opcoes.shift);
  }

  async arrastarNaTela(de: Ponto, ate: Ponto, shift = false): Promise<void> {
    const { mouse, keyboard } = this.page;
    await mouse.move(de.x, de.y);
    await mouse.down();
    if (shift) await keyboard.down('Shift');
    await mouse.move(ate.x, ate.y, { steps: 12 });
    // um quadro para a prévia chegar ao motor antes de soltar
    await this.page.evaluate(() => new Promise((seguir) => requestAnimationFrame(() => requestAnimationFrame(seguir))));
    await mouse.up();
    if (shift) await keyboard.up('Shift');
  }

  /** Arrasta uma linha do painel de Camadas até outra. `fracao` é onde solta na linha de destino: 0 o topo, 0.5 o meio, 1 a base. */
  async arrastarLinha(de: string, para: string, fracao: number): Promise<void> {
    const origem = await this.linha(de).boundingBox();
    const destino = await this.linha(para).boundingBox();
    if (!origem || !destino) throw new Error(`falta a linha de "${de}" ou de "${para}" no painel`);
    const { mouse } = this.page;
    await mouse.move(origem.x + 90, origem.y + origem.height / 2);
    await mouse.down();
    await mouse.move(destino.x + 90, destino.y + destino.height * fracao, { steps: 10 });
    await mouse.up();
  }

  /** Ponto da tela a `graus` (horário, a partir de "para cima") e `raio` pixels de um centro. */
  static emVolta(centro: Ponto, raio: number, graus: number): Ponto {
    const a = (graus * Math.PI) / 180;
    return { x: centro.x + raio * Math.sin(a), y: centro.y - raio * Math.cos(a) };
  }

  /**
   * Gira pela pega: ela fica 24 pixels de tela acima do meio do lado de cima do quadro da seleção.
   * `topo` e `centro` são pontos da prancheta; o arraste vai da pega até `graus` em torno do centro.
   */
  async girar(topo: Ponto, centro: Ponto, graus: number, shift = false): Promise<void> {
    const t = await this.naTela(topo);
    const c = await this.naTela(centro);
    const pega = { x: t.x, y: t.y - 24 };
    await this.arrastarNaTela(pega, Editor.emVolta(c, c.y - pega.y, graus), shift);
  }

  /** Tecla com o foco no canvas (é onde setas, Delete e Enter são do editor). */
  async teclar(tecla: string): Promise<void> {
    await this.area.focus();
    await this.page.keyboard.press(tecla);
  }

  /** Os nomes das camadas selecionadas, como o painel de Camadas mostra. */
  async selecionadas(): Promise<string[]> {
    const rotulos = await this.page.locator('[role=treeitem][aria-selected=true]').evaluateAll((linhas) => linhas.map((l) => l.getAttribute('aria-label') ?? ''));
    return rotulos.map((r) => r.slice(0, r.lastIndexOf(','))).sort();
  }

  /** A cor do pixel da tela num ponto da prancheta: é assim que se confere que o motor desenhou. */
  async corEm(ponto: Ponto, prancheta = 0): Promise<Cor> {
    const p = await this.naTela(ponto, prancheta);
    const captura = await this.page.screenshot({ clip: { x: Math.round(p.x) - 1, y: Math.round(p.y) - 1, width: 3, height: 3 } });
    const [r, g, b] = lerPng(captura).pixel(1, 1);
    return [r, g, b];
  }

  /** Espera o canvas mostrar a cor esperada num ponto (o motor carrega e desenha depois de a página abrir). */
  async esperarCor(ponto: Ponto, cor: Cor, opcoes: { prancheta?: number; tolerancia?: number } = {}): Promise<void> {
    const tolerancia = opcoes.tolerancia ?? 12;
    await expect
      .poll(async () => distancia(await this.corEm(ponto, opcoes.prancheta), cor), { message: `cor em (${ponto.x}, ${ponto.y}) perto de rgb(${cor.join(', ')})`, timeout: 60_000 })
      .toBeLessThanOrEqual(tolerancia);
  }

  /**
   * Quantos pixels as sobreposições do canvas têm pintados (rótulo e moldura de prancheta, guias,
   * contornos, alças). Zero: não há nada por cima do que o motor desenhou.
   */
  tintaDasSobreposicoes(): Promise<number> {
    return this.area.evaluate((area) => {
      for (const tela of area.querySelectorAll('canvas')) {
        const ctx = tela.getContext('2d');
        if (!ctx) continue; // o canvas do motor é WebGL
        const dados = ctx.getImageData(0, 0, tela.width, tela.height).data;
        let pintados = 0;
        for (let i = 3; i < dados.length; i += 4) if ((dados[i] ?? 0) > 0) pintados++;
        return pintados;
      }
      return -1;
    });
  }

  /** Quantos pixels escuros há numa caixa da prancheta: é como se confere que um texto foi desenhado. */
  async pixelsEscuros(caixa: { x: number; y: number; largura: number; altura: number }, prancheta = 0): Promise<number> {
    const a = await this.naTela({ x: caixa.x, y: caixa.y }, prancheta);
    const b = await this.naTela({ x: caixa.x + caixa.largura, y: caixa.y + caixa.altura }, prancheta);
    const imagem = lerPng(await this.page.screenshot({ clip: { x: Math.floor(a.x), y: Math.floor(a.y), width: Math.ceil(b.x - a.x), height: Math.ceil(b.y - a.y) } }));
    let escuros = 0;
    for (let y = 0; y < imagem.altura; y++)
      for (let x = 0; x < imagem.largura; x++)
        if (
          imagem
            .pixel(x, y)
            .slice(0, 3)
            .every((v) => v < 90)
        )
          escuros++;
    return escuros;
  }
}

/** A maior diferença entre duas cores, canal a canal. */
export const distancia = (a: Cor, b: Cor): number => Math.max(...a.map((v, i) => Math.abs(v - (b[i] ?? 0))));

/** O centro da caixa de uma camada do servidor. */
export const centro = (no: NoDoServidor): Ponto => ({ x: (no.x ?? 0) + (no.largura ?? 0) / 2, y: (no.y ?? 0) + (no.altura ?? 0) / 2 });

interface Ferramentas {
  api: Api;
  /** Cria uma peça para o teste (a padrão, ou com as operações dadas) e a arquiva no fim. */
  criarPeca: (opcoes?: { nome?: string; operacoes?: unknown[] | 'vazia' }) => Promise<PecaDoServidor>;
  editor: Editor;
  /**
   * O que o teste criou PELA TELA (peça do formulário, marca, briefing salvo) e precisa sair no fim:
   * a peça é arquivada (com a tarefa viva encerrada antes), a marca e o briefing são apagados.
   */
  descartar: { peca(id: string): void; marca(id: string): void; briefing(id: string): void };
}

export const test = base.extend<Ferramentas>({
  api: async ({ request }, usar) => {
    await usar(new Api(request, process.env.E2E_API ?? 'http://localhost:8080'));
  },
  criarPeca: async ({ api }, usar, info) => {
    const criadas: string[] = [];
    await usar(async (opcoes = {}) => {
      const peca = await api.criar(opcoes.nome ?? `e2e ${info.title.slice(0, 60)} ${Date.now().toString(36)}`);
      criadas.push(peca.id);
      if (opcoes.operacoes === 'vazia') return peca;
      const operacoes = opcoes.operacoes ?? operacoesDaPecaPadrao(await api.enviarImagem(png(400, 300, CORES.foto)));
      await api.lote(peca.id, operacoes);
      return api.abrir(peca.id);
    });
    for (const id of criadas) {
      await api.encerrarTarefas(id).catch(() => undefined);
      await api.arquivar(id);
    }
  },
  descartar: async ({ api }, usar) => {
    const pecas: string[] = [];
    const marcas: string[] = [];
    const briefings: string[] = [];
    await usar({ peca: (id) => void pecas.push(id), marca: (id) => void marcas.push(id), briefing: (id) => void briefings.push(id) });
    for (const id of pecas) {
      await api.encerrarTarefas(id).catch(() => undefined);
      await api.arquivar(id);
    }
    for (const id of briefings) await api.apagarBriefing(id);
    for (const id of marcas) await api.apagarMarca(id);
  },
  editor: async ({ page, api }, usar) => {
    const erros: string[] = [];
    page.on('pageerror', (erro) => erros.push(String(erro)));
    await usar(new Editor(page, api));
    // exceção solta na página é defeito, mesmo que o teste tenha passado
    expect(erros, 'exceções na página durante o teste').toEqual([]);
  },
});
