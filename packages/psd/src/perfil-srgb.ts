// Perfil de cor sRGB (ICC, versão 2.1), gerado aqui: o ADR 028 pede o arquivo em RGB de 8 bits com o perfil sRGB embutido.
// É um perfil de monitor por matriz e curva: os três primários já adaptados a D50, o ponto branco D65 e a curva de
// transferência do sRGB (IEC 61966-2-1) em tabela de 1024 pontos, a mesma para os três canais. Gerar em vez de versionar
// um arquivo evita depender da licença de um perfil de terceiros, e a mesma entrada dá sempre os mesmos bytes.

const fixo = (v: number): number => Math.round(v * 65536);

/** Curva de transferência do sRGB: do valor codificado (0 a 1) para luz linear (0 a 1). */
export function sRgbParaLinear(v: number): number {
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

let pronto: Uint8Array | undefined;

/** Os bytes do perfil. Sempre os mesmos. */
export function perfilSrgb(): Uint8Array {
  if (pronto) return pronto;
  const ascii = (t: string): number[] => [...t].map((c) => c.charCodeAt(0));
  const u32 = (v: number): number[] => [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
  const u16 = (v: number): number[] => [(v >>> 8) & 255, v & 255];
  const alinhar = (b: number[]): number[] => {
    while (b.length % 4) b.push(0);
    return b;
  };
  const xyz = (x: number, y: number, z: number): number[] => [...ascii('XYZ '), 0, 0, 0, 0, ...u32(x), ...u32(y), ...u32(z)];

  const nome = 'sRGB IEC61966-2.1';
  // descrição no formato da versão 2: texto ASCII, e as partes Unicode e ScriptCode vazias
  const desc = alinhar([...ascii('desc'), 0, 0, 0, 0, ...u32(nome.length + 1), ...ascii(nome), 0, ...u32(0), ...u32(0), ...u16(0), 0, ...new Array<number>(67).fill(0)]);
  const cprt = alinhar([...ascii('text'), 0, 0, 0, 0, ...ascii('Sem direitos reservados. Gerado pelo Otto.'), 0]);
  // ponto branco D65 e primários do sRGB adaptados a D50 (Bradford), como no perfil sRGB IEC61966-2.1 de referência
  const wtpt = xyz(0xf351, 0x10000, 0x116cc);
  const rXYZ = xyz(0x6fa2, 0x38f5, 0x0390);
  const gXYZ = xyz(0x6299, 0xb785, 0x18da);
  const bXYZ = xyz(0x24a0, 0x0f84, 0xb6cf);
  const PONTOS = 1024;
  const curv = [...ascii('curv'), 0, 0, 0, 0, ...u32(PONTOS)];
  for (let i = 0; i < PONTOS; i++) curv.push(...u16(Math.round(sRgbParaLinear(i / (PONTOS - 1)) * 65535)));
  alinhar(curv);

  // as três curvas apontam para o mesmo dado
  const etiquetas: [string, number[]][] = [
    ['desc', desc],
    ['cprt', cprt],
    ['wtpt', wtpt],
    ['rXYZ', rXYZ],
    ['gXYZ', gXYZ],
    ['bXYZ', bXYZ],
    ['rTRC', curv],
    ['gTRC', curv],
    ['bTRC', curv],
  ];
  const inicioDosDados = 128 + 4 + etiquetas.length * 12;
  const dados: number[] = [];
  const posicao = new Map<number[], number>();
  const tabela: number[] = [...u32(etiquetas.length)];
  for (const [sigla, conteudo] of etiquetas) {
    if (!posicao.has(conteudo)) {
      posicao.set(conteudo, inicioDosDados + dados.length);
      dados.push(...conteudo);
    }
    tabela.push(...ascii(sigla), ...u32(posicao.get(conteudo) as number), ...u32(conteudo.length));
  }
  const tamanho = inicioDosDados + dados.length;
  const cabecalho = [
    ...u32(tamanho),
    ...u32(0), // módulo de cor preferido: nenhum
    ...u32(0x02100000), // versão 2.1
    ...ascii('mntr'),
    ...ascii('RGB '),
    ...ascii('XYZ '),
    // data fixa (o mesmo documento dá o mesmo arquivo): 2026-10-01 00:00:00
    ...u16(2026),
    ...u16(10),
    ...u16(1),
    ...u16(0),
    ...u16(0),
    ...u16(0),
    ...ascii('acsp'),
    ...u32(0), // plataforma
    ...u32(0), // opções
    ...u32(0), // fabricante
    ...u32(0), // modelo
    ...u32(0),
    ...u32(0), // atributos
    ...u32(0), // intenção: perceptiva
    ...u32(fixo(0.9642)),
    ...u32(fixo(1)),
    ...u32(fixo(0.8249)), // iluminante do espaço de conexão: D50
    ...u32(0), // criador
  ];
  while (cabecalho.length < 128) cabecalho.push(0);
  pronto = Uint8Array.from([...cabecalho, ...tabela, ...dados]);
  return pronto;
}
