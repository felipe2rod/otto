// Servidor estático do spike: entrega as páginas, o WebAssembly, as fontes e as imagens,
// e recebe o que o navegador renderizou, para comparar com o Node. Só para desenvolvimento.
import { createReadStream } from 'node:fs';
import { mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { PASTA_CANVASKIT, PASTA_FONTES, PASTA_IMAGENS, RAIZ } from './node/carregar.ts';

const PORTA = Number(process.env['PORTA'] ?? 8137);
const PASTA_PUBLICA = path.join(RAIZ, 'publico');
const PASTA_DE_SAIDA = path.join(RAIZ, 'saida/navegador');

const TIPOS: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.map': 'application/json',
  '.json': 'application/json',
  // com este tipo o navegador compila o WebAssembly enquanto baixa
  '.wasm': 'application/wasm',
  '.ttf': 'font/ttf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
};

const MONTAGENS: [string, string][] = [
  ['/canvaskit/', PASTA_CANVASKIT],
  ['/fontes/', PASTA_FONTES],
  ['/recursos/', PASTA_IMAGENS],
  ['/saida/', path.join(RAIZ, 'saida')],
  ['/', PASTA_PUBLICA],
];

/** Resolve o caminho pedido dentro da pasta montada; devolve undefined se tentar sair dela. */
function resolver(url: string): string | undefined {
  const caminho = decodeURIComponent(url.split('?')[0] ?? '/');
  for (const [prefixo, pasta] of MONTAGENS) {
    if (!caminho.startsWith(prefixo)) continue;
    const alvo = path.resolve(pasta, caminho.slice(prefixo.length) || 'index.html');
    return alvo === pasta || alvo.startsWith(pasta + path.sep) ? alvo : undefined;
  }
  return undefined;
}

const servidor = createServer(async (pedido, resposta) => {
  const url = pedido.url ?? '/';
  try {
    if (pedido.method === 'POST' && url.startsWith('/resultado/')) {
      const alvo = path.resolve(PASTA_DE_SAIDA, decodeURIComponent(url.slice('/resultado/'.length).split('?')[0] ?? ''));
      if (!alvo.startsWith(PASTA_DE_SAIDA + path.sep)) {
        resposta.writeHead(400).end('caminho fora da pasta de saída');
        return;
      }
      const partes: Buffer[] = [];
      for await (const parte of pedido) partes.push(parte as Buffer);
      await mkdir(path.dirname(alvo), { recursive: true });
      await writeFile(alvo, Buffer.concat(partes));
      resposta.writeHead(204).end();
      return;
    }
    if (url.startsWith('/estado')) {
      // quais execuções do navegador já terminaram: o script de paridade espera por isto
      const pastas = await readdir(PASTA_DE_SAIDA, { withFileTypes: true }).catch(() => []);
      const terminadas: string[] = [];
      for (const p of pastas) if (p.isDirectory() && (await stat(path.join(PASTA_DE_SAIDA, p.name, 'fim.json')).catch(() => undefined))) terminadas.push(p.name);
      resposta.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ terminadas }));
      return;
    }
    const arquivo = resolver(url);
    const info = arquivo ? await stat(arquivo).catch(() => undefined) : undefined;
    if (!arquivo || !info?.isFile()) {
      resposta.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('não encontrado');
      return;
    }
    resposta.writeHead(200, { 'content-type': TIPOS[path.extname(arquivo)] ?? 'application/octet-stream', 'content-length': info.size, 'cache-control': 'no-store' });
    createReadStream(arquivo).pipe(resposta);
  } catch (erro) {
    resposta.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' }).end(String(erro));
  }
});

servidor.listen(PORTA, '0.0.0.0', () => console.log(`Spike de render em http://127.0.0.1:${PORTA}`));
