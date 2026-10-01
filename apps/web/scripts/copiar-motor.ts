// Copia os dois arquivos do motor de render (canvaskit.js e canvaskit.wasm) para a pasta estática
// do web, em public/motor/<versão>/. O editor os busca em tempo de execução; por serem arquivos
// estáticos, o WebAssembly não entra no pacote de página nenhuma (ADR 019).
//
// Roda antes de `next dev` e de `next build` (scripts do package.json). Usa tsx, e não o node puro
// dos outros scripts, porque @otto/render é consumido pelo código-fonte TypeScript, com import sem
// extensão. Quem diz a versão e onde os arquivos estão é o próprio pacote.
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { arquivosDoMotor } from '@otto/render/node';

const DESTINO = path.resolve(import.meta.dirname, '../public/motor');
const { versao, arquivos } = arquivosDoMotor();
const pasta = path.join(DESTINO, versao);

// versão antiga não fica para trás: a pasta é gerada, e só a versão em uso é servida
if (existsSync(DESTINO)) for (const outra of readdirSync(DESTINO)) if (outra !== versao) rmSync(path.join(DESTINO, outra), { recursive: true, force: true });

mkdirSync(pasta, { recursive: true });
let copiados = 0;
for (const { nome, caminho } of arquivos) {
  const alvo = path.join(pasta, nome);
  // o disco do repositório é lento: não copia de novo o que já está lá com o mesmo tamanho
  if (existsSync(alvo) && statSync(alvo).size === statSync(caminho).size) continue;
  copyFileSync(caminho, alvo);
  copiados++;
}
console.log(`motor de render ${versao}: ${copiados === 0 ? 'já estava' : `${copiados} arquivo(s) copiado(s)`} em public/motor/${versao}/`);
