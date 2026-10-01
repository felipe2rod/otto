// Roda depois de `next build` (está no script "build" do package.json e, por ele, no estágio de
// build da imagem). Se uma página pública alcançar o editor ou um .wasm, o build falha.
//   pnpm --filter @otto/web conferir:pacote
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { SENTINELA_DO_MOTOR } from '@otto/render/sentinela';
import { SENTINELA_DO_EDITOR } from '../src/editor/sentinela.ts';
import { ROTAS_PUBLICAS } from '../src/site/rotas.ts';
import { conferirPacotePublico } from './pacotePublico.ts';

const BUILD = path.resolve(import.meta.dirname, '../.next');

if (!existsSync(path.join(BUILD, 'BUILD_ID'))) {
  console.error('conferir-pacote-publico: não há build em apps/web/.next. Rode `next build` antes.');
  process.exit(1);
}

function listar(pasta: string): string[] {
  const inteira = path.join(BUILD, pasta);
  if (!existsSync(inteira)) return [];
  return readdirSync(inteira).flatMap((nome) => {
    const relativo = `${pasta}/${nome}`;
    return statSync(path.join(BUILD, relativo)).isDirectory() ? listar(relativo) : [relativo];
  });
}

const resultado = conferirPacotePublico(
  {
    ler: (caminho) => {
      const inteiro = path.join(BUILD, caminho);
      return existsSync(inteiro) ? readFileSync(inteiro, 'utf8') : undefined;
    },
    listar,
  },
  {
    // A página de "não encontrado" também é pública.
    rotas: [...ROTAS_PUBLICAS, '/_not-found'],
    // A sentinela do editor primeiro (é a que TEM de existir em algum script do build), depois a do
    // motor de render, que o motor carrega consigo (MotorDeRender.sentinela).
    proibidos: [SENTINELA_DO_EDITOR, SENTINELA_DO_MOTOR],
    // A bancada (página ".dev.tsx") só existe com `next dev`.
    rotasQueNaoPodemExistir: ['/editor/bancada'],
  },
);

if (resultado.violacoes.length > 0) {
  console.error('O pacote público alcança o que é do editor (ADR 019):');
  for (const v of resultado.violacoes) console.error(`  - ${v}`);
  process.exit(1);
}
console.log(`pacote público conferido: ${resultado.conferido.paginas} páginas, ${resultado.conferido.scripts} scripts, nenhum código do editor nem .wasm`);
