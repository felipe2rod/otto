// Semeia o que toda instalação precisa: a biblioteca de fontes do Otto (recursos/fontes), as texturas do Otto
// e a peça de exemplo da conta. Idempotente.
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
  // texturas do Otto: geradas uma vez e guardadas na biblioteca (a API não desenha; o worker também gera, se faltar)
  const geradas = await comando.texturas.preparar();
  process.stdout.write(`Texturas do Otto: ${geradas} geradas agora.\n`);
  // peça de exemplo da conta (sem login, a conta fixa): uma vez por conta, e não volta se foi apagada
  const exemplo = await comando.pecas.semearExemplo(await comando.escopo());
  process.stdout.write(exemplo ? 'Peça de exemplo criada na conta.\n' : 'Peça de exemplo: a conta já teve a dela.\n');
} finally {
  await comando.fechar();
}
