# 025 — Preparação paga antes de o Otto entrar

Status: substituída por 026 (pivô para a ferramenta de design, 2026-09-26). Status anterior: aceita (existe, preço e regras) / a validar (o preço de R$ 997 contra a hora medida)
Data: 2026-09-09
Quem decide: Felipe

## Contexto

Até hoje o produto tinha um preço só: a mensalidade. A ativação era self-service por desenho — o ADR 022 decidiu que a empresa ensina o Otto **conferindo**, não escrevendo, e que ele chega com as respostas prontas da base do nicho para o dono confirmar com um toque.

O Felipe decidiu em 2026-09-09 que existe também um valor pago uma vez, com uma pessoa nossa conversando com o cliente e configurando o Otto para a operação dele. Nas palavras dele: *"vamos ter que ter um valor de setup, onde iremos falar com o cliente e configurar o Otto para trabalhar especificamente na operação dele"*.

A decisão vem junto com a mudança de enquadramento do ADR 024 (o produto é um funcionário com cargos, não um atendente), e as duas se sustentam pelo mesmo motivo: **cargo se configura para uma operação; atendente se liga**. Um Otto Financeiro que avisa de conta em aberto não se ativa sozinho num formulário.

Três fatos que pesam na decisão:

1. **Não sabemos quanto trabalho dá.** Foi o motivo declarado do Felipe ao escolher o número mais alto da mesa. Nenhum cliente foi preparado ainda; a estimativa de 2 a 3 horas é chute.
2. **A categoria que cobra implantação no Brasil tem má fama por prazo, não por preço.** Blip, Zenvia e Huggy cobram implantação e aparecem na pesquisa com "implantação relatada em 45 dias ou mais" (`docs/mercado/pesquisa-2026-09.md`, linha 81). O risco de imitar esse grupo é de prazo.
3. **O concorrente principal é grátis de instalar.** O Business Agent nativo da Meta não cobra nada para ligar. Contra ele, o valor pago é o que ele não tem: alguém sentando com o dono. A pesquisa registra que a reclamação nº 1 da categoria inteira é suporte.

## Opções consideradas

| Opção | O que é | Por que não |
|---|---|---|
| Sem preparação, self-service puro | O que o ADR 022 assumia | Deixa a hipótese mais frágil do projeto (o dono confere sozinho) sem rede nos primeiros clientes, e entrega o único diferencial que a Meta não copia — gente — de graça |
| R$ 297 | Cobre a hora com pouca folga | Perto demais de "uma taxa". Não filtra curioso e não move parceiro nenhum |
| R$ 397 | Recomendação do estrategista de mercado: dois meses da faixa de entrada | Descartada pelo Felipe **por desconhecimento do custo**, não por posicionamento. Fica registrada como o número para o qual se volta se a hora medida for baixa |
| **R$ 997** | Cinco meses da faixa de entrada | **Escolhida** |
| Embutir na anuidade | Preparação "grátis" com 12 meses pagos à vista | Esconde o preço da hora humana e prende o cliente antes de ele saber se o Otto serve. Contraria a postura do produto de não usar amarração |

## Decisão

**Existe um valor pago uma vez, antes de o Otto entrar em operação, de R$ 997.**

**O nome público é "preparação"**, recomendado pelo guardião da marca em 2026-09-09 e **aguardando confirmação do Felipe**. A objeção que eu mesmo tinha levantado ("Otto preparado" insinua que existe Otto despreparado) se resolve com uma proibição de adjetivo, sem custar o nome: *preparação* nomeia **o nosso trabalho**, não um estado do Otto, e "Otto preparado" e "Otto despreparado" ficaram proibidos em `identidade.md`, pela mesma razão de "Otto treinado".

**As duas alternativas do especialista de UI/UX foram descartadas, e uma delas por um motivo que ninguém tinha visto:** "a conversa de entrada" colide com o vocabulário de cobrança, onde **entrada é a primeira parcela**. Um valor pago uma vez, antes das mensalidades, chamado "de entrada", é lido como sinal — como se os R$ 997 fossem adiantamento do que ele já vai pagar todo mês. Nome fraco se conserta com contexto; nome que promete desconto inexistente vira a primeira decepção da conta, no mesmo lugar em que o ADR 004 mede contestação. "A nossa conversa" descreve só o primeiro dos quatro itens e some ao lado de "Otto Atendente — R$ 197/mês". Segunda opção registrada, se o Felipe recusar "preparação": **"a chegada do Otto"**.

**Nenhum nome carrega R$ 997 sozinho** — o que sustenta o preço é o conteúdo, e por isso a venda diz o conteúdo inteiro e a fatura é curta:

> **Preparação — R$ 997, uma vez**
> Uma conversa com a gente sobre como sua empresa trabalha, o Otto configurado com você, a primeira conferida feita junto e a primeira semana acompanhada. O Otto começa a atender no mesmo dia.
>
> **Otto Atendente — R$ 197/mês, com 200 créditos**
>
> Primeiro pagamento: R$ 1.194 (R$ 997 da preparação + R$ 197 do primeiro mês). Depois, R$ 197 por mês.

Na fatura, duas linhas — `Preparação — R$ 997` e `Otto Atendente — R$ 197` —, nunca somadas numa só e nunca parceladas.

### O que ele entrega, e é isso que o separa de uma taxa

1. Uma conversa com o dono sobre a operação dele: o que ele vende, o que ele não faz, o que não pode ser prometido, quem assume quando o Otto passa a bola.
2. O Otto configurado para essa operação: cargo exibido, estilo de atendimento (ADR 002), regra de encaminhamento (ADR 012), contatos fora do atendimento (ADR 015).
3. A primeira rodada do "confere se acertei" do ADR 022 feita **junto com o dono**, e não deixada para ele.
4. Acompanhamento da primeira semana, com as respostas que faltaram entrando no que o Otto sabe.

### Regras decididas

| Regra | Decisão | Motivo |
|---|---|---|
| **Isenta nos 10 primeiros clientes** | Sim | São eles que medem a hora. Ver "o que isso obriga", abaixo |
| **Cancelou em 30 dias** | Devolve a mensalidade, nunca a preparação | A mensalidade custa R$ 59 de variável; a hora foi gasta de verdade |
| **Vira crédito na franquia?** | Não | A preparação não vira créditos (ADR 024). Com o acumulado sobrevivendo ao cancelamento (ADR 004, pendência 5), crédito dado vira desconto que o cliente leva embora |
| **Entra no prêmio de indicação?** | Não | O ADR 011 paga em um mês da própria franquia. A preparação não é franquia e não é dinheiro |
| **Cobrança** | Avulsa no Asaas, separada da assinatura (ADR 010) | Não entra na recorrência. O webhook que credita franquia não é o mesmo evento |
| **Prazo** | O Otto entra em operação **no mesmo dia**; a preparação é uma conversa, não um projeto | É a diferença inteira contra o grupo dos 45 dias. Prazo dito, sempre |

### O que a decisão obriga, e é a parte que não pode ser esquecida

O número foi escolhido sem saber o custo. A isenção dos 10 primeiros é o que torna isso seguro: **o primeiro cliente que paga R$ 997 é o 11º**, e até lá existem 10 medições.

**Nas 10 preparações isentas, quem toca na tela é o dono.** Requisito levantado pelo especialista de UI/UX em 2026-09-09 (`experiencia.md` §15.5), e é o mais fácil de perder de vista: essas 10 contas são as únicas em que a hipótese central do ADR 022 — *o dono confere sozinho o que o Otto entendeu* — ainda poderia ser observada. Se a nossa pessoa segurar o celular e fizer por ele, a ativação sai perfeita e a medição sai vazia: teremos provado que **nós** sabemos configurar o Otto, que não é a pergunta. A conta fica marcada (`conta.ativada.com_preparacao`) para que nenhuma métrica de ativação misture as duas populações.

Fica como requisito, não recomendação: **medir e registrar as horas de cada uma das 10 preparações isentas** — tempo de conversa, tempo de configuração, tempo de acompanhamento da primeira semana, e quantas respostas o dono corrigiu depois. Antes do 11º cliente, o preço é reconfirmado ou corrigido com esse dado na mão.

### O que fica em aberto

- **Quanto do valor vai para o parceiro com carteira (ADR 011).** O estrategista recomendou 100% quando o número na mesa era R$ 397, com o argumento de que R$ 39/mês não move um contador mas R$ 397 na hora move — e de que isso terceiriza a hora humana, que é o gargalo. **O Felipe não marcou essa regra**, e com R$ 997 o argumento muda de tamanho: é dinheiro demais para entregar inteiro antes de saber quanto custa a hora. Decide-se com a mesma medição das 10 preparações.
- **Se a preparação continua obrigatória depois dos 10 primeiros**, ou se vira opcional para quem quer ligar sozinho.
- **A confirmação do nome pelo Felipe.** O guardião recomendou "preparação"; a segunda opção é "a chegada do Otto".

## Consequências

- **`docs/produto/cobranca.md`** ganha a preparação como segunda linha de receita, com o que ela entrega e a regra de reembolso. A tabela de faixas não muda.
- **Primeiro pagamento** passa a ser R$ 1.194 na faixa de entrada (R$ 997 + R$ 197). É o número que aparece na venda, e não pode aparecer parcelado como se fosse mensalidade.
- **Marca.** "Setup", "taxa de setup", "onboarding" e "implantação" precisam de parecer. "Implantação" é a palavra do grupo dos 45 dias e carrega o prazo junto; "preparação" tem a objeção de que "Otto preparado" insinua que existe Otto despreparado — a mesma mentira que o ADR 004 proíbe nos nomes de faixa e o vocabulário proíbe em "Otto treinado".
- **ADR 022 não muda.** O Otto continua atendendo antes de aprender, no dia 1. A preparação não é pré-requisito para ele entrar; é o que faz a primeira semana dele ser boa.
- **Aquisição.** O anúncio do experimento 001 não pode omitir o valor da preparação. Preço escondido até a ligação é o roteiro de venda que a categoria já usa, e é o que a pesquisa registra como "venda consultiva" na coluna de fraquezas.
- **Dados.** Evento novo de preparação (agendada, feita, isenta), com as horas registradas. Especificação com o analista de produto.

## Evidência comportamental (fichas)

| Afirmação | Tipo | Grau | O que a mata |
|---|---|---|---|
| Dono de empresa pequena paga R$ 997 uma vez para alguém configurar o Otto na operação dele | Preferência | **NÃO VERIFICADO** | 3 dos 10 donos de campo dizerem que só assinariam sozinhos, sem conversa |
| A preparação com gente é o que a Meta não consegue copiar | Capacidade (do concorrente) | INFERIDO (a Meta atende mais de 1 milhão de contas com produto self-service; não há sinal de operação consultiva) | A Meta lançar configuração assistida por parceiro no Brasil |
| Preparar um Otto leva de 2 a 3 horas | Taxa | **NÃO VERIFICADO** — é chute declarado | A medição das 10 primeiras. Acima de 5 horas, R$ 997 vira preço de custo |
| Cobrar antes de entrar filtra curioso sem matar a venda | Taxa | NÃO VERIFICADO | Taxa de fechamento cair abaixo da metade da que os 10 isentos tiveram |

## Gatilho de revisão

- **Antes do 11º cliente**, com as 10 medições na mão: confirma R$ 997, corrige para R$ 397 (o número do estrategista) ou sobe. Não é opcional — é o gatilho principal deste ADR.
- **Três donos seguidos recusarem a proposta citando o valor de entrada** (o de R$ 1.194, não a mensalidade): a preparação vira opcional, ou o valor cai.
- **Duas contas cancelarem em 30 dias e pedirem a preparação de volta**: a regra de reembolso volta à mesa.
- **A hora medida passar de 5 horas em 3 das 10 preparações**: o desenho da preparação está errado, não o preço. O conserto é o que a base de nicho (`packages/bases-de-nicho/`) já devia estar fazendo sozinha.
- **Um parceiro com carteira preparar um cliente**: aí a divisão do valor deixa de ser hipótese e precisa estar decidida antes.
