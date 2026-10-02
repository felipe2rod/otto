// O relatório de importação (ADR 028, item 4): o que veio editável, o que virou imagem e por quê, o que foi ignorado,
// e que fontes o arquivo pede e o Otto não tem. Mesma forma do relatório de exportação: uma linha por camada do
// arquivo, a linha do mapeamento que decidiu, e os avisos gerais com código (para a interface trocar a frase).
//
// O texto de `avisos` e de `observacao` é lido pelo designer. O nome da camada vai como está no arquivo: é dado de
// terceiro, e não é normalizado nem interpretado aqui.
import type { TipoDeNo } from '@otto/documento';
import type { ChaveDoMapeamento } from './mapeamento';
import type { ChaveDeImportacao } from './mapeamento-de-importacao';
import type { FonteDoRelatorio } from './relatorio';

/**
 * - editavel: virou o recurso equivalente do Otto e continua editável;
 * - imagem: virou imagem, com o pixel que o arquivo traz (é o que a camada já era, ou o Otto não representa o que ela é);
 * - ignorado: não veio (camada vazia, ajuste que o Otto não tem, camada fora das pranchetas).
 */
export type DestinoDeImportacao = 'editavel' | 'imagem' | 'ignorado';

export interface LinhaDoRelatorioDeImportacao {
  prancheta: string;
  /** o nome da camada no arquivo, como está */
  camada: string;
  /** id do nó criado. Ausente no que foi ignorado e no que virou o fundo da prancheta. */
  idDoNo?: string;
  /** o nome que a camada ganhou no Otto, quando não pôde ficar com o do arquivo (vazio ou repetido na prancheta) */
  nomeNoOtto?: string;
  tipo?: TipoDeNo | 'prancheta';
  destino: DestinoDeImportacao;
  /** linha do mapeamento (docs/tecnico/psd.md) que decidiu o destino */
  mapeamento: ChaveDoMapeamento | ChaveDeImportacao;
  observacao?: string;
  /** o que a camada tinha e não veio, ou veio aproximado: cada item aponta a linha do mapeamento */
  perdas?: { mapeamento: ChaveDeImportacao; detalhe: string }[];
}

export type CodigoDeAvisoDeImportacao =
  | 'virou-imagem'
  | 'camada-ignorada'
  /** efeito, ajuste, máscara ou estilo que não veio, ou veio aproximado: a aparência pode diferir */
  | 'aparencia-pode-diferir'
  | 'fonte-em-falta'
  | 'fonte-substituida'
  | 'cores-convertidas'
  | 'sem-perfil-de-cor'
  | 'perfil-nao-reconhecido'
  | 'fundo-transparente'
  | 'nomes-trocados'
  | 'conferir-texto';

export interface RelatorioDeImportacao {
  arquivo: {
    formato: 'psd' | 'psb';
    largura: number;
    altura: number;
    /** registros de camada do arquivo (cada grupo conta dois) */
    camadas: number;
    /** a descrição do perfil de cor embutido, se houver */
    perfilDeCor?: string;
    conversaoDeCor: 'srgb' | 'sem-perfil' | 'convertido' | 'nao-reconhecido';
  };
  camadas: LinhaDoRelatorioDeImportacao[];
  /** fontes que o texto importado usa, e que o Otto tem */
  fontes: FonteDoRelatorio[];
  /** texto cuja fonte foi trocada por outra, a pedido de quem importou */
  substituicoes: { camada: string; pedida: string; usada: { familia: string; peso: number; postScript: string } }[];
  /** fontes que o arquivo pede (pelo nome PostScript) e não foram entregues: o texto dessas camadas virou imagem */
  emFalta: { fontes: { postScript: string; camadas: string[] }[] };
  avisos: { codigo: CodigoDeAvisoDeImportacao; texto: string }[];
}

const TEXTO_DO_AVISO: Record<CodigoDeAvisoDeImportacao, string> = {
  'virou-imagem': 'Algumas camadas vieram como imagem, com a aparência que tinham no arquivo, porque usam recurso que o Otto não tem. A lista de camadas diz quais e por quê.',
  'camada-ignorada': 'Algumas camadas não vieram. A lista de camadas diz quais e por quê.',
  'aparencia-pode-diferir': 'Há efeito, ajuste, máscara ou estilo que não veio, ou veio aproximado. A peça pode ficar diferente do que o Photoshop mostra: confira com o arquivo original.',
  'fonte-em-falta': 'Há texto com fonte que o Otto não tem. Essas camadas vieram como imagem. Envie a fonte e importe de novo para o texto vir editável.',
  'fonte-substituida': 'Há texto cuja fonte foi trocada por outra. A lista de trocas diz qual, em cada camada.',
  'cores-convertidas': 'O arquivo estava em outro espaço de cor RGB. As cores foram convertidas para sRGB, que é o espaço em que o Otto trabalha.',
  'sem-perfil-de-cor': 'O arquivo não traz perfil de cor. As cores foram lidas como sRGB.',
  'perfil-nao-reconhecido': 'O perfil de cor do arquivo não é de um tipo que o Otto converte. As cores foram lidas como sRGB e podem estar diferentes.',
  'fundo-transparente': 'O arquivo tem fundo transparente. No Otto a prancheta tem cor de fundo: ficou branca.',
  'nomes-trocados': 'Havia camadas sem nome ou com o mesmo nome na mesma prancheta. No Otto cada camada tem um nome só dela: as repetidas ganharam um número.',
  'conferir-texto': 'O texto veio editável, e é o Otto que o desenha agora: a quebra de linha e a posição podem variar um pouco do que o Photoshop mostra.',
};

export function relatorioDeImportacaoVazio(arquivo: RelatorioDeImportacao['arquivo']): RelatorioDeImportacao {
  return { arquivo, camadas: [], fontes: [], substituicoes: [], emFalta: { fontes: [] }, avisos: [] };
}

/** Fecha o relatório: os avisos gerais saem do que de fato aconteceu. */
export function fecharRelatorioDeImportacao(rel: RelatorioDeImportacao, oQueHouve: { fundoTransparente: boolean }): RelatorioDeImportacao {
  const avisos: CodigoDeAvisoDeImportacao[] = [];
  const tem = (f: (l: LinhaDoRelatorioDeImportacao) => boolean): boolean => rel.camadas.some(f);
  if (rel.arquivo.conversaoDeCor === 'convertido') avisos.push('cores-convertidas');
  if (rel.arquivo.conversaoDeCor === 'sem-perfil') avisos.push('sem-perfil-de-cor');
  if (rel.arquivo.conversaoDeCor === 'nao-reconhecido') avisos.push('perfil-nao-reconhecido');
  if (rel.emFalta.fontes.length > 0) avisos.push('fonte-em-falta');
  if (rel.substituicoes.length > 0) avisos.push('fonte-substituida');
  if (tem((l) => l.destino === 'imagem' && l.mapeamento !== 'psd:camada-de-pixels')) avisos.push('virou-imagem');
  if (tem((l) => l.destino === 'ignorado' && l.mapeamento !== 'psd:camada-vazia')) avisos.push('camada-ignorada');
  if (tem((l) => (l.perdas?.length ?? 0) > 0)) avisos.push('aparencia-pode-diferir');
  if (tem((l) => l.tipo === 'texto' && l.destino === 'editavel')) avisos.push('conferir-texto');
  if (oQueHouve.fundoTransparente) avisos.push('fundo-transparente');
  if (tem((l) => l.nomeNoOtto !== undefined)) avisos.push('nomes-trocados');
  return { ...rel, avisos: avisos.map((codigo) => ({ codigo, texto: TEXTO_DO_AVISO[codigo] })) };
}

const NOME_DO_DESTINO: Record<DestinoDeImportacao, string> = { editavel: 'Editável', imagem: 'Imagem', ignorado: 'Não veio' };

/** O relatório em texto (markdown). */
export function relatorioDeImportacaoEmTexto(nome: string, rel: RelatorioDeImportacao): string {
  const celula = (t: string): string => t.replace(/\|/g, '\\|').replace(/[\r\n]+/g, ' ');
  const a = rel.arquivo;
  const l: string[] = [
    `# Relatório de importação: ${nome}`,
    '',
    `Arquivo: ${a.formato.toUpperCase()}, ${a.largura} × ${a.altura} px, ${a.camadas} registros de camada${a.perfilDeCor ? `, perfil de cor "${a.perfilDeCor}"` : ', sem perfil de cor'}.`,
    '',
    '## Avisos',
    ...(rel.avisos.length ? rel.avisos.map((x) => `- ${x.texto}`) : ['- nenhum']),
    '',
    '## Camadas',
    '',
    '| Prancheta | Camada no arquivo | No Otto | Como veio | Observação |',
    '|---|---|---|---|---|',
  ];
  for (const c of rel.camadas) {
    const perdas = (c.perdas ?? []).map((p) => p.detalhe).join('; ');
    l.push(
      `| ${celula(c.prancheta)} | ${celula(c.camada)} | ${c.tipo ?? '—'}${c.nomeNoOtto ? ` "${celula(c.nomeNoOtto)}"` : ''} | ${NOME_DO_DESTINO[c.destino]} | ${celula([c.observacao, perdas ? `não veio ou veio aproximado: ${perdas}` : ''].filter(Boolean).join('. '))} |`,
    );
  }
  l.push('', '## Fontes do texto', ...(rel.fontes.length ? rel.fontes.map((f) => `- ${f.familia} ${f.peso} (${f.postScript})`) : ['- nenhuma']));
  if (rel.emFalta.fontes.length) l.push('', '## Fontes que o Otto não tem', ...rel.emFalta.fontes.map((f) => `- ${f.postScript}: ${f.camadas.join(', ')}`));
  if (rel.substituicoes.length) l.push('', '## Fontes trocadas', ...rel.substituicoes.map((s) => `- ${s.camada}: pedia ${s.pedida}, veio com ${s.usada.familia} ${s.usada.peso}`));
  return `${l.join('\n')}\n`;
}
