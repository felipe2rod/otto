// RASCUNHO: texto de interface ainda sem revisão do guardião da marca. Não é texto final.
// A tela de exportar (docs/mvp/experiencia.md, seções 3.10 e 6.4).
//
// O QUE ESTE TEXTO NÃO PODE AFIRMAR AINDA: que o arquivo abre editável no Photoshop ou no Illustrator.
// Nenhum dos dois programas abriu um arquivo do Otto até hoje. As frases falam do que está gravado no
// arquivo, nunca do que outro programa faz com ele (apps/web/testes/textos-de-exportar.test.ts guarda isso). Por isso as
// frases de @otto/psd (`avisos[].texto`, `camadas[].observacao`) não vão para a tela: a frase daqui é
// escolhida pelo `codigo`, pelo `destino` e pelo `mapeamento`.
import { plural } from './plural';

const lista = (nomes: readonly string[]): string => new Intl.ListFormat('pt-BR', { style: 'long', type: 'conjunction' }).format(nomes);

export const exportar = {
  titulo: 'Exportar',
  daPeca: (peca: string): string => `Exportar ${peca}`,
  fechar: 'Fechar',

  formato: {
    rotulo: 'Formato',
    psd: 'PSD em camadas',
    pdf: 'PDF em camadas',
    svg: 'SVG',
    png: 'PNG',
  },
  /** O nome curto do formato, para os botões e a lista de recentes. */
  sigla: { psd: 'PSD', pdf: 'PDF', svg: 'SVG', png: 'PNG' },
  apoio: {
    psd: 'O texto vai gravado como texto e a forma como forma. Cada camada leva também o próprio pixel, e o arquivo traz a imagem composta.',
    pdf: 'Vetorial, com camadas nomeadas. O texto vai gravado como texto e a forma como forma; o que o vetor não guarda vai como imagem embutida.',
    svg: 'Vetorial, um arquivo por prancheta, com camadas nomeadas. O texto vai gravado como texto e a forma como forma; o que o vetor não guarda vai como imagem embutida.',
    png: 'Uma imagem por prancheta, sem camadas. Serve de prévia para mandar ao cliente.',
  },
  arquivos: {
    rotulo: 'Arquivos',
    'por-prancheta': 'Um arquivo por prancheta',
    juntas: 'Um arquivo com todas',
    /** No PDF, "juntas" é um arquivo com uma página por prancheta. */
    juntasNoPdf: 'Um arquivo, uma página por prancheta',
  },
  escala: {
    rotulo: 'Tamanho',
    1: '1×, o tamanho da prancheta',
    2: '2×, o dobro',
  },
  semFundo: 'Fundo transparente onde não há camada',
  pranchetas: {
    rotulo: 'Pranchetas',
    item: (nome: string, largura: number, altura: number): string => `${nome} ${largura}×${altura}`,
    nenhuma: 'Escolha ao menos uma prancheta.',
  },

  relatorio: {
    titulo: 'O que vai no arquivo',
    doQueSaiu: 'O que foi no arquivo',
    montando: 'Montando o relatório…',
    salvando: 'Salvando as últimas alterações antes de montar o relatório…',
    naoSaiu: 'Não consegui montar o relatório, então não libero a exportação: você baixaria sem saber o que vai em pixel.',
    tentarDeNovo: 'Tentar de novo',
    resumo: (comEdicao: number, emPixel: number, fontes: number, deFora = 0): string =>
      [
        `${comEdicao} ${plural(comEdicao, { um: 'camada com os dados de edição', outros: 'camadas com os dados de edição' })}`,
        `${emPixel} em pixel`,
        ...(deFora > 0 ? [`${deFora} de fora`] : []),
        `${fontes} ${plural(fontes, { um: 'fonte', outros: 'fontes' })}`,
      ].join(' · '),
    onde: (prancheta: string, camada: string): string => `${prancheta} / ${camada}`,

    emPixel: {
      titulo: (n: number): string => `Vai em pixel (${n})`,
      tituloNoVetor: (n: number): string => `Vai como imagem (${n})`,
      vazio: 'Nada foi rasterizado. Todas as camadas vão com os dados de edição.',
      apoio: 'Estas camadas vão como imagem. O resultado aparece igual, mas o texto ou a forma não vai junto.',
      /** Pelo `mapeamento` da linha do relatório. */
      motivos: {
        'filtro-fora-de-foto': 'tem filtro, e filtro só continua ajustável em foto',
        'foto-recortada-com-ajuste-de-cor': 'foto presa à camada de baixo e com ajuste de cor: o ajuste vai aplicado no pixel',
        'foto-em-webp': 'foto em WebP: o arquivo original não vai embutido',
        'texto-sem-fonte': 'a fonte não foi encontrada: a camada vai sem o texto',
        'vetor-fora-do-padrao': 'vetor com um tipo de curva que o arquivo não guarda',
      } as Readonly<Record<string, string>>,
      /** No SVG e no PDF o `mapeamento` é o recurso que o vetor não guarda: vale o começo dele ("efeito:sombra"). */
      porPrefixo: {
        efeito: 'tem efeito de camada (sombra, brilho ou sobreposição), que o vetor não guarda',
        filtro: 'tem filtro, que o vetor não guarda',
        mascara: 'tem máscara de borda suave, que o vetor não guarda',
        modo: 'usa um modo de mesclagem que o vetor não guarda',
        ajuste: 'tem ajuste de cor, que vai aplicado na imagem',
      } as Readonly<Record<string, string>>,
      /** Pelo `destino`, quando o mapeamento não tem frase própria. */
      semOriginal: 'foto como camada de pixel, sem o arquivo original embutido',
      generico: 'vai como imagem',
    },

    /** Só no SVG e no PDF: o que não vai para o arquivo. É onde a peça exportada pode ficar com outra aparência. */
    deFora: {
      titulo: (n: number): string => `Pode ficar diferente do canvas (${n})`,
      apoio: 'O que está abaixo não vai para o arquivo como aparece aqui. Confira o resultado antes de entregar.',
      ajuste: 'camada de ajuste: fica de fora do arquivo, e as cores abaixo dela vão sem o ajuste',
      generico: 'fica de fora do arquivo',
      modoTrocado: 'Há camada com modo de mesclagem que o formato não tem. Ela vai em modo normal.',
    },

    fontes: {
      titulo: (n: number): string => `Fontes do arquivo (${n})`,
      apoio: 'Para editar o texto fora do Otto, estas fontes precisam estar instaladas no computador.',
      item: (familia: string, peso: string): string => `${familia} ${peso}`,
    },
    pacote: {
      titulo: (vao: number, total: number): string => `Fontes no pacote (${vao} de ${total})`,
      apoio: 'As fontes que a licença deixa redistribuir vão na pasta Fontes do .zip. Para editar o texto fora do Otto, elas precisam estar instaladas no computador.',
      naoVai: (fonte: string, motivo: string): string => `${fonte} não vai no pacote: ${motivo}.`,
      motivos: {
        licenca_nao_permite: (licenca: string | null): string =>
          licenca ? `a licença registrada (${licenca}) não permite redistribuir o arquivo` : 'a licença registrada não permite redistribuir o arquivo',
        licenca_desconhecida: 'não há licença registrada para ela',
        generico: 'não pôde ser incluída',
      },
      semFontes: 'Esta exportação não usa fonte: o pacote leva os arquivos e o relatório.',
    },
    pesosTrocados: {
      titulo: (n: number): string => `Peso de fonte trocado (${n})`,
      apoio: 'A biblioteca não tem o peso pedido. O texto vai com o mais próximo, igual ao que aparece no canvas.',
      item: (camada: string, familia: string, pedido: number, usado: number): string => `${camada}: pedido ${familia} ${pedido}, usando ${usado}`,
    },
    emFalta: {
      titulo: (n: number): string => `Em falta (${n})`,
      fonte: (familia: string, camadas: readonly string[]): string => `Não encontrei a fonte ${familia}. ${lista(camadas)} ${plural(camadas.length, { um: 'vai', outros: 'vão' })} sem o texto.`,
      imagem: (camadas: readonly string[]): string =>
        `Não encontrei o arquivo da foto de ${lista(camadas)}. ${plural(camadas.length, { um: 'Ela vai como um retângulo cinza', outros: 'Elas vão como retângulos cinza' })}.`,
    },
    imagens: {
      titulo: (n: number): string => `Imagens e licenças (${n})`,
      item: (camada: string, banco: string, autor: string, licenca: string): string => `${camada}: ${banco}, por ${autor}. ${licenca}.`,
      pagina: 'página da imagem',
    },
    observacoes: {
      titulo: 'Para saber',
      /** Pelo `codigo` do aviso. Código sem frase aqui não aparece: ou tem seção própria, ou fala do que ninguém conferiu. */
      doCodigo: {
        'tokens-viram-valor': 'As cores da identidade vão como valor fixo: o arquivo não guarda a ligação com o token.',
        'objeto-inteligente': 'As fotos vão como objeto inteligente, com o arquivo original embutido.',
        'recalculo-do-photoshop': 'Modos de mesclagem, ajustes e efeitos vão como parâmetros. Outro programa refaz a conta com a fórmula dele, e a cor pode variar um pouco do que o canvas mostra.',
        'sem-perfil-de-cor': 'O arquivo vai em RGB de 8 bits, sem perfil de cor embutido. O Otto trabalha em sRGB.',
        'texto-em-linhas': 'O texto vai como texto, gravado linha a linha, na quebra que o canvas mostra. As linhas não ficam ligadas num parágrafo: mudar a largura depois não refaz a quebra.',
      } as Readonly<Record<string, string>>,
    },
    todas: {
      titulo: (n: number): string => `Todas as camadas (${n})`,
      colunas: { onde: 'Camada', tipo: 'Tipo', comoVai: 'Como vai' },
      fundoDaPrancheta: 'fundo',
      destinos: {
        'nativo-editavel': 'com os dados de edição',
        'nativo-pixel': 'pixel',
        'raster-com-aviso': 'pixel, sem os dados de edição',
        'omitido-com-aviso': 'fica de fora do arquivo',
      },
    },
    soPng: 'O PNG não tem camadas: sai a imagem de cada prancheta, como está no canvas.',
  },

  botao: {
    /** O principal: um .zip com os arquivos do formato, as fontes e o relatório. */
    pacote: 'Exportar pacote (.zip)',
    oQueVaiNoPacote: (sigla: string, comFontes: boolean): string => (comFontes ? `Arquivos ${sigla}, fontes e relatório` : `Arquivos ${sigla} e relatório`),
    soArquivos: (sigla: string): string => `Só os arquivos ${sigla}`,
  },

  andamento: {
    titulo: 'Preparando os arquivos',
    pedindo: 'Pedindo a exportação…',
    naFila: 'Na fila. Começa em instantes.',
    estados: { pronta: 'pronta', andando: 'em andamento', 'na-fila': 'na fila', falhou: 'não exportou' },
    /** Exportação retomada depois de recarregar: sabe-se quantas pranchetas, não quais. */
    contagem: (prontas: number, total: number): string => `${prontas} de ${total} ${plural(total, { um: 'prancheta pronta', outros: 'pranchetas prontas' })}`,
    decorrido: (segundos: number): string => `${segundos} s`,
    demora: 'Peça com muitas pranchetas, desfoque ou efeitos pode passar de meio minuto. Continuo aqui.',
    podeFechar: 'Pode fechar. Aviso no topo quando os arquivos estiverem prontos.',
  },

  resultado: {
    titulo: 'Arquivos prontos',
    baixar: 'Baixar',
    baixarArquivo: (nome: string): string => `Baixar ${nome}`,
    tamanho: (bytes: number): string =>
      bytes >= 1_048_576 ? `${(bytes / 1_048_576).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB` : `${Math.max(1, Math.round(bytes / 1024)).toLocaleString('pt-BR')} kB`,
    daVersao: 'É a peça como estava quando você pediu. O que mudar depois não entra nestes arquivos.',
    guardados: (dias: number): string => `Os arquivos ficam guardados por ${dias} dias.`,
    emParte: (falharam: readonly string[], prontas: readonly string[]): string =>
      `${lista(falharam)} não ${plural(falharam.length, { um: 'exportou', outros: 'exportaram' })}. ${lista(prontas)} ${plural(prontas.length, { um: 'está pronta', outros: 'estão prontas' })} para baixar.`,
    nenhumaSaiu: (falharam: readonly string[]): string => `${lista(falharam)} não ${plural(falharam.length, { um: 'exportou', outros: 'exportaram' })}.`,
    tentarAsQueFalharam: (falharam: readonly string[]): string => `Tentar ${lista(falharam)} de novo`,
    apagados: 'Os arquivos desta exportação já foram apagados. Exporte de novo.',
    outra: 'Nova exportação',
  },

  recentes: {
    titulo: (n: number): string => `Exportações recentes (${n})`,
    /** "PSD, pacote" ou "PNG". */
    oQueE: (sigla: string, pacote: boolean): string => (pacote ? `${sigla}, pacote` : sigla),
    estados: { na_fila: 'na fila', rodando: 'em andamento', falhou: 'não saiu', apagada: 'arquivos apagados', pronta_em_parte: 'saiu em parte' },
    nenhumArquivo: 'sem arquivo',
  },

  falha: {
    titulo: 'A exportação não saiu',
    semConexao: 'Perdi a conexão antes de saber se a exportação terminou. Tente de novo quando a conexão voltar.',
    tentarDeNovo: 'Tentar de novo',
    voltar: 'Voltar às opções',
  },

  topo: {
    andando: (prontas: number, total: number): string => `Exportando: ${prontas} de ${total}`,
    pedindo: 'Exportando…',
    pronto: 'Arquivos prontos',
    emParte: 'Exportação em parte',
    falhou: 'A exportação não saiu',
    abrir: 'Abrir a exportação',
  },
} as const;
