# Artes de nível comercial: tarefas

SDD da POC, parte 3 de 3. Antes: [requisitos](requisitos.md) e [design](design.md).

## Como executar

- Ordem: a que entrega algo usável cedo. Cada marco termina com uma rodada do conjunto e uma comparação com a anterior.
- Teste antes do código (skill `tdd`) em tudo que é função pura: composição, medidas, ficha, lint.
- Uma tarefa, um commit, em Conventional Commits com descrição em português. Commit só quando o Felipe pedir.
- `npm test` e `npm run typecheck` verdes ao fim de cada tarefa.
- Instalação neste disco: `npm install --no-bin-links`.
- **Regra de parada:** se um marco não melhora a rodada, não se empilha o próximo por cima. Investiga-se antes.

Dono é o agente de `.claude/agents/` que executa. "Decisão" aponta para a tabela da seção 6 dos requisitos.

## Marco 0: a régua

Sem isto, nenhuma melhora é afirmável. Atende R1.

| # | Tarefa | Dono | Aceite | Depende |
|---|---|---|---|---|
| T01 | Criar `poc/avaliacao/` e o formato do conjunto (`briefing.json`, `material/`, `categoria.txt`), com esquema zod | treinador-do-otto | esquema com teste; pasta de exemplo validada | |
| T02 | Escrever os 12 briefings sintéticos, reaproveitando café, tênis, imobiliário e jazz | treinador-do-otto, com diretor-de-arte | 12 pastas válidas; textos com gancho numérico em pelo menos 4; logo em pelo menos 6 | T01 |
| T03 | Reunir o material fixo: de 3 a 6 fotos por briefing, com banco, autor e licença registrados; variantes "foto do cliente", "banco" e "sem foto" | diretor-de-arte | toda foto com origem; nenhuma com marca de terceiro; nenhum arquivo de cliente | T02 |
| T04 | `avaliacao/rodar.ts` e `npm run avaliar`: roda o conjunto sem o servidor web, grava a rodada | treinador-do-otto | uma rodada de 2 briefings grava documento, renders, lint, eventos e custo | T01 |
| T05 | `avaliacao/folha.ts`: folha de contato em HTML, peças embaralhadas e sem rótulo, rubrica e pergunta final, exporta as notas em JSON | especialista-react | abre local; notas salvas; chave de desembaralhar em arquivo separado | T04 |
| T06 | Rubrica de qualidade visual: critérios, o que é 1, 3 e 5 em cada um, e a lista de perguntas eliminatórias | diretor-de-arte | documento em `avaliacao/rubrica.md`; aplicado à "Capa com sujeito" dá 4 ou mais em tudo | |
| T07 | **Rodada zero:** o agente atual, sem mudança, no conjunto inteiro | treinador-do-otto | rodada registrada; tabela de custo e tempo; folha gerada | T02 a T05 |

**Saída do marco:** o Felipe julga a rodada zero na folha. É a linha de base de tudo.

## Marco 1: lint que mede qualidade

Barato, e melhora o ciclo atual sem mudar arquitetura. Atende R2 e R6.

| # | Tarefa | Dono | Aceite | Depende |
|---|---|---|---|---|
| T08 | Limiares das regras novas (`vazio-sem-funcao`, `heroi-fraco`, `sujeito-dissolvido`, logo) | diretor-de-arte | números com justificativa, conferidos nas peças de teto | T06 |
| T09 | Implementar as regras novas e corrigir `faixa-vazia` (cor chapada não conta) | especialista-grafico | aponta o vazio do Jazz v7 Story e o tênis do Tênis v7; zero aviso novo nas duas peças de teto | T08 |
| T09b | Rodada 1 do conjunto, só com o lint novo | treinador-do-otto | comparação com a rodada zero registrada | T07, T09 |

## Marco 2: material

Atende R5.

| # | Tarefa | Dono | Aceite | Depende |
|---|---|---|---|---|
| T10 | `src/material/areasCalmas.ts` e `paleta.ts` | especialista-grafico | testes com fotos do conjunto; determinístico | T03 |
| T11 | `src/material/ficha.ts`: junta resolução, sujeito, áreas calmas, paleta e visão; regra de aprovação | especialista-grafico, com treinador-do-otto na chamada de visão | ficha validada por zod; foto com marca visível reprovada; texto embutido na imagem não muda o comportamento | T10 |
| T12 | Uploads do briefing primeiro, banco só para completar; rota sem foto quando nada passa | treinador-do-otto | na situação "sem foto" o agente entrega e declara o que faltou | T11 |

**Decisão D4** entra aqui, se o Felipe quiser outros bancos na avaliação.

## Marco 3: composições

O marco de maior ganho esperado. Atende R4 e R7. **Pede a decisão D1 antes de começar.**

| # | Tarefa | Dono | Aceite | Depende |
|---|---|---|---|---|
| T13 | Especificação visual das composições 1 a 3 (título atrás do sujeito, título gigante, produto isolado): proporções, limites, parâmetros, quando não usar | diretor-de-arte | uma página por composição, com esboço em números | D1 |
| T14 | `src/composicao/medidas.ts`: `ajustarCorpo`, `quebrarPeloSentido`, `encaixarNaAreaCalma`, `escalaDeEspaco`, `destacarGancho`; mover as listas de quebra de linha do lint para cá | especialista-grafico | testes com os títulos dos 12 briefings; o lint usa a mesma lista | |
| T15 | `src/composicao/tipos.ts` e `indice.ts` | especialista-grafico | tipos com teste de contrato: toda composição devolve lote que `aplicarLote` aceita | T14 |
| T16 | Composições 1, 2 e 3 | especialista-grafico | cada uma, nos 12 briefings × Feed, Story e Quadrado, com zero erro de lint e sem chamada ao modelo; PSD exportado relido pelo ag-psd com a árvore esperada | T13, T15, T11 |
| T17 | Ferramenta `compor` no agente e `POST /api/documentos/:id/compor` | especialista-backend | agente e rota HTTP geram o mesmo lote; desfaz em um passo | T16 |
| T18 | Prompt da produção: sai arquétipo e escala, entra "comece por compor" e a recomposição por formato | treinador-do-otto | rodada 2 do conjunto registrada e comparada | T17 |
| T19 | Especificação e implementação das composições 4 a 10 | diretor-de-arte, especialista-grafico | mesmo aceite de T16 | T16 |

**Saída do marco:** rodada 2 contra a rodada 1 na folha. Se as peças não melhorarem com as três primeiras composições, T19 não começa.

## Marco 4: rotas e escolha

Atende R3.

| # | Tarefa | Dono | Aceite | Depende |
|---|---|---|---|---|
| T20 | `src/servidor/direcao.ts`: esquema da rota, prompt do diretor, validação por código (famílias diferentes, ficha aprovada, exigência de sujeito) | treinador-do-otto | 12 briefings geram 3 rotas válidas; rota inválida volta com erro legível | T16, T11 |
| T21 | `src/servidor/juiz.ts`: eliminação e ordem, duas chamadas com ordem trocada, desempate | treinador-do-otto | resposta validada por zod; mesma entrada em ordem trocada concorda em pelo menos 10 de 12 | T06 |
| T22 | `src/servidor/fluxo.ts`: orquestra as fases 0 a 5, custo por fase, cancelamento | especialista-backend | tarefa de criação passa pelo fluxo; adaptar e pedido livre seguem direto para a produção | T20, T21 |
| T23 | Rotas guardadas no painel do Otto: miniaturas das não escolhidas e troca de rota | especialista-ui-ux, especialista-react, guardiao-da-marca no texto | o designer troca de rota em um passo e desfaz em um passo | T22 |

T23 pode ficar para depois do marco 6 se o tempo apertar: a régua não depende dela.

## Marco 5: revisão com referência

Atende R8.

| # | Tarefa | Dono | Aceite | Depende |
|---|---|---|---|---|
| T24 | Peças de referência: teto feito à mão com o catálogo para pelo menos 6 categorias | diretor-de-arte | cada uma com 4 ou mais em toda a rubrica, julgada pelo Felipe | T06, D3 |
| T25 | Revisor novo: parecer estruturado, referências anexadas, veredito `refazer` | treinador-do-otto | o revisor reprova o Jazz v7 Story e aprova a "Capa com sujeito" | T24, T21 |
| T26 | Rodada 3 do conjunto, fluxo completo | treinador-do-otto | registrada e comparada; custo por fase | T22, T25 |

## Marco 6: modelo, custo e tempo

Atende R9 e R11.

| # | Tarefa | Dono | Aceite | Depende |
|---|---|---|---|---|
| T27 | Remedir o que responde na DigitalOcean com ferramenta e visão; adaptador novo só se o Felipe decidir | treinador-do-otto | tabela atualizada; memória de modelos atualizada | D2 |
| T28 | Rodar o conjunto com cada modelo disponível, por papel | treinador-do-otto | tabela de qualidade, tempo e custo por modelo e papel; `docs/tecnico/custos.md` atualizado | T26, T27 |

## Marco 7: o critério que decide

Atende R10.

| # | Tarefa | Dono | Aceite | Depende |
|---|---|---|---|---|
| T29 | Julgamento cego com pelo menos 3 designers, na folha, com as peças de teto misturadas | Felipe, com analista-de-produto no roteiro | notas registradas; concordância entre designers calculada | T26, D5 |
| T30 | Correlação entre juiz de modelo e designers; parecer de nível comercial | treinador-do-otto | resultado de R8 e R10 escrito em `poc/README.md` como rodada 6, com o que passou e o que não passou | T29 |

## O que dá para começar hoje

T01, T02, T04, T06 e T14 não dependem de decisão nem uma da outra, e podem rodar em paralelo.

## Rastreio

| Requisito | Tarefas |
|---|---|
| R1 Régua | T01 a T07 |
| R2 Eliminatórios | T06, T09, T11 |
| R3 Rotas | T20 a T23 |
| R4 Composição | T13 a T19 |
| R5 Material | T10 a T12 |
| R6 Lint | T08, T09 |
| R7 Formatos | T16, T18 |
| R8 Revisor | T24, T25, T30 |
| R9 Tempo e custo | T04, T26, T28 |
| R10 Designers | T05, T29, T30 |
| R11 Modelo | T27, T28 |
