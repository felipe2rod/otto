// Confere as fotos de banco que a avaliação usa (poc/dados/arquivos): quantas servem, quantas o disco
// corrompeu (o conteúdo não bate mais com o hash do nome) e quantos metadados não são mais JSON.
//
//   docker compose run --rm --no-deps teste pnpm --filter @otto/agente exec tsx ../../avaliacao/comandos/conferir-fotos.ts
import path from 'node:path';
import { RAIZ } from '../src/ambiente';
import { criarBancoLocal } from '../src/banco-local';

const banco = criarBancoLocal(path.join(RAIZ, 'poc/dados/arquivos'), () => undefined);
console.log(`fotos de banco íntegras, servidas na avaliação: ${banco.total}`);
console.log(
  `fotos de banco com metadado legível e conteúdo que não bate com o hash: ${banco.corrompidas.length}${banco.corrompidas.length ? ` (${banco.corrompidas.map((h) => h.slice(0, 12)).join(', ')})` : ''}`,
);
console.log(`metadados ilegíveis (não dá para saber se eram foto de banco): ${banco.metasIlegiveis}`);
