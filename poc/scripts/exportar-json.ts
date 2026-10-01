// Exporta o PSD de um documento em JSON (uso em teste). Uso: tsx scripts/exportar-json.ts doc.json saida.psd
import { readFile, writeFile } from 'node:fs/promises';
import type { Documento } from '../src/documento/esquema';
import { exportarPrancheta, relatorioVazio } from '../src/servidor/psd';

const [entrada, saida] = process.argv.slice(2);
const doc = JSON.parse(await readFile(entrada!, 'utf8')) as Documento;
const rel = relatorioVazio(doc);
await writeFile(saida!, await exportarPrancheta(doc, doc.pranchetas[0]!, rel));
for (const c of rel.camadas) console.log(`  ${c.destino.padEnd(16)} ${c.camada}: ${c.observacao ?? ''}`);
