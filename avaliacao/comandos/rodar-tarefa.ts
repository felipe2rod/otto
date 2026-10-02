// Roda uma tarefa de verdade do Otto, fora da API: documento em memória, motor de render e verificação de
// verdade, modelo de verdade (ou um roteiro gravado). Grava, em pasta fora do git, os renders que o modelo
// viu, o documento final, o PNG de cada prancheta, o registro de etapas, o custo e o roteiro da tarefa.
//
//   docker compose run --rm --no-deps teste pnpm --filter @otto/agente tarefa -- --caso briefing-cafe
//   ... tarefa -- --documento poc/dados/documentos/<id>.json --ajuste "título em azul"
//   ... tarefa -- --caso ajuste-titulo-em-destaque --roteiro packages/agente/roteiros/<nome>.json   (sem gastar token)
//
// Opções: --caso <id> | --briefing <arquivo.json> | --criar "<pedido>" | --pedido "<pedido>" | --ajuste "<pedido>"
//         --documento <arquivo.json>   documento de partida (árvore, ou registro da POC)
//         --esforco <NÍVEL>            um dos sete níveis (só em briefing, criar e pedido)
//         --modelo <id>                id do modelo no fornecedor (padrão: o do adaptador)
//         --roteiro <arquivo.json>     responde pelo roteiro gravado, sem chamar modelo
//         --saida <pasta>              padrão: avaliacao/saida/<data>-<nome>
//         --teto-de-custo <dólares>    padrão 3      --teto-de-tempo <minutos>   padrão 40
//         --sem-banco                  roda sem banco de imagens
//         --alavancas <lista>          todas, nenhuma (padrão), ou números e nomes separados por vírgula:
//                                      1 esquemaCompacto · 2 conferenciaNoLote · 3 avisoEJulgamento · 4 julgamentoEmMedio
//         --esquema compacto           o mesmo que a alavanca 1
//         --teto-de-tokens <n>         padrão 4000000
//
// A chave do fornecedor vem de LLM_API_KEY_DO, no .env da raiz. Ela nunca é impressa.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { criarModeloClaude, MODELO_PADRAO } from '../../packages/agente/src/adaptadores/claude';
import {
  comGravacao,
  criarModeloRoteirizado,
  EntradaDaTarefa,
  type EventoDaTarefa,
  fracaoDeCache,
  idsDoRoteiro,
  lerAlavancas,
  type ModeloDoAgente,
  NOMES_DAS_ALAVANCAS,
  type Roteiro,
  rodarTarefa,
  totalDeTokens,
  VERSAO_DO_PROMPT,
} from '../../packages/agente/src/index';
import { Documento } from '../../packages/documento/src/index';
import { criarAmbienteEmMemoria, lerDocumento, RAIZ } from '../src/ambiente';
import { aplicarCriterios } from '../src/avaliar';
import { type Caso, documentoDoCaso, lerCaso } from '../src/casos';
import { recusasDaGuarda } from '../src/criterios';

/** Câmbio de docs/tecnico/custos.md, seção 7 (2026-09-26). */
const REAIS_POR_DOLAR = 5.1991;

function argumentos(): Map<string, string> {
  const mapa = new Map<string, string>();
  const brutos = process.argv.slice(2).filter((a) => a !== '--');
  for (let i = 0; i < brutos.length; i++) {
    const a = brutos[i] as string;
    if (!a.startsWith('--')) continue;
    const proximo = brutos[i + 1];
    if (proximo === undefined || proximo.startsWith('--')) mapa.set(a.slice(2), 'sim');
    else {
      mapa.set(a.slice(2), proximo);
      i++;
    }
  }
  return mapa;
}

const relativoARaiz = (caminho: string) => (path.isAbsolute(caminho) ? caminho : path.join(RAIZ, caminho));
const tempo = (ms: number) => `${String(Math.floor(ms / 60000)).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;

async function principal(): Promise<void> {
  const args = argumentos();
  const env = path.join(RAIZ, '.env');
  if (existsSync(env)) process.loadEnvFile(env);

  // ---------- a tarefa ----------
  let caso: Caso | undefined;
  let entradaBruta: unknown;
  let nome: string;
  const esforco = args.get('esforco');
  if (args.has('caso')) {
    caso = lerCaso(args.get('caso') as string);
    entradaBruta = caso.entrada;
    nome = caso.id;
  } else if (args.has('briefing')) {
    const lido = JSON.parse(readFileSync(relativoARaiz(args.get('briefing') as string), 'utf8')) as { briefing?: unknown };
    entradaBruta = { tipo: 'briefing', briefing: lido.briefing ?? lido, ...(esforco ? { esforco } : {}) };
    nome = path.basename(args.get('briefing') as string, '.json');
  } else if (args.has('criar')) {
    entradaBruta = { tipo: 'criar', pedido: args.get('criar'), ...(esforco ? { esforco } : {}) };
    nome = 'criar';
  } else if (args.has('pedido')) {
    entradaBruta = { tipo: 'pedido', pedido: args.get('pedido'), ...(esforco ? { esforco } : {}) };
    nome = 'pedido';
  } else if (args.has('ajuste')) {
    entradaBruta = { tipo: 'ajuste', pedido: args.get('ajuste') };
    nome = 'ajuste';
  } else if (args.has('roteiro')) {
    // só o roteiro: a tarefa é a que ele gravou
    const gravado = JSON.parse(readFileSync(relativoARaiz(args.get('roteiro') as string), 'utf8')) as Roteiro;
    entradaBruta = gravado.entrada;
    nome = gravado.nome;
  } else throw new Error('diga a tarefa: --caso, --briefing, --criar, --pedido, --ajuste ou --roteiro');
  const entrada = EntradaDaTarefa.parse(caso && esforco && caso.entrada.tipo !== 'ajuste' ? { ...caso.entrada, esforco } : entradaBruta);

  // ---------- o documento de partida ----------
  let inicial = caso ? documentoDoCaso(caso) : Documento.parse({ versaoDoFormato: 1, tokens: { cores: {} }, pranchetas: [] });
  let nomeDaPeca: string | undefined;
  if (args.has('documento')) {
    const lido = lerDocumento(relativoARaiz(args.get('documento') as string));
    inicial = Documento.parse(lido.documento);
    nomeDaPeca = lido.nome;
  }

  // ---------- o modelo ----------
  let restamNoDia: number | undefined;
  let roteiro: Roteiro | undefined;
  let base: ModeloDoAgente;
  if (args.has('roteiro')) {
    roteiro = JSON.parse(readFileSync(relativoARaiz(args.get('roteiro') as string), 'utf8')) as Roteiro;
    base = criarModeloRoteirizado(roteiro, { nome: `roteiro:${roteiro.nome}` });
  } else {
    const chave = process.env.LLM_API_KEY_DO;
    if (!chave) throw new Error('LLM_API_KEY_DO ausente: coloque no .env da raiz do projeto');
    base = criarModeloClaude({
      chave,
      modelo: args.get('modelo') ?? MODELO_PADRAO,
      aoVerLimites: (l) => {
        if (l.restamNoDia !== undefined) restamNoDia = l.restamNoDia;
      },
    });
  }
  const gravacao = comGravacao(base, () => Date.now());

  const carimbo = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const pasta = relativoARaiz(args.get('saida') ?? path.join('avaliacao/saida', `${carimbo}-${nome}`));
  mkdirSync(pasta, { recursive: true });

  const controle = new AbortController();
  process.on('SIGINT', () => controle.abort());
  // o progresso que sai no terminal é etapa e contagem: nenhum conteúdo da peça
  const aoEmitir = (e: EventoDaTarefa, ms: number) => {
    if (e.tipo === 'etapa') console.log(`[${tempo(ms)}] etapa: ${e.etapa}${e.rodada ? ` (rodada ${e.rodada})` : ''}`);
    else if (e.tipo === 'lote') console.log(`[${tempo(ms)}]   lote aplicado (${e.operacoes.length} operações)`);
    else if (e.tipo === 'lote-recusado') console.log(`[${tempo(ms)}]   lote recusado: ${e.motivo}`);
    else if (e.tipo === 'verificacao') console.log(`[${tempo(ms)}]   verificação: ${e.novos} aviso(s) novo(s)`);
    else if (e.tipo === 'render') console.log(`[${tempo(ms)}]   render${e.detalhe ? ' de detalhe' : ''}`);
    else if (e.tipo === 'erro') console.log(`[${tempo(ms)}]   erro: ${e.codigo}${e.ferramenta ? ` em ${e.ferramenta}` : ''}`);
    else if (e.tipo === 'plano')
      console.log(`[${tempo(ms)}]   plano: criar ${e.plano.criar.length}, alterar ${e.plano.alterar.length}, remover ${e.plano.remover.length}; pede "pode": ${e.pedeConfirmacao ? 'sim' : 'não'}`);
  };
  const amb = await criarAmbienteEmMemoria({
    modelo: gravacao.modelo,
    documento: inicial,
    ...(nomeDaPeca ? { nome: nomeDaPeca } : {}),
    pastaDeRenders: path.join(pasta, 'renders'),
    sinal: controle.signal,
    comBancoDeImagens: !args.has('sem-banco'),
    ...(roteiro ? { novoId: idsDoRoteiro(roteiro) } : {}),
    limites: {
      tetoDeCusto: Number(args.get('teto-de-custo') ?? 3),
      tetoDeTempoMs: Number(args.get('teto-de-tempo') ?? 40) * 60_000,
      ...(args.has('teto-de-tokens') ? { tetoDeTokens: Number(args.get('teto-de-tokens')) } : {}),
    },
    aoEmitir,
  });
  const avisosIniciais = amb.verificarAgora();

  const alavancas = lerAlavancas(args.get('alavancas'));
  const ligadas = NOMES_DAS_ALAVANCAS.filter((n) => alavancas[n]);
  console.log(`alavancas: ${ligadas.join(', ') || 'nenhuma'}`);
  console.log(`tarefa: ${entrada.tipo} · modelo: ${base.nome} · prompt: ${VERSAO_DO_PROMPT} · banco de imagens local: ${amb.imagens ? `${amb.banco.total} fotos` : 'não'}`);
  // o "pode" é aprovado sozinho: aqui se mede a tarefa inteira; o tempo de espera do designer não entra
  const { preparo, resultado } = await rodarTarefa(amb, entrada, { confirmar: () => 'pode', alavancas, ...(args.get('esquema') === 'compacto' ? { esquemaDasOperacoes: 'compacto' as const } : {}) });

  // ---------- o que fica gravado ----------
  const final = amb.documento();
  const avisos = amb.verificarAgora();
  const gravar = (arquivo: string, valor: unknown) => writeFileSync(path.join(pasta, arquivo), `${JSON.stringify(valor, null, 2)}\n`);
  gravar('entrada.json', entrada);
  gravar('preparo.json', preparo ?? null);
  gravar('documento-inicial.json', inicial);
  gravar('documento-final.json', final);
  gravar('registro.json', amb.registro);
  gravar('chamadas.json', amb.chamadas);
  gravar('resultado.json', resultado);
  gravar('verificacao-final.json', avisos);
  gravar('roteiro.json', { nome, descricao: `gravado em ${carimbo} com ${base.nome}, prompt ${VERSAO_DO_PROMPT}`, entrada, ids: amb.ids, passos: gravacao.passos() } satisfies Roteiro);
  for (const p of final.pranchetas) writeFileSync(path.join(pasta, `final-${p.nome.replace(/[^\p{L}\p{N}]+/gu, '_')}.png`), amb.pngDaPrancheta(p.id));

  const c = resultado.custo;
  const entradaTotal = c.tokens.entrada + c.tokens.cacheLido + c.tokens.cacheCriado;
  const resumo = {
    tarefa: nome,
    tipo: entrada.tipo,
    modelo: base.nome,
    prompt: VERSAO_DO_PROMPT,
    alavancas: ligadas,
    fim: resultado.fim,
    conferida: resultado.conferida,
    segundos: Math.round(c.duracaoMs / 1000),
    chamadas: c.chamadas,
    chamadasPorPapel: Object.fromEntries(Object.entries(c.porPapel).map(([papel, v]) => [papel, v.chamadas])),
    tokens: {
      entradaTotal,
      entradaCheia: c.tokens.entrada,
      cacheLido: c.tokens.cacheLido,
      cacheCriado: c.tokens.cacheCriado,
      saida: c.tokens.saida,
      total: totalDeTokens(c),
      fracaoDeCache: Number(fracaoDeCache(c).toFixed(3)),
    },
    imagensVistas: c.imagensVistas,
    voltasDeConferencia: c.voltasDeConferencia,
    lotes: c.lotes,
    lotesRecusados: c.lotesRecusados,
    recusasDaGuarda: recusasDaGuarda(amb.registro.map((r) => r.evento)),
    dolares: c.dolares === null ? null : Number(c.dolares.toFixed(4)),
    reais: c.dolares === null ? null : Number((c.dolares * REAIS_POR_DOLAR).toFixed(2)),
    pendencias: resultado.entrega.pendencias.length,
    pranchetas: final.pranchetas.length,
    ...(restamNoDia !== undefined ? { tokensRestantesNoDiaDoFornecedor: restamNoDia } : {}),
  };
  gravar('custo.json', resumo);
  const criterios = aplicarCriterios(
    caso ?? {
      entrada,
      criterios: {
        automaticos: [
          'tarefa-concluida',
          'lint-sem-erro',
          'sem-camada-invisivel',
          'conferencia-honesta',
          'trabalho-do-designer-intacto',
          ...(entrada.tipo === 'briefing' ? ['estrutura', 'texto-literal'] : []),
        ],
      },
    },
    { inicial, final, avisos, avisosIniciais, resultado, eventos: amb.registro.map((r) => r.evento), plano: preparo?.plano },
    preparo,
  );
  gravar('criterios.json', criterios);
  amb.fechar();

  console.log(
    `\nfim: ${resultado.fim} · conferida: ${resultado.conferida ? 'sim' : 'não'} · ${resumo.segundos} s · ${c.chamadas} chamadas (${Object.entries(resumo.chamadasPorPapel)
      .map(([p, n]) => `${p} ${n}`)
      .join(', ')})`,
  );
  console.log(
    `tokens: entrada ${entradaTotal} (cache lido ${c.tokens.cacheLido}, ${Math.round(fracaoDeCache(c) * 100)}%; cache escrito ${c.tokens.cacheCriado}; cheia ${c.tokens.entrada}) · saída ${c.tokens.saida}`,
  );
  console.log(`imagens vistas: ${c.imagensVistas} · voltas: ${c.voltasDeConferencia} · lotes: ${c.lotes} (${c.lotesRecusados} recusados) · pendências: ${resumo.pendencias}`);
  console.log(
    `custo: ${resumo.dolares === null ? 'sem preço declarado' : `US$ ${resumo.dolares.toFixed(4)} · R$ ${resumo.reais?.toFixed(2)}`}${restamNoDia !== undefined ? ` · restam ${restamNoDia} tokens hoje no fornecedor` : ''}`,
  );
  console.log('critérios automáticos:');
  for (const v of criterios) console.log(`  ${v.passou ? 'passou' : 'FALHOU'}  ${v.criterio}: ${v.detalhe}`);
  console.log(`gravado em ${path.relative(RAIZ, pasta)}`);
}

principal().catch((e: unknown) => {
  // só o tipo e a mensagem do erro: o detalhe do fornecedor pode trazer trecho do pedido
  console.error(`falhou: ${e instanceof Error ? `${e.name}: ${e.message}` : String(e)}`);
  process.exitCode = 1;
});
