// O mapeamento PSD → Otto do que só existe do lado do PSD (ADR 028, item 4): o que o arquivo pode trazer e o Otto não
// representa. O que o Otto representa tem a coluna de importação na tabela principal (mapeamento.ts). Como lá, esta
// tabela é espelhada em docs/tecnico/psd.md e o teste confere as duas.
//
// O compilador confere a cobertura: todo recurso que o adaptador pode pôr em `foraDoModelo` (porta.ts) tem linha aqui.
import type { RecursoForaDoModelo } from './porta';

/**
 * - Editável: vem como recurso do Otto;
 * - Imagem: a camada vem como imagem, com o pixel gravado no arquivo;
 * - Aproximado: a camada vem editável, sem um parâmetro, e o relatório diz qual;
 * - Ignorado: não vem, e o relatório diz;
 * - Recusado: o arquivo inteiro não é importado.
 */
export type DestinoDeImportacaoDoMapeamento = 'Editável' | 'Imagem' | 'Aproximado' | 'Ignorado' | 'Recusado';

export interface LinhaDeImportacao {
  /** o que é, no arquivo */
  psd: string;
  destino: DestinoDeImportacaoDoMapeamento;
  /** o que vira no Otto */
  otto: string;
  observacao?: string;
}

const linha = (psd: string, destino: DestinoDeImportacaoDoMapeamento, otto: string, observacao?: string): LinhaDeImportacao => ({ psd, destino, otto, ...(observacao ? { observacao } : {}) });

const FORA_DO_MODELO: Record<RecursoForaDoModelo, LinhaDeImportacao> = {
  'conteudo-desconhecido': linha('Camada de vídeo, 3D, ou de um tipo que a biblioteca não reconhece', 'Imagem', 'Imagem, com o pixel gravado'),
  'texto-em-caminho': linha('Texto em caminho', 'Imagem', 'Imagem, com o pixel gravado', 'O Otto não tem texto em caminho (bloqueado)'),
  'texto-deformado': linha('Texto deformado (arco, bandeira...), inclinado, ou com escala diferente nos dois eixos', 'Imagem', 'Imagem, com o pixel gravado'),
  'texto-vertical': linha('Texto na vertical', 'Imagem', 'Imagem, com o pixel gravado'),
  'estilo-de-texto': linha(
    'Texto com negrito ou itálico falsos, sublinhado, riscado, escala horizontal ou vertical, deslocamento da linha de base, sobrescrito, contorno, ou caixa alta só num trecho',
    'Imagem',
    'Imagem, com o pixel gravado',
    'Trocar a aparência do texto em silêncio seria pior do que perder a edição',
  ),
  'paragrafo-de-texto': linha(
    'Texto justificado, com recuo, com espaço antes ou depois do parágrafo, ou com alinhamento diferente por parágrafo',
    'Aproximado',
    'Texto editável, com o alinhamento do primeiro parágrafo, sem recuo nem espaço',
  ),
  preenchimento: linha(
    'Forma com preenchimento de padrão, ou com degradê que o Otto não tem (ângulo, diamante, refletido, ruído, escala, mais de 6 paradas, ponto médio fora do centro)',
    'Imagem',
    'Imagem, com o pixel gravado',
  ),
  'degrade-aproximado': linha(
    'Degradê com interpolação perceptual ou linear (o padrão do Photoshop desde 2022)',
    'Aproximado',
    'Degradê com paradas a mais (até as 6 do Otto), perto da curva do Photoshop',
    'O Otto interpola do jeito clássico, em sRGB',
  ),
  'caminho-composto': linha('Forma feita de caminhos que se subtraem, se intersectam ou se excluem', 'Imagem', 'Imagem, com o pixel gravado'),
  'traco-vetorial': linha('Traçado de forma tracejado, em degradê, por fora, ou com opacidade e modo próprios', 'Imagem', 'Imagem, com o pixel gravado', 'O pixel gravado da forma já traz o traçado'),
  'objeto-inteligente': linha('Objeto inteligente que não é uma foto PNG ou JPEG embutida: outro PSD, arte vetorial, arquivo vinculado', 'Imagem', 'Imagem, com o pixel gravado'),
  'objeto-inteligente-deformado': linha('Objeto inteligente com deformação, perspectiva, espelhado, ou com escala diferente nos dois eixos', 'Imagem', 'Imagem, com o pixel gravado'),
  'filtro-inteligente': linha('Filtro inteligente que o Otto não tem, ou fora da faixa dele', 'Imagem', 'Imagem, com o pixel gravado', 'O pixel gravado do objeto inteligente já traz os filtros'),
  'ajuste-desconhecido': linha(
    'Camada de ajuste que o Otto não tem: exposição, inverter, cor seletiva, misturador de canais, pesquisa de cor, limiar, posterizar',
    'Ignorado',
    '—',
    'Camada de ajuste não tem pixel: não há como trazer como imagem. A cor do que está abaixo dela fica diferente',
  ),
  'ajuste-parcial': linha(
    'Camada de ajuste que o Otto tem, com parâmetro que ele não tem: níveis por canal, matiz por faixa de cor, preto e branco com pesos próprios',
    'Aproximado',
    'A camada de ajuste, sem o parâmetro',
  ),
  'efeito-desconhecido': linha(
    'Chanfro e entalhe, acetinado, sobreposição de padrão; traço por fora, pelo centro ou em degradê; traço em camada que não é forma',
    'Ignorado',
    '—',
    'O pixel gravado da camada não traz os efeitos: virar imagem não os traria',
  ),
  'efeito-repetido': linha('Vários efeitos do mesmo tipo na mesma camada', 'Aproximado', 'O primeiro deles'),
  'efeito-parcial': linha('Efeito que o Otto tem, com parâmetro que ele não tem: expansão, retração, contorno, ruído, ou o modo de mesclagem do efeito', 'Aproximado', 'O efeito, sem o parâmetro'),
  'modo-dissolver': linha('Modo de mesclagem dissolver', 'Aproximado', 'Modo normal'),
  'faixas-de-mesclagem': linha('Faixas de mesclagem ("mesclar se")', 'Ignorado', '—', 'A camada vem, sem as faixas'),
  'mascara-parcial': linha('Máscara com densidade ou difusão próprias', 'Aproximado', 'A máscara, sem a densidade e a difusão'),
};

const SO_DA_IMPORTACAO = {
  'camada-de-pixels': linha('Camada de pixels (inclusive a camada "Fundo" do Photoshop)', 'Imagem', 'Imagem, com o pixel da camada em PNG', 'É o que a camada é: não se perde edição nenhuma'),
  'camada-vazia': linha('Camada sem pixel', 'Ignorado', '—'),
  'arquivo-achatado': linha('Arquivo sem camadas, só com a imagem composta (salvo achatado)', 'Imagem', 'Uma imagem do tamanho do documento'),
  'fundo-de-cor-solida': linha(
    'A camada mais de baixo, de uma cor só, cobrindo o documento ou a prancheta inteira',
    'Editável',
    'A cor de fundo da prancheta',
    'É como a exportação grava o fundo da prancheta',
  ),
  'fundo-transparente': linha('Documento ou prancheta com fundo transparente', 'Aproximado', 'Fundo branco', 'A prancheta do Otto sempre tem cor de fundo'),
  'fora-das-pranchetas': linha('Camada fora de qualquer prancheta, num arquivo com pranchetas', 'Ignorado', '—'),
  'forma-livre': linha('Forma de caminho livre (caneta), de cor sólida', 'Editável', 'Vetor'),
  'grupo-de-formas': linha(
    'Grupo só com formas de caminho livre e com efeito de camada, ou gravado pelo Otto a partir de um vetor',
    'Editável',
    'Um vetor só, com um caminho por forma',
    'É como a exportação grava o vetor',
  ),
  'mascara-de-pixels': linha(
    'Máscara de camada que não é uma forma nem um degradê do Otto',
    'Imagem',
    'Em foto embutida: máscara de recorte da foto, editável. Em camada de pixels, texto e forma: aplicada no pixel, e a camada vira imagem. Em grupo e em camada de ajuste: não vem',
    'O Otto só tem máscara de forma, de degradê e de recorte de foto',
  ),
  'mascara-vetorial-livre': linha(
    'Máscara vetorial de caminho livre, fora de camada de forma',
    'Imagem',
    'Em camada com pixel: aplicada no pixel, e a camada vira imagem. Em grupo e em camada de ajuste: não vem',
  ),
  'duas-mascaras': linha(
    'Máscara de pixels e máscara vetorial na mesma camada',
    'Imagem',
    'Em camada com pixel: as duas aplicadas no pixel. Em grupo e em camada de ajuste: vem a que o Otto reconhece',
  ),
  'efeito-em-grupo': linha('Efeito de camada em grupo', 'Ignorado', '—', 'O grupo do Otto não tem efeito'),
  'opacidade-do-preenchimento': linha('Opacidade do preenchimento', 'Aproximado', 'Sem efeito de camada, entra na opacidade. Com efeito, não vem'),
  'texto-sem-fonte': linha(
    'Texto com fonte que o Otto não tem',
    'Imagem',
    'Imagem, com o pixel gravado, e a fonte listada no relatório',
    'O Otto não troca de fonte em silêncio. Com a fonte enviada, importar de novo traz o texto editável',
  ),
  'perfil-de-cor': linha(
    'Perfil de cor RGB que não é sRGB (Adobe RGB, ProPhoto, Display P3)',
    'Editável',
    'As cores e os pixels convertidos para sRGB',
    'Só perfil de matriz e curva. Os outros são lidos como sRGB, com aviso',
  ),
  'cor-fora-de-rgb-8-bits': linha(
    'CMYK, tons de cinza, Lab, indexado, bitmap; 16 e 32 bits por canal',
    'Recusado',
    '—',
    'O Otto não converte: a conversão muda a cor, e é no Photoshop que o designer a controla (ADR 028, item 3)',
  ),
  'acima-dos-tetos': linha(
    'Arquivo acima dos tetos de tamanho, dimensões, camadas, profundidade de grupo ou pixel de camada; arquivo truncado ou malformado',
    'Recusado',
    '—',
    'Os tetos estão em inspecionar.ts',
  ),
  'fora-da-arvore': linha('Guias, fatias, composições de camada, animação e linha do tempo, anotações, canais alfa, caminhos salvos', 'Ignorado', '—', 'Não são camadas: não entram no relatório'),
} satisfies Record<string, LinhaDeImportacao>;

export type ChaveDeImportacao = `psd:${RecursoForaDoModelo}` | `psd:${keyof typeof SO_DA_IMPORTACAO}`;

/** A tabela do que só existe do lado do PSD, na ordem em que o documento técnico a mostra. */
export const IMPORTACAO_DO_PSD = Object.fromEntries([...Object.entries(SO_DA_IMPORTACAO), ...Object.entries(FORA_DO_MODELO)].map(([chave, l]) => [`psd:${chave}`, l])) as Record<
  ChaveDeImportacao,
  LinhaDeImportacao
>;

/** A linha da tabela em markdown, como está em docs/tecnico/psd.md. */
export const linhaDeImportacaoEmMarkdown = (chave: string, l: LinhaDeImportacao): string => `| \`${chave}\` | ${l.psd} | ${l.destino} | ${l.otto} | ${l.observacao ?? ''} |`;
