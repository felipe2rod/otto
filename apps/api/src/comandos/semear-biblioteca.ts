// Semeia a biblioteca de fontes do Otto com os arquivos de recursos/fontes. Idempotente.
// Uso: pnpm --filter @otto/api biblioteca:semear   (o serviço "semear" do compose roda a cada subida)
import path from 'node:path';
import { semearFontes } from '../biblioteca/application/semear-fontes';
import { montarComando } from './montar';

const comando = montarComando(process.env);
const pasta = path.resolve(process.env.BIBLIOTECA_PASTA_DE_FONTES ?? 'recursos/fontes');
try {
  const r = await semearFontes(comando.fontes, pasta);
  const total = (await comando.fontes.listar()).reduce((soma, f) => soma + f.pesos.length, 0);
  process.stdout.write(`Biblioteca de fontes: ${r.registradas} do índice conferidas, ${total} na biblioteca.\n`);
  for (const p of r.problemas) process.stderr.write(`  problema em ${p.arquivo}: ${p.motivo}\n`);
  if (r.problemas.length > 0) process.exitCode = 1;
} finally {
  await comando.fechar();
}
