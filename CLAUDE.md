# Otto — contexto do projeto

Otto (ottobr.ai) é um produto: um **funcionário de IA que empresas contratam**. A primeira versão tem um único cargo, **Otto Atendente**, que atende o WhatsApp da empresa cliente.

Idioma de trabalho: **português do Brasil** em docs, commits, UI e conversa. Identificadores de código podem ser em inglês; texto que uma pessoa lê, não.

## Duas audiências — nunca confundir

| | Empregador | Cliente final |
|---|---|---|
| Quem | Dona/dono ou gestor da empresa que contrata o Otto | Pessoa que manda mensagem no WhatsApp da empresa |
| Relação com a marca | Fala com a marca Otto. Aqui Otto é "o funcionário" | Fala com a empresa cliente. Otto veste a camisa dela |
| Quem define o tom | A marca (docs/marca) | O empregador, dentro do caráter fixo do Otto |

## Decisões de marca em vigor

- **Um Otto, vários cargos.** Otto é uma pessoa só. Novas funções são cargos que ele assume ("Otto Atendente", depois "Otto Vendedor" etc.), nunca personagens novos. Ver [docs/decisoes/001](docs/decisoes/001-um-otto-varios-cargos.md).
- **Caráter fixo, estilo configurável.** O empregador escolhe nome de exibição, formalidade, calor, emoji e tamanho de resposta. Não altera o caráter (honestidade, admitir limite, passar para humano, não negar ser IA quando perguntado). Ver [docs/decisoes/002](docs/decisoes/002-estilo-de-atendimento-configuravel.md).
- **Sem revelação espontânea, com divulgação quando perguntado.** O Otto não diz que é IA por conta própria. Quando o cliente final pergunta sobre ele, responde que é IA, que se chama Otto e cita ottobr.ai, uma vez por conversa, e volta ao assunto. Conteúdo obrigatório em `docs/marca/identidade.md`; a forma segue o preset, textos em `docs/produto/estilos-de-atendimento.md`. Ver [docs/decisoes/003](docs/decisoes/003-divulgacao-quando-perguntado.md). **Decidido pelo Felipe.**
- **Cobrança por uso com franquia acumulável.** Assinatura mensal dá franquia medida em tokens, que acumula entre meses e se gasta com o uso. A palavra "token" nunca aparece para o empregador. Métrica exibida ainda aberta (depende da infra); proposta: horas do Otto e banco de horas. Ver [docs/decisoes/004](docs/decisoes/004-cobranca-por-uso-com-franquia-acumulavel.md) e `docs/produto/cobranca.md`. **Modelo decidido pelo Felipe; métrica pendente.**
- **Infraestrutura.** Hospedagem e inferência na **DigitalOcean** (Gradient AI Serverless Inference, saldo pré-pago), WhatsApp direto na **Meta Cloud API**, sem BSP. Nenhum fornecedor aparece em texto para empregador ou cliente final. **A validar** (Felipe aceitou testar): Claude Sonnet 5 como modelo padrão, Haiku 4.5 para classificar intenção e encaminhar, deploy em App Platform com banco gerenciado, chave da DigitalOcean. Critérios de validação no ADR; a validação é a primeira entrega técnica. Ver [docs/decisoes/005](docs/decisoes/005-infraestrutura-digitalocean-e-meta.md) e `docs/tecnico/infraestrutura.md`. **Fornecedores decididos pelo Felipe.**
- **Nicho na aquisição, horizontal no produto e na marca.** A marca e o produto não têm segmento. Anúncio, landing, roteiro de venda e Otto pré-configurado miram um nicho por vez; o nicho é ordem de entrada, não teto. Primeiro nicho em validação (candidato: assistência técnica de bairro) pelo experimento 001. Ver [docs/decisoes/007](docs/decisoes/007-nicho-na-aquisicao-horizontal-no-produto.md). **Decidido pelo Felipe.**
- **Asaas cobra o empregador.** Assinatura recorrente com PIX, boleto e cartão, atrás da porta `ProvedorDeAssinatura`; webhook credita a franquia. Ver [docs/decisoes/010](docs/decisoes/010-asaas-como-meio-de-pagamento.md). **Decidido pelo Felipe.**
- Status das 001 e 002: **propostas em 2026-09-08 e aguardando confirmação do Felipe**. Trate como vigentes até ele dizer o contrário. Se ele mudar, atualize o ADR e este arquivo.

## Como trabalhar aqui

- Antes de escrever qualquer texto que uma pessoa vai ler (copy, string de UI, prompt de sistema, e-mail, mensagem do atendente), leia `docs/marca/voz-e-tom.md` e `docs/marca/persona-otto.md`.
- Para revisar texto, nome de feature ou decisão que toque a marca, use o agente **guardiao-da-marca** (`.claude/agents/guardiao-da-marca.md`). Ele emite parecer e propõe reescrita.
- Para construir ou revisar interface (painel do empregador, onboarding, landing, componentes), use o agente **especialista-react** (`.claude/agents/especialista-react.md`). Ele carrega as skills locais react, typescript, frontend-design e tdd, escreve TypeScript estrito com teste antes do código, e devolve texto público para o guardião da marca.
- Para construir ou revisar o servidor (webhook da Meta, prompt em três blocos, inferência na DigitalOcean, medição de tokens e saldo, portas de contexto, banco, filas, testes de caráter), use o agente **especialista-backend** (`.claude/agents/especialista-backend.md`). **NestJS** sobre Node.js, TypeScript estrito, Nest na borda e nunca no núcleo (ADR 008); carrega nestjs, nodejs, typescript, clean-architeture, database-modeling-specialist, tdd e claude-api. Stack fechada em ADR 009: Express, Prisma atrás de repositório, pg-boss na v1 e Kafka quando houver segundo consumidor, zod, pino, Docker.
- Para conselho de posicionamento, segmento, preço, canal ou defesa contra concorrente, use o agente **estrategista-de-mercado** (`.claude/agents/estrategista-de-mercado.md`). Ele aconselha, direto e curto; não escreve docs. A sessão principal registra o que for decidido.
- Decisão nova de produto ou marca → novo ADR em `docs/decisoes/` (numeração sequencial, template no README de lá).
- Afirmação sobre comportamento de cliente ("o dono vai querer X") segue a skill `behavioral-evidence`: declare o grau. Quase tudo aqui ainda é hipótese; escreva como hipótese.

## Concorrência (pesquisa de 2026-09-08)

O concorrente principal é a **Meta**, com o Business Agent nativo no WhatsApp: grátis de instalar, cobra só token, mais de 1 milhão de empresas. O Otto não compete em distribuição nem em "tem IA". Compete no que a Meta não faz (memória, equipe, integração) e em suporte, que é a reclamação nº 1 de toda a categoria. "Funcionário de IA" já é usado pela Zaia. Nunca posicionar o Otto como substituto de gente. Mapa completo em `docs/mercado/pesquisa-2026-09.md`.

## Integrações

Contexto em três camadas (ADR 006). **Camada 0 não integra com nada** e é requisito de v1: histórico do próprio WhatsApp, perfil do WhatsApp Business, catálogo da Meta, Perfil da Empresa no Google, planilha. Camada 1 horizontal: Google Calendar, Google Sheets, Bling, depois cobrança. Camada 2 vertical só depois do segmento decidido. Arquitetura por **portas de contexto** com adaptador manual obrigatório em toda porta. Leitura livre, escrita só com confirmação. Mapa em `docs/produto/integracoes.md`.

## Git

- Repositório: https://github.com/felipe2rod/otto.git
- **Gitflow.** `main` só recebe release e hotfix. `develop` é a integração e a branch padrão para PR. Trabalho em `feature/<nome-curto>`, saindo de `develop`. `release/<versão>` sai de `develop`, vai para `main` e volta para `develop`. `hotfix/<nome>` sai de `main`, vai para `main` e volta para `develop`.
- **Commits em Conventional Commits, descrição em português.** Tipos: `feat`, `fix`, `docs`, `test`, `refactor`, `chore`. Escopo opcional: `feat(saldo): debitar mensagem de serviço da Meta`. Uma mudança por commit.
- Commit e push só quando o Felipe pedir. Nunca commitar direto em `main`.
- `.claude/settings.local.json` fica fora do repositório; agentes e CLAUDE.md entram.

## Mapa dos documentos

- `docs/produto/visao.md` — o que é o Otto, escopo da v1, o que não é, perguntas abertas
- `docs/produto/estilos-de-atendimento.md` — sistema de personalidade configurável do atendente
- `docs/produto/cobranca.md` — modelo de cobrança, métrica exibida, pendências e o que medir
- `docs/tecnico/infraestrutura.md` — componentes, fluxo de uma mensagem, riscos operacionais, pendências técnicas
- `docs/mercado/pesquisa-2026-09.md` — concorrentes, preços, reclamações, ameaça da Meta, economia unitária
- `docs/produto/integracoes.md` — que contexto o Otto precisa, de onde vem, quais ferramentas e em que ordem
- `docs/mercado/experimento-001-anuncio-por-nicho.md` — teste de anúncio genérico × nicho, com critérios pré-registrados
- `docs/marca/identidade.md` — nome, domínio, vocabulário, regras de nomenclatura
- `docs/marca/persona-otto.md` — quem é o Otto, descrito por comportamento
- `docs/marca/voz-e-tom.md` — como a marca e o atendente escrevem, com exemplos
- `docs/decisoes/` — registros de decisão (ADR)

## Estado do repositório

Sem código ainda (2026-09-08). Fornecedores decididos (ADR 005). Stack (ADR 008, 009): **NestJS + Express**, **PostgreSQL** com **Prisma**, **pg-boss** na v1 e **Kafka** quando necessário, **zod**, **pino**, **Docker**; frontend **Next.js**; monorepo **pnpm** (`apps/api`, `apps/web`, `packages/shared`); Jest no backend, Vitest no frontend, Biome. Git inicializado em 2026-09-08 com gitflow (`main`, `develop`). Git não inicializado.
