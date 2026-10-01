// Cria o esquema da fila e as filas, com o papel migrador. Roda no passo de migração.
// Uso: pnpm --filter @otto/api fila:preparar   (precisa de BANCO_URL_MIGRADOR)
import { prepararEsquemaDaFila } from '../plataforma/fila/adaptadores/pg-boss/preparar-esquema-da-fila';

const url = process.env.BANCO_URL_MIGRADOR;
if (!url) {
  process.stderr.write('Configuração inválida. Variáveis com problema: BANCO_URL_MIGRADOR.\n');
  process.exit(1);
}
const { filas } = await prepararEsquemaDaFila(url);
process.stdout.write(`Fila pronta: ${filas.join(', ')}.\n`);
