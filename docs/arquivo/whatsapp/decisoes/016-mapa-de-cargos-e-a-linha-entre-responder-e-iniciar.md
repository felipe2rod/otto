# 016 — Mapa de cargos e a linha entre responder e iniciar

Status: substituída por 026 (pivô para a ferramenta de design, 2026-09-26). Status anterior: aceita (mapa e linha de corte) / a validar (ordem dos dois primeiros cargos)
Data: 2026-09-08
Quem decide: Felipe

## Contexto

O ADR 001 fixou que o Otto é uma pessoa só e que o produto cresce por **cargos**, nunca por personagens novos. Faltava o mapa: quais cargos, em que ordem, e o que não é cargo.

Felipe listou em 2026-09-08 o que quer que o Otto faça além de responder no WhatsApp: capturar leads, agenda, follow-up, recuperar clientes que sumiram, enviar campanhas, criar posts, responder perguntas frequentes, identificar clientes com alta probabilidade de compra, acompanhar métricas e sugerir ações ao proprietário.

Metade da lista já está no escopo da v1 com outro nome. O resto se divide por uma linha que não é de funcionalidade: **responder × iniciar conversa**.

## A linha de corte

| | Responder | Iniciar conversa |
|---|---|---|
| Quando acontece | Dentro da janela de 24 horas aberta pelo cliente final | Fora da janela, por decisão da empresa |
| O que custa na Meta | Mensagem de serviço (cobrada desde 1º de outubro de 2026) | Template, por categoria: marketing, utilidade ou autenticação. Marketing é o mais caro |
| O que exige | Nada além do atendimento | **Permissão explícita registrada**, com o nome da empresa dito à pessoa (confirmado na documentação da Meta em 2026-09-08) |
| O que arrisca | Nada de plataforma | Denúncia do destinatário derruba a qualidade do número, o limite despenca e o número pode ser bloqueado |
| De quem é o risco | — | **Da empresa cliente.** O número é dela. Se for banido, ela perde o telefone do negócio, e a culpa terá a marca Otto |

Esta linha, e não a lista de funcionalidades, é o que organiza a expansão. Tudo que responde é barato, seguro e reforça o que o Otto já é. Tudo que inicia exige desenho de permissão, preço e salvaguarda antes de existir.

## O mapa

### Já é a v1, com outro nome

| Item da lista | Onde já está |
|---|---|
| Responde perguntas frequentes | É o cargo Atendente (`visao.md`) |
| Captura leads | "Coleta o que a empresa precisa para atender, sem interrogatório" (`visao.md`) |
| Acompanha métricas | Resumo do dia (`visao.md`, `experiencia.md`) |
| Sugere ações ao proprietário | Extensão do resumo do dia. Não é cargo novo |
| Agenda | Google Calendar, camada 1 do ADR 006. Leitura na v1; escrita com confirmação |

**Duas linhas novas no resumo do dia, quase de graça, que cobrem parte do que Felipe pediu:**

1. **Quem tem chance de comprar não precisa de modelo nem de volume de dados.** É regra sobre o que já existe: "3 pessoas perguntaram preço esta semana e não voltaram". Cabe no resumo hoje e entrega quase todo o valor do item "identifica clientes com alta probabilidade de compra".
2. **Sobre o que postar** é subproduto do que o Otto já sabe: o `assunto` que o classificador grava em cada conversa. "Esta semana 7 pessoas perguntaram se vocês consertam tela de iPhone" é uma linha de resumo, não um produto. A parte cara de "criar posts" é a arte, e essa não é a briga do Otto.

### Próximos cargos

| Cargo | O que faz | Depende de |
|---|---|---|
| **Otto Vendedor** | Identifica quem tem chance de comprar e recupera cliente que sumiu | A parte de identificar não inicia conversa e pode vir antes. A parte de recuperar inicia, e exige a trava de permissão abaixo |
| **Otto Agenda** | Confirma, remarca e lembra | Escrita no Google Calendar (ADR 006) e mensagem de **utilidade**, mais barata que marketing |

**Ordem recomendada: Vendedor, depois Agenda.** Motivo: o dono paga mais por receita que não entrou do que por custo evitado, e "recuperar cliente que sumiu" liga a receita perdida. Agenda é o mais defensável contra a Meta, porque ataca a fraqueza documentada dela e usa a categoria de mensagem mais barata. A ordem é **a validar**: decide-se com a pergunta de campo abaixo, não com opinião.

### Cedo demais

**Follow-up genérico.** Mesma dependência de template da recuperação, sem preço nem permissão desenhados, e sem evidência de que o dono queira. Entra dentro do Otto Vendedor quando ele existir, não como cargo próprio.

### Não faça como está

| Item | Por quê | O que sobra dele |
|---|---|---|
| **Enviar campanhas** | Disparo em massa é o modelo que bane número. O risco cai sobre a empresa cliente, que perde o WhatsApp do negócio. É o oposto da defesa do Otto, numa categoria cuja reclamação nº 1 é abandono | Mensagem para **uma pessoa por vez, com motivo**, dentro do Otto Vendedor. Isso não é campanha |
| **Criar posts** | Outro canal, fora do domínio da conversa. Concorre com Canva, não com a Meta. Dilui o foco | A linha de "sobre o que postar" no resumo do dia, acima |

## Salvaguardas obrigatórias para qualquer cargo que inicie conversa

Nenhum cargo que inicia conversa entra em produção sem as quatro. Elas são requisito, não recomendação.

1. **Permissão registrada antes do primeiro envio**, com data, canal e o texto exato mostrado à pessoa. Auditável por conta.
2. **Nada de envio em número recém-conectado.** Exigir volume mínimo de tráfego de resposta antes de liberar.
3. **Limite próprio por conta, abaixo do limite da Meta, com aumento gradual**, acompanhando a taxa de bloqueio e denúncia pelo webhook de status.
4. **Corte automático:** taxa de bloqueio acima do limiar suspende novos envios da conta e avisa o empregador, antes de a Meta rebaixar a qualidade.

## Consequências

- **`visao.md`** ganha o mapa como seção de futuro, deixando claro que a v1 não muda.
- **`cobranca.md`**, pendência 7, deixa de ser "não é problema da v1" e passa a ter dono: preço de cargo que inicia conversa é decidido junto com o Otto Vendedor, com as quatro salvaguardas custeadas.
- **Dados.** A pergunta de campo abaixo entra no registro da fase 0. O item "quem tem chance de comprar" vira uma regra sobre eventos que já existem, sem evento novo.
- **Marca.** "Campanha", "disparo", "broadcast" e "automação de marketing" não entram no vocabulário do Otto. O guardião bloqueia.
- **Backend.** Iniciar conversa é um caminho novo, com permissão, limite e corte. Não é o webhook de resposta com um `if`.

## Evidência comportamental (fichas)

| Afirmação | Tipo | Grau | O que a mata |
|---|---|---|---|
| Recuperar cliente que sumiu é dor maior que atender mais rápido | Preferência | NÃO VERIFICADO | Nas 10 conversas de campo, menos de 5 donos citarem um episódio datado de cliente que sumiu e não foi buscado |
| Dono de negócio pequeno quer disparar campanha e não sabe do risco de banimento | Capacidade | INFERIDO (a categoria vende disparo, logo há demanda; o risco é técnico e invisível) | Donos citarem espontaneamente medo de bloqueio do número |
| A linha de "sobre o que postar" no resumo satisfaz o pedido de "criar posts" | Preferência | NÃO VERIFICADO | Contas pedirem a arte pronta depois de ver a linha no resumo |

## Gatilho de revisão

- **Ordem dos cargos** decide-se com a pergunta de campo: "me conta a última vez que um cliente sumiu e você não foi atrás". Cinco ou mais episódios datados nas 10 conversas põem o Vendedor na frente. Menos que isso, Agenda vem primeiro.
- **Follow-up** vira cargo próprio só se 5 contas pedirem depois do Vendedor existir.
- **Campanha** volta à mesa apenas com as quatro salvaguardas construídas e com preço de template fechado, e mesmo assim como envio um a um com motivo, nunca em massa.
- **Criar posts** volta se 5 contas pedirem a arte depois de terem a linha do resumo.
- Revisar todo o mapa se a Meta mudar a regra de template, de permissão ou de qualidade de forma que afete a linha de corte.

## Nota de 2026-09-09 — falar com o empregador não é a mesma classe de risco

Decidido pelo Felipe, ao autorizar o Otto a mandar uma mensagem por dia no WhatsApp do dono perguntando o que não soube responder (ADR 022): **o Otto pode falar com o empregador por iniciativa própria.** Fica registrado aqui para o precedente não ficar solto e para o próximo cargo não alegar exceção parecida.

**As quatro salvaguardas deste ADR existem para conversa iniciada com o cliente final**, e o motivo delas é específico: template pago, permissão que a empresa não deu, e risco de banimento que cai sobre o número da empresa cliente — não sobre nós.

Falar com o empregador é outra coisa em todos os pontos que importam:

| | Cliente final | Empregador |
|---|---|---|
| Quem recebe | Pessoa que não contratou nada e não sabe que o Otto existe | Quem contratou o Otto e paga a conta |
| Permissão | Precisa ser registrada, e é o que a salvaguarda 1 exige | Está no termo de contratação, e é ligada por padrão com desligamento em um toque |
| Risco de bloqueio | Alto, e o número queimado é o da empresa cliente | Ele desliga a mensagem em vez de denunciar. O corte por silêncio já existe |
| Custo | Template pago por disparo | Quase sempre dentro da janela de serviço, porque ele responde |

**Quais salvaguardas continuam valendo, com forma própria:** a 1 (permissão) vira o desligamento de um toque dentro da própria mensagem; a 3 (limite com aumento gradual) já está satisfeita pelo teto de uma por dia com fila de prioridade; a 4 (corte automático) vira o corte por silêncio — três dias sem resposta pausa por sete, reincidiu para de vez. **A 2 (não enviar em número novo) não se aplica**: o destinatário é sempre o mesmo número, o do dono.

**A linha, dita para valer nos próximos cargos:** o que este ADR protege é a **caixa de entrada de quem não pediu nada**. Mensagem para quem assinou o contrato não atravessa essa linha. Todo cargo novo que quiser iniciar conversa continua respondendo às quatro perguntas — e se o destinatário for o cliente final, nenhuma delas é dispensada por este precedente.
