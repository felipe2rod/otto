// O relatório de exportação (ADR 028, item 2): o que virou pixel, que fontes instalar, o que foi trocado,
// que tokens viraram valor fixo e de onde veio cada imagem. É montado junto com o arquivo, pelo mesmo código
// (montar.ts), e por isso sai igual com ou sem render: relatorioDeExportacao() não desenha nada.
//
// O texto de `avisos` e de `observacao` é lido pelo designer: o `codigo` existe para a interface poder trocar a frase.
import { coresDoNo, type Documento, type Prancheta, type TipoDeNo, todasAsCamadas } from '@otto/documento';
import type { ChaveDoMapeamento } from './mapeamento';

/**
 * - nativo-editavel: vira o recurso equivalente do Photoshop e continua editável lá;
 * - nativo-pixel: vira camada de pixels porque é isso que ela é (foto sem o original embutido);
 * - raster-com-aviso: perdeu a edição no Photoshop e o relatório diz por quê.
 */
export type Destino = 'nativo-editavel' | 'nativo-pixel' | 'raster-com-aviso';

export interface LinhaDoRelatorio {
  prancheta: string;
  camada: string;
  /** id do nó no documento. Ausente nas camadas que a exportação cria (fundo, ajustes da foto). */
  idDoNo?: string;
  tipo: TipoDeNo | 'prancheta';
  destino: Destino;
  /** linha do mapeamento (docs/tecnico/psd.md) que decidiu o destino */
  mapeamento: ChaveDoMapeamento;
  observacao?: string;
}

export type CodigoDeAviso =
  | 'atualizar-texto'
  | 'instalar-fontes'
  | 'fonte-substituida'
  | 'fonte-em-falta'
  | 'imagem-em-falta'
  | 'tokens-viram-valor'
  | 'objeto-inteligente'
  | 'recalculo-do-photoshop'
  | 'virou-pixel'
  /** não é mais emitido: o perfil sRGB vai embutido. Fica no tipo para quem já tem texto para ele. */
  | 'sem-perfil-de-cor';

export interface AvisoDoRelatorio {
  codigo: CodigoDeAviso;
  texto: string;
}

export interface FonteDoRelatorio {
  familia: string;
  peso: number;
  /** nome que o Photoshop procura */
  postScript: string;
  /** nome do arquivo da fonte, quando quem chama informou */
  arquivo?: string;
}

export interface RelatorioDeExportacao {
  arquivos: string[];
  camadas: LinhaDoRelatorio[];
  tokens: { nome: string; valor: string; usadoEm: string[] }[];
  /** fontes que o arquivo usa: precisam estar instaladas para editar o texto no Photoshop */
  fontes: FonteDoRelatorio[];
  /** texto que pediu um peso que a conta não tem: saiu com o mais próximo, como no editor */
  substituicoes: { camada: string; pedida: { familia: string; peso: number }; usada: { familia: string; peso: number; postScript: string } }[];
  /** fontes e imagens que o documento usa e não foram entregues à exportação */
  emFalta: { fontes: { familia: string; camadas: string[] }[]; imagens: { arquivo: string; camadas: string[] }[] };
  /** origem e licença de cada imagem de banco */
  imagens: { camada: string; banco: string; autor: string; licenca: string; url: string }[];
  avisos: AvisoDoRelatorio[];
}

/** Na saída vetorial (ADR 034) há um destino a mais: o que não vai para o arquivo. */
export type DestinoVetorial = Destino | 'omitido-com-aviso';

export interface LinhaDoRelatorioVetorial extends Omit<LinhaDoRelatorio, 'destino'> {
  destino: DestinoVetorial;
}

export type CodigoDeAvisoVetorial =
  | 'instalar-fontes'
  | 'fonte-substituida'
  | 'fonte-em-falta'
  | 'imagem-em-falta'
  | 'tokens-viram-valor'
  | 'texto-em-linhas'
  | 'virou-imagem'
  /** camadas achatadas numa imagem com o que estava abaixo de uma camada de ajuste */
  | 'camadas-achatadas'
  /** camada com modo de mesclagem que o arquivo não guarda: saiu como a imagem que, em modo normal, dá a mesma cor */
  | 'modo-em-imagem'
  /** há imagem do tamanho da prancheta por cima de texto: no Illustrator, trave-a para clicar no texto */
  | 'imagem-sobre-texto'
  /** não são mais emitidos (desde 2026-10-02 a camada de ajuste é achatada, e o modo que o arquivo não guarda vira imagem). Ficam no tipo para quem já tem texto para eles. */
  | 'ficou-de-fora'
  | 'modo-de-mesclagem-trocado';

/** O relatório da saída vetorial: o mesmo do PSD, com o destino a mais e os avisos dela. */
export interface RelatorioDeExportacaoVetorial extends Omit<RelatorioDeExportacao, 'camadas' | 'avisos'> {
  camadas: LinhaDoRelatorioVetorial[];
  avisos: { codigo: CodigoDeAvisoVetorial; texto: string }[];
}

const TEXTO_DO_AVISO_VETORIAL: Record<CodigoDeAvisoVetorial, string> = {
  'instalar-fontes': 'Para editar o texto no Illustrator, as fontes listadas neste relatório precisam estar instaladas.',
  'fonte-substituida': 'Há texto com um peso de fonte que a conta não tem. Saiu com o peso mais próximo, igual ao que aparece no editor.',
  'fonte-em-falta': 'Há texto com fonte que não foi encontrada. Essas camadas saíram vazias.',
  'imagem-em-falta': 'Há foto cujo arquivo não foi encontrado. Essas camadas saíram como um retângulo cinza.',
  'tokens-viram-valor': 'As cores da identidade viraram valor fixo.',
  'texto-em-linhas': 'O texto vai como texto, uma linha de cada vez, na quebra que o Otto fez. No Illustrator ele não requebra sozinho ao mudar a largura.',
  'virou-imagem': 'Algumas camadas saíram como imagem embutida, porque usam recurso que o vetor não tem (sombra, brilho, filtro, máscara suave). A lista de camadas diz quais e por quê.',
  'camadas-achatadas': 'Camada de ajuste muda a cor de tudo o que está abaixo dela. Para a cor ficar certa, ela e o que estava abaixo dela saíram numa imagem só. A lista de camadas diz quais.',
  'modo-em-imagem':
    'Há camada com modo de mesclagem que o arquivo não guarda (no SVG, todos; no PDF, só alguns). Ela saiu como uma imagem em modo normal que dá a mesma cor sobre o que estava abaixo dela. O que está abaixo continua editável; se você mudar o que está abaixo, essa imagem não acompanha.',
  'imagem-sobre-texto':
    'Há imagem do tamanho da prancheta por cima do texto. No Illustrator, trave essa imagem (Objeto > Bloquear) para o clique da ferramenta Texto entrar no texto, e não criar um texto novo.',
  'ficou-de-fora': 'As camadas de ajuste não vão para o arquivo vetorial. As cores podem ficar diferentes do que o Otto mostra.',
  'modo-de-mesclagem-trocado': 'Há camada com modo de mesclagem que o formato não tem. Ela saiu em modo normal.',
};

/** Fecha o relatório da saída vetorial: os avisos gerais saem do que de fato entrou no arquivo. */
export function fecharRelatorioVetorial(rel: RelatorioDeExportacaoVetorial, oQueHouve: { achatadas: number; modosEmImagem?: number; imagemSobreTexto: boolean }): RelatorioDeExportacaoVetorial {
  const avisos: CodigoDeAvisoVetorial[] = [];
  const tem = (f: (l: LinhaDoRelatorioVetorial) => boolean): boolean => rel.camadas.some(f);
  if (tem((l) => l.tipo === 'texto' && l.destino === 'nativo-editavel')) avisos.push('texto-em-linhas', 'instalar-fontes');
  if (rel.substituicoes.length > 0) avisos.push('fonte-substituida');
  if (rel.emFalta.fontes.length > 0) avisos.push('fonte-em-falta');
  if (rel.emFalta.imagens.length > 0) avisos.push('imagem-em-falta');
  if (tem((l) => l.destino === 'raster-com-aviso')) avisos.push('virou-imagem');
  if (oQueHouve.achatadas > 0) avisos.push('camadas-achatadas');
  if ((oQueHouve.modosEmImagem ?? 0) > 0) avisos.push('modo-em-imagem');
  if (oQueHouve.imagemSobreTexto) avisos.push('imagem-sobre-texto');
  if (rel.tokens.length > 0) avisos.push('tokens-viram-valor');
  return { ...rel, avisos: avisos.map((codigo) => ({ codigo, texto: TEXTO_DO_AVISO_VETORIAL[codigo] })) };
}

export const nomeDaCamada = (p: Pick<Prancheta, 'nome'>, camada: string): string => `${p.nome} / ${camada}`;

/** Relatório só com os tokens: as camadas, fontes e imagens entram conforme o arquivo é montado. */
export function relatorioVazio(doc: Documento, pranchetas: readonly Prancheta[]): RelatorioDeExportacao {
  const usos = new Map<string, string[]>();
  const usar = (cor: string, onde: string): void => {
    if (!cor.startsWith('token:')) return;
    const nome = cor.slice('token:'.length);
    usos.set(nome, [...(usos.get(nome) ?? []), onde]);
  };
  for (const p of pranchetas) {
    usar(p.fundo, nomeDaCamada(p, 'Fundo'));
    for (const n of todasAsCamadas(p.filhos)) for (const cor of new Set(coresDoNo(n))) usar(cor, nomeDaCamada(p, n.nome));
  }
  return {
    arquivos: [],
    camadas: [],
    // só os tokens que o que está sendo exportado usa: os outros não mudam nada no arquivo
    tokens: Object.entries(doc.tokens.cores)
      .filter(([nome]) => usos.has(nome))
      .map(([nome, valor]) => ({ nome, valor, usadoEm: usos.get(nome) ?? [] })),
    fontes: [],
    substituicoes: [],
    emFalta: { fontes: [], imagens: [] },
    imagens: [],
    avisos: [],
  };
}

const TEXTO_DO_AVISO: Record<CodigoDeAviso, string> = {
  'atualizar-texto': 'Ao abrir, o Photoshop pode avisar que as camadas de texto precisam ser atualizadas. Escolha "Atualizar": o texto continua editável.',
  'instalar-fontes':
    'Para editar o texto no Photoshop, as fontes listadas neste relatório precisam estar instaladas. Sem elas o arquivo abre com a aparência certa, mas o texto não pode ser editado sem trocar de fonte.',
  'fonte-substituida': 'Há texto com um peso de fonte que a conta não tem. Saiu com o peso mais próximo, igual ao que aparece no editor.',
  'fonte-em-falta': 'Há texto com fonte que não foi encontrada. Essas camadas saíram vazias.',
  'imagem-em-falta': 'Há foto cujo arquivo não foi encontrado. Essas camadas saíram como um retângulo cinza.',
  'tokens-viram-valor': 'As cores da identidade viraram valor fixo: o PSD não tem variável de cor.',
  'objeto-inteligente': 'As fotos saem como objeto inteligente, com a imagem original embutida, e os filtros como filtros inteligentes.',
  'recalculo-do-photoshop': 'Modos de mesclagem, camadas de ajuste e efeitos são recalculados pelo Photoshop quando a camada é editada, e podem variar um pouco do que o Otto mostra.',
  'virou-pixel': 'Algumas camadas saíram como pixel, sem edição no Photoshop. A lista de camadas diz quais e por quê.',
  'sem-perfil-de-cor': 'O arquivo sai em RGB de 8 bits, sem perfil de cor embutido. O Otto trabalha em sRGB: se o Photoshop perguntar, escolha sRGB.',
};

/** Fecha o relatório: os avisos gerais saem do que de fato entrou no arquivo. */
export function fecharRelatorio(rel: RelatorioDeExportacao): RelatorioDeExportacao {
  const avisos: CodigoDeAviso[] = [];
  const tem = (f: (l: LinhaDoRelatorio) => boolean): boolean => rel.camadas.some(f);
  if (tem((l) => l.tipo === 'texto' && l.destino === 'nativo-editavel')) avisos.push('atualizar-texto', 'instalar-fontes');
  if (rel.substituicoes.length > 0) avisos.push('fonte-substituida');
  if (rel.emFalta.fontes.length > 0) avisos.push('fonte-em-falta');
  if (rel.emFalta.imagens.length > 0) avisos.push('imagem-em-falta');
  if (tem((l) => l.destino === 'raster-com-aviso')) avisos.push('virou-pixel');
  if (rel.tokens.length > 0) avisos.push('tokens-viram-valor');
  if (tem((l) => l.tipo === 'imagem' && l.destino === 'nativo-editavel')) avisos.push('objeto-inteligente');
  avisos.push('recalculo-do-photoshop');
  return { ...rel, avisos: avisos.map((codigo) => ({ codigo, texto: TEXTO_DO_AVISO[codigo] })) };
}

const NOME_DO_DESTINO: Record<DestinoVetorial, string> = { 'nativo-editavel': 'Editável', 'nativo-pixel': 'Pixel', 'raster-com-aviso': 'Virou pixel', 'omitido-com-aviso': 'Ficou de fora' };

/** O relatório em texto (markdown), para acompanhar o arquivo. */
export function relatorioEmTexto(nome: string, rel: RelatorioDeExportacao | RelatorioDeExportacaoVetorial): string {
  const celula = (t: string): string => t.replace(/\|/g, '\\|').replace(/\n/g, ' ');
  const l: string[] = [
    `# Relatório de exportação: ${nome}`,
    '',
    `Arquivos: ${rel.arquivos.join(', ')}`,
    '',
    '## Avisos',
    ...rel.avisos.map((a) => `- ${a.texto}`),
    '',
    '## Camadas',
    '',
    '| Prancheta | Camada | Tipo | Como saiu | Observação |',
    '|---|---|---|---|---|',
  ];
  for (const c of rel.camadas) l.push(`| ${celula(c.prancheta)} | ${celula(c.camada)} | ${c.tipo} | ${NOME_DO_DESTINO[c.destino]} | ${celula(c.observacao ?? '')} |`);
  l.push('', '## Fontes para instalar', ...(rel.fontes.length ? rel.fontes.map((f) => `- ${f.familia} ${f.peso} (${f.postScript})${f.arquivo ? `, arquivo ${f.arquivo}` : ''}`) : ['- nenhuma']));
  if (rel.substituicoes.length)
    l.push('', '## Pesos de fonte trocados', ...rel.substituicoes.map((s) => `- ${s.camada}: pediu ${s.pedida.familia} ${s.pedida.peso}, saiu com ${s.usada.familia} ${s.usada.peso}`));
  if (rel.emFalta.fontes.length || rel.emFalta.imagens.length)
    l.push(
      '',
      '## Não encontrado',
      ...rel.emFalta.fontes.map((f) => `- fonte ${f.familia}: ${f.camadas.join(', ')}`),
      ...rel.emFalta.imagens.map((i) => `- imagem ${i.arquivo.slice(0, 12)}: ${i.camadas.join(', ')}`),
    );
  l.push('', '## Cores da identidade (viraram valor fixo)', ...(rel.tokens.length ? rel.tokens.map((t) => `- ${t.nome} = ${t.valor} (${t.usadoEm.join(', ')})`) : ['- nenhuma']));
  l.push('', '## Imagens e licenças', ...(rel.imagens.length ? rel.imagens.map((i) => `- ${i.camada}: ${i.banco}, por ${i.autor}, ${i.licenca}, ${i.url}`) : ['- nenhuma imagem de banco']));
  return `${l.join('\n')}\n`;
}
