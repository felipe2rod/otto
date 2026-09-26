# 023 — Isolamento multi-empresa: um banco, `empresa_id` em tudo, com o banco fazendo cumprir

Status: aceita (a forma, pelo Felipe) / escolhida por Claude, reversível (as medidas técnicas)
Data: 2026-09-09
Quem decide: Felipe

> **Nota do pivô (2026-09-26, ADR 026).** A forma continua valendo. "Empresa" passa a ser a **conta** (uma pessoa ou um estúdio). Os identificadores `empresa_id` e `EscopoDaEmpresa` podem ser renomeados para `conta_id` e `EscopoDaConta` antes do primeiro código, e não depois. Onde se lê webhook e canal, a entrada do escopo agora é só a sessão do editor. O cache de prompt do agente (ADR 029) herda a regra do bloco 3a: tokens, fontes e biblioteca de uma conta nunca entram no prefixo de outra. Arquivo de imagem é endereçado por hash, e o hash **não** é autorização. Toda leitura confere a conta dona.

## Contexto

Felipe, verbatim, em 2026-09-09: **"Um banco de dados por cliente é inviável, iremos adotar outras medidas técnicas para mitigar esse problema."**

O problema é o vazamento de conteúdo entre empresas clientes, em duas formas: mostrar dado da empresa A para a empresa B no painel, e o Otto da empresa A responder usando conhecimento da empresa B. É o pior evento possível deste produto — `conversa.md` §4.4 classifica o ataque A4 (base de outra empresa) como a única severidade **crítica** que sobra depois da defesa estrutural de canal, e `experiencia.md` §12.7 e o ADR 022 rejeitaram a base compartilhada por nicho exatamente por isso. O ADR 021 registra que a fusão de identidade era a única outra peça do desenho com esse risco, e ela também saiu.

Três peças já estavam decididas e este ADR não as revoga, apenas as amarra:

- **`empresaId` nunca vem do conteúdo.** É resolvido do número de destino do webhook (`conversa.md` §4.4, controle 3).
- **`empresaId` nunca vem do cliente para a API.** A API deriva da sessão; a UI não é a guarda (ADR 019, decisão 5).
- **Multi-empresa desde o primeiro dia, sem exceção "porque é só um teste"** (regra 10 do especialista-backend).

O que faltava era a resposta para a pergunta que decide: *um `where` esquecido vaza linha?* Enquanto a resposta for "vaza", tudo o que está acima é disciplina, e disciplina não sobrevive à terceira sexta-feira apertada. Este ADR existe para que a resposta seja **não**, por construção, em todos os caminhos — inclusive os que não são o banco, que é onde o vazamento costuma de fato acontecer.

Não há código escrito. Este é o momento mais barato que vai existir para decidir isto — mesmo argumento dos ADRs 017 e 020.

## Opções consideradas

| Opção | Veredito |
|---|---|
| **Banco por cliente** | **Recusada pelo Felipe.** N bancos gerenciados na DigitalOcean é N mensalidades, N janelas de manutenção, N backups e N conexões; o plano mínimo custa mais que a margem de uma conta da faixa de entrada (ADR 004). E a métrica agregada da operação (`dados.md`) passaria a exigir ETL entre bancos |
| **Schema por empresa, mesmo banco** | **Recusada aqui, e o motivo é migração.** É o candidato sério, e ele quebra em produção: uma migração vira N execuções de DDL, sem transação única. A décima falha no meio e a frota fica em estado misto, com o código obrigado a tolerar duas formas do schema ao mesmo tempo — que é o custo permanente, não o do dia. O Prisma Migrate não tem essa história: ele versiona **um** schema; schema por empresa exige runner próprio, `search_path` por conexão e reconciliação de `_prisma_migrations` por schema. E `search_path` por conexão é exatamente a armadilha de pool descrita na decisão 4 abaixo, com uma diferença ruim: lá, errar dá zero linhas; aqui, errar dá **as linhas da empresa errada**. Ganha-se pouco: o isolamento de schema depende do mesmo `search_path` que se erra, e não é isolamento de credencial |
| **Banco único, schema único, `empresa_id` em toda tabela, aplicação filtrando** | **Insuficiente sozinha.** É o desenho certo com a garantia errada. Um `where` esquecido vaza, e vaza em silêncio |
| **Banco único, schema único, `empresa_id` em toda tabela, com Row-Level Security fazendo cumprir** | **Escolhida.** Uma migração, um schema, um backup — e a garantia mora no lugar que não tem como ser contornado por esquecimento, porque não é a aplicação que decide |

## Decisão

### 1. A forma: um banco, um schema, `empresa_id` em toda tabela de negócio

- Um PostgreSQL gerenciado (ADR 005/009), um schema `public`, uma linha de migração do Prisma Migrate.
- **Toda tabela de dado de negócio tem `empresa_id uuid NOT NULL`.** A tabela `empresas` participa pela própria chave (`id`). As exceções são uma lista fechada, escrita num arquivo (decisão 6): catálogos globais (`precos_de_fornecedor`, `reservas_de_fornecedor`, `assuntos`, presets, base pré-configurada por nicho), `_prisma_migrations` e o schema `pgboss`. Acrescentar uma exceção é um diff visível no PR, sempre com justificativa na mesma linha.
- **Ids gerados na aplicação (UUID v7), não no banco.** Motivo prático e não estético: a criação de uma empresa precisa conhecer o `empresa_id` *antes* do `INSERT`, para que a política de escrita da decisão 3 possa validá-lo. Ordenável por tempo, de quebra.
- **Índice:** toda tabela de negócio leva `empresa_id` como **primeira coluna** de todo índice de consulta — a política de RLS acrescenta `empresa_id = $1` a literalmente toda consulta, então índice que não começa por ele não serve ao predicado que sempre existe. Chave primária continua sendo `id` sozinha, para unicidade global e para não vazar cardinalidade em URL.
- **Chave estrangeira composta.** `mensagens.conversa_id → conversas.id` não impede uma mensagem da empresa A apontar para uma conversa da empresa B. Toda tabela filha referencia `(id, empresa_id)` do pai, que ganha `UNIQUE (id, empresa_id)`. Custa um índice único a mais por tabela pai, e compra integridade referencial *dentro* da empresa — que a FK simples não dá. Prisma expressa isso com `@@unique([id, empresaId])` no pai e relação por duas colunas no filho.
- **Escala:** particionar por empresa fica **fora**. Particionamento por `empresa_id` com centenas de contas pequenas produz milhares de partições e piora tudo. `dados.md` já decidiu particionar `eventos` **por mês**, quando o tamanho medido pedir.

### 2. Onde o `empresa_id` entra, onde nunca entra, e onde mora a fronteira

**Entra em exatamente dois lugares, ambos na borda:**

| Origem | Resolvido de | Onde |
|---|---|---|
| Canal (webhook) | Endereço de destino da mensagem (`id_externo` do canal conectado) | Adaptador de `CanalDeAtendimento` |
| Painel | Cookie de sessão validado no servidor | Guard do Nest |

**Nunca entra de:** corpo, query string, cabeçalho ou path de requisição; conteúdo de mensagem do cliente final; texto de documento subido pelo empregador; payload de job (ver decisão 5b); prompt.

**A fronteira, e é aqui que a decisão fica verificável:**

1. **O núcleo recebe o escopo como parâmetro explícito.** `EscopoDaEmpresa` é um objeto do núcleo, com construtor privado, e é o **primeiro argumento** de todo caso de uso e de todo método de repositório. `EmpresaId` é tipo marcado (`branded`), então uma `string` não passa no lugar dele. Um caso de uso roda igual em HTTP, worker e CLI porque não sabe de onde o escopo veio — que é o teste do ADR 008.
2. **O núcleo não conhece `AsyncLocalStorage`.** Nenhum `import` de ALS, `nestjs-cls`, `@Inject` ou decorator do Nest fora de `infrastructure/` e `presentation/`.
3. **O ALS existe, e existe só na infraestrutura, para três coisas:** o `pino` carimbar `empresa_id` e `correlacao_id` em toda linha; o cliente de inferência carimbar a métrica de token; e o adaptador de persistência **conferir** que o escopo recebido no método é o mesmo escopo da transação aberta.
4. **Regra que resume as três: o parâmetro decide, o ALS confere.** O ALS nunca é fonte de valor. ALS vazio num caminho de negócio é erro, nunca um padrão silencioso.
5. **Duas funções `SECURITY DEFINER` no banco, e só duas**, para o problema do ovo e da galinha (resolver a empresa antes de existir escopo): `resolver_empresa_por_endereco(fornecedor, id_externo) → uuid` e `resolver_empresa_por_sessao(hash_do_token) → uuid`. Ambas de propriedade do papel de migração, com `SET search_path` fixo, `REVOKE EXECUTE FROM PUBLIC` e `GRANT` só ao papel da aplicação. Elas devolvem **um uuid e nada mais** — o único dado que atravessa sem escopo é justamente o que se está resolvendo. Um teste de CI assere que existem exatamente duas funções `SECURITY DEFINER` no banco; a terceira reprova o build.

Fora esses dois resolvedores, **não existe caminho de código que produza um `EscopoDaEmpresa`.** Isso é conferido por análise estática, não por revisão.

### 3. A defesa que não depende de disciplina: os dois, em camadas

Repositório fechado **e** Row-Level Security. Não é redundância decorativa: cada um pega uma classe de erro que o outro não pega. O repositório pega o erro do programador que ainda não escreveu SQL; o RLS pega o que já escreveu.

**No repositório (compilação e runtime da aplicação):**

- `PrismaClient` é `private` no módulo de persistência e **não é exportado**. O que o resto do sistema pode injetar é `PrismaComEscopo`, cuja única forma de uso é `executar(escopo, fn)`.
- Extensão de client (`$allOperations`) que, para todo modelo com `empresaId`, injeta o filtro e **lança `EscopoAusente`** se não houver escopo aberto — pega o `findMany` esquecido dentro do próprio adaptador.
- Conferência de divergência: escopo do método diferente do escopo da transação lança `EscopoDivergente`.

**No banco (Postgres):**

- `ENABLE ROW LEVEL SECURITY` **e `FORCE ROW LEVEL SECURITY`** em toda tabela com `empresa_id`. Sem o `FORCE`, o dono da tabela ignora a política — é o jeito mais comum de ter RLS decorativo.
- Política: `USING (empresa_id = current_setting('app.empresa_id')::uuid)` e **`WITH CHECK` idêntico**, para que escrita fora do escopo falhe em vez de gravar.
- **Três papéis de banco**, com credenciais distintas em variáveis de ambiente distintas:

| Papel | Quem usa | Poderes |
|---|---|---|
| `otto_migrador` | Só o job de migração | Dono das tabelas. A URL dele **não existe** no contêiner da API |
| `otto_app` | API e workers | Sem `BYPASSRLS`, não dono, sem `CREATE` no schema. Sujeito a toda política |
| `otto_operacao` | Processo separado da área de operação e da análise do ADR 014 | Política própria (`TO otto_operacao USING (true)`), **leitura ampla, escrita restrita** a uma lista curta de tabelas. Nunca atende requisição do painel do empregador |

O papel de operação é o furo declarado — a ottobr.ai precisa ler entre empresas para melhorar o produto (ADR 014). Ele é um furo *nomeado, com credencial própria e processo próprio*, e não um `BYPASSRLS` no papel que atende clientes. `otto_app` precisar de `BYPASSRLS` é gatilho de revisão, não um ajuste de PR.

**O que acontece quando alguém escreve a consulta errada:**

| Erro | Onde é pego | Resultado |
|---|---|---|
| Método de repositório chamado sem escopo | **Compilação** | Não compila: parâmetro obrigatório de tipo marcado |
| `PrismaClient` cru importado num caso de uso | **Compilação + CI** | Provider não exportado; teste de fronteira falha o build |
| `findMany` sem filtro dentro do adaptador | Runtime (extensão) | `EscopoAusente` antes de a consulta sair |
| Escopo do método ≠ escopo da transação | Runtime (ALS) | `EscopoDivergente` |
| `$queryRawUnsafe` com `WHERE 1=1` | Runtime (**RLS**) | **0 linhas** |
| `INSERT`/`UPDATE` com `empresa_id` alheio | Runtime (**`WITH CHECK`**) | Erro, transação abortada |
| Filho apontando para pai de outra empresa | Escrita (**FK composta**) | Violação de chave estrangeira |
| Tabela nova sem `empresa_id` | CI (schema) | Build falha |
| Tabela nova com `empresa_id` e sem política | CI (banco migrado) | Build falha |

**Em nenhuma linha desta tabela o resultado é linha de outra empresa.** Esse é o critério de aceite deste ADR.

### 4. Prisma e o pool de conexões: `SET LOCAL`, resolvido explicitamente

A armadilha: `SET` sem `LOCAL` grava o GUC na **conexão**, que volta para o pool com o valor da empresa anterior. A próxima requisição, de outra empresa, herda o escopo errado — e como a política de RLS confere, o vazamento é *exatamente* o que a política deveria impedir. RLS mal ligado é pior que RLS nenhum, porque produz confiança.

Decisões:

1. **Toda operação de negócio roda dentro de uma transação interativa do Prisma** (`$transaction`, que segura uma conexão), e a **primeira instrução** dela é `SELECT set_config('app.empresa_id', $1, true)` — o `true` é o *local à transação*, revertido no `COMMIT` e no `ROLLBACK`.
2. **Não existe caminho de setar o escopo fora de transação.** `PrismaComEscopo.executar(escopo, fn)` é a única API pública; `set_config(..., false)` e `SET` sem `LOCAL` são proibidos, com teste de grep no CI. Isso importa porque `set_config(..., true)` fora de transação é *no-op silencioso* — a pior falha possível aqui.
3. **Custo declarado:** leitura simples passa de 1 para 4 idas ao banco (`BEGIN`, `set_config`, consulta, `COMMIT`). Dentro da mesma região da DigitalOcean, ordem de 2–4 ms. É aceitável contra o orçamento de 10 s de mediana ponta a ponta (ADR 005) e vira gatilho de revisão se medido acima de 5% da latência do banco.
4. **Pool dimensionado explicitamente**, `connection_limit` na URL, somando API e worker **abaixo** do limite do plano gerenciado — transação interativa segura conexão, então o pool não pode ser deixado no padrão. `timeout` da transação interativa fixado, para que um job travado não drene o pool.
5. **PgBouncer:** a v1 conecta direto, sem pool externo. Se entrar, é *transaction mode* com `pgbouncer=true` na URL, e **nada neste desenho muda**, porque o GUC já é local à transação — o que quebraria em transaction mode é precisamente o `SET` que já está proibido.
6. **`prisma migrate` roda como `otto_migrador`, por URL própria**, em passo de deploy separado. Toda migração vem com o `down` escrito e testado, e migração que cria tabela cria a política de RLS no mesmo arquivo — o teste da decisão 6 falha se não criar.

### 5. Os caminhos que não são o banco

#### a) Prompt e cache

Dois caches diferentes, e os dois são tratados.

**Cache do provedor (prefixo por empresa, ADR 004).** A chave é o prefixo de bytes, dentro da mesma chave de API da DigitalOcean — que é uma só para todas as empresas. Duas empresas com prefixos byte-idênticos (conta nova, base vazia, descrição parecida) compartilhariam entrada de cache. Isso não vaza conteúdo — se os bytes são idênticos, não há conteúdo alheio — mas **estraga a medição de custo por empresa**, que é a validação do ADR 005. Decisão: **a primeira linha do bloco 3a carrega o identificador opaco da empresa**, antes de tudo. Custa ~10 tokens por dia e garante que nunca há acerto de cache cruzado. É um uuid da própria empresa, no canal *fato*, sem valor para quem o obtiver.

**Cache de aplicação do prefixo renderizado.** Ele não vai para memória de processo nem para um Redis novo: **mora numa tabela `prefixos_renderizados` com `empresa_id`, sob RLS**, e assim herda todas as garantias já construídas em vez de criar um caminho novo sem nenhuma. Memória de processo é permitida apenas como leitura adiantada dessa tabela, com a chave começando por `empresa_id`.

**E a conferência que decide o que acontece se colidir:** o prefixo renderizado guarda `assinatura = HMAC(segredo, empresa_id ‖ bytes)`. Antes de a requisição sair para a inferência, a assinatura é conferida contra o escopo em vigor. **Divergência não é acerto de cache: é erro.** A chamada não sai, a resposta ao cliente final é o texto de indisponibilidade do preset, e um alerta é disparado. Nunca se responde com base de origem duvidosa.

#### b) Fila (pg-boss)

**O worker não confia no `empresa_id` do payload — ele revalida, e a revalidação é grátis.**

O job carrega `empresa_id` **e** a chave natural do fato (`id` da mensagem no canal, `conversa_id`). O worker abre o escopo com o `empresa_id` do payload e **relê o agregado sob RLS**. Se a linha não existe naquele escopo, o job falha e nada é processado. Ou seja: o `empresa_id` do payload é uma *hipótese*; a existência da linha sob RLS é a *prova*. Payload adulterado vira job morto, não vazamento — e é uma consulta que o worker faria de qualquer jeito.

Mais três regras:

- **`pgboss` não tem `empresa_id`** (exceção declarada), então **payload de job não carrega texto de mensagem nem dado pessoal**, só identificadores.
- **Toda chave de idempotência e todo `singletonKey` começa por `empresa_id`.** Sem isso, "resumo do dia de hoje" de uma empresa deduplica o da outra — vazamento sutil, sem linha vazando, e igualmente grave.
- **Uma fila para todas as empresas.** Fila por empresa multiplica cardinalidade e não compra isolamento nenhum.

#### c) Arquivo (`ArmazenamentoDeArquivo`, ADR 020)

- **Chave do objeto:** `empresas/{empresa_id}/{aaaa}/{mm}/{uuid v4 aleatório}{ext}`. Nome original do arquivo do empregador vai em metadado, **nunca** na chave.
- **Bucket privado, sem ACL de objeto, sem leitura anônima.** O prefixo por empresa serve a operação e retenção; **ele não é o controle de acesso.** Chave não adivinhável como defesa é o erro clássico desta categoria.
- **Nenhuma rota aceita chave de objeto vinda de fora.** O cliente pede por `arquivo_id`; o caso de uso lê a linha em `arquivos` **sob RLS** e só então pede à porta uma **URL assinada com validade ≤ 5 minutos**. Chave adivinhada não serve porque não existe onde usá-la.
- A porta recebe `EscopoDaEmpresa` e a referência do nosso banco, nunca a chave crua.

#### d) Log (`pino`)

**Nunca entra no log:** texto de mensagem (do cliente ou do Otto), texto de item da base, prompt renderizado, telefone ou e-mail em claro, nome do contato, payload cru de webhook, `Authorization`, cookie de sessão, token da Meta, chave da DigitalOcean, credencial de cobrança do empregador e **URL assinada de arquivo** (ela é credencial).

**Sempre entra:** `empresa_id`, `correlacao_id`, `conversa_id`, contagem de tokens, latência, nome do evento.

Implementação: `redact` por caminho **mais** serialização por lista de permissão — o serializador padrão de erro do pino despeja `err.request.body`, e é assim que payload cru costuma chegar ao log sem ninguém escrever a linha. **Linha de log de caminho de negócio sem `empresa_id` é bug**, e vira asserção de teste. Retenção de log: 14 dias (`dados.md`).

### 6. Como isto é testado — a suíte é obrigatória e bloqueia o deploy

Mesma severidade dos testes de caráter e dos testes de injeção: **falha bloqueia o deploy**. Escrita antes da primeira tabela, no vermelho, conforme a skill `tdd`.

**Testes derivados do schema — a parte que importa, porque a tabela nova entra sozinha na suíte:**

1. **`toda-tabela-tem-empresa-id`** (estático, sem banco). Lê `schema.prisma`; falha se algum modelo não tiver `empresaId` e não estiver em `isolamento.excecoes.ts`, arquivo com justificativa por linha. **Este é o análogo direto do teste de nome de fornecedor do ADR 020** — mesma mecânica, mesmo lugar no CI, mesma regra de que acrescentar exceção é diff visível.
2. **`toda-tabela-tem-politica`** (contra o banco migrado, em contêiner). Para cada tabela com `empresa_id`, lê `pg_class` e `pg_policies` e assere `relrowsecurity`, `relforcerowsecurity` e política com `USING` e `WITH CHECK` sobre `app.empresa_id`. Pega a migração que cria tabela e esquece a política — que é o modo de falha mais provável deste desenho.
3. **`papeis-do-banco`**. `otto_app` sem `BYPASSRLS`, não dono de tabela, sem `CREATE`. Exatamente duas funções `SECURITY DEFINER`.
4. **`fronteira-do-escopo`** (estático). `PrismaClient` fora de `infrastructure/persistencia/`; `AsyncLocalStorage`/`nestjs-cls`/decorator do Nest dentro de `domain/` ou `application/`; `SET` sem `LOCAL`; `set_config(..., false)`; `$queryRawUnsafe` fora da lista; construção de `EscopoDaEmpresa` fora de `infrastructure/escopo/`.

**Suíte `duas-empresas`** (integração, banco real em contêiner). Cria A e B com dados espelhados — mesma conversa, mesmo item de base, mesmo arquivo, mesmo job — e, **com o escopo de A**, tenta alcançar o de B por cada caminho:

| Caminho | Tentativa | Esperado |
|---|---|---|
| Repositório | Todo método, enumerado da lista de repositórios | Vazio ou exceção. Nunca linha de B |
| SQL cru | `$queryRaw` com `WHERE 1=1` | 0 linhas |
| Escrita | `INSERT` com `empresa_id` de B | Erro de política |
| Integridade | Mensagem de A apontando para conversa de B | Violação de FK |
| HTTP do painel | `GET` de recurso de B com sessão de A | **404**, com corpo idêntico ao de id inexistente. Nunca 403 — 403 confirma que existe |
| Webhook | Evento com endereço de B e `empresa_id` de A forçado no job | Job recusado, nada gravado |
| Prompt | Montar prompt de A com o prefixo de B em cache | Nenhum id de item de B no prefixo; assinatura confere |
| Cache | Injetar valor de B na chave de A | Tratado como erro, não como acerto; nenhuma resposta usa base de B |
| Fila | Publicar job com `empresa_id` trocado | Worker recusa |
| Arquivo | Pedir URL assinada para `arquivo_id` de B | 404, e a porta **nunca é chamada** |
| Log | Rodar uma conversa completa de A | Busca literal pelo texto e pelo telefone de teste não acha nada; toda linha tem `empresa_id` |

**Teste de contrato de porta (ADR 020, exigência 4.2):** a suíte de contrato de toda porta ganha um caso de escopo trocado, e roda contra todos os adaptadores dela, real e manual. `ArmazenamentoDeArquivo` falso e real recusam do mesmo jeito, ou a porta não é porta.

### 7. O que fica de fora, e com que gatilho volta

| Fora | Por quê | Volta quando |
|---|---|---|
| Banco por cliente | Decisão do Felipe. Custo por conta acima da margem da faixa de entrada e ETL entre bancos para toda métrica | **2 ou mais negociações perdidas com exigência contratual escrita de isolamento físico**, registradas em `pedidos_de_operacao` (`dados.md`). Pedido verbal não conta |
| Schema por empresa | Migração vira N execuções e frota em estado misto | Não volta. Se banco por cliente entrar, ele resolve o mesmo problema melhor |
| Réplica ou instância de inferência dedicada por empresa | Nada a isolar que o RLS não isole; custo fixo por conta | **Uma conta passando de 20% do tempo de CPU do banco ou das linhas de `mensagens` numa semana** (vizinho barulhento). A resposta provável é limitar aquela conta, não replicar |
| Criptografia por empresa em toda coluna | Chave por empresa em coluna quente inviabiliza índice e consulta. Continua valendo onde já foi decidido: telefone em `contatos`, `pessoas_para_aviso`, credencial de cobrança do empregador (ADR 011, ADR 020 item 6) | Exigência regulatória nominal, não preferência |
| Roteamento de conexão por empresa | É o que "banco por cliente sob demanda" exigiria, e é caro para construir por antecipação | Junto com a primeira linha desta tabela |

O que **fica pronto** de graça: com `empresa_id` em toda tabela, todo dado de uma empresa é selecionável e exportável por uma cláusula. Extrair uma conta para um banco próprio, no dia em que uma exigir, é um `pg_dump` filtrado — não uma reescrita. É a extração que fica pronta, não o roteamento.

## Consequências

- **Especialista de backend.** Ganha regra permanente ao lado das do ADR 020: escopo é parâmetro do núcleo, `PrismaComEscopo.executar` é o único acesso ao banco, migração que cria tabela cria a política no mesmo arquivo, quatro testes estáticos e a suíte `duas-empresas` no CI. A regra 10 do agente (multi-empresa desde o primeiro dia) passa a ter uma implementação nomeada em vez de uma intenção.
- **Primeira entrega técnica (ADR 005).** A suíte `duas-empresas` entra junto com o webhook, não depois. Com uma empresa só no protótipo, ela cria a segunda empresa artificial — é o único jeito de o teste existir antes do segundo cliente.
- **`docs/tecnico/infraestrutura.md`** ganha a seção de isolamento e os três papéis de banco na tabela de componentes; três variáveis de ambiente de banco em vez de uma.
- **`docs/produto/dados.md`.** Nada muda no catálogo de eventos. `eventos.empresa_id` é nullable para o futuro parceiro (`dados.md` §3): linha com `empresa_id` nulo é **invisível** para `otto_app` sob a política, e legível só por `otto_operacao`. Isso é o comportamento desejado e está declarado aqui para não virar surpresa.
- **ADR 014.** A leitura de conteúdo pela operação passa a ter credencial e processo próprios, separados do que atende o empregador. Isso melhora o que o ADR 014 prometeu: o uso é o mesmo, o caminho é auditável.
- **ADR 019.** Confirma e implementa a decisão 5: "nunca passar `empresaId` do cliente para a API". A API agora não tem como aceitá-lo mesmo se alguém tentar — não existe rota que o leia.
- **ADR 022 e `conversa.md`.** O controle 3 de `conversa.md` §4.4 (`empresaId` nunca vem do conteúdo) deixa de ser regra de prompt e vira propriedade do sistema: o ataque A4 passa a exigir furar RLS, e não convencer um modelo.
- **Latência.** Toda leitura vira transação. Medido na primeira entrega, junto da mediana ponta a ponta.
- **Custo.** Zero em fornecedor. O custo é de escrita: quatro testes de CI, uma extensão de client, uma política por tabela e um índice único a mais por tabela pai.
- **Marca.** Nada muda. `empresa_id`, `tenant` e `escopo` são nomes de código e ficam como estão (`identidade.md`, "Onde este vocabulário vale — e onde não vale"). O que uma pessoa lê continua sendo "sua empresa".

## Evidência comportamental (fichas)

A maior parte desta decisão é engenharia verificável, não previsão de comportamento, e não pede ficha: uma política de RLS ou existe na tabela ou não existe, e o teste diz qual. Duas afirmações são de incidência e pedem:

| Afirmação | Tipo | Grau | O que a mata |
|---|---|---|---|
| Um filtro por empresa vai ser esquecido em algum `where` durante a vida deste produto | Incidência | **OBSERVADO como classe** (controle de acesso quebrado / IDOR é a categoria nº 1 do OWASP Top 10; não é previsão sobre uma pessoa, é a taxa base de uma classe de defeito). O custo de estar errado é assimétrico: a defesa custa dias, o incidente custa o produto | Nada barato. E se estiver errada, o preço pago foi baixo |
| Algum cliente vai exigir banco dedicado por contrato | Incidência | **NÃO VERIFICADO.** Nenhum cliente, nenhuma negociação. Nada caro depende disto — é por isso que a exigência vira gatilho e não construção | Trinta contas sem uma única exigência escrita, o que já é a expectativa no nicho do ADR 007 |

## Correções do analista de produto, 2026-09-09

Duas coisas que faltavam e que quebrariam o build ou empurrariam registro para fora da plataforma:

1. **`reservas_de_fornecedor` não estava na lista de exceções** e é catálogo global (saldo reservado na DigitalOcean, do ADR 004). Sem ela o teste `toda-tabela-tem-empresa-id` reprova. Corrigido acima.
2. **Falta uma empresa interna da ottobr.ai.** `empresa_id NOT NULL` é certo, mas nem todo registro tem empresa cliente: prospecto que ainda não assinou, verba de campanha, conta de teste da própria operação. Sem uma linha de `empresas` que represente a ottobr.ai, esse registro é empurrado para fora da plataforma — que é exatamente o que o ADR 014 proíbe ("pedidos de suporte são registrados na própria plataforma, não em planilha"). **Decisão: existe uma empresa interna, criada pela migração inicial com id fixo, marcada `interna = true`**, e ela é excluída de toda métrica por padrão (a regra "toda métrica é por empresa" do `dados.md` passa a ser "toda métrica é por empresa cliente").

Ainda pendente e não é deste ADR: as **views das sete métricas nascem com `security_invoker = true`** — sem isso a view roda com os direitos de quem a criou e devolve a frota inteira, e o RLS vira decorativo exatamente onde este plano mais trabalha. Está registrado em `dados.md`; quem escrever as views é quem cumpre.

## Um vazamento que este ADR não pega

Levantado pelo analista de produto ao revisar a Decisão C, e vale dizer em voz alta porque contraria a leitura fácil deste documento: **a resposta que o dono guarda pela barra é texto que ele escreveu para uma pessoa, e passa a ser servida a todos os clientes finais daquela empresa.** É vazamento entre clientes finais **dentro do mesmo `empresa_id`** — nenhuma camada daqui pega, porque do ponto de vista do banco está tudo certo.

A defesa não é isolamento, é a reescrita: ao guardar, nome, telefone e valor atribuído a pessoa saem do texto. `dados.md` (pendência 17) instrumenta isso com `dado_pessoal_removido` e um limiar: acima de 2 em 10 nas primeiras 30 contas, o gesto de guardar passa a mostrar ao dono o que foi tirado.

**A lição, para os próximos ADRs:** isolamento por empresa resolve o vazamento entre clientes **nossos**, e não o vazamento entre os clientes **deles**. São dois problemas, e só o primeiro é de banco.

## Gatilho de revisão

- **Um incidente confirmado de vazamento entre empresas basta.** Não há limiar; o ADR volta à mesa no mesmo dia, e o pós-morte diz qual das camadas falhou e por que as outras não pegaram.
- **`otto_app` precisar de `BYPASSRLS`** para qualquer coisa. Significa que apareceu um caso de uso entre empresas que precisa de rota própria — nunca de furo no papel que atende cliente.
- **A lista de exceções de tabela sem `empresa_id` receber uma tabela de negócio** (catálogo global não conta). É sinal de que o modelo de dados está saindo do desenho.
- **A suíte de isolamento ser desligada, ou ganhar exceção duas vezes.** Mesma redação do ADR 020: ou o desenho está errado, ou a regra é grande demais. Rever aqui, não no PR.
- **Custo do escopo passar de 5% da latência mediana do banco**, medido. Aí o desenho da transação obrigatória por leitura se revê — mantendo o RLS, que é a camada que não se negocia.
- **Duas ou mais exigências contratuais escritas de isolamento físico**, ou uma conta acima de 20% do banco por uma semana: ver a tabela da decisão 7.
