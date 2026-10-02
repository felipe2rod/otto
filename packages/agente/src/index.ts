// Núcleo do ciclo do agente do Otto (ADR 029): entender → planejar → fazer em lotes → conferir → entregar.
//
// Regras deste pacote (testes em testes/fronteira, na raiz, e em src/pacote.test.ts):
// - TypeScript puro e ESM: não importa NestJS, Prisma, Next, React nem módulo "node:";
// - nenhum nome de fornecedor fora de src/adaptadores/;
// - todo efeito atrás de porta (portas.ts): modelo, documento, render, verificação, imagens, relógio, id, custo, progresso;
// - não escreve em log: o que o ciclo sabe é conteúdo do trabalho (ADR 031). Sai por evento e por resultado, para quem chama.
//
// Entradas:
//   @otto/agente                      o núcleo e o modelo roteirizado (falso)
//   @otto/agente/adaptadores/claude   o modelo de verdade, pelo fornecedor de inferência

export const NOME_DO_PACOTE = '@otto/agente' as const;

export { type Alavancas, lerAlavancas, NOMES_DAS_ALAVANCAS, TODAS_AS_ALAVANCAS } from './alavancas';
export type { MeiosDeChamada } from './chamada';
export { executarTarefa, LADO_DA_VISAO_GERAL, LADO_DO_DETALHE, MECANICA_DO_AJUSTE, type OpcoesDaExecucao, raciocinioDoCiclo } from './ciclo';
export * from './contrato';
export { Contador, custoVazio, dolaresDoUso, fracaoDeCache, totalDeTokens } from './custo';
export { cartaoDaDirecao, direcaoEmTexto, lerDirecao } from './direcao';
export {
  esforcoDaOpcao,
  lerEsforco,
  type MecanicaDoEsforco,
  mecanicaDoEsforco,
  NIVEIS_DE_ESFORCO_CRIATIVO,
  OPCOES_DE_CUIDADO,
  type OpcaoDeCuidado,
} from './esforco';
export { ferramentasDoAgente, OPERACOES_DO_CATALOGO } from './ferramentas';
export { comUsoDasFontes, USO_DAS_FONTES } from './fontes-base';
export { criarGuarda, type Guarda, type MotivoDeRecusa, type Veredito } from './guarda';
export { delimitar, marcaDeMaterial } from './material';
export {
  comGravacao,
  criarModeloRoteirizado,
  type Gravacao,
  idsDoRoteiro,
  type ModeloRoteirizado,
  type OpcoesDoModeloRoteirizado,
  type Passo,
  type PassoDoRoteiro,
  type Roteiro,
  type VariaveisDoPedido,
  variaveisDoPedido,
} from './modelo-roteirizado';
export { lerPlano, motivosDoPode, planoDeCriacao, planoDoAjuste, planoDoBriefing } from './plano';
export * from './portas';
export { capacidadesDe, etapasPrevistas, type OpcoesDoPreparo, prepararTarefa } from './preparo';
export { VERSAO_DO_PROMPT } from './prompt/carater';
export type { Capacidades } from './prompt/repertorio';
export { montarPromptDoSistema } from './prompt/sistema';
export { type OpcoesDaTarefa, type RespostaAoPode, rodarTarefa } from './tarefa';
export { conferirTextoDoCliente, type TextoQueFalta, textosDoBriefing, textosEntreAspas } from './texto-do-cliente';
