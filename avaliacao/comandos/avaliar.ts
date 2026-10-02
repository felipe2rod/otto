// Soma os resultados já gravados em avaliacao/saida: taxa de tarefa concluída, taxa de conferência honesta,
// custo médio e piores casos (o que toda proposta de mudança de prompt, de modelo ou de ferramenta traz,
// antes e depois).
//
//   docker compose run --rm --no-deps teste pnpm --filter @otto/agente avaliar -- [pasta com as saídas]
//
// Não roda tarefa: quem roda é `tarefa`, um caso por vez, porque cada tarefa custa.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { RAIZ } from '../src/ambiente';
import type { Veredito } from '../src/criterios';

interface Custo {
  tarefa: string;
  tipo: string;
  modelo: string;
  prompt: string;
  fim: string;
  conferida: boolean;
  segundos: number;
  chamadas: number;
  tokens: { total: number; fracaoDeCache: number; saida: number };
  imagensVistas: number;
  dolares: number | null;
  reais: number | null;
}

const pasta = path.resolve(RAIZ, process.argv.slice(2).filter((a) => a !== '--')[0] ?? 'avaliacao/saida');
const lerJson = <T>(arquivo: string): T | undefined => (existsSync(arquivo) ? (JSON.parse(readFileSync(arquivo, 'utf8')) as T) : undefined);
const rodadas = (existsSync(pasta) ? readdirSync(pasta) : []).sort().flatMap((nome) => {
  const custo = lerJson<Custo>(path.join(pasta, nome, 'custo.json'));
  const criterios = lerJson<Veredito[]>(path.join(pasta, nome, 'criterios.json'));
  return custo && criterios ? [{ nome, custo, criterios }] : [];
});

if (rodadas.length === 0) console.log(`nenhuma tarefa gravada em ${path.relative(RAIZ, pasta)}`);
else {
  const passou = (r: (typeof rodadas)[number], criterio: string) => r.criterios.find((v) => v.criterio === criterio)?.passou;
  const taxa = (criterio: string) => {
    const com = rodadas.filter((r) => passou(r, criterio) !== undefined);
    return com.length ? `${com.filter((r) => passou(r, criterio)).length} de ${com.length}` : 'sem caso';
  };
  const media = (valores: number[]) => (valores.length ? valores.reduce((a, b) => a + b, 0) / valores.length : 0);
  const comCusto = rodadas.filter((r) => r.custo.dolares !== null);
  console.log(`${rodadas.length} tarefa(s) em ${path.relative(RAIZ, pasta)}\n`);
  console.log('tarefa | tipo | fim | tempo | chamadas | tokens | cache | imagens | US$ | R$ | critérios que falharam');
  for (const r of rodadas) {
    const c = r.custo;
    console.log(
      [
        r.nome,
        c.tipo,
        c.fim,
        `${c.segundos} s`,
        c.chamadas,
        c.tokens.total,
        `${Math.round(c.tokens.fracaoDeCache * 100)}%`,
        c.imagensVistas,
        c.dolares?.toFixed(4) ?? '-',
        c.reais?.toFixed(2) ?? '-',
        r.criterios
          .filter((v) => !v.passou)
          .map((v) => v.criterio)
          .join(', ') || 'nenhum',
      ].join(' | '),
    );
  }
  console.log(`\ntaxa de tarefa concluída: ${taxa('tarefa-concluida')}`);
  console.log(`taxa de conferência honesta: ${taxa('conferencia-honesta')}`);
  console.log(
    `custo médio: US$ ${media(comCusto.map((r) => r.custo.dolares ?? 0)).toFixed(4)} · R$ ${media(comCusto.map((r) => r.custo.reais ?? 0)).toFixed(2)} · tempo médio: ${Math.round(media(rodadas.map((r) => r.custo.segundos)))} s`,
  );
  const piores = [...rodadas].sort((a, b) => b.criterios.filter((v) => !v.passou).length - a.criterios.filter((v) => !v.passou).length || (b.custo.dolares ?? 0) - (a.custo.dolares ?? 0)).slice(0, 3);
  console.log(`piores casos: ${piores.map((r) => `${r.nome} (${r.criterios.filter((v) => !v.passou).length} critério(s) falharam, ${r.custo.segundos} s)`).join('; ')}`);
}
