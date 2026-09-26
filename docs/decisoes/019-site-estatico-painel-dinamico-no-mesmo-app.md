# 019 — Site estático, painel dinâmico, no mesmo app

Status: proposta
Data: 2026-09-09
Quem decide: Felipe

> **Nota do pivô (2026-09-26, ADR 026).** A forma continua valendo: site público estático e app dinâmico no mesmo `apps/web`. O segmento `painel/` vira o **editor** (`/editor`), com o mesmo `force-dynamic` e `noindex`. O motor de renderização (ADR 030) é carregado só dentro do editor, e o teste de manifesto passa a conferir também que o WebAssembly do Skia não entra no bundle público. Os argumentos de landing por nicho e de link de aviso do ADR 012 eram do produto arquivado. O argumento de Open Graph no HTML bruto continua valendo para qualquer link compartilhado.

## Contexto

Felipe decidiu em 2026-09-09 que as páginas expostas ao público precisam ser renderizadas no servidor por causa de SEO, e que o painel interno não precisa — perguntando se dá para separar as duas coisas.

Dá. E ao desenhar a separação, dois pontos do pedido mudaram de forma: a parte pública não precisa de SSR, precisa de **HTML pronto na resposta**, que é coisa diferente e mais barata; e a separação não pede dois projetos, pede uma fronteira dentro de um.

O ADR 009 escolheu Next.js com App Router justamente porque "a landing precisa de SEO e a mesma stack serve o painel", e registrou um gatilho para rever essa escolha. Este ADR responde ao gatilho e fecha a estratégia de renderização.

## Opções consideradas

**A. SSR nas páginas públicas.** Recusada como padrão. Entrega o mesmo HTML que a alternativa, cobrando renderização por requisição e acoplando o site à disponibilidade da API.

**B. ISR (revalidação por tempo) nas páginas públicas.** Recusada na v1. ISR resolve "conteúdo muda sem deploy" — CMS, catálogo, autor externo. As landings do Otto moram no repositório, mudam por PR e passam pelo guardião da marca. E na App Platform o cache de ISR é arquivo local e efêmero (ver Consequências), então ISR compra um problema de infraestrutura sem resolver nenhum problema de conteúdo.

**C. Dois apps: `apps/site` e `apps/painel`.** Recusada agora, registrada com gatilho.

**D. Um `apps/web`, site estático e painel dinâmico, com fronteira verificável.** Escolhida.

## Decisão

### 1. As páginas públicas são estáticas (SSG), não SSR

Geradas no build. O deploy é a publicação.

O argumento que decide não é custo, é o caminho de aquisição do Otto. O Googlebot executa JavaScript, ainda que numa fila diferida — **mas o crawler de link preview da Meta e do WhatsApp não executa nenhum.** O caminho do ADR 007 é anúncio → landing, e o link da landing circula por WhatsApp. Sem as tags de Open Graph no HTML bruto, o preview sai vazio no canal em que o produto inteiro vive.

Onde a renderização por requisição é mesmo necessária: painel, entrar, callback de autenticação, e o link de "Aviso" do ADR 012 (`/c/[token]`), que reflete o estado da conversa naquele segundo. Em nenhum desses o motivo é SEO.

**A landing por nicho continua estática.** `generateStaticParams` sobre a lista de nichos que vive em `packages/shared`, com `dynamicParams = false` — nicho desconhecido dá 404 em vez de renderizar sob demanda. Com um nicho por vez (ADR 007), são unidades de páginas, e o custo de build é de segundos.

**O único candidato futuro a ISR** é uma landing que mostre número real ("o Otto fez X atendimentos este mês"). Isso é afirmação pública com número, então passa pelo guardião e exige o cache distribuído da seção de consequências. Não construir por antecipação.

### 2. Um `apps/web`, com o painel em segmento real

O painel vive em `/painel`, então é segmento de URL, não route group. O site ocupa a raiz, dentro do grupo `(site)`.

```
apps/web/src/app/
  layout.tsx                  # <html lang="pt-BR">, fontes. Nenhum provider de cliente
  (site)/
    layout.tsx                # dynamic = 'error'
    page.tsx · precos/ · para/[nicho]/ · opengraph-image.tsx
  painel/
    layout.tsx                # dynamic = 'force-dynamic' · robots: noindex, nofollow
                              # providers de cliente moram AQUI
    ...
  entrar/ · onboarding/[passo]/ · c/[token]/     # dinâmicas, no-store, noindex
  robots.ts · sitemap.ts
```

### 3. A fronteira é executável, não convencional

Três guardas, porque convenção não sobrevive ao terceiro mês:

1. **`export const dynamic = 'error'` no layout do `(site)`.** Qualquer `cookies()`, `headers()` ou fetch sem cache que vaze para uma página pública **quebra o build**, em vez de virar SSR silencioso. Configuração de segmento é herdada pelos filhos, então uma linha cobre o grupo.
2. **Teste de manifesto no CI.** Depois do build, lê `.next/app-build-manifest.json` e falha se algum chunk de rota do `(site)` referenciar módulo sob `painel/`. É o que impede o visitante da landing de baixar o cliente de dados do painel.
3. **`packages/shared` é livre de framework** — zod e tipos, sem React, sem Next. Se `shared` importar React, os dois lados se contaminam por ali.

Regra que sustenta a 2: **providers de cliente ficam no layout do painel, nunca no layout raiz.** É o erro mais comum e o mais caro.

### 4. Painel: não indexar, não pré-renderizar

- **Indexação em duas camadas**, porque `robots.txt` não impede indexação de URL descoberta por link externo: `Disallow` em `robots.ts` **e** `robots: { index: false, follow: false }` no metadata do layout do painel. A segunda é a que vale.
- `sitemap.ts` é gerado da lista de rotas do `(site)`, nunca por varredura da pasta `app/`.
- **Nunca `generateStaticParams` em rota de painel.** É o único jeito de o painel entrar no tempo de build, e seria um bug silencioso — o build passaria a crescer com o número de empresas.

### 5. Sessão: três lugares, uma fronteira

| Lugar | Papel | O que não é |
|---|---|---|
| `middleware.ts` | Redirecionar para `/entrar` quando não há cookie | **Não é autorização.** Não consulta banco |
| `painel/layout.tsx` | Ler a sessão para montar o cabeçalho | Não re-executa em navegação entre rotas filhas |
| **`apps/api` (NestJS)** | **A fronteira.** Valida sessão e empresa em toda requisição | — |

**Nunca passar `empresaId` do cliente para a API** — a API deriva da sessão. Multi-empresa é onde dado vaza, e a UI não pode ser a guarda.

O matcher do middleware precisa excluir `_next/static`, `_next/image`, `favicon.ico` e arquivos públicos. Auto-hospedado, o matcher padrão faz cada asset passar pelo processo Node.

## Consequências

### Armadilhas da App Platform (ADR 005), que não é Vercel

| Armadilha | Contorno |
|---|---|
| **Cache de ISR é arquivo local e efêmero.** Com 2 instâncias, `revalidate` vale só na que atendeu; as outras servem HTML velho **sem erro nenhum**. Redeploy zera | Desarmada pela decisão 1. Se ISR entrar um dia, exige `cacheHandler` apontando para Valkey/Redis gerenciado — não é opcional acima de 1 instância |
| **`HOSTNAME` no build standalone.** O `server.js` escuta em localhost por padrão; o health check bate de fora e falha, sem log óbvio | `ENV HOSTNAME=0.0.0.0` no Dockerfile, e respeitar o `PORT` injetado |
| **Cache de camada Docker em monorepo pnpm.** Copiar o repo antes do `pnpm install` reinstala tudo a cada commit | Copiar `package.json`, `pnpm-lock.yaml` e os manifests dos workspaces, instalar, depois o código. Multi-stage, imagem final `standalone`, usuário não-root |
| **`next/image` otimiza sob demanda na sua CPU**, e o cache de imagem também é efêmero | Servir pré-dimensionadas na landing, ou loader apontando para Spaces. Decidir explicitamente |
| **Cabeçalho de cache não é automático** na borda | `headers()` no `next.config` para as rotas do `(site)`, **conferido com `curl -I` no primeiro deploy.** Este item se mede, não se supõe |
| **`metadataBase` atrás de proxy** | Fixar por variável de ambiente. Sem ele, `og:url` sai errada — e quebra justamente o preview do WhatsApp da decisão 1 |
| **Nada de edge.** Middleware e route handlers rodam no mesmo processo Node, numa região | Não desenhar nada que dependa de geolocalização de borda ou PPR |

SSR puro, route handlers, server actions e streaming rodam em container sem ginástica. O que quebra fora da Vercel é sempre o que assume cache distribuído de graça.

### O gatilho do ADR 009 não foi puxado, e estava mal redigido

O gatilho era uma conjunção: "rever Next.js se o painel não precisar de SSR **e** o build do Next dominar o tempo de deploy". A primeira condição é verdadeira mas mede a coisa errada (o painel não precisa de SSR *para SEO*; continua querendo renderização no servidor por sessão e busca de dado). A segunda não é medida — não há código.

E havia um erro de raciocínio: **mesmo com as duas verdadeiras, a conclusão não seria trocar de framework.** O site é a parte que precisa do Next, e é ele que resolve o problema do SEO. A ação certa seria dividir `apps/web`. Redação nova, para substituir o gatilho no ADR 009:

> Rever a **unidade** de `apps/web` — não o Next — quando o build passar de 3 minutos **e** a parcela do painel for maior que metade do tempo medido. Ação: dividir em `apps/site` (Next) e `apps/painel`, mantendo Next no site.

## Evidência comportamental (fichas)

| Afirmação | Tipo | Grau | O que a mata |
|---|---|---|---|
| O link da landing do Otto circula por WhatsApp, onde o preview precisa de HTML bruto | Capacidade | **OBSERVADO** quanto ao crawler (não executa JS); **INFERIDO** quanto ao link circular por WhatsApp no Otto | Aquisição acontecer só por clique direto no anúncio, sem repasse |
| SEO orgânico traz cliente para o Otto | Atribuição | **NÃO VERIFICADO** — esta decisão barateia o SEO, não prova que ele funciona | Nenhuma das 30 primeiras contas chegar por busca |
| Um app único não fará o bundle público carregar código do painel | Ausência | **INFERIDO**, e é por isso que a guarda 3.2 é um teste, não uma regra escrita | O teste de manifesto falhar |

## Gatilho de revisão

- **Dividir `apps/web`** quando o build passar de 3 minutos e a parcela do painel for mais da metade do tempo medido; ou quando site e painel precisarem de cadência de deploy diferente; ou quando o teste de manifesto acusar dependência pesada do painel num chunk comum.
- **ISR entra** apenas se uma página pública precisar de número real vindo do banco — e junto com ela entra o `cacheHandler` distribuído, no mesmo PR.
- **Rever a decisão 1** se alguma página pública passar a depender de dado por visitante.
- Rever tudo se a hospedagem sair da App Platform (ADR 005).
