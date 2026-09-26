# Identidade — nome, domínio e vocabulário

## O nome

**Otto.** Duas sílabas, palíndromo, fácil de falar, digitar e lembrar. Em português soa como "auto": autoatendimento, automático. O trocadilho é um ativo, mas se gasta rápido. Use no máximo uma vez por peça, nunca no nome do produto.

- Grafia: **Otto**, com O maiúsculo. Nunca "OTTO" ou "otto" em prosa (logo à parte).
- Pronome: **ele**.
- Domínio: **ottobr.ai**. Em texto, escreva "ottobr.ai", sem "www" e sem "https".

## Arquitetura de nomes

| Nível | Nome | Exemplo |
|---|---|---|
| A marca e o produto | Otto | "Contrate o Otto" |
| O cargo (função contratada) | Otto + cargo | **Otto Atendente** (v1); futuros: Otto Vendedor, Otto Financeiro |
| O que o cliente final vê | Otto, <função configurada> | "Otto, atendente da [Empresa]". O nome é fixo; a empresa configura o **cargo exibido** (padrão: nome do cargo, "atendente") e o **avatar**. Ver ADR 013 |

Regras:
- Cargo é substantivo de profissão, em português, uma palavra quando possível. Não use "módulo", "plugin", "skill" ou "feature" para nomear cargo.
- O nome é Otto em toda empresa. Não se troca, não se abrevia, não vira apelido. Ver ADR 013.
- Nunca criar um segundo personagem. Se a função pede outra "cara" para o cliente final, isso é cargo exibido e avatar, não personagem novo. Ver ADR 001.
- Cargo exibido descreve uma função ("recepção", "suporte", "agendamento"). Não é nome de pessoa, não é título que engane ("gerente", "Dr."), não é promessa ("resolve tudo"). Até 30 caracteres, sem emoji, sem "IA", "bot", "robô" ou "virtual". Regra completa e exemplos em `docs/produto/estilos-de-atendimento.md`.
- Nunca: "Otto Bot", "OttoAI", "Otto GPT", "Otto Assistant".

## Vocabulário

| Diga | Não diga | Por quê |
|---|---|---|
| contratar o Otto | assinar, comprar licença | Sustenta a metáfora de funcionário |
| cargo | módulo, plano, feature | Idem. Vale para o que a pessoa lê; `module` do NestJS continua módulo (ver "Onde este vocabulário vale") |
| dar mais uma função ao Otto / promover o Otto | fazer upgrade | Idem |
| funcionário de IA | chatbot, bot, robô, assistente virtual | "Bot" é o que o cliente já odeia. Otto se diferencia disso |
| atende, responde, resolve | automatiza, processa | Verbos de pessoa, não de sistema |
| passar para alguém da equipe | escalar, transferir para agente humano | Português de gente |
| o cliente final / quem escreve para a empresa | usuário final, lead | Em material da marca. Em código, tanto faz |
| empregador (interno) / a empresa / você (externo) | tenant, conta, customer | "Empregador" é termo interno de projeto. Para o público, "você" ou "sua empresa" |
| créditos, o que sobrou para o mês que vem (decidido, ver ADR 024) | tokens, consumo de API, cota, **horas do Otto, banco de horas**; carteira, saldo, recarga; conversas em aberto, fila de atendimento, abrir/encerrar atendimento, TMA, protocolo | **"Crédito" decidido pelo Felipe em 2026-09-09 (ADR 024) e retirado desta coluna, onde estava desde o ADR 004.** Motivo da saída: com vários cargos, "atendimento" parou de descrever tudo que consome franquia — quando o Otto avisa de conta em aberto, ele não atendeu ninguém —, e a moeda única precisa de um nome que sirva a qualquer ação. **Ressalva registrada, e é a razão das regras da seção "A moeda é o crédito": crédito é palavra de dinheiro**, e o parecer contrário do guardião está no ADR 024 com o gatilho que traz a palavra de volta à mesa. Token é medição interna. Hora foi descartada em 2026-09-08: dá impressão de compra de hora de relógio, convida a uma conversão que não fecha e contradiz o "atende 24 horas por dia" da própria venda. **"Pessoas atendidas" só quando o número for mesmo de pessoas distintas: a mesma pessoa voltando outro dia gasta outro crédito.** As colocações de call center arrastam a conversa para o lado de "ticket" (ver linhas abaixo); nada aqui ganha número de protocolo |
| a faixa é o número: "300 créditos por mês", "800", "2.000" (decidido, ver ADR 004; unidade trocada pelo ADR 024) | plano Básico / Pro / Enterprise; Avançado, Premium, Essencial; carga horária, período integral / meio período; Júnior / Pleno / Sênior; "dois Ottos", "Otto em dobro"; "Otto Atendente 300"; nome que chame o movimento do cliente de fraco ou parado | **Faixa não tem nome, tem número.** Toda faixa entrega o mesmo Otto, com o mesmo caráter — adjetivo que sugira Otto melhor ou pior mente, inclusive Júnior/Pleno/Sênior, e faz o suporte responder "ele errou porque estou no Básico?". "Enterprise" ainda é inglês. "Meio período" caiu com a hora (ADR 004): o Otto não tem jornada, atende sempre. Pluralizar o Otto fere o ADR 001. E o número nomeia a **faixa**, nunca o Otto: o nome dele não recebe sufixo (ADR 013). **Desde o ADR 024 o número da faixa conta créditos, não conversas**: quem liga um cargo que começa conversa fala com menos gente com os mesmos 300. Isso é dito na hora de escolher a faixa, não na primeira fatura |
| indicar o Otto, ganhar um mês de créditos da sua faixa ("um mês do Otto") | programa de afiliados, cashback, bônus de indicação em dinheiro, **um mês grátis** | Indicação é entre clientes e paga em um mês da própria franquia (ADR 011). Dinheiro quebra a metáfora e cheira a esquema. Não é "mês grátis": o que entra são créditos, que acumulam e podem ser gastos depois. **Com "crédito" no lugar de "atendimento", esta linha exige atenção redobrada**: crédito ganho de indicação nunca é descrito como bônus, cashback ou dinheiro na conta — é um mês de trabalho do Otto, adiantado |
| recado | ticket, protocolo, chamado, mensagem pendente | O que o Otto anota quando a empresa não tem quem assuma (ADR 012). Palavra de balcão, não de sistema |
| assumir a conversa | atender o ticket, pegar o chamado, transferir para agente humano | Idem. É gente da empresa entrando na conversa |
| conversa (na lista) / crédito (no contador) | usar as duas como sinônimo na mesma tela; **atendimento como substantivo** | A lista da caixa de entrada é de conversas (ADR 015); o contador é de créditos (ADR 024). Uma conversa de três dias com a mesma pessoa gasta três créditos. Onde os dois números aparecem juntos, a frase que explica a diferença aparece junto. **O substantivo "atendimento" se aposentou do texto público com o ADR 024**, e isso simplifica: sobraram duas palavras, conversa e crédito, em vez de três. **O verbo fica** — "o Otto atende", "o Otto atendeu 12 pessoas hoje" — e o cargo continua sendo **Otto Atendente**. **Também fica "horário de atendimento"** (rótulo de configuração, 2026-09-09): é a palavra que está na porta da loja do dono, não a unidade de cobrança. Quem revisar não deve "consertar" nenhum dos três |
| parceiro | afiliado, revendedor, distribuidor, rede, downline | Parceiro tem carteira e indica; não revende nem recruta. Vocabulário de MMN foi descartado (ADR 011) |
| cargo exibido | nome do bot, apelido do assistente, nome de exibição, persona | O nome é Otto e não se configura (ADR 013). O que a empresa escolhe é a função que aparece ao lado dele, como num crachá |
| o que o Otto sabe (a tela e o conjunto) / resposta (a unidade: "o Otto sabe 14 respostas") | base de conhecimento, item, entrada, FAQ, retrieval, embedding, chunk | Aprovado em 2026-09-09 (`experiencia.md` §12.2). O dono não mantém uma base; ele ensina um funcionário. **"Resposta" tem dois usos:** o que o Otto sabe responder e a mensagem que ele mandou. Onde os dois convivem, o contador usa a forma completa — "o Otto sabe 14 respostas" —, nunca "14 respostas" solto |
| ensinar o Otto | treinar, alimentar a base, configurar o conhecimento | Aprovado em 2026-09-09. "Treinar" é jargão de IA, sugere sessão longa e insinua que o Otto de uma empresa fica melhor que o de outra — a mesma mentira que o ADR 004 proíbe nos nomes de faixa. O Otto é o mesmo em toda empresa; muda o que ele sabe do negócio. **Não existe "Otto treinado", "nível de treinamento" nem barra de progresso de base** |
| material ("manda o material que você tiver") | documento, upload, arquivo, anexo | Aprovado em 2026-09-09. Neste nicho o material é foto do caderno, áudio e folha da bancada; "documento" e "upload" descrevem outro público. E material nunca vira conhecimento direto: vira resposta proposta que o dono confere |
| de cor ("o Otto sabe 60 respostas de cor") | prefixo cacheado, contexto, no prompt, tokens de sistema | Aprovado em 2026-09-09. É a tradução na borda do limite técnico do ADR 004. Palavra que o dono usa desde a escola, e o único momento em que a distinção aparece para ele é quando o de cor enche |
| os créditos deste mês / o que sobrou dos meses passados / os créditos deste mês acabaram | franquia, ciclo, saldo, carteira, cota, recarga, overage, "seu plano acabou", **"seus créditos", "seu saldo de créditos"** | Aprovado em 2026-09-09 (`experiencia.md` §13.3), unidade atualizada pelo ADR 024. Ciclo vira "mês" com a data concreta: "voltam dia 12". **"O que sobrou dos meses passados" sobreviveu palavra por palavra** à troca da unidade, porque não nomeia a unidade — e por isso continua sendo a melhor frase do conjunto. O possessivo ("seus créditos", "seu saldo") sai pela trava da seção "Crédito é trabalho já pago, não dinheiro do dono" |
| comprar mais 100 créditos | comprar o pacote, recarga, recarregar, comprar créditos (sem número), upgrade | Aprovado em 2026-09-09, unidade atualizada pelo ADR 024. **O número vem sempre na frente**, mesma razão de "a faixa é o número": o dono confere sozinho, e comparar "o pacote" com "o de 500" compara uma etiqueta com um número — a assimetria sempre favorece um lado. "Pacote" só como apelido em prosa, nunca no botão nem no lugar do número. **"Comprar créditos" sem número é a forma proibida mais provável agora**: sem o 100 na frente, a frase não diz o que ele leva |
| o que eu entendi (o conjunto que o dono confere) / linha (a unidade física na tela: "são 6 linhas", "você deixou 3 em branco") | **afirmação**, item, sentença, declaração, tag, cartão, card | Aprovado em 2026-09-09 (`experiencia.md` §12.5.A). "Afirmação" é a palavra do desenho e do código, e ela é boa lá; na tela é palavra de lógica, e o dono de uma assistência técnica não confere afirmações — ele confere se o Otto entendeu o negócio dele. **A tela não batiza a unidade**: ela mostra *o que eu entendi*, e o nome só aparece depois de guardada, onde já existe e é **resposta** ("o Otto sabe 14 respostas", linha acima). Uma coisa, um nome, do onboarding até o painel |
| passar para o de 500 | fazer upgrade, subir de plano, **promover o Otto** | Aprovado em 2026-09-09. "Promover o Otto" é para cargo novo (linha acima), nunca para faixa maior: toda faixa entrega o mesmo Otto, e sugerir que ele melhora com a faixa é o que o ADR 004 já proibiu nos nomes |

## A moeda é o crédito

**Decidido pelo Felipe em 2026-09-09. Origem: ADR 024.** Substitui "atendimentos" como unidade exibida da franquia (ADR 004, nota de 2026-09-08), que fica valendo só como verbo e como nome de cargo.

**O que mudou e por quê.** O produto passa a se posicionar como funcionário com vários cargos — o Atendente é um entre Vendedor, Agenda e Financeiro. "Atendimento" parou de descrever tudo que gasta franquia: quando o Otto avisa de conta em aberto, ele não atendeu ninguém. Fica **uma moeda só para o Otto inteiro** (ADR 001: uma pessoa só, um contador), com **preço em número inteiro por ação** e uma âncora fixa:

> **Responder um cliente por um dia custa 1 crédito.** É a ação mais comum, e é o 1 do sistema. Ações que começam uma conversa custam mais.

**O parecer contrário do guardião foi vencido, e está registrado no ADR 024** com o argumento inteiro (a leitura falsa de "1 crédito = R$ 1" que a faixa de entrada de 200 por R$ 197 ensina, a colisão com "fatura em aberto" do Otto Financeiro, e o registro de consumo de API). O gatilho de revisão mora no ADR 024. **As regras abaixo existem para segurar exatamente esse risco** — elas não são preferência de estilo, são a contenção da palavra escolhida.

### A definição de crédito, sempre com as três frases

Onde o número de créditos aparece — tela do contador, Início, site, e-mail de cobrança —, a definição vem junto, nesta forma:

> Um crédito é um dia de conversa com uma pessoa. A mesma pessoa amanhã conta outro. E se a conversa passar de 10 respostas do Otto, conta mais um.

A terceira frase não é opcional. O ADR 004 fixou a regra das 10 respostas **e** o critério da métrica exibida: conferível sozinho pelo empregador. Sem ela, o dono conta as conversas do dia, acha 40, o painel diz 43, e a diferença que ele não consegue explicar vira contestação de fatura — que o próprio ADR 004 trata como gatilho de revisão. Decidido em 2026-09-09 ao revisar `experiencia.md` §13.3; unidade trocada pelo ADR 024, estrutura intacta.

**Quarta frase, só nas contas que têm cargo que começa conversa** (não existe na v1, que só tem o Atendente):

> Quando é o Otto que começa a conversa, conta três: procurar alguém custa mais que responder.

Ela é condicional de propósito. A definição mora embaixo do número em toda tela, e carregar em toda conta uma regra que não se aplica a ela é ruído. Entra junto com o cargo, nunca antes — e a partir daí não sai mais.

**Consequência do "conferível sozinho", que muda de forma com a moeda.** Antes o dono conferia contando as conversas do dia no WhatsApp. Com preços diferentes por ação, ele só confere olhando **o que o Otto fez, linha por linha, com o número ao lado**. Esse extrato deixa de ser conveniência e passa a ser requisito do critério do ADR 004.

### Como o preço de uma ação aparece

1. **O preço aparece na frase da ação, no momento de ligar o cargo — nunca numa lista de tarifas.** Forma aprovada, para a tela que liga o Otto Vendedor:

   > Responder quem escreveu conta 1 crédito. Ir atrás de um cliente que sumiu conta 3 — começar a conversa custa mais que responder.

2. **Nunca em reais por ação.** "Essa retomada custa R$ 2,67" reabre a taxa de câmbio que as travas abaixo existem para fechar.
3. **Nunca nomear fornecedor para explicar o preço.** "A Meta cobra para iniciar" está proibido pelo ADR 005 (nenhum fornecedor aparece em texto para empregador). A explicação verdadeira e permitida é "começar a conversa custa mais que responder".
4. **Ação que conta mais de 1 crédito não acontece sem alguém ter visto o número antes de apertar.** É regra de desenho, não só de texto: o Otto não gasta acima do comum por conta própria.

**Regra de voz: o extrato conta créditos; o Otto conta trabalho.** No painel, onde quem fala é a marca (`voz-e-tom.md` §1.1), o contador pode ser seco — "O Otto usou 160 dos 200 créditos deste mês". Na boca do Otto, o verbo vem antes do número:

> Este mês eu respondi 152 clientes e mandei 8 lembretes: 160 dos 200 créditos. Sobram 40 — uns 5 dias no ritmo desta semana.

**A regra tem duas formas, e a segunda vale na v1 inteira.** A forma acima só funciona quando há mais de um cargo, porque o número dos créditos sai da soma de dois trabalhos. **Com um cargo só não há o que enumerar**, e as saídas óbvias são todas falsas: "respondi 160 clientes" mente (160 créditos não são 160 pessoas — a mesma pessoa amanhã conta outro, e `identidade.md` já proíbe "pessoas atendidas" quando o número não é de pessoas distintas); "160 vezes" lê-se como 160 mensagens; "160 dias de conversa" é verdadeiro e ilegível. Repetir o mesmo número duas vezes é pior que dizer uma. Então:

| Quantos cargos | Forma |
|---|---|
| **Mais de um** (v1.1 em diante) | Enumera o trabalho, e o número dos créditos sai da soma: *"Este mês eu respondi 152 clientes e mandei 8 lembretes: 160 dos 200 créditos."* |
| **Um só** (v1) | O trabalho vira **o que ele estava fazendo**, e vem antes do número: *"Este mês, atendendo cliente, eu já usei 160 dos 200 créditos."* |

O que a regra exige nas duas formas é a mesma coisa: **o trabalho aparece antes do número.** "Usar" é o verbo de contagem e é permitido **atrás** do trabalho, nunca abrindo a frase. Continuam fora: começar pelo número ("Já são 160 dos 200"), "consumi", "gastei", e qualquer possessivo.

O Otto nunca fala de crédito como quem pede recarga. `voz-e-tom.md` §1.1: ele é funcionário, não fornecedor — fala do trabalho dele, nunca do bolso do dono.

### Crédito nunca aparece ao lado do seu valor em reais na mesma frase

A leitura perigosa é "1 crédito = R$ 1", que a faixa de entrada quase confirma sozinha (200 por R$ 197) e que as outras faixas desmentem (R$ 0,89 no de 500, R$ 0,83 no de 1.200, R$ 1,49 comprando mais 100). Por isso:

- **No contador, no extrato, na frase da ação e nos avisos de 80% e 100%: crédito sem reais.** Nunca "cada crédito custa", nunca "R$ 197 ÷ 200".
- **A única exceção é a tela que compara comprar mais com subir de faixa** — a regra dos dois eixos, logo abaixo, que continua valendo onde já valia. Lá o preço por crédito **nunca aparece sozinho: aparece sempre aos pares, um por caminho**, cada um grudado na sua opção.

**É a própria regra dos dois eixos que desmente o câmbio**, e é por isso que as duas convivem sem virar tabela: um preço solto ensina uma taxa ("um crédito vale R$ X"); dois preços lado a lado, presos a duas escolhas, ensinam a única coisa verdadeira — **quanto sai o crédito depende do caminho que ele escolher, e é isso que ele está decidindo naquela tela**. Fora dali não há decisão a tomar, então não há reais a mostrar.

### Crédito é trabalho já pago, não dinheiro do dono

Crédito não é carteira, não é saldo bancário e não se recarrega. É trabalho do Otto comprado adiantado.

| Não diga | Diga |
|---|---|
| seu saldo, seus créditos, sua carteira | **os créditos deste mês**, **o que sobrou dos meses passados** |
| recarregar, fazer uma recarga, adicionar saldo | **comprar mais 100 créditos** |
| seu saldo acabou, seus créditos zeraram | **os créditos deste mês acabaram** (e a data: "voltam dia 12") |
| resgatar, converter, transferir créditos | não existe: crédito não vira dinheiro nem sai da conta |

**"Extrato" é palavra nossa, não da tela.** Ela é útil entre nós e nos documentos — nomeia a lista do que o Otto fez, linha a linha, que o ADR 024 tornou obrigatória. Na tela ela não aparece: "não consegui carregar o extrato" é a única frase que a deixaria escapar, e vira **"Não consegui carregar. Tenta de novo."** Extrato é a palavra do banco, e a lista já corre o risco de ser lida como aplicativo de banco; o que desfaz essa leitura são as linhas com nome de gente e verbo — nenhum banco lista pessoas com nome e verbo —, e o rótulo não pode desfazer o que a forma conquistou.

O possessivo é o teste rápido. "Seus créditos" transforma a tela num extrato bancário e convida à pergunta "quanto isso vale em reais?" — a pergunta que o parecer contrário do ADR 024 previu. "Os créditos deste mês" fala do mês de trabalho contratado, que é o que ele comprou de verdade.

**O que continua liberado** (`cobranca.md`, pendência 5, decidida pelo Felipe): "o que você já pagou continua seu, mesmo se você parar". A frase fala do que foi pago, não de dinheiro guardado — e "para sempre" segue bloqueado pelo motivo da seção seguinte.

### O nome da preparação — parecer, pendente de decisão do Felipe

O ADR 025 criou um valor pago uma vez, antes de o Otto entrar em operação (R$ 997), e deixou o nome público em aberto. **Recomendação do guardião, 2026-09-09: "preparação", com uma trava.**

- **A trava, que resolve a objeção registrada no próprio ADR:** *preparação* nomeia **o nosso trabalho**, nunca um estado do Otto. **"Otto preparado" e "Otto despreparado" não existem**, pela mesma razão que "Otto treinado" não existe (linha "ensinar o Otto"): o Otto é o mesmo em toda empresa; o que se prepara é o que ele sabe da operação daquela loja. Com o adjetivo proibido, a objeção não tem por onde entrar.
- **"A conversa de entrada" tem uma colisão que a derruba, e não é de tom:** em cobrança, **entrada é a primeira parcela**. Um valor pago uma vez, antes das mensalidades, chamado "de entrada", vai ser lido como sinal — como se os R$ 997 fossem adiantamento do que ele já vai pagar todo mês. Isso é pior que um nome fraco: é um nome que promete desconto que não existe.
- **"A nossa conversa"** descreve o primeiro dos quatro itens entregues e some na linha da fatura, ao lado de "Otto Atendente — R$ 197/mês".
- **O nome nunca carrega o preço sozinho, e nenhum carregaria.** O que sustenta R$ 997 é o conteúdo, então a linha de venda diz o conteúdo junto — forma proposta em `docs/decisoes/025`, parecer do guardião.

Enquanto o Felipe não decidir, nenhum texto público usa nenhum dos candidatos. **"Setup", "taxa de setup", "onboarding" e "implantação" estão fora em qualquer cenário**: os três primeiros por serem inglês (regra do `CLAUDE.md`), e "implantação" porque é a palavra do grupo que a pesquisa registra com 45 dias ou mais, e ela carrega o prazo junto — o nosso é no mesmo dia.

### Nome de tela

**Proposta ao especialista de UI/UX, não decisão minha.** A tela hoje chamada **Atendimentos** (`experiencia.md` §13.3 e §13.5.B) fica sem nome válido depois desta troca. Proponho **Créditos**, e o efeito alcança §13.3, §13.5.A e §13.5.B. `experiencia.md` é dele (ADR 015: forma é dele); quem decide o nome da tela é ele.

### Sobre o acumulado: "não vence no fim do mês", nunca "para sempre"

A forma aprovada é **"o que você não usar não vence no fim do mês: vai para o mês seguinte"**. Ela é verdade e está decidida (ADR 004, sem teto).

**Liberada em 2026-09-09, com a pendência 5 de `cobranca.md` decidida pelo Felipe** (o que já foi pago sobrevive à parada da assinatura e à descida de faixa): **"o que você já pagou continua seu, mesmo se você parar"**. Essa frase agora tem lastro e pode ser usada.

**"São seus para sempre", "nunca vencem" e "guardados para sempre" continuam bloqueados**, por outro motivo: a régua de inadimplência (`cobranca.md`, pendência 8) ainda não disse se quem está com fatura vencida também usa o acumulado, e "para sempre" é promessa de permanência maior do que qualquer decisão tomada até aqui. Ela só é cobrada quando o cliente já está de saída, que é o pior momento possível para descobrir uma exceção.

### Onde os dois preços aparecem, aparecem os dois eixos

Sempre que o produto compara comprar mais créditos com subir de faixa, mostra **quanto sai por crédito** e **quanto sai do caixa hoje**. É a única tela em que crédito e reais aparecem juntos, e ali eles aparecem sempre aos pares (seção "Crédito nunca aparece ao lado do seu valor em reais na mesma frase"). Os dois eixos apontam para lados opostos — o de 500 sai R$ 0,89 contra R$ 1,49 do avulso, e custa R$ 447 contra R$ 149 —, e a troca de faixa no meio do mês cobra cheio, sem proração (Felipe, 2026-09-09): no mês da troca a conta é a soma das duas. **Mostrar só o eixo que favorece a venda maior é upsell disfarçado**, e é o que a `persona-otto.md` chama de vendedor de infomercial. Nunca escrever que subir de faixa "sai mais barato já neste mês": sob a regra em vigor, este mês sai mais caro.

## Onde este vocabulário vale — e onde não vale

O vocabulário acima é regra de **texto que uma pessoa lê**: site, painel, onboarding, e-mail, notificação, mensagem de erro na tela, nome de tela e de funcionalidade, mensagem do Otto no WhatsApp, documento de produto e de marca.

Não é regra de **código nem de infraestrutura**: nome de classe, função, variável, tabela, coluna, endpoint, fila, tópico, evento interno, pasta, pacote, branch, log, métrica de servidor, comentário de código e documento técnico escrito para quem programa. Ali manda o que é mais claro para quem mantém o sistema.

Casos concretos, para não haver dúvida:

| Em código | Na tela | Por quê |
|---|---|---|
| `module` do NestJS, `packages/`, `apps/` | — | Módulo é unidade de código. **Cargo é conceito de produto** (Otto Atendente, Otto Vendedor), não unidade de código. Não renomeie módulo para cargo, nem crie `CargoModule` porque "cargo substitui módulo" |
| `tokensEntrada`, `tokensSaida`, tabela de consumo, `saldo`, `franquia` | créditos | Token é a medição real e o saldo interno é em token. A tradução acontece na borda, ao exibir. **O crédito é unidade de exibição, não de medição** (ADR 024) |
| `empresaId`, `tenant`, `company_id` | você, sua empresa | "Tenant" é termo de arquitetura multi-empresa. Só não pode aparecer na tela |
| `escalarParaHumano()`, `handoff`, `ticket` como nome interno | passar para alguém da equipe, recado | Idem |
| `bot`, `agent`, `assistant` em nome de biblioteca ou de campo de API externa | atendente de IA, o Otto | A Meta chama de bot; a nossa marca não. Não brigue com a API alheia |

Duas regras que fecham a fronteira:

1. **Se a string sai na tela ou na conversa, o vocabulário vale — mesmo escrita dentro do código.** Rótulo de botão, texto de e-mail, mensagem de erro visível e prompt do Otto são texto público morando em arquivo `.ts`. Passam pelo guardião da marca.
2. **Coincidência de palavra não é violação.** Um identificador chamado `module`, `agent`, `bot` ou `plan` não fere a marca. Quem revisa marca revisa texto público; não revisa identificador, nome de tabela nem log. E o inverso também vale: termo técnico não vaza para a tela sem tradução.

Na dúvida sobre um nome, pergunte quem vai ler. Empregador ou cliente final → vocabulário da marca. Quem mantém o sistema → o nome mais claro em engenharia.

## Quando o cliente final pergunta sobre o Otto

O Otto **não se apresenta como IA por conta própria**. Quando o cliente pergunta ("é robô?", "é uma pessoa?", "quem é você?", "como você funciona?"), ele responde a verdade, se apresenta e divulga a marca, uma vez só, e volta ao assunto do cliente. Decidido em ADR 003.

**Conteúdo obrigatório** da resposta, em qualquer preset e em qualquer ordem natural:

1. Diz que é IA.
2. Diz que se chama Otto e qual função exerce ali, usando o cargo exibido de forma natural ("Meu nome é Otto, atendente aqui na [Empresa]"). O nome é sempre Otto; não existe variante de apelido. Ver ADR 013.
3. Cita ottobr.ai uma vez.
4. Volta ao assunto do cliente com uma pergunta.

**A forma segue o preset** escolhido pela empresa (Cordial, Formal, Descontraído, Direto). Os textos canônicos por preset, tanto da saudação quanto desta resposta, estão em `docs/produto/estilos-de-atendimento.md`, seção "Textos fixos por preset". O guardião da marca confere conteúdo, não string exata.

Quando o cliente pede uma pessoa: "vou passar para alguém da equipe", no tom do preset, sem divulgação de marca.

Regras:
- "Atendente de IA" é a forma aprovada de dizer o que ele é no cargo de atendente. Não usar "assistente virtual", "bot", "robô".
- "Otto, <função>" aparece na saudação, uma vez, como apresentação de funcionário ("Oi! Eu sou o Otto, atendente da [Empresa]"). Depois é só a conversa; o Otto não repete nome e função a cada mensagem.
- A divulgação (que é IA + ottobr.ai) aparece **uma vez por conversa**, só quando perguntado sobre si. Nunca em saudação, nunca em rodapé, nunca no meio de uma conversa em que ninguém perguntou.
- Não vende o Otto para o cliente final. Cita a marca e volta ao trabalho. Quem quiser, procura.

## Frase de posicionamento (rascunho)

> Otto é o funcionário de IA que sua empresa contrata. Ele começa atendendo seu WhatsApp.

Alternativas em `voz-e-tom.md`, seção "Headlines".

## Identidade visual

Não definida. Quando for definir, o guardião da marca deve verificar coerência com a persona: nada de robô, nada de mascote infantil, nada de "cérebro com circuito". Referência de sensação: crachá, uniforme, caderno de anotações. Uma pessoa competente de camisa polo.
