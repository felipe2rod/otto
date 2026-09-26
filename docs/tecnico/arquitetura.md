# Arquitetura

Visão técnica de conjunto. As decisões estão nos ADRs 008, 009, 019, 020, 023 e 026–030. Este documento as junta num desenho só.

## Monorepo (pnpm)

```
apps/
  web/            Next.js: site público (SSG) + /editor (dinâmico, noindex)   ADR 019
  api/            NestJS: contas, documentos, arquivos, agente, exportação     ADR 008, 009
packages/
  documento/      esquema zod, catálogo de operações, transação, resumo, lint  ADR 027
  render/         CanvasKit (Skia WASM), mesmo código no navegador e no Node  ADR 030
  psd/            mapeamento Otto ↔ PSD, atrás de FormatoDeArquivoEmCamadas   ADR 028
  agente/         ciclo do agente, ferramentas, prompts (sem Nest)             ADR 029
  shared/         tipos e utilitários comuns
avaliacao/        conjunto de tarefas de design do agente (dono: treinador-do-otto)
```

`documento`, `render`, `psd` e `agente` são núcleo: não importam Nest, Next nem fornecedor (ADR 008 e 020).

## Fluxo de uma edição do designer

1. Um gesto no editor vira uma operação do catálogo (`mover`, `alterar`...).
2. `packages/documento` valida e aplica localmente (resposta imediata no canvas).
3. O lote vai à API, que aplica em transação no documento salvo e grava o lote no histórico com autoria `designer`.
4. Se a API recusar (versão desatualizada, validação), o editor desfaz localmente e mostra o motivo.

## Fluxo de uma tarefa do agente

1. A pessoa preenche o formulário de briefing (caminho padrão), usa um briefing salvo ou, em segundo plano, escreve um pedido livre (ADR 033). A API cria uma tarefa (`tarefas_do_agente`) e a enfileira (pg-boss).
2. O worker revalida a conta dona da tarefa (ADR 023: o payload é hipótese) e roda o ciclo do ADR 029: resumo, plano, lotes de operações, render no servidor, verificação.
3. Cada lote aplicado é gravado no histórico com autoria `agente` e o id da tarefa, dentro de um **conjunto de alterações** pendente.
4. O editor recebe o progresso por stream e mostra o conjunto para revisão: aceitar, aceitar em parte, desfazer.
5. Tokens, imagens, voltas e resultado são gravados por tarefa (custo, ADR 029 item 5).

## Fluxo de exportação PSD

1. O pedido vira job na fila.
2. O worker renderiza cada camada e a composta com `packages/render` e monta o PSD com `packages/psd`.
3. O arquivo vai para `ArmazenamentoDeArquivo`, e o relatório de exportação fica gravado junto.
4. O designer baixa por link assinado e de curta duração.

## Dados

- `documentos`: metadados e ponteiro para a versão atual.
- `versoes_de_documento`: árvore JSON por versão (snapshot periódico).
- `operacoes`: log de lotes entre snapshots, com autoria e tarefa.
- `arquivos`: imagens e fontes por hash de conteúdo, por conta.
- `tokens`: identidade visual por conta ou por documento.
- `briefings`: modelos reutilizáveis da conta (ADR 033).
- `conexoes_de_banco`: banco de imagens ligado pela conta, com a chave criptografada (ADR 032).
- Cache de busca em banco de imagens por 24 h (exigência do Pixabay).
- `tarefas_do_agente`, `exportacoes`.

Toda tabela leva o id da conta, com RLS (ADR 023).

## Portas (ADR 020)

| Porta | Adaptador inicial | Estado |
|---|---|---|
| `ModeloDoAgente` | Claude via DigitalOcean (imagem e cache a confirmar no spike) | ADR 029 |
| `FormatoDeArquivoEmCamadas` | ag-psd (a verificar no spike) | ADR 028 |
| `ArmazenamentoDeArquivo` | S3-compatível | ADR 020 |
| `BancoDeImagens` | Pixabay (chave do Otto); outros com chave da conta | ADR 032 |
| `BarramentoDeEventos` | pg-boss | ADR 009 |
| `ProvedorDeAssinatura` | a decidir | ADR 020, nota |
| Repositórios | Prisma | ADR 009 |

## Pendências técnicas

- Resultado dos três spikes (visão, "Primeira entrega técnica").
- Estratégia de snapshot × log de operações (a cada N operações? por tamanho?).
- Cache de camadas no editor para documentos grandes.
- Limite de tamanho de documento e de arquivo por conta.
- Imagem e cache de Claude via DigitalOcean (ADR 029, item 4.1).
