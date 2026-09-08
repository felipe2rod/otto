# 002 — Estilo de atendimento configurável

Status: proposta (Claude, aguardando Felipe)
Data: 2026-09-08
Quem decide: Felipe

## Contexto

Felipe quer que o empregador escolha a personalidade do atendente de WhatsApp. Ao mesmo tempo, Otto é uma marca com um personagem só (ADR 001). Personalidade livre ameaça o personagem; personalidade fixa ameaça a adequação a negócios diferentes (uma clínica e uma hamburgueria não atendem igual).

## Opções consideradas

**A. Personalidade fixa.** Otto atende igual em toda empresa. Só muda a base de conhecimento.

**B. Caráter fixo, estilo configurável.** O que o Otto *é* não muda (honestidade, limites, encaminhamento, cuidado com dado). O que o Otto *parece* é escolha da empresa: nome de exibição, formalidade, calor, emoji, tamanho, saudação. Presets com exemplo, mais ajustes finos.

**C. Prompt livre.** O empregador escreve como quer que o Otto seja.

## Análise

| Critério | A. Fixa | B. Caráter × estilo | C. Prompt livre |
|---|---|---|---|
| Adequação a negócios diferentes | Baixa | Alta | Máxima |
| Proteção do personagem Otto | Máxima | Alta: o caráter é travado | Baixa: um cliente publica um atendente que envergonha a marca |
| Esforço do empregador no onboarding | Zero | Um clique entre 4 exemplos | Escrever prompt. A maioria não sabe e não quer |
| Risco de qualidade | Baixo | Baixo: presets testados | Alto: cada prompt é um produto não testado |
| Reversibilidade | Fácil abrir depois | Fácil abrir ou fechar | Difícil fechar depois de aberto |
| Diferenciação | Nenhuma | "O Otto veste a camisa da sua empresa" | Igual a todo construtor de bot |

## Decisão

**Opção B.** Detalhada em `docs/produto/estilos-de-atendimento.md`.

- Caráter travado, versionado no repositório, com as 8 regras de `persona-otto.md`. Nenhuma configuração o sobrescreve. Teste automatizado por preset.
- Estilo em 4 presets (Cordial padrão, Formal, Descontraído, Direto) escolhidos por exemplo, mais ajustes finos no painel.
- Nome de exibição padrão "Otto", troca livre.
- Instrução livre fica para v2, atrás de filtro que recusa instrução que colide com o caráter.

## Consequências

- Marketing ganha uma frase: "o caráter é do Otto, o uniforme é da empresa."
- Todo texto do atendente precisa existir em 4 versões de estilo, ou ser gerado a partir de uma regra de estilo. Isso é custo de conteúdo real e cresce com os cargos.
- A UI de onboarding mostra exemplo, não descrição. Custo de decisão baixo por construção (§4 de `behavioral-evidence`).
- Se a demanda por instrução livre aparecer, ela aparece como incidência de pedidos de suporte por um estilo que não existe. Isso é o gatilho medível para a v2.

## Evidência comportamental

| Afirmação | Tipo | Grau | Como se mede aqui | O que a mata |
|---|---|---|---|---|
| Empregadores querem escolher a personalidade do atendente | Preferência declarada (intuição do Felipe) | NÃO VERIFICADO | % de contas que saem do preset padrão no onboarding ou nos 30 dias seguintes | Se menos de 20% das primeiras 30 contas mudarem qualquer coisa de estilo, a escolha pode sair do onboarding e ir para o painel. Custo de reverter: baixo |
| Empregador escolhe preset em menos de 1 minuto vendo exemplos | Capacidade | NÃO VERIFICADO | Observar 5 pessoas no onboarding | 2 das 5 pedem explicação ou hesitam mais de 1 minuto |
| Cordial é o preset que menos gera "quero falar com uma pessoa" | Taxa | INFERIDO | Incidência de pedido de humano por preset, nas primeiras 500 conversas | Outro preset com incidência menor em base comparável |
| Prompt livre produz atendentes que ferem o caráter | Ausência | INFERIDO (observado em produtos de construtor de bot, sem fonte aberta nesta sessão) | Só se mede provocando: rodar 20 prompts de empregador fictício contra o bloco de caráter | Nenhum dos 20 fere o caráter |

Nada aqui sustenta arquitetura cara. Presets são texto e configuração. A parte cara (filtro de instrução livre) está fora da v1 até haver incidência.

## Gatilho de revisão

- Abrir instrução livre (v2) quando **10 ou mais pedidos de suporte**, em contas distintas, pedirem um estilo que os presets e ajustes não cobrem.
- Reduzir presets a 2 se, em 30 contas, **menos de 20%** mudarem o padrão.
