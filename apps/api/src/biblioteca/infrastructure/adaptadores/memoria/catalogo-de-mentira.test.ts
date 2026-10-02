import { readFileSync } from 'node:fs';
import path from 'node:path';
import { contratoDoCatalogoDeFontes } from '../../../application/catalogo-de-fontes.contrato';
import { CatalogoDeMentira } from './catalogo-de-mentira';

const ANTON = new Uint8Array(readFileSync(path.resolve(import.meta.dirname, '../../../../../../../packages/render/recursos-de-teste/fontes/Anton-Regular.ttf')));

contratoDoCatalogoDeFontes('falso', () => {
  const catalogo = new CatalogoDeMentira(ANTON);
  // o falso não tem rede: "idas" são as leituras que ele faria, e ele não repete nenhuma
  return { catalogo, existe: { familia: 'Poppins', peso: 400 }, idas: () => 0 };
});
