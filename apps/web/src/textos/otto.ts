// RASCUNHO: texto de interface ainda sem revisão do guardião da marca. Não é texto final.
// O painel do Otto (docs/mvp/experiencia.md, seções 3.5 a 3.9, 5.1 e 6.1 a 6.3). A marca vai mudar:
// estas frases dizem o que precisa ser dito, sem investir em redação.
//
// O QUE NÃO APARECE AQUI: nome de modelo, token, custo, "IA". O designer vê o tempo e o que foi feito.
// As falas do Otto (mensagem, resumo, o texto de uma pendência que ele declarou) são conteúdo do
// trabalho e vêm do servidor; as frases do SISTEMA sobre a tarefa são montadas aqui, pelo código.
import { plural } from './plural';

const lista = (nomes: readonly string[]): string => new Intl.ListFormat('pt-BR', { style: 'long', type: 'conjunction' }).format(nomes);

/** "8 min", "45 s", "1 h 05 min". O designer vê o tempo, nunca uma porcentagem. */
export function duracao(ms: number): string {
  const segundos = Math.max(0, Math.round(ms / 1000));
  if (segundos < 60) return `${segundos} s`;
  const minutos = Math.floor(segundos / 60);
  if (minutos < 60) return `${minutos} min`;
  return `${Math.floor(minutos / 60)} h ${String(minutos % 60).padStart(2, '0')} min`;
}

export const otto = {
  titulo: 'Otto',

  pedir: {
    rotulo: 'Peça ao Otto',
    campo: 'O que você quer?',
    exemplo: 'título em azul e um pouco maior',
    exemploDeCriar: 'cartaz do novo horário, feed e story',
    sobre: (camadas: readonly string[]): string => `sobre: ${lista(camadas)}`,
    tirarSelecao: 'Não mandar a seleção',
    tipo: 'Tamanho do pedido',
    tipos: {
      ajuste: 'Ajuste rápido',
      pedido: 'Pedido maior',
    },
    oQueE: {
      ajuste: 'Uma prancheta, sem remover nada. Sem direção e sem "pode": costuma levar menos de meio minuto.',
      pedido: 'Adaptar formato, variações, mexer em várias pranchetas. Passa por um plano, e pede o seu "pode" se for grande.',
      criar: 'A peça está vazia: o Otto define uma direção, mostra para você e monta as pranchetas depois do seu "pode".',
    },
    enviar: 'Pedir',
    atalho: 'Ctrl+Enter',
    enviando: 'Pedindo…',
    tarefasHoje: (hoje: number, porDia: number): string => `${hoje} de ${porDia} tarefas hoje`,
    /** Pelo `motivo` de GET /api/tarefas/limites. */
    semLimite: {
      limite_da_conta: (porDia: number): string => `Esta conta já pediu as ${porDia} tarefas de hoje. O limite volta amanhã.`,
      fila_cheia: (naFila: number): string => `Já há ${naFila} ${plural(naFila, { um: 'tarefa', outros: 'tarefas' })} desta conta esperando ou rodando. Espere uma terminar.`,
      limite_diario: 'Hoje não consigo começar tarefas novas. O limite volta amanhã.',
    },
  },

  estados: {
    na_fila: 'na fila',
    preparando: 'trabalhando',
    aguardando_confirmacao: 'aguardando seu "pode"',
    rodando: 'trabalhando',
    em_revisao: 'pronto para revisar',
    naoTerminou: 'não terminou',
    aceita: 'aceita',
    desfeita: 'desfeita',
    cancelada: 'cancelada',
    falhou: 'não começou',
  },

  espera: {
    naFila: 'Na fila. Começo em instantes.',
    ha: (tempo: string): string => `há ${tempo}`,
    etapas: 'Etapas',
    /** O nome de cada etapa, como coisa sendo feita. */
    etapa: {
      leitura: 'Lendo o pedido e a peça',
      direcao: 'Definindo a direção de arte',
      plano: 'Planejando',
      producao: (prancheta: string | undefined): string => (prancheta ? `Montando: ${prancheta}` : 'Fazendo as alterações'),
      conferencia: (rodada: number | undefined): string => (rodada && rodada > 1 ? 'Segunda conferência: render e verificação' : 'Conferindo: render e verificação'),
      revisao: 'Revisando a peça inteira',
      ajustes: 'Aplicando os ajustes da revisão',
      entrega: 'Entregando',
    },
    situacao: { feita: 'feita', atual: 'em andamento', 'por-vir': 'por vir' },
    podeFechar: 'Pode fechar esta aba: o trabalho continua, e a peça mostra onde ele está quando você voltar.',
    avisar: 'Avisar neste computador quando terminar',
    avisoLigado: 'Vou avisar neste computador.',
    avisoNegado: 'O navegador não deixou avisar. O título da aba muda quando eu terminar.',
    semAoVivo: 'Sem atualização ao vivo, tentando de novo. O que aparece aqui é o último estado conhecido.',
    registro: (passos: number): string => `Como o Otto está trabalhando (${passos} ${plural(passos, { um: 'passo', outros: 'passos' })})`,
    registroDepois: (passos: number): string => `Como o Otto trabalhou (${passos} ${plural(passos, { um: 'passo', outros: 'passos' })})`,
    interromper: 'Interromper',
    cancelar: 'Cancelar a tarefa',
    interrompendo: 'Interrompendo…',
    /** Linhas do registro, pelo tipo do evento. A fala do Otto (mensagem, revisão) vai como veio. */
    linha: {
      lote: (descricao: string): string => `Alterou: ${descricao}`,
      recusado: 'Uma alteração foi recusada pela validação. Refiz.',
      render: 'Olhou o render',
      renderDeDetalhe: 'Olhou um detalhe do render',
      verificacaoLimpa: 'Verificação: nada a apontar',
      verificacao: (avisos: number): string => `Verificação: ${avisos} ${plural(avisos, { um: 'aviso', outros: 'avisos' })}`,
      /** Com as pranchetas conferidas: "Feed conferido: nada a apontar", "Feed e Story conferidos: 2 avisos". */
      conferida: (pranchetas: readonly string[], avisos: number): string =>
        `${lista(pranchetas)} ${pranchetas.length === 1 ? 'conferido' : 'conferidos'}: ${avisos === 0 ? 'nada a apontar' : `${avisos} ${plural(avisos, { um: 'aviso', outros: 'avisos' })}`}`,
      imagem: { busca: 'Procurou imagem', trazida: 'Trouxe uma imagem', sujeito: 'Recortou o sujeito da foto' },
      erro: 'Um passo falhou. Tentei de novo.',
      segundaConferencia: 'Segunda conferência',
    },
  },

  /** A edição travada, dita uma vez no topo do canvas. */
  trava: {
    trabalhando: 'O Otto está trabalhando nesta peça. A edição volta quando ele terminar.',
    aguardando: 'O Otto está esperando o seu "pode" nesta peça. A edição volta quando a tarefa terminar ou for cancelada.',
    emRevisao: 'As alterações do Otto estão em revisão. Aceite ou desfaça para voltar a editar.',
    aceitarEEditar: 'Aceitar e editar',
    desfazerEmRevisao: 'As alterações do Otto estão em revisão. Aceite ou desfaça tudo.',
  },

  pode: {
    pergunta: 'Esta é a direção. Posso produzir?',
    perguntaSemDirecao: 'Este é o plano. Posso seguir?',
    semDirecao: 'Não consegui fechar uma direção de arte. Posso seguir só com o pedido?',
    /** Por que o "pode" foi pedido, pelo `motivo`. */
    motivos: {
      varias_pranchetas: 'Peço o seu "pode" porque a tarefa mexe em mais de uma prancheta.',
      remocao: 'Peço o seu "pode" porque a tarefa remove coisas que já existem.',
      sem_direcao: 'Peço o seu "pode" porque não consegui fechar uma direção de arte.',
    } as Readonly<Record<string, string>>,
    conceito: 'Conceito',
    assinatura: 'Assinatura',
    paleta: 'Paleta',
    papeis: { dominante: 'dominante', apoio: 'apoio', acento: 'acento', texto: 'texto' } as Readonly<Record<string, string>>,
    tipografia: 'Tipografia',
    fontes: (titulo: string, texto: string): string => `${titulo} no título · ${texto} no texto`,
    imagem: 'Imagem',
    plano: 'Plano',
    vouCriar: 'Vou criar',
    formato: (nome: string, largura: number, altura: number): string => `${nome} ${largura}×${altura}`,
    vouAlterar: 'Vou alterar',
    vouRemover: 'Vou remover',
    remover: (nome: string, prancheta: string, motivo: string): string => `${nome} (${prancheta}): ${motivo}`,
    alterar: (nome: string, oQue: string): string => `${nome}: ${oQue}`,
    aprovar: 'Pode',
    ajustar: 'Ajustar a direção',
    oQueMuda: 'O que muda?',
    mandarAjuste: 'Refazer com este ajuste',
    desistirDoAjuste: 'Voltar',
    cancelar: 'Cancelar a tarefa',
    semPrazo: 'Sem pressa: eu espero o seu "pode", e nada muda na peça até lá.',
  },

  revisao: {
    titulo: 'Alterações do Otto',
    levou: (tempo: string): string => `levou ${tempo}`,
    /** A frase do sistema quando o trabalho parou sem entregar, pelo `fim` (ou pelo código do erro). */
    naoTerminou: {
      cancelada: 'Você interrompeu. O que eu já tinha feito está aqui para revisar.',
      interrompida: 'Parei no meio por uma falha do nosso lado. O que eu já tinha feito está aqui.',
      erro: 'Parei no meio: perdi a conexão com o serviço que uso para trabalhar. O que eu já tinha feito está aqui.',
      limite_de_passos: 'Parei no limite de conferências. O que eu já tinha feito está aqui.',
      limite_de_tempo: 'Parei no limite de tempo da tarefa. O que eu já tinha feito está aqui.',
      limite_de_custo: 'Parei no limite desta tarefa. O que eu já tinha feito está aqui.',
      limite_diario: 'Bati no limite de hoje no meio da tarefa. O que eu já tinha feito está aqui.',
    } as Readonly<Record<string, string>>,
    semConferencia: 'A última versão não foi conferida pelo render.',
    pendencias: (n: number): string => `Pendências (${n})`,
    semPendencia: 'Nenhuma pendência. Conferi o render e a verificação não acusou nada.',
    semPendenciaSemConferir: 'Nenhuma pendência declarada.',
    ver: 'ver',
    verPendencia: (frase: string): string => `Ver no canvas: ${frase}`,
    dispensar: 'dispensar',
    dispensarPendencia: (frase: string): string => `Dispensar: ${frase}`,
    pranchetas: 'Pranchetas novas',
    prancheta: (nome: string, largura: number, altura: number, camadas: number): string => `${nome} ${largura}×${altura} · ${camadas} ${plural(camadas, { um: 'camada', outros: 'camadas' })}`,
    verPrancheta: (nome: string): string => `Ver ${nome}`,
    descartar: 'descartar',
    descartarPrancheta: (nome: string): string => `Descartar ${nome}`,
    confirmarDescarte: (nome: string): string => `Descartar ${nome}? As outras pranchetas ficam.`,
    aceitar: 'Aceitar',
    aceitando: 'Aceitando…',
    desfazer: 'Desfazer tudo',
    desfazendo: 'Desfazendo…',
    verOAntes: 'Segure para ver o antes',
    seloDoAntes: 'Antes das alterações do Otto',
    tentarDeNovo: 'Tentar de novo',
    avisoDeTentarDeNovo: 'Tentar de novo recomeça do início e desfaz o que foi feito até aqui.',
    legenda: 'alterada pelo Otto',
    quaseLa: 'Quase lá? Diga o que muda',
    aceitarEAjustar: 'Aceitar e pedir ajuste',
  },

  resultado: {
    semAlteracao: 'Não alterei nada.',
    aceita: 'Alterações aceitas.',
    desfeita: 'Voltei a peça para antes desta tarefa.',
    cancelada: 'Tarefa cancelada. Nada mudou na peça.',
    /** Falhou antes de alterar qualquer coisa, pelo código do erro. */
    falhou: {
      padrao: 'Não consegui começar. Nada foi alterado na peça.',
      limite_diario: 'Hoje não consigo começar tarefas novas. O limite volta amanhã. Nada foi alterado na peça.',
      interrompida: 'Parei antes de começar, por uma falha do nosso lado. Nada foi alterado na peça.',
    } as Readonly<Record<string, string>>,
    tentarDeNovo: 'Tentar de novo',
    voltarParaAntes: 'Voltar para antes desta tarefa',
    comEsteBriefing: 'Nova peça com este briefing',
    comEdicoesDepois: (edicoes: number): string =>
      `Voltar para antes desta tarefa desfaz também ${edicoes} ${plural(edicoes, { um: 'alteração sua feita', outros: 'alterações suas feitas' })} depois.`,
    voltarMesmoAssim: 'Voltar mesmo assim',
    fechar: 'Fechar',
  },

  pendencia: {
    titulo: (n: number): string => `Pendências da peça (${n})`,
    nenhuma: 'Nenhuma pendência.',
    /** A frase do SISTEMA para cada tipo de pendência. As que o Otto declarou (origem "otto") vão com o texto dele. */
    doTipo: {
      sem_conferencia: (prancheta: string | undefined): string => (prancheta ? `A última versão de ${prancheta} não foi conferida pelo render.` : 'A última versão não foi conferida pelo render.'),
      resolucao_da_imagem: 'Há foto ampliada além do tamanho original: pode perder nitidez na saída.',
      imagem_de_banco: 'Há foto de banco no lugar da foto do cliente.',
      marca_de_terceiro: 'Há marca de terceiro visível numa foto.',
      texto_escrito_pelo_otto: 'Há texto que o Otto escreveu, não o cliente. Confira antes de publicar.',
      nao_consigo: 'O Otto disse que não consegue fazer parte do pedido.',
      fora_do_ajuste: 'O pedido não cabe num ajuste rápido (uma prancheta, sem remover nada). Peça como "pedido maior".',
      limite_de_conferencias: 'O Otto parou no limite de conferências.',
      limite_de_passos: 'O Otto parou no limite de passos da tarefa.',
      limite_de_custo: 'O Otto parou no limite desta tarefa.',
      limite_de_tempo: 'O Otto parou no limite de tempo da tarefa.',
      interrompida: 'A tarefa foi interrompida antes do fim.',
      erro: 'Um passo da tarefa falhou.',
      outro: 'Há um ponto para você olhar.',
    } as Readonly<Record<string, string | ((prancheta: string | undefined) => string)>>,
    /** Aviso da verificação automática, pela regra. */
    daRegra: {
      'texto-transbordando': 'texto maior que a caixa',
      'texto-pequeno': 'texto pequeno demais para ler no celular',
      'textos-sobrepostos': 'textos sobrepostos',
      'texto-descentralizado': 'texto fora do centro do que o contém',
      'fora-da-prancheta': 'camada fora da prancheta',
      'zona-segura': 'texto na zona coberta pela interface',
      'resolucao-baixa': 'foto ampliada além do original',
      'fonte-ausente': 'fonte que a biblioteca não tem',
      'camada-invisivel': 'camada que não aparece',
      'prancheta-vazia': 'prancheta vazia',
      'faixa-vazia': 'faixa vazia na prancheta',
      'quase-alinhado': 'bordas quase alinhadas',
      'quebra-de-linha': 'quebra de linha ruim',
      'botao-sem-contraste': 'botão com pouco contraste',
      contraste: 'pouco contraste',
      encostado: 'camada encostada em outra',
      hierarquia: 'hierarquia fraca entre os textos',
      margem: 'margem irregular',
      ritmo: 'espaçamento irregular',
      'valor-solto': 'cor ou medida fora da identidade',
    } as Readonly<Record<string, string>>,
    daVerificacao: (oQue: string, onde: string | undefined): string => (onde ? `A verificação apontou ${oQue} em ${onde}.` : `A verificação apontou ${oQue}.`),
    regraSemNome: 'um ponto',
  },

  /** O título da aba, para quem saiu. */
  aba: {
    trabalhando: (tempo: string, peca: string): string => `Otto trabalhando (${tempo}) · ${peca}`,
    naFila: (peca: string): string => `Otto na fila · ${peca}`,
    aguardando: (peca: string): string => `● Aguardando seu "pode" · ${peca}`,
    pronto: (peca: string): string => `● Pronto para revisar · ${peca}`,
    naoTerminou: (peca: string): string => `● O Otto parou no meio · ${peca}`,
  },

  /** A notificação do navegador, para quem não está olhando. */
  aviso: {
    aguardando: (peca: string): string => `${peca}: preciso do seu "pode"`,
    pronto: (peca: string): string => `${peca}: pronto para revisar`,
    naoTerminou: (peca: string): string => `${peca}: parei no meio`,
  },
} as const;
