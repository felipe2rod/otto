// Medição da fila de exportação com DUAS CONTAS e os workers de verdade do compose.
// Sem login só existe a conta fixa, então este roteiro cria duas contas de medição na base de
// desenvolvimento, copia para elas uma peça pesada e uma leve da conta fixa, pede as exportações
// pelo caso de uso (publicando na fila de verdade) e acompanha. Quem exporta são os workers no ar.
//
//   docker compose run --rm -e MEDIR=1 teste pnpm --filter @otto/api medir:fila -- espera
//   docker compose run --rm -e MEDIR=1 teste pnpm --filter @otto/api medir:fila -- justica
//
// espera:  a conta P pede uma exportação pesada; 2 s depois a conta L pede uma leve. Quanto L espera?
// justica: a conta P pede cinco exportações médias; 1 s depois a conta L pede uma leve. Em que posição L termina?
// carga:   as duas contas exportam a peça pesada em todos os formatos, lado a lado. Serve para ler o pico de memória do worker.
import { lerContaId } from '@otto/shared';
import pg from 'pg';
import { CasosDeUsoDeArquivo } from '../src/arquivo/application/casos-de-uso-de-arquivo';
import { ArmazenamentoS3 } from '../src/arquivo/infrastructure/adaptadores/s3/armazenamento-s3';
import { RepositorioDeArquivosNoBanco } from '../src/arquivo/infrastructure/prisma/repositorio-de-arquivos-no-banco';
import { BibliotecaDeFontesNoBanco } from '../src/biblioteca/infrastructure/biblioteca-de-fontes-no-banco';
import { arquivosDaArvore } from '../src/documento/domain/arquivos-da-arvore';
import { RepositorioDeDocumentosNoBanco } from '../src/documento/infrastructure/prisma/repositorio-de-documentos-no-banco';
import { CasosDeUsoDeExportacao } from '../src/exportacao/application/casos-de-uso-de-exportacao';
import type { MotorDeExportacao } from '../src/exportacao/application/motor-de-exportacao';
import { RepositorioDeExportacoesNoBanco } from '../src/exportacao/infrastructure/prisma/repositorio-de-exportacoes-no-banco';
import { EscopoDaConta } from '../src/plataforma/escopo/escopo-da-conta';
import { BarramentoComPgBoss } from '../src/plataforma/fila/adaptadores/pg-boss/barramento-com-pg-boss';
import { uuidV7 } from '../src/plataforma/identidade/uuid-v7';
import { PrismaComEscopo } from '../src/plataforma/persistencia/prisma-com-escopo';

const BANCO = 'banco:5432/otto';
const URL_DO_MIGRADOR = `postgresql://otto_migrador:migrador-dev@${BANCO}`;
const URL_DO_APP = `postgresql://otto_app:app-dev@${BANCO}`;
const CONTA_FIXA = EscopoDaConta.abrir(lerContaId('01990000-0000-7000-8000-000000000001'));
const CONTA_P = EscopoDaConta.abrir(lerContaId('01990000-0000-7000-8000-0000000000a1'));
const CONTA_L = EscopoDaConta.abrir(lerContaId('01990000-0000-7000-8000-0000000000a2'));
// peças da POC importadas para a conta fixa (README, "Peças da POC")
const PECA_PESADA = 'ecce77e0-5076-87e3-9afe-fb987bdf72b4'; // 2 pranchetas, desfoque de movimento
const PECA_MEDIA = '129bf7a9-47ff-8299-bf5f-93a3b40e67e2'; // 5 pranchetas
const PECA_LEVE = '4e73c25b-3915-8bda-acdb-bd6bb8899a7e'; // 1 prancheta

const prisma = new PrismaComEscopo(URL_DO_APP, { conexoes: 4, tempoLimiteMs: 30_000 });
const armazenamento = new ArmazenamentoS3({
  adaptador: 's3',
  endereco: 'http://armazenamento:7070',
  enderecoPublico: 'http://localhost:8081',
  regiao: 'us-east-1',
  bucket: 'otto',
  chaveDeAcesso: 'otto-dev',
  chaveSecreta: 'segredo-do-armazenamento-dev',
});
const documentos = new RepositorioDeDocumentosNoBanco(prisma);
const repositorioDeArquivos = new RepositorioDeArquivosNoBanco(prisma);
const arquivos = new CasosDeUsoDeArquivo(repositorioDeArquivos, armazenamento, uuidV7, { bytesPorArquivo: 200e6, ladoMaximoDeImagem: 30_000, megapixelsNoMaximo: 400 });
const fila = new BarramentoComPgBoss(URL_DO_APP, { consumidor: false });
const exportacoes = new CasosDeUsoDeExportacao({
  documentos,
  exportacoes: new RepositorioDeExportacoesNoBanco(prisma),
  arquivos: repositorioDeArquivos,
  armazenamento,
  fontes: new BibliotecaDeFontesNoBanco(prisma, armazenamento),
  fila,
  // este processo só pede e acompanha: quem exporta são os workers do compose
  motor: undefined as unknown as MotorDeExportacao,
  gerarId: uuidV7,
});

async function criarConta(escopo: EscopoDaConta, nome: string): Promise<void> {
  const c = new pg.Client({ connectionString: URL_DO_MIGRADOR });
  await c.connect();
  try {
    await c.query('BEGIN');
    await c.query(`SELECT set_config('app.conta_id', $1, true)`, [escopo.contaId]);
    await c.query('INSERT INTO contas (id, nome) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING', [escopo.contaId, nome]);
    await c.query('COMMIT');
  } finally {
    await c.end();
  }
}

/** Copia uma peça da conta fixa (árvore e imagens) para a conta de medição. */
async function copiarPeca(destino: EscopoDaConta, id: string): Promise<string> {
  const origem = await documentos.abrir(CONTA_FIXA, id);
  if (!origem) throw new Error(`a peça ${id} não está na conta fixa: importe as peças da POC (README)`);
  for (const sha256 of arquivosDaArvore(origem.arvore)) {
    const registro = await repositorioDeArquivos.buscar(CONTA_FIXA, sha256);
    const bytes = registro ? await armazenamento.ler(CONTA_FIXA, registro.chaveDoObjeto) : undefined;
    if (bytes) await arquivos.enviarImagem(destino, bytes);
  }
  return (await documentos.criar(destino, { id: uuidV7(), nome: `medição ${origem.pranchetas}p`, arvore: origem.arvore })).id;
}

interface Medida {
  rotulo: string;
  pedidaEm: number;
  prontaEm?: number;
  estado?: string;
  trabalhoMs?: number;
}

async function pedir(escopo: EscopoDaConta, documentoId: string, pedido: Parameters<CasosDeUsoDeExportacao['pedir']>[2], rotulo: string, t0: number): Promise<Medida> {
  const medida: Medida = { rotulo, pedidaEm: (Date.now() - t0) / 1000 };
  const pedida = await exportacoes.pedir(escopo, documentoId, pedido);
  void (async () => {
    for (;;) {
      const e = await exportacoes.consultar(escopo, pedida.id);
      if (e.estado !== 'na_fila' && e.estado !== 'rodando') {
        medida.prontaEm = (Date.now() - t0) / 1000;
        medida.estado = e.estado;
        medida.trabalhoMs = e.duracaoMs ?? 0;
        return;
      }
      await new Promise((ok) => setTimeout(ok, 200));
    }
  })();
  return medida;
}

async function esperar(medidas: Medida[]): Promise<void> {
  while (medidas.some((m) => m.prontaEm === undefined)) await new Promise((ok) => setTimeout(ok, 200));
  const ordem = [...medidas].sort((a, b) => (a.prontaEm ?? 0) - (b.prontaEm ?? 0));
  for (const m of medidas) {
    const total = (m.prontaEm ?? 0) - m.pedidaEm;
    const posicao = ordem.indexOf(m) + 1;
    console.log(
      `${m.rotulo.padEnd(28)} pedida em ${m.pedidaEm.toFixed(1).padStart(5)} s | ${String(m.estado).padEnd(8)} em ${(m.prontaEm ?? 0).toFixed(1).padStart(5)} s (${posicao}ª a terminar) | do pedido ao pronto ${total.toFixed(1).padStart(5)} s | trabalho ${((m.trabalhoMs ?? 0) / 1000).toFixed(1).padStart(5)} s | espera ${(total - (m.trabalhoMs ?? 0) / 1000).toFixed(1).padStart(5)} s`,
    );
  }
}

const cenario = process.argv.at(-1);
await criarConta(CONTA_P, 'Medição: conta pesada');
await criarConta(CONTA_L, 'Medição: conta leve');
await fila.iniciar();
const leve = await copiarPeca(CONTA_L, PECA_LEVE);
if (cenario === 'espera') {
  const pesada = await copiarPeca(CONTA_P, PECA_PESADA);
  const inicio = Date.now();
  const medidas = [await pedir(CONTA_P, pesada, { formato: 'pdf', arquivos: 'juntas' }, 'P: PDF pesado', inicio)];
  await new Promise((ok) => setTimeout(ok, 2000));
  medidas.push(await pedir(CONTA_L, leve, { formato: 'png', escala: 1, semFundo: false }, 'L: PNG leve', inicio));
  await esperar(medidas);
} else if (cenario === 'justica') {
  const media = await copiarPeca(CONTA_P, PECA_MEDIA);
  const inicio = Date.now();
  const medidas: Medida[] = [];
  for (let i = 1; i <= 5; i++) medidas.push(await pedir(CONTA_P, media, { formato: 'psd', arquivos: 'por-prancheta' }, `P: PSD de 5 pranchetas nº ${i}`, inicio));
  await new Promise((ok) => setTimeout(ok, 1000));
  medidas.push(await pedir(CONTA_L, leve, { formato: 'png', escala: 1, semFundo: false }, 'L: PNG leve', inicio));
  await esperar(medidas);
} else if (cenario === 'carga') {
  // as duas contas exportam a peça pesada em todos os formatos, uma conta ao lado da outra: é o pior caso de memória de um worker com duas vagas
  const [deP, deL] = [await copiarPeca(CONTA_P, PECA_PESADA), await copiarPeca(CONTA_L, PECA_PESADA)];
  const inicio = Date.now();
  const pedidos = [
    { formato: 'psd', arquivos: 'por-prancheta' },
    { formato: 'png', escala: 2, semFundo: false },
    { formato: 'svg' },
    { formato: 'pdf', arquivos: 'juntas' },
    { formato: 'pdf', arquivos: 'juntas', pacote: true },
  ] as const;
  const emSerie = async (escopo: EscopoDaConta, doc: string, rotulo: string): Promise<Medida[]> => {
    const medidas: Medida[] = [];
    for (const pedido of pedidos) {
      const m = await pedir(escopo, doc, pedido, `${rotulo}: ${pedido.formato}${'pacote' in pedido ? ' (pacote)' : ''}`, inicio);
      medidas.push(m);
      while (m.prontaEm === undefined) await new Promise((ok) => setTimeout(ok, 200));
    }
    return medidas;
  };
  await esperar((await Promise.all([emSerie(CONTA_P, deP, 'P'), emSerie(CONTA_L, deL, 'L')])).flat());
} else {
  console.log('uso: medir:fila -- espera | justica | carga');
}
await fila.parar();
await prisma.fechar();
