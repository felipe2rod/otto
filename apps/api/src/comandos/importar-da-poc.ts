// Importa os documentos da POC para a conta fixa do MVP. Só LÊ de poc/.
// Uso: docker compose run --rm api pnpm --filter @otto/api importar:poc
// Pode rodar de novo: documento já importado é pulado.
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { nomePostScript } from '../biblioteca/domain/fontes';
import { montarComando } from './montar';
import { type ArquivoDaPoc, importarDocumentoDaPoc } from './poc/importar-documento-da-poc';

const POC = path.resolve(process.env.POC_PASTA ?? '../../poc');
const DOCUMENTOS = path.join(POC, 'dados/documentos');
const ARQUIVOS = path.join(POC, 'dados/arquivos');
const FONTES_DO_GOOGLE = path.join(POC, 'fontes/google');
const PESOS = [300, 400, 500, 600, 700];

const comando = montarComando(process.env);

async function lerArquivo(sha256: string): Promise<ArquivoDaPoc | undefined> {
  if (!/^[0-9a-f]{64}$/.test(sha256)) return undefined;
  try {
    const bytes = await readFile(path.join(ARQUIVOS, sha256));
    const meta = JSON.parse(await readFile(path.join(ARQUIVOS, `${sha256}.json`), 'utf8').catch(() => '{}')) as { origem?: ArquivoDaPoc['origem'] };
    const o = meta.origem;
    const origem = o && typeof o.banco === 'string' ? { banco: o.banco, autor: String(o.autor ?? ''), licenca: String(o.licenca ?? ''), url: String(o.url ?? '') } : undefined;
    return { bytes, ...(origem ? { origem } : {}) };
  } catch {
    return undefined;
  }
}

try {
  const escopo = await comando.escopo();
  const nomes = (await readdir(DOCUMENTOS)).filter((n) => n.endsWith('.json')).sort();
  const contagem = { importado: 0, ja_existia: 0, recusado: 0 };
  const recusados: string[] = [];
  const familias = new Set<string>();

  for (const nome of nomes) {
    const idNaPoc = nome.replace(/\.json$/, '');
    let registro: unknown;
    try {
      registro = JSON.parse(await readFile(path.join(DOCUMENTOS, nome), 'utf8'));
    } catch {
      contagem.recusado++;
      recusados.push(`${idNaPoc}: o arquivo não é JSON (conteúdo corrompido no disco)`);
      continue;
    }
    const r = await importarDocumentoDaPoc(comando, escopo, idNaPoc, registro, lerArquivo);
    contagem[r.resultado]++;
    if (r.resultado === 'recusado') recusados.push(`${idNaPoc}: ${r.motivo}`);
    else for (const f of r.familias) familias.add(f);
  }

  // Fontes que os documentos usam e a biblioteca ainda não tem: as do Google que a POC baixou.
  // O índice da POC está corrompido no disco; o nome do arquivo segue a regra da POC (família sem
  // espaço, traço, peso), e o nome PostScript é lido do próprio arquivo.
  const semFonte: string[] = [];
  let fontesTrazidas = 0;
  for (const familia of [...familias].sort()) {
    if ((await comando.fontes.pesosDa(familia)).length > 0) continue;
    let achou = false;
    for (const peso of PESOS) {
      const conteudo = await readFile(path.join(FONTES_DO_GOOGLE, `${familia.replace(/[^\w]+/g, '')}-${peso}.ttf`)).catch(() => undefined);
      if (!conteudo) continue;
      const postScript = nomePostScript(conteudo);
      if (!postScript) continue;
      await comando.fontes.registrar({ familia, peso, nomePostScript: postScript, licenca: 'Google Fonts (licença aberta, a conferir por família)', conteudo });
      fontesTrazidas++;
      achou = true;
    }
    if (!achou) semFonte.push(familia);
  }

  const linhas = [
    `Documentos na POC: ${nomes.length}`,
    `  importados agora: ${contagem.importado}`,
    `  já estavam importados: ${contagem.ja_existia}`,
    `  recusados: ${contagem.recusado}`,
    ...recusados.map((r) => `    - ${r}`),
    `Famílias de fonte usadas: ${familias.size}; arquivos de fonte trazidos da POC agora: ${fontesTrazidas}`,
    ...(semFonte.length ? [`  sem arquivo de fonte (o texto não será desenhado): ${semFonte.join(', ')}`] : []),
    'O histórico da POC não é importado: cada documento entra na versão 0.',
  ];
  process.stdout.write(`${linhas.join('\n')}\n`);
} finally {
  await comando.fechar();
}
