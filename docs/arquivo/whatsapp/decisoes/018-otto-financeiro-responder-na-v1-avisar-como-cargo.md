# 018 — Otto Financeiro: responder é v1, avisar de conta em aberto é cargo

Status: substituída por 026 (pivô para a ferramenta de design, 2026-09-26). Status anterior: proposta
Data: 2026-09-08
Quem decide: Felipe

## Contexto

Felipe propôs em 2026-09-08 ampliar o escopo de cargos: além do Atendente, um **Otto cobrador** ("cobra contas atrasadas") e um **Otto do setor financeiro** ("envia nota fiscal, segunda via de boleto, recebe pagamentos"), este último ligado às integrações do ADR 006 e ao pagamento no WhatsApp do ADR 011.

O ADR 016 já tinha traçado a linha que organiza a expansão — **responder × iniciar conversa** — e nomeado os dois próximos cargos (Vendedor e Agenda, ordem a validar). A proposta do Felipe não cabe inteira de um lado só da linha: ela é uma lista de cinco capacidades que se partem em três destinos diferentes.

Este ADR faz esse corte. Foram consultados o guardião da marca e o estrategista de mercado; ambos convergiram, por caminhos diferentes, no mesmo corte.

## Opções consideradas

**A. Dois cargos novos: Otto Cobrador e Otto Financeiro.** Recusada. Dois cargos no mesmo domínio, vendidos separados, viram duas pessoas na cabeça do empregador — é a opção B do ADR 001 ("Otto como agência") entrando pela porta dos fundos. E parte o mesmo preço em dois menores, criando "então o Atendente é incompleto?", o defeito que derrubou Básico/Avançado no ADR 004.

**B. Um cargo novo, Otto Financeiro, com tudo dentro.** Recusada. Faria o empregador pagar duas vezes por segunda via e status de pagamento, que são o Atendente respondendo com um documento no lugar de uma frase.

**C. Cobrança como primeiro cargo pago, na frente de Vendedor e Agenda.** Recusada. Ver a seção "Ordem".

**D. Cortar a proposta pela linha do ADR 016 e por quem começa a conversa.** Escolhida.

## Decisão

### 1. O corte em três destinos

| O que Felipe pediu | Quem começa | Destino |
|---|---|---|
| Segunda via de boleto | Cliente final pergunta | **Atendente, por integração.** Não é cargo |
| Status de pagamento ("já caiu?") | Cliente final pergunta | **Atendente, por integração.** Não é cargo |
| Enviar nota fiscal | Cliente final pergunta | **Atendente, por integração.** Não é cargo. Só envia, nunca emite |
| Receber pagamento | Cliente final quer pagar | **Já é v1.** ADR 011, porta `FonteDeCobranca` |
| Cobrar conta atrasada | **A empresa começa** | **Único cargo novo:** Otto Financeiro |

A regra que produz o corte: **capacidade que responde dentro da janela de 24 horas não vira cargo, vira porta de contexto.** Cargo novo só se justifica quando muda quem começa a conversa, e com isso muda permissão, custo de template, risco de banimento e regra de caráter. Esta regra generaliza a tabela "já é a v1, com outro nome" do ADR 016 e vale para as próximas ideias de cargo.

### 2. Não existe "Otto Cobrador"

O nome é reprovado, e não por delicadeza: em português brasileiro "cobrador" nomeia o Otto pelo ato que machuca quem lê, e carrega cobrador de ônibus e cobrador de agiota. `identidade.md` já reserva **Otto Financeiro** como cargo futuro; é esse que fica. Cargo exibido padrão: **"financeiro"** (o empregador pode configurar "cobrança", que passa nas regras de `estilos-de-atendimento.md`, com a observação de que é a palavra mais dura que o cliente final lê no crachá).

### 3. Nota fiscal: envia, nunca emite

Buscar o PDF ou o XML de uma NF **já emitida** e mandar no chat é leitura, e cabe na regra de leitura livre do ADR 006. **Emitir** é responsabilidade fiscal com multa, e um erro do modelo vira problema do contador da empresa cliente. Porta nova `FonteDeDocumentoFiscal` (Bling, Conta Azul, emissor próprio, mais o adaptador manual obrigatório: o empregador manda o arquivo). Somente leitura, sem exceção e sem gatilho de revisão.

Isto também resolve uma colisão de vocabulário: no ADR 011, **cobrança é o documento de pagamento que o Otto cria**. O aviso de atraso nunca se chama cobrança. Fica: cobrança = criar o pagamento; atraso = **lembrete de vencimento** / **conta em aberto**.

### 4. O que o Otto Financeiro faz, e onde ele para

**Um lembrete, no máximo dois. Nunca régua, nunca sequência.**

O Otto avisa que a conta venceu, diz valor e vencimento lidos de fonte confirmada pelo empregador, e manda o link para pagar. Aí ele para. Especificamente, ele **não**:

- negocia desconto, parcela ou prazo, nem pergunta "quando você consegue pagar?" (regra 6 do caráter: não promete o que a empresa não confirmou);
- insiste depois de contestação — "já paguei", "não devo", "não reconheço", "estou sem condições" encerram o Otto e passam para uma pessoa **na mesma mensagem** (regras 3 e 7);
- deduz valor ou vencimento (regra 1). Cobrar quem já pagou é o erro que a marca não sobrevive;
- é o rosto da segunda tentativa em diante: **a partir da segunda, é gente.**

Isso não exige exceção ao "O que não muda" de `persona-otto.md`. Avisar e mandar o link cabe no caráter atual; o que não cabe é a pressão, e nada aqui a autoriza. `persona-otto.md` ganha uma linha nova na tabela de situações ("o Otto avisa de conta em aberto e a pessoa contesta"), sem tocar no caráter.

### 5. Ressalva ao ADR 003: em conversa que a empresa começou sobre dinheiro, o Otto se identifica sozinho

O ADR 003 foi escrito para conversa que a pessoa abriu, sobre assunto dela, onde não saber que é IA não muda nenhuma decisão dela. Num lembrete de pagamento, quem começa é a empresa, o assunto é dinheiro que a pessoa deve, e o que ela decide — pagar, contestar, pedir prazo — depende de saber com quem está falando. Invertida a iniciativa, inverte-se a regra:

- Na primeira mensagem do lembrete, o Otto diz **em nome de que empresa** fala e **que é IA**, sem esperar pergunta.
- **E não cita ottobr.ai.** O ADR 003 empacota "é IA" com "cita ottobr.ai uma vez"; divulgar a marca dentro de uma cobrança é marketing em cima de quem está devendo, no pior contexto possível para a única aquisição orgânica que temos. Aqui, marca só se a pessoa perguntar.

Não temos dado sobre se identificar a IA reduz o pagamento. Isso não é argumento para esconder.

### 6. Ordem: não entra na frente de Vendedor e Agenda

O Otto Financeiro fica em **terceiro**, depois dos dois cargos do ADR 016. Três motivos:

1. **É o único cargo que inicia conversa com quem não quer ser contatado.** Taxa máxima de denúncia e bloqueio, e o número que morre é o da empresa cliente. Fazer isso no primeiro cargo pago, com as salvaguardas do ADR 016 ainda não construídas, é o pior sequenciamento disponível.
2. **Muda o comprador.** A cunha do ADR 007 é "ninguém atende meu WhatsApp", não "meu caixa não fecha".
3. **O espaço já tem incumbente barato e o sistema do cliente já tem régua em cima.** CobZap (R$ 47–97 por usuário/mês), Mais Gestão (a partir de R$ 79,90/mês mais R$ 0,08–0,15 por envio), Recash, módulo de régua da Omie, Kollecta e SocialHub com IA. É exatamente o critério que fez o ADR 007 fugir de saúde.

### 7. Não muda o nicho do ADR 007

Carteira em atraso mora em negócio com mensalidade: academia, escola, clínica, provedor de internet. Assistência técnica de bairro tem outra coisa — orçamento aprovado com aparelho não retirado, valor baixo, cobrança pessoal (hipótese, sem campo). **Adotar cobrança como cunha seria trocar de nicho disfarçado de cargo novo.** Se for para lá, vai pelo ADR 007 com experimento, não de carona.

### 8. Salvaguardas adicionais (5 a 10)

As quatro do ADR 016 continuam valendo e são contra banimento na Meta. Cobrança tem um segundo eixo de risco, jurídico, que o ADR 016 não previu. Nenhum lembrete de pagamento sai sem as dez.

5. **Janela de horário.** Nada fora de horário comercial, nada em fim de semana e feriado.
6. **Conferência de quitação imediatamente antes do envio**, contra a fonte de verdade do empregador. Pagamento registrado depois da fila e antes do disparo cancela o envio.
7. **Nunca em grupo e nunca com terceiro no meio.** Cobrança só chega a quem deve, no privado (ADR 015 já proíbe grupo; aqui a proibição é de outra natureza — expor dívida a terceiro é o que o CDC art. 42 chama de constrangimento).
8. **Nada de ameaça**: negativação, SPC, Serasa, protesto, jurídico, "evite maiores transtornos", "regularize sua situação". Bloqueio absoluto de texto, não configurável. `voz-e-tom.md`, princípio 6: não vendemos pelo medo.
9. **Registro auditável por envio**: quem, quando, valor, fonte do valor, texto exato, e o que aconteceu depois. Por empresa.
10. **Opt-out numa palavra.** "Para" ou "não quero mais" encerra os lembretes daquela pessoa para sempre, e avisa o empregador.

### 9. Vocabulário (texto público; código segue livre)

| Diga | Não diga |
|---|---|
| pagamento em aberto, conta em aberto, boleto vencido | dívida, débito, inadimplência, pendência financeira |
| você, o cliente, quem ainda não pagou | devedor, inadimplente, mau pagador |
| lembrar do vencimento, avisar que a conta venceu | cobrar, cobrança automática, régua de cobrança |
| segunda via, link para pagar, comprovante | recuperação de crédito, recebíveis, carteira em atraso |
| falar com alguém da equipe sobre o pagamento | negociar, fazer um acordo, proposta, condição especial |
| — (bloqueio absoluto) | negativar, SPC, Serasa, protesto, "seu nome vai ficar sujo" |
| — (bloqueio absoluto) | "urgente", "última chance", "evite maiores transtornos" |

`FonteDeCobranca`, `cobranca`, `divida`, `inadimplencia` e `dunning` continuam livres em classe, tabela, coluna, fila, evento e log (`identidade.md`, "Onde este vocabulário vale — e onde não vale"). Só não vazam para a tela.

**Promessa pública aprovada, para material de empregador:** *"O Otto avisa quem está com conta em aberto e manda o link pra pagar. Quem quiser conversar sobre o pagamento, ele passa pra você."* Nunca "o Otto cobra seus inadimplentes" — isso posiciona o Otto contra quem escreve para a empresa, numa frase que o cliente final pode ler num print.

### 10. Preço: conversa iniciada conta como atendimento

Sem segunda moeda. Um lembrete de uma mensagem "gastando um atendimento" é caro demais aos olhos do dono, mas ele confere sozinho, que é o critério do ADR 004. Saldo único (pendência 4 de `cobranca.md`), custo de template embutido na faixa. A pendência 7 de `cobranca.md`, que o ADR 016 já tinha dado dono, cobre este cargo também.

### 11. Um crachá por conversa

Se Atendente e Financeiro estiverem ativos no mesmo número, o cliente final não pode ouvir "sou outro Otto". Nome igual (ADR 013), memória igual, e o Otto não muda de função no meio de uma conversa sem dizer. É o ADR 001 na prática, na única audiência em que ele quase falha.

## Consequências

- **`visao.md`** mantém "cobrar" fora da v1 e ganha o Otto Financeiro no mapa de futuro. Segunda via, NF e status de pagamento entram como integração, não como escopo novo de v1.
- **`integracoes.md`** ganha a porta `FonteDeDocumentoFiscal` (somente leitura, adaptador manual obrigatório) e a desambiguação de "cobrança".
- **ADR 003** ganha a ressalva do item 5. Não é substituído.
- **ADR 016** continua vigente; este ADR o estende com um terceiro cargo, seis salvaguardas e a regra geral do item 1.
- **`persona-otto.md`** ganha uma linha na tabela de situações. "O que não muda" fica intacto.
- **`identidade.md`** ganha o vocabulário do item 9; Otto Financeiro deixa de ser exemplo e vira cargo previsto.
- **`estilos-de-atendimento.md`** ganha os textos fixos do lembrete nos quatro presets, quando o cargo for construído.
- **Jurídico.** Se identificar IA em cobrança é obrigação legal (CDC, lei do superendividamento, PL 2338/2023) é pergunta que este ADR não responde. **O gatilho do agente jurídico no CLAUDE.md está em "antes do primeiro cliente pagante"; este cargo antecipa esse gatilho** — o jurídico tem que existir antes do primeiro lembrete enviado, não antes do primeiro cliente.
- **Backend.** Fonte de verdade da conta em aberto, conferência de quitação antes do envio e janela de horário são caminho novo, não `if` no webhook.

## Evidência comportamental (fichas)

| Afirmação | Tipo | Grau | O que a mata |
|---|---|---|---|
| Dono de assistência técnica de bairro tem carteira em atraso relevante | Taxa | NÃO VERIFICADO | Nas 10 conversas de campo, 5 ou mais citarem valor em reais parado e um episódio datado |
| ROI de cobrança é mais legível para o dono que ROI de atendimento | Preferência | INFERIDO (reais recuperados são contáveis; "atendi mais rápido" não) | Dono preferir a promessa do Atendente à do Financeiro quando as duas são apresentadas lado a lado |
| Pessoa cobrada por IA identificada paga na mesma proporção de quem não sabe | Taxa | NÃO VERIFICADO — e não pode virar argumento para esconder | Medição própria depois do cargo existir |
| Segunda via e NF sob demanda são pedidos de verdade, e não suposição nossa | Taxa | NÃO VERIFICADO | Menos de 10% das conversas das 30 primeiras contas conterem pedido de documento |

## Gatilho de revisão

- **Ordem.** Somar às 10 conversas de campo do ADR 016 a pergunta: *"quanto você tem em aberto de cliente que não pagou, e o que você fez na última vez?"*. **Cinco ou mais com valor em reais e episódio datado** reabrem a ordem e podem pôr o Financeiro na frente do Vendedor.
- **Nicho.** Se o campo mostrar dono de assistência técnica com mais de R$ 2 mil parados e nenhuma ferramenta, cobrança vira candidata a cunha — e isso é revisão do **ADR 007**, com experimento, não deste.
- **Documento fiscal.** A porta `FonteDeDocumentoFiscal` só é construída se pedido de segunda via, NF ou status de pagamento aparecer em mais de 10% das conversas das 30 primeiras contas, ou 5 contas pedirem. Antes disso, adaptador manual só.
- **Emitir NF** não tem gatilho. Não entra.
- Revisar tudo se a Meta mudar a categoria de template para cobrança, ou se sair regra legal sobre identificação de IA em cobrança.
