# Cobrança

Modelo decidido pelo Felipe em 2026-09-08 (ADR 004). **A unidade exibida mudou em 2026-09-09 (ADR 024): a franquia aparece em créditos, e a característica principal do plano passou a ser o cargo, não o volume.** Infraestrutura decidida em ADR 005: inferência na DigitalOcean (preço por token conhecido), WhatsApp direto na Meta.

Neste documento, **crédito** é a unidade da franquia e vale o que "atendimento" valia: um dia de conversa com uma pessoa, até 10 respostas do Otto. A âncora é 1:1 por decisão do ADR 024, e é por isso que nenhuma conta de custo, margem ou faixa mudou com a troca da palavra. Onde "atender" sobrar aqui, é verbo.

## O modelo

- **Meio de pagamento: Asaas** (ADR 010). Assinatura recorrente com PIX, boleto e cartão; webhook de pagamento credita a franquia do ciclo.
- **Assinatura mensal** dá ao empregador uma **franquia de uso**, medida internamente em **tokens**.
- A franquia é **acumulativa**: o que não foi usado no mês passa para o seguinte.
- O saldo **se gasta conforme o uso da IA** (cada resposta do Otto consome).
- O saldo aparece para o empregador em **créditos** (ADR 024). Quantos créditos cabem em cada faixa depende de tokens por crédito medidos, que ainda não existem.
- **Existe uma segunda linha de receita**, paga uma vez, antes de o Otto entrar: a preparação (ADR 025). Ver a seção própria abaixo.

## O que é interno e o que é externo

| | Interno (medição) | Externo (o que o empregador vê) |
|---|---|---|
| Unidade | token | **crédito**. Nunca "token" |
| Onde aparece | banco, logs, painel de admin da ottobr.ai | site, painel do empregador, e-mail de aviso |
| Quem decide | infraestrutura | marca + produto |

**Regra de marca:** a palavra "token" não aparece para o empregador. Dono de loja não sabe o que é token, não consegue prever quantos gasta e não confia em unidade que não entende. Token é como a folha de pagamento calcula; não é como se contrata alguém.

## A moeda exibida: crédito

**Decidida pelo Felipe em 2026-09-09 (ADR 024)**, no lugar de "atendimentos", que era a palavra do cargo Atendente e deixou de servir quando o produto passou a se apresentar como funcionário com vários cargos. A justificativa completa, o parecer contrário do guardião da marca e o gatilho que traz a palavra de volta à mesa estão no ADR 024.

> **Um crédito é um dia de conversa com uma pessoa. A mesma pessoa amanhã conta outro. E se a conversa passar de 10 respostas do Otto, conta mais um.**

Quarta frase, só nas contas com cargo que começa conversa — não existe na v1:

> Quando é o Otto que começa a conversa, conta três: procurar alguém custa mais que responder.

A janela de 24h é convenção de contagem, emprestada da janela da Meta porque é o recorte natural de uma conversa de WhatsApp. Não é alinhamento de custo: desde 1º de outubro de 2026 a Meta cobra por mensagem, não por janela.

**A âncora, que é o que segura tudo:** responder um cliente por um dia custa **exatamente 1 crédito**. Por isso a troca da palavra não mexeu em nenhum número deste documento — 200 créditos são os 200 atendimentos de ontem. Se a âncora sair de 1, toda a tabela de faixas precisa ser refeita.

**O critério que elege a unidade**, e que vale para qualquer métrica exibida daqui para a frente:

1. O empregador consegue **conferir sozinho**.
2. Ele **não tem taxa de câmbio prévia** para a unidade.

| Unidade | Confere sozinho | Sem câmbio prévio | Veredito |
|---|---|---|---|
| **Créditos** | Sim, pelo extrato — não mais de cabeça | Parcial: a âncora em 1 resolve o caso comum; ações que começam conversa custam mais | **Escolhida pelo Felipe em 2026-09-09** (ADR 024), contra o parecer do guardião |
| ~~Atendimentos~~ | Sim, conta as conversas | Sim | Escolhida em 2026-09-08, **aposentada em 2026-09-09**: é a palavra do cargo Atendente, e o Otto Financeiro avisando de conta em aberto não faz atendimento |
| Fichas | Sim, pelo extrato | Sim — o modelo de fliperama já traz "um uso inteiro = 1" e "ação cara = 2 ou 3" | Recomendada pelo guardião da marca, **não escolhida**. Fica registrada como a alternativa se o gatilho da palavra disparar |
| Respostas | Sim, conta as mensagens do Otto | Sim | Casa melhor com o custo, mas erra na hora da compra: o dono estima quantos clientes o movimento traz, não quantas mensagens |
| ~~Horas do Otto~~ | Não | Não | **Descartada** em 2026-09-08. Impressão literal de compra de horas, conversão que não fecha, e contradiz o "atende 24 horas por dia" da própria venda |

**O que a escolha custa, e não é pouco:** "crédito" é palavra de dinheiro, e a faixa de entrada é 200 por R$ 197 — ela ensina que 1 crédito ≈ R$ 1, e as outras faixas desmentem (R$ 0,89, R$ 0,83, R$ 1,49 no avulso). É a estrutura do erro que derrubou a hora. As travas que contêm isso são regra, não estilo, e estão na seção 5 do ADR 024: preço de ação nunca em reais, crédito nunca ao lado do seu valor em reais na mesma frase, e crédito não é dinheiro do dono — é trabalho já pago.

**O extrato deixou de ser conveniência e virou requisito.** Com preço por ação, o dono não confere mais de cabeça contando conversas no WhatsApp: ele confere linha por linha, com data, quem foi atendido e quanto contou. Sem extrato, o critério 1 acima não é atendido e a contestação de fatura sai de risco e vira certeza.

**Preço por ação:** a tabela está no ADR 024, seção 6, e **tudo fora da primeira linha está NÃO VERIFICADO** — depende do preço de template da Meta em reais, que é a pendência 7 deste documento. A frase que a tabela autoriza na venda é uma só: ir atrás de quem sumiu custa mais que responder quem escreveu.

**Como aparece:** "O Otto usou 84 dos 200 créditos deste mês. Sobram 116, e o que sobrar vai para outubro." Logo abaixo, sempre visível, a definição de três frases. Número, nunca barra sem número. O acumulado é dito como sobra, não como "banco" de nada. Na boca do Otto, o verbo vem antes do número: "este mês eu respondi 152 clientes e mandei 8 lembretes".

**Não diga "pessoas atendidas" no lugar de créditos.** 84 créditos podem ser 60 pessoas, e o empregador que confere vai achar a diferença. "Pessoas" só quando o número for mesmo de pessoas distintas.

**Fronteira com a caixa de entrada (ADR 015):** a lista é de **conversas**, o contador de saldo é de **créditos**. Uma conversa de três dias com a mesma pessoa são três créditos, então os dois números não batem e isso está certo. Onde os dois aparecem na mesma tela, a frase que explica a diferença aparece junto. A troca de palavra simplificou a fronteira: o substantivo "atendimento" saiu do vocabulário público e o verbo "atender" ficou.

**A faixa passou a significar outra coisa, e isso se diz na hora da compra.** "O de 500" eram 500 créditos; agora são 500 créditos, e a conta que liga um cargo que começa conversa atende menos gente com eles. Dizer isso na primeira fatura, e não na tela de escolha da faixa, é o desenho errado.

**Base de custo verificada em 2026-09-08 (reconferir antes de fechar preço):** Claude Sonnet 5 na DigitalOcean custa US$ 2 por 1M tokens de entrada e US$ 10 por 1M de saída; Haiku 4.5, US$ 1 / 5.

**Atenção, mudança de regra da Meta.** A resposta dentro da janela de 24h era grátis e **passa a ser cobrada em 1º de outubro de 2026**, como mensagem de serviço, à tarifa de utilidade do país (referência Brasil: US$ 0,0068 por mensagem). Estimativa de custo por resposta do Otto: ~US$ 0,012, sendo ~US$ 0,0055 de token e US$ 0,0068 de Meta. **Quase 60% do custo variável não é token.** Fonte e conta em `docs/mercado/pesquisa-2026-09.md`, seção 7.

## Preço e custo por crédito

**Aprovado pelo Felipe em 2026-09-08.** Modelo de custo em `scratchpad`/reproduzível pela tabela abaixo; preços de token conferidos na referência da API em 2026-09-08 (Sonnet 5: US$ 2 entrada / US$ 10 saída por milhão; Haiku 4.5: US$ 1 / 5), tarifa da Meta US$ 0,0068 por mensagem de serviço, câmbio US$ 1 = R$ 5,10.

### A conversa extrema, medida em tokens

Cenário excepcional: 42 mensagens do cliente, 12 áudios somando 18 minutos, 30 respostas do Otto, empresa com catálogo e tabela de preços grandes, portas de agenda, catálogo e cobrança ligadas.

| | Tokens |
|---|---|
| Entrada no Sonnet (30 chamadas, prompt reenviado a cada resposta) | **626.460** |
| Saída do Sonnet | 7.500 |
| Classificador Haiku (42 mensagens) | 51.660 |
| **Total numa conversa só** | **~685.000** |

O que explode não é o tamanho das mensagens: é o **prompt inteiro reenviado a cada resposta**. Na 30ª resposta o Otto remanda caráter, estilo, base da empresa, ferramentas e as 29 trocas anteriores. Composição do prefixo fixo assumida: caráter 1.200 · estilo 400 · base de conhecimento 8.000 · definições das portas 1.500; mais 650 tokens por turno de histórico, com áudio transcrito pesando ~400 por mensagem.

### Custo por crédito

| Perfil | Sem cache | Com cache | Com cache + as três medidas abaixo |
|---|---|---|---|
| Curto (3 respostas) | R$ 0,27 | R$ 0,24 | R$ 0,16 |
| Típico (7 respostas, 1 áudio) | R$ 0,76 | R$ 0,53 | R$ 0,35 |
| Extremo (30 respostas, 18 min de áudio) | R$ 8,50 | R$ 3,44 | R$ 1,88 |
| **Média** (50% curto, 42% típico, 8% extremo) | R$ 1,13 | R$ 0,62 | **R$ 0,38** |

**Cache de prompt é obrigatório, não otimização.** A DigitalOcean suporta cache para modelos Anthropic no mesmo esquema `cache_control`. Use **TTL de 1 hora**, não o padrão de 5 minutos: cliente de WhatsApp some por 20 minutos e volta, e a 5 minutos o cache expira no meio da conversa. Leitura custa 0,1× a entrada; escrita de 1h custa 2×.

As medidas que levam de R$ 0,62 para R$ 0,38, e daí para R$ 0,295:

1. **Agrupar mensagens antes de responder.** O cliente manda 4 mensagens seguidas; o Otto espera e responde uma vez. Corta chamada de modelo **e** mensagem paga da Meta. É também melhor experiência.
2. **Buscar o trecho relevante da base**, em vez de despejar a base inteira no prompt.
3. ~~**Haiku nas respostas simples**, Sonnet no resto.~~ **Corrigido em 2026-09-09: escrito assim, isso encarece.** O cache é **por modelo**. Alternar Haiku e Sonnet dentro de uma conversa paga a escrita do prefixo duas vezes, e a escrita com TTL de 1h custa 2× a entrada. Numa conversa de 5 respostas: tudo Sonnet R$ 0,200; tudo Haiku R$ 0,100; **alternado R$ 0,243; começando barato e escalando no meio R$ 0,238** — 19% a 22% mais caro que não rotear nada. O que vale é decidir o modelo **antes da primeira resposta e não mudar mais**: por conversa (o classificador Haiku, que já roda na primeira mensagem, escolhe) ou por conta. Com metade das conversas no Haiku, a resposta cai para R$ 0,150. O critério do classificador é **assimétrico**: mandar conversa fácil para o Sonnet custa R$ 0,10; mandar conversa difícil para o modelo fraco custa o caráter — ele inventa preço. Portanto o alvo é **recall de "precisa do modelo forte" ≥ 98%**, não acurácia. A fatia de mensagens simples está **NÃO VERIFICADO**; o instrumento de medida já existe (`intencao` no classificador, `dados.md`).
4. **Escrever o prefixo da empresa uma vez por dia, não uma vez por conversa.** O prefixo (caráter + estilo + base + portas, ~5.100 tokens) é byte-idêntico em todas as conversas daquela empresa. Mantido quente — a leitura de cache renova o TTL sem custo, e um keep-alive com `max_tokens: 0` cobre os buracos — a escrita deixa de ser paga a cada conversa: **R$ 0,085 por crédito, sem trocar de modelo e sem risco de qualidade.** Exige prefixo determinístico: nada de data, hora ou nome do cliente antes do breakpoint, e um teste de integração que falha se a segunda requisição não vier com `cache_read_input_tokens > 0`. **A confirmar quando houver código:** o ganho pressupõe que a modelagem atual não amortizava a escrita entre conversas. Os números da conversa curta (R$ 0,27 → R$ 0,24 com cache, só 11%) indicam que não amortizava.

Nessa composição, **42% do custo já não é token: é a mensagem de serviço da Meta.** Existe um piso que otimização de prompt não fura.

### Regra de conversa longa (v1, não é gatilho)

> **Um crédito é um dia de conversa com uma pessoa, até 10 respostas do Otto. Passou disso, conta mais um.**

Entra desde o primeiro cliente. O ADR 004 tinha registrado o contrário de manhã ("nenhuma regra de conversa longa na v1, ela entra por gatilho medido"); **a conta derrubou essa decisão no mesmo dia.** Uma conta cujos clientes só mandam conversa longa com áudio custa R$ 1,88 por crédito em vez de R$ 0,38 — cinco vezes a média. Na faixa de 300 isso dava R$ 564 de custo contra R$ 297 de receita: margem de −90%. Não é hipótese exótica: basta um segmento onde todo mundo manda áudio de dois minutos.

Com a regra, o pior caso cai de R$ 1,88 para R$ 0,94 por crédito cobrado, e a média mal se mexe (R$ 0,38 → R$ 0,35), porque quase ninguém passa de 10 respostas.

**O rollover sem teto tira a rede que a maioria dos SaaS tem.** Sem acúmulo, quem usa 40% da franquia subsidia quem usa 100%. Com acúmulo, o que sobra volta depois. Portanto **o preço assume utilização de 100% da franquia**, e é assim que a tabela abaixo está calculada.

### Faixas e preço

**A linha de preço é lida pelo cargo, não pelo volume** (ADR 024). O número continua nomeando a faixa — "o de 200", "o de 500" —, mas quem abre a frase é a função contratada:

> **Otto Atendente** — R$ 197/mês, com 200 créditos

**Revisado em 2026-09-09 pelo Felipe: a entrada passa de 150 para 200 créditos**, e as outras duas faixas sobem junto para manter o desconto por volume. Motivo: 5 créditos por dia é pouco para uma empresa. O preço não mudou; o que mudou foi o custo por crédito, que caiu de R$ 0,352 para R$ 0,295 com a medida 4 abaixo.

| Faixa | ≈ por dia | Preço | R$/crédito | Custo variável | Margem |
|---|---|---|---|---|---|
| 200 créditos | 7 | **R$ 197** | 0,99 | R$ 59 | **68%** |
| 500 créditos | 17 | **R$ 447** | 0,89 | R$ 148 | **65%** |
| 1.200 créditos | 40 | **R$ 997** | 0,83 | R$ 354 | **63%** |
| acima de 1.200 | | fale com a gente | | | |

O preço por crédito cai de R$ 0,99 para R$ 0,83 conforme a faixa sobe: desconto por volume que se explica sozinho, sem adjetivo. A entrada em R$ 197 fica abaixo da âncora da Zaia (R$ 249). Com 20% de comissão de parceiro, a margem da entrada cai para 48% e ainda fecha. O fixo (App Platform + banco gerenciado, ~R$ 510/mês) continua se pagando com **4 contas de entrada**.

**A medida 4 deixou de ser otimização e virou requisito, como o cache já era.** Sem o prefixo por empresa escrito uma vez por dia, o custo volta para R$ 0,352 e as margens desta tabela caem para 64% / 61% / 58%. Nenhuma faixa fica negativa, mas a tabela deixa de ser a que o Felipe aprovou.

**O que a subida custou, e é onde ficou o risco:** a margem no pior caso (conta cujos clientes só mandam conversa longa com áudio, ~R$ 0,855 por crédito já com a medida 4) fica em **11% na entrada, 2% na faixa do meio e −5% na de cima**. Antes eram 26% / 14% / 4%. A faixa de 1.200 é a única que pode dar prejuízo, e só nesse perfil extremo. **Alternativa registrada, se o pior caso incomodar:** 1.150 em vez de 1.200 devolve a faixa de cima a 0% no pior caso, ao custo de quase apagar o desconto por volume entre a do meio e a de cima (0,89 → 0,87).

Acima de 1.200 não tem preço fechado **de propósito**: lá o desconto por volume vira prejuízo no pior caso, e ainda não há dado para dimensionar.

### O que é medição e o que é estimativa

Verificado: preço de token, tarifa da Meta, câmbio, suporte a cache na DigitalOcean. **Estimado:** tamanho do prompt, número de respostas por conversa e a fatia de 8% de conversas extremas. É exatamente o que a primeira entrega técnica do ADR 005 mede. **Antes dessa medição, não publicar preço em landing nem em anúncio.**

## A preparação (ADR 025)

Segunda linha de receita, paga uma vez, antes de o Otto entrar em operação: **R$ 997**. Decidida pelo Felipe em 2026-09-09, junto com a mudança de enquadramento do ADR 024, e pelo mesmo motivo: cargo se configura para uma operação; atendente se liga.

| | |
|---|---|
| Preço | **R$ 997**, cobrança avulsa no Asaas, fora da recorrência |
| Primeiro pagamento na entrada | **R$ 1.194** (R$ 997 + R$ 197). Nunca apresentado parcelado como se fosse mensalidade |
| Isenção | **Os 10 primeiros clientes**, que são os que medem a hora |
| Cancelou em 30 dias | Devolve a mensalidade (R$ 59 de variável), **nunca a preparação** |
| Vira crédito? | **Não.** Com o acumulado sobrevivendo à parada (pendência 5), crédito dado vira desconto que o cliente leva embora |
| Prazo | O Otto entra em operação **no mesmo dia**. A preparação é uma conversa, não um projeto |

**O que ela entrega:** a conversa com o dono sobre a operação, o Otto configurado (cargo exibido, estilo, encaminhamento, contatos fora do atendimento), a primeira rodada do "confere se acertei" do ADR 022 feita **junto com ele**, e o acompanhamento da primeira semana.

**O número foi escolhido sem saber o custo em horas, e a isenção dos 10 primeiros é o que torna isso seguro:** o primeiro cliente que paga R$ 997 é o 11º, e até lá existem 10 medições. Medir as horas de cada preparação isenta é requisito, não recomendação. Antes do 11º, o preço se confirma ou se corrige — R$ 397 é o número para o qual se volta se a hora medida for baixa.

**Em aberto:** quanto do valor vai para o parceiro com carteira que preparar o cliente (ADR 011), e se a preparação continua obrigatória depois dos 10 primeiros.

## Decisões pendentes que o modelo cria

1. ~~Teto do acumulado~~ **Decidido pelo Felipe em 2026-09-08: sem teto.** A franquia acumula sem limite. Como a assinatura é pré-paga e o custo é por uso, crédito acumulado não é dívida; é gestão de caixa: parte do que entra fica reservada no saldo pré-pago da DigitalOcean para cobrir uso futuro. O que medir: soma de créditos acumulados em todas as contas × custo médio por crédito, comparada com o saldo reservado.
2. ~~O que acontece quando o saldo zera~~ **Decidido pelo Felipe em 2026-09-09:** o empregador é avisado quando está acabando, porque existe o risco de mensagem ficar sem resposta. Fica a opção (c) que já era a recomendação: **aviso em 80% e em 100%**, e o Otto **não some do WhatsApp** quando zera — responde uma mensagem mínima e avisa a empresa. Cliente final mandando mensagem para o vazio é o pior cenário para a empresa e para a marca, e continua sendo.

   **O que isso custa, dito em número:** a mensagem mínima não gasta token, mas gasta **tarifa da Meta**, que é 42% do custo variável — cerca de **R$ 0,12 por conversa**. É prejuízo deliberado para proteger a marca, e ele não pode ser silencioso nem infinito. **A cortesia vale enquanto a assinatura estiver ativa e em dia**; assinatura vencida é outro caso, e é do fluxo de inadimplência (ADR 010), não deste.

   A jornada — onde o aviso aparece, o que ele diz, e o que o Otto responde ao cliente final com a franquia zerada — está sendo desenhada em `docs/produto/experiencia.md` (Decisão D). O canal do aviso reaproveita o que o ADR 022 abriu: o Otto já fala com o dono no WhatsApp dele.

3. ~~Recarga avulsa~~ **Decidido pelo Felipe em 2026-09-09: sim, e de propósito mais cara que a assinatura, para empurrar o upgrade de faixa.**

   **Preço: R$ 1,49 por crédito, vendido em bloco de 100 por R$ 149.** Um bloco só por compra, sem desconto por comprar vários — desconto por volume é o que a assinatura faz, e é isso que o pacote não pode imitar.

   | | R$/crédito | Margem na média (custo R$ 0,295) | Margem no pior caso (R$ 0,855) |
   |---|---|---|---|
   | Faixa de 200 | 0,99 | 68% | 11% |
   | Faixa de 1.200 | 0,83 | 63% | −5% |
   | **Pacote extra** | **1,49** | **80%** | **43%** |

   **Por que 1,49 e não outro número.** Ele tem que ser mais caro que os dois números com que compete, e é:

   - Mais caro que **qualquer faixa** (0,99 na entrada). 50% mais caro que a entrada é uma diferença que o dono enxerga sem calculadora.
   - Mais caro que o **custo marginal de subir de faixa**, que é o número que realmente decide: de 200 para 500 são +R$ 250 por +300 créditos, ou **R$ 0,83 por crédito**; de 500 para 1.200, R$ 0,79. Se o pacote custasse menos que isso, ele seria a escolha racional para sempre e a faixa de cima nunca venderia.

   **Onde o pacote ganha, e é de propósito:** quem estoura a franquia uma vez, num mês de pico, paga R$ 149 em vez de R$ 250 a mais por mês para sempre. Quem estoura duas vezes no mesmo mês já pagou mais caro que o upgrade (R$ 197 + 298 = R$ 495 contra R$ 447 pelos 500). **É aí que o produto tem que dizer isso a ele na cara, com os dois números lado a lado** — não é upsell escondido, é o Otto não enganando o empregador. Está no desenho da Decisão D.

   **Regras:** o pacote entra na mesma franquia, **acumula igual** (ADR 004, sem teto; confirmado pelo Felipe em 2026-09-09) e não tem validade própria.

   **Recarga automática não existe, e não é "fora da v1": foi recusada** pelo Felipe em 2026-09-09 — *"não vejo porque recarga automática, já que o cliente já tem a assinatura dele e isso foi um caso excepcional que o levou a comprar mais."* O argumento fecha o assunto e vale registrar: o pacote existe para o **pico isolado**. Quem precisa dele todo mês não precisa de recarga automática, precisa de outra faixa — e transformar a exceção em rotina automática esconde exatamente o sinal que deveria empurrar o upgrade. Toda compra de pacote é um toque do dono, sempre.

   **O que medir antes de fixar isso em produção:** quantas contas chegam a 80% e a 100%, e a proporção entre quem compra pacote e quem sobe de faixa. Se quase ninguém estourar, o pacote é solução sem problema e o preço nem importa; se muita gente estourar todo mês, a faixa de entrada está dimensionada errado — e aí o conserto é a franquia, não o pacote.
4. ~~Troca de faixa no meio do mês~~ **Decidido pelo Felipe em 2026-09-09: sem proração.** A faixa nova vale na hora, ele paga o valor cheio dela e recebe a franquia inteira. Nas palavras dele: *"ele paga cheio, recebe os créditos, e isso não vira problema pois o número de créditos é acumulativo."*

   **O argumento é o que sustenta a decisão, e vale escrever inteiro:** sem acúmulo, cobrar cheio no dia 20 seria predatório — o cliente pagaria R$ 447 por dez dias de capacidade que evaporaria na virada. **Com acúmulo sem teto (pendência 1), nada evapora.** Ele comprou 500 créditos que não vencem; se usar 150 até o fim do mês, os outros 350 vão para o mês seguinte. O custo da decisão é de caixa, não de valor perdido, e é essa a diferença que a tela precisa dizer.

   **Efeito colateral bom, e é o incentivo que ele pediu:** no momento da decisão, o upgrade fica mais barato por crédito que o pacote avulso — R$ 0,89 contra R$ 1,49. Quem precisa de volume sobe de faixa; o avulso fica sendo o que ele deve ser, socorro de pico isolado.

   **Consequência para a tela de comparação:** a frase que o guardião bloqueou ("sai mais barato já neste mês") continua proibida, e agora por um motivo concreto — sob esta regra, **este mês sai mais caro** (R$ 197 + R$ 447 = R$ 644). O que a tela tem que dizer é o outro lado: o que sobrar não se perde. Reescrita em `experiencia.md` §13.5.C.

5. ~~O que acontece com o acumulado quando a assinatura para~~ **Decidido pelo Felipe em 2026-09-09: se a assinatura para e ele ainda tem crédito, deixa usar.** O crédito acumulado é dele; foi pago. Descer de faixa mantém o acumulado, e parar também.

   **Isso contraria a recomendação anterior desta linha, e o motivo de eu ter recomendado o contrário fica registrado**, porque ele volta como número e não como opinião: acúmulo sem teto + troca de faixa livre + valor cheio na hora + crédito que sobrevive à parada deixam o cliente escolher a que preço por crédito ele compra. Assinar a faixa de 1.200 (R$ 997, R$ 0,83 cada), acumular, e parar é hoje um caminho aberto: uma empresa de 200 créditos por mês paga uma vez e roda seis meses.

   **O que isso custa não é margem** — 1.200 créditos custam R$ 354 contra R$ 997 de receita, margem de 64%, dentro da faixa aprovada. **É receita recorrente**, que some sem acender luz em nenhuma linha de custo. E aperta a pendência 1: a reserva de caixa passa a cobrir também o acumulado de **conta parada**, que continua consumindo custo variável sem nada entrando. A conta a acompanhar é a mesma, com um recorte a mais: acumulado de contas ativas × acumulado de contas paradas.

   **Duas coisas que esta decisão deixa para a régua de inadimplência (pendência 9), e que ela precisa responder:**
   - **Parar não é dever.** Quem cancela pagou o que tem. Quem está com fatura vencida deve. A régua diz se o inadimplente também usa o acumulado, ou se ele fica congelado até quitar — são casos diferentes e a decisão acima é sobre o primeiro.
   - **Quando o crédito de uma conta parada acaba, o Otto para de vez** — não entra na cortesia de mensagem mínima da pendência 2, que existe para cliente pagante com franquia zerada. Sem essa fronteira, uma conta cancelada custaria tarifa da Meta para sempre.

   **Consequência de texto, que destrava o que estava bloqueado:** com o crédito sobrevivendo à parada, "o que você comprou é seu" passa a ser verdade. O guardião pode levantar o bloqueio de "para sempre" — **com a ressalva da régua de inadimplência**, que ainda pode criar a exceção do vencido.

   **Gatilho de revisão:** duas ou mais contas assinando faixa acima da que vinham usando e cancelando em até 60 dias. Aí o caminho deixou de ser hipótese e vira desenho a consertar.

6. ~~**Múltiplos cargos** e a franquia~~ **Decidido pelo Felipe em 2026-09-09 (ADR 024): um saldo só para o Otto inteiro.** Uma pessoa, uma franquia. O que varia por cargo é o preço da ação em créditos, nunca o saldo. Fica aberto se o cargo novo tem mensalidade além do consumo — recomendação: sim, porque o consumo sozinho não paga as quatro salvaguardas do ADR 016, e sem mensalidade o cargo não aparece na linha do preço. Decide-se junto com o Otto Vendedor.
7. ~~Faixas de assinatura~~ **Decidido pelo Felipe em 2026-09-08: faixa não tem nome, tem número.** "300 créditos por mês", "800", "2.000", com o preço ao lado. Sem adjetivo, sem inglês, sem hierarquia, e sem encostar no nome do Otto. O apelido nasce sozinho na boca do cliente ("estou no de 800"), sem inventar nem defender. Quantas faixas e a que preço continua aberto; **o padrão de nomeação, não.**

   **Por que "Básico / Avançado / Enterprise" foi recusado**, quando o Felipe levantou a hipótese: o nome diz que o Otto da faixa de baixo é pior, e não é — todas entregam o mesmo Otto, o mesmo caráter e o mesmo cargo. Custo em três lugares: o suporte passa a responder "ele errou porque estou no Básico?"; o upgrade vira compra de robô melhor em vez de "seu movimento cresceu"; e "Enterprise" é inglês num produto em pt-BR cujo primeiro nicho é assistência técnica de bairro. O número, além de não mentir, faz o que adjetivo nenhum faz: o dono se encaixa sozinho, porque sabe quantos clientes atende por dia — a mesma razão pela qual o dia de conversa ganhou de resposta.

   **Também recusado, e é meu erro anterior:** "Otto Atendente 300". Colar o número no nome dele fica com cara de modelo de impressora e mexe no nome, que o ADR 013 travou. O número nomeia a faixa, nunca o Otto.

   **Alternativa registrada, se um dia a tabela precisar ajudar mais na compra:** a linha de encaixe embaixo do número ("300 créditos por mês — para quem recebe uns 10 clientes por dia"). É descrição de para quem serve, não posto na hierarquia. Exige que a estimativa de clientes por dia esteja certa.

6. **A franquia medida só em token não cobre o custo real, a partir de 1º de outubro de 2026.** Cada resposta paga mensagem de serviço à Meta. Decidir: (a) a franquia passa a medir "atendimento" incluindo os dois custos, (b) o custo de WhatsApp entra embutido na faixa da assinatura, ou (c) repasse separado. **Resolvido em 2026-09-08 pela escolha da métrica:** a franquia exibida é em créditos e o crédito embute os dois custos (token e tarifa da Meta), que é a opção (a) casada com a (b) — o empregador não vê duas contas. A medição interna continua em token, com a tarifa da Meta somada por resposta no cálculo de custo. Ver nota do ADR 004.
7. **Cargos que iniciam conversa** (cobrança, vendas, lembretes) pagam template da Meta, mais caro que mensagem de serviço, fora da janela de 24h. **Ganhou dono no ADR 016:** o preço se decide junto com o Otto Vendedor, e a conta precisa custear as quatro salvaguardas obrigatórias (permissão registrada, sem envio em número novo, limite próprio com aumento gradual, corte automático por taxa de bloqueio). Categorias da Meta confirmadas em 2026-09-08: marketing, utilidade e autenticação; preço em reais depois de outubro de 2026 **não verificado**, precisa vir do acesso autenticado do Felipe à Meta.
8. **Régua de inadimplência.** Pagamento vencido no Asaas: quantos dias de carência antes de avisar, quantos antes de bloquear, e o que o Otto responde ao cliente final enquanto bloqueado (mesma mensagem mínima do saldo zero). A decidir.
9. **Cláusula de repasse.** A Meta mudou o preço duas vezes em 15 meses (julho de 2025 e outubro de 2026). O contrato com o empregador não pode fixar preço sem previsão de repasse.
10. **Comissão de parceiro na margem.** Cliente trazido por parceiro paga 20% da mensalidade em comissão (ADR 011), além da taxa do Asaas e do custo variável. Ao fechar preço, a faixa de entrada precisa fechar com os três descontos. Se não fechar, a comissão cai antes do preço subir.

## Canal sem tarifa da Meta (ADR 017, resolvido no ADR 021)

~~Pendência.~~ **Decidido no ADR 021: franquia única, nunca por canal.** Canal sem tarifa da Meta custa menos por conversa — no WhatsApp a tarifa é 42% do custo variável; no Instagram e no Messenger, a conferir, ela não existe nesse formato. Uma franquia por canal quebraria o critério do ADR 004: a unidade exibida tem que ser conferível sozinho pelo empregador, sem taxa de câmbio na cabeça dele.

A proteção é medir, não segmentar. **`custo médio por crédito por canal`** entra no plano de dados junto com o primeiro canal novo. Se o mix de canais levar o custo médio acima do piso de margem, revê-se a franquia — nunca a unidade exibida.

Efeito provável, ainda não medido: o mix mexe na margem **para cima**, porque o canal novo não paga mensagem de serviço.

**Um crédito é um dia de conversa com uma identidade** (ADR 021: multicanal, não omnicanal). Quem falar no WhatsApp e no Instagram no mesmo dia gera **dois** créditos — são duas conversas, dois prefixos e duas tarifas de canal. Não fere o critério do ADR 004: o empregador vê duas conversas na caixa de entrada e a conta bate com o que ele vê. O teto de 10 respostas conta por conversa.

## Indicação e parceiros (ADR 011)

Marketing multinível foi descartado. Dois mecanismos de um nível, definidos no ADR 011:

- **Indicação entre clientes** paga em **um mês do Otto**, nunca em dinheiro. Quem entrou recebe um mês da própria franquia no primeiro pagamento; quem indicou recebe um mês da própria franquia no segundo pagamento do indicado. Até 12 indicações premiadas por conta por ano. Os créditos ganhos entram na franquia como qualquer outro e acumulam sem teto (pendência 1).
- **Parceiro com carteira** (contador, revendedor de maquininha, assistência autorizada) recebe **20% de cada mensalidade paga** pelo cliente que trouxe, enquanto ele pagar, com clawback nos primeiros 90 dias. Repasse mensal por PIX contra nota fiscal, mínimo de R$ 100.

Efeito na medição: o webhook de pagamento confirmado do Asaas passa a disparar também crédito de indicação e cálculo de comissão. Efeito na margem: ver pendência 10.

## Taxas do Asaas e o que fazer com elas

Verificado em 2026-09-08 na página de preços e no blog do Asaas. Há promoção nos 3 primeiros meses; os valores abaixo são os padrão. Reconferir no contrato.

| Meio | Taxa padrão do Asaas | Em uma assinatura de R$ 249 (âncora da Zaia) |
|---|---|---|
| PIX recebido | R$ 1,99 fixo por cobrança | 0,8% |
| Boleto | R$ 3,49 por cobrança recebida | 1,4% |
| Cartão à vista | 2,99% + R$ 0,49 | 3,2% |
| Cartão recorrente | 1,99% a 2,99% + R$ 0,49, conforme contrato | 2,2% a 3,2% |

Comparável de custo baixo: **Cora** não cobra PIX nem emissão de boleto (boleto pago por PIX custa R$ 0,50 ao pagador; por código de barras, R$ 1,70), mas exige o plano Cora Pro de R$ 44,90/mês para usar API e **não faz cartão recorrente**. Trocar Asaas por Cora significa dois provedores para ter cartão.

**Decisão prática, fluxo 1 (Otto cobrando o empregador):**
1. **PIX como forma padrão**, com PIX recorrente onde o Asaas oferecer. Taxa fixa, não percentual: quanto maior a faixa, menor o peso.
2. **Cartão como opção**, com a diferença de taxa embutida no preço da faixa, nunca exibida como sobretaxa.
3. **Boleto só sob pedido.** Mais caro e atrasa o crédito da franquia.
4. **Não otimizar isso agora.** Em 3,2% no pior caso, a taxa é menor que o custo variável de token e Meta. Rever quando houver mais de 100 contas, quando o PIX gratuito da Cora passar a valer o segundo provedor.

**Decisão prática, fluxo 2 (empresa cobrando o cliente final via Otto):**
- **O Otto não intermedia dinheiro.** Ele gera o link ou a cobrança **na conta do próprio empregador**, no provedor que ele já usa (Asaas, Mercado Pago, InfinitePay, Stone), pela porta `FonteDeCobranca`. A taxa é a que o empregador já paga hoje; o Otto não paga nada e não fica com nada.
- Isso evita virar subadquirente ou fazer split, o que seria outro negócio, com outra regulação. Se um dia fizer sentido ganhar com pagamento, é decisão nova, com ADR próprio.
- Se o empregador não tem provedor, o Otto sugere abrir conta no Asaas em nome dele, porque o adaptador já existe pelo fluxo 1.

## Como isso aparece na marca

- Site e painel falam de **créditos**, **do que o Otto fez** e **do que sobrou para o mês que vem**. Nunca token, nunca cota, nunca "consumo de API", e nunca mais hora. "Crédito" saiu da coluna *não diga* em 2026-09-09 pelo ADR 024, e entrou com travas: nunca ao lado do seu valor em reais na mesma frase, nunca como dinheiro do dono ("seu saldo", "sua carteira", "recarregar").
- Aviso de saldo é mensagem de gente: "O Otto já usou 240 dos 300 créditos deste mês. Sobram 60, uns 3 dias no ritmo desta semana." Sem barra de progresso sem número. Duas condições: "uns 3 dias" tem que sair do ritmo real dos últimos 7 dias, senão é projeção sem lastro; e a frase fica **incompleta até a pendência 2 sair** — aviso que não diz o próximo passo só produz susto. Quando o comportamento de saldo zero estiver decidido, entra uma terceira frase dizendo o que fazer.
- Na frase de posicionamento e headlines, evitar prometer preço fixo ("um cargo, um preço" foi retirado de `voz-e-tom.md`).

## O que medir desde o primeiro cliente

- Tokens por crédito e por resposta, por segmento e por preset, com mediana e p95. É isto que dimensiona a faixa e que dispara (ou não) a regra de conversa longa do ADR 004.
- Percentual da franquia usado por mês, por conta. Diz se as faixas estão certas.
- Quantas contas chegam a 80% e a 100%. Diz se o teto e a recarga importam.
- Quantas contas acumulam mais de um mês de franquia sem usar. Diz se o rollover está gerando passivo ou fidelidade.
- Origem de cada conta nova: anúncio, indicação, parceiro ou orgânico. Diz se os canais do ADR 011 valem o custo.
- Clawback por parceiro nos primeiros 90 dias. Diz se o parceiro traz o cliente certo.

## Hipóteses (declaradas)

| Afirmação | Tipo | Grau | O que a mata |
|---|---|---|---|
| Empregador entende "créditos" sem explicação, e o número que ele imagina bate com o que a gente conta | Capacidade | NÃO VERIFICADO | 2 de 5 pessoas pedirem explicação ao ver a tela de saldo, ou discordarem do que conta como um crédito |
| A palavra "crédito" não instala a leitura de que 1 crédito vale R$ 1 | Capacidade | NÃO VERIFICADO, e é a objeção formal do guardião da marca (ADR 024) | Cinco donos perguntarem quanto vale um crédito, ou pedirem a conta em reais |
| Empregador prefere franquia acumulável a franquia que zera | Preferência | INFERIDO (direção conhecida: perda percebida ao zerar; magnitude local) | Não decide nada caro: acumular é decisão de negócio já tomada |
| Unidade que o empregador confere pelo extrato (crédito) gera menos contestação de fatura que unidade opaca (token) ou familiar-mas-falsa (hora) | Ausência | NÃO VERIFICADO | Só se mede provocando: mostrar as versões de fatura a 5 empregadores e registrar perguntas |
| Consumo por conversa é estável o bastante para a ottobr.ai absorver a variância sem regra de conversa longa | Taxa | NÃO VERIFICADO | p95 de tokens por crédito acima de 4× a mediana, ou 5% das contas respondendo por 30% do custo variável (gatilho do ADR 004) |
