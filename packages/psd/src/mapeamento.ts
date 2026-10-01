// O mapeamento Otto → PSD em código (ADR 028, item 1). É a tabela que docs/tecnico/psd.md espelha: o teste
// mapeamento.test.ts falha se as duas divergirem.
//
// "Nada entra no documento sem linha no mapeamento" (ADR 027) é conferido pelo compilador: cada parte da tabela é um
// Record sobre o tipo do esquema. Um modo de mesclagem, ajuste, filtro, efeito, máscara ou tipo de nó novo em
// @otto/documento quebra o typecheck deste pacote até ganhar linha aqui.
import type { Ajuste, Efeitos, Filtro, Mascara, ModoDoGrupo, TipoDeNo } from '@otto/documento';

/** Os três destinos do ADR 028. */
export type DestinoDoMapeamento = 'Nativo' | 'Raster' | 'Bloqueado';

export interface LinhaDoMapeamento {
  /** o que é, no Otto, como a pessoa lê */
  otto: string;
  /** o que vira no arquivo. Chaves de 4 caracteres da especificação da Adobe entre crases */
  psd: string;
  destino: DestinoDoMapeamento;
  observacao?: string;
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
  forma: nativo('Máscara de forma (suave, invertida)', 'Máscara de camada (canal −2)', 'Vai como pixels, por causa da borda suave'),
  sujeito: nativo('Máscara do sujeito da foto', 'Máscara de camada (canal −2)'),
};

const OUTROS = {
  documento: nativo('Documento', 'Cabeçalho do arquivo', 'RGB, 8 bits. PSB quando um lado passa de 30.000 px. Ainda sem perfil sRGB embutido'),
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

const comPrefixo = (prefixo: string, parte: Record<string, LinhaDoMapeamento>): [string, LinhaDoMapeamento][] =>
  Object.entries(parte).map(([chave, linha]) => [prefixo ? `${prefixo}:${chave}` : chave, linha]);

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
export const linhaEmMarkdown = (chave: string, l: LinhaDoMapeamento): string => `| \`${chave}\` | ${l.otto} | ${l.psd} | ${l.destino} | ${l.observacao ?? ''} |`;
