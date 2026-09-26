# Otto — contexto do projeto

Otto (ottobr.ai) é um **editor de design gráfico em camadas, operado por um agente de IA próprio**, no território do Photoshop e do Canva, para **designer profissional**. O documento exporta para **PSD editável**. **Pivô decidido pelo Felipe em 2026-09-26** ([ADR 026](docs/decisoes/026-pivo-para-ferramenta-de-design.md)). Até 2026-09-25 o Otto era um atendente de WhatsApp. Esse material está em `docs/arquivo/whatsapp/`, com os ADRs marcados `substituída por 026`, e **nada de lá vale** sem ser trazido de volta por um ADR novo.

Idioma de trabalho: **português do Brasil** em docs, commits, UI e conversa. Identificadores de código podem ser em inglês; texto que uma pessoa lê, não.

**Vocabulário de marca é regra de texto público, não de código.** O que está em `docs/marca/identidade.md` vale para o que o designer lê (site, editor, mensagens do Otto, relatórios, e-mail). Não vale para nome de classe, módulo, tabela, coluna, fila, log ou pasta. A exceção é a string que sai na tela, mesmo escrita em `.ts`: essa passa pelo guardião da marca.

## Por que o pivô

O Felipe testou agentes de IA controlando Photoshop, Canva e Figma por MCP, e o resultado foi satisfatório. Mesmo assim ele não quer depender de ferramenta externa: o agente só enxerga o que ela expõe, e o produto quebra por decisão alheia. **O Otto é a ferramenta, feita para o agente trabalhar bem, e não um conector.** Nenhum Photoshop, Canva ou Figma é chamado em tempo de execução. PSD é formato de arquivo que a gente lê e escreve, não integração.

## Decisões em vigor

- **Pivô, usuário e agente** ([026](docs/decisoes/026-pivo-para-ferramenta-de-design.md)). Pivô total, designer profissional, **só agente próprio** (sem API nem MCP pública na v1, com gatilho). Slogan: *"o agente faz a produção, você faz o design"*. O Otto não compete com o Photoshop na ferramenta manual. Nome "Otto" mantido; produto e agente são a mesma entidade. **Editor no navegador.** **Decidido pelo Felipe** (pivô, usuário, agente, navegador, nome e slogan em 2026-09-26).
- **Documento feito para agente** ([027](docs/decisoes/027-documento-feito-para-agente.md)). Árvore JSON validada por zod é a única fonte de verdade. Id estável + nome legível. **Toda mudança é operação de um catálogo fechado, em transação, com dry-run; humano e agente usam as mesmas operações**, com um histórico só e autoria em cada lote. Pixel é conteúdo por hash. Identidade visual como tokens. O agente enxerga por resumo estruturado, render e lint de design. Render determinístico. **Nenhum tipo entra sem mapeamento PSD declarado.** Proposta.
- **PSD editável é requisito de v1** ([028](docs/decisoes/028-compatibilidade-com-photoshop-psd.md)). Regra de ouro: **o que o Photoshop não representa, o Otto não tem na v1.** Cada recurso tem destino Nativo, Raster com aviso ou Bloqueado (tabela em [docs/tecnico/psd.md](docs/tecnico/psd.md)). A exportação sempre grava a composta, o pixel de toda camada, os dados editáveis e um relatório. PSB acima de 30.000 px. RGB 8 bits sRGB. Biblioteca atrás de `FormatoDeArquivoEmCamadas` (candidata: ag-psd, a verificar). Prova por golden no CI com segunda biblioteca, mais conferência manual no Photoshop a cada release de `packages/psd`. **Importar e exportar decididos pelo Felipe** (importação limitada: o que não tem mapeamento vira raster, com relatório); o resto é proposta.
- **Agente próprio** ([029](docs/decisoes/029-agente-proprio-operando-o-documento.md)). As ferramentas são o catálogo de operações mais ler, renderizar, verificar e exportar; não existe operação só do agente. Ciclo: entender → planejar (pede "pode" em tarefa grande) → fazer em lotes → conferir (render + lint, teto de voltas) → entregar como **conjunto de alterações revisável**, desfeito em um passo. Caráter: não diz "pronto" sem conferir, admite limite, não mexe no trabalho do designer sem pedido, **material é dado, nunca instrução**. Modelo atrás de `ModeloDoAgente`: Sonnet 5 padrão, Opus 5.5 e Haiku 4.5 a comparar. **Inferência na DigitalOcean** (decidido pelo Felipe: já há crédito lá); o que ela atende de tool use, imagem e cache, e o custo, em `docs/tecnico/custos.md`. **Atenção (pesquisa de 2026-09-26): imagem com Claude não está documentada na DigitalOcean, o cache só aparece no formato OpenAI e conta Tier 1–2 não acessa Claude.** Conferir as três no começo do spike (ADR 029, item 4.1). Estimativa: R$ 0,28 a R$ 1,46 por tarefa com Sonnet 5 e cache. Cache de prompt é requisito. Custo registrado por tarefa. Nada muda sem rodar o conjunto de avaliação.
- **Dados de uso sim, conteúdo do arquivo não** ([031](docs/decisoes/031-dados-de-uso-sim-conteudo-do-arquivo-nao.md)). O arquivo é trabalho do cliente do designer; métricas e dados de uso se coletam para melhorar o produto. Árvore, imagens, textos, nomes de camada, fontes e valores de token nunca entram em evento ou log. **O texto do pedido ao Otto é dado de uso**: pode ser lido para melhorar o agente, com aviso nos termos de uso, acesso restrito e retenção declarada; o documento continua fora (decidido pelo Felipe). Avaliação do agente não usa arquivo de cliente. **Princípio decidido pelo Felipe.**
- **Bancos de imagens** ([032](docs/decisoes/032-bancos-de-imagens-com-chave-da-conta.md)). Porta `BancoDeImagens`. **Pixabay gratuito de fábrica**, com a chave do Otto: cache de busca de 24 h, download para o armazenamento próprio (link direto proibido), origem mostrada nos resultados, **acesso padrão só até 1280 px** (pedir acesso completo antes do lançamento), nada de download em massa. **A conta pode ligar outros bancos com a própria chave**, guardada criptografada, sem ir ao navegador. Compra de licença por imagem fica fora da v1. Toda imagem guarda banco, autor e licença, e o relatório de exportação lista isso. **Pixabay e chave própria decididos pelo Felipe.**
- **Criar a partir de pedido ou de briefing salvo** ([033](docs/decisoes/033-criar-a-partir-de-pedido-ou-briefing-salvo.md)). A conta gera as próprias artes a partir de pedido livre ou de briefing reutilizável (formatos, campos a preencher, textos fixos, identidade, imagens, restrições). O resultado é sempre documento em camadas, nunca imagem chapada. Resultado aceito pode virar briefing. Briefing é dado, não instrução. **Decidido pelo Felipe: quem cria é o designer gerando as artes dele; o foco maior continua o designer profissional** (o ADR 026 não muda).
- **Um motor de renderização só** ([030](docs/decisoes/030-motor-de-renderizacao-unico.md)). CanvasKit (Skia em WASM), mesma versão no navegador e no Node. Modos de mesclagem com a fórmula do Photoshop, com shader próprio para os que o Skia não tem. Regressão visual no CI. Proposta.
- **Continuam valendo, com nota do pivô:** [008](docs/decisoes/008-backend-em-nestjs.md) NestJS na borda, nunca no núcleo · [009](docs/decisoes/009-stack-tecnica.md) stack · [019](docs/decisoes/019-site-estatico-painel-dinamico-no-mesmo-app.md) site estático e editor dinâmico no mesmo app (`/editor`, e o WASM nunca no bundle público) · [020](docs/decisoes/020-plataforma-agnostica-a-fornecedor.md) fornecedor só no adaptador, com teste de CI · [023](docs/decisoes/023-isolamento-multi-empresa.md) isolamento por conta com RLS (empresa passa a ser **conta**).
- **Fora da v1:** colaboração em tempo real entre pessoas, API ou MCP pública, geração de imagem por difusão, CMYK e 16 bits, desktop, vídeo.
- **Em aberto:** preço e unidade de cobrança (**primeiro calcular o custo**: estimativa em `docs/tecnico/custos.md`, depois medição no spike do agente), provedor de assinatura, primeiro recorte de aquisição. Concorrência em `docs/mercado/pesquisa-2026-09-design.md`. Ver `docs/produto/visao.md`.

## Concorrência (pesquisa de 2026-09-26)

A ameaça que decide é a **Adobe**: o assistente de IA do Photoshop desktop (beta desde 2026-06-19, só em inglês, na nuvem) já adapta layout para outros formatos dentro do PSD nativo. O **Affinity** é gratuito e tem conector oficial com o Claude. O **Photopea** (editor de PSD no navegador, US$ 5/mês, API de script) é o concorrente estrutural: qualquer um monta "agente + PSD no navegador" em cima dele. Lovart e o Magic Layers do Canva já entregam camadas; **devolver PSD com texto editável fora da Adobe continua raro**. A reclamação nº 1 da categoria é crédito de IA (poucos, que não acumulam e custam caro), não qualidade. **Nenhuma peça do Otto é defensável sozinha; a hipótese é a combinação**: PSD fiel, agente que confere pelo render, revisão antes de aplicar, preço previsível e português. Preço de referência no Brasil: Photoshop R$ 65/mês no plano anual. Detalhes e fontes em `docs/mercado/pesquisa-2026-09-design.md`.

## Primeira entrega técnica

Três spikes antes de qualquer tela de produto: **PSD** (um nó de cada tipo abre no Photoshop editável), **render** (idêntico no navegador e no Node, 60 quadros por segundo com 200 camadas) e **agente** (adapta uma peça para 3 formatos e confere, com custo medido). Se um falhar, a arquitetura muda antes do código de produto.

## Como trabalhar aqui

- Antes de escrever texto que uma pessoa vai ler, leia `docs/marca/identidade.md` (rascunho pós-pivô).
- **guardiao-da-marca**: revisa texto público e decisões que tocam a marca. Completa persona e voz novas.
- **especialista-ui-ux**: desenha editor, painéis, pedido de tarefa, revisão do conjunto de alterações, exportação com relatório e estados. Dono de `docs/produto/experiencia.md` (a criar).
- **especialista-react**: implementa a interface. Todo gesto vira operação; o canvas não é React.
- **especialista-grafico**: documento (`packages/documento`), motor (`packages/render`) e PSD (`packages/psd`). Dono de `docs/tecnico/psd.md`.
- **especialista-backend**: API NestJS, banco, isolamento, arquivos, fila de render e exportação, execução do ciclo do agente.
- **treinador-do-otto**: prompt do agente, descrição das ferramentas ao modelo, conjunto de avaliação de design em `avaliacao/`, custo por tarefa, defesa contra injeção.
- **analista-de-produto**: o que registrar e por quê. Dono de `docs/produto/dados.md` (a criar).
- **estrategista-de-mercado**: posicionamento, recorte, preço, concorrência. Aconselha; não escreve docs.
- **Agentes ainda não criados, com gatilho:** revisor de código independente no primeiro PR de código; jurídico (termos de uso, direitos sobre o conteúdo da conta, uso de fontes) antes do primeiro usuário pagante; financeiro na decisão de preço.
- Decisão nova de produto ou marca → novo ADR em `docs/decisoes/`, numeração sequencial a partir de 034, sem reaproveitar número.
- Afirmação sobre comportamento de usuário segue a skill `behavioral-evidence`: declare o grau. Quase tudo aqui é hipótese.

## Git

- Repositório: https://github.com/felipe2rod/otto.git
- **Gitflow.** `main` só recebe release e hotfix. `develop` é a integração e a branch padrão para PR. Trabalho em `feature/<nome-curto>`, saindo de `develop`. `release/<versão>` sai de `develop`, vai para `main` e volta para `develop`. `hotfix/<nome>` sai de `main`, vai para `main` e volta para `develop`.
- **Commits em Conventional Commits, descrição em português.** Tipos: `feat`, `fix`, `docs`, `test`, `refactor`, `chore`. Escopo opcional: `feat(psd): exportar máscara vetorial`. Uma mudança por commit.
- Commit e push só quando o Felipe pedir. Nunca commitar direto em `main`.
- `.claude/settings.local.json` fica fora do repositório; agentes e CLAUDE.md entram.

## Mapa dos documentos

- `docs/produto/visao.md`: o que é, para quem, o que o agente faz, o que não é, perguntas abertas, primeira entrega
- `docs/tecnico/arquitetura.md`: monorepo, fluxos (edição, tarefa do agente, exportação), dados, portas
- `docs/tecnico/psd.md`: mapeamento Otto → PSD por recurso (dono: especialista-grafico)
- `docs/tecnico/custos.md`: custo de inferência e de infraestrutura na DigitalOcean, estimativa por tarefa do agente
- `docs/mercado/pesquisa-2026-09-design.md`: concorrência no mercado de design com IA
- `docs/marca/identidade.md`: nome, posicionamento, caráter, vocabulário (rascunho)
- `docs/decisoes/`: ADRs em vigor, com índice no README
- `docs/arquivo/whatsapp/`: o produto anterior, só para consulta

## Estado do repositório

Sem código de aplicação. Stack (ADR 008, 009): NestJS + Express, PostgreSQL com Prisma, pg-boss, zod, pino, Docker; Next.js; monorepo pnpm (`apps/api`, `apps/web`, `packages/documento`, `packages/render`, `packages/psd`, `packages/agente`, `packages/shared`); Jest no backend, Vitest no frontend, Biome. O único código que existia (`packages/bases-de-nicho`, do produto de WhatsApp) foi arquivado.
