# @otto/documento

Núcleo do documento do Otto (ADR 027): esquema em zod, catálogo de operações, transação, resumo e lint. TypeScript puro, sem `node:`, sem framework, sem motor de render. Roda igual no navegador, na API e no worker.

Veio de `poc/src/documento/`. Dono: especialista-grafico.

```bash
docker compose run --rm teste pnpm --filter @otto/documento test
docker compose run --rm teste pnpm --filter @otto/documento typecheck
```

## O que mudou em relação à POC

| Mudança | Por quê | Como usar |
|---|---|---|
| `aplicarLote(doc, operacoes, contexto)`, com `contexto = { autoria, idDoLote, medidor? }` | Id de nó novo sai do id do lote, do índice da operação e da ordem dentro dela (`ids.ts`, UUID versão 8). Navegador e servidor, com o mesmo lote, chegam à mesma árvore | Quem cria o lote gera o `idDoLote` (o editor ou o agente) e quem aplica de novo repete o mesmo |
| Nada é mutado, e o que o lote não tocou continua sendo o mesmo objeto | O cache do motor de render é por identidade da prancheta; os seletores do editor, por identidade do nó | Compare por referência. Trocar um token de cor não troca a prancheta: quem guarda render em cache olha também `doc.tokens.cores` |
| Medidor de tinta e meios de verificação são portas (`Medidor`, `MeiosDeVerificacao`) | O documento não importa o render | `criarMedidor(sessao)` e `criarMeiosDeVerificacao(sessao)` vêm de `@otto/render` |
| Nome e id do documento saíram da árvore | São do registro (conta, nome, datas). Renomear a peça não é operação do catálogo nem passo do histórico | `documentoVazio()` não recebe nome. `resumirDocumento(doc, { nome })` mostra o nome ao agente, se quem chama passar. Documento da POC, com as duas chaves, continua válido: elas são ignoradas |
| Erro de validação em português | O agente lê o erro e corrige | `descreverErro(erro)` |
| `OPERACOES_QUE_MEDEM` e `loteDependeDeMedida(operacoes)` | `alinhar` e `distribuir` só dão o mesmo resultado nos dois lados com o mesmo medidor | O editor passa `motor.medidor`; a API, `criarMedidor(sessao)` |
| `disporPranchetas`, `caixaDasPranchetas`, `deslocarNo`, `deslocarNos` (`geometria.ts`) | Motor, sobreposições e teste de alvo precisam da mesma posição de prancheta; a prévia de arrastar precisa deslocar sem mutar | — |
| `acharEm`, `noSobOPonto`, `noContemPonto` (`alvo.ts`) | Teste de alvo do editor: que camada está sob o ponto, com a rotação e a forma dela (elipse, canto arredondado). Texto, foto e vetor respondem pela caixa. Camada oculta, bloqueada ou dentro de grupo oculto ou bloqueado não é alvo (`comBloqueadas` muda isso); `folga` aumenta a área, para pegar o que é fino em zoom baixo | `acharEm(doc, pontoNoPlanoDoEditor, { folga: 4 / zoom })` devolve `{ prancheta, no? }` |
| `definirToken` devolve em `tocados` as camadas que usam o token | A marca de "camada tocada" e o cache precisam saber | — |

## O que não veio

- Lote inverso (desfazer otimista): pedido do frontend e do backend, ainda não feito.
- Teste de alvo (que camada está sob o ponteiro), com rotação.
- A biblioteca de fontes da POC (`poc/src/render/fontes.ts`, com nome PostScript e uso de cada família): entra com o PSD e o agente.
- `conferirTextoDoCliente`: é do agente.
