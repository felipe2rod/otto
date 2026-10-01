// O mapeamento Otto → PSD em código (ADR 028, item 1). É a tabela que docs/tecnico/psd.md espelha: o teste
// mapeamento.test.ts falha se as duas divergirem.
//
// "Nada entra no documento sem linha no mapeamento" (ADR 027) é conferido pelo compilador: cada parte da tabela é um
// Record sobre o tipo do esquema. Um modo de mesclagem, ajuste, filtro, efeito, máscara ou tipo de nó novo em
// @otto/documento quebra o typecheck deste pacote até ganhar linha aqui.
import type { Ajuste, Efeitos, Filtro, Mascara, ModoDoGrupo, TipoDeNo } from '@otto/documento';

/** Os três destinos do ADR 028. */
export type DestinoDoMapeamento = 'Nativo' | 'Raster' | 'Bloqueado';
/** Os três destinos da saída vetorial (ADR 034): vetor editável, imagem embutida com aviso, ou fora do arquivo com aviso. */
export type DestinoVetorialDoMapeamento = 'Nativo' | 'Raster' | 'Omitido';

export interface LinhaDoMapeamento {
  /** o que é, no Otto, como a pessoa lê */
  otto: string;
  /** o que vira no arquivo. Chaves de 4 caracteres da especificação da Adobe entre crases */
  psd: string;
  destino: DestinoDoMapeamento;
  observacao?: string;
  /** a saída vetorial (SVG e PDF, ADR 034). Ausente no que o Otto bloqueia. */
  vetorial?: { destino: DestinoVetorialDoMapeamento; como: string };
}

const nativo = (otto: string, psd: string, observacao?: string): LinhaDoMapeamento => ({ otto, psd, destino: 'Nativo', ...(observacao ? { observacao } : {}) });
const raster = (otto: string, psd: string, observacao?: string): LinhaDoMapeamento => ({ otto, psd, destino: 'Raster', ...(observacao ? { observacao } : {}) });
const bloqueado = (otto: string, observacao: string): LinhaDoMapeamento => ({ otto, psd: '—', destino: 'Bloqueado', observacao });

const NOS: Record<TipoDeNo, LinhaDoMapeamento> = {
  grupo: nativo('Grupo', 'Grupo de camadas (`lsct`)', 'O modo "atravessar" é o padrão de grupo, como no Photoshop'),
  forma: nativo(
    'Forma: retângulo (com raio) e elipse',
    'Camada de preenchimento (`SoCo` ou `GdFl`) com máscara vetorial (`vmsk`)',
    'O raio vai como curva no caminho; não grava os dados de forma viva (`vogk`)',
  ),
  texto: nativo('Texto em caixa', 'Camada de texto (`TySh`)', 'Maior risco. A fonte precisa estar instalada para editar; o pixel vai junto'),
  imagem: nativo(
    'Foto',
    'Objeto inteligente (`SoLd`) com o arquivo original embutido (`lnk2`), e o corte da caixa como máscara vetorial',
    'Só PNG e JPEG são embutidos. Objeto inteligente está listado como fora da v1 no ADR 028: pede ADR',
  ),
  vetor: nativo('Vetor (logo, ícone, forma livre)', 'Grupo com uma camada de forma por caminho (`SoCo` + `vmsk`)', 'Só caminhos com M, C e Z'),
  ajuste: nativo('Camada de ajuste', 'Camada de ajuste', 'Um tipo por linha, abaixo'),
};

const MODO = (nome: string, chave: string): LinhaDoMapeamento => nativo(`Modo ${nome}`, `\`${chave}\``);
const MODOS: Record<ModoDoGrupo, LinhaDoMapeamento> = {
  atravessar: nativo('Modo atravessar (só em grupo)', '`pass`'),
  normal: MODO('normal', 'norm'),
  escurecer: MODO('escurecer', 'dark'),
  multiplicacao: MODO('multiplicação', 'mul '),
  'subexposicao-de-cores': MODO('subexposição de cores', 'idiv'),
  'subexposicao-linear': MODO('subexposição linear', 'lbrn'),
  'cor-mais-escura': MODO('cor mais escura', 'dkCl'),
  clarear: MODO('clarear', 'lite'),
  tela: MODO('tela', 'scrn'),
  'superexposicao-de-cores': MODO('superexposição de cores', 'div '),
  'superexposicao-linear': MODO('superexposição linear', 'lddg'),
  'cor-mais-clara': MODO('cor mais clara', 'lgCl'),
  sobrepor: MODO('sobrepor', 'over'),
  'luz-suave': nativo('Modo luz suave', '`sLit`', 'O motor usa a fórmula do W3C; a do Photoshop difere um pouco nos tons escuros'),
  'luz-direta': MODO('luz direta', 'hLit'),
  'luz-intensa': MODO('luz intensa', 'vLit'),
  'luz-linear': MODO('luz linear', 'lLit'),
  'luz-do-ponto': MODO('luz do ponto', 'pLit'),
  'mistura-solida': MODO('mistura sólida', 'hMix'),
  diferenca: MODO('diferença', 'diff'),
  exclusao: MODO('exclusão', 'smud'),
  subtrair: MODO('subtrair', 'fsub'),
  dividir: MODO('dividir', 'fdiv'),
  matiz: MODO('matiz', 'hue '),
  saturacao: MODO('saturação', 'sat '),
  cor: MODO('cor', 'colr'),
  luminosidade: MODO('luminosidade', 'lum '),
};

const AJUSTES: Record<Ajuste['tipo'], LinhaDoMapeamento> = {
  curvas: nativo('Ajuste de curvas', '`curv`'),
  niveis: nativo('Ajuste de níveis', '`levl`'),
  'matiz-saturacao': nativo('Ajuste de matiz e saturação', '`hue2`', 'Só o canal principal'),
  'brilho-contraste': nativo('Ajuste de brilho e contraste', '`brit`'),
  vibracao: nativo('Ajuste de vibração', '`vibA`'),
  'equilibrio-de-cor': nativo('Ajuste de equilíbrio de cores', '`blnc`'),
  'filtro-de-foto': nativo('Ajuste de filtro de fotografia', '`phfl`'),
  'preto-e-branco': nativo('Ajuste de preto e branco', '`blwh`', 'Com os pesos padrão do Photoshop'),
  'mapa-de-degrade': nativo('Ajuste de mapa de degradê', '`grdm`'),
};

const FILTROS: Record<Filtro['tipo'], LinhaDoMapeamento> = {
  desfoque: nativo('Filtro de desfoque, em foto', 'Filtro inteligente: desfoque gaussiano', 'Filtro inteligente está listado como fora da v1 no ADR 028: pede ADR'),
  'desfoque-de-movimento': nativo('Filtro de desfoque de movimento, em foto', 'Filtro inteligente: desfoque de movimento', 'Pede ADR, como o desfoque'),
  ruido: nativo('Filtro de ruído, em foto', 'Filtro inteligente: adicionar ruído', 'O grão do Photoshop não é o do Otto: ao reaplicar, o desenho do grão muda. Pede ADR'),
  nitidez: nativo('Filtro de nitidez, em foto', 'Filtro inteligente: máscara de nitidez', 'Pede ADR, como o desfoque'),
};

const EFEITOS: Record<keyof Efeitos | 'sombra' | 'traco', LinhaDoMapeamento> = {
  sombra: nativo('Sombra projetada', 'Efeito de camada (`lfx2`): sombra projetada', 'Gravada com modo normal, como o motor desenha (o padrão do Photoshop é multiplicação)'),
  traco: nativo('Traço da forma', 'Efeito de camada (`lfx2`): traço interno de cor sólida'),
  sombraInterna: nativo('Sombra interna', 'Efeito de camada (`lfx2`): sombra interna', 'Modo multiplicação'),
  brilhoExterno: nativo('Brilho externo', 'Efeito de camada (`lfx2`): brilho externo', 'Gravado com modo normal, como o motor desenha (o padrão do Photoshop é tela)'),
  brilhoInterno: nativo('Brilho interno', 'Efeito de camada (`lfx2`): brilho interno, a partir da borda', 'Modo tela'),
  sobreposicaoDeCor: nativo('Sobreposição de cor', 'Efeito de camada (`lfx2`): sobreposição de cor'),
  sobreposicaoDeDegrade: nativo('Sobreposição de degradê', 'Efeito de camada (`lfx2`): sobreposição de degradê'),
};

const MASCARAS: Record<Mascara['tipo'], LinhaDoMapeamento> = {
  degrade: nativo('Máscara em degradê', 'Máscara de camada (canal −2)', 'Vai como pixels: no Photoshop não é mais um degradê editável'),
  forma: nativo('Máscara de forma', 'Máscara de camada (canal −2)', 'Vai como pixels, por causa da borda suave'),
  sujeito: nativo('Máscara do sujeito da foto', 'Máscara de camada (canal −2)'),
};

const OUTROS = {
  documento: nativo('Documento', 'Cabeçalho do arquivo', 'RGB, 8 bits, com o perfil sRGB embutido. PSB quando um lado passa de 30.000 px'),
  prancheta: nativo('Prancheta', 'Um arquivo por prancheta; no arquivo com todas, grupo com dados de prancheta (`artb`)'),
  'fundo-da-prancheta': nativo('Fundo da prancheta', 'Camada de preenchimento sólido (`SoCo`)'),
  'preenchimento-em-degrade': nativo('Preenchimento em degradê (linear e radial)', 'Camada de preenchimento em degradê (`GdFl`)'),
  'traco-de-vetor': nativo('Traço de caminho de vetor', 'Traçado vetorial (`vstk`)', 'Centralizado no caminho'),
  'trechos-de-texto': nativo('Trechos de texto com estilo próprio', 'Estilos por sequência de caracteres, no `TySh`'),
  'caixa-alta-e-versalete': nativo('Caixa alta e versalete', 'Atributo de caixa do caractere, no `TySh`'),
  opacidade: nativo('Opacidade', 'Opacidade da camada'),
  'visivel-e-bloqueado': nativo('Visível e bloqueado', 'Flags da camada e bloqueio (`lspf`)'),
  rotacao: nativo('Rotação', 'Na geometria: caminho girado, transformação do texto e do objeto inteligente'),
  'recorte-da-foto': nativo('Recorte da foto em forma', 'Máscara vetorial (`vmsk`)'),
  'recortada-na-de-baixo': nativo('Máscara de recorte na camada de baixo', 'Recorte (clipping) da camada'),
  'ajuste-de-cor-da-foto': nativo(
    'Ajuste de cor da foto (brilho, contraste, saturação, duotone)',
    'Camadas de ajuste presas à foto por máscara de recorte',
    'Aproximação: o Photoshop recalcula com a fórmula dele',
  ),
  token: nativo('Token de cor', 'Valor resolvido', 'A referência se perde; o relatório lista cada token'),
  'filtro-fora-de-foto': raster('Filtro em forma, texto ou vetor', 'Camada de pixels', 'No Photoshop, filtro editável só existe em objeto inteligente'),
  'foto-recortada-com-ajuste-de-cor': raster('Foto presa por máscara de recorte e com ajuste de cor', 'Camada de pixels, com o ajuste já aplicado', 'O ajuste não tem como ficar preso só à foto'),
  'foto-em-webp': raster('Foto em WebP', 'Camada de pixels', 'O arquivo original não é embutido'),
  'texto-sem-fonte': raster('Texto cuja fonte não foi entregue', 'Camada de pixels vazia', 'O motor não troca de fonte: a camada sai sem o texto, e o relatório diz qual fonte falta'),
  'vetor-fora-do-padrao': raster('Vetor com caminho que não é só M, C e Z', 'Camada de pixels'),
  'mascara-suave-ou-invertida': nativo('Máscara de forma com borda suave ou invertida', 'Máscara de camada (canal −2)', 'É a máscara de forma; tem linha própria porque na saída vetorial vira imagem'),
  'recorte-em-texto': nativo('Máscara de recorte cuja base é texto, ou uma camada que virou imagem', 'Recorte (clipping) da camada', 'Tem linha própria porque na saída vetorial vira imagem'),
  'degrade-transparente-no-pdf': nativo(
    'Degradê com parada transparente, no PDF',
    'Camada de preenchimento em degradê (`GdFl`)',
    'É o preenchimento em degradê; tem linha própria porque no PDF vira imagem',
  ),
  'modo-dissolver': bloqueado('Modo dissolver', 'O ruído do Photoshop não é reproduzível'),
  'chanfro-acetinado-padrao': bloqueado('Chanfro e entalhe, acetinado, sobreposição de padrão', 'Custo de reproduzir no motor'),
  'efeito-repetido': bloqueado('Vários efeitos do mesmo tipo na mesma camada', 'Fora da v1'),
  'ajustes-fora-da-lista': bloqueado('Exposição, inverter, cor seletiva, misturador de canais, pesquisa de cor, limiar, posterizar', 'Fora da v1'),
  'texto-em-caminho': bloqueado('Texto em caminho', 'Até um spike provar que abre bem'),
  'cor-fora-de-rgb-8-bits': bloqueado('CMYK, 16 e 32 bits, perfis além de sRGB', 'Fora da v1 (ADR 028, item 3)'),
} satisfies Record<string, LinhaDoMapeamento>;

export type ChaveDoMapeamento =
  | `no:${TipoDeNo}`
  | `modo:${ModoDoGrupo}`
  | `ajuste:${Ajuste['tipo']}`
  | `filtro:${Filtro['tipo']}`
  | `efeito:${keyof typeof EFEITOS}`
  | `mascara:${Mascara['tipo']}`
  | keyof typeof OUTROS;

type ChaveBloqueada = 'modo-dissolver' | 'chanfro-acetinado-padrao' | 'efeito-repetido' | 'ajustes-fora-da-lista' | 'texto-em-caminho' | 'cor-fora-de-rgb-8-bits';
type Vetorial = [DestinoVetorialDoMapeamento, string];
const NATIVO = (como: string): Vetorial => ['Nativo', como];
const RASTER = (como = 'A camada vira imagem embutida'): Vetorial => ['Raster', como];
const OMITIDO = (como: string): Vetorial => ['Omitido', como];
const COM_MODO = NATIVO('Modo de mesclagem do SVG (`mix-blend-mode`) e do PDF');
const SEM_MODO = OMITIDO('O formato não tem este modo: a camada sai em modo normal');
const SEM_AJUSTE = OMITIDO('Não vai: o arquivo fica sem o ajuste de cor');
const FOTO_FILTRADA = RASTER('A foto vira imagem com o filtro já aplicado');

/**
 * A saída vetorial de cada linha (ADR 034, item 2). O Illustrator não restringe o documento: o que não tem equivalente
 * vetorial vira imagem embutida, ou fica de fora, sempre com aviso no relatório.
 */
const VETORIAL: Record<Exclude<ChaveDoMapeamento, ChaveBloqueada>, Vetorial> = {
  documento: NATIVO('Cores em sRGB'),
  prancheta: NATIVO('Um SVG por prancheta; no PDF, uma página por prancheta'),
  'fundo-da-prancheta': NATIVO('Retângulo do tamanho da prancheta'),
  'no:grupo': NATIVO('Grupo com o nome da camada; no PDF, cada camada de cima da prancheta é uma camada do PDF'),
  'no:forma': NATIVO('Caminho'),
  'no:texto': NATIVO('Texto como texto, linha por linha, na quebra do Otto (não requebra sozinho)'),
  'no:imagem': NATIVO('Imagem embutida (o arquivo original), com o corte da caixa como recorte vetorial'),
  'no:vetor': NATIVO('Grupo com um caminho para cada caminho'),
  'no:ajuste': SEM_AJUSTE,
  'preenchimento-em-degrade': NATIVO('Degradê linear e radial'),
  'traco-de-vetor': NATIVO('Contorno do caminho'),
  'trechos-de-texto': NATIVO('Um pedaço de texto para cada estilo, dentro da linha'),
  'caixa-alta-e-versalete': NATIVO('O texto vai já em maiúsculas; no versalete, as letras que eram minúsculas vão em corpo menor'),
  opacidade: NATIVO('Opacidade'),
  'visivel-e-bloqueado': NATIVO('Camada oculta vai oculta; o bloqueio não vai'),
  rotacao: NATIVO('Na geometria: caminho girado, transformação do texto e da imagem'),
  'recorte-da-foto': NATIVO('Recorte vetorial'),
  'recortada-na-de-baixo': NATIVO('Recorte vetorial pela forma da camada de baixo, quando ela é forma, vetor ou foto'),
  'ajuste-de-cor-da-foto': RASTER('A foto vira imagem com o ajuste já aplicado'),
  token: NATIVO('Valor resolvido'),
  'mascara:degrade': RASTER(),
  'mascara:forma': NATIVO('Recorte vetorial, quando não tem borda suave nem está invertida'),
  'mascara:sujeito': RASTER(),
  'mascara-suave-ou-invertida': RASTER(),
  'recorte-em-texto': RASTER('A base e as camadas presas a ela viram uma imagem só'),
  'degrade-transparente-no-pdf': RASTER('Só no PDF: no SVG vai como degradê'),
  'modo:atravessar': NATIVO('Grupo sem isolamento'),
  'modo:normal': NATIVO('Normal'),
  'modo:escurecer': COM_MODO,
  'modo:multiplicacao': COM_MODO,
  'modo:subexposicao-de-cores': COM_MODO,
  'modo:subexposicao-linear': SEM_MODO,
  'modo:cor-mais-escura': SEM_MODO,
  'modo:clarear': COM_MODO,
  'modo:tela': COM_MODO,
  'modo:superexposicao-de-cores': COM_MODO,
  'modo:superexposicao-linear': SEM_MODO,
  'modo:cor-mais-clara': SEM_MODO,
  'modo:sobrepor': COM_MODO,
  'modo:luz-suave': COM_MODO,
  'modo:luz-direta': COM_MODO,
  'modo:luz-intensa': SEM_MODO,
  'modo:luz-linear': SEM_MODO,
  'modo:luz-do-ponto': SEM_MODO,
  'modo:mistura-solida': SEM_MODO,
  'modo:diferenca': COM_MODO,
  'modo:exclusao': COM_MODO,
  'modo:subtrair': SEM_MODO,
  'modo:dividir': SEM_MODO,
  'modo:matiz': COM_MODO,
  'modo:saturacao': COM_MODO,
  'modo:cor': COM_MODO,
  'modo:luminosidade': COM_MODO,
  'efeito:sombra': RASTER(),
  'efeito:traco': NATIVO('Contorno com o dobro da espessura, cortado pela própria forma'),
  'efeito:sombraInterna': RASTER(),
  'efeito:brilhoExterno': RASTER(),
  'efeito:brilhoInterno': RASTER(),
  'efeito:sobreposicaoDeCor': RASTER(),
  'efeito:sobreposicaoDeDegrade': RASTER(),
  'ajuste:curvas': SEM_AJUSTE,
  'ajuste:niveis': SEM_AJUSTE,
  'ajuste:matiz-saturacao': SEM_AJUSTE,
  'ajuste:brilho-contraste': SEM_AJUSTE,
  'ajuste:vibracao': SEM_AJUSTE,
  'ajuste:equilibrio-de-cor': SEM_AJUSTE,
  'ajuste:filtro-de-foto': SEM_AJUSTE,
  'ajuste:preto-e-branco': SEM_AJUSTE,
  'ajuste:mapa-de-degrade': SEM_AJUSTE,
  'filtro:desfoque': FOTO_FILTRADA,
  'filtro:desfoque-de-movimento': FOTO_FILTRADA,
  'filtro:ruido': FOTO_FILTRADA,
  'filtro:nitidez': FOTO_FILTRADA,
  'filtro-fora-de-foto': RASTER(),
  'foto-recortada-com-ajuste-de-cor': RASTER(),
  'foto-em-webp': RASTER('A foto vira imagem PNG, na resolução do documento'),
  'texto-sem-fonte': RASTER('Imagem vazia'),
  'vetor-fora-do-padrao': RASTER(),
};

const comPrefixo = (prefixo: string, parte: Record<string, LinhaDoMapeamento>): [string, LinhaDoMapeamento][] =>
  Object.entries(parte).map(([chave, linha]) => {
    const inteira = prefixo ? `${prefixo}:${chave}` : chave;
    const vetorial = (VETORIAL as Record<string, Vetorial | undefined>)[inteira];
    return [inteira, vetorial ? { ...linha, vetorial: { destino: vetorial[0], como: vetorial[1] } } : linha];
  });

/** A tabela inteira, na ordem em que o documento técnico a mostra. */
export const MAPEAMENTO = Object.fromEntries([
  ...comPrefixo('', OUTROS).filter(([, l]) => l.destino !== 'Bloqueado'),
  ...comPrefixo('no', NOS),
  ...comPrefixo('mascara', MASCARAS),
  ...comPrefixo('modo', MODOS),
  ...comPrefixo('efeito', EFEITOS),
  ...comPrefixo('ajuste', AJUSTES),
  ...comPrefixo('filtro', FILTROS),
  ...comPrefixo('', OUTROS).filter(([, l]) => l.destino === 'Bloqueado'),
]) as Record<ChaveDoMapeamento, LinhaDoMapeamento>;

/** A linha da tabela em markdown, como está em docs/tecnico/psd.md. */
export const linhaEmMarkdown = (chave: string, l: LinhaDoMapeamento): string =>
  `| \`${chave}\` | ${l.otto} | ${l.psd} | ${l.destino} | ${l.vetorial?.destino ?? '—'} | ${l.vetorial?.como ?? '—'} | ${l.observacao ?? ''} |`;
