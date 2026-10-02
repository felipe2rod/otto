// RASCUNHO: texto de interface ainda sem revisão do guardião da marca. Não é texto final.
// Importar um PSD: enviar, escolher o que fazer com as fontes, o andamento, e o relatório do que veio
// editável, do que virou imagem e do que ficou de fora (ADR 028, item 4; docs/mvp/backend.md, 17.14).
//
// REGRA DE TEXTO DESTA TELA. "PSD" e "PSB" são nomes de formato de arquivo, e aparecem. O nome do
// programa (Photoshop) aparece SÓ na instrução de como converter um arquivo recusado (`recusa.comoConverter`):
// ali ele diz o que a pessoa faz no programa dela, e não promete nada sobre o resultado. Em nenhum outro
// lugar; e nenhuma frase diz que a peça fica igual, idêntica ou fiel ao arquivo. O que a tela afirma é o
// que o Otto fez: o que veio editável, o que virou imagem, o que ficou de fora.
//
// As frases que vêm do servidor (`avisos[].texto`, `camadas[].observacao`, `erro.mensagem`) não vão para a
// tela: a frase é escolhida aqui, pelo código. Nome de arquivo, de camada e de fonte é conteúdo de terceiro.
import { plural } from './plural';

const megas = (bytes: number): string => {
  const mb = bytes / (1024 * 1024);
  return mb >= 10 ? `${Math.round(mb)} MB` : mb >= 0.1 ? `${mb.toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
};
const camadas = (n: number): string => plural(n, { um: '1 camada', outros: `${n} camadas`, zero: 'nenhuma camada' });

export const importar = {
  tituloDaPagina: 'Importar PSD · Otto',
  titulo: 'Importar PSD',
  /** O botão na lista de peças. */
  abrir: 'Importar PSD',
  carregando: 'Carregando…',
  tamanho: megas,

  escolher: {
    rotulo: 'Arquivo PSD ou PSB',
    solte: 'Solte o arquivo aqui',
    ou: 'ou',
    botao: 'Escolher arquivo',
    limites: (limite: string): string => `PSD ou PSB, em RGB e 8 bits por canal, até ${limite}.`,
    oQueVem: 'Texto, formas, fotos e grupos vêm editáveis quando o Otto tem o recurso equivalente. O resto vem como imagem, e o relatório diz o quê e por quê.',
    enviando: (arquivo: string): string => `Enviando ${arquivo}…`,
    conferindo: 'Lendo o arquivo para ver o que ele tem e que fontes pede.',
  },

  /** Recusas ANTES de enviar, conferidas no navegador. */
  local: {
    naoEPsd: (arquivo: string): string => `${arquivo} não é um arquivo PSD nem PSB.`,
    grandeDemais: (arquivo: string, tamanho: string, limite: string): string => `${arquivo} tem ${tamanho}. O limite é ${limite}.`,
    vazio: (arquivo: string): string => `${arquivo} está vazio.`,
  },

  /** O arquivo foi recusado pelo servidor, pelo `motivo`. */
  recusa: {
    titulo: (arquivo: string): string => `Não dá para importar ${arquivo}`,
    motivos: {
      'nao-e-psd': 'O arquivo não é um PSD nem um PSB de verdade (a extensão pode ter sido trocada).',
      'arquivo-grande-demais': 'O arquivo é maior que o limite de importação.',
      'dimensoes-grandes-demais': 'O documento é maior, em pixels, do que o Otto abre.',
      'modo-de-cor': 'O arquivo não está em RGB (está em CMYK, tons de cinza ou outro modo). O Otto trabalha só em RGB e não converte sozinho, porque a conversão muda as cores.',
      profundidade: 'O arquivo está em 16 ou 32 bits por canal. O Otto trabalha em 8 bits por canal.',
      'camadas-demais': 'O arquivo tem mais camadas do que o Otto importa de uma vez.',
      'grupos-fundos-demais': 'O arquivo tem grupos dentro de grupos em mais níveis do que o Otto importa.',
      'pixels-demais': 'As camadas do arquivo somam mais pixels do que o Otto importa de uma vez.',
      'arquivo-truncado': 'O arquivo está incompleto: parece ter sido cortado no meio da gravação ou do envio.',
      'arquivo-malformado': 'O arquivo está danificado, e não deu para ler.',
    } as Readonly<Record<string, string>>,
    generico: 'Este arquivo não pôde ser lido.',
    /** O que a pessoa faz, no programa dela, para o arquivo passar. É o único lugar em que o programa é citado. */
    comoConverter: {
      'modo-de-cor': 'No Photoshop: Imagem > Modo > Cores RGB. Salve com outro nome e envie de novo.',
      profundidade: 'No Photoshop: Imagem > Modo > 8 Bits/Canal. Salve com outro nome e envie de novo.',
      'camadas-demais': 'Mescle ou agrupe camadas no arquivo, ou divida a peça em mais de um arquivo.',
      'pixels-demais': 'Reduza o documento, ou divida a peça em mais de um arquivo.',
      'dimensoes-grandes-demais': 'Reduza o tamanho do documento e envie de novo.',
      'arquivo-truncado': 'Salve o arquivo de novo e envie outra vez.',
    } as Readonly<Record<string, string>>,
    outroArquivo: 'Escolher outro arquivo',
  },

  erros: {
    padrao: 'Não consegui enviar o arquivo. Tente de novo.',
    /** A conexão caiu no envio: o servidor fecha a conexão de arquivo grande demais ou de envio simultâneo demais. */
    sem_conexao: 'O envio não chegou ao fim. Confira a conexão e tente de novo; se o arquivo for muito grande, ele pode estar acima do limite.',
    arquivo_grande_demais: (limite: string): string => `O arquivo é maior que o limite de ${limite}.`,
    corpo_grande_demais: (limite: string): string => `O arquivo é maior que o limite de ${limite}.`,
    limite_de_importacoes: (maximo: number): string => `Esta conta já tem ${maximo} importações abertas. Conclua ou desista de uma delas, abaixo, e envie de novo.`,
    importacao_fora_do_estado: 'Esta importação já mudou de estado. Atualizei a tela.',
    fonte_desconhecida: 'Uma das fontes escolhidas para a troca não existe mais. Escolha outra.',
    marca_desconhecida: 'A marca escolhida não existe mais. Escolha outra, ou siga sem marca.',
    nao_encontrado: 'Esta importação não existe mais.',
  },

  arquivo: {
    titulo: 'O arquivo',
    resumo: (formato: string, largura: number, altura: number, registros: number, tamanho: string): string => `${formato.toUpperCase()} · ${largura}×${altura} px · ${camadas(registros)} · ${tamanho}`,
    nomeDaPeca: 'Nome da peça',
    marca: 'Marca',
    semMarca: 'Sem marca',
    expira: (quando: string): string => `O arquivo enviado fica guardado até ${quando}. Depois disso é preciso enviar de novo.`,
  },

  fontes: {
    titulo: 'Fontes do arquivo',
    lista: 'Fontes que o texto do arquivo pede',
    semTexto: 'O arquivo não tem texto com fonte: não há o que escolher.',
    explica:
      'O texto só vem editável se o Otto tiver a fonte. Para cada fonte que falta, você escolhe: trocar por outra (o texto vem editável, com outra aparência) ou deixar o texto virar imagem (a aparência do arquivo, sem edição). Nada é trocado sem você escolher.',
    situacao: {
      na_biblioteca: (familia: string, peso: string): string => `O Otto tem: ${familia} ${peso}. O texto vem editável.`,
      na_biblioteca_sem_nome: 'O Otto tem esta fonte. O texto vem editável.',
      no_catalogo: 'O Otto não tem, mas o catálogo de fontes abertas tem.',
      em_falta: 'O Otto não tem esta fonte.',
    },
    oQueFazer: (fonte: string): string => `O que fazer com ${fonte}`,
    opcoes: {
      baixar: 'Baixar a fonte: o texto vem editável',
      imagem: 'O texto vira imagem, com a aparência do arquivo',
      substituir: 'Trocar por outra fonte: o texto vem editável',
    } as Readonly<Record<string, string>>,
    trocarPor: (fonte: string): string => `Fonte no lugar de ${fonte}`,
    pesoDaTroca: (fonte: string): string => `Peso da fonte no lugar de ${fonte}`,
    escolhaAFonte: 'escolha a fonte',
    sugestao: (familia: string, peso: string): string => `A mais parecida que o Otto tem: ${familia} ${peso}.`,
    usarSugestao: 'Usar esta',
    faltaEscolher: (n: number): string => plural(n, { um: 'Falta escolher a fonte de uma troca.', outros: `Falta escolher a fonte de ${n} trocas.` }),
    resumo: (editaveis: number, imagens: number): string =>
      [
        editaveis > 0 ? plural(editaveis, { um: '1 fonte vem editável', outros: `${editaveis} fontes vêm editáveis` }) : '',
        imagens > 0 ? plural(imagens, { um: '1 vira imagem', outros: `${imagens} viram imagem` }) : '',
      ]
        .filter(Boolean)
        .join(' · '),
  },

  acoes: {
    importar: 'Importar',
    pedindo: 'Pedindo…',
    desistir: 'Desistir deste arquivo',
    confirmarDesistir: (arquivo: string): string => `Desistir de ${arquivo}? O arquivo enviado é apagado.`,
    voltar: 'Peças',
  },

  andamento: {
    na_fila: 'Na fila. Começa em instantes.',
    rodando: 'Importando: lendo as camadas e montando a peça.',
    costuma: 'Costuma levar de 2 a 20 segundos.',
    pronta: 'Peça pronta. Abrindo…',
    abrir: 'Abrir a peça',
  },

  falhou: {
    titulo: (arquivo: string): string => `A importação de ${arquivo} não terminou`,
    codigos: {
      interrompida: 'A importação foi interrompida por uma falha do nosso lado. Envie o arquivo de novo.',
      abandonada: 'A importação ficou parada na fila e foi encerrada sem sair. Envie o arquivo de novo.',
      fila_indisponivel: 'Não consegui pôr a importação na fila. Envie o arquivo de novo em instantes.',
      arquivo_indisponivel: 'O arquivo enviado não estava mais guardado. Envie de novo.',
      documento_grande_demais: 'A peça que sairia deste arquivo é maior do que o Otto guarda. Divida o arquivo em mais de um.',
      falha_na_importacao: 'Não consegui importar este arquivo. Tente de novo; se repetir, o arquivo tem algo que o Otto ainda não lê.',
    } as Readonly<Record<string, string>>,
    generico: 'Não consegui importar este arquivo. Tente de novo.',
  },

  descartada: 'O arquivo enviado não está mais guardado: o prazo venceu, ou você desistiu dele. Envie de novo.',

  pendentes: {
    titulo: 'Arquivos enviados, esperando você',
    lista: 'Importações em aberto',
    continuar: (arquivo: string): string => `Continuar a importação de ${arquivo}`,
    continuarCurto: 'Continuar',
    desistir: (arquivo: string): string => `Desistir de ${arquivo}`,
    desistirCurto: 'Desistir',
    emCurso: 'importando',
  },
  recentes: {
    titulo: 'Importadas há pouco',
    lista: 'Importações recentes',
    abrir: (arquivo: string): string => `Abrir a peça de ${arquivo}`,
    naoTerminou: 'não terminou',
  },

  relatorio: {
    titulo: 'Relatório de importação',
    abrir: 'Relatório de importação',
    fechar: 'Fechar',
    carregando: 'Lendo o relatório…',
    naoCarregou: 'Não consegui ler o relatório desta importação.',
    doArquivo: (arquivo: string): string => `Do arquivo ${arquivo}`,
    resumo: (editaveis: number, comoImagem: number, deFora: number): string =>
      [
        plural(editaveis, { um: '1 camada veio editável', outros: `${editaveis} camadas vieram editáveis`, zero: 'nenhuma camada veio editável' }),
        comoImagem > 0 ? plural(comoImagem, { um: '1 virou imagem', outros: `${comoImagem} viraram imagem` }) : '',
        deFora > 0 ? plural(deFora, { um: '1 ficou de fora', outros: `${deFora} ficaram de fora` }) : '',
      ]
        .filter(Boolean)
        .join(' · '),
    tudoEditavel: 'Nada virou imagem e nada ficou de fora.',
    onde: (prancheta: string, camada: string): string => `${prancheta} / ${camada}`,
    nomeTrocado: (noArquivo: string, noOtto: string): string => `${noArquivo} (no Otto: ${noOtto})`,
    ver: 'ver',
    verCamada: (onde: string): string => `Ver no canvas: ${onde}`,

    virouImagem: {
      titulo: (n: number): string => `Virou imagem (${n})`,
      explica: 'Estas camadas tinham edição no arquivo e vieram como imagem, com a aparência gravada nele.',
      motivos: {
        'texto-sem-fonte': 'o Otto não tem a fonte do texto',
        'texto-em-caminho': 'texto em caminho, que o Otto não tem',
        'texto-deformado': 'texto deformado, inclinado ou com escala diferente nos dois eixos',
        'texto-vertical': 'texto na vertical, que o Otto não tem',
        'estilo-de-texto': 'texto com estilo que o Otto não tem (sublinhado, riscado, negrito ou itálico falsos, escala)',
        preenchimento: 'forma com preenchimento de padrão ou com degradê que o Otto não tem',
        'caminho-composto': 'forma feita de caminhos que se subtraem ou se intersectam',
        'traco-vetorial': 'forma com traçado que o Otto não tem (tracejado, em degradê, por fora)',
        'objeto-inteligente': 'objeto inteligente que não é uma foto embutida',
        'objeto-inteligente-deformado': 'objeto inteligente deformado, em perspectiva ou espelhado',
        'filtro-inteligente': 'filtro inteligente que o Otto não tem',
        'conteudo-desconhecido': 'tipo de camada que o Otto não lê (vídeo, 3D ou outro)',
        'mascara-de-pixels': 'máscara pintada, aplicada na imagem',
        'mascara-vetorial-livre': 'máscara vetorial de caminho livre, aplicada na imagem',
      } as Readonly<Record<string, string>>,
      generico: 'usa recurso que o Otto não tem',
      fonteEmFalta: (fonte: string): string => `o Otto não tem a fonte ${fonte}`,
    },
    deFora: {
      titulo: (n: number): string => `Ficou de fora (${n})`,
      explica: 'Estas camadas não vieram. A peça pode ficar diferente do arquivo: confira com o original.',
      motivos: {
        'ajuste-desconhecido': 'camada de ajuste que o Otto não tem; a cor do que está abaixo dela muda',
        'camada-vazia': 'camada sem pixel',
        'fora-das-pranchetas': 'camada fora de qualquer prancheta',
        'efeito-desconhecido': 'efeito que o Otto não tem',
      } as Readonly<Record<string, string>>,
      generico: 'não tem equivalente no Otto',
    },
    aproximado: {
      titulo: (n: number): string => `Veio com diferença (${n})`,
      explica: 'Estas camadas vieram, sem um parâmetro que tinham no arquivo. A aparência pode mudar: confira com o original.',
      perdas: {
        'paragrafo-de-texto': 'recuo, espaço entre parágrafos ou alinhamento por parágrafo',
        'degrade-aproximado': 'a curva do degradê',
        'ajuste-parcial': 'um parâmetro da camada de ajuste',
        'ajuste-desconhecido': 'uma camada de ajuste',
        'efeito-desconhecido': 'um efeito de camada',
        'efeito-repetido': 'efeitos repetidos (ficou o primeiro)',
        'efeito-parcial': 'um parâmetro de efeito',
        'modo-dissolver': 'o modo de mesclagem dissolver (ficou normal)',
        'faixas-de-mesclagem': 'as faixas de mesclagem',
        'mascara-parcial': 'a densidade ou a difusão da máscara',
        'mascara-de-pixels': 'a máscara pintada',
        'fundo-transparente': 'o fundo transparente (ficou branco)',
      } as Readonly<Record<string, string>>,
      generico: 'um parâmetro que o Otto não tem',
      semItem: (perdas: string): string => `sem ${perdas}`,
    },
    fontes: {
      titulo: 'Fontes',
      trocadas: (n: number): string => `Fontes trocadas, a seu pedido (${n})`,
      troca: (camada: string, pedida: string, usada: string): string => `${camada}: pedia ${pedida}, veio com ${usada}`,
      emFalta: (n: number): string => `Fontes que faltaram (${n})`,
      faltou: (fonte: string, onde: string): string => `${fonte}: o texto virou imagem em ${onde}`,
      comoResolver: 'Para o texto vir editável, importe o arquivo de novo e escolha uma fonte para a troca.',
      usadas: (n: number): string => `Fontes do texto que veio editável (${n})`,
    },
    observacoes: {
      titulo: 'Observações',
      doCodigo: {
        'cores-convertidas': 'O arquivo estava em outro espaço de cor RGB. As cores foram convertidas para sRGB, que é onde o Otto trabalha.',
        'sem-perfil-de-cor': 'O arquivo não traz perfil de cor. As cores foram lidas como sRGB.',
        'perfil-nao-reconhecido': 'O perfil de cor do arquivo não é de um tipo que o Otto converte. As cores foram lidas como sRGB e podem estar diferentes.',
        'fundo-transparente': 'O arquivo tem fundo transparente. No Otto a prancheta tem cor de fundo: ficou branca.',
        'nomes-trocados': 'Havia camadas sem nome ou com o mesmo nome na mesma prancheta. No Otto cada camada tem um nome só dela: as repetidas ganharam um número.',
        'conferir-texto': 'O texto veio editável, e agora é o Otto que o desenha: a quebra de linha e a posição podem variar um pouco. Confira com o original.',
      } as Readonly<Record<string, string>>,
    },
    todas: {
      titulo: (n: number): string => `Todas as camadas do arquivo (${n})`,
      colunas: { camada: 'Camada', como: 'Como veio' },
      destinos: { editavel: 'editável', imagem: 'imagem', ignorado: 'ficou de fora' } as Readonly<Record<string, string>>,
      /** Camada que já era de pixels no arquivo: vir como imagem não é perda. */
      jaEraImagem: 'imagem (já era no arquivo)',
    },
    /** A marca na linha da camada, no painel de Camadas. */
    marcaNaCamada: 'veio como imagem do PSD',
    semHistorico: 'A peça importada começa sem histórico: não há o que desfazer até a primeira alteração.',
  },
} as const;
