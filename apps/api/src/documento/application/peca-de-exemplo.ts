// A peça de exemplo que toda conta nova recebe (docs/mvp/experiencia.md, 3.2 e 8.1, item 18): uma peça em
// camadas, feita só com operações do catálogo, para o designer abrir o editor com algo para mexer e para
// pedir um ajuste ao Otto sem gastar uma tarefa de criação.
//
// TEXTO PÚBLICO. O nome da peça, os nomes das camadas e os textos aparecem na tela: passam pelo
// guardião-da-marca. A composição é provisória: quem decide como o exemplo deve ser é o diretor-de-arte.
// Só usa fontes da biblioteca semeada.

export const NOME_DA_PECA_DE_EXEMPLO = 'Peça de exemplo';
export const DESCRICAO_DO_LOTE_DE_EXEMPLO = 'Peça de exemplo';

export const OPERACOES_DA_PECA_DE_EXEMPLO: readonly unknown[] = [
  { op: 'definirToken', nome: 'primaria', valor: '#0f3b2c' },
  { op: 'definirToken', nome: 'destaque', valor: '#f4c430' },
  { op: 'definirToken', nome: 'fundo', valor: '#f4efe3' },
  { op: 'definirToken', nome: 'texto', valor: '#17171c' },
  { op: 'criarPrancheta', nome: 'Feed', largura: 1080, altura: 1350, fundo: 'token:fundo' },
  { op: 'criarNo', prancheta: 'Feed', no: { tipo: 'forma', forma: 'retangulo', nome: 'Bloco', x: 0, y: 0, largura: 1080, altura: 760, preenchimento: 'token:primaria' } },
  { op: 'criarNo', prancheta: 'Feed', no: { tipo: 'forma', forma: 'elipse', nome: 'Disco', x: 760, y: 560, largura: 360, altura: 360, preenchimento: 'token:destaque' } },
  {
    op: 'criarNo',
    prancheta: 'Feed',
    no: { tipo: 'texto', nome: 'Título', x: 80, y: 150, largura: 860, altura: 420, conteudo: 'Abrimos às 7h', fonte: 'DM Serif Display', tamanho: 168, entrelinha: 1.02, cor: 'token:fundo' },
  },
  {
    op: 'criarNo',
    prancheta: 'Feed',
    no: {
      tipo: 'texto',
      nome: 'Subtítulo',
      x: 80,
      y: 840,
      largura: 640,
      altura: 150,
      conteudo: 'Café coado na hora, de segunda a sábado',
      fonte: 'IBM Plex Sans',
      peso: 500,
      tamanho: 46,
      entrelinha: 1.25,
      cor: 'token:texto',
    },
  },
  { op: 'criarNo', prancheta: 'Feed', no: { tipo: 'forma', forma: 'retangulo', nome: 'Botão', x: 80, y: 1040, largura: 420, altura: 96, preenchimento: 'token:primaria' } },
  {
    op: 'criarNo',
    prancheta: 'Feed',
    no: {
      tipo: 'texto',
      nome: 'Chamada',
      x: 80,
      y: 1066,
      largura: 420,
      altura: 48,
      conteudo: 'Venha tomar o seu',
      fonte: 'IBM Plex Sans',
      peso: 600,
      tamanho: 32,
      alinhamento: 'centro',
      cor: 'token:fundo',
    },
  },
  {
    op: 'criarNo',
    prancheta: 'Feed',
    no: { tipo: 'texto', nome: 'Rodapé', x: 80, y: 1240, largura: 920, altura: 40, conteudo: '@cafeaurora · Rua das Flores, 120', fonte: 'IBM Plex Sans', tamanho: 28, cor: 'token:texto' },
  },
];
