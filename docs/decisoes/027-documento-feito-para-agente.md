# 027 — O documento é feito para o agente: árvore estruturada, operações tipadas, um histórico só

Status: proposta
Data: 2026-09-26
Quem decide: Felipe

## Contexto

Nos testes com Photoshop, Canva e Figma, o agente gastou a maior parte do esforço descobrindo o estado do documento e conferindo se a ação tinha funcionado. Em ferramenta feita para a mão humana, o estado mora em pixels e em painéis, e a ação é um gesto. O ADR 026 decidiu que o Otto é a ferramenta feita para o agente. Este ADR diz o que isso significa no modelo de dados.

## Opções consideradas

1. **Documento como imagem com camadas raster** (modelo Photopea). É simples de exportar para PSD, mas o agente não consegue editar texto nem forma sem redesenhar.
2. **Documento como código** (HTML/CSS ou SVG gerado pelo modelo). O modelo escreve bem, mas o mapeamento para PSD é ruim (layout de fluxo não tem equivalente em camadas) e o designer não edita código.
3. **Árvore de nós com propriedades tipadas, alterada só por operações.** Escolhida.

## Decisão

### 1. O documento é uma árvore de nós, e ela é a única fonte de verdade

- JSON validado por esquema zod, versionado (`versaoDoFormato`). O canvas é uma renderização da árvore, nunca um estado.
- Tipos de nó na v1: `documento`, `prancheta` (artboard), `grupo`, `imagem` (raster), `forma` (retângulo, elipse, polígono, caminho vetorial), `texto` e `ajuste` (camada de ajuste).
- Propriedades comuns: transformação (posição, tamanho, rotação), opacidade, opacidade de preenchimento, modo de mesclagem, visível, bloqueado, máscara raster, máscara vetorial e efeitos.
- **Pixel é conteúdo, não estado.** Uma imagem referencia um arquivo por hash de conteúdo (`sha256`). Editar pixel cria um arquivo novo e troca a referência, sem sobrescrever o anterior.

### 2. Todo nó tem id estável e nome legível

- Id opaco gerado na criação (UUID v7), que nunca muda. O agente não endereça por índice ("a terceira camada").
- Nome legível, único dentro do pai, que o agente e o designer usam. Caminho por nome (`Post/Título`) é aceito como endereço, e o sistema resolve para o id antes de aplicar.

### 3. Toda mudança é uma operação tipada, e humano e agente usam as mesmas

- Um catálogo fechado de operações (`criarNo`, `alterar`, `mover`, `reordenar`, `agrupar`, `desagrupar`, `remover`, `alinhar`, `distribuir`, `definirTexto`, `aplicarEfeito`, `usarToken` etc.), cada uma com esquema zod.
- **A interface do editor não tem atalho próprio.** Arrastar uma camada gera a mesma operação `mover` que o agente chamaria. Por isso existe um histórico só, um desfazer só e uma validação só.
- Operações se aplicam em **transação**: ou o lote inteiro entra, ou nada entra. Um lote que falha devolve o erro com o id do nó e o campo inválido, em formato que o agente consegue corrigir.
- **Simulação (dry-run)**: todo lote pode ser aplicado numa cópia e devolver o resultado (árvore alterada, render e avisos) sem gravar.
- **Autoria em cada operação**: `designer` ou `agente`, com o id da tarefa do agente. O histórico mostra quem fez o quê.

### 4. Identidade visual como variável, não como valor solto

- Cores, estilos de texto, espaçamentos e efeitos podem ser **tokens nomeados** do documento ou da conta (`cor/primaria`, `texto/titulo-1`).
- Um nó guarda a referência ao token. Trocar o token troca todos os nós que o usam, e é assim que o agente aplica uma identidade visual inteira numa operação.
- Na exportação para PSD, o token vira o valor resolvido, porque o PSD não tem variável. Ver ADR 028.

### 5. O agente enxerga por três vias, todas baratas

1. **Resumo estruturado**: árvore compacta com id, nome, tipo, caixa delimitadora, texto e tokens. Gerado sob demanda, com profundidade e filtro.
2. **Render**: qualquer nó ou região, na escala pedida, em PNG. O motor é o mesmo do editor (ADR 030), então o que o agente vê é o que o designer vê.
3. **Verificação por regras** (lint de design): texto transbordando da caixa, nó fora da prancheta, contraste abaixo de 4,5:1 em texto, fonte ausente, imagem com resolução efetiva menor que a de saída, nós sobrepostos por engano e valor solto onde existe token.

### 6. Nenhum tipo entra no documento sem mapeamento declarado para PSD

Todo tipo de nó, propriedade, modo de mesclagem e efeito tem, no código, uma entrada na tabela de mapeamento do ADR 028. Essa entrada diz se o elemento vira coisa **nativa editável**, **rasterizada com aviso** ou **bloqueada na v1**. Adicionar recurso sem essa entrada quebra o CI.

### 7. Determinismo

Mesmo documento, mesmas fontes, mesmo motor: mesmos pixels. É requisito para teste de regressão visual e para o agente conferir o próprio trabalho. As fontes são arquivos da conta, nunca fontes do sistema operacional.

## Consequências

- `packages/documento`: TypeScript puro, sem dependência de navegador nem de Nest. Contém esquema, operações, aplicador de transação, resumo estruturado e lint. É usado por editor, API e agente.
- O catálogo de operações é o contrato mais importante do produto. Mudança nele passa por teste de contrato e por migração de documentos (`versaoDoFormato`).
- O editor fica mais trabalhoso de construir, porque todo gesto precisa virar operação. Em troca, o agente não precisa de nenhum caminho paralelo.
- Colaboração em tempo real (fora da v1) fica mais barata depois: um log de operações é a base de OT ou CRDT.

## Evidência comportamental (fichas)

- **"O agente acerta mais com resumo estruturado + render do que só com screenshot."** Tipo: desempenho do modelo, não comportamento humano. Grau: **hipótese**, apoiada no custo observado nos testes do Felipe com MCP. **O que mata:** no conjunto de avaliação do ADR 029, a taxa de tarefa concluída com resumo + render não supera a variante só com render.

## Gatilho de revisão

- Se mais de 20% das tarefas do conjunto de avaliação falharem por falta de operação no catálogo, o catálogo está pequeno demais. Rever antes de escrever mais editor.
- Se um tipo de nó precisar ser "bloqueado na v1" por falta de mapeamento PSD e aparecer em mais de 10% dos briefings de teste, rever o item 6 para aquele tipo.
