// Apoio dos testes de importação: um PSD montado byte a byte, para os casos que nenhum programa gravaria.
const u16 = (v: number): number[] => [(v >>> 8) & 255, v & 255];
const u32 = (v: number): number[] => [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
const u64 = (v: number): number[] => [...u32(Math.floor(v / 2 ** 32)), ...u32(v >>> 0)];
const ascii = (t: string): number[] => [...t].map((c) => c.charCodeAt(0));

export interface CamadaDeTeste {
  /** topo, esquerda, base, direita */
  area: [number, number, number, number];
  /** tamanho declarado dos dados de cada canal (os dados em si são zeros) */
  canais?: number[];
  /** tipo do divisor de seção: 1 ou 2 abre grupo, 3 fecha */
  divisor?: 1 | 2 | 3;
  /** área da máscara de camada */
  mascara?: [number, number, number, number];
}

/** Um PSD (ou PSB) montado à mão: cabeçalho, sem recursos, com os registros de camada pedidos e uma composta crua. */
export function psdDeTeste(
  o: {
    assinatura?: string;
    versao?: number;
    canais?: number;
    altura?: number;
    largura?: number;
    bits?: number;
    modo?: number;
    camadas?: CamadaDeTeste[];
    /** quantas camadas o arquivo DIZ ter (padrão: as que tem) */
    contagem?: number;
    /** tamanho declarado da seção de camadas (padrão: o real) */
    tamanhoDaSecao?: number;
    semComposta?: boolean;
  } = {},
): Uint8Array {
  const psb = (o.versao ?? 1) === 2;
  const tamanho = (v: number): number[] => (psb ? u64(v) : u32(v));
  const largura = o.largura ?? 4;
  const altura = o.altura ?? 4;
  const canais = o.canais ?? 3;
  const cabecalho = [...ascii(o.assinatura ?? '8BPS'), ...u16(o.versao ?? 1), 0, 0, 0, 0, 0, 0, ...u16(canais), ...u32(altura), ...u32(largura), ...u16(o.bits ?? 8), ...u16(o.modo ?? 3)];
  const registros: number[] = [];
  const dados: number[] = [];
  for (const c of o.camadas ?? []) {
    const tamanhos = c.canais ?? [2, 2, 2, 2];
    const extra: number[] = [];
    // máscara de camada: tamanho e área; faixas de mesclagem vazias; nome vazio (um byte de tamanho, alinhado a 4)
    if (c.mascara) extra.push(...u32(20), ...c.mascara.flatMap(u32), 0, 0, 0, 0);
    else extra.push(...u32(0));
    extra.push(...u32(0), 0, 0, 0, 0);
    if (c.divisor) extra.push(...ascii('8BIM'), ...ascii('lsct'), ...u32(4), ...u32(c.divisor));
    registros.push(...c.area.flatMap(u32), ...u16(tamanhos.length));
    tamanhos.forEach((t, i) => {
      registros.push(...u16(i === 3 ? 0xffff : i), ...tamanho(t));
    });
    registros.push(...ascii('8BIM'), ...ascii('norm'), 255, 0, 0, 0, ...u32(extra.length), ...extra);
    // os dados de canal existem até o limite do razoável: o que passa disso é o arquivo mentindo
    for (const t of tamanhos) for (let i = 0; i < Math.min(t, 64); i++) dados.push(0);
  }
  const infoDasCamadas = [...u16(o.contagem ?? o.camadas?.length ?? 0), ...registros, ...dados];
  if (infoDasCamadas.length % 2) infoDasCamadas.push(0);
  // seção de camadas e máscaras: a lista de camadas e, depois dela, a máscara global (vazia). Sem camadas, a seção é vazia
  const secao = o.camadas || o.contagem !== undefined ? [...tamanho(infoDasCamadas.length), ...infoDasCamadas, ...u32(0)] : [];
  const composta = o.semComposta ? [] : [...u16(0), ...new Array<number>(largura * altura * canais).fill(0)];
  return new Uint8Array([...cabecalho, ...u32(0), ...u32(0), ...tamanho(o.tamanhoDaSecao ?? secao.length), ...secao, ...composta]);
}

// ---- perfil de cor ICC de teste
const fixo = (v: number): number[] => u32(Math.round(v * 65536));

/** Um perfil ICC RGB de matriz e curva, mínimo: descrição, três primários e uma curva (gama em `curv`, ou paramétrica em `para`). */
export function perfilDeTeste(nome: string, primarios: [number, number, number][], curva: { gama: number; parametrica?: boolean }, espaco = 'RGB '): Uint8Array {
  const alinhar = (b: number[]): number[] => {
    while (b.length % 4) b.push(0);
    return b;
  };
  const xyz = (p: [number, number, number]): number[] => [...ascii('XYZ '), 0, 0, 0, 0, ...p.flatMap(fixo)];
  const trc = curva.parametrica
    ? [...ascii('para'), 0, 0, 0, 0, 0, 0, 0, 0, ...fixo(curva.gama)]
    : alinhar([...ascii('curv'), 0, 0, 0, 0, ...u32(1), Math.floor(curva.gama), Math.round((curva.gama % 1) * 256)]);
  const desc = alinhar([...ascii('desc'), 0, 0, 0, 0, ...u32(nome.length + 1), ...ascii(nome), 0]);
  const etiquetas: [string, number[]][] = [
    ['desc', desc],
    ['rXYZ', xyz(primarios[0] as [number, number, number])],
    ['gXYZ', xyz(primarios[1] as [number, number, number])],
    ['bXYZ', xyz(primarios[2] as [number, number, number])],
    ['rTRC', trc],
    ['gTRC', trc],
    ['bTRC', trc],
  ];
  const inicio = 128 + 4 + etiquetas.length * 12;
  const dados: number[] = [];
  const tabela: number[] = [...u32(etiquetas.length)];
  for (const [sigla, conteudo] of etiquetas) {
    tabela.push(...ascii(sigla), ...u32(inicio + dados.length), ...u32(conteudo.length));
    dados.push(...conteudo);
  }
  const cabecalho = new Array<number>(128).fill(0);
  cabecalho.splice(12, 12, ...ascii('mntr'), ...ascii(espaco), ...ascii('XYZ '));
  cabecalho.splice(36, 4, ...ascii('acsp'));
  const tudo = [...cabecalho, ...tabela, ...dados];
  tudo.splice(0, 4, ...u32(tudo.length));
  return new Uint8Array(tudo);
}

/** Um perfil com os primários e a curva do Adobe RGB (1998). */
export const ADOBE_RGB = perfilDeTeste(
  'Adobe RGB (1998)',
  [
    [0.60974, 0.31111, 0.01947],
    [0.20528, 0.62567, 0.06087],
    [0.14919, 0.06322, 0.74457],
  ],
  { gama: 2.19921875 },
);
