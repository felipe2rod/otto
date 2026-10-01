// Cenas dos goldens da exportação: uma por tipo de nó, mais uma peça inteira com duas pranchetas (ADR 028, item 6).
// Pequenas de propósito: o PSD de cada uma é versionado em packages/psd/goldens e serve de arquivo para abrir no Photoshop.
import { aplicarLote, type Documento, documentoVazio } from '@otto/documento';
import { FOTO, RECORTE, SUJEITO_DA_FOTO } from '@otto/render/apoio-de-teste';

export interface CenaDeGolden {
  nome: string;
  doc: Documento;
  /** 'juntas' grava as pranchetas num arquivo só, como pranchetas do Photoshop */
  arquivos?: 'juntas';
}

type Literal = Record<string, unknown> & { nome: string; tipo: string; filhos?: Literal[] };

const forma = (nome: string, x: number, y: number, largura: number, altura: number, preenchimento: unknown, extra: object = {}): Literal => ({
  tipo: 'forma',
  forma: 'retangulo',
  nome,
  x,
  y,
  largura,
  altura,
  preenchimento,
  ...extra,
});
const texto = (nome: string, conteudo: string, extra: object = {}): Literal => ({
  tipo: 'texto',
  nome,
  conteudo,
  x: 20,
  y: 20,
  largura: 360,
  altura: 60,
  fonte: 'IBM Plex Sans',
  peso: 400,
  tamanho: 24,
  cor: '#1c1917',
  entrelinha: 1.2,
  ...extra,
});
const imagem = (nome: string, arquivo: string, x: number, y: number, largura: number, altura: number, extra: object = {}): Literal => ({
  tipo: 'imagem',
  nome,
  arquivo,
  larguraOriginal: 1280,
  alturaOriginal: 853,
  x,
  y,
  largura,
  altura,
  ...extra,
});
const ajuste = (nome: string, a: object, extra: object = {}): Literal => ({ tipo: 'ajuste', nome, ajuste: a, ...extra });
const grupo = (nome: string, filhos: Literal[], extra: object = {}): Literal => ({ tipo: 'grupo', nome, filhos, ...extra });
const linear = (angulo: number, ...paradas: [string, number, number?][]) => ({
  tipo: 'linear',
  angulo,
  paradas: paradas.map(([cor, posicao, opacidade]) => ({ cor, posicao, ...(opacidade === undefined ? {} : { opacidade }) })),
});
const ESTRELA = 'M50 5C55 30 70 45 95 50C70 55 55 70 50 95C45 70 30 55 5 50C30 45 45 30 50 5Z';
const ANEL = 'M50 10C72 10 90 28 90 50C90 72 72 90 50 90C28 90 10 72 10 50C10 28 28 10 50 10ZM50 30C39 30 30 39 30 50C30 61 39 70 50 70C61 70 70 61 70 50C70 39 61 30 50 30Z';
const ONDA = 'M5 50C20 20 35 20 50 50C65 80 80 80 95 50';
const SOMBRA = { cor: '#000000', opacidade: 0.45, angulo: 120, distancia: 6, desfoque: 10 };

interface PranchetaLiteral {
  nome: string;
  largura: number;
  altura: number;
  fundo: string;
  nos: Literal[];
}

function operacoesDe(prancheta: string, nos: Literal[], dentroDe?: string): unknown[] {
  return nos.flatMap((n) => {
    const { filhos, ...resto } = n;
    return [{ op: 'criarNo', prancheta, no: resto, ...(dentroDe ? { grupo: `${prancheta}/${dentroDe}` } : {}) }, ...(filhos ? operacoesDe(prancheta, filhos, n.nome) : [])];
  });
}

/** O documento nasce pelo catálogo de operações, com lote fixo: os ids (e a semente do ruído) são sempre os mesmos. */
function documento(nome: string, tokens: Record<string, string>, pranchetas: PranchetaLiteral[]): Documento {
  const r = aplicarLote(
    documentoVazio(),
    [
      ...Object.entries(tokens).map(([token, valor]) => ({ op: 'definirToken', nome: token, valor })),
      ...pranchetas.flatMap((p) => [{ op: 'criarPrancheta', nome: p.nome, largura: p.largura, altura: p.altura, fundo: p.fundo }, ...operacoesDe(p.nome, p.nos)]),
    ],
    { autoria: { tipo: 'designer' }, idDoLote: `golden-psd-${nome}` },
  );
  if (!r.ok) throw new Error(`cena "${nome}": ${r.erro.op} ${r.erro.alvo ?? ''} ${r.erro.campo ?? ''}: ${r.erro.mensagem}`);
  return r.doc;
}

const uma = (nome: string, largura: number, altura: number, fundo: string, nos: Literal[], tokens: Record<string, string> = {}): CenaDeGolden => ({
  nome,
  doc: documento(nome, tokens, [{ nome: 'Peça', largura, altura, fundo, nos }]),
});

export function cenasDeGolden(): CenaDeGolden[] {
  return [
    uma(
      'forma',
      400,
      300,
      'token:fundo',
      [
        forma('Retângulo', 20, 20, 100, 70, 'token:marca'),
        forma('Arredondado', 140, 20, 100, 70, '#1d4ed8', { raio: 18 }),
        forma('Elipse', 260, 20, 120, 70, '#0f766e', { forma: 'elipse' }),
        forma('Degradê linear', 20, 110, 100, 70, linear(45, ['#0ea5e9', 0], ['#fde047', 1])),
        forma('Degradê radial', 140, 110, 100, 70, { ...linear(0, ['#ffffff', 0], ['#7c3aed', 1]), tipo: 'radial' }),
        forma('Com traço e sombra', 260, 110, 120, 70, '#e2e8f0', { raio: 12, traco: { cor: '#0f172a', espessura: 6 }, sombra: SOMBRA }),
        forma('Girada', 40, 210, 120, 50, '#be123c', { rotacao: 12, opacidade: 0.8 }),
        forma('Com filtro', 220, 205, 140, 70, '#f59e0b', { forma: 'elipse', filtros: [{ tipo: 'desfoque', raio: 6 }] }),
      ],
      { fundo: '#fafaf9', marca: '#c2410c' },
    ),
    uma('texto', 400, 300, '#f4efe6', [
      texto('Título', 'JAZZ NA PRAÇA', { y: 16, altura: 64, fonte: 'Anton', tamanho: 52, entrelinha: 1, espacamento: 20 }),
      texto('Parágrafo', 'O agente faz a produção, você faz o design. A partir de R$ 19,90.', {
        y: 90,
        altura: 70,
        tamanho: 18,
        entrelinha: 1.35,
        trechos: [
          { inicio: 9, fim: 23, peso: 700, cor: '#c2410c' },
          { inicio: 55, fim: 63, fonte: 'DM Serif Display', tamanho: 24 },
        ],
      }),
      texto('Caixa alta', 'entrada franca', { y: 170, altura: 24, peso: 700, tamanho: 14, caixaAlta: true, espacamento: 200, cor: '#0f766e' }),
      texto('Centro, com sombra', 'Sábado', { y: 200, altura: 40, fonte: 'DM Serif Display', tamanho: 30, alinhamento: 'centro', sombra: { ...SOMBRA, distancia: 3, desfoque: 4 } }),
      texto('Girado', 'ao vivo', { x: 280, y: 236, largura: 110, altura: 34, fonte: 'Anton', tamanho: 28, rotacao: -8, cor: '#be123c' }),
      // peso que os recursos de teste não têm: sai com o mais próximo, e o relatório diz
      texto('Peso trocado', 'meio-negrito', { y: 250, largura: 200, altura: 30, peso: 600, tamanho: 18 }),
    ]),
    uma('imagem', 400, 300, '#1c1917', [
      imagem('Cobrir', FOTO, 10, 10, 120, 130),
      imagem('Conter', FOTO, 140, 10, 120, 130, { ajuste: 'conter' }),
      imagem('Recorte em elipse', FOTO, 270, 10, 120, 130, { recorte: { forma: 'elipse', raio: 0 }, foco: { x: 0.7, y: 0.6 }, zoom: 1.3 }),
      imagem('Com filtros', FOTO, 10, 155, 120, 130, {
        filtros: [
          { tipo: 'desfoque', raio: 3 },
          { tipo: 'ruido', quantidade: 0.15 },
        ],
      }),
      imagem('Com ajuste de cor', FOTO, 140, 155, 120, 130, { ajusteDeCor: { brilho: 10, contraste: 20, saturacao: -40 } }),
      imagem('Sujeito', FOTO, 270, 155, 120, 130, { mascara: { tipo: 'sujeito', arquivo: SUJEITO_DA_FOTO }, sombra: { cor: '#f97316', opacidade: 0.9, angulo: 135, distancia: 4, desfoque: 6 } }),
      imagem('PNG com alfa, girada', RECORTE, 175, 90, 50, 66, { larguraOriginal: 600, alturaOriginal: 800, ajuste: 'conter', rotacao: 10 }),
    ]),
    uma('vetor', 300, 200, '#fafaf9', [
      { tipo: 'vetor', nome: 'Estrela', x: 20, y: 20, largura: 80, altura: 80, moldura: [100, 100], caminhos: [{ d: ESTRELA, preenchimento: '#f59e0b' }] },
      { tipo: 'vetor', nome: 'Anel', x: 110, y: 20, largura: 80, altura: 80, moldura: [100, 100], caminhos: [{ d: ANEL, preenchimento: '#1d4ed8', regra: 'par-impar' }] },
      {
        tipo: 'vetor',
        nome: 'Onda',
        x: 200,
        y: 20,
        largura: 80,
        altura: 80,
        moldura: [100, 100],
        caminhos: [{ d: ONDA, traco: { cor: '#be123c', espessura: 8, ponta: 'redonda', juncao: 'redonda' } }],
      },
      {
        tipo: 'vetor',
        nome: 'Logo',
        x: 40,
        y: 110,
        largura: 160,
        altura: 80,
        moldura: [100, 100],
        rotacao: -6,
        sombra: SOMBRA,
        caminhos: [
          { d: ANEL, preenchimento: '#0f766e', regra: 'par-impar' },
          { d: ESTRELA, preenchimento: '#fde047', traco: { cor: '#0f172a', espessura: 3 } },
        ],
      },
    ]),
    uma('grupo-e-ajuste', 400, 300, '#e7e5e4', [
      imagem('Foto', FOTO, 0, 0, 400, 300),
      grupo(
        'Selo',
        [
          forma('Disco', 20, 20, 90, 90, '#fff7ed', { forma: 'elipse' }),
          texto('Data', '20\nJUN', { x: 20, y: 34, largura: 90, altura: 64, fonte: 'Anton', tamanho: 30, entrelinha: 0.95, alinhamento: 'centro', cor: '#9a3412' }),
        ],
        {
          modoDeMesclagem: 'normal',
          opacidade: 0.9,
        },
      ),
      grupo('Luzes', [forma('Luz', 240, 20, 140, 140, { ...linear(0, ['#fff7ed', 0, 0.9], ['#fb923c', 1, 0]), tipo: 'radial' }, { forma: 'elipse', modoDeMesclagem: 'luz-linear' })], {
        mascara: { tipo: 'degrade', angulo: 90, inicio: 0.2, fim: 0.9 },
      }),
      texto('Base do recorte', 'OTTO', { x: 20, y: 150, largura: 360, altura: 130, fonte: 'Anton', tamanho: 120, entrelinha: 1, cor: '#000000' }),
      imagem('Foto no texto', FOTO, 20, 150, 360, 130, { recortadaNaDeBaixo: true, foco: { x: 0.5, y: 0.2 } }),
      ajuste('Preto e branco no texto', { tipo: 'preto-e-branco' }, { recortadaNaDeBaixo: true, mascara: { tipo: 'forma', forma: 'retangulo', x: 20, y: 150, largura: 180, altura: 130 } }),
      ajuste(
        'Curvas',
        {
          tipo: 'curvas',
          rgb: [
            [0, 0],
            [128, 150],
            [255, 255],
          ],
        },
        { opacidade: 0.8 },
      ),
      ajuste(
        'Níveis em sobrepor',
        { tipo: 'niveis', pretoDeEntrada: 10, brancoDeEntrada: 235, gama: 1.1 },
        { modoDeMesclagem: 'sobrepor', mascara: { tipo: 'forma', forma: 'elipse', x: 250, y: 150, largura: 140, altura: 140, suavizar: 10, inverter: true } },
      ),
      forma('Véu bloqueado', 0, 0, 400, 300, '#3b2f2f', { modoDeMesclagem: 'luz-suave', opacidade: 0.4, bloqueado: true }),
      forma('Oculta', 150, 100, 100, 100, '#ff00ff', { visivel: false }),
    ]),
    uma('efeitos', 400, 300, '#292524', [
      forma('Brilho externo', 20, 20, 100, 70, '#fafaf9', { raio: 14, efeitos: { brilhoExterno: { cor: '#f59e0b', opacidade: 0.9, tamanho: 14 } } }),
      forma('Brilho interno', 150, 20, 100, 70, '#1e3a8a', { forma: 'elipse', efeitos: { brilhoInterno: { cor: '#7dd3fc', opacidade: 0.9, tamanho: 14 } } }),
      forma('Sombra interna', 280, 20, 100, 70, '#e7e5e4', { raio: 14, efeitos: { sombraInterna: { cor: '#000000', opacidade: 0.6, angulo: 120, distancia: 6, desfoque: 8 } } }),
      forma('Sobreposição de cor', 20, 115, 100, 70, linear(90, ['#000000', 0], ['#ffffff', 1]), {
        efeitos: { sobreposicaoDeCor: { cor: '#e11d48', opacidade: 0.8, modoDeMesclagem: 'multiplicacao' } },
      }),
      imagem('Sobreposição de degradê', FOTO, 150, 115, 100, 70, {
        efeitos: { sobreposicaoDeDegrade: { degrade: linear(0, ['#1d4ed8', 0], ['#be123c', 1]), opacidade: 0.7, modoDeMesclagem: 'luz-suave' } },
      }),
      forma('Sombra projetada', 280, 115, 100, 70, '#fafaf9', { sombra: { cor: '#f97316', opacidade: 0.8, angulo: 45, distancia: 8, desfoque: 8 } }),
      texto('Texto com efeitos', 'OTTO', {
        x: 20,
        y: 200,
        largura: 360,
        altura: 90,
        fonte: 'Anton',
        tamanho: 80,
        entrelinha: 1,
        cor: '#ffffff',
        efeitos: {
          sobreposicaoDeDegrade: { degrade: linear(90, ['#f97316', 0], ['#fde047', 1]) },
          brilhoExterno: { cor: '#f97316', opacidade: 0.7, tamanho: 10 },
          sombraInterna: { cor: '#7c2d12', opacidade: 0.8, angulo: 90, distancia: 3, desfoque: 3 },
        },
      }),
    ]),
    {
      nome: 'peca',
      arquivos: 'juntas',
      doc: documento('peca', { fundo: '#0c0a09', marca: '#ea580c', claro: '#fff7ed' }, [
        {
          nome: 'Feed',
          largura: 270,
          altura: 338,
          fundo: 'token:fundo',
          nos: [
            imagem('Foto', FOTO, 0, 0, 270, 338, {
              foco: { x: 0.6, y: 0.5 },
              origem: { banco: 'Banco de teste', autor: 'Autora de teste', licenca: 'Licença de teste', url: 'https://exemplo.test/foto/1' },
            }),
            forma('Película', 0, 150, 270, 188, linear(270, ['token:fundo', 0, 0], ['token:fundo', 1, 1])),
            texto('Sobretítulo', 'FESTIVAL DE INVERNO', { x: 18, y: 190, largura: 230, altura: 14, peso: 700, tamanho: 9, espacamento: 220, cor: '#fdba74' }),
            texto('Título', 'JAZZ NA\nPRAÇA', {
              x: 18,
              y: 204,
              largura: 234,
              altura: 100,
              fonte: 'Anton',
              tamanho: 48,
              entrelinha: 0.98,
              cor: 'token:claro',
              sombra: { cor: '#000000', opacidade: 0.5, angulo: 90, distancia: 2, desfoque: 6 },
            }),
            grupo('Botão', [
              forma('Fundo do botão', 170, 300, 84, 24, 'token:marca', { raio: 12 }),
              texto('Texto do botão', 'GARANTA O SEU', { x: 170, y: 307, largura: 84, altura: 10, peso: 700, tamanho: 7, espacamento: 120, cor: '#ffffff', alinhamento: 'centro' }),
            ]),
            ajuste('Níveis', { tipo: 'niveis', pretoDeEntrada: 8, brancoDeEntrada: 240, gama: 1.08 }),
          ],
        },
        {
          nome: 'Story',
          largura: 216,
          altura: 384,
          fundo: 'token:fundo',
          nos: [
            imagem('Foto', FOTO, 0, 0, 216, 384, { foco: { x: 0.7, y: 0.5 } }),
            texto('Título', 'JAZZ NA\nPRAÇA', { x: 16, y: 250, largura: 184, altura: 90, fonte: 'Anton', tamanho: 40, entrelinha: 0.98, cor: 'token:claro' }),
            { tipo: 'vetor', nome: 'Logo', x: 16, y: 16, largura: 28, altura: 28, moldura: [100, 100], caminhos: [{ d: ESTRELA, preenchimento: 'token:claro' }] },
          ],
        },
      ]),
    },
  ];
}
