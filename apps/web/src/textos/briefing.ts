// RASCUNHO: texto de interface ainda sem revisão do guardião da marca. Não é texto final.
// O formulário de briefing (docs/mvp/experiencia.md, 3.4), as marcas (3.3), o banco de imagens e as
// fontes do catálogo. A marca vai mudar: estas frases dizem o que precisa ser dito, sem investir em redação.
//
// O QUE NÃO APARECE AQUI: nome de modelo, token, custo, "IA", nem nome de banco de imagens ou de catálogo
// de fontes (o nome que a tela mostra é o que o servidor devolve).
import { plural } from './plural';

const porcento = (ampliacao: number): string => `${Math.round(ampliacao * 100)}%`;

export const briefing = {
  tituloDaPagina: 'Nova peça · Otto',
  titulo: 'Nova peça',
  voltar: 'Peças',
  carregando: 'Carregando…',

  comecarDe: {
    rotulo: 'Começar de',
    nenhum: 'um formulário em branco',
    salvo: (nome: string, usos: number): string => `${nome} (${plural(usos, { um: '1 uso', outros: `${usos} usos`, zero: 'sem uso' })})`,
    naoAbriu: 'Não consegui abrir esse briefing salvo.',
    daPeca: (nome: string): string => `Briefing da peça "${nome}".`,
    daPecaSemBriefing: 'Essa peça não nasceu de um briefing: comece em branco.',
    naoLeuAPeca: 'Não consegui ler o briefing dessa peça agora. Recarregue a página para tentar de novo, ou comece em branco.',
    gerenciar: 'Briefings salvos',
    apagar: (nome: string): string => `Apagar o briefing ${nome}`,
    usar: (nome: string): string => `Usar o briefing ${nome}`,
    nenhumSalvo: 'Nenhum briefing salvo ainda.',
  },

  rascunho: {
    recuperado: 'Recuperei o que você tinha digitado da última vez.',
    limpar: 'Começar em branco',
    /** Ao abrir o formulário de um briefing salvo ou de uma peça, havendo um rascunho de outra peça neste navegador. */
    guardado: 'Há um rascunho de outra peça guardado neste navegador. Ele continua lá: o que você fizer aqui não fica guardado como rascunho enquanto você não decidir.',
    voltar: 'Voltar ao rascunho',
    descartar: 'Descartar o rascunho',
  },

  blocos: {
    marca: 'Marca',
    peca: 'Esta peça',
    mais: 'Mais opções',
    maisResumo: 'cuidado, estilo, restrições, observações',
  },

  marca: {
    rotulo: 'Marca',
    semMarca: 'Sem marca',
    nova: 'Nova marca…',
    semIdentidade: 'Sem identidade definida: a direção de arte escolhe.',
    semMarcaExplica: 'Sem marca, o Otto escolhe cores e fontes pela peça. Cadastre a marca para ele usar as dela.',
    editar: 'Editar a marca',
    fecharEdicao: 'Fechar',
    carregando: 'Carregando as marcas…',
    naoCarregou: 'Não consegui carregar as marcas. O formulário segue sem marca.',
    avulsa: 'Identidade guardada neste briefing (a marca dele não existe mais).',
    tirarAvulsa: 'Tirar esta identidade',
    cadastro: 'Todas as marcas',
    resumoDasFontes: (titulo: string, texto: string): string => [titulo, texto].filter(Boolean).join(' · '),
    logoDa: (marca: string): string => `Logo de ${marca}`,
  },

  campos: {
    nome: 'Nome da peça',
    nomeExemplo: 'Novo horário',
    titulo: 'Título',
    tituloExemplo: 'Abrimos às 7h',
    subtitulo: 'Subtítulo',
    subtituloExemplo: 'Café coado na hora, de segunda a sábado',
    chamada: 'Chamada',
    chamadaExemplo: 'Venha tomar o seu',
    rodape: 'Rodapé',
    rodapeExemplo: '@suamarca · endereço',
    rodapeDaMarca: (rodape: string): string => `${rodape} (da marca)`,
    obrigatorio: 'obrigatório',
    objetivo: 'Objetivo',
    semObjetivo: 'Não dizer',
    objetivos: { vender: 'Vender', divulgar: 'Divulgar um evento', informar: 'Informar', engajar: 'Engajar', lançar: 'Lançar produto' } as Readonly<Record<string, string>>,
    publico: 'Público',
    publicoExemplo: 'clientes do bairro',
  },

  formatos: {
    rotulo: 'Formatos',
    medida: (largura: number, altura: number): string => `${largura}×${altura}`,
    ate: (maximo: number): string => `Até ${maximo} por peça. Para os outros, adapte depois, com a peça pronta.`,
    outro: 'Outro formato',
    nomeDoOutro: 'Nome do formato',
    largura: 'Largura em pixels',
    altura: 'Altura em pixels',
    adicionar: 'Adicionar',
    tirar: (nome: string): string => `Tirar o formato ${nome}`,
  },

  imagens: {
    rotulo: 'Imagem',
    fontes: { minhas: 'Minhas imagens', banco: 'O Otto busca no banco de imagens', nenhuma: 'Sem imagem' } as Readonly<Record<string, string>>,
    explica: {
      minhas: 'As fotos que você enviar ou trouxer do banco. O Otto usa estas, e só estas.',
      banco: 'O Otto procura a foto no banco de imagens. Você revê a escolha na peça.',
      nenhuma: 'Peça só com tipografia e formas.',
    } as Readonly<Record<string, string>>,
    /** Com objetivo de vender ou lançar produto e a busca pelo banco escolhida. */
    avisoDeProduto: (ladoMaximo: number | undefined): string =>
      ladoMaximo
        ? `Peça de produto pede a foto do produto. Banco de imagens quase nunca tem o produto certo, e as fotos chegam a ${ladoMaximo} px.`
        : 'Peça de produto pede a foto do produto. Banco de imagens quase nunca tem o produto certo.',
    termos: 'O que procurar (opcional)',
    termosExemplo: 'xícara de café, balcão',
    enviar: 'Enviar fotos',
    buscar: 'Buscar no banco de imagens',
    fecharBusca: 'Fechar a busca',
    lista: 'Fotos desta peça',
    maximo: (n: number): string => `Até ${n} fotos.`,
    enviando: (arquivo: string): string => `Enviando ${arquivo}…`,
    medidas: (largura: number, altura: number): string => `${largura}×${altura}`,
    semMedidas: 'lendo as medidas…',
    origem: (banco: string, autor: string): string => `${banco} · ${autor}`,
    tirar: (nome: string): string => `Tirar a foto ${nome}`,
    semNome: 'foto',
    /** "800×600. No Story vai ser ampliada 240% e perder nitidez." Avisa, não bloqueia. */
    ampliada: (formato: string, ampliacao: number): string => `No ${formato} vai ser ampliada ${porcento(ampliacao)} e perder nitidez.`,
    ampliadaEmVarios: (formatos: readonly { formato: string; ampliacao: number }[]): string =>
      `Vai ser ampliada e perder nitidez: ${formatos.map((f) => `${f.formato} ${porcento(f.ampliacao)}`).join(', ')}.`,
    usarAssim: 'Você pode usar assim, ou trocar por uma foto maior.',
    naoEnviou: (arquivo: string): string => `${arquivo} não enviou.`,
    tentarDeNovo: 'Tentar de novo',
    dispensar: 'Dispensar',
  },

  cuidado: {
    rotulo: 'Cuidado',
    opcoes: { direto: 'Direto', cuidadoso: 'Cuidadoso', autoral: 'Autoral' } as Readonly<Record<string, string>>,
    oQueE: {
      direto: 'Resolve bem, sem explorar alternativas. O mais rápido.',
      cuidadoso: 'Mais atenção a composição, tipografia e acabamento.',
      autoral: 'Explora conceitos antes de escolher. O mais demorado.',
    } as Readonly<Record<string, string>>,
    nota: 'Não muda o estilo nem a quantidade de elementos.',
  },

  estilo: {
    rotulo: 'Estilo',
    opcoes: ['sóbrio', 'ousado', 'editorial', 'acolhedor', 'varejo', 'minimalista'] as readonly string[],
  },
  restricoes: {
    rotulo: 'Restrições desta peça',
    exemplo: 'uma por linha: sem foto de pessoa',
    daMarca: 'Da marca, sempre:',
  },
  observacoes: { rotulo: 'Observações', exemplo: 'O que mais o Otto precisa saber' },

  rodape: {
    formatos: (n: number): string => plural(n, { um: '1 formato', outros: `${n} formatos`, zero: 'nenhum formato' }),
    espera: 'Leva alguns minutos. Você pode fechar a aba: a peça mostra onde o trabalho está.',
    faltas: {
      titulo: 'Falta o título.',
      formato: 'Escolha ao menos um formato.',
      formato_invalido: 'Um formato está sem nome ou com medida fora do limite (16 a 30.000 px).',
      formato_repetido: 'Dois formatos têm o mesmo nome.',
      imagem: 'Envie ao menos uma foto, ou escolha outra opção de imagem.',
      enviando: 'Espere as fotos terminarem de enviar.',
    } as Readonly<Record<string, string>>,
    criar: 'Criar a peça',
    criarNaFila: 'Criar a peça (entra na fila)',
    atrasDe: (pecas: readonly string[]): string => `Entra na fila, atrás de ${new Intl.ListFormat('pt-BR', { style: 'long', type: 'conjunction' }).format(pecas)}.`,
    enviando: 'Enviando ao Otto…',
    cancelar: 'Cancelar',
    emBranco: 'Começar com a peça em branco',
    salvar: 'Salvar como briefing',
    nomeDoBriefing: 'Nome do briefing',
    salvarComEsteNome: 'Salvar',
    salvo: (nome: string): string => `Briefing "${nome}" salvo.`,
    semLimite: {
      limite_da_conta: 'Hoje não consigo começar tarefas novas. O limite volta amanhã. Seu briefing fica salvo como rascunho.',
      fila_cheia: 'Já há tarefas demais desta conta esperando ou rodando. Espere uma terminar. Seu briefing fica salvo como rascunho.',
      limite_diario: 'Hoje não consigo começar tarefas novas. O limite volta amanhã. Seu briefing fica salvo como rascunho.',
    } as Readonly<Record<string, string>>,
  },

  erros: {
    padrao: 'Não consegui enviar o briefing. Nada se perdeu; tente de novo.',
    marca_desconhecida: 'A marca escolhida não existe mais. Escolha outra, ou siga sem marca.',
    arquivo_desconhecido: 'Uma das fotos, o logo ou um ícone não está mais na sua conta. Envie de novo.',
    pedido_invalido: 'Um campo do briefing não foi aceito. Confira os textos e os formatos.',
    limite_de_cadastros: 'Esta conta chegou ao limite de marcas ou de briefings salvos.',
    pecaCriada: 'A peça foi criada, mas o briefing não chegou ao Otto. Tente de novo: a peça é a mesma.',
  } as Readonly<Record<string, string>>,
} as const;

export const marcas = {
  tituloDaPagina: 'Marcas · Otto',
  titulo: 'Marcas',
  lista: 'Suas marcas',
  nova: 'Nova marca',
  vazio: 'Nenhuma marca ainda. A marca guarda o que não muda de uma peça para outra: cores, fontes, logo, rodapé e restrições.',
  erro: 'Não consegui carregar suas marcas.',
  tentarDeNovo: 'Tentar de novo',
  carregando: 'Carregando as marcas…',
  editar: (nome: string): string => `Editar ${nome}`,
  editando: (nome: string): string => `Editando ${nome}`,
  novaPecaPara: (nome: string): string => `Nova peça para ${nome}`,
  semIdentidade: 'Sem identidade definida: a direção de arte escolhe.',
  campos: {
    nome: 'Nome',
    nomeExemplo: 'Café Aurora',
    site: 'Site',
    siteExemplo: 'cafeaurora.com.br',
    siteNota: 'Fica guardado como referência. O Otto não abre o site.',
    cores: 'Cores',
    papeis: { primaria: 'Primária', destaque: 'Destaque', fundo: 'Fundo', texto: 'Texto' } as Readonly<Record<string, string>>,
    corDe: (papel: string): string => `Cor: ${papel}`,
    codigoDe: (papel: string): string => `Código da cor: ${papel}`,
    naoDefinida: 'não definida',
    definir: (papel: string): string => `Definir a cor ${papel}`,
    tirarCor: (papel: string): string => `Tirar a cor ${papel}`,
    fonteDeTitulo: 'Fonte de título',
    fonteDeTexto: 'Fonte de texto',
    logo: 'Logo',
    enviarLogo: 'Enviar o logo',
    trocarLogo: 'Trocar o logo',
    tirarLogo: 'Tirar o logo',
    logoComoEntendi: 'O logo como o Otto o entendeu',
    logoEmImagem: 'Logo em imagem não muda de cor. Para a versão em branco ou monocromática, envie em SVG.',
    importadoComAvisos: (avisos: string): string => `Importei o logo. Ficou de fora: ${avisos}.`,
    icones: 'Ícones e elementos',
    enviarIcones: 'Enviar ícones (SVG)',
    tirarIcone: (nome: string): string => `Tirar o ícone ${nome}`,
    iconeSemNome: 'ícone',
    maximoDeIcones: (n: number): string => `Até ${n} ícones.`,
    rodape: 'Rodapé fixo',
    rodapeExemplo: '@cafeaurora · Rua das Flores, 120',
    restricoes: 'Restrições permanentes',
    restricoesExemplo: 'uma por linha: nunca foto de pessoa',
    enviando: 'Enviando…',
  },
  salvar: 'Salvar a marca',
  salvando: 'Salvando…',
  salva: 'Marca salva.',
  cancelar: 'Cancelar',
  apagar: 'Apagar a marca',
  confirmarApagar: (nome: string): string => `Apagar a marca "${nome}"? As peças e os briefings dela ficam.`,
  faltaONome: 'A marca precisa de um nome.',
  naoSalvou: 'Não consegui salvar a marca. Nada se perdeu; tente de novo.',
} as const;

export const fontes = {
  semFonte: 'não definida',
  naBiblioteca: 'Na biblioteca',
  doCatalogo: 'Do catálogo (baixa ao escolher)',
  baixando: (familia: string): string => `Baixando ${familia}…`,
  naoBaixou: (familia: string): string => `Não consegui baixar ${familia}. A fonte anterior ficou.`,
  foraDoCatalogo: (familia: string): string => `${familia} (fora da biblioteca)`,
} as const;

export const imagens = {
  titulo: 'Banco de imagens',
  abrir: 'Buscar imagem',
  campo: 'O que você procura?',
  exemplo: 'padaria, pão quente',
  orientacao: 'Orientação',
  orientacoes: { todas: 'Todas', horizontal: 'Horizontal', vertical: 'Vertical' } as Readonly<Record<string, string>>,
  buscar: 'Buscar',
  buscando: 'Buscando…',
  resultados: 'Resultados da busca',
  /** A origem aparece sempre que há resultado: é regra de uso do banco (ADR 032). O nome vem do servidor. */
  origem: (banco: string, licenca: string): string => `Imagens de ${banco}. ${licenca}.`,
  ladoMaximo: (px: number): string => `As fotos chegam com até ${px} px no lado maior.`,
  nenhum: 'Nenhuma imagem para essa busca. Tente termos mais simples.',
  autor: (autor: string): string => `por ${autor}`,
  medidas: (largura: number, altura: number): string => `${largura}×${altura}`,
  verNoBanco: (banco: string): string => `Ver a página da imagem em ${banco}`,
  paginaNoBanco: 'origem',
  foto: (descricao: string, autor: string): string => `${descricao || 'Imagem'}, por ${autor}`,
  trazer: 'Usar',
  trazerEsta: (autor: string): string => `Usar a imagem de ${autor}`,
  trazendo: 'Trazendo…',
  trazida: 'Na peça',
  fechar: 'Fechar',
  erros: {
    padrao: 'Não consegui buscar agora. Tente de novo em instantes.',
    banco_de_imagens_indisponivel: 'O banco de imagens está fora do ar agora. Envie a sua foto, ou tente mais tarde.',
    limite_de_imagens: 'Esta conta chegou ao limite de buscas ou de imagens por agora. Tente de novo em alguns minutos.',
    imagem_nao_buscada: 'Essa imagem saiu da busca. Busque de novo e escolha outra vez.',
    sem_conexao: 'Sem conexão. Tente de novo quando a conexão voltar.',
  } as Readonly<Record<string, string>>,
} as const;

export const texturas = {
  titulo: 'Texturas',
  abrir: 'Texturas',
  lista: 'Texturas disponíveis',
  carregando: 'Carregando as texturas…',
  erro: 'Não consegui carregar as texturas. Feche e abra de novo.',
  explica: 'A textura entra como camada, por cima de tudo, cobrindo a prancheta. Modo de mesclagem, opacidade e ordem você muda depois.',
  /** "Multiplicação · 60%": o modo de mesclagem (com o nome do painel de Propriedades) e a opacidade com que ela entra. */
  comoEntra: (modo: string, porcento: number): string => `${modo} · ${porcento}%`,
  usar: 'Usar',
  usarEsta: (nome: string): string => `Usar a textura ${nome}`,
  trazendo: 'Pondo…',
  naoVeio: (nome: string): string => `Não consegui pôr a textura ${nome}. Tente de novo.`,
  fechar: 'Fechar',
} as const;
