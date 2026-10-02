// Esforço criativo (Creative Effort): quanto o agente explora, questiona, desenvolve e refina antes de
// dar a peça por concluída. É uma escala de PROFUNDIDADE DE PROCESSO, no espírito dos níveis de esforço
// dos modelos de IA. Não é tipo de peça, segmento, objetivo, qualidade mínima nem estilo: o briefing e a
// direção definem o problema; o esforço define a profundidade da solução. Uma peça simples pode receber
// esforço máximo; uma solução minimalista pode ser ICONIC.
//
// Os critérios do prompt (conceito, distintividade, hierarquia, tensão, escala, profundidade, fotografia,
// transformação, tipografia, assinatura, originalidade, subtração) continuam os mesmos em todo nível.
// O nível diz quanto e com que profundidade eles são explorados. Nada aqui escolhe estilo.
//
// Sem nível informado, nada muda: o prompt sai sem a seção de esforço e os limites são os de sempre.
// Não confundir com o esforço de raciocínio do modelo (Raciocinio, em portas.ts).
//
// Veio de poc/src/servidor/esforco.ts (rodada 8). O que entrou na migração: as três opções da tela
// (OPCOES_DE_CUIDADO), que caem em três dos sete níveis. Nenhum nível foi medido ainda.
import { z } from 'zod';

export const ESFORCOS_CRIATIVOS = ['SIMPLE', 'STANDARD', 'REFINED', 'CREATIVE', 'ADVANCED', 'CONCEPTUAL', 'ICONIC'] as const;
export type EsforcoCriativo = (typeof ESFORCOS_CRIATIVOS)[number];
export const EsforcoCriativoSchema = z.enum(ESFORCOS_CRIATIVOS);

/** Aceita o nome em qualquer caixa; qualquer outra coisa (inclusive ausência) devolve undefined. */
export function lerEsforco(valor: unknown): EsforcoCriativo | undefined {
  if (typeof valor !== 'string') return undefined;
  const r = EsforcoCriativoSchema.safeParse(valor.trim().toUpperCase());
  return r.success ? r.data : undefined;
}

/** Faixa de esforço de um fator: 0 mínima · 1 moderada · 2 alta · 3 máxima. */
export type Faixa = 0 | 1 | 2 | 3;

export const FATORES = [
  'interpretacao',
  'exploracaoDeConceitos',
  'alternativas',
  'direcaoVisual',
  'composicao',
  'referencias',
  'critica',
  'refinamento',
  'detalhe',
  'abandonarPrimeiraSolucao',
  'originalidade',
  'controleDeQualidade',
] as const;
export type Fator = (typeof FATORES)[number];

/**
 * O que cada faixa pede de cada fator. É texto de processo (quanto explorar, comparar, criticar, refinar),
 * nunca de estilo. As faixas são orientação: o agente decide onde este briefing precisa mais.
 */
export const FAIXAS: Record<Fator, { nome: string; faixas: [string, string, string, string] }> = {
  interpretacao: {
    nome: 'Interpretação do briefing',
    faixas: [
      'leia o briefing, identifique o que a peça precisa comunicar e siga',
      'identifique o que a peça comunica, para quem, e qual campo é o gancho, antes de decidir qualquer coisa',
      'vá além do literal: o que o público precisa sentir, o que a marca já decidiu, o que o briefing implica sem dizer',
      'interprete em profundidade: a tensão entre o que o briefing pede e o que o público precisa ver, o que a marca já decidiu, o que seria óbvio demais; escreva essa leitura antes de propor',
    ],
  },
  exploracaoDeConceitos: {
    nome: 'Exploração de conceitos',
    faixas: [
      'um conceito coerente basta; não é preciso comparar alternativas',
      'um conceito claro, em uma frase, testado contra "isso serviria para qualquer marca?"',
      'considere ao menos 3 direções (segura, expressiva, autoral) antes de escolher',
      'explore vários conceitos, inclusive os que descartam a leitura óbvia; escolha o mais forte, não o primeiro que funciona',
    ],
  },
  alternativas: {
    nome: 'Alternativas de composição',
    faixas: [
      'execute a composição mais direta que cumpre a hierarquia',
      'compare duas composições antes de escolher',
      'esboce mentalmente 3 composições diferentes para o conceito escolhido',
      'esboce várias composições, variando herói e arquétipo, e fique com a que sobrevive melhor ao thumbnail',
    ],
  },
  direcaoVisual: {
    nome: 'Direção visual',
    faixas: [
      'aplique a direção recebida (ou a identidade do briefing) como está',
      'traduza cada item da direção em decisões concretas de cor, tipografia, foto e forma',
      'desenvolva a direção: defina como cor, tipografia, imagem, forma e espaço se relacionam para servir ao conceito',
      'construa uma linguagem: as decisões formam um sistema coerente, reconhecível numa outra peça da mesma série',
    ],
  },
  composicao: {
    nome: 'Exploração compositiva',
    faixas: [
      'hierarquia e grade corretas',
      'hierarquia clara e uma tensão principal escolhida',
      'trabalhe escala, tensão, profundidade (3 planos) e enquadramento até a composição ter uma decisão que um template não daria',
      'leve escala, tensão, profundidade e enquadramento ao limite razoável para o briefing; a composição precisa ser reconhecível sem o logo',
    ],
  },
  referencias: {
    nome: 'Pesquisa e seleção de referências',
    faixas: [
      'use as imagens do cliente ou a primeira busca que cumpre o briefing',
      'compare os resultados da busca e escolha pela composição, não só pelo assunto',
      'faça mais de uma busca e escolha a foto pelos atributos compositivos: silhueta, luz, espaço negativo, recorte',
      'pesquise em profundidade (buscas, fontes, texturas) e descarte o tecnicamente correto sem personalidade; o material precisa ter potencial de transformação',
    ],
  },
  critica: {
    nome: 'Crítica interna',
    faixas: [
      'confira erros: transbordo, contraste, texto do cliente, margem',
      'além dos erros, responda: qual é o herói, o que se vê primeiro, parece template?',
      'faça a crítica completa (as 12 perguntas) antes de entregar',
      'crítica estrutural e depois estética, em passes separados; questione o conceito antes de aceitar a composição',
    ],
  },
  refinamento: {
    nome: 'Ciclos de refinamento',
    faixas: [
      'corrija o que a verificação apontar; um ciclo',
      'um ciclo de refinamento depois da primeira versão',
      'refine até a crítica não apontar problema estrutural, com um passe de acabamento separado',
      'refine até a peça parecer acabada, não apenas completa; segunda crítica depois do refinamento',
    ],
  },
  detalhe: {
    nome: 'Atenção a detalhes',
    faixas: [
      'as regras de detalhe (grade, tipografia, cor) cumpridas',
      'regras de detalhe cumpridas e conferidas em recorte 1:1 onde há texto pequeno',
      'acabamento como passe próprio: alinhamento pela tinta, quebras de linha, entrelinha, máscaras, coerência de luz',
      'cada detalhe decidido, não herdado: kerning do título, ritmo dos espaços, borda de máscara, um detalhe que recompensa a segunda olhada',
    ],
  },
  abandonarPrimeiraSolucao: {
    nome: 'Disposição para abandonar a primeira solução',
    faixas: [
      'fique com a primeira solução coerente',
      'troque a primeira solução se ela parecer obviamente genérica',
      'trate a primeira solução como hipótese; abandone se outra for mais forte',
      'assuma que a primeira solução não é a melhor; só a mantenha se sobreviver à comparação com as outras',
    ],
  },
  originalidade: {
    nome: 'Originalidade buscada',
    faixas: [
      'coerência; não há exigência de surpresa',
      'evite o obviamente genérico',
      'pelo menos uma decisão visual que um template não daria',
      'uma solução que só faz sentido para este briefing, com assinatura visual forte, identificável sem o logo',
    ],
  },
  controleDeQualidade: {
    nome: 'Controle de qualidade',
    faixas: [
      'verificar sem erro e um render por prancheta',
      'verificar sem erro, render geral e recorte do texto principal',
      'verificar sem erro, render geral e recortes de detalhe; teste de thumbnail',
      'controle rigoroso: verificar, render geral, recortes 1:1, thumbnail, teste de memória e de template, em todos os formatos',
    ],
  },
};

/** Limites do ciclo (ciclo.ts) que acompanham o nível. Sem nível, valem os de sempre. */
export interface MecanicaDoEsforco {
  /** Rodadas do revisor independente antes de aceitar a entrega. */
  rodadasDeRevisao: number;
  /** Chamadas a "verificar" antes de o sistema mandar entregar. */
  tetoDeVoltas: number;
  /** Chamadas ao modelo numa tarefa. */
  maximoDeChamadas: number;
}

export const MECANICA_PADRAO: MecanicaDoEsforco = { rodadasDeRevisao: 1, tetoDeVoltas: 6, maximoDeChamadas: 60 };

export interface NivelDeEsforco {
  ordem: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  /** Nome que o designer lê. */
  rotulo: string;
  /** Uma ou duas palavras: "Resolve.", "Explora possibilidades." */
  titulo: string;
  definicao: string;
  /** Fluxo esperado, do briefing à entrega. Exemplo conceitual, não pipeline separado. */
  processo: string[];
  fatores: Record<Fator, Faixa>;
  /** Como ler os Critérios de peça autoral (CRITERIOS_DE_PORTFOLIO) neste nível. */
  criteriosAutorais: string;
  /** Uma linha para o diretor de arte (direcao.ts), que define a direção antes da produção. */
  paraODiretor: string;
  mecanica: MecanicaDoEsforco;
}

const fatores = (...v: Faixa[]): Record<Fator, Faixa> => Object.fromEntries(FATORES.map((f, i) => [f, v[i] ?? 0])) as Record<Fator, Faixa>;

/**
 * Os sete níveis. Cada fator só sobe (ou fica) de um nível para o seguinte; o teste garante.
 * Ordem dos fatores em `fatores(...)`: a de FATORES.
 */
export const NIVEIS_DE_ESFORCO_CRIATIVO: Record<EsforcoCriativo, NivelDeEsforco> = {
  SIMPLE: {
    ordem: 1,
    rotulo: 'Simples',
    titulo: 'Resolve.',
    definicao: 'Execução direta e objetiva. Pouca exploração. Prioriza chegar rapidamente a uma solução coerente.',
    processo: ['briefing', 'interpretação', 'solução', 'execução', 'verificação básica'],
    //                 interp conc altern dir comp ref crit refin det aband orig qc
    fatores: fatores(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0),
    criteriosAutorais:
      'cumpra os fundamentais: conceito antes de decoração (nada sem função), hierarquia, evitar estética genérica de IA, subtração e thumbnail. Distintividade, tensão, escala, profundidade, transformação da foto, tipografia como forma, assinatura, memória e teste de portfólio não são exigência neste nível: entram só quando vêm de graça com a solução direta.',
    paraODiretor: 'Direção direta: a leitura da marca e um conceito coerente bastam. Não é preciso buscar a ideia menos previsível nem uma assinatura forte.',
    mecanica: { rodadasDeRevisao: 1, tetoDeVoltas: 4, maximoDeChamadas: 40 },
  },
  STANDARD: {
    ordem: 2,
    rotulo: 'Padrão',
    titulo: 'Resolve bem.',
    definicao: 'Maior cuidado com as decisões visuais fundamentais. Evita soluções obviamente genéricas ou mal executadas.',
    processo: ['briefing', 'interpretação', 'direção visual', 'execução', 'verificação'],
    fatores: fatores(1, 1, 0, 1, 1, 1, 1, 0, 1, 1, 1, 1),
    criteriosAutorais:
      'os fundamentais (conceito antes de decoração, hierarquia, estética genérica de IA, subtração, thumbnail) mais distintividade no sentido mínimo (não parecer template) e foto escolhida, não só encontrada. Os demais são desejáveis, não exigidos.',
    paraODiretor: 'Direção cuidadosa nas decisões fundamentais (cor, tipografia, foto, hierarquia), sem exigir ideia inesperada. Evite só o obviamente genérico.',
    mecanica: { rodadasDeRevisao: 1, tetoDeVoltas: 5, maximoDeChamadas: 50 },
  },
  REFINED: {
    ordem: 3,
    rotulo: 'Refinado',
    titulo: 'Refina a solução.',
    definicao: 'Maior atenção a composição, hierarquia, tipografia, imagem, integração e acabamento.',
    processo: ['briefing', 'interpretação', 'direção visual', 'execução', 'acabamento', 'verificação'],
    fatores: fatores(1, 1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 2),
    criteriosAutorais:
      'os fundamentais mais distintividade, profundidade e integração, fotografia como matéria-prima e tipografia cuidada. Assinatura e teste de portfólio são desejáveis; o acabamento é exigido.',
    paraODiretor: 'Direção que o designer consiga executar com acabamento: decisões concretas de composição, tipografia, imagem e integração. Conceito claro; assinatura desejável.',
    mecanica: { rodadasDeRevisao: 1, tetoDeVoltas: 6, maximoDeChamadas: 60 },
  },
  CREATIVE: {
    ordem: 4,
    rotulo: 'Criativo',
    titulo: 'Explora possibilidades.',
    definicao: 'Antes de executar, considera diferentes caminhos criativos e procura uma solução menos previsível.',
    processo: ['briefing', 'interpretação', 'exploração de possibilidades', 'seleção de direção', 'execução', 'crítica', 'refinamento'],
    fatores: fatores(1, 2, 2, 1, 2, 2, 2, 1, 2, 2, 2, 2),
    criteriosAutorais: 'todos se aplicam em intensidade média. Distintividade, tensão visual e assinatura são exigidos; o teste de portfólio orienta a crítica.',
    paraODiretor: 'Considere mais de um caminho antes de fechar o conceito e prefira o menos previsível que ainda sirva ao briefing. A assinatura é exigida.',
    mecanica: { rodadasDeRevisao: 1, tetoDeVoltas: 6, maximoDeChamadas: 60 },
  },
  ADVANCED: {
    ordem: 5,
    rotulo: 'Avançado',
    titulo: 'Desenvolve uma direção.',
    definicao: 'Investe significativamente na construção da ideia visual, nas relações entre os elementos e na qualidade da execução.',
    processo: ['briefing', 'interpretação', 'exploração de possibilidades', 'desenvolvimento da direção', 'composição', 'execução', 'crítica', 'refinamento', 'controle'],
    fatores: fatores(2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2),
    criteriosAutorais: 'todos são exigidos, inclusive o teste de portfólio.',
    paraODiretor: 'Desenvolva a direção: como cor, tipografia, imagem, forma e espaço se relacionam para servir ao conceito. Vá além do literal do briefing.',
    mecanica: { rodadasDeRevisao: 1, tetoDeVoltas: 7, maximoDeChamadas: 70 },
  },
  CONCEPTUAL: {
    ordem: 6,
    rotulo: 'Conceitual',
    titulo: 'Constrói uma linguagem.',
    definicao: 'A solução nasce de um conceito visual desenvolvido e coerente, com maior exploração, integração e personalidade.',
    processo: [
      'briefing',
      'interpretação profunda',
      'exploração conceitual',
      'desenvolvimento de direções',
      'seleção',
      'direção visual',
      'composição',
      'execução',
      'crítica estrutural',
      'refinamento',
      'controle final',
    ],
    fatores: fatores(3, 3, 2, 3, 2, 2, 2, 2, 2, 3, 2, 2),
    criteriosAutorais: 'todos são exigidos com rigor. A assinatura precisa ser forte e o teste de portfólio é obrigatório.',
    paraODiretor: 'Explore vários conceitos antes de escolher e construa uma linguagem: a direção precisa se reconhecer numa outra peça da mesma série. Assinatura forte, uma só.',
    mecanica: { rodadasDeRevisao: 1, tetoDeVoltas: 8, maximoDeChamadas: 80 },
  },
  ICONIC: {
    ordem: 7,
    rotulo: 'Icônico',
    titulo: 'Busca uma solução excepcional.',
    definicao:
      'Máxima profundidade criativa disponível. Exploração de conceitos, referências, composição, linguagem visual, crítica e refinamento levados ao limite razoável para o briefing. Não significa peça complexa: uma solução minimalista pode ser ICONIC. O esforço está no processo e na qualidade das decisões, não na quantidade de elementos.',
    processo: [
      'briefing',
      'interpretação profunda',
      'exploração de conceitos',
      'exploração de referências',
      'múltiplas possibilidades',
      'desenvolvimento da direção',
      'execução',
      'crítica estrutural',
      'crítica estética',
      'refinamento',
      'segunda crítica',
      'refinamento final',
      'controle rigoroso',
    ],
    fatores: fatores(3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3),
    criteriosAutorais: 'todos ao limite razoável para o briefing. A peça precisa passar no thumbnail, no teste de memória e no teste de portfólio sem ressalva.',
    paraODiretor:
      'Direção ao limite: leia a marca em profundidade, considere vários conceitos, descarte a leitura óbvia e só entregue o conceito e a assinatura que sobrevivem à pergunta "isso serviria para qualquer marca?". A direção não pede mais elementos por isso: mais esforço é decisão melhor, não peça mais cheia.',
    mecanica: { rodadasDeRevisao: 2, tetoDeVoltas: 10, maximoDeChamadas: 90 },
  },
};

export function mecanicaDoEsforco(esforco?: EsforcoCriativo): MecanicaDoEsforco {
  return esforco ? NIVEIS_DE_ESFORCO_CRIATIVO[esforco].mecanica : MECANICA_PADRAO;
}

const NAO_DETERMINA = `Ele NÃO determina:
- estilo;
- segmento;
- formato;
- objetivo;
- estética;
- quantidade de elementos.`;

/** Regra que vale em qualquer nível e pesa mais nos altos. Vai para o agente e para o revisor. */
export const REGRA_DE_NAO_COMPLEXIDADE = `## Maior esforço não significa adicionar mais elementos
Em qualquer nível, e ainda mais nos altos, você não:
- adiciona efeitos para parecer sofisticado;
- cria complexidade artificial;
- usa uma técnica só porque o nível é alto;
- transforma uma solução simples em uma complicada;
- adiciona conceitos concorrentes;
- prejudica a clareza em nome da originalidade.

O nível alto aumenta a qualidade das decisões, não a quantidade de elementos. Uma peça forte contém poucas ideias visuais, e recurso técnico não é conceito. Uma solução minimalista pode ser ICONIC.`;

/** O que não afrouxa em nível nenhum. O agente cumpre; o revisor cobra. */
export const FUNDAMENTOS_EM_TODO_NIVEL = `Valem em todos os níveis, sem ponderação:
- as regras de detalhe (grade, tipografia, texto do cliente literal, imagem, cor, story, entre formatos);
- nenhum elemento sem função;
- coerência visual entre os elementos e entre os formatos;
- hierarquia com um herói inequívoco e legibilidade do que precisa ser lido;
- nada de estética genérica de IA por padrão;
- renderizar e verificar antes de entregar, e entregar sem erro do verificador.`;

const linhasDosFatores = (nivel: NivelDeEsforco, quais: readonly Fator[] = FATORES) => quais.map((f) => `- ${FAIXAS[f].nome}: ${FAIXAS[f].faixas[nivel.fatores[f]]}.`).join('\n');

/** Seção do prompt do agente. Vai no bloco da tarefa, depois do prefixo estável (prompt/sistema.ts). */
export function secaoDeEsforcoCriativo(esforco: EsforcoCriativo): string {
  const n = NIVEIS_DE_ESFORCO_CRIATIVO[esforco];
  return `# CREATIVE EFFORT (esforço criativo)

Você recebeu um nível de esforço criativo: ${esforco} (${n.ordem} de 7). ${n.titulo}

O nível determina a profundidade do processo que deve ser aplicado à solução.

${NAO_DETERMINA}

Ele determina quanto você deve explorar, questionar, desenvolver e refinar antes de considerar a solução concluída.

Níveis mais altos exigem maior profundidade de pensamento e validação, não necessariamente maior complexidade visual.

O briefing e a direção de arte continuam mandando: eles definem o problema; o esforço define a profundidade da solução. Onde este prompt pede exploração, alternativas, crítica, acabamento e refinamento ("Princípio central", "Originalidade", "Acabamento", "Crítica antes de entregar" e os Critérios de peça autoral), a intensidade é a deste nível, descrita abaixo.

## Nível ${esforco}: ${n.titulo}
${n.definicao}

Processo esperado:
${n.processo.join(' → ')}

Onde investir o esforço (faixas, não obrigações; você decide onde este briefing precisa mais):
${linhasDosFatores(n)}

Critérios de peça autoral neste nível: ${n.criteriosAutorais}

${REGRA_DE_NAO_COMPLEXIDADE}

${FUNDAMENTOS_EM_TODO_NIVEL}`;
}

/** Fatores que o revisor consegue julgar pelo render: os de processo interno (crítica, ciclos) ficam de fora. */
const FATORES_VISIVEIS_AO_REVISOR: readonly Fator[] = ['exploracaoDeConceitos', 'direcaoVisual', 'composicao', 'referencias', 'detalhe', 'originalidade'];

/** Seção do prompt do revisor independente. Entra antes das regras de detalhe (prompt/revisor.ts). */
export function secaoDeEsforcoParaORevisor(esforco: EsforcoCriativo): string {
  const n = NIVEIS_DE_ESFORCO_CRIATIVO[esforco];
  return `# CREATIVE EFFORT (esforço criativo) DA PEÇA

A peça foi criada com esforço criativo ${esforco} (${n.ordem} de 7): ${n.titulo} ${n.definicao}

O nível mede a profundidade do processo pedida ao designer, não o tipo de peça, o segmento, o objetivo, a qualidade mínima nem um estilo.

Sua pergunta principal passa a ser:

"Para o nível de esforço solicitado, esta peça atingiu a profundidade esperada?"

e não "esta peça é boa ou ruim?".

O nível não muda o que é obrigatório. ${FUNDAMENTOS_EM_TODO_NIVEL}

O nível muda a expectativa de exploração, originalidade e profundidade. Neste nível, espere do designer:
${linhasDosFatores(n, FATORES_VISIVEIS_AO_REVISOR)}

Critérios de peça autoral neste nível: ${n.criteriosAutorais}

Não cobre de uma peça ${esforco} a profundidade de um nível acima. Uma mudança só entra na sua lista se for erro fundamental ou se faltar a profundidade deste nível. Comece a revisão com uma linha: se a peça atingiu ou não a profundidade esperada para ${esforco}, e por quê.

${REGRA_DE_NAO_COMPLEXIDADE}`;
}

/** Nota curta para o diretor de arte, na mensagem do usuário (a direção nasce antes da produção). */
export function notaDeEsforcoParaODiretor(esforco: EsforcoCriativo): string {
  const n = NIVEIS_DE_ESFORCO_CRIATIVO[esforco];
  return `Esforço criativo pedido para esta peça: ${esforco} (${n.ordem} de 7). ${n.titulo} ${n.paraODiretor} O nível é profundidade de processo, não estilo: o briefing e a marca continuam mandando, e mais esforço nunca significa mais elementos.`;
}

/**
 * As três opções que o designer vê (docs/mvp/experiencia.md, 3.4). Os sete níveis ficam no código.
 * O mapeamento é PROPOSTA: nenhum nível foi medido. O que sustenta a escolha é a mecânica de cada nível
 * (voltas, chamadas) e o que a seção do prompt pede; a diferença de resultado entre eles ainda é hipótese.
 * `raciocinio` é o esforço de raciocínio do modelo no ciclo de produção; direção e revisão vão sempre em alto.
 */
export const OPCOES_DE_CUIDADO = [
  { opcao: 'direto', esforco: 'STANDARD', raciocinio: 'baixo', padrao: false },
  { opcao: 'cuidadoso', esforco: 'REFINED', raciocinio: 'medio', padrao: true },
  { opcao: 'autoral', esforco: 'CONCEPTUAL', raciocinio: 'medio', padrao: false },
] as const satisfies readonly { opcao: string; esforco: EsforcoCriativo; raciocinio: 'baixo' | 'medio' | 'alto'; padrao: boolean }[];
export type OpcaoDeCuidado = (typeof OPCOES_DE_CUIDADO)[number]['opcao'];

/** Nível de esforço da opção da tela. Opção desconhecida ou ausente: undefined (quem chama decide se é erro). */
export function esforcoDaOpcao(opcao: unknown): EsforcoCriativo | undefined {
  return OPCOES_DE_CUIDADO.find((o) => o.opcao === opcao)?.esforco;
}
