# Revisão do Otto pela estratégia do oceano azul

Feita em 2026-09-09, a pedido do Felipe: *"quero vender uma solução que torne meus concorrentes pouco relevantes"*.

**Status: parecer. Nada aqui está decidido.** O que for aceito vira ADR novo ou emenda a ADR existente; a lista está na §11.

**Aviso de método.** Oceano azul é uma lente, não uma evidência. Ela é boa para achar o eixo em que ninguém joga; **não** prova que existe demanda naquele eixo. Toda afirmação sobre comportamento segue `behavioral-evidence` e está marcada. A prova é campo, e o campo ainda não foi feito.

**Este documento foi reescrito duas vezes durante a própria conversa.** A primeira versão procurava oceano azul dentro da categoria atendimento; o Felipe apontou que isso aceita a fronteira errada. A segunda apoiava a tese numa premissa sobre a Meta que a pesquisa derrubou. O que caiu está na §9, não apagado — inclusive os erros meus.

---

## 1. O diagnóstico: a fronteira da categoria é a caixa de entrada

O `visao.md` diz, corretamente, que o Otto não ganha em distribuição, preço de inferência nem em "tem IA". O erro está no que vem depois. O espaço listado hoje é:

> memória da relação, caixa de entrada com dono, encaminhamento que não esfria, integração com o negócio, suporte melhor.

**Isso é nota mais alta nos mesmos fatores em que a categoria já joga**, e é a lista óbvia de lacunas da Meta — que a Meta lê também. O próprio quadro de riscos admite: *"A Meta melhorar o Business Agent e fechar o buraco — severidade Alta"*.

Mas há uma camada abaixo dessa, e é a que importa.

**Meta, Blip, Zenvia, Zaia, Anota e BotConversa são arquitetonicamente o mesmo produto: mensagem entra, mensagem sai.** A unidade de valor de todos eles é **a resposta**. Por isso a briga inteira da categoria é responder mais rápido, mais barato e em mais canais.

Um funcionário de verdade numa assistência técnica de bairro passa metade do dia fazendo coisa que não é responder: não deixar o orçamento de terça cair, lembrar o dono do que ele prometeu, avisar que a peça chegou, preparar o dia, notar que três pessoas perguntaram um preço que não está na tabela.

**A unidade de valor de um funcionário é o trabalho feito, não a resposta dada.** Enquanto o Otto for medido, vendido e desenhado pela resposta, ele é um concorrente melhor dentro do quadro dos outros. É o que o ADR 001 já dizia sem tirar a consequência: o produto cresce por cargos, e cargo é escopo de trabalho, não canal.

---

## 2. O reenquadramento: o lado empregador do Otto

O trabalho não-atendimento de um funcionário é quase todo **dirigido ao dono, não ao cliente final**. E o ADR 016, na nota de 2026-09-09, já tinha estabelecido o que isso significa:

> *"O que este ADR protege é a caixa de entrada de quem não pediu nada. Mensagem para quem assinou o contrato não atravessa essa linha."*

Sem template pago, sem risco de banimento, permissão no termo de contratação, desligamento em um toque. **O território mais diferenciado do produto é também o mais barato e o mais seguro de construir** — o que é raro o bastante para desconfiar, e por isso foi verificado (§9).

O ADR 016 chegou nesse território e o classificou como *"duas linhas novas no resumo do dia, quase de graça"*. Tratou como detalhe de funcionalidade o que é a diferenciação inteira.

### O que é defensável, e o que não é

**Não é defensável: falar com o dono.** A Meta anunciou em junho de 2026, no próprio lançamento do Business Agent, um **resumo matinal** ao dono sobre as conversas perdidas durante a noite, em beta, com gestão de agenda e inteligência de mercado no roadmap. O lado do dono não é território abandonado: é roadmap declarado do dono do canal. **Trate como janela de 12 a 18 meses (hipótese), nunca como fosso.**

**É defensável: o estado fora da conversa.** O resumo da Meta é **descritivo** — o que aconteceu ontem. Um funcionário é **responsável** — *"você disse ao Sr. Marcos que ligava hoje"*. A diferença não é qualidade de texto: é memória de compromisso, mais o que vence, o que ficou pendente e o que o sistema do negócio diz. Isso vive fora da caixa de entrada, e é exatamente a fraqueza documentada da Meta.

**A linha que organiza tudo daqui para a frente:**

| | A categoria | O Otto |
|---|---|---|
| Unidade de valor | a resposta | o trabalho feito |
| Gatilho | mensagem que chega | compromisso que existe |
| Onde mora o estado | na conversa | fora dela |
| Para quem trabalha | para quem escreveu | para quem contratou |

### As duas objeções sérias

Nenhuma mata o reenquadramento. As duas mudam como ele entra.

**1. O proativo depende do recurso mais escasso do ICP: a atenção do dono.** O atendimento entrega valor esteja ele olhando ou não. O proativo só existe se ele ler — e o dono de assistência técnica está com a mão dentro de um celular. Se ele silenciar o Otto, o valor evapora e você nem consegue medir. **Um falso positivo por dia mata o canal em uma semana.** Consequência de desenho: detecção por regra determinística, nunca por adivinhação; teto de uma mensagem por dia fora de urgência, que já é a regra do ADR 022.

**2. É ótima retenção e péssima aquisição.** Ninguém acorda procurando "um funcionário que cuida"; procura "meu WhatsApp não para". Mover a **venda** para o proativo aumenta o CAC no mesmo mercado.

**A síntese das duas:** vende-se pelo atendimento, prende-se pelo resto. Isso desarma a objeção de que a v1 é o produto de oceano vermelho — a v1 pode ser vermelha na promessa e azul na retenção, **desde que o proativo chegue na semana 1, e não na v1.1.** Essa é a única condição, e ela é dura.

### O menor trabalho que prova a tese

**"O cliente está esperando você desde terça."**

Sai direto da situação *Esperando você* do ADR 015 — que o Otto atribuiu porque ele mesmo passou a conversa. Zero inferência, zero extração, zero falso positivo. E mede **o dono errando, não o Otto adivinhando**, que é o lado certo do risco da objeção 1.

O candidato anterior — *"o orçamento de terça não teve resposta"* — exige o Otto saber que aquilo era um orçamento, ou seja, extração de conversa, a hipótese mais frágil do projeto. Vira v1.1, depois que a precisão da extração for medida.

**Regra de preço para todo trabalho não-atendimento:** ele sai na tela com um número em reais ao lado, ou não é vendável. O comparável é o inverso do que se imagina — recuperação de carrinho e follow-up de lead se vendem há anos porque o valor vem denominado em venda atribuída. *"Resumo do dia"* é a funcionalidade que todo mundo elogia e ninguém renova. Grau: **NÃO VERIFICADO** até as 10 conversas.

---

## 3. A cunha: entrar sem largar o aplicativo

Serve ao reenquadramento, não o substitui: é o que torna a entrada barata **e** o que dá ao Otto o estado inicial para trabalhar.

O que trava o dono hoje não é preço nem ceticismo com IA. É que entrar na API oficial significava **abandonar o aplicativo do WhatsApp Business** — a tela que ele abre cinquenta vezes por dia. Toda a categoria vende essa migração e trata a dor dela como custo inevitável do cliente.

Deixou de ser. Verificado em 2026-09-09 na documentação da Meta:

| Fato | Verificado |
|---|---|
| App e API no mesmo número, simultâneos | Sim |
| Webhook `history` com conversas **anteriores** à conexão | Sim — até **180 dias**, em três blocos |
| Exige consentimento explícito do dono | Sim (sem ele, erro 2593109) |
| Exclusões | Grupos não vêm; mídia só tem id nos 14 dias anteriores |
| Disponível no Brasil | Sim — global desde novembro de 2025 |
| Pré-requisitos | Tech Provider ou Solution Partner, Embedded Signup com session logging, app do dono 2.24.17+ |

Três consequências:

1. **Some o custo de troca para entrar.** "Conecta e continua tudo como está", em vez de "migre seu atendimento".
2. **O Otto chega sabendo.** O ADR 022 chamou isso de a hipótese mais frágil do projeto; os 180 dias são o insumo que faltava.
3. **A retenção deixa de ser atrito e vira memória** — a única forma compatível com "sair é fácil".

**Isto corrige um erro de fato em três documentos do repositório.** Ver §11.

**Ação de amanhã: testar no próprio número do Felipe.** Decide o onboarding, o ADR 012 item 5 e a ativação do ADR 022 de uma vez.

---

## 4. O quadro estratégico

| Fator de competição | Meta | Self-service (C/D) | Enterprise (B) | **Otto proposto** |
|---|---|---|---|---|
| Preço baixo de entrada | Alto | Alto | Baixo | Médio |
| Estar onde o dono já está | Alto | Baixo | Baixo | Baixo |
| Construtor de fluxo / automações | Médio | **Alto** | **Alto** | **Nenhum, e dito em voz alta** |
| Nº de integrações | Baixo | Médio | **Alto** | **Baixo** |
| Nº de canais | Alto | Médio | **Alto** | **Baixo** |
| Envio em massa | Baixo | **Alto** | **Alto** | **Nenhum** |
| Painel e relatórios | Baixo | Alto | Alto | Baixo |
| "Tem IA" / modelo esperto | Alto | Alto | Médio | Médio |
| Suporte a quem paga | Baixo | **Baixo** | Baixo | **Altíssimo** |
| Previsibilidade | Baixo | **Baixo** | Médio | **Altíssimo** |
| Honestidade com o cliente final | Baixo | Baixo | Baixo | **Altíssimo** |
| Entrar sem largar o app | n/a | Baixo | **Nenhum** | **Criar** |
| Chegar já sabendo o histórico | **Nenhum** | **Nenhum** | **Nenhum** | **Criar** |
| Resumo ao dono | **beta anunciado** | Nenhum | ao atendente | Alto (não é fosso) |
| **Memória de compromisso** | **Nenhum** | **Nenhum** | **Nenhum** | **Criar — é o fosso** |
| **Trabalho fora da conversa** | **Nenhum** | **Nenhum** | **Nenhum** | **Criar** |
| Sair sem atrito | Médio | **Nenhum** | **Nenhum** | **Criar** |

Onde a categoria é alta, o Otto é baixo. Divergência é o teste do oceano azul. Um Otto alto em tudo seria um Blip mais barato — e Blip mais barato é o cemitério dessa categoria.

---

## 5. As quatro ações

### Eliminar

| O quê | Por quê |
|---|---|
| **Construtor de fluxo, "monte seu bot"** | Produto central do grupo C. Já não existe no Otto (ADR 002); passa de omissão a posição declarada — **não tem nada para montar** |
| **Envio em massa** | Já fora (ADR 016). Muda o motivo: é a causa documentada de banimento, e perder o WhatsApp é perder o negócio |
| **Migração como etapa de entrada** | §3 |
| **Comparativo de funcionalidades com concorrente** | Convida o comprador a jogar no quadro deles, onde o Otto perde por construção |

### Reduzir

Número de canais (§7). Painel e relatório — o dono de assistência técnica não abre painel; o canal de saída do Otto é o WhatsApp dele. Superfície de configuração.

### Elevar

Honestidade e passar para pessoa — único fator da categoria cuja demanda está **subindo** (63%, contra 54% em 2025). Suporte a quem paga — reclamação nº 1 da categoria; é caro e não escala, e é por isso que funciona como defesa. Previsibilidade — o oposto é a norma do mercado.

### Criar — responsabilidade, pelo instrumento barato

O eixo: todo concorrente opera em "**você configurou, o erro é seu**". É o que permite suporte barato e é a raiz da reclamação nº 1.

**O instrumento não deve ser garantia contratual com indenização em dinheiro.** Micro-empresa contratante tende a ser tratada como consumidora, o que pode anular teto de indenização como cláusula abusiva (CDC art. 51), e o juizado torna processar barato. *(Direção, não jurisprudência conferida — o agente jurídico tem gatilho antes do primeiro cliente pagante.)* Pior que o risco jurídico: garantia em dinheiro cria seleção adversa e um processo de sinistro que um fundador sozinho não opera.

Três instrumentos que compram o **mesmo sinal** por quase nada:

1. **Cancelamento em um clique, sem retenção, sem ligação.** Queixa nº 2 da categoria. Blip e Zenvia não copiam porque o atrito de saída é receita deles — contraposicionamento de verdade.
2. **SLA de suporte com crédito automático em atendimentos.** Paga em moeda própria, que custa R$ 0,295, não em caixa.
3. **Promessa pública de não mudar preço nem remover função sem aviso.** Exposição zero, e é o oposto exato do que a Zaia fez.

O que **não** entra ainda: "o dono leva o que o Otto aprendeu" — bloqueado pelo guardião, porque não existe decisão nem desenho de exportação em lugar nenhum do repositório. O que já tem lastro: **o que ele já pagou continua dele, mesmo se parar.**

---

## 6. A conta do trabalho proativo

O reenquadramento tem consequência de caixa, e ela não estava calculada em lugar nenhum: **trabalho proativo queima inferência sem atendimento associado.** A franquia do ADR 004 mede atendimentos e não orça nada disso.

Estimativa grosseira, mesma base do `cobranca.md`:

| Item | Custo por conta/mês |
|---|---|
| Briefing diário (~3,5k tokens de entrada com prefixo em cache + 400 de saída) | R$ 1,70 |
| ~30 mensagens ao WhatsApp do dono (template de utilidade) | R$ 1,20 |
| Varredura de pendências por consulta ao banco | R$ 0 |
| **Total** | **~R$ 3** |

Contra R$ 59 de custo variável na faixa de 200, a margem cai de 68% para ~66%. **Irrelevante — se o proativo for determinístico.**

**O cenário que quebra:** se o proativo virar releitura de todas as conversas por LLM três vezes ao dia, com ferramentas, vira 10 a 20× isso — R$ 30 a R$ 60 por conta/mês, um terço da margem da entrada.

**A saída:** embutir na faixa (medir separado quebraria o critério do ADR 004 — duas moedas na cabeça do dono) **com teto interno duro**. O proativo detecta por **regra determinística**; o LLM só redige o texto. Teto de tokens **e** de mensagens, porque o recurso caro é a atenção do dono, não o token.

*O preço do template de utilidade em reais pós-outubro é a pendência 7 do `cobranca.md` e continua **não verificado**.*

---

## 7. O que matar em nome do foco

| Matar | Por quê |
|---|---|
| **Instagram e Messenger na v1.1** | O ADR 021 admite: *"entram por custo marginal e paridade, sem gatilho de demanda"*. Com o reenquadramento fica pior — mais canais é mais caixa de entrada, é aprofundar no vermelho. A porta do ADR 017 continua certa; sai a data |
| **A faixa de 1.200** | Única com margem negativa no pior caso (−5%), abre a arbitragem da pendência 5, e conta grande pede integração, SLA e equipe: terreno da Blip com a estrutura de custo da Blip |
| **Experimento 001** | A `pesquisa-2026-09.md` §11 já concluiu que o canal hoje é relação e comunidade, não anúncio |

**O Otto Financeiro sai da lista de execução.** Matar cargos é matar a tese — cargo é o plural do produto (ADR 001), e o reenquadramento diz que o escopo de trabalho é onde mora a diferenciação. O que muda é a **ordem**: o próximo passo não é cargo novo, é o **lado empregador do cargo que já existe**. O ADR 018 continua em terceiro, e a exceção precisa estar escrita: o Otto nunca fala com quem **não é cliente da empresa**.

**Cuidado com o pilar de proteção na copy.** "O Otto nunca dispara" tem três defeitos: mata o Otto Agenda antes de nascer (7 dos 9 nichos giram em torno de agenda, e lembrete é template); **é falsa**, porque o Otto manda mensagem para o dono todo dia; e "disparo" é palavra **bloqueada em texto público** pelo ADR 016 — negar a palavra ensina a palavra. A regra que sobrevive a todos os cargos: **o Otto só responde; ele não manda mensagem para quem não escreveu para a empresa primeiro.**

---

## 8. Sequência recomendada

1. **Testar a coexistência** no número do Felipe. Dias, não semanas.
2. **10 conversas de campo**, com uma tarefa nova: pedir para o dono abrir o WhatsApp e contar **quantas conversas dos últimos 7 dias ficaram sem resposta dele**. Dimensiona o proativo antes de uma linha de código, e mede em vez de perguntar.
3. **v1 com o proativo na semana 1**, não na v1.1 — a única condição que faz a síntese da §2 funcionar.
4. Os três ADRs da §11.

---

## 9. O que foi derrubado, incluindo por mim

**1. "A Meta não tem relação de emprego com o dono e não vai para lá."** Errado, e eu afirmei isso ao Felipe antes de verificar. A Meta anunciou o resumo matinal ao dono em junho de 2026, em beta. O proativo-ao-dono é janela, não fosso — o que sobra defensável é a memória de compromisso e o estado fora da conversa (§2). **`pesquisa-2026-09.md` §4 precisa registrar isso.**

**2. "O maior grupo de não clientes é o dono que recusa bot; 73,2% preferem humano."** Troca de sujeito: os 73,2% são de *consumidores*, não de donos. O número não dimensiona comprador nenhum. E o não cliente por convicção é o comprador mais caro que existe — antes de vender é preciso reverter uma crença. Continua valendo como princípio de produto (é o ADR 003 e a persona); não vale como primeiro mercado.

**3. "Ancorar o preço no custo de uma pessoa atendendo."** Quebra nos nichos escolhidos: em assistência técnica e barbearia **não existe atendente** — quem responde é o dono, e a hora dele tem preço percebido zero. A âncora certa lá é a **venda perdida**. Continua valendo o corte: nunca ancorar em concorrente de software. Hoje `cobranca.md` justifica o R$ 197 como *"abaixo da âncora da Zaia"*, o que põe o Otto numa régua onde a BotConversa cobra R$ 129 e a Meta cobra zero. **O preço não muda nesta revisão**; muda contra o que ele é apresentado.

**4. "Responsabilidade contratual com indenização."** Substituída pelos três instrumentos baratos da §5.

**5. "O menor trabalho proativo é o orçamento sem resposta."** Exige extração de conversa, a hipótese mais frágil do projeto, e falso positivo é fatal. Substituído pela situação *Esperando você* do ADR 015.

---

## 10. Parecer da marca sobre as frases públicas

Nenhuma fere a regra de um Otto só (ADR 001) nem o caráter fixo. O que apareceu foi **três promessas sem lastro, um erro de audiência e um vocabulário já proibido por ADR**.

| Frase | Veredito | O que quebrou |
|---|---|---|
| "Se o Otto errar com um cliente seu, o problema é nosso" | Ajustar | Sozinha é superlativo sem número. Precisa do remédio na linha seguinte e da fronteira de **o que é erro nosso** — o Otto inventou (nosso), a empresa ensinou preço velho (dela), a infra caiu (nosso). Prometer os três e discutir culpa no suporte produz as queixas nº 1 e nº 5 de uma vez. **Nunca aparece para o cliente final:** lá o Otto veste o uniforme da empresa |
| "O Otto nunca dispara" | Ajustar | §7 |
| "Período de experiência" | **Aprovado no nome** | A carga de CLT ajuda — é a palavra que o dono usa ao contratar gente. "7 dias de teste grátis" devolve o produto para a prateleira de software e ainda é literalmente a oferta da Zaia. Mas **quem avalia é o empregador**: "a gente diz se valeu" inverte o juiz. E 7 dias termina quando o Otto começa a prestar |
| "Você leva o que o Otto aprendeu" | **Bloqueia** | §5 |
| Ancoragem no custo de uma pessoa | **Bloqueia na forma comparativa** | "Custa menos que um atendente" é o *Stop Hiring Humans* da Artisan em escala de bairro. A forma legítima ancora na **hora vazia**: *"Das 19h ao dia seguinte, no almoço e no domingo, quem responde seu WhatsApp é você — ou ninguém."* Ninguém é substituído numa vaga que não existe |
| Diagnóstico antes da venda | Ajustar | Não existe antes do contrato — antes do contrato não temos o dado dele. Existe no fim do período de experiência. **Os dois são um mecanismo só.** Bloqueado "você está perdendo R$ 4.200 por mês": multiplica ticket e conversão inventados por nós |

**A régua entre fato e susto já estava decidida em dois lugares nossos:** o aviso de saldo só fala em dias se sair do ritmo real dos últimos 7, e o gatilho de upgrade é repetição observada, nunca projeção. A mesma régua resolve o diagnóstico.

**Regra de fechamento:** toda promessa pública precisa de três campos preenchidos antes de sair — **quem cobre, qual é o remédio, e o que a revoga.** Promessa sem os três é a reclamação nº 1 da categoria com a nossa marca em cima.

As seis são hipóteses de persuasão, grau **NÃO VERIFICADO**. Entram como candidatas a teste, no regime das headlines de `voz-e-tom.md`, nunca como posicionamento fechado.

---

## 11. Correção de fato e o que muda

### Erros de fato a corrigir

| Arquivo | O que diz | Correção |
|---|---|---|
| `docs/produto/dados.md` (~linha 307) | histórico anterior à conexão não existe | Existe: 180 dias, com consentimento |
| `docs/decisoes/022...md` §12.7 | *"a Cloud API não entrega histórico anterior à conexão"* | Idem — e destrava a hipótese que o próprio ADR chama de mais frágil |
| `docs/decisoes/012...md` item 5 | pendência aberta | Destravada pela coexistência |
| `docs/mercado/pesquisa-2026-09.md` §4 | fraquezas da Meta | Falta o resumo matinal ao dono, anunciado em junho de 2026 |
| `CLAUDE.md` | condiciona o texto sobre acumulado à pendência 5 | Decidida em 2026-09-09; `identidade.md` já foi atualizado pelo guardião |

### Três ADRs, não oito

| Documento | Mudança |
|---|---|
| **ADR novo** | **O Otto é medido pelo trabalho, não pela resposta** — o lado empregador, a memória de compromisso, o teto determinístico da §6. É o de maior consequência |
| **ADR novo** | **Coexistência como cunha de entrada** |
| **ADR novo** | **Promessa pública de conduta** — os três instrumentos da §5, cada um com quem cobre, qual é o remédio e o que a revoga. Absorve o período de experiência com diagnóstico no fim |
| ADR 016 | Promover a nota de 2026-09-09 de precedente a princípio: o lado empregador é o espaço de crescimento, não a exceção |
| ADR 021 | Remover a data de v1.1; substituir por gatilho |
| ADR 018 | Manter, reordenar atrás do lado empregador, e escrever a exceção |
| ADR 004 / `cobranca.md` | Trocar a âncora pública; orçar o proativo (§6) |
| `visao.md` | Reescrever "Concorrência" e a tese de escopo: *"responder bem e encaminhar bem já vale o salário"* é a frase do oceano vermelho |
| `mercado/experimento-001` | Encerrar |

---

## 12. As perguntas de campo que esta revisão acrescenta

As seis da `pesquisa-2026-09.md` §10 continuam.

7. **Tarefa, não pergunta:** *"abre teu WhatsApp e me diz quantas conversas dos últimos 7 dias ficaram esperando resposta tua."* Dimensiona o proativo com dado, não com opinião.
8. *"Se desse para conectar sem sair do aplicativo que você já usa, mudaria alguma coisa?"* — testa a cunha da §3.
9. *"Quando um sistema seu erra com um cliente seu, o que você espera do fornecedor?"* — se ninguém souber responder, responsabilidade retém mas não vende.

**O que mudaria todo este documento:** se a Meta liberar o resumo matinal para o Brasil geral antes da v1, o proativo-ao-dono deixa de ser diferenciação e o Otto tem que descer para o que a Meta não alcança — o estado fora do app: agenda, dinheiro, sistema do negócio.
