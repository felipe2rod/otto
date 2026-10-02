// Antes do primeiro teste: espera a pilha responder e pede cada rota uma vez. O servidor de
// desenvolvimento do Next compila a rota no primeiro pedido, e isso pode levar dezenas de segundos;
// melhor pagar esse tempo aqui do que no limite de tempo de um teste.
const api = process.env.E2E_API ?? 'http://localhost:8080';

async function esperar(caminho: string, aceita: (status: number) => boolean, tentativas = 90): Promise<void> {
  let ultimo = 'sem resposta';
  for (let i = 0; i < tentativas; i++) {
    try {
      const r = await fetch(`${api}${caminho}`, { signal: AbortSignal.timeout(60_000) });
      await r.arrayBuffer();
      if (aceita(r.status)) return;
      ultimo = `status ${r.status}`;
    } catch (erro) {
      ultimo = String(erro);
    }
    await new Promise((seguir) => setTimeout(seguir, 2000));
  }
  throw new Error(`a pilha não respondeu em ${caminho}: ${ultimo}. Suba com "docker compose up -d" e confira "docker compose ps".`);
}

/**
 * Uma execução interrompida no meio (Ctrl+C, limite de tempo) não chega a arquivar as peças dela.
 * As peças de teste têm nome começado por "e2e": as paradas há mais de meia hora são arquivadas aqui.
 * (Meia hora de folga para não mexer nas peças de outra execução que esteja rodando agora.)
 */
async function arquivarSobras(): Promise<void> {
  const r = await fetch(`${api}/api/documentos?limite=100`);
  if (!r.ok) return;
  const catalogo = r.headers.get('x-otto-catalogo') ?? '2';
  const { itens } = (await r.json()) as { itens: { id: string; nome: string; alteradoEm: string }[] };
  const velhas = itens.filter((p) => p.nome.startsWith('e2e') && Date.now() - Date.parse(p.alteradoEm) > 30 * 60_000);
  for (const p of velhas) await fetch(`${api}/api/documentos/${p.id}`, { method: 'DELETE', headers: { 'X-Otto-Cliente': 'editor', 'X-Otto-Catalogo': catalogo } }).catch(() => undefined);
}

export default async function aquecer(): Promise<void> {
  await esperar('/api/saude/pronto', (s) => s === 200);
  await arquivarSobras();
  await esperar('/', (s) => s === 200);
  await esperar('/editor', (s) => s === 200);
  // a rota do editor compila mesmo para uma peça que não existe
  await esperar('/editor/p/00000000-0000-7000-8000-000000000000', (s) => s < 500);
}
