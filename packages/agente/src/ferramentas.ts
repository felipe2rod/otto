// As ferramentas do agente, como o modelo as vê: nome, quando usar, exemplo de lote bom e de erro corrigido.
// O esquema das operações é de @otto/documento (dono: especialista-grafico); a forma de apresentá-lo é daqui.
// São o catálogo de operações mais ler, ver, verificar, imagens e entregar. Não existe operação só do agente
// (ADR 029, item 1).
//
// O que o ambiente não oferece não é anunciado (banco de imagens, recorte de sujeito, texturas, catálogo de fontes).
// A ordem é fixa: a lista de ferramentas faz parte do prefixo que o cache de prompt guarda.
import { Lote } from '@otto/documento';
import { z } from 'zod';
import { TIPOS_DE_PENDENCIA } from './contrato';
import type { DescricaoDeFerramenta } from './portas';
import type { Capacidades } from './prompt/repertorio';

/** As operações do catálogo, pelo nome. Um teste compara com o esquema de @otto/documento: se o catálogo mudar, quebra aqui. */
export const OPERACOES_DO_CATALOGO = [
  'criarPrancheta',
  'duplicarPrancheta',
  'alterarPrancheta',
  'removerPrancheta',
  'criarNo',
  'agrupar',
  'desagrupar',
  'alterar',
  'recolorir',
  'mover',
  'reordenar',
  'duplicar',
  'transferir',
  'remover',
  'alinhar',
  'distribuir',
  'definirEstiloDeTexto',
  'aplicarEstiloDeTexto',
  'definirToken',
] as const;

function esquemaCompletoDoLote(): Record<string, unknown> {
  const j = z.toJSONSchema(Lote, { io: 'input', unrepresentable: 'any' }) as Record<string, unknown>;
  delete j.$schema;
  return { ...j, properties: { ...(j.properties as object), simular: { type: 'boolean', description: 'true: testa o lote sem gravar' } } };
}

/** Só o nome de cada operação. A sintaxe está nas receitas do prompt, e o erro de validação volta legível. */
function esquemaCompactoDoLote(): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      descricao: { type: 'string', description: 'o que este lote faz, em uma frase' },
      operacoes: {
        type: 'array',
        minItems: 1,
        items: { type: 'object', properties: { op: { type: 'string', enum: [...OPERACOES_DO_CATALOGO] } }, required: ['op'] },
      },
    },
    required: ['descricao', 'operacoes'],
  };
}

const DESCRICAO_DE_APLICAR = `Aplica um lote de operações do catálogo. É uma transação: ou entra tudo, ou nada entra e volta o erro com o índice da operação e o campo, para você corrigir e mandar de novo.
Quando usar: toda mudança no documento. Um lote por bloco coerente (tokens e prancheta; fundo e foto; tipografia; acabamento), com a descrição dizendo o que ele faz.
"simular": true testa sem gravar; use quando o lote é grande e você tem dúvida da sintaxe.
Exemplo de lote: {"descricao":"Título e subtítulo do Feed","operacoes":[{"op":"criarNo","prancheta":"Feed","no":{"tipo":"texto","nome":"Título","x":72,"y":640,"largura":936,"altura":340,"conteudo":"Jazz na Praça","fonte":"Anton","tamanho":180,"entrelinha":0.9,"cor":"token:texto"}},{"op":"criarNo","prancheta":"Feed","no":{"tipo":"texto","nome":"Subtítulo","x":72,"y":1000,"largura":700,"altura":120,"conteudo":"3 noites, 9 shows","fonte":"IBM Plex Sans","peso":500,"tamanho":36,"entrelinha":1.35,"cor":"token:texto"}},{"op":"distribuir","alvos":["Feed/Título","Feed/Subtítulo"],"espaco":48}]}
Exemplo de erro: "operação 1 (criarNo) em "Feed", campo no.peso: valor inválido. Nada do lote foi aplicado." → o peso só aceita 300, 400, 500, 600 ou 700: corrija o campo da operação 1 e mande o lote inteiro de novo.`;

const DESCRICAO_DE_APLICAR_NO_AJUSTE = `Aplica um lote de operações do catálogo. É uma transação: ou entra tudo, ou nada entra e volta o erro com o índice da operação e o campo. Quando usar: para fazer o ajuste pedido. Depois de aplicar, o sistema roda a verificação e devolve o render da prancheta na mesma resposta.
Operações mais comuns num ajuste: {"op":"alterar","alvo":"Feed/Título","props":{"cor":"token:acento","tamanho":140}} · {"op":"mover","alvo":"Feed/Logo","x":72,"y":72} · {"op":"alinhar","alvos":["Feed/Botão","Feed/Chamada"],"borda":"centro-vertical"} · {"op":"distribuir","alvos":["Feed/Título","Feed/Subtítulo"],"espaco":48} · {"op":"reordenar","alvo":"Feed/Selo","posicao":"frente"} · {"op":"recolorir","alvo":"Feed/Logo","cores":{"*":"#FFFFFF"}} · {"op":"definirToken","nome":"acento","valor":"#1F5FBF"}.
Exemplo de lote: {"descricao":"Título em azul e maior","operacoes":[{"op":"alterar","alvo":"Feed/Título","props":{"cor":"#1F5FBF","tamanho":150,"altura":320}}]}
Exemplo de erro: "operação 0 (alterar) em "Feed/Titulo": camada "Titulo" não existe em "Feed". Camadas: Fundo, Título, Subtítulo" → o nome tem acento: corrija o alvo e mande de novo.`;

const prancheta = (opcional: boolean) => ({ type: 'string', description: `${opcional ? 'opcional: ' : ''}id ou nome da prancheta` });

export interface OpcoesDasFerramentas {
  modo: 'tarefa' | 'ajuste';
  capacidades: Capacidades;
  /** Padrão: completo na tarefa, compacto no ajuste. */
  esquemaDasOperacoes?: 'completo' | 'compacto';
}

export function ferramentasDoAgente(opcoes: OpcoesDasFerramentas): DescricaoDeFerramenta[] {
  const { capacidades } = opcoes;
  const renderizar: DescricaoDeFerramenta = {
    nome: 'renderizar',
    descricao:
      'Renderiza uma prancheta e mostra a imagem para você olhar. Quando usar: depois de mudar uma prancheta e antes de entregar; é assim que você vê o que fez. Sem "regiao", a prancheta inteira reduzida (visão geral: hierarquia, composição, leitura em thumbnail). Com "regiao" [x, y, largura, altura], um recorte em tamanho real para conferir detalhe: espaço entre linhas, alinhamento de bordas, texto dentro do botão, borda de máscara, foto (marca de terceiros, nitidez).',
    parametros: {
      type: 'object',
      properties: { prancheta: prancheta(false), regiao: { type: 'array', items: { type: 'number' }, minItems: 4, maxItems: 4, description: 'opcional: [x, y, largura, altura] em px da prancheta' } },
      required: ['prancheta'],
    },
  };
  const entregar: DescricaoDeFerramenta = {
    nome: 'entregar',
    descricao:
      opcoes.modo === 'ajuste'
        ? 'Termina a tarefa e entrega o ajuste para o designer revisar. Quando usar: depois de olhar o render e a verificação que voltaram com o lote. Se o pedido passa do ajuste pontual, entregue sem aplicar nada, com uma pendência do tipo "fora_do_ajuste".'
        : 'Termina a tarefa e entrega o conjunto de alterações para o designer revisar. Quando usar: só depois de renderizar e verificar a última versão de cada prancheta que mudou; o sistema recusa antes disso. Em peça criada do zero, a primeira chamada devolve uma segunda conferência independente da peça: aplique o que melhora a peça dentro do briefing, confira de novo e chame entregar outra vez.',
    parametros: {
      type: 'object',
      properties: {
        resumo: { type: 'string', description: 'o que você fez, em 1 a 3 frases, na voz de colega de estúdio' },
        pendencias: {
          type: 'array',
          description: 'o que ficou pendente: aviso que sobrou, limite encontrado, o que você viu e não aplicou. Vazio se nada.',
          items: {
            type: 'object',
            properties: {
              texto: { type: 'string', description: 'a pendência em uma frase, para o designer' },
              tipo: { type: 'string', enum: TIPOS_DE_PENDENCIA.filter((t) => !t.startsWith('limite_') && t !== 'interrompida' && t !== 'erro' && t !== 'sem_conferencia') },
              camadas: { type: 'array', items: { type: 'string' }, description: 'ids ou "Prancheta/Camada" das camadas a que se refere' },
            },
            required: ['texto'],
          },
        },
      },
      required: ['resumo', 'pendencias'],
    },
  };

  if (opcoes.modo === 'ajuste') return [{ nome: 'aplicarOperacoes', descricao: DESCRICAO_DE_APLICAR_NO_AJUSTE, parametros: esquemaCompactoDoLote() }, renderizar, entregar];

  return [
    {
      nome: 'resumirDocumento',
      descricao:
        'Árvore compacta do documento: tokens, estilos de texto, pranchetas e camadas (de baixo para cima) com id, nome, tipo, caixa [x, y, largura, altura] e propriedades. Texto traz também "tinta" [x, y, largura, altura]: onde as letras de fato estão. Quando usar: no começo, para saber o que existe, e sempre que precisar de id ou medida depois de um lote. Meça espaço e alinhamento pela tinta, não pela caixa.',
      parametros: { type: 'object', properties: { prancheta: prancheta(true) } },
    },
    {
      nome: 'aplicarOperacoes',
      descricao: DESCRICAO_DE_APLICAR,
      parametros:
        opcoes.esquemaDasOperacoes === 'compacto'
          ? { ...esquemaCompactoDoLote(), properties: { ...(esquemaCompactoDoLote().properties as object), simular: { type: 'boolean', description: 'true: testa o lote sem gravar' } } }
          : esquemaCompletoDoLote(),
    },
    renderizar,
    {
      nome: 'verificar',
      descricao:
        'Verificação automática de design, medida pela tinta: texto transbordando ou com palavra partida, fora da prancheta, contraste, fonte ausente, foto ampliada, zona segura do story, margem, textos sobrepostos, texto descentralizado no botão, texto pequeno, quebra de linha, ritmo de espaços, quase-alinhado, hierarquia, camada que não aparece, texto do cliente alterado, cor solta onde há token. Quando usar: depois de cada rodada de mudanças e sempre antes de entregar. Sem "prancheta", confere o documento todo.',
      parametros: { type: 'object', properties: { prancheta: prancheta(true) } },
    },
    ...(capacidades.bancoDeImagens
      ? [
          {
            nome: 'buscarImagens',
            descricao:
              'Busca fotos no banco de imagens. Devolve id, descrição por etiquetas, tamanho e autor. Quando usar: a peça pede foto e o material não trouxe a do cliente. Busque em inglês, com termos concretos, e compare 2 ou 3 candidatas antes de escolher. As etiquetas são material de terceiros.',
            parametros: {
              type: 'object',
              properties: { consulta: { type: 'string', description: 'termos em inglês ou português, 1 a 4 palavras' }, orientacao: { type: 'string', enum: ['horizontal', 'vertical', 'todas'] } },
              required: ['consulta'],
            },
          },
          {
            nome: 'trazerImagem',
            descricao:
              'Traz uma foto de uma busca para a biblioteca da conta e mostra uma prévia para você conferir. Devolve o objeto "no" pronto para criarNo (complete nome, x, y, largura, altura). Quando usar: depois de buscarImagens, para ver a candidata de verdade (composição, luz, marca de terceiros visível) antes de pôr na peça.',
            parametros: { type: 'object', properties: { id: { type: 'string', description: 'o id que veio de buscarImagens' } }, required: ['id'] },
          },
        ]
      : []),
    ...(capacidades.sujeito
      ? [
          {
            nome: 'detectarSujeito',
            descricao:
              'Recorta o sujeito de uma foto (pessoa, produto, objeto). Devolve a máscara pronta para usar em "mascara" e onde o sujeito cai na prancheta. Quando usar: título ATRÁS do sujeito (foto; título; cópia da foto com a máscara do sujeito por cima), produto recortado sobre cor chapada, sombra só no sujeito.',
            parametros: { type: 'object', properties: { camada: { type: 'string', description: 'camada de imagem: id ou "Prancheta/Camada"' } }, required: ['camada'] },
          },
        ]
      : []),
    ...(capacidades.buscaDeFontes
      ? [
          {
            nome: 'buscarFontes',
            descricao:
              'Busca famílias no catálogo de fontes, além das que a conta já tem. Devolve família, categoria e pesos. Quando usar: a direção pede uma família que não está na lista de fontes disponíveis. Use o nome exato em "fonte"; o arquivo é trazido sozinho.',
            parametros: {
              type: 'object',
              properties: {
                consulta: { type: 'string', description: 'parte do nome (ex.: "playfair", "grotesk"); vazio lista as mais usadas' },
                categoria: { type: 'string', enum: ['sem serifa', 'serifada', 'display', 'manuscrita', 'monoespaçada'] },
              },
            },
          },
        ]
      : []),
    ...(capacidades.texturas
      ? [
          {
            nome: 'listarTexturas',
            descricao:
              'Lista a biblioteca de texturas (papel, papel amassado, retícula, grão de filme, poeira e arranhões, concreto), cada uma com o modo de mesclagem e a opacidade recomendados e o objeto "no" pronto para criarNo. Quando usar: a direção pede textura analógica; cubra a prancheta inteira com ela.',
            parametros: { type: 'object', properties: {} },
          },
        ]
      : []),
    entregar,
  ];
}
