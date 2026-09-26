# 024 — O plano é o cargo, e o trabalho se mede numa moeda só

Status: aceita
Data: 2026-09-09
Quem decide: Felipe

## Contexto

O Felipe mudou o enquadramento do produto em 2026-09-09: *"iremos ser mais voltados para o lado de funcionário do que de atendente, atendente é apenas um tipo de funcionário. Logo, número de atendimentos não faz mais sentido como característica principal do plano."*

A frase tem duas afirmações, e as duas procedem.

**A palavra está errada.** "Atendimento" é do cargo Atendente. Quando o Otto Financeiro avisa de conta em aberto (ADR 018), a empresa é quem começou a conversa — chamar aquilo de atendimento é forçar a palavra. O mesmo vale para o Otto Vendedor indo atrás de quem sumiu e para o Otto Agenda lembrando de um horário.

**O eixo está errado.** O que nomeia o plano hoje é *quanto* o Otto trabalha (200 / 500 / 1.200). O que passa a importar é *o que ele faz na empresa* — o cargo. E há um argumento que fecha a questão: **sem o cargo na linha do preço, o segundo cargo não tem onde ser vendido.** A tese de expansão inteira do ADR 001 (um Otto, vários cargos) fica sem preço.

Dois fatos que barateiam a mudança:

1. **O modelo interno já conta conversa, não atendimento** — com uma ressalva que só apareceu na revisão do analista de produto. O catálogo de eventos de `docs/produto/dados.md` tem `conversa.iniciada` e `conversa.encerrada`, e não existe nenhum evento `atendimento.*`: "atendimento" sempre foi rótulo de exibição. **Mas o consumo era debitado por resposta** (`saldo.movimentado.tipo = debito_resposta`), não por conversa. É o único ponto do modelo de dados que a troca não aproveita, e virou `debito_acao`, com o preço aplicado e a versão da tabela gravados na própria linha.
2. **Não há código de aplicação escrito.** É o momento mais barato que vai existir para mexer na unidade.

E um fato que encarece: o vocabulário de cobrança foi fechado no mesmo dia em `identidade.md`, com a definição de três frases, "os atendimentos deste mês", "comprar mais 100 atendimentos" e a regra do número na frente. Parte disso é reescrita por esta decisão.

## Opções consideradas

| Opção | O que é | Veredito |
|---|---|---|
| **A. Manter "atendimento", mudar só a manchete** | O cargo nomeia a linha, a unidade continua a mesma: "Otto Atendente — R$ 197/mês, até 200 atendimentos" | Recomendada pelo estrategista de mercado: não reabre o ADR 004, não cria contagem nova, não gera risco novo de contestação. **Recusada pelo Felipe** — deixa a palavra do cargo Atendente medindo o trabalho de todos os cargos |
| **B. Trocar para "conversa"** | Mesma contagem, nome cargo-neutro | Recusada. Colide com a lista da caixa de entrada (ADR 015), e a distinção entre a lista (conversas) e o contador (atendimentos) já custou uma decisão registrada em `identidade.md` |
| **C. Uma unidade por cargo, saldos separados** | Atendimentos para o Atendente, retomadas para o Vendedor, lembretes para o Agenda | Recusada. Fere o ADR 001 (uma pessoa, uma franquia) e obriga o dono a administrar três saldos |
| **D. Uma moeda só, com preço por ação** | Um saldo para o Otto inteiro; cada ação diz quanto custa | **Escolhida pelo Felipe.** *"cada ação deixará claro quantos créditos irá custar"* |

## Decisão

### 1. O cargo é a característica principal do plano

A linha de preço passa a ser lida como contratação de alguém para uma função:

> **Otto Atendente** — R$ 197/mês, com 200 créditos

A faixa continua sendo nomeada pelo número, nunca por adjetivo (ADR 004, decisão que não muda): "o de 200", "o de 500", "o de 1.200".

Isso tem respaldo no vocabulário que já existe, e é o que me convenceu de que o eixo novo é o certo: **"promover o Otto" e "dar mais uma função ao Otto" são frases aprovadas para cargo e explicitamente proibidas para faixa maior**, porque toda faixa entrega o mesmo Otto. O preço estava, até hoje, no único eixo em que a marca manda ficar calado.

### 2. Uma moeda só, um saldo só

Resolve a pendência 6 de `docs/produto/cobranca.md`: **um saldo para o Otto inteiro**, qualquer cargo. Uma pessoa, uma franquia (ADR 001). O acúmulo sem teto e as regras de sobra continuam como estão (ADR 004).

### 3. A palavra é **crédito**, contra o parecer do guardião da marca

Decidido pelo Felipe em 2026-09-09, depois de ler o parecer contrário inteiro. **Este ADR tira "créditos" da coluna *não diga* de `identidade.md`**, onde estava desde a fundação, e revê a linha da tabela de unidades do ADR 004 que descartou "créditos" com a justificativa "genérico, sem personalidade, não sustenta a marca".

**O parecer contrário fica registrado, porque é dele que sai o gatilho de revisão desta decisão:**

- **A âncora falsa em reais.** A faixa de entrada é 200 por R$ 197. Uma palavra de dinheiro ensina, na primeira tela, que 1 crédito ≈ R$ 1 — e as outras faixas desmentem na hora: R$ 0,89 no de 500, R$ 0,83 no de 1.200, R$ 1,49 no avulso. É a estrutura do erro que derrubou "horas do Otto" no ADR 004: unidade familiar-mas-falsa, com taxa de câmbio prévia na cabeça do dono. E hoje falha pior do que falharia em 2026-09-08, porque o preço por unidade **varia de propósito** entre faixa e avulso — é o incentivo de upgrade aprovado em `cobranca.md`.
- **Colisão dentro do próprio produto.** O Otto gera cobrança na conta do empregador (ADR 011) e avisa de conta em aberto (ADR 018). "Seus créditos acabaram" convive na mesma cabeça com "sua fatura está em aberto".
- **É a palavra padrão de ferramenta de IA vendida por consumo** — vizinha de "consumo de API", que a marca recusa desde a fundação.
- **A alternativa que o guardião propôs foi "ficha"**, pelo argumento de que ficha de fliperama e de orelhão importam exatamente a nossa mecânica (uma ficha vale um uso inteiro, do tamanho que for; jogo mais caro é de duas fichas) e passam no critério do ADR 004 sem conversão em reais.

**O que a escolha obriga**, e não é opcional: as travas do item 5 existem para conter o risco da âncora falsa. Sem elas, a objeção do guardião se realiza.

### 4. A âncora, que é o que impede a decisão de virar tarifário

> **Responder um cliente por um dia — a mesma definição de hoje, até 10 respostas do Otto — custa exatamente 1 crédito.**

Não é detalhe de implementação; é a condição que faz o modelo passar no critério que o próprio ADR 004 fixou (o dono confere sozinho, sem taxa de câmbio prévia na cabeça). Com a âncora:

- No caso dominante — o Atendente, que é 100% da v1 — **nada muda para o dono**: 200 créditos são os mesmos 200 atendimentos que ele já entendia.
- **Toda a tabela de preço, margem, pacote avulso e acúmulo continua valendo sem recalcular.** R$ 197/200, R$ 447/500, R$ 997/1.200, pacote de 100 por R$ 149, custo médio de R$ 0,295, margens de 63% a 68%.
- A taxa de câmbio só aparece onde ela tem que aparecer: nas ações que custam mais de verdade, porque pagam template da Meta.

**A definição canônica**, no lugar das três frases de `identidade.md`, mesma estrutura e terceira frase intacta:

> Um crédito é um dia de conversa com uma pessoa. A mesma pessoa amanhã conta outro. E se a conversa passar de 10 respostas do Otto, conta mais um.

**Quarta frase, só nas contas que têm cargo que começa conversa** — não aparece na v1, que só tem o Atendente:

> Quando é o Otto que começa a conversa, conta três: procurar alguém custa mais que responder.

### 5. As regras da moeda

1. **Inteiro, nunca fracionário.** 1, 2, 3. Não existe "0,4 crédito".
2. **O preço da ação deriva do custo real**, arredondado para cima, com a margem alvo da faixa. Não é número escolhido por percepção de valor.
3. **Só ação que o dono ligou custa mais que 1.** Nada que ele não escolheu pode ficar caro sozinho.
4. **Preço de ação só muda com aviso de 30 dias.** Mudar quanto uma ação custa é aumento de preço; silencioso, é aumento disfarçado — o mesmo tipo de coisa que `identidade.md` chama de upsell escondido.
5. **O preço aparece na frase da ação, no momento de ligar o cargo — nunca numa lista de tarifas.** A frase aprovada para a tela de ligar o Otto Vendedor: *"Responder quem escreveu conta 1 crédito. Ir atrás de um cliente que sumiu conta 3 — começar a conversa custa mais que responder."*
6. **Nunca o preço da ação em reais.** "Essa retomada custa R$ 2,67" é a taxa de câmbio que a moeda existe para fechar. Reais só onde já apareciam: preço da faixa e do avulso, com os dois eixos.
7. **Nunca nomear fornecedor para explicar o preço.** "A Meta cobra para iniciar" está proibido pelo ADR 005. A explicação verdadeira e permitida é "começar a conversa custa mais que responder".
8. **Ação que conta mais de um crédito não acontece sem alguém ter visto o número antes de apertar.** É regra de desenho, não só de texto: o Otto não gasta mais que o comum por conta própria.
9. **Crédito não é dinheiro do dono; é trabalho já pago.** Não existe "seu saldo", "sua carteira" nem "recarregar" — o que existe é o que o Otto já fez e o que sobrou dos meses passados.
10. **O extrato é obrigatório** — e **"extrato" é palavra interna, que nunca chega à tela**: é vocabulário de banco, e a lista se defende da leitura bancária pela forma (nome de gente e verbo, que nenhum banco usa para listar pessoas). O rótulo não pode desfazer o que a forma conquistou.

    O dono vê cada ação e quanto ela custou, com data e com quem foi atendido. É o que substitui a conferência de cabeça que ele fazia contando conversas no WhatsApp — e sem ele, a contestação de fatura que o ADR 004 trata como gatilho de revisão vira certeza.
11. **A regra de voz:** o extrato conta créditos; o Otto conta trabalho. No painel, o contador pode ser seco ("160 dos 200 créditos deste mês"). Na boca do Otto, o verbo vem antes do número: *"Este mês eu respondi 152 clientes e mandei 8 lembretes: 160 dos 200 créditos."*

### 6. A tabela de preços por ação — proposta, não medida

**Tudo abaixo da primeira linha está NÃO VERIFICADO** e depende do preço de template da Meta em reais depois de outubro de 2026, que a pendência 7 de `cobranca.md` já registra como não verificado e que precisa vir do acesso autenticado do Felipe à Meta.

| Ação | Quem faz | Custo real | Proposta |
|---|---|---|---|
| Responder um cliente por um dia, até 10 respostas | Atendente (v1) | R$ 0,295 medido em modelo | **1** — é a âncora |
| Cada 10 respostas a mais na mesma conversa | Atendente | +R$ 0,295 | **+1** — é a regra de conversa longa do ADR 004, agora dita na mesma moeda |
| Lembrar ou confirmar um horário | Agenda | template de utilidade + a conversa que ele abre | **1** (proposta) |
| Avisar de conta em aberto | Financeiro (ADR 018) | template de utilidade + a conversa | **2** (proposta) |
| Ir atrás de um cliente que sumiu | Vendedor | template de **marketing**, a categoria mais cara | **3** (proposta) |

O que a tabela precisa dizer ao dono, e é a única frase de venda que ela autoriza: **ir atrás de quem sumiu custa mais que responder quem escreveu.** Isso é verdade no custo e é intuitivo para quem tem loja.

### 7. O que fica em aberto

- **Se o cargo novo tem mensalidade além do consumo.** Minha recomendação: sim. O consumo sozinho não paga as quatro salvaguardas do ADR 016 (permissão registrada, limite por conta com aumento gradual, corte automático, nada de envio em número novo), que são custo fixo de engenharia — e sem mensalidade o cargo não aparece na linha do preço, que é a razão de a característica principal ser o cargo. O estrategista sugeriu **40% da faixa contratada**, proporcional e não valor absoluto, porque o custo do cargo escala com o volume da conta. **Decide-se junto com o Otto Vendedor**, como o ADR 016 já mandava.

## Consequências

- **A faixa passa a significar outra coisa, e isso tem que ser dito na hora da compra.** "O de 500" eram 500 atendimentos; agora são 500 créditos, e quem liga um cargo que começa conversa atende menos gente com eles. Dizer isso na primeira fatura, e não na tela de escolha da faixa, é o desenho errado.
- **"Conferível sozinho" muda de forma.** Hoje o dono confere contando conversas do dia no WhatsApp. Com preços diferentes por ação, ele confere pelo extrato, linha por linha. O extrato deixa de ser conveniência e vira requisito do critério do ADR 004.
- **`docs/produto/cobranca.md`** troca a seção "A métrica exibida: atendimentos" pela moeda e pela tabela de ações. A tabela de faixas e as contas de custo **não mudam**, por causa da âncora.
- **`docs/marca/identidade.md`** perde a linha "conversa (na lista) / atendimento (no saldo)" na forma atual e a definição de três frases; "créditos" sai da coluna *não diga*. O guardião reescreve. Ganho colateral: o substantivo público *atendimento* se aposenta e o verbo *atender* fica — sobram duas palavras públicas, **conversa** (a lista) e **crédito** (o saldo), em vez de três.
- **`docs/produto/experiencia.md`** ganha o extrato e a tela que mostra o preço da ação **antes** de o dono ligar o cargo. É trabalho do especialista de UI/UX, inclusive o nome da tela hoje chamada Atendimentos.
- **`docs/produto/dados.md`**: o evento de consumo passa a gravar **o preço aplicado e a versão da tabela de preços**. Sem isso, uma fatura contestada seis meses depois não se reconstrói. Especificação com o analista de produto.
- **Backend.** A tabela de preços por ação é dado versionado, não constante no código, e o consumo se debita pelo preço vigente no momento da ação. Duas travas desenhadas pelo analista de produto em `dados.md`: **a âncora vira restrição de esquema** (CHECK que impede a ação `responder` de valer diferente de 1 crédito — o primeiro gatilho de revisão deste ADR deixa de depender de vigilância humana), e o aviso de 30 dias da regra 4 vira evento com CHECK de prazo, para a promessa ter prova. A vigência da tabela é **por empresa**, porque os 30 dias correm por conta.
- **Retenção.** O extrato mostra com quem foi cada crédito, o ledger vive 5 anos e a tabela de contatos vive de 30 a 365 dias por escolha do empregador. Numa conta de 90 dias, a fatura contestada em seis meses abre um extrato em que nenhuma linha diz com quem — no exato momento para o qual o extrato existe. Pendência 18 de `dados.md`, com recomendação de que contatos passem a viver a vida da conta.
- **ADR 004 é revisto, não substituído.** O modelo (assinatura com franquia acumulável, sem teto, pré-paga) continua inteiro. O que muda é a unidade exibida, o eixo que nomeia o plano e a linha "créditos" da tabela de unidades.
- **ADR 021** (multicanal) continua valendo com a palavra trocada: um dia de conversa com uma identidade, em qualquer canal, custa 1 crédito.
- **ADR 025** (preparação paga) é a outra metade desta mudança e foi decidido no mesmo dia.

## Evidência comportamental (fichas)

| Afirmação | Tipo | Grau | O que a mata |
|---|---|---|---|
| O dono entende uma moeda com preço por ação sem achar que está sendo tarifado | Capacidade | **NÃO VERIFICADO** | 2 de 5 donos, ao ver a tela, perguntarem "então cada mensagem custa?" ou pedirem a conta em reais |
| Com a âncora em 1, o dono do Atendente não percebe diferença nenhuma para hoje | Capacidade | INFERIDO (o número e a definição não mudam; muda a palavra) | Um dono do Atendente perguntar quanto vale um crédito |
| A palavra "crédito" não instala a leitura de que 1 crédito vale R$ 1 | Capacidade | **NÃO VERIFICADO**, e é a objeção formal do guardião da marca | Ver o gatilho abaixo |
| "Ir atrás de quem sumiu custa mais que responder quem escreveu" é aceito sem explicação | Preferência | **NÃO VERIFICADO** | Donos pedirem desconto ou acharem injusto ao ligar o Vendedor |
| Preço por ação não aumenta a contestação de fatura | Ausência | **NÃO VERIFICADO** | Qualquer contestação nos 3 primeiros meses de cobrança real |

## Gatilho de revisão

- **A palavra.** Cinco donos pedirem a conta em reais em vez de créditos, ou perguntarem quanto vale um crédito, é a objeção do guardião realizada: a âncora falsa se instalou. A palavra volta à mesa, com "ficha" como alternativa já argumentada.
- **A âncora sair de 1** — qualquer proposta de fazer a resposta comum custar 2, ou meio crédito, mata o motivo pelo qual esta decisão é segura. Se o custo por resposta subir a ponto de exigir isso, o que muda é o tamanho da faixa, nunca a âncora.
- **Duas contas contestarem fatura** nos três primeiros meses de cobrança real: o extrato está insuficiente, ou o preço por ação está ilegível.
- **O preço de template da Meta em reais chegar**: a tabela da seção 6 deixa de ser proposta e é recalculada. Se uma retomada passar de 5 créditos, o cargo Vendedor precisa de preço próprio e não cabe na moeda comum.
- **O segundo cargo entrar em produção sem mensalidade própria** e a margem dele ficar abaixo do piso da faixa: a pendência da seção 7 volta à mesa com dado.
