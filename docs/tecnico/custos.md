# Custos de infraestrutura e de inferência

Levantamento de 2026-09-26 para o agente do [ADR 029](../decisoes/029-agente-proprio-operando-o-documento.md). Premissa dada pelo Felipe: a inferência roda na DigitalOcean (Serverless Inference), porque já existe crédito lá.

Regra deste documento: todo número tem fonte (URL) ou está marcado **[ESTIMATIVA]** com a premissa ao lado. O que não foi conferido está escrito **não verificado**. Preços em dólar; conversão para real pela cotação da seção 7.

## 0. Resumo: o ADR 029 cabe na DigitalOcean?

| Requisito do ADR 029 | Na DigitalOcean, com Claude | Estado |
|---|---|---|
| Tool use | Documentado: "All commercial models from Anthropic and OpenAI available on DigitalOcean support tool (function) calling"; o endpoint `/v1/messages` declara "full compatibility with Anthropic's tool-use schema" | **Verificado em documentação.** Não testado |
| Imagem (visão) na entrada | **Não documentado para Claude.** A página de multimodal cita só Nemotron Nano 12B v2 VL e Kimi K2.6. A página de modelos não lista visão em nenhum Claude | **Não verificado. É o maior risco** |
| Cache de prompt com TTL de 1h | Documentado em Chat Completions e Responses (`cache_control` com `ttl` `5m` ou `1h`), com preço de escrita 5m, escrita 1h e leitura por modelo. **No `/v1/messages` (formato Anthropic) o cache não está documentado** | Parcial: verificado nos endpoints compatíveis com OpenAI; **não verificado** no formato Anthropic |
| Streaming | Parâmetro `stream` documentado na referência da API | Verificado em documentação |
| Pensamento adaptativo | A página de modelos lista "Adaptive thinking" no Sonnet 5 e no Opus 5.5; a página de limites diz que "Anthropic's extended thinking" não está disponível | **Contraditório.** Ver risco R4 |
| Acesso aos modelos Anthropic | Contas em Tier 1 e Tier 2 **não têm** acesso a nenhum modelo Anthropic | **Bloqueante até conferir o tier da conta do Felipe** |

Conclusão curta: preço igual ao da Anthropic, tool use documentado, cache documentado só no formato OpenAI, **visão com Claude sem nenhuma documentação**. O spike do agente começa por essas duas perguntas, antes de qualquer medição de custo.

## 1. Modelos Claude servidos pela DigitalOcean

Fonte: [Supported Models on DigitalOcean Inference](https://docs.digitalocean.com/products/inference/details/models/) (atualizada em 25/09/2026).

| Modelo | ID na DigitalOcean | ID na Anthropic | Contexto (DO) | Saída máx. (DO) | Saída máx. (Anthropic) | Recursos listados pela DO |
|---|---|---|---|---|---|---|
| Claude Sonnet 5 | `anthropic-claude-5-sonnet` | `claude-sonnet-5` | 1M | 128K | 128K | Prompt caching, Tool (function) calling, Adaptive thinking (padrão: ligado, esforço high) |
| Claude Opus 5.5 | `anthropic-claude-opus-5.5` | `claude-opus-5-5` | 1M | 128K | 128K | Prompt caching, Tool calling, Fast mode, Adaptive thinking (padrão: ligado, esforço medium) |
| Claude Haiku 4.5 | `anthropic-claude-haiku-4.5` | `claude-haiku-4-5` | 200K | **8.192** | **64K** | Prompt caching, Tool calling |

Os três modelos candidatos estão lá. Nenhuma linha de Claude menciona visão ou imagem.

Fontes da coluna Anthropic: [Models overview](https://platform.claude.com/docs/en/about-claude/models/overview). A mesma página diz que "all current models support text and image input" **na API da Anthropic**, e que a retirada do **Haiku 4.5** é "not sooner than October 15, 2026", daqui a menos de três semanas. A data de fim de suporte do Haiku 4.5 na DigitalOcean: **não verificada**.

A DigitalOcean também serve Fable 5.1, Fable 5, Opus 5, Opus 4.8/4.7/4.6/4.5, Sonnet 4.6 e 4.5 (mesma fonte). O Opus 5.5 chegou lá em 25/09/2026 ([blog da DigitalOcean](https://www.digitalocean.com/blog/whats-new-on-inference-engine)).

## 2. Recursos da API via DigitalOcean

| Recurso | O que está documentado | Fonte |
|---|---|---|
| Formato OpenAI | `/v1/chat/completions` e `/v1/responses` em `https://inference.do-ai.run` | [Serverless Inference API Endpoints](https://docs.digitalocean.com/products/inference/how-to/si-endpoints/) |
| Formato Anthropic | `/v1/messages`, com cabeçalhos `x-api-key` e `anthropic-version: 2023-06-01`. O exemplo da página usa `anthropic-claude-4.6-sonnet` | [How to Use Messages API](https://docs.digitalocean.com/products/inference/how-to/use-messages-api/) (13/07/2026) |
| Tool use | "full compatibility with Anthropic's tool-use schema" (`/v1/messages`); parâmetro `tools` no chat completions | Mesma página; [referência da API](https://docs.digitalocean.com/reference/api/reference/serverless-inference/); [Inference Features](https://docs.digitalocean.com/products/inference/details/features/) |
| Imagem de entrada | Formato `image_url` (PNG, JPG, JPEG, WEBP; base64 ou HTTPS) documentado para modelos de visão **não Anthropic**. Limite de tamanho de imagem: não publicado | [How to Use Multimodal Inference](https://docs.digitalocean.com/products/inference/how-to/use-multimodal-inference/) (09/09/2026) |
| Imagem com Claude | **Não verificado.** Nenhuma página de documentação afirma nem nega | — |
| Cache: forma | `cache_control: {"type": "ephemeral", "ttl": "5m" \| "1h"}` em partes de conteúdo; exemplo inclui mensagem de ferramenta. Uso devolvido em `cache_created_input_tokens` e `cache_read_input_tokens`, com quebra por TTL | [How to Use Prompt Caching](https://docs.digitalocean.com/products/inference/how-to/use-prompt-caching/) (20/08/2026) |
| Cache: endpoints | A página cobre "chat completions and responses APIs". O `/v1/messages` não é citado | Mesma página |
| Cache: mínimo | "typically between 512 and 4,096 tokens", por modelo | Mesma página |
| Cache: automático | Pelo Inference Router, a DO aplica `cache_control` sozinha em requisições elegíveis | [Inference Features](https://docs.digitalocean.com/products/inference/details/features/) |
| Cache de imagem | Não documentado na DO. Na Anthropic, imagens em turnos de usuário são cacheáveis | [Prompt caching (Anthropic)](https://platform.claude.com/docs/en/build-with-claude/prompt-caching) |
| Streaming | Parâmetro `stream` nos dois endpoints | [Referência da API](https://docs.digitalocean.com/reference/api/reference/serverless-inference/) |
| Pensamento | "features like Anthropic's extended thinking are not available" (limites) × "Adaptive thinking" listado por modelo (modelos) | [Inference Limits](https://docs.digitalocean.com/products/inference/details/limits/); [Supported Models](https://docs.digitalocean.com/products/inference/details/models/) |
| Lote (batch) | Até 50% de desconto em Anthropic, **só prompt de texto**; requisições multimodais não são aceitas em lote | [Pricing](https://docs.digitalocean.com/products/inference/details/pricing/); [Limits](https://docs.digitalocean.com/products/inference/details/limits/) |
| Tamanho máximo de requisição, timeout | Não publicado | [Inference Limits](https://docs.digitalocean.com/products/inference/details/limits/) |
| Files API, betas da Anthropic (esforço por mensagem, orçamento de tarefa etc.) | **Não verificado** | — |

### Limites de taxa

Fonte: [Inference Limits](https://docs.digitalocean.com/products/inference/details/limits/) (21/09/2026). Os valores são tetos por tier; "some models carry lower limits", e o valor real vem nos cabeçalhos `x-ratelimit-*` de cada resposta.

| Tier | RPM | TPM | Acesso a Anthropic |
|---|---|---|---|
| 1 | 120 | 1,5M | **Não** |
| 2 | 120 | 3M | **Não** |
| 3 | 180 | 5M | Sim |
| 4 | 360 | 12M | Sim |
| 5 | 1.200 | 25M | Sim |
| Enterprise | sob consulta | sob consulta | Sim |

Como a conta sobe de tier: **não publicado**. A página de limites manda pedir aumento ao suporte. A referência da API cita outro limite, "5000 requests/hour, 250/minute" ([referência](https://docs.digitalocean.com/reference/api/reference/serverless-inference/)); qual dos dois vale para Claude: **não verificado**.

## 3. Preço por milhão de tokens: DigitalOcean × Anthropic

Fontes: [DigitalOcean Inference Pricing](https://docs.digitalocean.com/products/inference/details/pricing/) ("Last verified 25 Sep 2026") e [Anthropic Pricing](https://platform.claude.com/docs/en/about-claude/pricing).

| Modelo | Onde | Entrada | Saída | Escrita cache 5m | Escrita cache 1h | Leitura cache |
|---|---|---|---|---|---|---|
| Sonnet 5 | DigitalOcean | US$ 2,00 | US$ 10,00 | US$ 2,50 | US$ 4,00 | US$ 0,20 |
| Sonnet 5 | Anthropic | US$ 2 | US$ 10 | US$ 2,50 | US$ 4 | US$ 0,20 |
| Opus 5.5 | DigitalOcean | US$ 4,00 | US$ 20,00 | US$ 5,00 | US$ 8,00 | US$ 0,20 |
| Opus 5.5 | Anthropic | US$ 4 | US$ 20 | US$ 5 | US$ 8 | US$ 0,20 |
| Opus 5.5 modo rápido | DigitalOcean | US$ 8,00 | US$ 40,00 | US$ 10,00 | US$ 16,00 | US$ 0,40 |
| Haiku 4.5 | DigitalOcean | US$ 1,00 | US$ 5,00 | US$ 1,25 | US$ 2,00 | US$ 0,10 |
| Haiku 4.5 | Anthropic | US$ 1 | US$ 5 | US$ 1,25 | US$ 2 | US$ 0,10 |

**Preço idêntico nos três modelos.** A DigitalOcean não cobra ágio nem dá desconto sobre a tabela da Anthropic. Escolher entre as duas é decidir por recurso, limite e crédito, nunca por preço de token.

Notas da Anthropic que valem para a conta (mesma fonte):
- O Sonnet 5 a US$ 2 / 10 **virou preço padrão**; o aumento para US$ 3 / 15 previsto para 01/09/2026 não vai acontecer.
- A leitura de cache do Opus 5.5 custa 0,05× a entrada; nos outros dois, 0,1×. Escrita de 5m custa 1,25×; escrita de 1h, 2×.
- Contexto de 1M sem sobrepreço a partir da geração 4.6.
- Declarar ferramentas soma um prompt de sistema fixo: **354 tokens no Sonnet 5, 286 no Opus 5.5, 496 no Haiku 4.5** (com `tool_choice` auto).
- A partir da geração 4.7, o tokenizador produz "approximately 30% more tokens for the same text". Vale para Sonnet 5 e Opus 5.5, não para Haiku 4.5.

### Mínimo cacheável

Fonte: [Prompt caching (Anthropic)](https://platform.claude.com/docs/en/build-with-claude/prompt-caching). Abaixo do mínimo, o cache não é criado e nenhum erro aparece (`cache_creation_input_tokens: 0`).

| Modelo | Mínimo |
|---|---|
| Opus 5.5 | 512 tokens |
| Sonnet 5 | 1.024 tokens |
| Haiku 4.5 | 4.096 tokens |

Até 4 pontos de cache por requisição (mesma fonte). Um prefixo de 8 a 15 mil tokens passa do mínimo nos três modelos.

### Como a imagem é cobrada

Fonte: [Vision (Anthropic)](https://platform.claude.com/docs/en/build-with-claude/vision).

A regra atual **não é mais** `(largura × altura) / 750`. A imagem vira blocos de 28 × 28 px: **tokens = ⌈largura / 28⌉ × ⌈altura / 28⌉**, cobrados como tokens de entrada. A regra antiga dá números próximos nesses tamanhos:

| Render enviado ao modelo | Tokens (regra atual) | Tokens (regra /750) | Custo por imagem no Sonnet 5 | No Haiku 4.5 |
|---|---|---|---|---|
| 768 × 768 | 784 | 786 | US$ 0,0016 | US$ 0,0008 |
| 1024 × 768 | 1.036 | 1.049 | US$ 0,0021 | US$ 0,0010 |
| 1024 × 1024 | 1.369 | 1.398 | US$ 0,0027 | US$ 0,0014 |

Custo por imagem = tokens × preço de entrada sem cache. **[ESTIMATIVA]**: aritmética sobre a regra e a tabela acima.

Limites da Anthropic (mesma fonte):

| Limite | Valor |
|---|---|
| Resolução máxima sem redução, Claude 4.7 em diante (Sonnet 5, Opus 5.5) | Lado maior 2.576 px, até 4.784 tokens |
| Resolução máxima sem redução, demais (Haiku 4.5) | Lado maior 1.568 px, até 1.568 tokens |
| Dimensão máxima | 8.000 × 8.000 px; acima de 20 imagens na requisição, limite mais estrito (manter até 2.000 px) |
| Imagens por requisição | 600 (100 em modelos de 200K, como o Haiku 4.5) |
| Tamanho por imagem | 10 MB em base64 na API direta |
| Tamanho da requisição | 32 MB na API direta |
| Formatos | JPEG, PNG, GIF, WebP |

Os limites equivalentes via DigitalOcean: **não verificados**. Renders de 768 a 1.024 px ficam abaixo do teto de redução nos três modelos, então o custo é o da tabela.

Consequência para o ciclo do agente: cada volta reenvia o histórico, **inclusive as imagens das voltas anteriores**. Sem cache, uma imagem mandada na volta 1 de 5 é paga quatro vezes. Em base64, ela também pesa no tamanho de cada requisição.

## 4. Crédito da DigitalOcean vale para a inferência?

| Pergunta | Resposta | Fonte |
|---|---|---|
| Como se paga a inferência | "Serverless inference is prepaid only": saldo pré-pago positivo, uso debitado dele. Com saldo zero, o acesso é suspenso. Há recarga automática configurável | [Pricing](https://docs.digitalocean.com/products/inference/details/pricing/); [Manage Serverless Inference Prepayment](https://docs.digitalocean.com/products/inference/how-to/manage-serverless-inference-prepayment/) (21/09/2026) |
| Crédito promocional genérico da conta vira saldo de inferência | **Não verificado.** A página de pré-pagamento não diz se crédito promocional pode financiar o saldo. Fontes de terceiros dizem que sim, com o saldo carregado manualmente; não servem como fonte | Mesma página |
| Crédito do programa "Up to $5,000 in DigitalOcean Inference Credits" | Vale **só** para Serverless Inference, **só** em RIC1 e TOR1, até **01/01/2027**, intransferível. Exigia presença no Deploy 2026 (28/04/2026). Não restringe modelo | [Termos da promoção](https://www.digitalocean.com/legal/cloud-credits-ai-qualifying-workloads) |
| Chave própria da Anthropic na DO | Cobrança direta pela Anthropic, **não** consome crédito da DO | [Pricing](https://docs.digitalocean.com/products/inference/details/pricing/) |

**Ação antes do spike:** o Felipe confere no painel (1) que tipo de crédito tem e a validade, (2) se ele aparece como saldo de inferência e (3) em que tier a conta está. Se o crédito for do programa de inferência, ele acaba em 01/01/2027, e o plano de custo depois dessa data é pagar a mesma tabela da Anthropic.

## 5. Outras peças de custo na DigitalOcean

Preços mensais em dólar, das fontes na última coluna.

| Peça | Plano | Especificação | US$/mês | Fonte |
|---|---|---|---|---|
| App Platform, menor | `apps-s-1vcpu-0.5gb` | 1 vCPU compartilhada, 512 MiB, 50 GiB de saída | 5,00 | [App Platform Pricing](https://docs.digitalocean.com/products/app-platform/details/pricing/) (13/07/2026) |
| App Platform | `apps-s-1vcpu-1gb` | 1 vCPU compartilhada, 1 GiB, 150 GiB | 12,00 | Mesma |
| App Platform | `apps-s-2vcpu-4gb` | 2 vCPU compartilhadas, 4 GiB, 250 GiB | 50,00 | Mesma |
| App Platform dedicada | `apps-d-2vcpu-4gb` | 2 vCPU dedicadas, 4 GiB, 500 GiB | 78,00 | Mesma |
| App Platform dedicada | `apps-d-4vcpu-8gb` | 4 vCPU dedicadas, 8 GiB, 700 GiB | 156,00 | Mesma |
| App Platform: saída excedente | — | — | 0,02/GiB | Mesma |
| Droplet básico | 2 vCPU, 4 GiB | — | 24,00 | [Droplet Pricing](https://www.digitalocean.com/pricing/droplets) |
| Droplet CPU-Optimized, menor | 2 vCPU, 4 GiB | — | 42,00 | Mesma |
| Droplet CPU-Optimized | 4 vCPU, 8 GiB | — | 84,00 | Mesma |
| Spaces (S3 + CDN) | Assinatura base | 250 GiB de armazenamento, 1.024 GiB de saída, CDN incluída | 5,00 | [Spaces Pricing](https://docs.digitalocean.com/products/spaces/details/pricing/) (13/07/2026) |
| Spaces: excedente | — | Armazenamento US$ 0,02/GiB/mês; saída US$ 0,01/GiB | — | Mesma |
| PostgreSQL gerenciado, menor | Nó único | 1 GiB de RAM | 15,00 | [PostgreSQL Pricing](https://docs.digitalocean.com/products/databases/postgresql/details/pricing/) (22/09/2026) |
| PostgreSQL gerenciado, alta disponibilidade | Primário 2 GiB / 1 vCPU + réplica | US$ 30 + US$ 30 | 60,00 | Mesma |

Detalhes das fontes: App Platform cobra por segundo com mínimo de 1 minuto; job só cobra enquanto roda. Tráfego com banco gerenciado não conta na franquia de transferência. Saída entre Spaces e Droplet na mesma região é grátis.

### Fixo mensal mínimo **[ESTIMATIVA]**

Premissas: API NestJS num `apps-s-1vcpu-1gb`; `apps/web` num segundo `apps-s-1vcpu-1gb`; worker de render e exportação precisa de 4 GiB para CanvasKit em WASM mais um PSD em memória (**requisito de memória não medido**); banco de nó único; um Spaces.

| Configuração | Composição | US$/mês | R$/mês |
|---|---|---|---|
| Worker no App Platform | 12 + 12 + 50 + 15 + 5 | 94 | 488,72 |
| Worker em Droplet CPU-Optimized | 12 + 12 + 42 + 15 + 5 | 86 | 447,12 |
| Com banco em alta disponibilidade | 94 − 15 + 60 | 139 | 722,67 |

A arquitetura antiga do WhatsApp estimava ~R$ 510/mês de fixo, na mesma ordem.

## 6. Custo por tarefa do agente **[ESTIMATIVA]**

Nada aqui foi medido. É aritmética sobre os preços da seção 3 e as premissas abaixo, feita para saber a ordem de grandeza e o peso de cada alavanca. O spike substitui tudo isto (seção 9).

### Premissas

| Premissa | Tarefa simples: adaptar 1 peça para 3 formatos | Tarefa pesada: 5 variações a partir de um briefing |
|---|---|---|
| Prefixo estável (instruções + ferramentas + tokens da conta), em cache | 8.000 | 15.000 |
| Resumo do documento | 2.000 | 5.000 |
| Briefing do designer | 300 | 1.000 |
| Voltas (requisições ao modelo) | 3 | 5 |
| Renders por volta | 1, a 768 × 768 (784 tokens) | 3, a 1024 × 1024 (4.107 tokens por volta) |
| Saída por volta (texto + chamadas de ferramenta + pensamento) | 1.000 | 3.000 |
| Resultado de ferramenta por volta (lote aplicado, `verificar`) | 500 | 1.500 |
| Renders que chegam ao modelo na tarefa | 2 | 12 |

Como a conta foi feita:
- A requisição *i* reenvia prefixo + resumo + briefing + tudo o que as voltas anteriores produziram (saída, resultados, imagens). As imagens da última volta não entram, porque não há requisição depois dela.
- **Sem cache:** tudo é entrada a preço cheio em toda requisição.
- **Com cache:** o prefixo é lido do cache em toda requisição (está quente, porque é o mesmo para todas as tarefas da conta). O resumo, o briefing e o que cada volta acrescenta são escritos uma vez com TTL de 5 min e lidos nas voltas seguintes.
- A saída inclui o pensamento. O Sonnet 5 vem com pensamento adaptativo ligado e esforço high por padrão, o que pode empurrar a saída acima da premissa.
- Câmbio: R$ 5,1991 (seção 7).

### Tokens por tarefa

| Cenário | Entrada sem cache | Com cache: leitura | Com cache: escrita 5m | Saída |
|---|---|---|---|---|
| Simples | 37.752 | 30.884 | 6.868 | 3.000 |
| Pesada | 191.070 | 150.642 | 40.428 | 15.000 |
| Pesada, renders a 768 px | 173.520 | 140.112 | 33.408 | 15.000 |

### Custo por tarefa

| Cenário | Modelo | Sem cache | Com cache | Economia do cache |
|---|---|---|---|---|
| Simples | Sonnet 5 | US$ 0,106 (R$ 0,55) | US$ 0,053 (R$ 0,28) | 49% |
| Simples | Haiku 4.5 | US$ 0,053 (R$ 0,27) | US$ 0,027 (R$ 0,14) | 49% |
| Simples | Opus 5.5 (referência) | US$ 0,211 (R$ 1,10) | US$ 0,101 (R$ 0,52) | 52% |
| Pesada | Sonnet 5 | US$ 0,532 (R$ 2,77) | US$ 0,281 (R$ 1,46) | 47% |
| Pesada | Haiku 4.5 | US$ 0,266 (R$ 1,38) | US$ 0,141 (R$ 0,73) | 47% |
| Pesada | Opus 5.5 (referência) | US$ 1,064 (R$ 5,53) | US$ 0,532 (R$ 2,77) | 50% |
| Pesada, renders a 768 px | Sonnet 5 | US$ 0,497 (R$ 2,58) | US$ 0,262 (R$ 1,36) | 47% |

Prefixo frio (primeira tarefa depois de 1h sem uso na conta): somar até US$ 0,032 (simples) ou US$ 0,060 (pesada) no Sonnet 5, a escrita de 1h do prefixo.

### O que a conta mostra **[ESTIMATIVA]**

- **Com cache, a saída passa a ser o maior item:** US$ 0,15 dos US$ 0,28 da tarefa pesada no Sonnet 5 (53%). Pensamento e texto entre as chamadas de ferramenta custam mais que as imagens.
- **As imagens pesam pouco no preço direto.** Os 12 renders da tarefa pesada custam ~US$ 0,033 na primeira vez que entram. O que encarece é o reenvio em cada volta seguinte, que o cache absorve. Baixar de 1.024 para 768 px economiza ~7% da tarefa pesada com cache.
- **O cache corta perto de metade**, e mais nas tarefas longas. Sem ele, o custo cresce com o quadrado do número de voltas, porque cada volta reenvia todas as anteriores.
- **O Haiku 4.5 custa metade do Sonnet 5 em qualquer cenário**, porque a tabela dele é metade. Nenhum dado diz se ele faz a tarefa; a avaliação do ADR 029 decide.
- **O Opus 5.5 custa o dobro do Sonnet 5 por token**, mas a leitura de cache sai pelo mesmo US$ 0,20. Se ele fechar a tarefa em menos voltas, a diferença cai. Só o conjunto de avaliação mostra.

## 7. Câmbio

| Data | Taxa | Fonte |
|---|---|---|
| 25/09/2026 (sexta) | R$ 5,1991 por US$ (PTAX, venda) | [boca.com.br, cotação de 25/09/2026](https://boca.com.br/economia/dolar/cotacao-dolar-hoje-mercado-cambio-26-09) |

Fonte secundária; a série oficial do Banco Central **não foi consultada**. Recalcular os valores em real quando o câmbio variar mais de 5%.

## 8. Riscos de fazer isso na DigitalOcean

| # | Risco | O que degrada no ADR 029 | Como sai |
|---|---|---|---|
| R1 | **Claude sem visão via DigitalOcean.** Nenhuma página da DO documenta imagem com Claude | O passo "Conferir" some: sem render lido pelo modelo, o agente não vê o que fez, e a regra "nunca diz que fez o que não conferiu" passa a depender só de `verificar`. O caráter do agente fica mais fraco que o ADR promete | Testar no primeiro dia do spike, nos dois formatos (`image_url` e bloco `image`). Se falhar, a DO não atende o ADR 029 como escrito |
| R2 | **Cache não documentado no `/v1/messages`.** Só Chat Completions e Responses têm documentação | Sem cache, a tarefa custa ~2× (seção 6), e o ADR diz que cache é requisito. Usar o formato OpenAI para ter cache traz outro custo: o adaptador de `ModeloDoAgente` fala um dialeto traduzido, e recursos que só existem no formato Anthropic podem não passar | Medir `cache_read_input_tokens` na segunda requisição nos dois formatos. A porta declara `capacidades` e o núcleo degrada de forma explícita (ADR 020) |
| R3 | **Tier 1 e 2 sem acesso a Anthropic,** sem critério público de promoção | O spike nem começa | Conferir o tier da conta agora; pedir ao suporte se preciso |
| R4 | **Pensamento contraditório:** "extended thinking not available" × "Adaptive thinking" por modelo. O Opus 5.5 não aceita desligar o pensamento na API da Anthropic | Se o pensamento for removido, a qualidade de planejamento cai; se for ignorado em silêncio, o Opus 5.5 pode falhar; se estiver ligado, a saída (o maior item de custo) cresce | Testar `thinking: {type: "adaptive"}` e `output_config.effort` e ler o uso de tokens de saída |
| R5 | **Haiku 4.5 limitado a 8.192 tokens de saída na DO** (64K na Anthropic) e com retirada na Anthropic "not sooner than October 15, 2026" | Um lote de operações grande estoura a saída; o modelo barato pode sair de linha durante o desenvolvimento | Não desenhar nada que dependa do Haiku 4.5 antes de saber a data de retirada nas duas pontas |
| R6 | **Limites de requisição, timeout e tamanho de imagem não publicados** | Renders em base64 reenviados a cada volta aumentam o corpo da requisição; um limite escondido derruba tarefa longa | Medir no spike com a tarefa pesada |
| R7 | **Recursos da Anthropic sem confirmação na DO** (Files API, betas, esforço por mensagem, `strict` em ferramentas) | Sem Files API, toda imagem vai em base64 em toda volta; sem `strict`, o lote de operações pode chegar fora do esquema e precisa de validação e nova tentativa | Listar no spike o que passa e o que é recusado |
| R8 | **Cache de quem?** Na Anthropic o cache é isolado por workspace. Via DO, o isolamento entre clientes da DO é problema da DO e **não está documentado** | Toca o ADR 023: o prefixo tem tokens da conta. O risco é baixo, mas não tem documentação | Perguntar à DO; manter o id opaco da conta no prefixo, como o ADR 023 já pede |
| R9 | **Crédito com prazo e escopo** | Se for o crédito de inferência, acaba em 01/01/2027 e vale só em RIC1/TOR1. Depois disso, a vantagem da DO some, porque o preço é igual ao da Anthropic | Conferir tipo e validade do crédito |
| R10 | **Saldo pré-pago zerado suspende a inferência** | O agente para no meio de uma tarefa do designer | Recarga automática ligada e alerta de saldo |

Nota sobre o que o documento antigo dizia: a ressalva "sem TTL de cache controlável" era sobre os modelos abertos. Para Claude, a DO documenta TTL de 5m e 1h, com preço, no formato OpenAI. A ressalva que continua é outra: o formato Anthropic não tem cache documentado.

## 9. O que medir no spike do agente para trocar estimativa por dado

Ordem: primeiro o que bloqueia (1 a 4), depois o custo.

| # | Medida | Critério | Se falhar |
|---|---|---|---|
| 1 | Conta está em Tier 3 ou acima e lista os três modelos em `GET /v1/models` | Os três IDs da seção 1 respondem | Pedir ao suporte; enquanto isso, o spike roda na API da Anthropic para não travar |
| 2 | Claude recebe imagem via DO | O modelo descreve corretamente um render com texto e cor conhecidos, nos formatos `image_url` (chat completions) e `image` (`/v1/messages`) | R1: a DO não atende o ADR 029 |
| 3 | Cache funciona no formato escolhido | Segunda requisição com o mesmo prefixo devolve `cache_read_input_tokens` ≥ tamanho do prefixo e `cache_created_input_tokens` ≈ 0; TTL de 1h aceito | R2: custo ~2×; decidir entre formato OpenAI e fornecedor direto |
| 4 | Tool use com o catálogo real | `aplicarOperacoes` com esquema completo chega válido em 20 chamadas seguidas; registrar quantas precisaram de nova tentativa | Rever o esquema ou o formato de API |
| 5 | Tokens reais por parte | Por requisição: prefixo, resumo, histórico, imagens, saída e pensamento separados (`usage` + `count_tokens`) | — |
| 6 | Voltas por tarefa | Distribuição de voltas nas tarefas do conjunto de avaliação, não média | — |
| 7 | Saída real com pensamento | Tokens de saída por volta com esforço low, medium e high no Sonnet 5 | Ajustar o esforço padrão |
| 8 | Custo por tarefa aceita | Custo total ÷ tarefas aceitas inteiras ou em parte, por modelo. Tarefa desfeita custa e não entrega | É a medida que vai sustentar o preço (ADR 029, item 5) |
| 9 | Tamanho mínimo de render que resolve | Mesmas tarefas com render a 512, 768 e 1.024 px; comparar acerto e custo | — |
| 10 | Latência | Tempo até o primeiro token e tempo total de tarefa, DO × Anthropic direta | Se a DO for muito mais lenta, pesa contra ela mesmo com crédito |
| 11 | Paridade de resultado | As mesmas 10 tarefas na DO e na Anthropic direta dão o mesmo resultado e o mesmo `usage` | Diferença indica recurso filtrado pelo intermediário |
| 12 | Limites | Tamanho máximo de requisição e timeout: tarefa pesada com 12 renders em base64 | R6 |
| 13 | Memória do worker de render | Pico de RAM do CanvasKit no Node ao renderizar e exportar o documento maior do conjunto | Define o plano da seção 5 |

O resultado vira uma linha por tarefa no registro do ADR 029 (tokens de entrada, saída, cache, imagens, voltas, resultado). Com isso, a tabela da seção 6 deixa de ser estimativa.
