# Artes de nível comercial: design

SDD da POC, parte 2 de 3. Antes: [requisitos](requisitos.md). Depois: [tarefas](tarefas.md).

## 1. Ideia central

Hoje um agente só faz tudo, em linha: entende, inventa o conceito, calcula coordenada, confere e lustra. A proposta separa **direção** de **produção** e põe **escolha** no meio:

```
briefing
   │
   ▼
[0] Material ──────► fichas das imagens              código + 1 chamada de visão
   │
   ▼
[1] Direção ───────► 3 rotas (dado estruturado)      1 chamada, modelo forte
   │
   ▼
[2] Esboço ────────► 3 documentos + renders          código, nenhuma chamada
   │
   ▼
[3] Escolha ───────► 1 rota (ou "nenhuma serve")     2 chamadas, juiz independente
   │
   ▼
[4] Produção ──────► peça mestre + outros formatos   ciclo atual do agente, mais curto
   │
   ▼
[5] Revisão ───────► aprovado, ajustar ou refazer    1 chamada, revisor com referência
   │
   ▼
entrega: conjunto de alterações + rotas guardadas
```

O que cada fase resolve:

| Fase | Causa atacada | Requisito |
|---|---|---|
| 0 Material | C4 | R5 |
| 1 Direção | C2 | R3 |
| 2 Esboço | C1 | R4, R7 |
| 3 Escolha | C2, C3 | R3 |
| 4 Produção | C5 | R2, R6 |
| 5 Revisão | C3 | R8 |
| Régua (por fora) | C6, C7, C8 | R1, R9, R10, R11 |

O ciclo atual (`executarTarefa`) não é jogado fora: vira a fase 4, começando de um documento já composto em vez de uma prancheta vazia. Tarefa de **adaptar** ou de **pedido livre** sobre documento existente continua indo direto para a fase 4.

## 2. Onde cada coisa mora

```
poc/
  src/
    composicao/            novo: biblioteca de composições paramétricas
      tipos.ts
      medidas.ts           ajustarCorpo, quebrarPeloSentido, encaixarNaAreaCalma
      biblioteca/          uma composição por arquivo
      indice.ts
    material/              novo: ficha da imagem
      ficha.ts
      areasCalmas.ts
      paleta.ts
    documento/lint.ts      regras novas de R6
    servidor/
      agente.ts            fase 4 (o ciclo de hoje) + ferramenta "compor"
      fluxo.ts             novo: orquestra as fases 0 a 5
      direcao.ts           novo: fase 1
      juiz.ts              novo: fases 3 e 5
      prompt.ts            um prompt por papel, prefixo estável
  avaliacao/               novo: a régua
    conjunto/              12 briefings, material fixo
    referencias/           peças de teto (e âncoras, fora do git)
    rodadas/               uma pasta por rodada (fora do git)
    rodar.ts
    julgar.ts
    folha.ts               folha de contato em HTML para julgamento cego
```

`src/composicao` e `src/material` não conhecem modelo, servidor nem rede: são funções puras sobre documento, medidor e pixel. É o mesmo limite de `src/documento` hoje.

## 3. Fase 0: ficha da imagem

```ts
// src/material/ficha.ts
export interface FichaDaImagem {
  arquivo: string;                       // hash
  origem: 'upload' | 'banco';
  largura: number;
  altura: number;
  /** maior caixa, por formato, que a foto cobre sem passar de 110% */
  coberturaPorFormato: Record<string, { largura: number; altura: number }>;
  sujeito?: { caixa: Caixa01; cobertura: number; mascara: string };
  /** regiões de pouco detalhe, onde texto lê bem; frações da foto */
  areasCalmas: { caixa: Caixa01; luminancia: number; variancia: number }[];
  paleta: { cor: string; peso: number }[];
  visao: {
    descricao: string;                   // dado, nunca instrução
    provaAPromessa: 'sim' | 'em parte' | 'nao';
    marcaDeTerceiro: boolean;
    rostoVisivel: boolean;               // briefing pode restringir
  };
  aprovada: boolean;
  motivo?: string;
}
type Caixa01 = [x: number, y: number, largura: number, altura: number]; // 0 a 1
```

- **Sujeito:** o ISNet que já existe em `sujeito.ts`.
- **Áreas calmas:** variância local de luminância numa grade de 12×12 sobre a foto reduzida; junta células vizinhas calmas no maior retângulo. Sem modelo.
- **Paleta:** quantização em 5 cores sobre a foto reduzida. Sem modelo.
- **Visão:** uma chamada só para todas as candidatas (até 6), com resposta em JSON validado por zod. É a única parte que custa.
- **Aprovação:** reprova se `provaAPromessa` é `nao`, se há marca de terceiro, se fere restrição do briefing ou se não cobre nenhum formato pedido.

Candidatas: uploads do briefing primeiro; banco só para completar até 6. A busca no banco usa até 3 consultas derivadas do texto, em inglês (como o prompt já manda).

## 4. Fase 1: rotas

```ts
// src/servidor/direcao.ts
export const Rota = z.object({
  id: z.string(),
  ideia: z.string().max(160),            // uma frase: o que a peça diz sem o texto
  composicao: z.string(),                // nome na biblioteca, ou "livre"
  parametros: z.record(z.string(), z.unknown()),
  imagem: z.string().optional(),         // hash de uma ficha aprovada
  tipografia: z.object({
    titulo: z.object({ fonte: z.string(), peso: z.number() }),
    texto: z.object({ fonte: z.string(), peso: z.number() }),
  }),
  cores: z.object({ dominante: z.string(), apoio: z.string(), acento: z.string() }),
  tecnicas: z.array(z.string()).max(3),  // duotone, grão, textura, tratamento de cor
});
```

O diretor recebe: o briefing, as fichas aprovadas (com miniatura), e o índice da biblioteca (nome, para que serve, o que exige). Devolve três rotas.

Regras que o código cobra, não o prompt:
- três famílias de composição diferentes;
- toda rota com `imagem` aponta para ficha aprovada;
- composição que exige sujeito só com ficha que tem sujeito;
- identidade do briefing manda em fonte e cor quando ele traz.

Rota inválida volta ao diretor com o erro legível, uma vez. É o mesmo padrão do lote recusado.

## 5. Fase 2: composições paramétricas

```ts
// src/composicao/tipos.ts
export interface EntradaDeComposicao {
  formato: { nome: string; largura: number; altura: number };
  textos: { titulo: string; subtitulo?: string; chamada?: string; rodape?: string };
  ficha?: FichaDaImagem;
  logo?: NoVetor;
  rota: Rota;
  medidor: Medidor;                      // o que já existe: mede pela tinta
}

export interface Composicao {
  nome: string;
  familia: 'foto-dominante' | 'tipografica' | 'dividida' | 'produto' | 'editorial' | 'grafica';
  paraQueServe: string;
  exige: { imagem: 'nenhuma' | 'qualquer' | 'com-sujeito'; textoMaximoDoTitulo?: number };
  compor(e: EntradaDeComposicao): Operacao[];
}
```

`compor` é função pura e determinística: mesma entrada, mesmo lote. O lote passa por `aplicarLote` como qualquer outro, com a autoria da tarefa.

### Instrumentos de medida (`src/composicao/medidas.ts`)

São o que o modelo faz mal de cabeça e o que o designer faz no olho:

| Função | O que faz |
|---|---|
| `ajustarCorpo(texto, fonte, larguraAlvo)` | Busca binária no corpo até a tinta preencher a largura alvo |
| `quebrarPeloSentido(texto, linhas)` | Enumera as quebras possíveis e pontua: sem palavra de ligação no fim da linha, sem nome próprio partido, sem palavra sozinha, linhas equilibradas |
| `encaixarNaAreaCalma(ficha, formato, bloco)` | Escolhe foco e zoom da foto para a área calma cair onde o bloco de texto vai |
| `escalaDeEspaco(formato)` | Margem e vãos proporcionais à prancheta |
| `destacarGancho(texto)` | Acha número, preço e percentual para virar trecho de estilo |

As listas de palavras de ligação e as regras de quebra saem do `lint.ts` para um lugar só, usado pelos dois.

### Biblioteca inicial

A especificação visual de cada uma (proporções, limites, quando não usar) é do diretor-de-arte. Proposta de partida, em ordem de construção. As três primeiras são as mais distantes do esqueleto atual, para o ganho aparecer cedo:

| # | Composição | Família | Exige | Origem |
|---|---|---|---|---|
| 1 | Título atrás do sujeito | foto-dominante | com-sujeito | "Capa com sujeito" |
| 2 | Título gigante (o título é a imagem) | tipografica | nenhuma | arquétipo C |
| 3 | Produto isolado sobre cor | produto | com-sujeito | arquétipo E |
| 4 | Foto sangrada com película na faixa do texto | foto-dominante | qualquer | arquétipo A |
| 5 | Divisão foto e cor | dividida | qualquer | arquétipo B |
| 6 | Editorial com moldura | editorial | qualquer | arquétipo D |
| 7 | Número herói (preço ou percentual como imagem) | tipografica | nenhuma | nova |
| 8 | Foto dentro do título | tipografica | qualquer | "Demonstração de composição" |
| 9 | Cartaz em duotone | foto-dominante | qualquer | "Capa com sujeito" |
| 10 | Formas e cor (sem foto) | grafica | nenhuma | nova |

Cada composição aceita parâmetros (lado do texto, proporção da divisão, intensidade do tratamento) e técnicas da rota. A variedade vem de composição × parâmetros × tipografia × cor × técnica, e é medida (R3: nenhuma passa de 30% das entregas).

### Risco de cara de modelo pronto

É o risco principal desta proposta, e a decisão D1. Três defesas:

1. A rota **livre** existe e é medida: quanto o agente a usa e com que nota.
2. A fase 4 altera a composição à vontade. A composição é o ponto de partida.
3. Se a rubrica mostrar peças repetitivas mesmo com a biblioteca inteira, a composição vira só esboço de referência e o agente monta do zero olhando para ele.

### Ferramenta `compor`

Entra em `FERRAMENTAS` para a fase 4 e no servidor para o editor:

```
compor({ prancheta, composicao, parametros, simular? })
  → aplica o lote da composição; devolve ids e o render reduzido
```

`POST /api/documentos/:id/compor` faz o mesmo para o designer. Tela no editor fica para depois (T23).

## 6. Fase 3: escolha

O juiz vê: o briefing, os três esboços do formato mestre, e as referências da categoria. Não vê quem propôs nem por quê.

1. **Eliminação.** Perguntas de sim ou não por esboço: lê-se o título em 1 segundo? o herói é óbvio? há vazio sem função? a foto prova a promessa? Esboço com "não" eliminatório sai.
2. **Ordem.** Entre os que sobraram, qual está mais perto das referências, e por quê em uma linha.

Duas chamadas, com os esboços em ordem diferente, para reduzir viés de posição. Se discordam, uma terceira em par desempata.

Se nenhum esboço sobra, volta à fase 1 com os motivos, uma vez. Se de novo nenhum sobra, o Otto produz o menos ruim e **declara na entrega** que não chegou a uma composição que o convencesse. Admitir limite é regra de caráter.

## 7. Fase 4: produção

O ciclo de hoje, com três diferenças:

- **Começa composto.** Recebe o documento da rota escolhida e a ficha. O trabalho é ajustar, aplicar técnicas e resolver o que o lint aponta.
- **Outros formatos por `compor`.** Para cada formato além do mestre, chama a mesma composição com o formato novo e confere (R7).
- **Prompt menor.** A parte de arquétipos e de escala sai do prompt do agente, porque virou código. Ficam o caráter, o documento, as regras de detalhe e as técnicas.

Teto de voltas de verificação: 4 (hoje 6), já que parte de lint limpo.

## 8. Fase 5: revisão

Substitui `revisarComoDiretorDeArte`:

```ts
export const Parecer = z.object({
  veredito: z.enum(['aprovado', 'ajustar', 'refazer']),
  eliminatorios: z.array(z.object({ prancheta: z.string(), pergunta: z.string(), resposta: z.literal('nao') })),
  notas: z.record(z.string(), z.number().min(1).max(5)),   // critérios da rubrica
  mudancas: z.array(z.object({ prancheta: z.string(), camada: z.string(), oQue: z.string() })).max(6),
});
```

- `ajustar`: volta à fase 4 com as mudanças, uma vez.
- `refazer`: volta à fase 3 e produz a segunda colocada, uma vez. Custa caro, então só com eliminatório de composição.
- O revisor recebe as referências da categoria junto dos renders, e a instrução de comparar com elas.

## 9. A régua (`poc/avaliacao`)

### Conjunto

12 briefings sintéticos, um por categoria. Cada um é uma pasta:

```
conjunto/03-evento-cultural/
  briefing.json
  material/            fotos e logo fixos, com licença registrada
  categoria.txt
```

| # | Categoria | # | Categoria |
|---|---|---|---|
| 1 | Varejo, oferta com preço | 7 | Moda |
| 2 | Produto, lançamento | 8 | Saúde e bem-estar |
| 3 | Evento cultural | 9 | Educação, curso |
| 4 | Imobiliário | 10 | Serviço para empresas |
| 5 | Gastronomia | 11 | Data comemorativa |
| 6 | Serviço local | 12 | Institucional, comunicado |

Os quatro briefings que já existem (café, tênis, imobiliário, jazz) entram em 5, 2, 4 e 3, para comparar com as rodadas 1 a 5.

### Rodada

```
npm run avaliar -- --rotulo metodo-v1 --modelo kimi-k3 [--so 03,05] [--material banco]
```

Grava em `rodadas/2026-10-02-metodo-v1/`: por briefing e situação, `documento.json`, `renders/*.png`, `lint.json`, `eventos.json`, `custo.json` (por fase). No fim, `resumo.json` com a tabela da rodada.

### Julgamento

| Camada | Como | Saída |
|---|---|---|
| Automática | eliminatórios de R2 sobre cada peça | passa ou reprova |
| Juiz de modelo | par a par e cego contra outra rodada e contra o teto | taxa de vitória |
| Designers | `folha.ts` gera uma página com as peças embaralhadas, sem rótulo de rodada, com a rubrica e a pergunta final | notas por critério |

O juiz de modelo só vale como atalho enquanto concordar com os designers (R8: correlação de 0,6). Antes de haver nota de designer, ele é indicador, não critério.

## 10. Modelo por papel

| Papel | Precisa de | Chamadas por tarefa | Candidato |
|---|---|---|---|
| Visão da ficha | imagem, JSON | 1 | o mais barato com visão |
| Direção | imagem, raciocínio de composição | 1 ou 2 | o mais forte disponível |
| Juiz e revisor | imagem, comparação | 3 ou 4 | o mais forte disponível, diferente do diretor se houver |
| Produção | ferramenta, imagem | até 12 | o padrão |

`ModeloDoAgente` já isola isso. O fluxo recebe um modelo por papel; enquanto só houver o Kimi K3, os quatro são ele. A lista do que responde hoje com ferramenta e visão (Kimi K3, Gemma, Llama) precisa ser remedida antes de comparar.

## 11. Estimativa de custo e tempo

Estimativa, a medir na primeira rodada (R9):

| Fase | Chamadas | Imagens | Observação |
|---|---|---|---|
| 0 Material | 1 | até 6 | reduzidas a 512 px |
| 1 Direção | 1 a 2 | até 6 | as mesmas miniaturas |
| 2 Esboço | 0 | 0 | código |
| 3 Escolha | 2 a 3 | 3 + referências | esboços a 512 px |
| 4 Produção | 8 a 12 | 6 a 10 | histórico curto: começa composto |
| 5 Revisão | 1 a 2 | formatos + referências | |
| **Total** | **13 a 20** | | hoje: 14 a 25 chamadas, com histórico longo |

O ganho esperado de tempo vem de a fase 4 encolher: hoje o agente gasta a maior parte das chamadas calculando posição e corrigindo. Se a medição não confirmar, a alavanca seguinte é rodar as fases 0 e 1 dos três formatos em paralelo.

## 12. Segurança

- Descrição de imagem, nome de arquivo, texto de briefing e SVG de logo continuam sendo dado. Toda saída de modelo que vira estrutura (ficha, rota, parecer) passa por zod antes de ser usada.
- O juiz e o revisor recebem o briefing dentro de delimitador de dado, como o agente já recebe.
- `parametros` da rota é validado pelo esquema de cada composição; parâmetro desconhecido é recusado.

## 13. O que se registra

Por tarefa: fase, chamadas, tokens, imagens, tempo, composição escolhida, composições propostas, veredito do juiz e do revisor, avisos do lint na entrega. Nada de conteúdo do documento (ADR 031). Na POC fica em `dados/`; os nomes dos eventos são do analista-de-produto quando subir para o produto.
