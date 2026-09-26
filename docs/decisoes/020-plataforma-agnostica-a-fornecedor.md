# 020 — Plataforma agnóstica a fornecedor

Status: aceita (o princípio, pelo Felipe) / escolhida por Claude, reversível (o mapa de portas e as regras de execução)
Data: 2026-09-09
Quem decide: Felipe

> **Nota do pivô (2026-09-26, ADR 026).** O princípio continua valendo. O mapa de portas foi refeito: saem `CanalDeAtendimento`, `FonteDeCobranca`, `TranscritorDeAudio`, as portas de contexto e `AvisoAoEmpregador`. Entram `ModeloDoAgente` (antes `ModeloDeConversa`, ADR 029), `FormatoDeArquivoEmCamadas` (PSD, ADR 028) e, quando existir, `GeradorDeImagem`. Continuam `ArmazenamentoDeArquivo` (imagens e fontes, por hash de conteúdo), `BarramentoDeEventos`, repositórios e `ProvedorDeAssinatura`, este último sem fornecedor decidido depois do arquivamento do ADR 010. CanvasKit não ganha porta (limite 3: tecnologia, não fornecedor).

## Contexto

Felipe: "a plataforma inteira deve ser desenvolvida para ser agnóstica a fornecedor, a troca de fornecedor deve ser sempre simples e fácil."

O princípio já aparece em pedaços: portas de contexto no ADR 006, `ProvedorDeAssinatura` no 010, `FonteDeCobranca` no 011, `CanalDeAtendimento` no 017, `TranscritorDeAudio` na nota do 005, repositório e `BarramentoDeEventos` no 009. Nunca foi escrito como regra única, e por isso a inferência — o maior fornecedor do produto em custo — ainda não tem porta nomeada.

Dois fatos tornam esta a hora certa:

1. **Não há código escrito.** A abstração custa quase nada agora e custa reescrita depois. É o mesmo argumento que decidiu o ADR 017.
2. **Um fornecedor já mudou as regras no meio do desenho.** A Meta passou a cobrar mensagem de serviço a partir de 1º de outubro de 2026, o que derrubou a premissa central do ADR 004 antes de existir um cliente. Isso não é hipótese sobre o futuro: é o que aconteceu neste projeto, em setembro de 2026.

## Decisão

### 1. A regra

**Nenhum nome de fornecedor existe no núcleo.** O núcleo conhece portas; adaptadores conhecem fornecedores. O nome de um fornecedor pode aparecer em quatro lugares, e só neles: no arquivo do adaptador, na configuração do módulo que escolhe o adaptador, na variável de ambiente e na migração de banco. Em caso de uso, entidade, prompt ou regra de negócio, nunca.

Isso é a mesma linha do ADR 008 ("Nest na borda, nunca no núcleo") aplicada a fornecedor em vez de framework.

**A regra é executável, não é boa intenção.** Teste no CI que falha se o nome de um fornecedor aparecer fora das pastas de adaptador — mesma mecânica do teste de manifesto do ADR 019, que impede o bundle público de carregar código do painel. Sem esse teste, a regra dura até a primeira sexta-feira apertada.

### 2. Mapa de fornecedor para porta

| Fornecedor | Porta | Estado |
|---|---|---|
| Meta WhatsApp Cloud API | `CanalDeAtendimento` | ADR 017, definida |
| DigitalOcean Gradient (inferência) | **`ModeloDeConversa`** | **Nova aqui.** Era o buraco maior |
| DigitalOcean Managed PostgreSQL | Repositório (por agregado) | ADR 009, definida |
| DigitalOcean App Platform | Nenhuma. A porta é o Docker | Ver item 5 |
| Asaas (assinatura do Otto) | `ProvedorDeAssinatura` | ADR 010, definida |
| Asaas, Mercado Pago, InfinitePay, PIX estático (cobrança do cliente final) | `FonteDeCobranca` | ADR 011, definida |
| Transcrição de áudio | `TranscritorDeAudio` | ADR 005, nota, definida |
| Google Calendar, Sheets, Bling e o que vier | `FonteDeAgenda`, `FonteDeOferta`, demais portas de contexto | ADR 006, definidas |
| pg-boss hoje, Kafka depois | `BarramentoDeEventos` | ADR 009, definida |
| Armazenamento de mídia (áudio, imagem e comprovante do WhatsApp) | **`ArmazenamentoDeArquivo`** | **Nova aqui.** Não tinha dono. Contrato S3-compatível; Spaces é um adaptador, não o contrato |
| Aviso ao empregador fora do WhatsApp (e-mail transacional, push do painel) | **`AvisoAoEmpregador`** | **Nova aqui.** O ADR 017 pediu e o 012 depende. Nasce com adaptador de painel; e-mail entra quando precisar |

### 3. O que "agnóstico" **não** quer dizer

Três armadilhas, cada uma capaz de custar mais do que a troca que evitaria.

**a) Menor denominador comum.** A porta não pode amputar o que o fornecedor de hoje faz bem. Cache de prefixo por empresa não é otimização, é requisito de preço (ADR 004); `order_details` da Meta é a experiência de pagamento no chat (ADR 011). Uma porta que só expõe o que todos os fornecedores fazem apaga os dois.

A saída é o padrão `capacidades` que o ADR 017 já usa: **a porta pergunta ao adaptador o que ele sabe fazer, e o núcleo degrada de forma explícita.** `ModeloDeConversa` responde se tem cache de prefixo, qual o mínimo cacheável, qual o TTL e se tem tool calling; quem não tem cache não é proibido, é caro — e o cálculo de custo enxerga isso em vez de presumir.

**b) Escrever dois adaptadores reais para provar a abstração.** É pagar duas integrações para não trocar nenhuma. Uma porta tem **um adaptador real e um adaptador manual ou falso** — que já é obrigatório no ADR 006 e sobe aqui para regra geral, porque ele é o que os testes usam e o que atende o empregador sem integração.

**c) Confundir troca de código com migração de produto.** Em vários casos o código é a parte barata e a porta não protege o que é caro. Item 5 diz onde.

### 4. O que faz uma troca ser de fato simples

Seis exigências. Sem elas, "é fácil trocar" é opinião até o dia em que se tenta.

1. **Tipo de fornecedor não cruza a porta.** Nada de `Prisma.*`, payload de webhook da Meta ou objeto do SDK do Asaas em caso de uso. O contrato é do núcleo; a tradução é do adaptador.
2. **Teste de contrato por porta, rodando contra todos os adaptadores dela**, inclusive o manual ou falso. Uma suíte, N adaptadores. É a única prova de que a porta é uma porta.
3. **Id do fornecedor em coluna própria** (`fornecedor` + `id_externo`), nunca como chave primária, nunca por cima do id do Otto. Sem isso, a migração perde a correspondência entre o que está aqui e o que está lá — e esse é o motivo real pelo qual migração de fornecedor costuma ser irreversível.
4. **Estado do negócio mora no banco do Otto, não no fornecedor.** Ciclo, franquia, saldo, situação da conversa e histórico são nossos. Consultar o fornecedor é conferência, nunca fonte da verdade.
5. **Escolher adaptador é configuração, não deploy.** Por empresa onde faz sentido (cobrança, agenda), global onde não faz (inferência, banco).
6. **Segredo por empresa e por fornecedor**, criptografado, escopo mínimo, fora de log — regra que o ADR 011 já criou e que passa a valer para toda porta.

### 5. Onde a troca é simples, e onde não é

Esta é a parte honesta do ADR. A regra vale para a plataforma inteira; o custo de sair não é igual em todo fornecedor, e fingir que é atrapalha a decisão na hora do aperto.

| Fornecedor | Custo de trocar o código | O que a porta **não** resolve |
|---|---|---|
| Inferência (Gradient) | Baixo. Um adaptador | O preço. Formato, TTL e mínimo cacheável do cache mudam por fornecedor, e a tabela de `cobranca.md` depende deles. Trocar exige refazer a medição do ADR 005, não reescrever caso de uso |
| Hospedagem (App Platform) | Baixo, **enquanto nada além de "rodar um contêiner" virar requisito**. Cron é pg-boss, não serviço da plataforma; arquivo é `ArmazenamentoDeArquivo`, não disco local; ISR local já ficou fora no ADR 019 | Nada relevante, se a regra acima for respeitada. Ela é a porta |
| Banco (Managed PostgreSQL) | Baixo. PostgreSQL é padrão, não fornecedor. Sem extensão proprietária, um `pg_dump` restaura em qualquer lugar | Janela de indisponibilidade na migração. É operação, não arquitetura |
| Asaas (assinatura) | Baixo no código | **Assinatura recorrente não migra.** Mandato de cartão fica no provedor antigo; migrar é reemitir cobrança com todo mundo. A proteção real é a exigência 4 do item anterior: se o saldo e o ciclo estão no nosso banco, perde-se a cobrança, não o cliente |
| Meta WhatsApp | Já resolvido pelo ADR 017 | **Não existe outro fornecedor de WhatsApp.** BSP é revenda da mesma Meta. Número, WABA, templates aprovados e nota de qualidade vivem lá dentro. A porta protege contra trocar de BSP e contra **acrescentar canal**; não protege contra a Meta, e nenhuma abstração protegeria. Quem protege contra a Meta é o ADR 017 item 3 e o mapa de cargos |

### 6. O preço da regra, declarado

**Agnóstico a fornecedor não é agnóstico a tecnologia.** NestJS, TypeScript, Node, Next.js e o modelo relacional não ganham porta e não são candidatos a troca fácil: são a substância da plataforma, não peça intercambiável. Trocar qualquer um deles é reescrever, e nenhuma camada de indireção evita isso — só encarece o dia a dia até lá. Se esta regra começar a produzir interface para esconder framework, ela virou o problema que veio resolver.

## Consequências

- **Especialista de backend.** Ganha regra permanente: porta antes de adaptador, teste de contrato por porta, teste de CI contra nome de fornecedor no núcleo. Passa a tratar `ModeloDeConversa`, `ArmazenamentoDeArquivo` e `AvisoAoEmpregador` como portas existentes.
- **ADR 005.** A validação do modelo passa a ser validação de um adaptador de `ModeloDeConversa`. Os critérios não mudam; o que muda é que o resultado não fica grudado no núcleo.
- **ADR 004.** Reforça o que já estava lá: trocar de modelo é decisão de preço, com medição, e não muda dentro de uma conversa.
- **Todo ADR novo que nomear fornecedor** passa a ser obrigado a nomear a porta dele, ou a justificar por que não tem.
- **`docs/tecnico/infraestrutura.md`** ganha a coluna de porta na tabela de componentes.
- **Marca.** Nada muda, e o motivo é o mesmo do ADR 005: nenhum fornecedor aparece em texto para empregador ou cliente final. Esta decisão só garante que isso também vale para o código.

## Evidência comportamental (fichas)

| Afirmação | Tipo | Grau | O que a mata |
|---|---|---|---|
| Um fornecedor do Otto vai mudar preço ou regra de forma que force reação | Incidência | **OBSERVADO neste projeto** — a Meta passou a cobrar mensagem de serviço em 2026-10-01 e derrubou a premissa do ADR 004 antes de haver código | Nada. Já aconteceu |
| A porta escrita antes do segundo adaptador acerta o contrato | Capacidade | INFERIDO (é o argumento padrão de arquitetura hexagonal; contrato desenhado sobre um fornecedor só costuma vazar) | O segundo adaptador de qualquer porta exigir mudança no núcleo |
| Trocar de fornecedor de assinatura sem perder cliente | Taxa | NÃO VERIFICADO | Nenhum comparável levantado. Por isso o item 5 registra que o mandato não migra |

## Gatilho de revisão

- **Ao escrever o segundo adaptador de qualquer porta:** se o núcleo precisar mudar, o contrato estava desenhado sobre o primeiro fornecedor. Registrar no ADR da porta e corrigir. Este é o teste real de todo este ADR.
- **Se o adaptador falso de uma porta custar mais tempo que o real em duas portas seguidas**, a porta está larga demais. Estreitar o contrato.
- **Se o teste de CI de nome de fornecedor for desligado ou tiver exceção adicionada duas vezes**, a regra não está sendo cumprida: ou o desenho está errado, ou a regra é grande demais para o time. Rever aqui, não no PR.
- **Se uma porta ficar com adaptador real único por 12 meses e a troca nunca for cogitada**, ela continua valendo — o custo já foi pago e o teste de contrato segue útil. Não é gatilho para remover; está aqui para que ninguém use isso como argumento de remoção.
