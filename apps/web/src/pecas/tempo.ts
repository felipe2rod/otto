// "há 2 dias", "anteontem", "agora": quem escreve é o Intl do pt-BR, não nós.
const formato = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' });

const UNIDADES: readonly [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
];

export function haQuantoTempo(quando: string, agora: Date): string {
  const segundos = (new Date(quando).getTime() - agora.getTime()) / 1000;
  if (!Number.isFinite(segundos)) return '';
  for (const [unidade, tamanho] of UNIDADES) {
    if (Math.abs(segundos) >= tamanho) return formato.format(Math.round(segundos / tamanho), unidade);
  }
  return formato.format(0, 'second');
}
