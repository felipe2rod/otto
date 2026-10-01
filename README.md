# Otto

Editor de design gráfico em camadas, operado por um agente próprio. Contexto, decisões e mapa dos documentos: [CLAUDE.md](CLAUDE.md). Plano do MVP: [docs/mvp/README.md](docs/mvp/README.md).

Este repositório é um monorepo pnpm que roda **dentro do Docker**. O disco do projeto é exFAT e recusa link simbólico, então o host não tem `node_modules`: instalar, testar e formatar acontecem sempre no contêiner.

## Subir

```bash
docker compose up
```

Não há passo antes. Os padrões de desenvolvimento estão no `compose.yaml`; copie `.env.example` para `.env` só se quiser trocar algum.

| Endereço | O que é |
|---|---|
| http://localhost:8080 | Página (`apps/web`) |
| http://localhost:8080/api/saude/pronto | API, na mesma origem |
| http://localhost:8081 | Armazenamento. Só para o download de exportação: o link assinado aponta para cá |

Duas portas são publicadas, só na máquina local: a borda (8080) e o armazenamento (8081, que recusa pedido sem assinatura). Banco, API e worker só existem na rede do Docker.

O que sobe: `borda`, `web`, `api`, `worker`, `banco` (PostgreSQL) e `armazenamento` (compatível com S3). Antes deles rodam, uma vez, `instalar` (dependências nos volumes e cliente do banco gerado), `migracao` (migrações e esquema da fila, com o papel migrador) e `semear` (fontes base da biblioteca).

`api` e `worker` recarregam sozinhos quando o código muda. A exceção é o cliente do banco gerado (`apps/api/src/plataforma/persistencia/gerado/`), que é regravado a cada `docker compose run` e por isso fica fora da vigia: depois de mudar o `schema.prisma`, rode `docker compose restart api worker`.

### Peças da POC

Para ter peças de verdade no editor, importe as da POC para a conta fixa (só lê de `poc/`; pode rodar de novo):

```bash
docker compose run --rm api pnpm --filter @otto/api importar:poc
curl -s 'http://localhost:8080/api/documentos?limite=100'
```

Entram 48 dos 51 documentos. Os outros três estão com o arquivo corrompido no disco (não são mais JSON). O histórico da POC não é importado: cada peça entra na versão 0.

### Exportar uma peça

A exportação sai da fila: a API só registra o pedido e o `worker` renderiza e monta os arquivos, uma exportação por vez. O download é um link assinado de 5 minutos, novo a cada pedido.

```bash
API=http://localhost:8080/api
DOC=$(curl -s "$API/documentos?limite=1" | python3 -c 'import sys,json; print(json.load(sys.stdin)["itens"][0]["id"])')

# o relatório antes de exportar (na hora, sem renderizar)
curl -s -X POST "$API/documentos/$DOC/exportacoes/relatorio" -H 'X-Otto-Cliente: editor' -H 'Content-Type: application/json' -d '{"formato":"psd"}'

# pedir (202), acompanhar e baixar
EXP=$(curl -s -X POST "$API/documentos/$DOC/exportacoes" -H 'X-Otto-Cliente: editor' -H 'Content-Type: application/json' -d '{"formato":"psd"}' | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])')
curl -s "$API/exportacoes/$EXP"                       # repita até "estado" ser pronta, pronta_em_parte ou falhou
curl -sL -o peca.psd "$API/exportacoes/$EXP/arquivos/0"   # 302 para o link assinado
```

Os outros formatos e o pacote usam as mesmas rotas, só muda o corpo:

```bash
exportar() {  # exportar '<corpo>' <arquivo de saída>
  EXP=$(curl -s -X POST "$API/documentos/$DOC/exportacoes" -H 'X-Otto-Cliente: editor' -H 'Content-Type: application/json' -d "$1" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])')
  until curl -s "$API/exportacoes/$EXP" | grep -qE '"estado":"(pronta|pronta_em_parte|falhou)"'; do sleep 0.5; done
  curl -sL -o "$2" "$API/exportacoes/$EXP/arquivos/0"
}
exportar '{"formato":"svg"}' peca.svg                  # um .svg por prancheta (este baixa o primeiro)
exportar '{"formato":"pdf"}' peca.pdf                  # um .pdf, uma página por prancheta
exportar '{"formato":"psd","pacote":true}' pacote.zip  # os PSDs, a pasta Fontes e o relatório em texto
unzip -l pacote.zip
curl -s "$API/documentos/$DOC/exportacoes"             # as exportações recentes e em curso da peça
```

| Corpo | O que sai |
|---|---|
| `{"formato":"psd","arquivos":"por-prancheta"\|"juntas"}` | Um PSD por prancheta (padrão), ou um só com todas |
| `{"formato":"png","escala":1\|2,"semFundo":true\|false}` | Um PNG por prancheta |
| `{"formato":"svg"}` | Um SVG por prancheta |
| `{"formato":"pdf","arquivos":"juntas"\|"por-prancheta"}` | Um PDF com uma página por prancheta (padrão), ou um por prancheta |

Em qualquer um: `"pranchetas":[ids]` exporta só essas, e `"pacote":true` entrega um `.zip` com os arquivos, as fontes usadas (as que a licença deixa redistribuir) e o relatório. O contrato inteiro está em `packages/shared/src/exportacao.ts`.

Os arquivos ficam 7 dias. Cada exportação agenda a própria limpeza na fila; o worker apaga os arquivos no vencimento e o registro fica.

Para derrubar: `docker compose down`. Para apagar também os dados e as dependências instaladas: `docker compose down -v`.

## Testes, tipos e Biome

Tudo pelo serviço `teste`, que tem o banco de teste (`otto_teste`) e o armazenamento de teste:

```bash
docker compose run --rm teste                                    # todos os testes
docker compose run --rm teste pnpm --filter @otto/documento test # um pacote só
docker compose run --rm teste pnpm exec vitest run --project api testes/banco   # uma pasta
docker compose run --rm teste pnpm test:fronteira                # só as regras de fronteira
docker compose run --rm teste pnpm typecheck
docker compose run --rm teste pnpm lint                          # Biome, só confere
docker compose run --rm teste pnpm format                        # Biome, corrige
```

### Web

| Endereço | O que é |
|---|---|
| http://localhost:8080 | Site público, estático |
| http://localhost:8080/editor | Peças: a lista da conta, com criar, renomear, duplicar e excluir |
| http://localhost:8080/editor/p/:id | O editor da peça, ligado à API: mover (arraste e setas), redimensionar e girar pela alça (uma ou várias camadas, Shift trava a proporção e o giro em 15°), seleção múltipla (Shift+clique), duplicar (Ctrl+J), agrupar e desagrupar (Ctrl+G, Ctrl+Shift+G), editar texto no canvas (dois cliques ou Enter), inserir imagem ou SVG (botão ou soltar no canvas), trocar imagem, painéis de Camadas (arrastar reordena, põe e tira de grupo e leva a outra prancheta) e Propriedades, renomear a peça, desfazer e refazer, e **Exportar** (relatório antes do botão; PSD, PDF, SVG ou PNG; pacote .zip com arquivos, fontes e relatório; escolha de pranchetas, andamento por prancheta, download, exportações recentes e retomada depois de recarregar) |
| http://localhost:8080/editor/bancada | **Só em desenvolvimento.** O editor com um documento de exemplo fixo, sem API: o motor de render desenhando, clicar seleciona, arrastar move. Não existe no build de produção |

```bash
docker compose run --rm teste pnpm --filter @otto/web test    # estado, câmera, componentes e as três guardas abaixo
docker compose run --rm teste pnpm --filter @otto/web build   # next build + teste de pacote por sentinela
docker build -f docker/Dockerfile --target web -t otto-web .  # imagem de produção (roda os dois acima)
```

Três guardas do web, que falham o teste ou o build:

- **O site público não alcança o editor nem um `.wasm`** (ADR 019). Pelo código-fonte em `apps/web/testes/fronteira-do-site.test.ts` e pelo que o build gerou em `apps/web/scripts/conferir-pacote-publico.ts`.
- **Componente não tem texto literal.** Todo texto visível mora em `apps/web/src/textos/` e é rascunho até passar pelo guardião da marca (`apps/web/testes/textos-literais.test.ts`).
- **O motor de render entra por um arquivo só**, `apps/web/src/editor/canvas/motor.ts`, que carrega `@otto/render/navegador` por `import()` dinâmico. O `canvaskit.js` e o `.wasm` são copiados do pacote para `apps/web/public/motor/<versão>/` por `scripts/copiar-motor.ts`, antes de `next dev` e de `next build`; a pasta é gerada e fica fora do git.
- **Rota só de desenvolvimento não chega à produção.** Página com nome terminado em `.dev.tsx` só é rota com `next dev`; o teste de pacote falha se `/editor/bancada` aparecer no build.

## Dependência nova

```bash
docker compose run --rm instalar pnpm --filter @otto/api add nome-do-pacote
docker compose run --rm instalar pnpm --filter @otto/web add -D nome-do-pacote
docker compose restart api worker web
```

O `pnpm-lock.yaml` é gravado no repositório e entra no commit. Duas regras do pnpm aparecem aqui:

- O pnpm evita versão publicada há poucos dias (proteção contra pacote adulterado). Fixar a última versão faz ele pedir uma exceção em `pnpm-workspace.yaml`; prefira intervalo (`^1.2.0`) e deixe ele escolher.
- Script de instalação de dependência só roda se aprovado em `pnpm-workspace.yaml` (`allowBuilds`): `docker compose run --rm instalar pnpm approve-builds nome-do-pacote`.

## Pacote novo no workspace

Cada `node_modules` é um volume. Um pacote novo (por exemplo `packages/psd`) precisa de três coisas além da pasta:

1. a pasta `node_modules` dele no alvo `dev` de `docker/Dockerfile`;
2. um volume para ela em `compose.yaml` (`x-node` e `volumes`);
3. uma linha em `projects` de `vitest.config.ts`, e o `COPY` do `package.json` no estágio `deps` do Dockerfile.

Depois: `docker compose build && docker compose run --rm instalar pnpm install`. Se faltar o volume, a instalação falha com `EPERM ... symlink`.

## Como o código se organiza

```
apps/api          API e worker (NestJS). Mesmo código, dois pontos de entrada: src/main.ts e src/worker.ts
apps/web          Site e editor (Next.js)
packages/documento, render, psd   Núcleo: sem NestJS, sem Prisma, sem Next. Documento e operações; motor de render; exportação PSD, PNG, SVG e PDF com relatório.
                  Fornecedor só em pasta adaptadores/ (a biblioteca de PSD fica atrás da porta FormatoDeArquivoEmCamadas)
packages/shared   Contratos que atravessam a rede (zod)
testes/fronteira  Testes que fazem as regras acima falharem o build
docker/           Dockerfile, script de início do banco, configuração da borda
```

- **Pacote do workspace é consumido pelo código-fonte TypeScript.** Cada pacote exporta `src/index.ts`; não existe `dist` por pacote. Quem compila é o app que consome.
- **Na API, injeção sempre por token explícito** (`@Inject(Porta)`), com a porta escrita como classe abstrata.
- **Fornecedor só em pasta `adaptadores/`** e na configuração (ADR 020).
- **Banco:** toda tabela tem `conta_id` e política de RLS, escrita na mesma migração que cria a tabela (ADR 023). O único caminho para o banco é `PrismaComEscopo.executar(escopo, fn)`.
- **Contrato HTTP:** os esquemas zod de pedido e resposta, os códigos de erro e os limites estão em `packages/shared/src/contrato.ts`; os da exportação, em `packages/shared/src/exportacao.ts`. A API valida com eles e o editor também. Toda escrita precisa do cabeçalho `X-Otto-Cliente: editor`.
- **Na API, cada módulo** (`documento`, `arquivo`, `biblioteca`, `exportacao`) tem `domain/` e `application/` sem NestJS, `infrastructure/` com os adaptadores e `presentation/` com os controladores. Os comandos de terminal (`src/comandos/`) montam os mesmos casos de uso sem o NestJS.

## Banco

```bash
docker compose exec banco psql -U otto_migrador -d otto     # como dono das tabelas
docker compose run --rm migracao                            # aplicar migrações pendentes e preparar a fila
```

Migração nova: escreva o `schema.prisma`, gere o SQL de base com `prisma migrate diff`, e complete à mão permissões, RLS e `down.sql`. Veja `apps/api/prisma/migrations/20261001000000_chao/`. Migração que cria chave estrangeira para tabela com RLS precisa abrir um escopo vazio no começo (`SELECT set_config('app.conta_id', '00000000-0000-0000-0000-000000000000', false)`) e fechar no fim (`RESET app.conta_id`): o banco valida a chave como dono da tabela, que também está sob a política. Veja `20261001180000_exportacoes/`.

A fila (pg-boss) mora no esquema `pgboss` do mesmo banco. Quem cria o esquema e as filas é o migrador (`pnpm --filter @otto/api fila:preparar`, que o serviço `migracao` já roda); API e worker só leem e escrevem linha.

## Suposição em vigor

Não há login no MVP (ADR 035). O banco nasce com `conta_id` e RLS, e o servidor resolve o escopo sempre para **uma conta fixa**, semeada pela migração. O ponto único é `apps/api/src/plataforma/escopo/`. Isso ainda não foi confirmado pelo Felipe e está marcado no código. Enquanto valer, não exponha a API fora da máquina local.
