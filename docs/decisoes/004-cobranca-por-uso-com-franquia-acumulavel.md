# 004 — Cobrança por uso, com assinatura e franquia acumulável

Status: aceita (o modelo) / **revista em parte pelo ADR 024** (a métrica exibida)
Data: 2026-09-08
Quem decide: Felipe

> **Revisão de 2026-09-09 — ADR 024.** O modelo deste ADR continua inteiro: assinatura mensal com franquia acumulável sem teto, pré-paga, medida internamente em token, com a unidade exibida escolhida pelos dois critérios abaixo (conferível sozinho, sem taxa de câmbio prévia). O que mudou foi **a unidade exibida e o eixo que nomeia o plano**: "atendimento" era a palavra do cargo Atendente e o produto passou a se apresentar como funcionário com vários cargos. A unidade agora é o **crédito**, com preço por ação, e a característica principal do plano é o **cargo**. **A âncora é 1:1** — responder um cliente por um dia custa 1 crédito —, e é por isso que nenhum número deste ADR precisou ser recalculado. Duas linhas específicas ficam desatualizadas de propósito, e o ADR 024 diz por quê: a linha "Créditos" da tabela de unidades (descartada aqui, escolhida lá, contra o parecer do guardião da marca) e a linha "Atendimentos" (escolhida aqui, aposentada lá).

## Contexto

Precisa existir um modelo de cobrança coerente com a marca de "funcionário contratado" e com o custo variável real (o Otto gasta tokens de modelo a cada resposta).

## Decisão (Felipe)

- Assinatura mensal com franquia de uso.
- Medição interna em **tokens**.
- Franquia **acumulativa** entre meses.
- Saldo consumido conforme uso da IA.
- **Métrica exibida ao empregador: atendimentos.** Decidido em 2026-09-08, ver nota abaixo.

## Proposta complementar (Claude, aguardando Felipe)

- Nunca expor "token" ao empregador.
- Um saldo só por conta, independente do número de cargos (coerente com ADR 001).
- Teto para o acumulado e comportamento definido quando o saldo zera (o Otto não pode sumir do WhatsApp em silêncio).

Detalhes, alternativas e hipóteses em `docs/produto/cobranca.md`.

~~Métrica exibida candidata: horas do Otto, acumulado como banco de horas.~~ Descartada em 2026-09-08, ver nota abaixo. ~~Faixas de assinatura nomeadas por carga horária.~~ Caiu junto com a hora.

## Consequências

- Retirado de `voz-e-tom.md` o exemplo "um cargo, um preço", que prometia preço fixo.
- Quantos atendimentos cabem em cada faixa é conta de infraestrutura e só se fecha com tokens por atendimento medidos (primeira entrega técnica, ADR 005). Não inventar o número antes.
- O painel do empregador precisa mostrar saldo em linguagem de gente e avisar em 80% e 100%.

## Gatilho de revisão

- Rever a métrica exibida se, nas primeiras 30 contas, **5 ou mais** contestarem fatura ou perguntarem o que conta como um atendimento no suporte.
- ~~Introduzir a regra de conversa longa por gatilho medido.~~ A regra entra na v1, decidida em 2026-09-08 pela modelagem de custo. O gatilho vira outro: **rever o limite de 10 respostas se mais de 15% dos atendimentos passarem dele**, o que significaria que o limite está apertado demais para o segmento.
- Rever o rollover se mais de metade das contas acumular acima do teto proposto, ou se o passivo acumulado passar de um limite financeiro que Felipe defina.

## Nota de 2026-09-08 — sem teto no acumulado

Felipe decidiu **sem teto no acumulado**. Pré-pago com custo por uso não gera dívida; gera necessidade de reserva de caixa proporcional à franquia acumulada. Ver `cobranca.md`, pendência 1.

## Nota de 2026-09-08 — métrica exibida decidida: atendimentos

Felipe derrubou "horas do Otto" com dois argumentos, e um terceiro apareceu na discussão:

1. **Dá impressão literal de compra de horas.** A frustração chega quando o empregador percebe que não é isso.
2. **O que ele compra é token.** Ele vai tentar converter e a conta não vai bater.
3. **A hora contradiz o argumento de venda.** O discurso é "atende 24 horas por dia, sem faltar"; a fatura diz que as horas acabaram. Não existe resposta boa para "como assim acabaram as horas?".

Raiz comum: **hora é uma unidade para a qual o empregador já tem taxa de conversão na cabeça.** Ele sabe quanto vale uma hora de atendente e quantas horas tem o dia. Unidade familiar-mas-falsa é pior que unidade opaca. Definição pública ("1 hora ≈ N mensagens") não salva: é o convite para a conversão que não fecha.

**Critério que fica para qualquer métrica exibida, hoje e no futuro:**

- O empregador consegue **conferir sozinho**, olhando o WhatsApp dele.
- Ele **não tem taxa de câmbio prévia** para a unidade.

Hora falha nos dois. Crédito falha no primeiro e não sustenta a marca. Sobraram atendimentos e respostas.

**Decisão: atendimentos.**

> **Um atendimento é uma conversa com uma pessoa dentro de uma janela de 24 horas**, contada a partir da primeira mensagem que o Otto responde. A mesma pessoa voltando dois dias depois é outro atendimento. A janela de 24h é convenção de contagem, emprestada da janela da Meta porque é o recorte natural de uma conversa de WhatsApp — não é alinhamento de custo.

Por que atendimentos e não respostas: **na hora de escolher a faixa**, o dono sabe dizer "recebo uns 20 clientes por dia no zap"; ele não sabe estimar quantas mensagens isso dá. Respostas casam melhor com o custo — desde 1º de outubro de 2026 token e tarifa da Meta são ambos por resposta —, mas erram na compra, que é onde a frustração nasce.

~~**O que a decisão custa:** a variância entre conversa curta e longa fica com a ottobr.ai, absorvida no preço da faixa. Nenhuma regra de conversa longa na v1; ela entra por gatilho medido, não por precaução.~~ **Revertido no mesmo dia pela modelagem de custo — ver a nota de preço abaixo.**

**O que cai junto:** "banco de horas", "carga horária", "período integral / meio período" como nome de faixa, e a recompensa de indicação expressa em horas (ADR 011 passa a dizer "um mês do Otto", que é o que ela sempre foi literalmente). Faixas passam a ser dimensionadas pelo movimento.

**Nome das faixas, decidido no mesmo dia:** faixa não tem nome, tem número — "300 atendimentos por mês", "800", "2.000", com o preço ao lado. Felipe levantou "Básico / Avançado / Enterprise" e recusou depois da conta: o nome diz que o Otto da faixa de baixo é pior, e não é (todas entregam o mesmo Otto e o mesmo caráter), o que empurra o suporte para "ele errou porque estou no Básico?" e transforma o upgrade em compra de robô melhor, quando a venda real é "seu movimento cresceu"; e "Enterprise" é inglês num produto em pt-BR cujo primeiro nicho é assistência técnica de bairro. Também recusado "Otto Atendente 300": o número nomeia a faixa, nunca o Otto, cujo nome não recebe sufixo (ADR 013). Quantas faixas e a que preço continua aberto; o padrão de nomeação, não.

**Pendência criada:** conversa em que o Otto só encaminha sem resolver desconta atendimento ou não. Não descontar é bom argumento de venda e custa dinheiro. Fica para depois da primeira medição.

## Nota de 2026-09-08 — preço aprovado e regra de conversa longa

Modelagem de custo feita com preço de token conferido na referência da API (Sonnet 5 US$ 2/10 por milhão; Haiku 4.5 US$ 1/5), tarifa da Meta de US$ 0,0068 por mensagem de serviço e câmbio de R$ 5,10. Conta completa em `docs/produto/cobranca.md`, seção "Preço e custo por atendimento".

**Três achados que mudaram decisões:**

1. **Cache de prompt é obrigatório, não otimização.** A DigitalOcean suporta cache para modelos Anthropic no esquema `cache_control`. Sem cache, um atendimento extremo (30 respostas, 18 min de áudio, ~685 mil tokens) custa R$ 8,50; com cache, R$ 3,44. Use TTL de 1 hora: a 5 minutos o cache expira no meio de uma conversa de WhatsApp.
2. **A regra de conversa longa entra na v1**, revertendo a decisão registrada horas antes neste mesmo ADR. Motivo: uma conta cujos clientes só mandam conversa longa com áudio custa 5× a média, o que dava margem de −90% na faixa de entrada. Com o rollover sem teto, não existe quem subsidie — o preço tem que assumir utilização de 100% da franquia. A regra: **um atendimento é um dia de conversa com uma pessoa, até 10 respostas do Otto; passou disso, conta outro.**
3. **42% do custo variável não é token, é a mensagem de serviço da Meta.** Otimizar prompt tem piso.

**Preço aprovado pelo Felipe:** R$ 197 (150 atendimentos), R$ 447 (400), R$ 997 (1.000), e "fale com a gente" acima de 1.000 — sem preço fechado porque lá o desconto por volume vira prejuízo no pior caso e não há dado.

**Nota de 2026-09-09 — franquias revistas para cima, preço inalterado.** O Felipe achou 150 atendimentos (5 por dia) pouco para uma empresa. Antes de mexer em margem, foram examinados quatro caminhos: baixar a margem, pôr teto no acumulado, trocar o modelo de inferência e arrumar o cache. **Ganhou o cache**, porque é o único sem contrapartida: o prefixo de cada empresa (caráter + estilo + base + portas, ~5.100 tokens) é byte-idêntico em todas as conversas dela e estava sendo reescrito uma vez por conversa. Escrito uma vez por dia e mantido quente, o custo médio cai de R$ 0,352 para R$ 0,295 por atendimento — **R$ 0,085 por atendimento, sem trocar de modelo e sem risco de qualidade**.

**Faixas novas, aprovadas pelo Felipe em 2026-09-09, com o mesmo preço:** R$ 197 (**200** atendimentos), R$ 447 (**500**), R$ 997 (**1.200**), "fale com a gente" acima de 1.200. Margens 68% / 65% / 63%. Franquia sempre em número redondo — nada de 198 ou 1.318.

**Duas consequências que não são cosméticas:**

1. **A medida 4 (prefixo por empresa escrito 1×/dia) virou requisito, como o cache já era.** Sem ela o custo volta para R$ 0,352 e as margens desta tabela caem para 64% / 61% / 58%.
2. **A margem no pior caso encolheu:** de 26% / 14% / 4% para 11% / 2% / −5%. A faixa de 1.200 é a única que pode dar prejuízo, e só no perfil extremo (conta cujos clientes só mandam conversa longa com áudio). Alternativa registrada: 1.150 devolve a faixa de cima a 0% no pior caso, ao custo de quase apagar o desconto por volume entre as duas faixas de cima.

**Também corrigido em 2026-09-09:** a terceira medida de custo ("Haiku nas respostas simples, Sonnet no resto") estava errada. **O cache é por modelo**, então alternar modelos dentro de uma conversa paga a escrita do prefixo duas vezes e sai 19% a 22% mais caro que não rotear nada. O roteamento tem que decidir antes da primeira resposta e não mudar mais. Detalhe e números em `cobranca.md`.

**Não trocar o modelo de inferência agora.** Na Gradient os modelos realmente baratos são os abertos, e a documentação da DigitalOcean só afirma tool calling para os modelos comerciais da Anthropic e da OpenAI — o Otto chama ferramenta (ADR 006). Nos abertos o cache é automático, sem TTL controlável, e o TTL de 1h é requisito. Além disso, o teto da briga inteira é R$ 0,220 por atendimento, porque 42% do custo é tarifa da Meta: mesmo com o modelo de graça, a entrada não passaria de 360 atendimentos.

**Condição:** tamanho do prompt, respostas por conversa e a fatia de conversas extremas são estimativa, não medição. A primeira entrega técnica do ADR 005 mede as três. **Não publicar preço em landing ou anúncio antes disso.**


## Nota de 2026-09-09 — o que acontece quando a franquia acaba, e o pacote extra

Duas das pendências que este ADR criou foram fechadas pelo Felipe: *"o cliente deve ser avisado quando está acabando e existe o risco de respostas não serem respondidas. Coloque a possibilidade de comprar um pacote extra de atendimentos. Deve ser mais caro que a assinatura para incentivar o upgrade de plano."*

**Aviso em 80% e em 100% da franquia.** E quando ela zera, **o Otto não some do WhatsApp**: responde uma mensagem mínima e avisa a empresa. Cliente final mandando mensagem para o vazio é o pior cenário para a empresa e para a marca, e nenhuma economia justifica isso. A cortesia não é grátis nem infinita: custa a tarifa da Meta (~R$ 0,12 por conversa, sem token) e vale enquanto a assinatura estiver ativa e em dia.

**Pacote extra: R$ 1,49 por atendimento, em bloco de 100 por R$ 149.** Sem desconto por comprar vários — desconto por volume é o trabalho da assinatura, e é justamente o que o pacote não pode imitar. O número é mais caro que qualquer faixa (R$ 0,99 na entrada) **e** mais caro que o custo marginal de subir de faixa (R$ 0,83 de 200 para 500; R$ 0,79 de 500 para 1.200), que é a comparação que de fato decide. Se o pacote custasse menos que o marginal do upgrade, ele seria a escolha racional para sempre e a faixa de cima nunca venderia.

Entra na mesma franquia e acumula igual, sem validade própria. Recarga automática existe, mas nunca em silêncio: o dono define o teto de blocos por mês e é avisado a cada compra.

**A contrapartida de marca, que não é negociável:** na hora de oferecer o pacote, o produto mostra os dois números lado a lado — comprar o pacote × subir de faixa — inclusive quando a comparação diz que o upgrade é melhor negócio. Dois pacotes no mesmo mês (R$ 197 + 298 = R$ 495) já custam mais que a faixa de 500 (R$ 447), e é obrigação do produto dizer isso. O Otto não engana o empregador para vender mais; a persona não sobrevive a um upsell escondido.

Detalhe e aritmética em `docs/produto/cobranca.md`, pendências 2 e 3. Jornada e telas em `docs/produto/experiencia.md`, Decisão D.

**Gatilho de revisão:** se mais de 30% das contas ativas comprarem pacote em dois meses seguidos, o problema não é o pacote — é a franquia da faixa de entrada estar dimensionada errado, e o conserto é a franquia. Se menos de 1 conta em 20 chegar a 80% em três meses, o pacote é solução sem problema e sai da tela.

## Nota de 2026-09-09 — troca de faixa no meio do mês: sem proração

Decidido pelo Felipe: **a faixa nova vale na hora, com o valor cheio.** Ele paga os R$ 447, recebe os 500 atendimentos, e o que já pagou no mês não vira crédito.

**O que torna isso justo é o acúmulo, e a decisão só existe por causa dele.** Sem rollover, cobrar cheio no dia 20 seria vender dez dias de capacidade que evaporaria na virada. Com rollover sem teto — a decisão de 2026-09-08 desta mesma página — nada evapora: são 500 atendimentos que não vencem. O cliente adianta caixa; não perde valor. **As duas decisões só funcionam juntas**, e mexer no acúmulo depois quebra esta.

Efeito colateral que reforça o incentivo pedido na nota do pacote extra: na hora de decidir, o upgrade custa R$ 0,89 por atendimento e o pacote avulso R$ 1,49. Quem tem volume sobe; o avulso fica sendo socorro de pico.

**Consequência de texto:** a tela de comparação não pode dizer que subir de faixa "sai mais barato já neste mês" — sob esta regra o mês sai mais caro (R$ 197 + R$ 447 = R$ 644). O que ela diz é o outro lado, que é verdade: o que sobrar não se perde.

### O que esta decisão abriu, e ainda não tem dono

**Acúmulo sem teto + troca de faixa livre + valor cheio na hora** deixam o cliente escolher a que preço por atendimento ele compra: R$ 0,83 na faixa de 1.200, R$ 0,99 na de 200. Assinar a faixa grande por um mês, acumular, e depois descer ou cancelar é um caminho aberto hoje.

**Não é um problema de margem** — 1.200 atendimentos custam R$ 354 e renderam R$ 997, margem de 64%, dentro da faixa aprovada. É um problema de **receita recorrente**: troca um assinante por um comprador avulso, e isso não aparece em nenhuma linha de custo.

Recomendação registrada em `cobranca.md`, pendência 5: **o acumulado vale enquanto a assinatura estiver ativa e em dia**; assinatura parada congela em vez de queimar. Decide junto com a régua de inadimplência.

**Gatilho de revisão:** duas ou mais contas subindo de faixa e descendo em até 60 dias. Aí o caminho deixou de ser hipótese.

**Nota de 2026-09-09 — o acumulado sobrevive à parada da assinatura.** Decidido pelo Felipe: *"se a assinatura para e ele ainda tem créditos, deixe usá-los."* O atendimento acumulado foi pago e é dele; parar a assinatura não queima o que sobrou, e descer de faixa também não.

Contraria a recomendação que estava registrada (congelar até a assinatura voltar), e o custo fica escrito para poder ser medido depois: com crédito sobrevivendo à parada, assinar a faixa grande por um mês e cancelar é um caminho aberto — R$ 997 rendem 1.200 atendimentos a R$ 0,83, seis meses de uma empresa que faz 200 por mês. **Não é problema de margem (64%, dentro da faixa aprovada); é de receita recorrente**, que some sem aparecer em nenhuma linha de custo. Aperta a reserva de caixa da nota de 2026-09-08: ela passa a cobrir acumulado de conta parada, que consome custo variável sem nada entrando.

Duas fronteiras que a régua de inadimplência precisa fechar: **cancelar não é dever** (quem tem fatura vencida é outro caso, e pode ser congelado até quitar), e **quando o crédito da conta parada acaba, o Otto para de vez** — não herda a cortesia de mensagem mínima, que existe para cliente pagante com franquia zerada.

**Gatilho de revisão:** duas ou mais contas assinando faixa acima da que vinham usando e cancelando em até 60 dias.
