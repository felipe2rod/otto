// Roda o lint de design num documento salvo. Uso: tsx scripts/verificar-doc.ts <id>
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { verificarDocumento } from '../src/documento/lint';
import type { Registro } from '../src/servidor/armazenamento';
import { carregarImagens, meiosNode } from '../src/servidor/canvas-node';

const r = JSON.parse(await readFile(path.resolve(import.meta.dirname, `../dados/documentos/${process.argv[2]}.json`), 'utf8')) as Registro;
await carregarImagens(r.doc);
for (const a of verificarDocumento(r.doc, meiosNode)) console.log(`[${a.gravidade}] ${a.prancheta} / ${a.camada ?? '-'} (${a.regra}): ${a.mensagem}`);
