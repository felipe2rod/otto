// RASCUNHO: texto de interface ainda sem revisão do guardião da marca. Não é texto final.
// A tela de exportar (docs/mvp/experiencia.md, seções 3.10 e 6.4).
//
// O QUE ESTE TEXTO NÃO PODE AFIRMAR AINDA: que o arquivo abre editável no Photoshop. Nenhum PSD do
// Otto foi conferido lá. As frases falam do que está gravado no arquivo, nunca do que outro programa
// faz com ele. Por isso as frases de @otto/psd (`avisos[].texto`, `camadas[].observacao`) não vão
// para a tela: a frase daqui é escolhida pelo `codigo`, pelo `destino` e pelo `mapeamento`.
import { plural } from './plural';

const lista = (nomes: readonly string[]): string => new Intl.ListFormat('pt-BR', { style: 'long', type: 'conjunction' }).format(nomes);

export const exportar = {
  titulo: 'Exportar',
  daPeca: (peca: string): string => `Exportar ${peca}`,
  fechar: 'Fechar',

  formato: {
    rotulo: 'Formato',
    psd: 'PSD em camadas',
    png: 'PNG',
  },
  apoio: {
    psd: 'O texto vai gravado como texto e a forma como forma. Cada camada leva também o próprio pixel, e o arquivo traz a imagem composta.',
    png: 'Uma imagem por prancheta, sem camadas. Serve de prévia para mandar ao cliente.',
  },
  arquivos: {
    rotulo: 'Arquivos',
    'por-prancheta': 'Um arquivo por prancheta',
    juntas: 'Um arquivo com todas',
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
    resumo: (comEdicao: number, emPixel: number, fontes: number): string =>
      [
        `${comEdicao} ${plural(comEdicao, { um: 'camada com os dados de edição', outros: 'camadas com os dados de edição' })}`,
        `${emPixel} em pixel`,
        `${fontes} ${plural(fontes, { um: 'fonte', outros: 'fontes' })}`,
      ].join(' · '),
    onde: (prancheta: string, camada: string): string => `${prancheta} / ${camada}`,

    emPixel: {
      titulo: (n: number): string => `Vai em pixel (${n})`,
      vazio: 'Nada foi rasterizado. Todas as camadas vão com os dados de edição.',
      apoio: 'Estas camadas vão como imagem. O resultado aparece igual, mas o texto ou a forma não vai junto.',
      /** Pelo `mapeamento` da linha do relatório. */
      motivos: {
        'filtro-fora-de-foto': 'tem filtro, e filtro só continua ajustável em foto',
        'foto-recortada-com-ajuste-de-cor': 'foto presa à camada de baixo e com ajuste de cor: o ajuste vai aplicado no pixel',
        'foto-em-webp': 'foto em WebP: o arquivo original não vai embutido',
        'texto-sem-fonte': 'a fonte não foi encontrada: a camada vai sem o texto',
        'vetor-fora-do-padrao': 'vetor com um tipo de curva que o PSD não guarda',
      } as Readonly<Record<string, string>>,
      /** Pelo `destino`, quando o mapeamento não tem frase própria. */
      semOriginal: 'foto como camada de pixel, sem o arquivo original embutido',
      generico: 'vai como imagem',
    },

    fontes: {
      titulo: (n: number): string => `Fontes do arquivo (${n})`,
      apoio: 'Para editar o texto fora do Otto, estas fontes precisam estar instaladas no computador.',
      item: (familia: string, peso: string): string => `${familia} ${peso}`,
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
        'tokens-viram-valor': 'As cores da identidade vão como valor fixo: o PSD não guarda a ligação com o token.',
        'objeto-inteligente': 'As fotos vão como objeto inteligente, com o arquivo original embutido.',
        'recalculo-do-photoshop': 'Modos de mesclagem, ajustes e efeitos vão como parâmetros. Outro programa refaz a conta com a fórmula dele, e a cor pode variar um pouco do que o canvas mostra.',
        'sem-perfil-de-cor': 'O arquivo vai em RGB de 8 bits, sem perfil de cor embutido. O Otto trabalha em sRGB.',
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
    psd: 'Exportar PSD',
    png: 'Exportar PNG',
  },

  andamento: {
    titulo: 'Preparando os arquivos',
    pedindo: 'Pedindo a exportação…',
    naFila: 'Na fila. Começa em instantes.',
    estados: { pronta: 'pronta', andando: 'em andamento', 'na-fila': 'na fila', falhou: 'não exportou' },
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
