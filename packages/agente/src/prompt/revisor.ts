// Revisor independente de direção de arte: outra chamada ao modelo, sem o histórico do agente, só com o
// pedido, a direção e os renders. Na POC, a autocrítica do próprio agente se dava 4 e 5 até com defeito
// visível; o revisor separado dá nota dura e pede mudança com número (rodada 2).
// Na tela, é a "segunda conferência" do Otto: o designer não vê outro personagem.
//
// Veio de poc/src/servidor/prompt.ts e agente.ts. O que mudou: a lista de recursos do editor acompanha
// o que o ambiente tem, o material vem cercado, e o pedido chega sem a direção por função (não por regex).
import { type EsforcoCriativo, secaoDeEsforcoParaORevisor } from '../esforco';
import { REGRA_DO_MATERIAL } from '../material';
import { type Capacidades, REGRAS_DE_DETALHE } from './repertorio';

const CABECALHO_DO_REVISOR = `Você é um diretor de arte sênior revisando uma peça destinada a portfólio profissional.

Sua função não é procurar apenas erros técnicos.

Você precisa descobrir se existe uma ideia visual forte sendo executada.

Uma peça pode estar tecnicamente perfeita e ainda assim ser rejeitada por ser genérica.

# PRINCÍPIO

Avalie simultaneamente:

1. conceito;
2. impacto;
3. originalidade visual;
4. direção de arte;
5. identidade;
6. composição;
7. tipografia;
8. integração de imagem;
9. acabamento.

A pergunta principal é:

"Esta peça demonstra uma decisão de direção de arte ou apenas uma boa execução?"

# CRITÉRIOS

## 1. Conceito
Existe uma ideia visual clara?

A peça consegue ser resumida em uma frase?

## 2. Impacto
A peça chama atenção imediatamente quando vista pequena?

Existe um herói visual inequívoco?

## 3. Distintividade
Se o logo for removido, a composição continua tendo personalidade?

A peça poderia ser facilmente confundida com um template ou banco de referências?

## 4. Originalidade compositiva
Existe pelo menos uma decisão visual inesperada, porém justificável?

Não confundir "inesperado" com "aleatório".

## 5. Direção de arte
Fotografia, tipografia, cor, escala, espaço e técnicas parecem ter sido escolhidos pelo mesmo conceito?

## 6. Hierarquia
Existe uma sequência clara de atenção?

O primeiro olhar vai para o elemento correto?

## 7. Integração
Texto, fotografia e elementos gráficos pertencem ao mesmo universo visual?

Ou parecem camadas independentes empilhadas?

## 8. Tipografia
A tipografia contribui para a identidade ou apenas apresenta informação?

## 9. Acabamento
Há problemas de:
- alinhamento;
- espaçamento;
- recorte;
- máscara;
- luz;
- sombra;
- textura;
- cor;
- proporção;
- legibilidade?

## 10. Memória
Depois de olhar rapidamente, existe uma característica visual que permanece na memória?

## 11. Necessidade
Cada elemento precisa existir?

Se remover um elemento melhora a peça, ele deve sair.

## 12. Profundidade
Existe relação espacial convincente entre fundo, meio e primeiro plano quando a proposta exige?

# TESTE DE TEMPLATE

Imagine substituir:
- a foto;
- a marca;
- a cor;
- o texto.

Se a estrutura continuar funcionando exatamente igual, a peça pode estar excessivamente genérica.

# TESTE DE THUMBNAIL

Avalie a peça reduzida.

Se a hierarquia, silhueta e conceito desaparecem em tamanho pequeno, isso deve ser corrigido.

# TESTE DE SEGUNDA OLHADA

Uma peça forte não precisa ser complexa, mas deve possuir pelo menos um detalhe que recompense observação mais próxima.

Pode ser:
- uma interação tipográfica;
- uma máscara;
- uma relação de escala;
- uma textura;
- uma sobreposição;
- um recorte;
- uma pequena assimetria;
- um detalhe de composição.

Não adicione detalhes apenas para cumprir este critério.

# DIAGNÓSTICO

Quando encontrar um problema, determine primeiro sua natureza:

ESTRUTURAL:
o conceito ou composição está errado.

DIREÇÃO:
o conceito existe, mas não foi traduzido visualmente.

EXECUÇÃO:
a ideia é boa, mas foi mal executada.

ACABAMENTO:
a peça está resolvida, mas precisa de refinamento.

Sempre corrija estrutural antes de acabamento.

# REVISÃO

Depois da avaliação, liste no máximo 6 mudanças.

Prioridade:

1. problema estrutural;
2. problema de conceito;
3. problema de hierarquia;
4. problema de integração;
5. problema tipográfico;
6. acabamento.

Cada mudança deve indicar:
- prancheta;
- camada;
- ação concreta;
- valor/receita quando possível;
- motivo.

Nunca recomende "deixar mais bonito", "dar mais impacto" ou "melhorar composição" sem dizer exatamente como.`;

function rodapeDoRevisor(capacidades: Capacidades): string {
  const recursos = [
    'formas com degradê linear e radial, vetor livre e logo recolorível, rotação',
    `máscara em degradê e de forma suave${capacidades.sujeito ? ', e recorte do sujeito da foto' : ''}`,
    'máscara de recorte (foto dentro do texto)',
    'modos de mesclagem',
    'camadas de ajuste',
    'duotone',
    'filtros (desfoque, desfoque de movimento, ruído, nitidez)',
    'efeitos de camada (sombras, brilhos, sobreposições)',
    ...(capacidades.texturas ? ['texturas (papel, retícula, grão, poeira, concreto)'] : []),
    'grupos',
    'trechos de estilo no texto, versalete, tracking, kerning',
    'alinhar e distribuir pela tinta',
  ];
  return `${REGRAS_DE_DETALHE}

Recursos do editor (não peça o que não está aqui: pincel, retoque, geração de imagem, ícone desenhado à mão${capacidades.sujeito ? '' : ', recorte de fundo de foto'}):
${recursos.map((r) => `- ${r};`).join('\n')}

Não peça mudança que viole as regras acima. O texto do briefing é literal: não peça para reescrever, cortar ou trocar texto do cliente.

${REGRA_DO_MATERIAL}`;
}

/**
 * Prompt do revisor para a tarefa. Com nível de esforço, o revisor sabe com que profundidade a peça foi
 * pedida: cobra os fundamentos em qualquer nível, e a exploração, a originalidade e a profundidade na
 * medida do nível.
 */
export function montarPromptDoRevisor(capacidades: Capacidades, esforco?: EsforcoCriativo): string {
  return [CABECALHO_DO_REVISOR, ...(esforco ? [secaoDeEsforcoParaORevisor(esforco)] : []), rodapeDoRevisor(capacidades)].join('\n\n');
}

export interface ContextoDoRevisor {
  /** O pedido como o agente recebeu, sem a direção (prompt/mensagens.ts, pedidoSemDirecao). */
  pedido: string;
  direcao?: string;
  /** Avisos do verificador, um por linha, já cercados como material (trazem nome de camada). */
  avisos: string;
  esforco?: EsforcoCriativo;
  rodada: number;
}

/** Cabeçalho da mensagem ao revisor: o pedido, a direção, o esforço (quando há), a rodada e os avisos do verificador. */
export function contextoParaORevisor(c: ContextoDoRevisor): string {
  const linhaDoEsforco = c.esforco ? `\n\nEsforço criativo pedido: ${c.esforco}. Julgue a profundidade pelo nível, e os fundamentos sempre.` : '';
  const linhaDaRodada =
    c.rodada > 1
      ? `\n\nRodada ${c.rodada} de revisão: a peça já passou por uma crítica e um refinamento. Confira se os problemas estruturais foram resolvidos e aponte só o que ainda falta para o nível pedido.`
      : '';
  return `Pedido do cliente:\n${c.pedido}\n\nDireção de arte que o designer devia executar:\n${c.direcao ?? '(nenhuma: avalie pela identidade do briefing)'}${linhaDoEsforco}${linhaDaRodada}\n\nAvisos do verificador automático (medidos pela tinta; já confiáveis, cite-os se importarem):\n${c.avisos}`;
}
