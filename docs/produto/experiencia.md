# Experiência do Otto

Status: as decisões A e B são proposta de 2026-09-08 (viraram o ADR 015). A **decisão C** é proposta de 2026-09-09, com três pontos já decididos pelo Felipe no mesmo dia (12.11). A **decisão D** é proposta de 2026-09-09, aguardando o Felipe (13.10). A **decisão E** (seção 14) e a **preparação na jornada** (seção 15) são de 2026-09-09, tarde, e derivam dos ADRs 024 e 025, que já estão aceitos.
Dono: especialista em UI/UX. Texto público em rascunho, marcado `[GUARDIÃO]`, fechado pelo guardião da marca. Eventos propostos ao analista de produto (`dados.md`). Telas implementadas pelo especialista-react.
Data: 2026-09-08, revisado em 2026-09-09 com as decisões C e D, e de novo em 2026-09-09 (tarde) com os ADRs 024 e 025

> **Passada de vocabulário de 2026-09-09 (tarde), obrigatória pelo ADR 024.** A unidade exibida da franquia deixou de ser **atendimento** e passou a ser **crédito**, com âncora 1:1 (responder um cliente por um dia = 1 crédito). Nenhum número deste documento mudou; mudou a palavra. **O substantivo *atendimento* se aposentou do texto público; o verbo *atender* e o cargo *Otto Atendente* ficam.** O vocabulário e as travas estão em `docs/marca/identidade.md`, seções "A moeda é o crédito", "Crédito nunca aparece ao lado do seu valor em reais na mesma frase" e "Crédito é trabalho já pago, não dinheiro do dono" — é de lá que sai o texto, não daqui. O que sobrou de "atendimento" neste documento, de propósito, está listado em **14.8**.
>
> **Texto da seção 14 fechado pelo guardião da marca em 2026-09-09 (tarde).** Nenhum bloqueio nos oito itens; três viraram ajuste de desenho e não de palavra, e um deles corrigiu um erro que nenhuma revisão de texto pegaria. Parecer inteiro em **14.9**. Ficaram abertos, de propósito: os textos do bloco da preparação (15.3, não estavam na lista) e a redação da pergunta do resumo do dia, que depende do analista de produto e não da marca.

## 1. Para que serve este documento

Descreve o que a pessoa vê, o que ela faz e o que acontece — antes de existir código. Jornada, mapa de telas, estados por tela, texto em rascunho e a lista de hipóteses comportamentais com grau.

Cobre quatro decisões:

- **A. Contatos que o Otto não atende** (seção 4). Pedida pelo Felipe em 2026-09-08.
- **B. Como a empresa organiza as conversas** (seção 5). Pedida pelo Felipe em 2026-09-08.
- **C. Como a empresa ensina o Otto sobre o negócio** (seção 12). Pedida pelo Felipe em 2026-09-09.
- **D. Quando os créditos do mês estão acabando** (seção 13). Pedida pelo Felipe em 2026-09-09, dentro da resposta dele à pergunta 12.11.2.
- **E. Como o dono confere o que o Otto fez, e como ele vê o preço de uma ação antes de ligar um cargo** (seção 14). Exigida pelo ADR 024, que criou as duas coisas e deixou a forma comigo.
- **A preparação na jornada** (seção 15). Exigida pelo ADR 025. Não é decisão minha: o valor, a isenção e o que ela entrega já estão decididos. O que é meu é onde ela cabe sem quebrar o "mesmo dia".

**Por que C e D moram no fim e não viram seções 6 e 7.** `dados.md` referencia "seções 4, 5 e 10 de `experiencia.md`" e "ficha 9.1" em dezenas de linhas. Renumerar quebraria essas referências sem ganhar nada. C e D têm a mesma forma das outras duas — problema da pessoa, decisão, alternativas, telas e estados, jornadas, o que fica fora, fichas, eventos — só que dentro das seções 12 e 13, com fichas numeradas 12.x e 13.x. A seção 6 (mapa de telas) e a seção 8 (o que fica fora da v1) apontam para lá. **A decisão E (seção 14) e a preparação (seção 15) seguem a mesma regra pelo mesmo motivo**, e a seção 14 carrega, em 14.8, a lista do que sobrou da palavra antiga de propósito.

**As duas decisões usam o mesmo canal novo**, e isso é de propósito: o Felipe autorizou o Otto a falar com o dono pelo WhatsApp (12.11.1), e a decisão D reaproveita esse canal em vez de inventar um segundo. A regra que impede o canal de virar spam está em 12.5.G e vale para as duas.

As demais jornadas (indicação, regra da foto do Otto) entram nas próximas versões.

## 2. Quem usa e em que situação

| Pessoa | Situação | O que isso exige |
|---|---|---|
| Dono de assistência técnica de bairro, 1 a 3 pessoas | Mão ocupada, celular no bolso, WhatsApp aberto o dia todo, nunca usou "sistema" | Celular primeiro. Uma tarefa por tela. Nada para configurar antes de ter valor |
| Gestor com equipe (ADR 012, modo Equipe) | Vários atendentes, quer ver fila e quem pegou o quê | A mesma tela, com fila. Sem virar CRM |
| Cliente final | Escreve no WhatsApp da empresa, quer resolver e ir embora | A conversa é a interface. Ele não vê nada disto |

## 3. A tensão declarada

`visao.md` diz que o escopo da v1 é pequeno de propósito: "responder bem e encaminhar bem já vale o salário". As duas decisões abaixo ampliam o produto, e por isso cada uma precisa passar num teste: **ela protege a promessa central ou acrescenta uma promessa nova?**

- **A protege.** Sem ela, o Otto responde ao fornecedor como se fosse cliente, e o dono desliga o Otto. É guarda-corpo da promessa, não promessa nova.
- **B não acrescenta tela.** A caixa de entrada já é requisito da v1 pelo ADR 012 (modos Aviso e Equipe). O que a decisão B faz é dizer **como essa tela ordena** e o que ela responde. Não é uma funcionalidade a mais; é a definição de uma que já ia existir.
- **O que Felipe descreveu como exemplo — cliente novo, prospecção, venda, já comprou — é funil comercial, e isso é promessa nova.** Fica fora da v1, com gatilho e com o desenho já pensado (seção 8).

---

## 4. Decisão A — Contatos que o Otto não atende

### 4.1 O problema da pessoa

O número comercial não recebe só cliente. Recebe o fornecedor, o contador, a esposa, o funcionário, o grupo da família que alguém adicionou. Hoje o dono resolve isso porque **ele** lê tudo. Quando o Otto entra, ele responde a todos com a mesma cara de atendente — e o dono descobre pelo fornecedor, rindo dele.

Isso não é um defeito estético. É o momento em que o dono perde a confiança e desliga o Otto. Por isso entra na v1.

### 4.2 Decisão

**Existe uma lista de contatos que o Otto não atende. Quando alguém da lista escreve, o Otto fica em silêncio, a empresa é avisada e a conversa aparece na caixa de entrada como "esperando você".**

Nome de tela: **Contatos**. Rótulo do estado no contato: **"Só você atende"**. Nunca "bloqueado", "lista negra", "ignorado" — nada é bloqueado; a mensagem chega, só quem responde muda. `[GUARDIÃO]`

A metáfora que sustenta o desenho: é dizer ao funcionário novo *"esse aqui fala comigo"*.

### 4.3 Como um contato entra na lista

Três caminhos, em ordem de uso esperado:

| Caminho | Onde | Custo | Quando acontece |
|---|---|---|---|
| **Marcado a partir da conversa** | Botão na conversa: "O Otto não atende essa pessoa" | Um toque | O principal. Reativo, depois do primeiro susto |
| **Digitado** | Contatos → adicionar número | Número + nome opcional | Quando o dono já sabe quem é antes de a pessoa escrever |
| **Automático** | As pessoas cadastradas para aviso (ADR 012, modo Aviso) entram na lista sozinhas | Zero | Sempre. Corrige um defeito real: o funcionário que recebe o aviso escreve para o número da empresa e é atendido como cliente |

Fora disso: **uma pergunta no onboarding**, opcional e pulável, uma tela, depois da configuração de encaminhamento:

> **`[GUARDIÃO]`** Tem alguém que escreve nesse número e não é cliente? Fornecedor, contador, alguém da família. O Otto não vai responder para essas pessoas.
> [campo de número, com botão "adicionar mais"] · [Pular]

Motivo de existir: marcar depois do estrago é caro; marcar antes custa 30 segundos. Motivo de ser pulável: é hipótese não verificada que o dono lembre de alguém nesse momento (ficha 9.1).

**Fora da v1: importar agenda ou planilha de contatos.** Não há demanda observada, exige arquivo ou integração, e o volume esperado por conta é de poucas pessoas, não de centenas.

### 4.4 O que o Otto faz exatamente

| Passo | Comportamento |
|---|---|
| Mensagem chega de um número da lista | O Otto **não responde nada**. Nem saudação, nem "vou chamar alguém". Silêncio total para quem escreveu |
| Registro | A conversa é criada e fica na caixa de entrada em **Esperando você**, com a marca "Só você atende" |
| Aviso | A empresa **é avisada**, no WhatsApp, com link para a conversa — em qualquer modo de encaminhamento |
| Fora do horário | Nada muda. Continua avisando. O horário de atendimento é regra para cliente, não para o fornecedor |
| Resumo do dia | Aparece como linha própria: quantas pessoas fora do atendimento escreveram hoje |

**Por que silêncio e não "recado".** Recado é o que o Otto anota depois de conversar. Aqui ele não conversou. Anotar recado de uma conversa que não existiu é inventar conteúdo, e fere o caráter (não inventa).

**Por que avisar sempre, inclusive no modo Recado.** Porque na v1 a empresa **não vê essa mensagem em lugar nenhum além do painel**: responder pelo aplicativo do WhatsApp Business no mesmo número está fora da v1 (ADR 012, regra 5). Se o Otto ficar em silêncio e o painel não for aberto, a empresa perde a mensagem do fornecedor — um dano maior que o que a lista veio evitar. O aviso é template pago da Meta, e o volume é baixo por construção: são poucos contatos.

**Para onde vai o aviso.** Ao marcar o primeiro contato, o painel pede um número, **já preenchido com o telefone do cadastro**. Nenhuma digitação no caso comum. Se a empresa já tem pessoas cadastradas para aviso (modo Aviso), usa as mesmas e não pergunta nada.

**Consequência dita na hora, sem enfeite.** A tela de confirmação da marcação diz o que vai acontecer, com o número:

> **`[GUARDIÃO]`** Pronto. O Otto não responde mais para esse número. Quando essa pessoa escrever, a mensagem aparece aqui e a gente te avisa no (11) 9xxxx-xxxx.

### 4.5 Ligar de novo

Sim, um toque, no mesmo lugar. Sem caixa de confirmação: a ação é reversível e barata, e confirmação inventada é fricção sem consequência (regra 12). O que existe é **desfazer** por alguns segundos na barra que aparece depois da marcação.

### 4.6 Grupos

**O Otto nunca atende grupo. Regra global, sem lista e sem configuração.** Um grupo nunca é um cliente escrevendo; é o grupo dos fornecedores, o da família ou o do condomínio. Mensagem de grupo entra na caixa de entrada como "Esperando você", com a marca "Grupo", e não gera aviso (volume imprevisível e custo de template). Isso não é configurável na v1; se alguma conta pedir, vira pendência.

### 4.7 Número desconhecido que diz "quero falar com o Zé"

**Não tem relação com a lista, e o produto não deve confundir os dois.** Isso é pedido de pessoa, já tratado: o Otto encaminha pelo modo configurado da empresa (ADR 012) e o classificador já grava `intencao = pedido_de_pessoa`.

**O Otto nunca coloca ninguém na lista por conta própria.** Deduzir "essa pessoa não quer ser atendida por IA" de uma frase é inferência cara e errada — quem pede o Zé hoje pode voltar amanhã perguntando o preço.

O caso legítimo é outro: **o cliente que exigiu falar só com gente**, e que a empresa decide honrar. Aí é o dono quem marca, na conversa, com um toque. É a mesma lista, o mesmo comportamento. Muda só o motivo, e o motivo importa para a análise, não para o Otto.

**Motivo, sem virar formulário.** Depois de marcar, aparece uma barra com quatro fichas de um toque, junto com o "desfazer". Ignorar é o padrão.

> **`[GUARDIÃO]`** Quem é? · Fornecedor ou parceiro · Pessoal · Da equipe · Cliente que pediu falar só com gente

### 4.8 A lógica inversa (o Otto só atende quem está numa lista)

**Rejeitada.** Motivos, em ordem de peso:

1. **Inverte a promessa.** O produto existe para atender quem chega quando ninguém pode atender. Cliente novo é, por definição, número desconhecido. Uma lista de permissão faz o Otto ficar mudo exatamente para quem a empresa mais quer.
2. **A falha é catastrófica e silenciosa.** Esquecer de adicionar alguém produz silêncio, e silêncio não gera reclamação — ninguém descobre. Falso negativo invisível por construção (`behavioral-evidence` §1, ausência).
3. **Não há demanda.** Ninguém pediu.

Há **um** uso legítimo do inverso, e ele tem outro nome: *"quero testar antes de soltar para os clientes"*. Isso é modo de teste, não lista de permissão. Fica fora da v1 (seção 8), e o problema tem resposta mais barata: deixar o dono conversar com o Otto dentro do painel antes de conectar o número.

### 4.9 Telas e estados

**Tela: Contatos**
Objetivo em uma frase: ver quem escreve para a empresa e dizer quem o Otto não atende.

| Estado | O que aparece |
|---|---|
| Carregando | Esqueleto de 3 linhas. Sem giro no meio da tela |
| Vazio (número recém-conectado) | `[GUARDIÃO]` "Ninguém escreveu ainda. O número está conectado desde as 14h." Botão: adicionar um número |
| Padrão | Lista de pessoas, mais recente no topo. Nome do perfil do WhatsApp, ou o número quando não há nome. Quem está fora do atendimento tem a marca "Só você atende" |
| Filtro | Uma ficha no topo: "Só você atende (3)". Sem menu, sem coluna |
| Erro | `[GUARDIÃO]` "Não consegui carregar. Tenta de novo." Botão: tentar de novo |

**Tela: Contato (uma pessoa)**
Objetivo: ver o histórico dessa pessoa com a empresa e ligar ou desligar o atendimento.

Conteúdo: nome, número, quando escreveu pela primeira vez, quantas conversas, últimas conversas em lista. Uma chave: **"O Otto atende essa pessoa"**, ligada por padrão. Motivo abaixo, quando houver.

Acessibilidade: a chave é um controle com rótulo, alcançável por teclado, com estado anunciado; a marca "Só você atende" nunca é só cor.

**Ação na conversa**
Um item no menu da conversa: "O Otto não atende essa pessoa". Depois do toque: barra de desfazer com as quatro fichas de motivo, por 8 segundos, e a frase de consequência da seção 4.4.

---

## 5. Decisão B — Como a empresa organiza as conversas

### 5.1 A pergunta que o dono já tem

Antes de escolher taxonomia, é preciso saber que pergunta ela responde. O dono de assistência técnica de bairro, às 19h, tem estas:

1. **"Ficou alguém sem resposta hoje?"** — tem essa pergunta todo dia, hoje, sem o Otto.
2. **"O que é comigo?"** — o que o Otto não resolveu e está esperando ele.
3. "Sobre o que os clientes mais perguntam?" — tem essa pergunta, mas com menos urgência.
4. "Em que pé está o conserto do celular do fulano?" — tem essa pergunta, e ela é **sobre o aparelho, não sobre a conversa**. O produto não tem esse dado e não deve fingir que tem.

**Organizar por organizar não vale.** A forma escolhida precisa responder a 1 e a 2 sem nenhum trabalho de configuração.

### 5.2 Decisão

**A organização principal é uma fila por situação, atribuída pelo Otto, sobre uma lista de pessoas. Quatro situações, fechadas, que a empresa não cria nem renomeia. A empresa muda a situação de uma conversa com um toque.**

| Situação | O que significa | Quem coloca | Ordem |
|---|---|---|---|
| **Esperando você** | O Otto encaminhou e ninguém assumiu; ou o prazo esgotou e virou recado; ou escreveu alguém de "só você atende"; ou é grupo | Otto | Mais antiga primeiro. Quem espera há mais tempo é a dívida maior |
| **Com você** / **Com [nome]** | Alguém da empresa assumiu e está respondendo. O Otto parou naquela conversa (ADR 012, regra 4) | Quem assumiu | Mais recente primeiro |
| **Com o Otto** | O Otto está atendendo. Nada a fazer | Otto | Mais recente primeiro |
| **Resolvida** | Encerrada, nada pendente. Recado retornado entra aqui | Otto, ou a empresa com um toque | Só as de hoje |

Essa é a mesma caixa de entrada que o ADR 012 já exige, servindo aos três modos: no modo Recado, "Esperando você" é a lista de recados; no modo Aviso, é o que ninguém assumiu; no modo Equipe, é a fila.

**Se o cliente escreve de novo numa conversa marcada Resolvida, ela volta sozinha para "Com o Otto".** O dono nunca precisa desfazer.

### 5.3 Por que as outras perdem

| Forma | Por que perde |
|---|---|
| **Etiquetas livres** | Custo de decisão alto: campo em branco obriga o dono a inventar uma taxonomia. Ele nunca usou sistema. O Otto não consegue classificar num conjunto aberto que ainda não existe. Em 30 dias vira "urgente", "urgente2", "ver". Só entra se a etapa do negócio (seção 8) fracassar |
| **Quadro kanban** | Arrastar cartão no celular com a mão ocupada é o gesto mais caro do produto. Exige desenhar colunas antes de ter valor. Com 300 conversas é ilegível na tela de um celular. E o pior: **quadro que ninguém arrasta mente**, e um painel que mente é pior que painel nenhum |
| **Categorias fixas de assunto** (preço, garantia, agendamento) | Não respondem "o que é comigo?". Servem para leitura, não para trabalho. Entram — mas como **leitura no resumo do dia**, não como pasta (seção 5.6) |
| **Etapa comercial** (cliente novo, prospecção, venda, já comprou) | É sequência real, e o Felipe está certo de que é sequência e não rótulo solto. Mas é **do negócio, não da conversa**: em assistência técnica a sequência é orçamento → aprovado → em conserto → pronto → entregue, que não se parece com funil de venda. Cada segmento tem a sua. Fica para depois, com desenho pronto (seção 8) |

### 5.4 Quem classifica

**O Otto classifica, sempre. A empresa corrige com um toque, e a correção é sinal.**

- Nenhuma conversa chega ao dono sem situação. Fila que exige triagem manual está vazia de valor no primeiro dia e morta na segunda semana.
- O classificador (Haiku) já roda em cada mensagem (`dados.md`, evento 6). A situação, porém, **não depende de classificação de texto**: sai do estado que já existe (`encaminhamento.solicitado`, `quem_assumiu`, `recado_registrado`, contato fora do atendimento). É regra, não modelo — logo, é barata e não erra por criatividade.
- As duas correções manuais possíveis: **"resolvi isso"** (vai para Resolvida — é o mesmo toque que hoje marca o recado como retornado) e **"isso é comigo"** (vai para Esperando você).
- **A empresa não cria situação nova e não renomeia as quatro.** Motivo: qualquer superfície de criação é configuração que o dono não faz na primeira semana, e etapa criada e não mantida faz o painel mentir.

### 5.5 Com 3 conversas e com 300

| | 3 conversas | 300 conversas |
|---|---|---|
| Topo da tela | Uma linha: "1 esperando você" | A mesma linha, mais fichas de filtro com contagem: Esperando você (7) · Com você (2) · Com o Otto (31) |
| Lista | Três linhas. Sem filtro, sem busca, sem contador de zero | A mesma lista, mesma ordem. Nunca vira tabela |
| Resolvidas | Aparecem no fim | **Só as de hoje.** Ao virar o dia, saem da lista |
| Histórico | Não existe ainda | Mora **na pessoa**, não no feed. Chega-se por busca (nome ou número) ou pela tela de Contatos |
| Busca | Não aparece | Aparece a partir de um volume medido, não de um palpite |

A regra que impede o muro: **a lista principal nunca carrega mais de um dia de conversas resolvidas.** O feed é o trabalho de hoje; a memória é da pessoa. Isso também é o que a Meta não tem (`pesquisa-2026-09.md`: "sem memória da relação").

### 5.6 O valor na primeira semana

Dia 1, sem configurar nada, a primeira linha do painel responde a pergunta que o dono já tinha: **quem ficou esperando ele.** Um número, não uma sensação.

Isso não é uma funcionalidade separada do resumo do dia: **é a metade de cima da mesma tela.** O resumo diz o que aconteceu; a fila diz o que falta. É a tentativa mais direta de fazer o painel valer a abertura diária — e vale dizer com honestidade que **isso não resolve a hipótese crítica de `dados.md`** ("o empregador abre o resumo em 4 de 7 dias"). Sem mensagem chegando, o hábito depende de lembrança. A fila aumenta o valor de abrir; não cria o gatilho. O gatilho segue pendente (pendência 13 de `dados.md`).

O que **não** entra como valor: assunto vira **uma leitura** no resumo do dia ("hoje 4 pessoas perguntaram preço"), usando o `assunto` que o classificador já grava. Zero configuração, zero manutenção, e alimenta a base de conhecimento. Não é pasta, não é filtro, não é etiqueta.

### 5.7 Telas e estados

**Tela: Início (painel)**
Objetivo: em 5 segundos, saber se ficou alguém sem resposta hoje.

Metade de cima: a linha da fila mais o botão. Metade de baixo: resumo do dia com a pergunta de um toque. Uma rolagem, sem abas.

| Estado | O que aparece |
|---|---|
| Carregando | Esqueleto das duas metades |
| Vazio (dia sem conversa) | `[GUARDIÃO]` "Ninguém escreveu hoje. O Otto está de plantão desde as 8h." Nunca ilustração, nunca consolo |
| Nada esperando | `[GUARDIÃO]` "Nada esperando você. O Otto atendeu 12 pessoas hoje." |
| Padrão | `[GUARDIÃO]` "3 pessoas esperando você" · botão "Ver" |
| Erro | `[GUARDIÃO]` "Não consegui carregar agora. Tenta de novo." |

**Tela: Conversas (caixa de entrada)**
Objetivo: pegar o que é da empresa e devolver o resto ao Otto.

Linha da lista: nome da pessoa, última mensagem em uma linha, há quanto tempo espera, e a marca da situação. Marca é palavra mais forma, nunca só cor.

| Estado | O que aparece |
|---|---|
| Carregando | Esqueleto de 5 linhas |
| Vazio | `[GUARDIÃO]` "Nenhuma conversa ainda. O número está conectado desde as 14h." |
| Vazio com filtro | `[GUARDIÃO]` "Nada esperando você agora." Zero é informação; sem consolo |
| Padrão | Lista por situação, na ordem da seção 5.2 |
| Erro | Frase com o que fazer, botão de tentar de novo. O que foi digitado não se perde |

**Tela: Conversa**
Objetivo: ler o que aconteceu e responder, ou devolver ao Otto.

Ações, nesta ordem de peso: **Assumir** (some depois que alguém assume) · escrever · **Devolver ao Otto** · **Marcar resolvida** · menu: "O Otto não atende essa pessoa".

| Estado | O que aparece |
|---|---|
| Carregando | Esqueleto da conversa, campo de escrita já habilitado |
| Com o Otto | Aviso de uma linha: `[GUARDIÃO]` "O Otto está atendendo. Se você escrever, ele para." |
| Assumida por outra pessoa (modo Equipe) | `[GUARDIÃO]` "A Ana assumiu às 14h12." Campo de escrita desabilitado, com o motivo escrito, e ação "assumir mesmo assim" |
| Só você atende | `[GUARDIÃO]` "O Otto não atende essa pessoa. Nada foi respondido." |
| Enviando | Mensagem aparece na hora, com marca de enviando. Falha vira "não enviou · tentar de novo", sem apagar o texto |
| Erro de envio | Texto preservado, sempre |

---

## 6. Mapa de telas tocado por estas decisões

| Tela | Propósito em uma frase | Situação nova? | Decisão |
|---|---|---|---|
| Início (painel) | Saber, em 5 segundos, se ficou alguém sem resposta hoje | Ganha a linha da fila e o bloco "o que o Otto não soube" | A, B, C |
| Conversas | Pegar o que é da empresa e devolver o resto ao Otto | Já exigida pelo ADR 012; ganha a ordem por situação | B |
| Conversa | Ler o que aconteceu e responder, ou devolver ao Otto | Ganha "marcar resolvida", "o Otto não atende essa pessoa" e a barra "guardar essa resposta" | A, B, C |
| Contatos | Ver quem escreve para a empresa e dizer quem o Otto não atende | Nova | A |
| Contato | Ver o histórico de uma pessoa e ligar ou desligar o atendimento dela | Nova | A |
| Onboarding, passo "quem não é cliente" | Semear a lista antes do primeiro susto | Nova, pulável | A |
| **Onboarding, passo "confere se acertei"** | Conferir, com um toque cada, as respostas que o Otto já montou sozinho | Nova, com saída a qualquer momento | C |
| **Conversar com o Otto** | Perguntar ao Otto como se fosse cliente, ver o que ele sabe e corrigir na própria resposta | Nova | C |
| **O que o Otto sabe** | Ver, corrigir e apagar o que foi ensinado, e mandar material | Nova | C |
| **Créditos** | Saber quantos créditos sobram no mês, conferir linha por linha o que o Otto fez, e o que fazer quando estiverem acabando | Nova. **Era "Atendimentos"; renomeada em 14.6** | D, E |
| **Extrato** (metade de baixo de Créditos) | Conferir cada ação do Otto: quem, quando, o que foi e quanto contou | Nova | E |
| **Comparar os dois caminhos** | Decidir entre comprar mais 100 créditos e passar de faixa, com os dois números na frente | Nova, dentro de Créditos. **Era "Comparar: pacote × faixa"**; "pacote" nunca nomeia a coisa (`identidade.md`) | D |
| **Escolher a faixa** | Escolher quanto trabalho do Otto por mês, sabendo o que 500 créditos compram | Já existia no cadastro; **ganha a definição de crédito e a linha condicional do cargo** | E |
| **Ligar um cargo** (v1.1, não existe na v1) | Ver quanto cada ação daquele cargo conta **antes** de ligar | Nova, e é a regra 8 do ADR 024 virando tela | E |
| **Configurações → o Otto falando com você** | Ligar e desligar as mensagens que o Otto manda ao dono | Nova, dentro de uma tela que já existe | C, D |
| **Bloco da preparação** (temporário, no Início) | Saber quando é a conversa com a gente e o que já foi feito | Nova, some depois da primeira semana | ADR 025, seção 15 |

Duas superfícies não são tela e mesmo assim precisam de desenho, porque a pessoa lê texto nelas: **a mensagem do Otto no WhatsApp do dono** (12.5.G, usada por C e por D) e **a mensagem mínima ao cliente final quando os créditos acabam** (13.4).

Contas da decisão C: **duas telas novas, três barras de um toque** dentro de telas que já existiam e **uma mensagem no WhatsApp do dono**. Contas da decisão D: **duas telas novas** (uma dentro da outra), **um bloco** no Início e **duas mensagens**. Contas da decisão E: **zero telas novas na v1** — o extrato é a metade de baixo de uma tela que a decisão D já tinha criado, e a tela de escolher a faixa já existia; o que entra são **duas linhas de texto** e **um bloco temporário**. A tela de ligar cargo é v1.1. Detalhe em 12.5, 13.5, 14.3 e 15.3.

Nenhuma dessas telas exige integração (ADR 006). Nenhuma pede dado que a empresa não tenha na cabeça.

## 7. Jornadas

### 7.1 O fornecedor escreve (a jornada que a decisão A existe para consertar)

| Passo | Sem a lista | Com a lista |
|---|---|---|
| Fornecedor manda "chegou a peça" | O Otto responde como atendente | O Otto fica calado |
| A empresa fica sabendo | Pelo fornecedor, rindo | Aviso no WhatsApp com link, na hora |
| O dono responde | Precisa desligar o Otto ou pedir desculpa | Abre a conversa e responde |
| Da próxima vez | O mesmo | O contato já está marcado |

Ponto de desistência: **o primeiro susto acontece antes de o dono conhecer a lista.** É por isso que existe o passo do onboarding e é por isso que a marcação está dentro da conversa, no momento em que ele descobre o problema — custo de desvio zero (`behavioral-evidence` §4).

### 7.2 O dia a dia (a jornada que a decisão B existe para servir)

19h, celular na mão, entre um conserto e outro. Abre o painel. Lê uma linha: "3 pessoas esperando você". Toca. Vê três nomes com o tempo de espera. Responde duas, marca uma como resolvida. Fecha. Menos de dois minutos.

Ponto de desistência: **abrir o painel.** Hipótese crítica, não verificada, e a fila não a resolve (seção 5.6).

### 7.3 Recado retornado

O dono liga para o cliente pelo telefone dele, resolve, e volta ao painel para marcar. **Esse segundo passo é o frágil**: o valor já foi obtido antes dele. Por isso a marcação está em três lugares (fila, resumo do dia e conversa), sempre com um toque, e nunca com formulário. Ficha em `dados.md`, seção 9.

## 8. O que fica fora da v1

| Fora | Por quê | O que faria entrar |
|---|---|---|
| **Etapa do negócio** (o exemplo do Felipe: cliente novo, prospecção, venda, já comprou) | É promessa nova, é diferente por segmento, e exige o dono manter. Sem evidência de que ele mantém | Cinco contas pedirem (mesma regra do ADR 006), **ou** a fase 0 mostrar que o dono já mantém isso hoje em caderno ou planilha (a pergunta já está no registro de campo: `gerencia_em_caderno_planilha`). **A evidência para construir isto já está sendo coletada** |
| **Etiquetas livres** | Custo de decisão alto, o Otto não classifica em conjunto aberto, degenera em 30 dias | Só se a etapa do negócio for entregue e fracassar |
| **Kanban** | Arrastar no celular com a mão ocupada; ilegível com 300; quadro não mantido mente | Nada previsto. Se a etapa do negócio entrar, ela é lista, não quadro |
| **Importar contatos** (agenda, planilha, CSV) | Sem demanda; volume esperado por conta é de poucas pessoas | Uma conta com mais de 20 contatos fora do atendimento |
| **Lista de permissão** ("o Otto só atende quem eu autorizar") | Inverte a promessa; falha silenciosa e invisível | Nada. Rejeitada, não adiada |
| **Modo de teste** ("o Otto só atende os meus números enquanto eu testo") | É o único uso legítimo do inverso, mas tem resposta mais barata: conversar com o Otto dentro do painel antes de conectar o número | Três das dez primeiras contas pedirem para testar antes de soltar |
| **Anotação livre no contato** ("esse pede desconto sempre") | É a primeira porta do CRM que o dono não pediu. A memória deve vir do histórico da conversa, que já existe | Nada previsto |
| **Estilo diferente por contato** | Não foi pedido; multiplica teste de caráter por conta | Nada previsto |
| **Um modo de encaminhamento por situação** | ADR 012 já fixou um modo por empresa na v1 | O gatilho do próprio ADR 012 |
| **Modo de teste** (linha acima) | — | **Parcialmente resolvido pela decisão C:** "Conversar com o Otto" (12.5) é exatamente a resposta barata que esta linha previa. O que continua fora é o Otto atendendo só uma lista de números com o número já conectado |

O que a **decisão C** deixa fora da v1 está em 12.7, o que a **decisão D** deixa fora está em 13.7 e o que a **decisão E** deixa fora está em 14.7, na mesma forma desta tabela.

### 8.1 Como a etapa do negócio deve ser desenhada quando entrar

Registrado agora para a decisão futura não recomeçar do zero, e para deixar claro que "fora da v1" não é "não":

1. A empresa **não desenha colunas**. Ela responde uma pergunta em texto livre — "por que fases passa um cliente aqui?" — e o Otto propõe de 3 a 5 etapas, para aceitar ou ajustar. Mesmo princípio do ADR 007: descrever o negócio, não escolher em lista.
2. **O Otto move a etapa sozinho**, lendo a conversa. O dono nunca arrasta. Ele corrige com um toque, e a correção é sinal.
3. A etapa mora **na pessoa**, não na conversa. É o cliente que está em "aguardando peça", não a conversa.
4. É **lista com filtro**, não quadro.
5. Só entra com o gatilho da tabela acima. Etapa que o Otto não consegue mover sozinho não entra.

## 9. Fichas comportamentais

Nenhuma afirmação abaixo sustenta escopo caro. As duas decisões desta versão são baratas de desfazer de propósito: A é uma marca por contato e uma regra de silêncio; B é a ordenação de uma tela que o ADR 012 já exigia. Etapa e kanban, que seriam caros, ficaram fora — exatamente porque a evidência não os sustenta.

| # | Afirmação | Onde sustenta | Tipo | Evidência hoje | Comparável | Taxa mínima | Como se mede | O que a mata | Grau |
|---|---|---|---|---|---|---|---|---|---|
| 9.1 | O número comercial do nicho recebe mensagem de quem não é cliente com frequência que incomoda | Toda a decisão A | Taxa | Nenhuma. É a primeira coisa a conferir e **não custa código**: cabe numa pergunta das 10 conversas de campo | Sem análogo conferido. Não inventar magnitude | 6 em 10 donos citam pelo menos uma pessoa concreta | Pergunta nova no registro de campo (6.1 de `dados.md`): "quem escreve nesse número e não é cliente?" | Menos de 4 em 10 citam alguém → sobra só a regra automática (grupos e pessoas de aviso); a tela de Contatos sai da v1 | NÃO VERIFICADO |
| 9.2 | O dono marca pelo menos um contato como "só você atende" nos primeiros 30 dias | Tela de Contatos, passo do onboarding | Taxa | Nenhuma | Direção robusta: gesto acoplado à conversa em que ele descobre o problema supera ir a uma tela de configuração. Magnitude local | 3 das 10 primeiras contas | `configuracao.alterada` com `campo = atendimento_do_contato`, contas distintas, em 30 dias | Zero ou uma conta em 30 dias → a lista é solução sem problema neste volume; fica só o automático | NÃO VERIFICADO |
| 9.3 | O Otto responder a quem não é cliente derruba a confiança do dono no produto | Prioridade de A dentro da v1 | Atribuição | Nenhuma. **É atribuição: não se pergunta o porquê, mede-se a incidência** (§9 da skill) | Não se aplica | Incidência, não taxa | `suporte.pedido_registrado`, categoria nova `otto_respondeu_quem_nao_devia`; e `assinatura.situacao_alterada.motivo_declarado` lido como relato, nunca como causa | Se nas 30 primeiras contas nenhuma reclamar disso e a 9.1 também falhar, A perde a prioridade | NÃO VERIFICADO |
| 9.4 | A empresa cadastrada para aviso escrevendo ao número comercial e sendo atendida como cliente é um caso real | Regra automática de 4.3 | Capacidade | Nenhuma; é mecânica: a pessoa tem o número e o WhatsApp aberto | Direção robusta. Magnitude irrelevante: a correção custa zero | Não é taxa; é regra | `conversa.iniciada` com `cliente_hash` igual ao de uma pessoa cadastrada para aviso | Nada. Mesmo com incidência zero, a regra custa uma linha | INFERIDO |
| 9.5 | O dono entende "Esperando você" sem explicação | Nome das quatro situações | Capacidade | Nenhuma. **É o tipo mais barato de testar e o menos testado** | Não se aplica | 5 de 5 pessoas do nicho leem a tela e dizem o que fariam | Sessão de 10 minutos com o celular, com a tela em papel ou protótipo, antes de escrever código | Alguém confundir "Esperando você" com "esperando o cliente" → renomear antes de construir | NÃO VERIFICADO |
| 9.6 | O dono não corrige a situação que o Otto atribuiu | Decisão de o Otto classificar sozinho (5.4) | Taxa | Nenhuma | Direção robusta: situação derivada de estado, não de texto, erra menos que classificação de conteúdo | Menos de 1 correção a cada 10 conversas | `conversa.marcada` (manual) sobre conversas com encaminhamento, por conta | Mais de 3 em 10 corrigidas → as quatro situações estão erradas; refazer o conjunto antes de pensar em etapa | NÃO VERIFICADO |
| 9.7 | A fila na primeira linha do painel aumenta a abertura diária | Seção 5.6; a hipótese crítica de `dados.md` | Sequência / hábito. **Sem gatilho externo** | Nenhuma | Direção robusta: gesto sem mensagem chegando tem taxa menor que com. A fila muda o valor de abrir, não o gatilho | Herda o limiar de `dados.md`: 4 aberturas em 7 dias, em metade das contas | `resumo.aberto` na segunda semana após `conta.ativada` | O limiar de `dados.md`, pendência 13. **Se falhar, a causa não é a fila: é a falta de gatilho.** Não trocar a tela antes de testar o aviso | NÃO VERIFICADO |
| 9.8 | O dono quer organizar conversas por etapa do negócio | Decisão de deixar etapa fora da v1 | Ausência (ele não pede o que não sabe que existe) | Nenhuma. **Canal passivo não mede.** Precisa de provocação | Comportamento existente é a melhor fonte: o que ele mantém hoje à mão em caderno ou planilha | 5 contas pedindo, ou 5 em 10 do campo já mantendo algo assim | `gerencia_em_caderno_planilha` no registro de campo (já existe) e `suporte.pedido_registrado` com categoria nova | Se 5 em 10 do campo já mantêm etapas por cliente à mão, a hipótese sobe de grau e etapa entra antes | NÃO VERIFICADO |

## 10. Eventos — proposta ao analista de produto

`dados.md` tem 19 eventos e teto de 20, com a regra de que evento novo só entra fundindo ou retirando outro. Estas duas decisões cabem **sem gastar o teto**: zero eventos novos, um evento renomeado que absorve um caso, e cinco campos em eventos existentes.

### 10.1 Renomear e absorver

| Hoje | Proposta |
|---|---|
| `recado.retornado` (evento 20) | **`conversa.marcada`**: toda mudança de situação feita **à mão** pelo empregador. `recado.retornado` passa a ser o caso `para_situacao = resolvida` com `recado_id` não nulo, e M4 continua calculável sem mudança de leitura |

Payload proposto: `conversa_id uuid`; `de_situacao enum(esperando_voce, com_voce, com_o_otto, resolvida)`; `para_situacao enum(idem)`; `recado_id uuid?`; `origem_do_recado enum(modo_recado, fora_do_horario, prazo_esgotado)?`; `horas_na_situacao numeric(6,1)`; `marcado_por enum(painel, resumo_do_dia, conversa)`; `dias_desde_criacao int`. Idempotência: `id_submissao uuid`.

Responde: 9.6 (o Otto acerta a situação?), M4 no modo Recado (sem mudança), e onde a marcação acontece.

### 10.2 Campos novos em eventos existentes

| Evento | Campo | Para quê |
|---|---|---|
| `configuracao.alterada` (12) | `grupo` ganha `contatos`; `campo` ganha `atendimento_do_contato`; `de`/`para` = `atende` / `nao_atende`; **`motivo enum(fornecedor_ou_parceiro, pessoal, equipe, cliente_pediu_so_gente, outro)?`** e **`origem enum(conversa, cadastro_manual, onboarding, pessoa_para_aviso)?`** (nulos fora deste campo) | Ficha 9.2 e a distribuição de motivos, que diz se o caso "cliente que pediu só gente" merece comportamento próprio |
| `conversa.iniciada` (4) | **`atendimento_desligado bool`** e **`motivo_sem_atendimento enum(contato_fora_do_atendimento, grupo)?`** e **`aviso_enviado bool`** | Contar as conversas em que o Otto ficou calado de propósito, separar contato de grupo, e contar o template pago (entra em M7) |
| `conversa.encerrada` (8) | `desfecho` ganha **`nao_atendida`**; e **`situacao_final enum(esperando_voce, com_voce, com_o_otto, resolvida)`** | Impedir que conversa não atendida entre em M1 e M2 como "sem resposta" e distorça a qualidade do Otto. **Sem isso, as duas métricas centrais ficam erradas** |
| `conta.ativada` (3) | **`contatos_fora_do_atendimento int`** | Quantas contas semeiam a lista no onboarding, e se o passo pulável vale a tela |
| `resumo.aberto` (14) | `acao_seguinte` ganha **`marcou_conversa`** e **`marcou_contato`** | Se a marcação de um toque acontece pelo resumo, como a ficha do modo Recado espera |
| `suporte.pedido_registrado` (19) | `categoria` ganha **`otto_respondeu_quem_nao_devia`** e **`pedido_de_etapas`** | Fichas 9.3 e 9.8; o gatilho das cinco contas |

### 10.3 Uma pergunta nova no registro de campo (fase 0, sem código)

Coluna `escreve_e_nao_e_cliente` (texto literal): *"quem escreve nesse número e não é cliente?"*. É a evidência da ficha 9.1, custa uma linha na conversa que já vai acontecer, e pode tirar a tela de Contatos da v1 antes de alguém escrever código.

## 11. Perguntas para o Felipe

1. **A lista de contatos entra na v1?** A recomendação é sim, mas ela depende da ficha 9.1, que pode ser respondida nas 10 conversas de campo antes de qualquer código. Se ele quiser esperar, a v1 fica só com as duas regras automáticas (grupos e pessoas cadastradas para aviso), que custam uma linha cada.
2. **O aviso para contato fora do atendimento vale o template pago da Meta, inclusive no modo Recado?** A recomendação é sim: sem ele, a empresa pode perder a mensagem do fornecedor, porque responder pelo aplicativo do WhatsApp Business não está na v1.
3. **Confirma deixar a etapa do negócio fora da v1**, com o gatilho das cinco contas e a evidência já sendo coletada na fase 0?

---

## 12. Decisão C — Como a empresa ensina o Otto

Proposta de 2026-09-09. Pedido do Felipe: *"é preciso criar um fluxo onde o cliente consiga ensinar o Otto sobre sua empresa. Seja com upload de documentos, ou explicando para ele sobre. Talvez criar uma documentação explicando para o cliente a melhor forma de fazer isso, ou até um formulário a ser preenchido, veja o que fica melhor."*

"Cliente" aqui é o **empregador**. Nada nesta seção é visto pelo cliente final.

**Texto fechado pelo guardião da marca em 2026-09-09.** Todos os rascunhos marcados `[GUARDIÃO]` foram revistos: nenhum bloqueio, seis ajustes de redação (marcados no lugar) e cinco termos novos no vocabulário de `docs/marca/identidade.md`. A voz do Otto falando com o empregador virou regra em `docs/marca/voz-e-tom.md` §1.1.

> **Revisão de 2026-09-09, pedida pelo Felipe: 12.5.A foi reescrita.** O passo "confere se acertei" passou a ter duas rodadas — afirmações em lote para o escopo, par pergunta-e-resposta para os números — e encolheu de 12 telas para 8. O parecer completo, o que foi substituído e as fichas novas estão em **12.13**. **12.5.B a 12.5.G não mudaram.** As frases novas passaram pelo guardião em 2026-09-09 (tarde) e estão marcadas `[GUARDIÃO]` no lugar, com o ajuste ao lado.
>
> **Segunda rodada no mesmo dia, com o treinador-do-otto:** a tabela de preço (`lista`) entra na rodada 2 como última tela, sem campo obrigatório (12.13.11), e a geração alimenta a rodada 2 onde não existe arquivo de nicho, com uma oração e uma lacuna por item (12.13.12).
>
> **Terceira rodada, com o guardião da marca, 2026-09-09 (tarde): o texto novo está fechado.** Nenhum bloqueio. **Sete ajustes**, todos aplicados no lugar e marcados `[GUARDIÃO]`: a atribuição de quem fala em A.0 (e "me conta" no lugar de "me diga"), a abertura da rodada 1, a abertura da rodada 2 ("6 perguntas: preço, prazo e garantia" no lugar de "sobraram 6 perguntas de preço"), o botão [Conto de novo] no lugar de [Me conta], o exemplo na repergunta de A.0, "um cliente" no lugar de "alguém" no aviso de linhas em branco, e o número de volta no fim ("agora eu sei 12 respostas"). **Um termo novo no vocabulário** de `identidade.md`: "afirmação" é palavra interna e não aparece em tela. **Uma decisão pedida e tomada:** afirmação gerada por modelo **não** ganha marca de procedência, e a razão está em 12.13.12.

### 12.1 O problema da pessoa

O dono da assistência técnica não quer "alimentar uma base de conhecimento". Ele quer que o Otto **saiba quanto custa trocar a tela do iPhone 11**, porque essa pergunta chega oito vezes por semana e ele responde as oito.

Ele tem esse conhecimento inteiro na cabeça e **nenhuma parte dele escrita**. Não existe PDF de política de garantia, não existe manual, não existe tabela em arquivo. Existe, no máximo, um caderno, uma folha colada na bancada e o histórico do WhatsApp dele. Ele nunca precisou escrever isso, porque quem precisava saber era ele.

Então o pedido "ensine o Otto sobre a sua empresa" chega para ele como uma tarefa de **redação**, feita numa hora em que ele está com um celular aberto na bancada e a mão no aparelho de alguém. Redação sobre um assunto que ele domina mas nunca organizou, sem saber quanto é suficiente, sem retorno imediato, e no meio de um onboarding que ele quer terminar.

**É por isso que esta é a hipótese mais frágil do projeto.** `visao.md` registra "o empregador alimenta a base de conhecimento na primeira semana" como `NÃO VERIFICADO`, e `integracoes.md` §3 diz, com todas as letras, que ela é a que mais ameaça a ativação — e já aponta a direção: *"trocar 'preencha esta base' por 'confere se acertei'"*. Esta seção é a execução dessa frase.

**A pergunta de desenho não é "qual é a melhor tela para o dono escrever a base".** É: *como o Otto fica sabendo o que precisa saber, gastando o mínimo possível do dia do dono?*

### 12.2 Decisão

**O caminho principal é conferir, não escrever. O Otto chega com as respostas prontas e o gesto do dono é um toque: "tá certo" ou "não é bem assim". E quando o Otto não sabe, o buraco vira uma proposta de resposta no lugar onde o dono já está — não uma tarefa para depois.**

Cinco regras que decorrem disso.

**1. O Otto atende antes de aprender.** Nenhuma configuração de conhecimento é obrigatória para o Otto começar. Detalhe em 12.3.

**2. Tudo o que se ensina tem a forma de uma resposta a uma pergunta de cliente.** Não há campo "políticas", "sobre a empresa", "informações gerais". *"A gente não trabalha com desconto"* é a resposta a *"vocês dão desconto?"*. Um formato só, e é o formato em que o dono já pensa e já escreve todo dia. O que não cabe nessa forma não é ensino, é configuração (horário, encaminhamento, contatos) e já tem tela.

> **Reinterpretada em 2026-09-09, não revista (12.13.1).** A regra 2 é sobre **como o conhecimento é guardado**, não sobre a moldura em que ele é conferido. O que fica guardado continua sendo um fato que responde a uma pergunta de cliente — é o `texto` do item, e `conversa.md` §2.2 já recusa guardar o par pergunta-e-resposta. O que muda é que **conferir pode ter duas molduras**: a afirmação (*"você faz troca de tela de iPhone"* · [Sim] · [Não]) e o par (*"um cliente pergunta X / eu respondo Y"*). As duas produzem o mesmo item. A regra 2 continua inteira.

**3. Ensinar é subproduto de responder.** O gesto principal do produto não é "ir na tela de ensinar". É: o dono responde a um cliente encaminhado, e aparece uma barra de um toque — *guardar essa resposta?*. Custo de desvio zero (`behavioral-evidence` §4): ele acabou de digitar exatamente o texto que o Otto precisa.

**4. A proposta vem do que já existe, nesta ordem de custo.** O dono nunca vê campo em branco no onboarding:

| Fonte | O que dá | Custo | Precisa de quê |
|---|---|---|---|
| **Base do nicho** (ADR 007: "Otto pré-configurado mira um nicho por vez") | As 10 a 15 perguntas que toda assistência técnica de bairro recebe, já escritas, com os números em branco | Zero por conta. Escrita uma vez pela operação | Nicho classificado (já existe: `empresas.segmento`) |
| **Descrição do negócio** em texto livre | O que a empresa faz, com as palavras dela | Zero. **O dono já escreve isso no cadastro** (ADR 007, `dados.md`) | Nada |
| **Perfil do WhatsApp Business** | Endereço, horário, descrição, site | Zero | A conexão do número |
| **Catálogo da Meta** | Produtos e preços já cadastrados | Zero | Ter catálogo (poucos têm) |
| **Perfil da Empresa no Google** | Endereço, horário, telefone | Baixo | O dono achar a empresa numa busca |
| **Uma semana atendendo** | As perguntas **reais** dos clientes dele, com a resposta que ele deu | Zero | Só o tempo passar |

**5. Duas formas de conhecimento, e o dono só percebe uma.** Por dentro: o que o Otto sabe **de cor** entra no prefixo cacheado por empresa (ADR 004), e ali cabe pouco — cada palavra custa em toda conversa daquela empresa. O que ele **consulta** fica fora do prefixo e é buscado quando a mensagem pede (medida 2 de `cobranca.md`) — **e essa segunda camada só existe depois do gatilho de recuperação de `conversa.md` §3.3; na v1 tudo é de cor**. Por fora, o dono não escolhe camada: ele ensina, e o Otto decide onde colocar. A distinção só aparece em dois momentos — quando o de cor enche, e na tela "O que o Otto sabe", onde os de cor ficam no topo. Detalhe e orçamento em 12.9.

#### Como isso se chama para o empregador

**Aprovado pelo guardião da marca em 2026-09-09.** Os cinco termos viraram regra em `docs/marca/identidade.md`, seção "Vocabulário". "Base de conhecimento" é termo interno e não aparece em tela nenhuma.

| Interno | Para o empregador |
|---|---|
| Base de conhecimento | **O que o Otto sabe** |
| Item da base | **Resposta** ("o Otto sabe 14 respostas") |
| Alimentar / treinar | **Ensinar** ("ensinar o Otto") |
| Documento / upload | **Material** ("manda o material que você tiver") |
| Prefixo cacheado / no prompt | **De cor** ("o Otto sabe 60 respostas de cor") |
| Retrieval, embedding, chunk | Não existe. O dono nunca vê essas palavras nem o efeito delas |

Verbo escolhido: **ensinar**. Casa com a metáfora que já sustenta a decisão A ("é dizer ao funcionário novo *esse aqui fala comigo*") e com "Otto é pessoa na frase" (`voz-e-tom.md`, princípio 8). "Treinar" foi descartado: é jargão de IA e sugere sessão longa. **O guardião confirma o descarte** e acrescenta um segundo motivo: "treinar o Otto" sugere que o Otto de uma empresa fica melhor que o de outra, e isso é a mesma mentira que o ADR 004 proíbe nos nomes de faixa. O Otto é o mesmo em toda empresa; o que muda é o que ele sabe do negócio.

**Uma fronteira, porque "resposta" tem dois usos.** Na tela "O que o Otto sabe", *resposta* é o que ele sabe responder ("o Otto sabe 14 respostas"). Na conversa, *resposta* é a mensagem que ele mandou. Onde os dois aparecerem juntos, o contador usa a forma completa — "o Otto sabe 14 respostas" — e nunca "14 respostas" solto. Mesma disciplina de conversa × crédito (13.3).

### 12.3 O estado "recém-contratado": o Otto atende antes de o dono ensinar

**Sim, e isso é requisito, não concessão.**

O argumento é direto: se o Otto só começa a atender depois de a base estar pronta, a ativação do produto inteiro fica pendurada na hipótese mais frágil que existe no projeto. Basta o dono cansar no meio da terceira pergunta e a conta nunca ativa — e ninguém descobre por quê, porque abandono no meio de configuração não gera reclamação (`behavioral-evidence` §1, ausência).

Invertendo: o Otto atende no dia 1, e **o que ele não sabe é o que produz a lista de aprendizado**. Em vez de o dono adivinhar o que o Otto precisa saber, quem descobre isso é o cliente final, de graça, na primeira semana.

**O que o Otto faz nesse estado, exatamente:**

| Situação | Comportamento |
|---|---|
| Pergunta coberta pelo perfil, pelo catálogo, pela descrição do negócio ou pela base do nicho | Responde normalmente |
| Qualquer outra coisa | Diz que não tem essa informação e encaminha pelo modo configurado (ADR 012). É o texto fixo `fixa_nao_sei` que já existe em `estilos-de-atendimento.md`, sem variação nenhuma |
| Preço, prazo, disponibilidade que ele não tem | **Nunca deduz.** Regra 6 do caráter. Encaminha |

Ou seja: **no dia 1 o Otto é um recepcionista honesto que anota tudo.** Isso já vale alguma coisa — o dono deixa de perder mensagem fora do horário — e não mente em lugar nenhum.

**O risco, dito em voz alta:** um Otto que encaminha 8 de 10 no primeiro dia pode ser lido como "não serve". A contramedida não é esconder o número; é dizer o número junto com o que o muda. Na primeira semana, o painel abre com isto no lugar do resumo normal:

> O Otto está começando. Hoje ele atendeu 9 pessoas e passou 6 para você — é assim mesmo na primeira semana. Cada resposta que você der aqui, ele passa a dar sozinho.
> [Ver o que ele não soube (6)]

**Aprovado.** Uma condição do guardião: "9 pessoas" só vale se o número for mesmo de pessoas distintas no dia (`identidade.md`, linha dos créditos). Como um crédito é um dia de conversa com uma pessoa, **no recorte de um dia os dois números coincidem** — mas o texto **não pode ser reaproveitado em recorte de semana ou de mês**, porque aí a mesma pessoa voltando conta de novo. A regra que sobra, e que o ADR 024 tornou mais importante: *pessoas* só onde o recorte é de um dia; fora dali, **créditos**. É a mesma armadilha que derrubou "respondi 160 clientes" na mensagem de 80% (13.5.D).

Esse bloco sai sozinho quando a conta passa de 7 dias **ou** quando o Otto responde sozinho mais da metade das conversas do dia, o que vier primeiro.

**O que não entra:** barra de progresso de "quão treinado está o Otto", selo de "base 40% completa", checklist de configuração com percentual. Todos medem o tamanho da base, que é a coisa errada (e que custa margem), e todos são a barra sem número que a regra 7 proíbe. O que substitui é o número real: quantas ele respondeu, quantas ele passou, quantas ele não soube.

### 12.4 Por que as outras portas perdem

O Felipe levantou quatro caminhos. Nenhum é rejeitado inteiro; três viram acelerador e um sai. A comparação usa os quatro custos de `behavioral-evidence` §4.

| Caminho | Custo de execução | Custo de decisão | Custo de desvio | Ganho e quando | Veredito |
|---|---|---|---|---|---|
| **Formulário estruturado** | Alto: digitação, no celular, com a mão ocupada | **Alto e é o pior deles.** "O que eu escrevo em políticas?" é campo em branco: ele precisa inventar a taxonomia antes de responder | Detour puro. Está no onboarding, mas não é o trabalho dele | Adiado. Ele preenche hoje e vê o efeito depois | **Não é a porta.** É exatamente o desenho que a hipótese frágil de `visao.md` pressupõe e que `integracoes.md` §3 manda trocar. **Sobrevive uma parte:** o passo do onboarding, mas com as respostas **já preenchidas**, o que muda o custo de decisão de "inventar" para "conferir" |
| **Upload de documento** | Baixo — **se ele tiver o documento** | Baixo | Detour | Adiado, e opaco: ele não sabe o que o Otto extraiu | **Acelerador, com uma correção de forma.** O material do dono deste nicho não é PDF: é foto do caderno, foto da folha na bancada, áudio e, às vezes, planilha. Ver 12.6. Base ilimitada por despejo não entra, por custo (12.9) e por qualidade: documento contraditório vira Otto que inventa |
| **Conversa com o Otto** ("ele pergunta, o dono responde") | Baixo. É o canal que ele domina, e ele fala mais rápido do que digita | Baixo: uma pergunta por vez | **Depende de haver gatilho.** Se o dono tiver que lembrar de ir conversar com o Otto, é o mesmo problema da abertura do resumo (ficha crítica de `dados.md`): motivação decai, gatilho não | Imediato, se ele vir o Otto acertar logo depois | **É o formato certo, e vira duas coisas:** a tela "Conversar com o Otto" (12.5) e a barra na conversa real. A versão em que o Otto **puxa** a conversa pelo WhatsApp é a pergunta 12.11.1 ao Felipe |
| **Documentação / guia** | Baixo para produzir, alto para consumir | — | Detour total: ler antes de fazer | Nenhum | **Sai.** Ver 12.10 |

**A porta da frente, então:** *conferir uma proposta pronta*, entregue em dois momentos — o passo do onboarding e a barra na conversa. Upload é acelerador. Conversa é o formato dos dois. Guia não existe.

### 12.5 Telas e estados

Duas telas novas, três barras dentro de telas que já existem.

#### A. Onboarding, passo "confere se acertei" — **revisto em 2026-09-09**

> **Esta subseção foi reescrita na revisão de 2026-09-09 pedida pelo Felipe.** O parecer, os quatro pontos decididos e o texto original que ela substituiu estão em **12.13**. Leia 12.13 antes de implementar: as razões de cada mudança estão lá, e algumas delas são regras de segurança do produto, não gosto de tela.

Objetivo em uma frase: em menos de dois minutos, o Otto confere **o que a empresa faz** e **quanto custa**, com o dono tocando e quase nunca digitando.

Posição no onboarding: **depois** de cadastro, estilo, cargo e avatar; **antes** de encaminhamento e de conectar o número. Motivo de ser antes de conectar: o dono está numa sessão com atenção, e conectar um número para o Otto sair atendendo cru é o pior primeiro dia possível. Motivo de ter saída livre: forçar o funil no fim do onboarding cria um ponto de desistência novo, e a decisão inteira existe para tirar pontos de desistência.

**Forma: duas rodadas, teto duro de 8 telas.** Rodada 1 confere o escopo em uma tela só; rodada 2 confere os números, uma pergunta por tela. **Não existe rodada 3** (12.13.3).

**Quem fala é o Otto, em primeira pessoa** (`voz-e-tom.md` §1.1), do começo ao fim.

> `[GUARDIÃO]` **Conferido tela a tela em 2026-09-09, e a regra se manteve — com uma quebra, num botão.** A.0, a abertura da rodada 1, o aviso de linhas em branco, a autocorreção, a abertura da rodada 2, os pares, a tabela e o fim estão todos na boca do Otto, e a tela da tabela — que era o risco, porque explica uma mecânica — não escorrega para terceira pessoa em nenhuma frase. A quebra era **[Me conta]**: os rótulos de botão deste passo são todos a fala do dono ([Tá certo], [Não é bem assim], [Depois eu vejo], [Continuar assim]) ou comando neutro ([Corrigir], [Seguir]), e [Me conta] era o Otto pedindo, escrito dentro do botão que o dono aperta. Virou **[Conto de novo]**. Os contadores ("faltam 2", "3 de 6") não têm voz e devem continuar sem: nada de "você respondeu 3 de 6".

##### A.0 — A pergunta aberta (última tela do cadastro)

A descrição do negócio **deixa de ser um campo dentro do formulário de cadastro e vira a última tela dele**, perguntada pelo Otto, com microfone. Não é tela nova: é a mesma informação, no mesmo passo, com outra moldura. `conta.criada.segmento_classificado` continua com o que precisa (12.13.4).

> `[GUARDIÃO]` — ajustado em 2026-09-09
> Eu sou o Otto. Vou atender o WhatsApp da sua empresa.
> Para começar, me conta qual é o seu negócio.
> Pode escrever ou falar, como for mais rápido.
> [campo grande · microfone] · [Continuar]

**Duas condições do guardião nesta tela, e as duas são de voz (`voz-e-tom.md` §1.1):**

1. **Quem fala é o Otto, e aqui ele precisa ser identificável.** Esta é a primeira frase em primeira pessoa do produto inteiro, e ela cai no meio de um formulário de cadastro — onde "eu" sem dono se lê como a marca falando, que é a mistura que a §1.1 chama de erro mais caro. O avatar ainda não foi escolhido (é duas telas depois), então a atribuição fica no texto e na chrome da tela: **nome e avatar padrão visíveis**. Sem isso, a tela não pode falar em primeira pessoa.
2. **"Me conta", não "me diga".** O pedido do Felipe usava "me diga"; a troca é minha e é reversível. Duas razões: o modo que 12.13.4 quer é o de **contar**, não o de preencher, e a tela de autocorreção diz *"Me conta de novo?"* — "de novo" só funciona se o primeiro pedido tiver sido "me conta".

O que ele responde aqui é o motor de tudo o que vem depois. Enquanto ele escolhe estilo, cargo e avatar (as três telas seguintes), **o Otto monta as afirmações em segundo plano** — é o que faz a rodada 1 abrir na hora, em vez de ter tela de carregamento.

##### A.1 — Rodada 1: o que você faz (uma tela)

De 5 a 8 afirmações atômicas, sem número nenhum, cada uma com dois botões. Tudo numa tela, com rolagem curta. **Nenhuma vem marcada.**

> `[GUARDIÃO]` — ajustado em 2026-09-09
> Você me disse: *"conserto de celular e tablet"* · [Corrigir]
>
> Pelo que você me contou, foi isto que eu entendi da [Empresa]. Confere antes de eu começar a atender — são 6 linhas.
>
> Você conserta celular Android · [Sim] · [Não]
> Você conserta iPhone · [Sim] · [Não]
> Você troca tela · [Sim] · [Não]
> Você faz orçamento sem compromisso · [Sim] · [Não]
> Você atende por ordem de chegada, sem hora marcada · [Sim] · [Não]
> Você busca o aparelho na casa do cliente · [Sim] · [Não]
>
> faltam 2 · [Continuar] · [Depois eu vejo]

Regras que não são estéticas:

- **Nada de número, preço, prazo ou percentual numa afirmação.** Nem escrita por nós, nem gerada pelo modelo. Vale como regra de lint em tempo de execução, não como recomendação (12.13.2).
- **Não tocar não é "não".** Linha em branco não vira `negativa`, não vira item, não vira nada: o Otto simplesmente não sabe daquilo, diz que não sabe e encaminha. Este é o ponto de segurança da rodada em lote inteira (12.13.2).
- **"Não" é conhecimento e é guardado**: vira o texto negativo do item (`bases-de-nicho/README.md` §5.2), que é sempre uma resposta melhor que "não sei" — e um encaminhamento a menos nos 78% em que ela diz o que a empresa faz no lugar. Nos outros 22% o Otto diz o que não faz e passa para alguém do mesmo jeito.
- **Cada toque salva na hora.** Não existe "perder o que marcou" ao sair. Não há botão de enviar: [Continuar] avança, sair preserva.
- **No máximo 3 afirmações geradas** a partir da descrição em texto livre; as outras saem dos itens `escolha` da base do nicho. Motivo em 12.13.3.
- `[GUARDIÃO]` **"Afirmação" é palavra interna e não aparece em tela nenhuma.** A tela não batiza a unidade: ela mostra *o que eu entendi*, e a unidade só ganha nome depois de guardada, onde já é **resposta** ("o Otto sabe 14 respostas", `identidade.md`). Onde a contagem física for inevitável, a palavra é **linha** ("são 6 linhas", "você deixou 3 em branco"). Proibidos na tela: afirmação, item, sentença, declaração, tag, cartão. Regra em `identidade.md`.
- `[GUARDIÃO]` **O contador é texto, é pendência e nunca vira progresso.** "faltam 2" pode. Não pode virar barra, porcentagem, anel, nem a forma "2 de 6 respondidas" — que é a barra de progresso escrita por extenso, proibida em 12.7 e em `identidade.md` (linha "ensinar o Otto"). O número da abertura ("são 6 linhas") é tamanho, não meta, e é **dinâmico**: é o total real da tela, entre 5 e 8. Nunca um número redondo escrito à mão.
- `[GUARDIÃO]` **O cabeçalho com o que ele disse e o [Corrigir] são parte do texto aprovado**, não enfeite: é o caminho de consertar a raiz que 12.13.4 exige, e é o mesmo destino do [Conto de novo] da tela de autocorreção. Um destino, um rótulo.

##### A.2 — Rodada 2: os números (até 6 telas, uma por tela)

Só itens `fato` com lacuna de dinheiro, prazo ou garantia — o que **só o dono sabe** (`preenchivel_por: []`). O conjunto e a ordem saem da rodada 1: o que ele marcou "não" não aparece aqui.

A rodada 2 abre dizendo o número em voz alta, na primeira tela, acima do primeiro par:

> `[GUARDIÃO]` — ajustado em 2026-09-09
> Pelo que você marcou, são 6 perguntas: preço, prazo e garantia. É a última parte.

("sobraram 6 perguntas de preço" era o rascunho de 12.13.3. Duas correções: *sobrar* é resto, e o que sobra ninguém quer conferir; e a rodada 2 não é só preço — chamar de "perguntas de preço" a tela que vai perguntar garantia é a primeira promessa quebrada do passo.)

> `[GUARDIÃO]` — moldura já aprovada em 2026-09-09 (12.13.8), inalterada
> Um cliente pergunta: **"quanto custa trocar a tela do iPhone 11?"**
> Eu respondo: *"A troca de tela do iPhone 11 sai por R$ ___, com garantia de ___ dias. Fica pronto em ___."*
> [Tá certo] · [Não é bem assim]
> · · 3 de 6 · [Depois eu vejo]

- Com lacuna em branco, "Tá certo" não fica disponível: o dono preenche o número e o botão vira "Pronto". Teclado numérico pelo `tipo` da lacuna.
- Resposta que o Otto montou inteira (perfil, catálogo, descrição): "Tá certo" é um toque e nada mais.
- "Não é bem assim" abre um campo **com a resposta atual dentro**, com microfone. Nunca campo vazio.
- **O denominador só encolhe, nunca cresce.** Rodada 2 tem teto de 6 e piso de 3 (piso de 2 em `outro`, 12.13.12). O que sobrar da base do nicho vira lacuna semeada (`bases-de-nicho/README.md` §6) e chega depois pelo resumo do dia ou pela pergunta no WhatsApp — não vira tela.

**A tabela de preço (`lista`) é a última tela da rodada 2, e é a mais fácil de responder, não a mais difícil** (12.13.11). Nenhum campo é obrigatório e a tela avança com zero preenchido.

> `[GUARDIÃO]` — aprovado sem mudança em 2026-09-09
> Um cliente pergunta: **"quanto custa trocar a tela do meu Galaxy A54?"**
> Isso muda por aparelho. Me dá os que você mais faz — o resto eu vou te perguntando conforme os clientes pedirem.
>
> iPhone 11 tela · R$ ___
> iPhone 12 tela · R$ ___
> iPhone 13 tela · R$ ___
> Galaxy A54 tela · R$ ___
> …
> [+ acrescentar aparelho]
> · · 6 de 6 · [Pronto] · [Depois eu vejo]

`[GUARDIÃO]` **Aprovada como está, e a segunda frase é a mais importante da tela.** *"o resto eu vou te perguntando conforme os clientes pedirem"* é o que tira a pressão de completude sem nenhuma frase de cobrança, e é uma promessa que o produto cumpre (12.13.11, caminhos 1 a 3) — se algum dia deixar de cumprir, esta frase sai junto. A voz está certa do começo ao fim: quem fala é o Otto, e ele fala do trabalho dele, não do que falta ao dono.

Ela **não tem** o marcador `completa`/`parcial` e **não tem** botão de apagar linha: sai desta tela sempre `parcial`, e linha em branco é inerte, como na rodada 1. O porquê das duas ausências está em 12.13.11.

##### A.3 — Estados

| Tela | Estado | O que aparece |
|---|---|---|
| A.0 | Resposta curta que **classifica** o nicho ("conserto de celular") | Segue normal. A base do nicho sozinha já enche a rodada 1. **Não é caso de erro** |
| A.0 | Resposta que **não classifica** ("faço uns trampos", vazio) | O Otto pergunta de volta **uma vez, só uma**: `[GUARDIÃO]` "Me ajuda: o que o cliente vem buscar aí? Pode ser curto — *conserto de celular*, *corte de cabelo*." O exemplo é obrigatório: 12.13.4 prometia "com exemplo" e o rascunho não tinha nenhum, e esta é a última chance de classificar |
| A.0 | Segunda tentativa também não classifica | Degrada em silêncio para `_comum/todo-negocio.yml`: 5 afirmações que todo negócio tem. Rodada 2 fica no piso de 3. **Nunca vira formulário em branco, nunca vira "me conta uma pergunta que seus clientes fazem"** |
| A.1 | Carregando | Só existe se o dono correu por estilo/cargo/avatar mais rápido que a geração. `[GUARDIÃO]` "Estou terminando de ler o que você escreveu. Já te mostro." (era "terminando de montar", que deixa o objeto no ar; a forma com objeto já estava aprovada em 12.13.8). Teto de 10 s; passou, cai para `_comum` |
| A.1 | Padrão | 5 a 8 linhas, nenhuma marcada, contador de pendentes ("faltam 2") |
| A.1 | [Continuar] com linhas em branco | Não bloqueia. Inline: `[GUARDIÃO]` "Você deixou 3 em branco. Tudo bem — eu não invento: quando um cliente perguntar, eu passo para você." [Continuar assim] · [Voltar e responder] ("alguém" virou "um cliente": é quem de fato vai perguntar, e concreto é a regra 2 de `voz-e-tom.md`) |
| A.1 | **Metade ou mais marcada "Não"** | O Otto se corrige em vez de deixar o dono moer: `[GUARDIÃO]` "Acho que eu entendi errado o seu negócio. Me conta de novo?" **[Conto de novo]** · [Tá bom assim]. **Uma vez por conta** (12.13.3) |
| A.1 / A.2 | Erro ao salvar | O que foi tocado ou digitado fica; botão de tentar de novo. Sair nunca perde |
| A.2 | Padrão | Uma pergunta por tela, contador honesto, saída em toda tela |
| A.2 | Saiu no meio | "Beleza. As outras 4 ficam guardadas aqui no painel, para quando você quiser." Nunca cobrança, nunca "você não terminou" |
| A.2 | **Tabela (`lista`), padrão** | Rótulos já escritos, um campo numérico por linha, **nenhum obrigatório**, [+ acrescentar]. Sempre a última tela |
| A.2 | Tabela com menos linhas que `minimo_de_linhas` | Não entra na base: fica `rascunho` e o Otto não a vê. **Ninguém é avisado disso na hora** — o item `fato` de preço já responde a pergunta, e avisar seria cobrar. Aparece depois em "O que o Otto sabe" como linha com número real |
| A.2 | Tabela vazia, [Pronto] | Segue sem atrito. Nenhuma frase de cobrança. A tabela vira lacuna semeada e volta pelo resumo do dia, uma linha por vez |
| A.2 | Nicho sem arquivo (`outro`) e rodada 2 com menos de 2 itens | **A rodada 2 não abre.** Vai direto para o fim. Os itens viram lacuna semeada. Uma tela só de rodada 2 não paga a transição (12.13.12) |
| Fim | Com pelo menos uma resposta | `[GUARDIÃO]` "Pronto. Agora eu sei 12 respostas. Quer me perguntar uma coisa, pra ver como ficou?" [Perguntar] · [Seguir] |
| Fim | **Nenhuma resposta** (passou reto ou saiu em tudo) | `[GUARDIÃO]` "Pronto. Do seu negócio eu ainda não sei nada — eu atendo assim mesmo e te passo o que eu não souber." [Seguir]. Sem convite para testar: um teste com zero resposta é uma demonstração de "não sei". Sem cobrança, sem "você não terminou" |

`[GUARDIÃO]` **O número volta ao fim, e isso não é gosto.** O rascunho dizia *"agora eu sei o que você faz e quanto custa"* — uma afirmação qualitativa que fica falsa exatamente nos casos que o desenho inteiro protege: quem deixou linhas em branco, quem pulou a tabela, quem respondeu 3 de 6. `voz-e-tom.md` §1.1 pede **número em vez de adjetivo**, e `persona-otto.md` põe "relatório inflado, adjetivo em vez de número" na coluna do que o Otto não faz. "Agora eu sei 12 respostas" é sempre verdade, reconcilia com o contador de "O que o Otto sabe" (`identidade.md`: a forma completa, nunca "12" solto) e faz o [Não] contar como conhecimento em vez de como perda. Era a frase aprovada em 12.13.8 e continua sendo.

**O que não existe no fim:** oferta de "mais 5 perguntas". Terminar é terminar. O que sobrou chega pelos canais que existem para isso.

##### A.4 — Acessibilidade

Cada linha da rodada 1 é um grupo de rádio com rótulo próprio (`Sim`/`Não` nunca só ícone, nunca só cor); a linha respondida muda forma além de cor; o contador de pendentes é texto e é anunciado ao leitor de tela quando muda; o par pergunta/resposta da rodada 2 é um bloco com cabeçalho; o microfone tem alternativa por teclado; alvos de toque de 44 px, o que limita a rodada 1 a 8 linhas antes de precisar de rolagem longa.

#### B. Conversar com o Otto (painel)

Objetivo: perguntar ao Otto como se fosse cliente, ver o que ele sabe e corrigir na própria resposta.

É uma conversa de mentira, sempre disponível, que **não conta crédito** (e a tela diz isso, porque senão o dono não usa). Serve a três coisas de uma vez: é a demonstração de valor da primeira sessão, é como o dono confere o que o Otto sabe, e é a resposta barata ao "modo de teste" que a seção 8 deixou fora da v1.

Diferença que muda tudo em relação a um chat comum: **cada resposta do Otto carrega de onde ela veio.**

> (abaixo de cada resposta, discreto)
> Isso eu sei porque você me ensinou · [Ver] · [Corrigir]
> Isso eu peguei do seu perfil do WhatsApp · [Ver] · [Corrigir]
> Isso é o que costuma valer para assistência técnica. Confere? · [Tá certo] · [Corrigir]
> **Essa eu não sei.** [Me ensina agora]

A última linha é a mais importante da tela: perguntar ao Otto é a maneira mais rápida de o dono descobrir um buraco, e ali o custo de desvio é zero.

| Estado | O que aparece |
|---|---|
| Vazio (primeira vez) | "Pergunta o que um cliente perguntaria. Eu respondo aqui, e nada disso vai para ninguém." Três sugestões de um toque, tiradas do nicho: "quanto custa trocar a tela?" · "vocês abrem sábado?" · "tem garantia?" |
| Otto pensando | Marca de digitando, no formato do WhatsApp. Nunca "processando" |
| Otto não sabe | A resposta honesta que o cliente final veria, mais a linha "[Me ensina agora]" |
| Corrigindo | O campo abre com a resposta atual dentro. Salvar volta para a conversa e o Otto **responde de novo, já corrigido** — o dono vê o efeito na hora |
| Erro | "Não consegui responder agora. Tenta de novo." O que foi digitado fica |

**Aprovado sem ajuste.** A tela inteira fala em primeira pessoa e é a que mais parece o Otto de todo o documento. A linha "Essa eu não sei" é a regra 1 do caráter (`persona-otto.md`, "não inventa") aparecendo no painel com o mesmo texto que apareceria na conversa — o que é o melhor sinal de que o caráter é um só.

#### C. O que o Otto sabe (painel)

Objetivo: ver, corrigir e apagar o que foi ensinado, e mandar material.

Esta é a **segunda** porta, não a primeira. Ela existe porque corrigir e apagar precisam de um lugar, não porque alguém vai navegar por ela por prazer.

Forma: lista de respostas, cada linha com a pergunta do cliente em cima e a resposta embaixo, em uma linha. Ordem: as que o Otto mais usou primeiro. As que ele sabe **de cor** ficam num bloco no topo, com o rótulo; o resto vem embaixo. Sem pastas, sem categorias, sem etiquetas — mesma razão da decisão B (5.3): conjunto aberto que o dono precisa inventar e manter degenera em 30 dias.

| Estado | O que aparece |
|---|---|
| Carregando | Esqueleto de 5 linhas |
| Vazio | "O Otto ainda não sabe nada específico da sua empresa. Ele está atendendo com o que dá para saber pelo seu perfil e passando o resto para você." Botão: [Ensinar uma resposta] · [Mandar material] |
| Padrão | "O Otto sabe 14 respostas. Usou 9 esta semana." Lista |
| De cor cheio | "O Otto sabe 60 respostas de cor, que é o limite. Para entrar mais uma, tira uma que ele não usa." Com a lista das menos usadas já em cima. Ver 12.9 |
| Busca | Só aparece acima de um volume medido, não de palpite. Mesma regra da decisão B (5.5) |
| Erro | "Não consegui carregar. Tenta de novo." |

**Aprovado.** Aqui quem fala é a marca, não o Otto — é uma tela *sobre* ele, e a terceira pessoa está certa. **"De cor" entrou no vocabulário** (`identidade.md`): é a tradução aprovada de prefixo cacheado, e resolve um problema que o dono não tem por que entender com uma palavra que ele já usa desde a escola.

#### D. Barra "guardar essa resposta" (dentro da conversa)

**É o motor da decisão inteira.** Aparece na tela de Conversa, logo depois de o empregador (ou alguém da equipe) enviar uma mensagem numa conversa que o Otto tinha encaminhado por não saber.

> O Otto não sabia essa. Guardar sua resposta? Da próxima vez ele responde sozinho.
> [Guardar] · [Só dessa vez]

**Aprovado.** Terceira pessoa está certa: a barra é o painel falando dentro de uma conversa que o Otto conduziu, e não o Otto interrompendo a própria conversa.

Regras:
- Aparece **uma vez por conversa**, na primeira mensagem do empregador depois de um `fixa_nao_sei` ou de um encaminhamento por "não sabe". Nunca em toda mensagem.
- "Guardar" é um toque e pronto. O Otto **reescreve** a resposta do dono no formato de resposta a cliente (tira o "oi tudo bem", corrige o que ficou pela metade) e mostra o resultado por 5 segundos com [Desfazer]. Não abre tela, não abre formulário.
- "Só dessa vez" some e não volta a perguntar naquela conversa.
- Ignorar é o padrão: a barra desaparece sozinha depois de 30 segundos, e não bloqueia nada.

**Onde isso não funciona, dito com honestidade: no modo Recado.** Nesse modo o dono responde ao cliente **por fora** — liga pelo telefone dele — e volta ao painel só para marcar "retornado", que já é uma hipótese frágil (`dados.md`, seção 9, última ficha). Ali a barra vira uma pergunta acoplada ao toque de marcar retornado, opcional e pulável:

> Marcado. O que você respondeu para ele? O Otto guarda e responde sozinho da próxima.
> [campo, com microfone] · [Deixa pra lá]

Vale menos que a versão da conversa, e está registrado como tal na ficha 12.2. A saída melhor para o modo Recado é a pergunta 12.11.1 ao Felipe.

#### E. Bloco "o que o Otto não soube" (dentro do resumo do dia)

O resumo do dia (metade de baixo da tela Início) ganha um bloco. Cada linha é uma pergunta real que o Otto não soube, com a resposta proposta quando ele conseguiu montar uma, e um toque.

> O Otto não soube 3 coisas hoje.
> "vocês consertam Xiaomi?" → [Sim] · [Não] · [Escrever]
> "quanto tempo demora o orçamento?" → [Responder]
> "vocês buscam em casa?" → [Sim] · [Não] · [Escrever]

Quando a pergunta é fechada (sim/não), a resposta é dois botões e o Otto escreve a frase. Quando é aberta, um campo com microfone.

Este caminho **herda a fragilidade da ficha crítica de `dados.md`**: se o dono não abre o resumo, o bloco não existe. Por isso ele é a rede, e a barra da conversa é o caminho principal. Está dito assim na ficha 12.6.

#### F. Mandar material

Objetivo: entregar foto, áudio, planilha ou PDF e receber respostas propostas para conferir.

Dois lugares, e o segundo é o que importa para este público:

1. No painel, dentro de "O que o Otto sabe": [Mandar material].
2. **No WhatsApp, mandando para o próprio Otto.** O dono tira uma foto da folha colada na bancada e manda. Isso é um upload que não parece upload, no aplicativo que ele já tem aberto, com a mão suja. Para o público desta v1, é a forma provável de acontecer.

**Regra dura: material nunca vira conhecimento direto.** Ele vira propostas de resposta que o dono confere. Isso protege o custo (o dono não despeja 200 páginas no prefixo) e protege a qualidade (documento contraditório não vira Otto que inventa).

| Estado | O que aparece |
|---|---|
| Recebido | "Recebi. Vou ler e te mostro o que entendi." |
| Lendo | Uma linha com o nome do arquivo e "lendo". Sem percentual falso |
| Pronto | "Li a tabela. Tirei 14 respostas daqui. Confere as 3 que fiquei em dúvida?" Depois: as 3 duvidosas uma a uma; as outras 11 entram e ficam marcadas como "veio da sua tabela" |
| Não deu | "Não consegui ler essa foto — ficou embaçada. Manda de novo, ou me conta o que tem nela." Nunca "formato não suportado" |
| Nada aproveitável | "Li, mas não achei nada que sirva para responder cliente. O que tem aí que eles costumam perguntar?" Zero é informação, sem consolo |
| Áudio | Igual, mais a transcrição visível: "Entendi isso: [texto]. Tá certo?" |

**Aprovado.** "Material" entrou no vocabulário no lugar de documento e upload. Os seis estados são o caráter inteiro em seis linhas: assume o que não deu ("não consegui ler essa foto"), não culpa o dono, não usa jargão de sistema, e diz zero quando é zero.

Formatos da v1: **foto, áudio, PDF, planilha (CSV/XLSX) e texto colado.** Foto e áudio primeiro, e essa ordem é a decisão — não é a ordem que um produto para escritório teria.

#### G. A pergunta do Otto no WhatsApp do dono

**Decidido pelo Felipe em 2026-09-09:** *"Se o cliente autorizar, sim. Por padrão será autorizado."* A pergunta 12.11.1 está fechada.

Isto **não é um cargo novo** e não abre precedente: é o Otto Atendente falando com o próprio empregador, que é uma coisa que o ADR 012 já faz no modo Aviso. A conferência contra as salvaguardas do ADR 016 está em 12.5.G.4.

##### G.1 Como o dono autoriza, e onde ele desliga

Padrão **ligado**. E, exatamente porque é ligado por padrão, a autorização precisa ser **dita** e o desligar precisa ser **fácil** — senão "autorizado por padrão" vira "ninguém sabia".

| Onde | O quê |
|---|---|
| **Onboarding**, no passo de encaminhamento, onde ele já confirma o WhatsApp dele (o mesmo número do cadastro, já preenchido, como na decisão A) | Uma linha, sem caixa de seleção, sem tela própria: "Quando eu não souber responder alguma coisa, eu te pergunto por aqui — no máximo uma vez por dia. Se cansar, é só me dizer." |
| **Dentro da própria mensagem**, sempre | "…Se preferir que eu não pergunte, responde *chega*." Um toque, no lugar onde o incômodo acontece. É o desligar mais barato que existe e é onde ele vai querer usar |
| **Configurações → o Otto falando com você** | Uma chave por tipo: *me perguntar o que não soube* · *me avisar quando os créditos estiverem acabando*. A segunda não desliga em 100% (13.4) |

**Ajuste do guardião: a palavra de desligar deixou de ser *para* e virou *chega*.** "Responde *para*" se lê como preposição — "responde para…" — e a instrução mais importante da mensagem é a que não pode ficar ambígua. *Chega* é imperativo, não tem outro sentido nesse lugar, é palavra de gente e cabe no mesmo template. Vale nas três telas e nas duas mensagens de 13.5.D.

**Por que não uma tela de consentimento.** Não há consequência legal aqui: é a empresa mandando mensagem para o número que ela mesma cadastrou, coberto pelo termo de contratação (ADR 014). Tela de consentimento inventada é fricção sem consequência (regra 12). O que substitui é dizer a frase onde ele lê e pôr o desligar dentro da mensagem.

##### G.2 O que a mensagem diz, e o teto

Uma por dia, no máximo, agrupada: **uma pergunta, a mais pedida do dia**, com o resto atrás de um toque.

> Oi. Hoje 3 clientes perguntaram coisas que eu não soube responder. A mais pedida foi: *"vocês consertam Xiaomi?"*
> Me responde aqui que eu guardo e respondo sozinho da próxima.
> (Ver as outras 2: [link]) · Se preferir que eu não pergunte, responde *chega*.

**Aprovada, com duas trocas de palavra.** O tom pedido está lá: é funcionário perguntando ao chefe, não notificação. Ela abre admitindo o limite, que é a regra 1 do caráter; traz o número e a pergunta literal do cliente, que é a linha "empregador pergunta o que o Otto fez hoje" da `persona-otto.md` ("números e casos concretos"); não pede desculpa, não elogia o dono, não usa emoji e não promete nada. **"Não sei responder" virou "não soube responder"** — é o que aconteceu, no passado, e casa com o nome do bloco do resumo ("o que o Otto não soube"). **"Responde *para*" virou "responde *chega*"**, por G.1.

Ele responde uma frase no WhatsApp. O Otto reescreve no formato de resposta a cliente, guarda, e confirma em uma linha: "Guardei. Da próxima vez eu respondo sozinho." Mesmo mecanismo da barra de 12.5.D, no canal em que ele já está.

**Quando não manda:** dia sem buraco; conta com menos de 3 dias de vida (o dono ainda está no onboarding e vai receber pergunta demais); dia em que a mensagem de saldo em 80% ou 100% ocupou o lugar (13.5, regra de fila).

##### G.3 Quando ele ignora — e por que isto é a parte mais importante do desenho

Uma mensagem diária ignorada é a maneira mais rápida de treinar alguém a ignorar as mensagens do Otto. E **o mesmo canal carrega três coisas**: o aviso de encaminhamento (ADR 012, que é o produto funcionando), a pergunta de aprendizado e o aviso de créditos acabando. Queimar a credibilidade do canal com pergunta ignorada custa as outras duas.

**Regra do corte, e ela é dupla — protege a credibilidade e o custo ao mesmo tempo:**

| Situação | O que acontece |
|---|---|
| 3 dias seguidos sem resposta | O Otto **para de perguntar por 7 dias**. Não avisa que parou (avisar é mais uma mensagem). A pergunta continua existindo no bloco do resumo do dia (12.5.E) |
| Voltou e foi ignorado de novo, 3 dias seguidos | Para de vez. Uma linha discreta em "O que o Otto sabe": "Parei de te perguntar por aqui, porque você não estava respondendo. Se quiser que eu volte a perguntar, liga a chave aqui." [chave] |
| Ele responde *chega* | Desliga na hora. "Beleza, não pergunto mais. Fica no painel o que eu não souber." |
| Ele bloqueia o número da empresa (raro, mas o webhook de status diz) | Para tudo o que o Otto inicia, inclusive saldo, e a operação é avisada. É sinal de que algo saiu muito errado |

A **regra de fila do canal do dono**, que vale para C e D juntas:

| Prioridade | Mensagem | Entra no teto de uma por dia? |
|---|---|---|
| 1 | Créditos do mês acabaram (100%) — o Otto parou de atender | **Não.** Sempre passa. Sem ela a empresa fica muda sem saber |
| 2 | Aviso de encaminhamento (ADR 012, modo Aviso) | **Não.** Nasce de uma conversa e é o produto funcionando, não uma iniciativa do Otto |
| 3 | Créditos em 80% | Sim, e ganha da pergunta |
| 4 | Pergunta de aprendizado | Sim |

##### G.4 Custo: janela de serviço × template pago

Mensagem que a empresa inicia fora da janela de 24 h é **template aprovado pela Meta**, cobrado por mensagem (não por token). Dentro da janela, é mensagem de serviço, mais barata. Isso tem duas consequências de desenho, e não só de conta:

| Caso | Custo | O que muda no desenho |
|---|---|---|
| O dono respondeu ao Otto nas últimas 24 h | Mensagem de serviço | O texto pode ser livre. É o caso comum de quem responde, porque uma pergunta direta costuma ser respondida |
| Não respondeu | **Template**, com texto fixo e variáveis aprovadas | A primeira mensagem do dia tem que **caber num template**: forma fixa, duas variáveis (`{quantidade}` e `{pergunta}`). O texto de G.2 já está escrito assim, de propósito |

**O corte de G.3 é também o freio de custo**, e é por isso que ele vem antes de qualquer conta: quem nunca responde é exatamente quem nunca abre a janela, logo quem consome template todo dia sem retorno nenhum. Três dias e para. O pior caso por conta fica em 3 templates, não em 30 por mês.

##### G.5 Contra as quatro salvaguardas do ADR 016

O ADR 016 exige quatro salvaguardas para cargo que **inicia conversa**. Aqui quem recebe é o empregador, não o cliente final, e é isso que muda o quadro. Duas se aplicam com forma própria, uma já está satisfeita e uma não se aplica.

| Salvaguarda do ADR 016 | Aplica? | Forma aqui |
|---|---|---|
| **1. Permissão registrada antes do primeiro envio** | **Sim, em forma leve.** O risco existe (é mensagem não pedida), mas há um destinatário só e ele é a própria conta | Padrão ligado por decisão do Felipe, declarado no onboarding (G.1), desligável dentro da mensagem. Registrado em `configuracao.alterada`. Não precisa do fato por destinatário que `dados.md` §11 pede, porque o destinatário é a conta |
| **2. Nada de envio em número recém-conectado** | **Não se aplica.** Essa salvaguarda protege contra a Meta rebaixar o número por envio a desconhecido. O dono não é desconhecido: ele cadastrou o próprio número | Sobra uma regra menor, e por outro motivo: nada de pergunta nos 3 primeiros dias, porque o dono ainda está configurando (G.2) |
| **3. Limite por conta abaixo do limite da Meta, com aumento gradual** | **Já satisfeita, sem mecanismo novo** | O teto de uma por dia é mais apertado que qualquer limite da Meta. Aumento gradual não faz sentido com teto de 1 |
| **4. Corte automático ao cruzar limiar de bloqueio** | **Sim, e em forma melhor** | O corte de G.3 dispara com **silêncio do dono**, que é sinal mais cedo e mais barato que bloqueio ou denúncia. O corte por bloqueio real continua existindo por cima, pelo webhook de status |

**Conclusão para o ADR 016:** falar com o empregador não é a mesma classe de risco que falar com o cliente final, e não deve gastar as salvaguardas nem o precedente do "cargo que inicia conversa". Vale registrar essa distinção no próprio ADR 016 quando ele for revisado — sugestão minha, não decisão.

### 12.5.1 Jornadas

Três, e cada uma tem o ponto de desistência nomeado. Mesma disciplina da seção 7.

#### Jornada 1 — Do cadastro ao Otto respondendo sozinho

| Momento | O que acontece | Ponto de desistência | Hipótese e grau |
|---|---|---|---|
| Cadastro | Descreve o negócio em uma frase, em texto livre (já existe, ADR 007) | Baixo. Uma frase, sem lista | — |
| Estilo, cargo, avatar | Escolhe vendo exemplo (já existe) | Baixo | ADR 002 |
| **Confere se acertei** (revisto em 2026-09-09) | **Rodada 1:** uma tela com 5 a 8 afirmações sobre o que ele faz, dois botões cada. **Rodada 2:** até 6 perguntas de cliente com a resposta já escrita e o número em branco. Sai quando quiser | **Médio, e é o principal desta decisão.** Mudou de lugar: agora se concentra na rodada 2, onde o teclado aparece. A rodada 1 não tem teclado. Contador honesto, saída em toda tela, texto de saída que não cobra | Fichas 12.1 e 12.13 a 12.19, `NÃO VERIFICADO` |
| Encaminhamento e contatos | Já desenhados (ADR 012, decisão A) | Baixo | — |
| **Perguntar ao Otto** | "Quer perguntar uma coisa pra ele, pra ver como ficou?" Ele pergunta, o Otto responde com o nome do negócio dele | Nenhum: é ganho, não tarefa. **É o momento de valor da primeira sessão** — a primeira vez que ele vê o Otto ser o funcionário dele e não um produto | Ficha 12.7, `NÃO VERIFICADO` |
| Conectar o número | Já desenhado | Alto, mas por outro motivo (aprovação da Meta, ADR 005) | — |
| **Dia 1 a 7** | O Otto atende. Responde o que tem fonte, encaminha o resto. O painel diz o número e o que o muda | **Alto e mal medido.** É aqui que o dono decide se "não serve". Contramedida em 12.3 | Ficha 12.5, `NÃO VERIFICADO` |
| Semana 2 | O Otto responde sozinho a maior parte do que chega | — | M2 semana 1 × semana 4 (12.12.4) |

O primeiro cliente real atendido **não depende de nenhum passo desta decisão**. Se o dono pular "confere se acertei" inteiro, o Otto atende assim mesmo. Isso é de propósito (12.3).

#### Jornada 2 — O buraco vira resposta (o dia a dia)

O mesmo evento, nos três modos do ADR 012. A terceira coluna é o que a decisão do Felipe de 2026-09-09 liberou.

| Passo | Modo Aviso ou Equipe | Modo Recado, antes | Modo Recado, com a pergunta no WhatsApp |
|---|---|---|---|
| Cliente pergunta "vocês consertam Xiaomi?" | O Otto não sabe. Diz que não tem essa informação e encaminha | Idem | Idem |
| A empresa fica sabendo | Aviso no WhatsApp com link; abre a conversa no painel | Fica na fila "Esperando você". Ele descobre quando abrir o painel | Idem |
| A empresa responde ao cliente | Digita no painel | Liga para o cliente pelo telefone. **O painel não participa** | Idem |
| O buraco vira resposta | **Barra de um toque, na hora:** "guardar sua resposta?" Custo de desvio zero | Só se ele voltar ao painel. Hipótese frágil sobre hipótese frágil | **O Otto pergunta no fim do dia, no WhatsApp dele.** Ele responde uma frase, no aplicativo que já está aberto |
| Da próxima vez | O Otto responde sozinho | Provavelmente não, e o buraco se repete | O Otto responde sozinho |

**O que mudou, em uma frase:** o modo Recado deixou de depender de o dono lembrar de abrir o painel. **Gatilho externo é a única coisa que substitui lembrança** (`behavioral-evidence` §1: motivação decai, gatilho não), e agora existe um.

**Ponto de desistência, o novo:** não é mais "ele não abre o painel". É **"ele para de responder as mensagens do Otto"**, que é o corte de 12.5.G.3 — e que é observável no terceiro dia, e não em três semanas. Trocamos uma falha silenciosa por uma medível, o que é o melhor tipo de troca que este documento faz.

#### Jornada 3 — O preço mudou (a base envelhecendo)

O caso que mata produto de FAQ: a base fica velha, o Otto passa a mentir com confiança, e ninguém percebe — porque resposta errada e confiante **não gera reclamação do cliente final**, gera cliente que some (`behavioral-evidence` §8.1 e a ficha de silêncio de `dados.md`).

| Passo | O que existe |
|---|---|
| O dono sobe o preço da troca de tela de R$ 280 para R$ 340 | Nada acontece automaticamente. O produto não adivinha |
| Caminho 1, o provável | Um cliente pergunta o preço, o Otto responde R$ 280, o dono lê a conversa no painel e corrige **na própria resposta** ([Corrigir], 12.6.2). Custo de desvio zero: ele está olhando o erro |
| Caminho 2, a rede | O resumo do dia pergunta, um dia qualquer: "a troca de tela do iPhone 11 ainda é R$ 280?" [Ainda é] · [Mudou]. Uma pergunta por dia, nunca duas (12.6.5) |
| Caminho 3, o dele | Ele lembra e vai em "O que o Otto sabe". O menos provável, e existe assim mesmo |
| O que **não** existe | Lembrete de "revise sua base". Ninguém faz (12.7) |

**Ponto de desistência:** nenhum dos três caminhos tem gatilho forte. O caminho 1 depende de o dono ler conversas; o 2, de ele abrir o resumo. É a fragilidade honesta desta jornada, e ela é a mesma do produto inteiro. Não invento gatilho que não existe.

### 12.6 Corrigir, apagar e conferir o que o Otto sabe

Pedido explícito do Felipe. Quatro mecanismos, em ordem de uso esperado.

**1. Conferir = perguntar.** A porta principal de conferência é a tela "Conversar com o Otto" (12.5.B), não a lista. Motivo: "essa lista de 14 respostas está certa?" é uma pergunta que ninguém consegue responder olhando uma lista, e que qualquer um responde perguntando três coisas. E o dono já sabe perguntar.

**2. Toda resposta é rastreável.** Em qualquer lugar onde o Otto responde — na conversa de teste e na conversa real que o dono lê no painel — existe a linha "de onde veio isso" com [Ver] e [Corrigir]. Corrigir dali tem custo de desvio zero: ele está olhando o erro no momento em que o descobriu. Esta é a via provável de correção; a lista é a improvável.

**3. Apagar é um toque, com desfazer.** Sem caixa de confirmação: a ação é reversível e barata, e confirmação inventada é fricção sem consequência (regra 12 do agente, ADR 014). O que existe é a barra de desfazer por alguns segundos, igual à decisão A (4.5).

Uma exceção, e ela tem consequência real: **apagar um material** (uma tabela que virou 14 respostas) pergunta o que fazer com as respostas que vieram dele. Aí a pergunta existe porque a consequência existe:

> Essa tabela virou 14 respostas. Apago as 14 junto, ou deixo?
> [Apagar tudo] · [Deixar as respostas]

**4. Contradição bloqueia, e é o único bloqueio do fluxo.** Se o dono ensina algo que contradiz uma resposta que já existe, o Otto não guarda as duas. Mostra as duas e pergunta qual vale:

> Você já tinha me ensinado que a troca de tela do iPhone 11 sai por R$ 280. Agora escreveu R$ 340. Qual vale?
> [R$ 340, o novo] · [R$ 280, deixa como estava]

**Aprovado, e é o melhor texto da seção 12.** O Otto mostra os dois números, não escolhe por conta própria e não sugere que o dono errou. É a regra 1 do caráter ("não inventa") escrita como pergunta.

Motivo de este ser o único ponto que trava: base contraditória é a causa mais direta de Otto que inventa, e inventar fere o caráter (regra 1). O mecanismo é `INFERIDO` (12.8) — se na prática o Otto acusar contradição onde não há, a regra afrouxa antes de o dono se irritar.

**5. Envelhecimento: uma pergunta por vez, nunca uma revisão.** Nada de "revise sua base a cada 90 dias". Ninguém faz, e um lembrete de revisão é o pedido mais fácil de ignorar que existe. O que existe: cada resposta guarda quando foi ensinada e quantas vezes foi usada, e o resumo do dia carrega, quando couber, **uma** pergunta de um toque sobre a resposta mais usada e mais antiga:

> A troca de tela do iPhone 11 ainda é R$ 280?
> [Ainda é] · [Mudou]

**Só existe uma pergunta de um toque por dia, e ela já tem dono.** O resumo do dia já carrega a pergunta de qualidade (`dados.md`, pendência 2) — cuja redação atual, *"alguém reclamou do atendimento hoje?"*, **precisa de outra palavra** desde o ADR 024, e a proposta é *"alguém reclamou hoje?"*. **Aprovada como texto pelo guardião em 2026-09-09, e ainda não fechada** — ela alarga o que se mede, e essa parte é do analista de produto, não da marca. O caminho descartado e o motivo estão em 14.9.

Regra de prioridade proposta ao analista: **a pergunta de qualidade tem prioridade nos dias em que houve reação ruim; nos outros dias entra a de envelhecimento.** Duas perguntas no mesmo dia, nunca.

### 12.7 O que fica fora da v1

| Fora | Por quê | O que faria entrar |
|---|---|---|
| **Guia ou central de ajuda escrita para o empregador** | Ele não lê. E a parte útil do guia — o que faz o Otto acertar × o que faz ele errar — funciona melhor como exemplo dentro da tela, no momento em que ele escreve. Detalhe em 12.10 | Nada. O artigo público no site é outra coisa, com outro dono (redator de aquisição, gatilho já registrado no `CLAUDE.md`) |
| **Ler o histórico de conversas anterior à conexão** | Três razões somadas. (a) **Técnica, e é a que trava:** a Cloud API não entrega mensagens anteriores ao momento em que o webhook passa a existir; o que existiria seria a coexistência com o aplicativo, que o ADR 012 (regra 5) deixou fora da v1 e que está como `nao_testado` em `dados.md`. (b) **Consentimento:** exige autorização explícita, com peso de LGPD, e é hipótese não verificada que o dono aceite (`integracoes.md` §10). (c) **É substituível:** uma semana atendendo entrega as perguntas reais dele sem nada disso. Ver 12.10 | A coexistência do ADR 012 ser confirmada na validação da fase 1 **e** 5 contas pedirem. Mesmo aí, entra como acelerador, nunca como caminho |
| **Base ilimitada por despejo de documento** | Custo (12.9) e qualidade: documento sem curadoria produz base contraditória, e base contraditória produz Otto que inventa | Nada. Rejeitada, não adiada. O que existe é material → propostas → conferência |
| **Prompt livre / "escreva como o Otto deve ser"** | ADR 002 já decidiu. O que o dono ensina é conhecimento do negócio, nunca comportamento | O gatilho do próprio ADR 002 (10 pedidos de estilo inexistente) |
| **Pastas, categorias ou etiquetas nas respostas** | Mesma razão da decisão B (5.3): conjunto aberto que o dono inventa e mantém degenera em 30 dias. E o Otto acha o que precisa sem elas | Nada previsto |
| **Barra de progresso / selo de "Otto treinado"** | Mede tamanho da base, que é a coisa errada, incentiva despejo (que custa margem) e é a barra sem número que a regra 7 proíbe | Nada. Rejeitada |
| **Revisão periódica agendada da base** | Ninguém faz. Lembrete de revisão é o mais fácil de ignorar que existe | Nada. Substituída pela pergunta de um toque (12.6.5) |
| **Importar base de outro chatbot** | Sem demanda observada, e o formato de cada concorrente é diferente | 5 contas distintas pedirem (`suporte.pedido_registrado`) |
| **Histórico de versões e quem editou cada resposta** | Ninguém olha em 90 dias (regra 10 do plano de dados). Com 1 a 3 pessoas na empresa, "quem editou" não é pergunta | Modo Equipe com mais de 5 atendentes editando |
| **Base compartilhada entre empresas do mesmo nicho** ("o que outras assistências responderam") | Tentador e perigoso: é a única peça deste desenho com risco de vazar conteúdo de um cliente para outro, o mesmo risco que o ADR 021 evitou não fundindo identidades. E preço de concorrente vazado é dano real | **Nada. Rejeitada, não adiada.** A base do nicho existe, mas é escrita pela operação, do zero, nunca copiada de conta de cliente |
| **Escrever a base pelo Otto a partir do site da empresa** | A maioria deste nicho não tem site (`tem_site_email_ou_so_whatsapp`, `dados.md` 6.1, ainda sem resposta) | O registro de campo mostrar 5 em 10 com site com conteúdo |

### 12.8 Fichas comportamentais

Nada aqui sustenta escopo caro. As duas telas novas são leitura e edição de texto; as três barras vivem dentro de telas que o ADR 012 e o ADR 015 já exigiam. A parte que seria cara — leitura de histórico, base ilimitada por documento, base compartilhada — ficou de fora, e ficou justamente porque a evidência não a sustenta.

Duas fichas (12.1 e 12.3) são respondíveis **sem escrever uma linha de código**, nas 10 conversas de campo que já vão acontecer.

> **A revisão de 2026-09-09 acrescentou cinco fichas — 12.13 a 12.19 — e elas estão em 12.13.7**, não nesta tabela, para o diff da revisão ficar legível. A ficha **12.1 continua valendo com o limiar dela intacto**; o que mudou foi o denominador, que agora se lê nas duas rodadas separadas.

| # | Afirmação | Onde sustenta | Tipo | Evidência hoje | Comparável | Taxa mínima | Como se mede | O que a mata | Grau |
|---|---|---|---|---|---|---|---|---|---|
| 12.1 | O dono confere e corrige uma resposta pronta mais do que escreve uma do zero | A decisão C inteira. É a tradução de "confere se acertei" (`integracoes.md` §3) | Taxa | Nenhuma. Procurei taxa de conclusão de onboarding pré-preenchido × em branco e não abri fonte nesta sessão | Sem análogo conferido; **não inventar magnitude**. Direção robusta (§4): campo em branco cobra custo de decisão (inventar a taxonomia) que a escolha binária não cobra. Comportamento existente, e é o melhor sinal disponível: ele **já digita** essa resposta várias vezes por semana no WhatsApp | 6 de 10 contas conferem (confirmam ou corrigem) ao menos 5 das 10 propostas do onboarding | `conta.ativada.respostas_conferidas_no_onboarding` sobre `respostas_propostas_no_onboarding`, nas 10 primeiras contas, com o absoluto | Menos de 3 em 10 → o passo sai do onboarding e sobra só o mecanismo do dia a dia (barra da conversa). **Antes de código:** sessão de 10 minutos com 5 donos, com as 10 perguntas em papel | NÃO VERIFICADO |
| 12.2 | O dono toca em "guardar essa resposta" logo depois de responder ao cliente | A barra da conversa (12.5.D), que é o motor da decisão | Taxa | Nenhuma | Direção robusta (§4, custo de desvio): gesto acoplado à ação que ele já executou supera ir a uma tela. Magnitude local | 1 em 3 respostas do empregador em conversa que o Otto não soube vira resposta guardada, nos primeiros 30 dias | `base.atualizada` com `origem = conversa` sobre conversas com `qtd_nao_sei ≥ 1` e `mensagens_da_equipe > 0`, por conta | Menos de 1 em 10 → a barra não funciona, e o peso passa inteiro para a pergunta no WhatsApp (12.5.G), que o Felipe autorizou em 2026-09-09. **A decisão C deixou de ter um motor só**, e por isso esta ficha deixou de ser fatal | NÃO VERIFICADO |
| 12.3 | O dono deste nicho **não tem** material escrito sobre o negócio em formato de arquivo | Rebaixar upload de porta a acelerador, e priorizar foto e áudio sobre PDF (12.5.F) | Capacidade / comportamento existente | Nenhuma, e **é a mais barata de conseguir**: cabe numa pergunta das 10 conversas de campo, com "posso ver?" | Sebrae TIC 2025 (47% usam software integrativo) é `COMPARÁVEL` quanto a porte, mas mede software, não material escrito. Não serve de proxy direto | 6 em 10 não têm nada em arquivo, ou têm só papel e foto | Coluna nova no registro de campo: `tem_material_escrito_do_negocio` (12.10) | 5 em 10 mostrarem tabela ou lista em arquivo digital → upload sobe para porta co-principal e PDF/planilha vêm antes de foto | NÃO VERIFICADO |
| 12.4 | A base do nicho acerta o bastante para o dono confirmar em vez de reescrever | A regra 4 de 12.2 (a proposta vem do nicho), e todo o passo do onboarding | Taxa | Nenhuma | Não se aplica: é qualidade de um artefato que a operação ainda vai escrever | Metade das 10 propostas confirmadas sem edição | `base.atualizada.acao = confirmou` sobre `confirmou + editou + recusou` com `origem = onboarding` | Mais de 7 em 10 editadas → a base do nicho está errada e a proposta tem que sair só do perfil e da descrição. **Antes de código:** escrever as 10 perguntas do nicho e mostrar a 5 donos, pedindo que apontem o errado | NÃO VERIFICADO |
| 12.5 | O Otto atendendo cru na primeira semana não derruba a confiança do dono | A decisão de o Otto atender antes de aprender (12.3) | Ausência / atribuição. **Não se pergunta o porquê; mede-se a incidência** | Nenhuma | Não se aplica | Incidência, não taxa | `suporte.pedido_registrado.categoria ∈ (resposta_errada, nao_consegui_ensinar)` na primeira semana; `assinatura.situacao_alterada` para cancelada nos primeiros 7 dias; M2 da semana 1 contra a da semana 4, por conta | 3 das 10 primeiras contas reclamarem ou cancelarem na primeira semana → o Otto não atende antes de a conferência do onboarding estar feita, e a ativação volta a depender da hipótese frágil (pior, mas honesto) | NÃO VERIFICADO |
| 12.6 | O dono fecha buraco pelo bloco do resumo do dia | O bloco "o que o Otto não soube" (12.5.E) | Sequência / hábito. **Sem gatilho externo.** Herda a ficha crítica de `dados.md` | Nenhuma | Direção robusta: um toque acoplado a algo que ele já abriu supera ir a uma tela. Mas depende de ele abrir, e essa é a hipótese crítica do projeto | 1 em 3 "não soube" vira resposta em 48 h — **é o mesmo limiar que `dados.md` já declarou** para "o empregador que vê 'o Otto não soube X' adiciona X à base em 48 h". Não crio limiar novo | `base.atualizada` com `origem ∈ (sugestao_do_resumo, pergunta_do_dia)` em 48 h após `resumo.aberto`, sobre `qtd_nao_sei` do dia | O limiar de `dados.md`. **Se falhar, a causa provável não é o bloco: é o resumo não ser aberto.** Ler junto com `resumo.aberto` antes de mexer no bloco | NÃO VERIFICADO |
| 12.7 | O dono pergunta ao Otto antes de conectar o número | A tela "Conversar com o Otto" (12.5.B) e a decisão de ela substituir o modo de teste | Taxa | Nenhuma | Direção robusta: oferta de um toque no fim de um passo que ele acabou de concluir supera menu | Metade das contas conversa ao menos uma vez antes de conectar | `conta.ativada.conversou_com_o_otto_antes_de_conectar`; e o mesmo dado responde ao gatilho de modo de teste do ADR 015, de graça | Menos de 2 em 10 → a tela sai do fim do onboarding e vira só item de painel. Não a mata: ela continua sendo onde se corrige o que o Otto erra | NÃO VERIFICADO |
| 12.8 | O dono manda foto do caderno ou da folha da bancada para o Otto no WhatsApp | A regra de foto e áudio antes de PDF (12.5.F) | Capacidade | Nenhuma medida local | Direção robusta e forte: mandar foto no WhatsApp é o gesto que este público mais executa por dia. Magnitude local | Não é taxa; é capacidade. 5 de 5 donos numa sessão conseguem, sem instrução | Sessão de 10 minutos, com o celular deles, pedindo "manda pro Otto o que você tem escrito sobre preço" | Alguém não achar como mandar, ou mandar e o Otto não entender a foto → a leitura de foto sai da v1 e sobra planilha e texto | NÃO VERIFICADO |
| 12.9 | O Otto consegue transformar foto de tabela manuscrita e áudio em resposta aproveitável | 12.5.F inteiro | Capacidade (do produto, não da pessoa) | Nenhuma | Não se aplica | 3 de 5 fotos reais renderem base aproveitável — **mesmo limiar que `integracoes.md` §10 já usa** para a leitura de histórico | Teste com 5 materiais reais coletados nas conversas de campo, antes de escrever a tela. Tarefa do treinador-do-otto | Menos de 3 em 5 → material vira só "me conta o que tem nessa foto", e o Otto pergunta em vez de ler | NÃO VERIFICADO |
| 12.10 | Contradição entre uma resposta nova e uma antiga é detectável sem falso positivo que irrite | O bloqueio de 12.6.4, único ponto que trava o fluxo | Capacidade (do produto) | Nenhuma | Não se aplica | Menos de 1 falso alarme a cada 10 respostas guardadas | Contar quantas vezes a tela de conflito aparece sobre `base.atualizada`, e ler as 10 primeiras à mão | Mais de 3 em 10 alarmes falsos → a contradição deixa de travar e vira aviso depois do fato ("essas duas brigam, dá uma olhada") | INFERIDO |
| 12.11 | O dono responde a pergunta do Otto no WhatsApp dele | 12.5.G inteiro, e o motor do modo Recado | Taxa. **Com gatilho externo**, e é o único mecanismo deste documento que tem | Nenhuma | Direção robusta e a mais forte que este documento usa (§1 e §4): mensagem que chega supera gesto que depende de lembrança; e o canal é o que ele já tem aberto o dia todo. **Magnitude local, não inventar** | Metade das perguntas respondidas em 24 h, em metade das contas | `base.atualizada` com `origem = pergunta_no_whatsapp` sobre as perguntas enviadas (denominador em 12.12.3) | Menos de 1 em 4 respondidas → o corte de G.3 dispara sozinho em quase todas as contas, e a pergunta sai da v1. Não fica meio-termo: pergunta ignorada queima o canal para o aviso de encaminhamento e para o aviso de créditos | NÃO VERIFICADO |
| 12.12 | Perguntar todo dia **não** faz o dono ignorar as outras mensagens do Otto | O teto de uma por dia e a regra de fila de G.3 | **Ausência.** É o dano que não gera reclamação: ele não diz "parei de ler suas mensagens", só para de ler | Nenhuma. Canal passivo não mede | Direção robusta: frequência sem retorno reduz atenção. Magnitude local | Taxa de abertura do link do aviso de encaminhamento (ADR 012) **não cai** entre contas com a pergunta ligada e desligada | `conversa.encerrada.quem_assumiu` e `tempo_ate_equipe_assumir_s`, no modo Aviso, comparando contas com a pergunta ligada e desligada. **A comparação existe de graça** porque haverá contas desligadas | Tempo até assumir subindo, ou "ninguém assumiu" subindo, nas contas com a pergunta ligada → a pergunta passa a ser semanal, não diária | NÃO VERIFICADO |

### 12.9 O limite de custo, e como ele aparece na tela

Custo é limite de desenho aqui, não detalhe técnico. `cobranca.md` fecha a margem em 63% a 68% com uma premissa dura: **o prefixo de cada empresa** — caráter, estilo, base e portas, cerca de 5.100 tokens — **é byte-idêntico e escrito uma vez por dia** (medida 4, "requisito, não otimização"). Base maior significa prefixo maior, e prefixo maior significa margem menor em toda conversa daquela empresa, todos os dias.

**O orçamento foi fechado pelo treinador-do-otto** (`docs/tecnico/conversa.md` §3), com a aritmética de margem por faixa: **alvo de 4.000 tokens** para o que o Otto sabe de cor (margem 66,3% na faixa de entrada) e **teto duro de 8.000** (margem 63,0%, o piso da faixa aprovada — passou disso, a faixa de entrada tem a margem da faixa de cima). A conta pequena é quem paga mais caro por token, porque a escrita diária amortiza sobre menos conversas: o orçamento é dimensionado pela faixa de R$ 197.

Isso produz três regras de desenho, e nenhuma delas aparece como jargão para o dono:

| Regra | Efeito na tela |
|---|---|
| **O de cor tem teto: cerca de 60 respostas curtas** (8.000 tokens, `conversa.md` §3; o alvo de projeto são 4.000, cerca de 30 respostas) | O contador honesto ("o Otto sabe 14 respostas") e o estado "de cor cheio" de 12.5.C. Nunca token, nunca caractere, nunca barra |
| **O resto é consultado, não decorado** (medida 2 de `cobranca.md`) | O material grande (tabela de 200 linhas, catálogo) entra sem estourar o teto, e o dono não precisa saber por quê. A distinção só aparece quando o teto enche |
| **Resposta guardada é curta por construção** | O Otto reescreve o que o dono digitou no formato de resposta a cliente (12.5.D). Isso é qualidade **e** é economia; as duas coisas empurram na mesma direção, o que é raro |

**O que isso me fez tirar do desenho, e é a decisão de custo mais importante desta seção:** não existe "mande todos os seus documentos e o Otto aprende tudo". Existe "mande o material, o Otto tira respostas, você confere". A diferença entre as duas frases é a margem do produto inteiro.

**Duas ressalvas do treinador, que mudam o número na tela e não o desenho:**

1. **A segunda camada não existe na v1.** "O resto é consultado" pressupõe recuperação, e `conversa.md` §3.3 mostra que buscar trecho por mensagem custa **6,4×** o token cacheado — é a forma mais cara de guardar conhecimento, e só empata acima de ~4.900 tokens de base. A recuperação entra por gatilho de incidência (3 contas no teto, ou mediana acima de 5.000), e **acrescenta cauda sem tirar o núcleo do cache**. Até lá, tudo o que o Otto sabe é de cor, e o teto de 8.000 é o teto do produto.
2. **Nada disso está medido.** Os números saem da aritmética de `cobranca.md`, que é internamente ambíguo sobre o tamanho de base embutido em R$ 0,295. A rodada 0 fecha. Se der outro número, o número na tela muda — o desenho não.

### 12.10 Documentação: não, e o que entra no lugar

**Não escrever guia nem central de ajuda no painel.** Três motivos:

1. **Ele não lê.** O dono deste nicho nunca usou "sistema" e está com o celular na bancada. Direção robusta; magnitude não aberta. Um guia é um documento que ele precisa ler e depois traduzir em ação, e a tradução é a parte que falha.
2. **Guia é o sintoma, não o remédio.** Se a tela precisa de guia, a tela está errada. A decisão C inteira existe para o gesto ser autoexplicativo: uma pergunta de cliente, uma resposta escrita, dois botões.
3. **A parte útil do guia funciona melhor como exemplo.** O conteúdo real que um guia teria — *resposta curta e específica funciona; resposta longa e genérica faz o Otto errar* — cabe no campo de edição, no momento em que ele escreve, como a resposta já preenchida que ele está corrigindo. O exemplo bom é o próprio texto que ele está lendo.

**O que entra no lugar, em três lugares:**

| Lugar | O que faz |
|---|---|
| A resposta pré-preenchida | É o exemplo. Ele aprende o formato corrigindo um formato certo, não lendo sobre ele |
| A conversa de teste (12.5.B) | É o retorno. Ele vê o efeito do que ensinou na hora, o que nenhum guia entrega |
| A frase de consequência em cada tela | Uma linha, sempre com o efeito concreto: "da próxima vez ele responde sozinho", "ele passa a dar sozinho". Nunca instrução geral |

**Onde documentação escrita SIM faz sentido, e não é aqui:** uma página pública no site — *como o Otto aprende sobre o seu negócio* — para quem pesquisa antes de comprar. Público diferente (ainda não é cliente), propósito diferente (venda e SEO), dono diferente (redator de aquisição, cujo gatilho já está no `CLAUDE.md`: "quando houver site"). Não é desta seção e não é minha.

#### Uma proposta de revisão a `integracoes.md` §3

`integracoes.md` chama a leitura do histórico do WhatsApp de "a jogada mais forte da camada 0". Depois de desenhar isto, discordo em parte, e registro para quem for revisar aquele documento:

**A jogada mais forte da camada 0 não é ler o histórico para trás; é acumular a partir de agora.** Uma semana atendendo entrega as perguntas reais daquela empresa, com o vocabulário daqueles clientes, sem depender de (a) a Meta entregar histórico que a Cloud API não entrega, (b) consentimento com peso de LGPD que é hipótese não verificada, e (c) a capacidade não verificada de extrair base útil de conversa antiga. Custa zero, já está autorizado pelo ADR 014, e o produto já ia atender de qualquer forma.

O que a leitura retroativa daria e a acumulação não dá é **cobrir a primeira semana**. E esse buraco tem uma resposta mais barata e sem dependência nenhuma: **a base do nicho** (ADR 007). É por isso que ela é a primeira linha da tabela de fontes em 12.2.

### 12.11 O que o Felipe decidiu, e o que sobrou

#### 12.11.1 O Otto pode puxar a conversa com o dono pelo WhatsApp para aprender?

**Decidido em 2026-09-09. Sim.** Nas palavras dele: *"Se o cliente autorizar, sim. Por padrão será autorizado."*

O desenho do consentimento, do teto, do texto, do corte por silêncio e da conferência contra o ADR 016 está em **12.5.G**. O que a decisão libera:

- **O modo Recado ganha motor.** Era o buraco declarado da ficha 12.2 e da jornada 2.
- **O produto ganha o primeiro gatilho externo que ele tem.** Toda a fragilidade deste projeto — abrir o resumo, marcar recado retornado, alimentar a base — é da mesma família: gesto que depende de lembrança. Este é o primeiro que não depende.
- **Uma consequência que o Felipe não pediu e que eu registro:** o canal agora existe, e a **decisão D o reaproveita**. Não invento um segundo canal para o aviso de créditos.

**O que isso obriga a rever, e não é meu:** a pendência 13 de `dados.md` está decidida como "o resumo do dia é só painel na v1". Isto não é o resumo — é uma pergunta pontual, com teto de uma por dia — mas usa o mesmo canal, e o analista de produto precisa saber que o canal deixou de estar fechado. `resumo.aberto.canal` continua só `painel`; o que muda é que agora há precedente para o Felipe reabrir aquela pendência com custo de engenharia perto de zero.

#### 12.11.2 O passo "confere se acertei" entra no onboarding, antes de conectar o número?

**Decidido em 2026-09-09. Sim.** Fica como está em 12.5.A: antes de conectar, com saída livre em toda tela e sem cobrança no texto de saída.

#### 12.11.3 O teto do que o Otto sabe de cor é visível ao dono?

**Decidido em 2026-09-09: visível.** Fica como está em 12.9 e em 12.5.C.

A resposta do Felipe trouxe junto **outro assunto**, que não é o teto do que o Otto sabe e sim **os créditos do mês acabando** (ADR 004): *"o cliente deve ser avisado quando está acabando e existe o risco de respostas não serem respondido. Coloque a possibilidade de comprar um pacote extra de atendimentos. deve ser mais caro que a assinatura para incentivar o upgrade de plano."* Isso é a jornada "saldo acabando", que a seção 1 tinha listado como adiada, e virou a **decisão D, seção 13**.

#### 12.11.4 Ainda aberto

1. **Rejeitar a base compartilhada entre empresas do mesmo nicho** (12.7)? É a única linha desta seção com risco de vazar conteúdo entre clientes. **Segue como rejeitada no desenho**, e a pergunta continua na mesa: recomendo rejeitar, não adiar.
2. **Registrar no ADR 016 que falar com o empregador não é a mesma classe de risco que falar com o cliente final** (12.5.G.5)? Sugestão minha, para o precedente não ficar solto.

### 12.12 Eventos — proposta ao analista de produto

`dados.md` tem 19 eventos e teto de 20. **A decisão C cabe sem gastar o teto: zero eventos novos, campos novos em quatro eventos existentes e uma coluna nova no registro de campo.** Mesma disciplina das decisões A e B.

#### 12.12.1 `base.atualizada` (evento 13) — o evento central desta decisão

Ele já existe e já é o dono da pergunta 2.2 de `dados.md`. O que muda:

| Campo | Hoje | Proposta |
|---|---|---|
| `acao` | `adicionou, editou, removeu, importou_planilha, importou_historico` | Acrescentar **`confirmou`** (o toque "tá certo", sem mudar nada), **`aceitou_proposta`** e **`recusou_proposta`**. `confirmou` é o mais importante dos três: sem ele, não dá para separar "conferiu e estava certo" de "não conferiu", que é a distinção que a decisão inteira mede |
| `origem` | `manual, sugestao_do_resumo, importacao` | Acrescentar **`onboarding`**, **`conversa`** (a barra de 12.5.D), **`conversa_de_teste`**, **`pergunta_do_dia`** (envelhecimento), **`material_enviado`** e **`pergunta_no_whatsapp`** (12.5.G, decidida em 2026-09-09). **É o campo que responde qual porta funciona** — a leitura mais importante que este desenho produz |
| — | — | **`conversa_id uuid?`**: qual conversa originou. Sem ele, a ficha 12.2 não tem denominador |
| — | — | **`fonte_da_proposta enum(nicho, perfil_whatsapp, catalogo, descricao_do_negocio, resposta_do_empregador, material_enviado)?`**: qual fonte da camada 0 acertou. Responde a ficha 12.4 e diz se vale escrever base de nicho para o nicho seguinte |
| — | — | **`itens_de_cor int`**: quantas respostas estão no prefixo cacheado depois desta ação. É o dado do teto de 12.9 e liga o desenho à margem |
| — | — | **`itens_propostos int?`** e **`itens_aceitos int?`**: só quando `acao ∈ (importou_*, aceitou_proposta)` em bloco. Mede se material vale a tela (ficha 12.9) |

CHECK sugerido: `fonte_da_proposta` não nulo quando `acao ∈ (confirmou, aceitou_proposta, recusou_proposta)`; `conversa_id` não nulo quando `origem ∈ (conversa, conversa_de_teste)`.

#### 12.12.2 Campos em outros três eventos

| Evento | Campo | Para quê |
|---|---|---|
| `conta.ativada` (3) | **`respostas_propostas_no_onboarding int`** e **`respostas_conferidas_no_onboarding int`** | Ficha 12.1, a principal. `itens_na_base` já existe e não responde: não separa proposto de conferido |
| `conta.ativada` (3) | **`conversou_com_o_otto_antes_de_conectar bool`** | Ficha 12.7 — e responde de graça ao gatilho de modo de teste do ADR 015, que hoje só tem categoria de suporte |
| `resumo.aberto` (14) | `acao_seguinte` ganha **`confirmou_resposta`**; e campo novo **`pergunta_do_dia_tipo enum(qualidade, envelhecimento)`** | Agora há duas perguntas de um toque possíveis (12.6.5), e `resposta_pergunta_do_dia` significa coisas diferentes em cada uma. Sem o tipo, o campo vira ambíguo e a pendência 2 de `dados.md` fica ilegível |
| `suporte.pedido_registrado` (19) | `categoria` ganha **`nao_consegui_ensinar`** | Fichas 12.5 e 12.9. `resposta_errada` cobre o Otto errando; não cobre o dono não conseguindo consertar |

#### 12.12.3 O denominador da pergunta no WhatsApp — a única coisa que pede uma fusão

A decisão de 2026-09-09 criou um problema de medição que os campos acima não resolvem, e ele é exatamente o que a `behavioral-evidence` §10 chama de achado bloqueante: **`base.atualizada` conta as perguntas que o dono respondeu, e nada conta as que ele ignorou.** Sem denominador, a ficha 12.11 não é mensurável e o corte de 12.5.G.3 não tem como disparar por dado.

Dá para derivar o denominador (dias com `fixa_nao_sei` × canal ligado), mas a derivação erra em dois pontos que importam: **falha de envio fica invisível** e **o custo do template não entra em M7**, que hoje só conta `pessoas_avisadas`. Os dois erros crescem com a decisão D, porque o aviso de créditos usa o mesmo canal.

**Proposta ao analista: uma fusão, zero eventos novos, o teto de 20 intacto.**

`saldo.limiar_cruzado` (evento 10) já é o caso particular de "o Otto avisou o empregador de alguma coisa por conta própria". Ele vira **`aviso.enviado`**, que cobre todos os avisos que o Otto **inicia** — limiar de créditos, pergunta de aprendizado, e o que vier depois. Mesma jogada de `recado.retornado` → `conversa.marcada` na decisão B: o evento sai e volta mais geral, sem gastar o teto.

Payload proposto: `motivo enum(creditos_80, creditos_100, pergunta_de_aprendizado)`; `canal enum(painel, whatsapp)`; `janela enum(servico, template)` — **é aqui que o custo por mensagem entra em M7**; `entregue bool`; `respondido bool` (preenchido pelo job do dia seguinte); `acao_seguinte enum(nenhuma, respondeu_a_pergunta, desligou, comprou_mais_100, subiu_de_faixa, abriu_o_painel)?`; `dias_seguidos_sem_resposta int` — **é o gatilho do corte de G.3, e ele precisa estar no evento para o corte ser auditável**; `ciclo_id uuid?` e `dia_do_ciclo int?` (só nos motivos de crédito, preservando o que o evento 10 já respondia).

Chave de idempotência: (`empresa_id`, `motivo`, data) para a pergunta diária; (`empresa_id`, `ciclo_id`, `motivo`) para os limiares, que é a chave que o evento 10 já tem.

**A fronteira, para não virar evento genérico de tudo:** `aviso.enviado` é o que o Otto inicia **fora de conversa**. O aviso de encaminhamento (ADR 012) e o aviso de contato fora do atendimento (ADR 015) **não entram**: nascem de uma conversa, já têm casa em `encaminhamento.solicitado.pessoas_avisadas` e `conversa.iniciada.pessoas_avisadas`, e mudar isso quebraria M4 e M7 sem ganho.

**Efeito colateral bom:** se o Felipe reabrir a pendência 13 de `dados.md` (aviso do resumo do dia por WhatsApp), o evento já existe e é só mais um `motivo`.

#### 12.12.4 Uma coluna nova no registro de campo (fase 0, sem código)

| Coluna | Pergunta literal | Como preencher |
|---|---|---|
| `tem_material_escrito_do_negocio` | "Você tem alguma coisa escrita sobre o negócio — tabela de preço, lista de serviço, garantia? **Posso ver?**" | Literal, mais `viu = sim/nao` e `formato` (papel/foto no celular/planilha/pdf/nada). É a evidência da ficha 12.3, custa uma linha na conversa que já vai acontecer, e pode inverter a prioridade entre foto e PDF **antes** de alguém escrever a tela |

Mesma jogada de `escreve_e_nao_e_cliente` na decisão A: a evidência mais barata do desenho está numa pergunta de campo, não num evento.

#### 12.12.5 O que este desenho pede e ainda não existe

Duas leituras que dependem do que já foi proposto acima e valem ser nomeadas para o analista:

1. **Taxa de buraco fechado, por porta.** `base.atualizada` agrupado por `origem`, sobre os buracos do período (`resposta.enviada.tipo_resposta = fixa_nao_sei`, contas distintas). É o que diz qual é o motor: a barra da conversa, a pergunta no WhatsApp, o resumo, ou nenhum dos três. **É a leitura mais importante da decisão C**, e o `origem` que ganhar é o que sobrevive na v1.1; os outros podem sair.
2. **M2 na semana 1 contra a semana 4, por conta.** Não é métrica nova: é M2 lida em duas janelas. É o número que mostra se ensinar está funcionando, e é a única coisa nesta seção que o **empregador** também deveria ver, em uma linha, no fim da primeira semana. Texto ao guardião:

> Na primeira semana o Otto respondeu sozinho 4 de 10. Esta semana, 7 de 10. As respostas que você deu fizeram isso.

**Aprovado.** Dois números e a causa, sem adjetivo. É o oposto do "relatório inflado" que a `persona-otto.md` proíbe, e a última frase dá o crédito a quem é — o dono, não o produto.

### 12.13 Revisão de 2026-09-09 — afirmações, lote e rodadas

**Pedido do Felipe, em 2026-09-09**, sobre o passo 12.5.A:

> *"quando um cliente se cadastra no otto, creio que ele deve responder a pergunta: 'Me diga qual é o seu negócio', e a partir disso devem ser gerados algumas afirmações, como por exemplo 'Preparei algumas informações que acredito que sejam verdadeiras para o seu negócio. Confira antes de eu começar a atender' e o cliente confirma o que é verdadeiro o que é falso, talvez usando um sistema de tags, e a partir disso vai para as próximas afirmações, até ele entender o negócio da pessoa"*

A proposta coincide com o ADR 022 em espírito — conferir, não escrever — e difere em quatro pontos concretos. Esta seção decide os quatro, reescreve 12.5.A (já feito, acima) e guarda o que foi substituído (12.13.8).

**Resumo em uma linha: aceito os quatro, três inteiros e um com um corte.** A afirmação entra como forma principal do escopo; o lote entra com uma regra de segurança que o pedido não tinha; as rodadas entram com teto de duas; e a pergunta aberta vira tela própria. **O passo encolheu de 12 telas para 8.**

> **Segunda rodada de revisão, mesmo dia.** O treinador-do-otto conferiu esta seção contra `conversa.md` §2.7 e devolveu duas coisas, as duas de forma, as duas decididas aqui: **onde a `lista` aparece** (12.13.11) e **se a geração alimenta a rodada 2 quando não há arquivo de nicho** (12.13.12). Ele aceitou o teto de duas rodadas pelo argumento de partição e retirou a palavra "arbitrário"; retirou o experimento de rodar além do teto e o campo `rodada` que ia pedir ao analista; e confirmou a compatibilidade da recusa. **Nada de 12.13.1 a 12.13.9 foi reaberto.** Custo do desenho: R$ 0,066 por conta ativada, R$ 0,113 no pior caso.

#### 12.13.1 Ponto 1 — Afirmação × par pergunta-e-resposta

**Decisão: as duas convivem, com fronteira de tipo de item, não de gosto. Afirmação para o escopo, par para o número.**

A fronteira não é nova: ela já existe no esquema. `bases-de-nicho/README.md` §3.2 tem três tipos de item, e eles pedem molduras diferentes:

| Tipo de item | Moldura de conferência | Por quê |
|---|---|---|
| `escolha` (*vocês fazem X?*) | **Afirmação.** "Você troca tela de iPhone" · [Sim] · [Não] | O julgamento é atômico e binário. O par "um cliente pergunta X / eu respondo *fazemos X*" gasta duas frases para pedir um bit |
| `fato` com lacuna (`R$ ___`, `___ dias`) | **Par pergunta-e-resposta**, como estava | Não há nada para afirmar: o número não existe ainda. E o par carrega a única informação que motiva o gesto — *isto é o que perguntam para você* |
| `lista` | Tabela, como estava | Fora do onboarding (§4.2 do README: no máximo uma por arquivo, e ela não cabe numa tela de celular) |

**O que a afirmação ganha, e não é pequeno.** Ela é a moldura mais fiel ao que fica guardado. `conversa.md` §2.2 já recusou pergunta-e-resposta como formato de armazenamento: o que fica no banco é o `texto` do item, que **é uma afirmação**. O campo `pergunta` existe para a tela e para a avaliação, e "nunca entra no `<base>`". Ou seja: a moldura de par era a única parte do desenho que mostrava ao dono uma forma que o produto não usa por dentro. O pedido do Felipe alinha os dois.

**O que a afirmação perde, e por isso ela não vence sozinha:**

1. **Ela não acomoda lacuna.** "A troca de tela custa R$ ___" não é verdadeira nem falsa.
2. **Afirmação composta é armadilha.** "A troca de tela do iPhone 11 custa R$ 340, com 90 dias de garantia, pronto no mesmo dia" tem três fatos e um botão. Ele não consegue dizer *o preço está certo, a garantia não*. Regra que decorre: **uma afirmação, uma oração, um fato.** Item que precisaria de duas orações não é afirmação — é `fato` e vai para a rodada 2.
3. **Ela não diz por que importa.** "Um cliente pergunta X" é a razão de o gesto existir. Sem isso, conferir uma lista de frases é tarefa de conformidade. Por isso a rodada 1 abre dizendo *confere antes de eu começar a atender* — a frase do próprio Felipe, que faz esse trabalho.

**A regra 2 do ADR 022 não precisa de revisão. Precisa de uma frase de fronteira**, que já está escrita em 12.2: *a regra 2 é sobre como o conhecimento é guardado, não sobre a moldura em que ele é conferido.*

**O que a afirmação vira por dentro, exatamente:**

| Gesto | Item resultante | Situação |
|---|---|---|
| [Sim] | `opcoes.sim` do item `escolha` → `texto` do item. Ex.: `Fazemos troca de tela de iPhone.` | `vigente` |
| [Não] | O texto negativo do item → `texto`. Para o `escolha` da rodada 1 o campo é `opcoes.nao`; `negativa` é o campo do `fato` (correção de fato do treinador-do-otto, não de decisão). Ex.: `Atendemos só Android.` | `vigente` |
| Não tocou | **Nada.** Item continua `rascunho`, não renderiza, o Otto não sabe | `rascunho` |

Nenhum tipo de item novo, nenhuma coluna nova em `conversa.md` §2.3. A afirmação é uma **vista** do `escolha` que já existe.

#### 12.13.2 Ponto 2 — Lote com chips × uma por tela

**Decisão: lote entra, com uma regra que o pedido não tinha, e ela é a razão de o lote ser seguro.**

> **Linha em branco significa "não li". Nunca significa "é falso".**

O problema do lote **não é aquiescência em abstrato** — é o que o estado não tocado significa. Numa lista de chips de seleção múltipla, "não marcado" é ambíguo entre *é falso* e *não li*, e neste produto as duas consequências são opostas:

- *É falso* produz um item negativo, e o Otto **afirma para o cliente final** que a empresa não faz aquilo — e a forma dessa afirmação é regra, não escolha: ela aponta o que a empresa faz no lugar ou entrega a pessoa a alguém, nunca termina na recusa (`bases-de-nicho/README.md` §5.2).
- *Não li* deveria produzir silêncio: o Otto diz que não sabe e encaminha.

Um dono distraído que envia com 3 marcadas de 8 ensina o Otto a negar cinco serviços que ele presta. Isso é **pior que o Otto não saber**, é a regra 1 do caráter quebrada por desenho de tela, e é invisível: recusa errada não gera reclamação do cliente final, gera cliente que some (`behavioral-evidence` §1, ausência).

Por isso o lote **não é chip de seleção múltipla**. É uma tela só com N linhas, cada uma com dois botões e nenhum padrão:

| Forma | Custo de execução | Custo de decisão | Estado não tocado | Veredito |
|---|---|---|---|---|
| Chips de seleção múltipla (o pedido, literal) | O menor de todos | Baixo por item, mas o caminho mais barato de completar é enviar sem ler | **Ambíguo, e ele é carga.** Vira `negativa` ou vira nada, e a tela não distingue | **Recusado** |
| **Uma tela, N linhas, [Sim]/[Não] por linha, nada marcado** | Baixo: 8 toques, sem transição de tela, polegar em uma região | Baixo por item, e a decisão é forçada a ser explícita | **Inerte e visível** ("faltam 2") | **Escolhido** |
| Uma afirmação por tela | Alto: 8 transições de tela para 8 bits | O menor | Não existe | Recusado: paga 8 telas para o mesmo bit |

**O ganho do lote é real e não é preguiça de desenho:** a rodada 1 não tem teclado, não tem transição de tela e não tem espera. Oito bits em uma tela é o formato mais barato que existe para conferir escopo — e conferir escopo é o que decide o resto do onboarding.

**O que NÃO pode entrar em lote — o palpite está confirmado, e com mecanismo:**

> **Nenhuma afirmação com número entra em lote. Nem preço, nem prazo, nem garantia, nem percentual, nem quantidade de sessões.**

Três razões independentes, e qualquer uma sozinha basta:

1. **Ler um número é um ato mais lento que reconhecer um nome de serviço.** Numa lista, o item lento herda o ritmo dos rápidos. Misturar as duas coisas é desenhar para a leitura errada.
2. **Lacuna em branco não cabe em lista.** `R$ ___` pede teclado numérico; teclado aberto dentro de uma lista de 8 linhas encolhe a viewport do celular, move a rolagem e desalinha o que já foi tocado. Mecânico, não estético.
3. **Erro de escopo se autocorrige na conversa; erro de preço não.** Se o Otto disser "não fazemos Xiaomi" para quem faz, o cliente contesta, o Otto encaminha, o dono vê e conserta — custa um lead. Se o Otto disser R$ 280 onde é R$ 340, o cliente **aceita e aparece na loja** esperando aquele preço. O dono honra ou desdiz, e as duas saídas são caras. É exatamente o que a regra 6 do caráter existe para impedir ("não estima, encaminha"), e não pode ser reintroduzido por uma tela.

**E a regra vale também para o que o modelo gera.** Afirmação gerada a partir da descrição em texto livre que contenha um dígito **é descartada antes de chegar à tela** — não é reescrita, não é mostrada com aviso: some. Uma afirmação com preço gerada pelo modelo e confirmada com um toque é o modelo inventando um número e o dono carimbando. É a mesma regra que o lint `nicho_sem_numero` já aplica ao que a nossa operação escreve (`bases-de-nicho/README.md` §11); em tempo de execução ela vale para o modelo pelo mesmo motivo. **Requisito para o backend e para o treinador-do-otto, não recomendação.**

#### 12.13.3 Ponto 3 — Rodadas adaptativas e o critério de parada

**Decisão: duas rodadas. Não existe terceira, nem opcional.**

"Até ele entender o negócio" é funil sem fim, e funil sem fim é o ponto de desistência que a decisão C existe para eliminar. O teto não é arbitrário: **as duas rodadas correspondem aos dois tipos de conhecimento que existem, e não há um terceiro tipo.** Rodada 1 é o que a empresa faz; rodada 2 é quanto custa e quanto demora. Uma rodada 3 seria mais rodada 2 — e "mais do mesmo" é a definição do funil.

| | Rodada 1 | Rodada 2 |
|---|---|---|
| **Pergunta** | O que você faz | Quanto custa, quanto demora, que garantia tem |
| **Forma** | Afirmação, em lote, uma tela | Par pergunta-e-resposta, uma por tela |
| **Quantas** | 5 a 8 afirmações, **uma tela** | 3 a 6 telas |
| **Teclado** | Nunca | Sim, numérico |
| **Fonte** | Itens `escolha` da base do nicho + **no máximo 3** geradas da descrição | Itens `fato` com `preenchivel_por: []` |
| **Contador** | "faltam 2" (pendentes, não progresso) | "3 de 6" |

**Teto do passo inteiro: 8 telas** — 1 da descrição, 1 da rodada 1, até 6 da rodada 2 (mais a de fim, que não pede nada). O desenho anterior tinha 12. **Esta revisão encurta o onboarding.**

**O denominador, que era o problema real do pedido.** Com rodada adaptativa livre o denominador some, e sem denominador o contador honesto morre. A saída é que **a rodada 1 determina a rodada 2**, então o denominador existe no instante em que a rodada 1 é enviada:

- Rodada 1 não precisa de denominador: é uma tela. O que ela mostra é o que **falta** ("faltam 2"), que é informação útil e não é barra de progresso.
- Rodada 2 abre com o número fechado, dito em voz alta: `[GUARDIÃO]` *"Pelo que você marcou, são 6 perguntas: preço, prazo e garantia. É a última parte."* (texto ajustado em 12.5.A/A.2; o rascunho dizia "sobraram 6 perguntas de preço")
- **Regra dura: o denominador só encolhe, nunca cresce.** Teto de 6, piso de 3. Se a rodada 1 habilitar 9 itens de preço, entram 6 e três viram **lacuna semeada** (`bases-de-nicho/README.md` §6) — chegam depois pelo bloco do resumo (12.5.E) ou pela pergunta no WhatsApp (12.5.G), que existem exatamente para isso. Contador que cresce enquanto a pessoa responde é a definição de funil infinito.

**O que "adaptativo" quer dizer aqui, sem margem para interpretação.** Quatro efeitos, todos determinísticos — nenhuma geração livre de rodada seguinte:

1. **"Não" numa afirmação** → os itens `fato` que dependem daquele serviço saem da rodada 2, e o item `negativa` é criado.
2. **"Sim" numa afirmação** → os itens `fato` daquele serviço ficam elegíveis.
3. **Certas afirmações decidem `inclui_condicional`** (o caso da barbearia no README §3.1): marcar "você atende com hora marcada" puxa `_comum/hora-marcada.yml`; não marcar deixa quatro respostas de fora, em vez de deixar quatro respostas erradas.
4. **A ordem da rodada 2** é a ordenação do README §4.2 restrita ao conjunto elegível.

Dado o resultado da rodada 1, a rodada 2 é calculável pelo backend antes de a primeira tela abrir. É isso que torna o contador honesto possível.

**Por que só 3 afirmações geradas.** A afirmação gerada é a parte do pedido do Felipe que atende quem não cabe no nicho, e é a que tem menos rede: não tem `negativa` escrita por nós, não tem caso de avaliação, não passou pelo lint em PR nem pelo guardião. Cada uma é texto de modelo que, confirmado, o Otto passa a afirmar a clientes. Três é o número que deixa o dono corrigir o que o nicho não pegou sem que a maioria da tela seja texto não revisado. **Se as 3 geradas forem confirmadas em bloco nas primeiras contas, o teto sobe; se forem recusadas, cai a zero.** Instrumento na ficha 12.16.

**Saída livre, e ela mudou de forma:**

- Rodada 1: **cada toque salva.** Sair no meio guarda o que foi tocado e não guarda mais nada. Não existe botão de enviar que possa ser perdido.
- Rodada 2: igual ao desenho anterior — saída em toda tela, texto de saída sem cobrança.
- **Nada aqui é obrigatório para o Otto começar a atender.** A regra 1 do ADR 022 continua intacta: pular o passo inteiro é caminho válido, e o Otto atende assim mesmo (12.3).

**Uma proteção nova, que o pedido tornou possível e o desenho antigo não tinha.** Se metade ou mais das afirmações da rodada 1 for marcada "Não", o Otto **entendeu o negócio errado**, e fazer o dono moer mais 6 telas de preço de serviços que ele não presta é a pior primeira sessão possível. Então o Otto se corrige, uma vez por conta:

> `[GUARDIÃO]` — ajustado em 2026-09-09
> Acho que eu entendi errado o seu negócio. Me conta de novo?
> [Conto de novo] · [Tá bom assim]

A frase está aprovada como estava: o Otto assume o erro em uma oração e corrige, que é a linha "erro do próprio Otto" da `persona-otto.md`, e a culpa fica com ele, nunca com a descrição que o dono escreveu. O "acho que" fica: metade marcada "Não" é evidência forte, não certeza, e afirmar certeza aqui seria o Otto sabendo mais do que sabe. **O botão mudou**: [Me conta] era a fala do Otto dentro do botão que o dono aperta (`voz-e-tom.md` §1.1 — rótulo de botão é a resposta do dono). [Conto de novo] responde a pergunta e leva ao mesmo lugar que o [Corrigir] do cabeçalho da rodada 1.

Isso é o oposto de um funil: é o produto gastando uma tela para não gastar seis. E é o sinal mais barato que existe de que a base daquele nicho está errada — alimenta direto o falsificador da ficha 12.4.

#### 12.13.4 Ponto 4 — A pergunta aberta de entrada

**Decisão: tela própria, com microfone, como a última tela do cadastro. Não é campo de formulário reaproveitado e não é uma tela nova depois do cadastro.**

O Felipe pediu que fosse "quando um cliente se cadastra". É onde ela fica. O que muda é a moldura: hoje ela é uma linha entre nome, telefone e senha, respondida em modo de preencher formulário — que é o modo que produz "conserto de celular" e ponto. Como tela própria, perguntada pelo Otto, com microfone, ela é respondida em modo de contar.

**Por que não mover para depois do cadastro:** `conta.criada.segmento_classificado` (`dados.md`, evento 1) depende dela. Mover para dentro do onboarding deixaria o evento nascer sem segmento e obrigaria a mexer num evento que não é desta decisão. Como última tela do cadastro, o evento fica intacto e não há nada a propor ao analista neste ponto.

**Ganho de interação, e ele é grande:** entre a descrição e a rodada 1 há três telas (estilo, cargo, avatar). **A geração das afirmações roda nesse intervalo.** O estado "carregando (montando as propostas)" deixa de ser o caminho comum e vira exceção — o dono não espera por nada.

**Resposta curta: não é caso de erro, e o estado "sem proposta" do desenho anterior sai.**

"conserto de celular" tem 18 caracteres e **classifica o nicho**, que é a única coisa que o passo precisa: a base do nicho sozinha enche a rodada 1 com 8 afirmações. O limiar nunca foi comprimento; é classificação.

| Caso | O que acontece |
|---|---|
| Classificou o nicho | Segue normal. Zero afirmações geradas se a descrição for curta; a base do nicho cobre |
| Não classificou | O Otto repergunta **uma vez**, com exemplo: `[GUARDIÃO]` *"Me ajuda: o que o cliente vem buscar aí? Pode ser curto — conserto de celular, corte de cabelo."* Duas reperguntas é interrogatório |
| Não classificou na segunda | Degrada para `_comum/todo-negocio.yml` (5 afirmações que todo negócio tem) e a rodada 2 fica no piso de 3 |

**O que foi apagado:** o estado "sem proposta → *me conta uma pergunta que seus clientes fazem toda semana*". Era campo em branco com moldura melhor — exatamente o que a decisão C recusa em 12.4 —, e agora existe um caminho que sempre tem conteúdo.

**E ele pode voltar atrás na descrição.** O cabeçalho da rodada 1 mostra o que ele disse, com [Corrigir] — `[GUARDIÃO]` texto em 12.5.A/A.1: *Você me disse: "conserto de celular e tablet" · [Corrigir]*. Se o Otto leu "conserto de celular" como "loja de celular", consertar a raiz custa uma frase e consertar o efeito custa oito toques errados.

#### 12.13.5 O que esta revisão tirou

Com a mesma clareza do que entrou:

| Saiu | Por quê |
|---|---|
| **4 telas** (de 12 para 8) | Os itens `escolha` deixaram de ocupar uma tela cada e viraram linha de lista; a rodada 2 caiu de 10 para no máximo 6, e o resto virou lacuna semeada, que já tinha canal |
| O estado **"sem proposta"** com pergunta genérica | Substituído pela degradação para `_comum`. Campo em branco não volta pela porta dos fundos |
| A moldura **"um cliente pergunta / eu respondo"** para item `escolha` | Duas frases para pedir um bit |
| A descrição do negócio como **campo dentro do formulário** de cadastro | Vira tela própria, mesma posição no fluxo |
| A tela de **carregamento** como caminho comum | A geração roda enquanto ele escolhe estilo, cargo e avatar |
| **Chip de seleção múltipla** (a forma literal do pedido) | Estado não tocado ambíguo, e a ambiguidade produz o Otto negando serviço que a empresa presta |
| **Rodada 3**, mesmo opcional | Oferecer mais logo depois de terminar é "você não terminou" com outra fantasia |
| O marcador **`completa`/`parcial`** na tela da tabela (12.13.11) | Um toque distraído em `completa` faz o Otto negar aparelho que a loja atende. É a negativa errada de 12.13.2 voltando por outra porta |
| O botão de **apagar linha** na tela da tabela | Alvo pequeno ao lado de campo numérico, com um significado que "linha em branco é inerte" já dá de graça. Sem ele, não há gesto destrutivo na tela |

#### 12.13.6 O que continua exatamente como estava

Para o especialista-react não ter que adivinhar o que o diff toca: **12.5.B a 12.5.G não mudam em nada.** A tela "Conversar com o Otto", a tela "O que o Otto sabe", a barra da conversa, o bloco do resumo do dia, o material e a pergunta no WhatsApp seguem como estão, com o texto já fechado pelo guardião em 2026-09-09. A decisão D (seção 13) não é tocada. As seis regras do ADR 022 seguem inteiras — nenhuma foi revista, uma foi reinterpretada (12.13.1).

#### 12.13.7 Fichas comportamentais da revisão

Nenhuma sustenta escopo caro: a rodada 1 é uma lista com dois botões por linha, e a rodada 2 é a tela que já estava desenhada, com menos instâncias. As fichas 12.1 a 12.12 continuam valendo.

| # | Afirmação | Onde sustenta | Tipo | Evidência hoje | Comparável | Taxa mínima | Como se mede | O que a mata | Grau |
|---|---|---|---|---|---|---|---|---|---|
| 12.13 | Julgar verdadeiro/falso uma afirmação atômica sobre o próprio negócio custa menos decisão do que julgar um par pergunta-e-resposta com número em branco | A fronteira de 12.13.1: afirmação para escopo, par para número | Preferência | Nenhuma. Não abri fonte nesta sessão | Sem análogo conferido. **Não invento magnitude.** Direção robusta (`behavioral-evidence` §4, custo de decisão): um bit sobre um fato que ele sabe de cor custa menos que ler duas frases e avaliar redação que o preset vai revestir de qualquer jeito (`conversa.md` §2.3) | Rodada 1 com taxa de linha respondida (Sim ou Não) acima da taxa de conferência da rodada 2, na mesma conta | `base.atualizada.forma` (12.13.9), comparando `afirmacao` e `pergunta_e_resposta` dentro de `origem = onboarding`, nas 10 primeiras contas, com o absoluto | Rodada 1 respondida em taxa igual ou menor que a rodada 2 → a afirmação não é mais barata, e a fronteira de 12.13.1 vira só coerência com o armazenamento. **Antes de código:** as duas molduras impressas, 5 donos, tempo até responder | INFERIDO |
| 12.14 | Numa lista em lote, linha não tocada quer dizer "não li", e a proporção disso não é desprezível | A regra de segurança de 12.13.2 (não tocado é inerte) | Taxa | Nenhuma | Direção robusta: o caminho mais barato de completar uma lista é completar parte dela. Magnitude local | Não é limiar de aprovação; é a leitura que justifica a regra. **Se as linhas em branco forem mais de 1 em 10**, a regra pagou por si | `empresas.afirmacoes_propostas_no_onboarding` menos `COUNT(DISTINCT item_chave)` de `base.atualizada` (`origem = onboarding`, `forma = afirmacao`), por conta — **em `empresas` e não em `conta.ativada`**, senão a conta que abandonou na rodada 1 sai da conta, e é ela que carrega o efeito | Linhas em branco abaixo de 1 em 20 em 10 contas → eu superestimei, e a tela pode passar a marcar tudo como respondido com um toque de "é tudo isso" no fim. **A regra não sai**: o custo dela é zero e o dano que ela evita é assimétrico | NÃO VERIFICADO |
| 12.15 | Uma tela com 8 linhas de dois botões conclui mais que 8 telas de uma linha | O lote da rodada 1 (12.13.2) | Taxa | Nenhuma | Direção robusta (`behavioral-evidence` §4): cada passo adicional derruba conclusão, e transição de tela é passo. **Contrapeso honesto:** lista longa reintroduz custo de decisão que o toque único economizou — é por isso que o teto é 8 linhas, não 15 | 7 de 10 contas respondem todas as linhas da rodada 1 | `COUNT(DISTINCT item_chave)` de `base.atualizada` sobre `empresas.afirmacoes_propostas_no_onboarding`. O `DISTINCT` importa: cada toque salva, então a mesma linha pode gerar dois eventos | Menos de 5 em 10 respondendo tudo → a rodada 1 volta a ser uma por tela, com as mesmas afirmações. A moldura sobrevive; o lote não | NÃO VERIFICADO |
| 12.16 | A afirmação gerada da descrição em texto livre acerta o bastante para ser confirmada, e não só as da base do nicho | O teto de 3 afirmações geradas (12.13.3) | Taxa | Nenhuma. É texto de modelo que ainda não existe | Não se aplica: é qualidade de artefato futuro | Metade das geradas confirmadas, e **nenhuma** contendo número (o filtro é anterior, e a violação é defeito, não taxa) | `base.atualizada` com `fonte_da_proposta = descricao_do_negocio` e `forma = afirmacao`: `confirmou / (confirmou + recusou_proposta)`, **com `empresas.afirmacoes_geradas_descartadas` ao lado** — sem ele, gerador quebrado e dono cético dão o mesmo número | Menos de 3 em 10 confirmadas → o teto cai a zero e a rodada 1 passa a ser só base do nicho, que é o caminho que já funciona. Mais de 7 em 10 → o teto sobe para 5 | NÃO VERIFICADO |
| 12.17 | O dono preenche poucas linhas da tabela de preço no onboarding, e as demais chegam pela demanda | 12.13.11: a tabela é começada no onboarding e terminada pelo resumo do dia | Taxa | Nenhuma | Direção robusta (`behavioral-evidence` §4, custo de execução e de desvio): 15 números digitados num celular na primeira sessão custam mais que 1 número por dia acoplado a um buraco real. **Magnitude local, não inventada** | Não é limiar de aprovação, é a leitura que valida a reformulação: **mais linhas preenchidas pelo resumo do dia do que pelo onboarding, em 30 dias** | `base.atualizada` com `forma = tabela`, agrupado por `origem` (`onboarding` × `sugestao_do_resumo`), somando `itens_aceitos`. **Corrigido pelo analista:** "somando linhas da mesma `chave`" não fecha — uma `lista` é **um** item, então a diferença de contagem dá 0 ou 1, e não há `chave` no evento | Mais linhas vindas do onboarding que do resumo em 30 dias → o dono termina tabela quando pedem, e a tela pode voltar a pedir a tabela inteira, mais cedo na rodada 2. **Se nenhuma das duas encher a tabela**, o problema não é a tela: é a ficha 12.6 (ele não abre o resumo), e mexer aqui não conserta | NÃO VERIFICADO |
| 12.18 | O `fato` gerado em `outro` é respondido com número, e não pulado | 12.13.12: a geração alimentando a rodada 2 onde não há arquivo de nicho | Taxa | Nenhuma. É texto de modelo que ainda não existe | Não se aplica. **Contrapeso declarado:** o a fortiori do treinador (`conversa.md` §2.7.8) me convence do risco relativo, não da taxa. Um `fato` gerado é mais seguro que um `escolha` gerado **e** mais caro de responder — as duas coisas ao mesmo tempo | Metade dos `fato` gerados em `outro` recebendo número, e **zero** contendo mais de uma oração ou mais de uma lacuna (violação é defeito, não taxa) | `base.atualizada` com `fonte_da_proposta = descricao_do_negocio` e `forma = pergunta_e_resposta`, restrito a contas com `conta.criada.segmento_classificado = outro` — o nicho que importa é o **usado** na geração, não o vigente em `empresas.segmento`, que pode ter sido revisto depois | Menos de 3 em 10 recebendo número → geração sai da rodada 2 e `outro` volta a ter rodada 2 de um item, que é pior e honesto. **E um falsificador de dano, não de taxa:** `suporte.pedido_registrado.categoria = resposta_errada` **por 100 `conversa.encerrada` da mesma conta** (nunca por conta, que não normaliza volume), com **piso de 3 pedidos absolutos** antes de qualquer leitura e sempre com o absoluto ao lado; acima do dobro da mediana das contas com arquivo de nicho, a geração sai da rodada 2 na hora, sem esperar a taxa. Abaixo do piso, a decisão é de leitura de conteúdo e não de taxa — com uma ou duas contas `outro`, "o dobro da média" é ruído com cara de sinal | NÃO VERIFICADO |
| 12.19 | Perguntado numa tela própria, pelo Otto, com microfone, o dono descreve o negócio com mais que duas palavras | 12.13.4, e toda a geração depende disso | Taxa | Nenhuma | Comportamento existente, e é o melhor sinal disponível: este público manda áudio no WhatsApp todo dia (ficha 12.8). Não serve de magnitude | Mediana de 8 palavras ou mais na descrição, nas 10 primeiras contas | Comprimento em palavras de `empresas.descricao_do_negocio`, mais `conta.criada.descricao_por_audio`, com a mediana e o absoluto | Mediana abaixo de 6 palavras → a geração da descrição não vale e a rodada 1 vira 100% base do nicho. **Isso não quebra o passo** — degrada para o que já funciona, e é por isso que este é o ponto mais barato de errar | NÃO VERIFICADO |

#### 12.13.8 O que foi substituído (12.5.A, versão de 2026-09-09, manhã)

Guardado literal, porque o texto abaixo foi aprovado pelo guardião da marca e três das frases dele voltam a valer se as fichas 12.13 a 12.15 falharem.

> **Forma: uma pergunta de cliente por tela**, com a resposta que o Otto daria já escrita. Não é formulário; é a conversa que ele tem todo dia.
>
> (abertura, uma tela)
> Eu li o que você escreveu sobre a [Empresa] e já montei umas respostas. Dá uma olhada rápida: onde eu errei, você corrige.
> São 10 perguntas. Dá para parar quando quiser.
> [Vamos] · [Depois eu vejo]
>
> (cada uma das 10)
> Um cliente pergunta: **"quanto custa trocar a tela do iPhone 11?"**
> Eu respondo: *"A troca de tela do iPhone 11 sai por R$ ___, com garantia de ___ dias. Fica pronto em ___."*
> [Tá certo] · [Não é bem assim]
> · · 3 de 10 · [Depois eu vejo]
>
> | Estado | O que aparece |
> |---|---|
> | Carregando (montando as propostas) | "Estou lendo o que você escreveu. Já te mostro." Máximo de 10 s; passou disso, cai no estado abaixo |
> | Sem proposta (nicho não classificado, descrição curta demais) | Não vira formulário em branco. Vira a pergunta mais genérica que existe: "Me conta uma pergunta que seus clientes fazem toda semana." Com microfone. Uma por vez, sem contador |
> | Padrão | Uma pergunta por tela, com contador honesto e saída visível |
> | Saiu no meio | "Beleza. As outras 7 ficam guardadas aqui no painel, para quando você quiser." Nunca cobrança, nunca "você não terminou" |
> | Erro ao salvar | Texto preservado, botão de tentar de novo. Sair do passo nunca perde o que já foi respondido |
> | Fim | "Pronto. Agora eu sei 10 respostas. Quer me perguntar uma coisa, pra ver como ficou?" [Perguntar] · [Seguir] |

**O que sobreviveu inteiro e não precisa de novo parecer do guardião:** a moldura "Um cliente pergunta / Eu respondo" (agora só na rodada 2), o texto de saída no meio, o texto de erro e a estrutura do fim.

**O que era rascunho novo — a pergunta aberta de A.0, a abertura da rodada 1, o aviso de linhas em branco, a frase de "entendi errado", a abertura da rodada 2, a tela da tabela, a repergunta de A.0 e a frase de fim — passou pelo guardião em 2026-09-09 (tarde) e está fechado.** Nenhum bloqueio, sete ajustes aplicados no lugar, todos marcados `[GUARDIÃO]`. Já não há nada `[GUARDIÃO — rascunho]` nesta seção.

**Uma frase da versão substituída voltou:** *"Agora eu sei 10 respostas"* (aqui como "12"). O rascunho a tinha trocado por "agora eu sei o que você faz e quanto custa", que é adjetivo no lugar de número e fica falso para quem deixou linhas em branco. A troca foi desfeita; o motivo está em 12.5.A/A.3.

#### 12.13.9 O que muda nos eventos (12.12 continua valendo; isto acrescenta)

**Zero eventos novos. O teto de 20 de `dados.md` continua intacto.**

**Fechado pelo analista de produto em 2026-09-09** (sétima revisão de `dados.md`). Dos cinco campos propostos abaixo, um foi aceito com o enum cortado, um foi mudado de evento e três foram dissolvidos ou viraram estado. O texto de cada bloco traz a proposta original e o veredito, porque a razão da recusa é a mesma que vale para a próxima proposta.

**1. `base.atualizada` (evento 13) ganha `forma`.**

| Campo | Proposta |
|---|---|
| **`forma enum(afirmacao, pergunta_e_resposta, tabela)`** — proposto como `enum(afirmacao, pergunta_e_resposta, lote, material)` e **cortado pelo analista**: `lote` sai porque não é excludente com `afirmacao` (na rodada 1 toda linha é as duas coisas, e o backend teria que escolher no chute; se a rodada 1 voltar a ser uma por tela, isso é versão de desenho e se lê por data), `material` sai porque é `origem = material_enviado` escrito de novo, e **`tabela` entra**, que não estava na proposta — 12.13.11 criou uma terceira forma de tela, e sem ela a ficha 12.17 mistura linha de tabela com item de preço comum | Qual moldura produziu o item. **É o que decide o ponto 1 com dado em vez de argumento**, e a leitura vale além do onboarding: o bloco do resumo do dia (12.5.E) já usa as duas molduras hoje (`[Sim]·[Não]` para pergunta fechada, campo para aberta), e sem este campo as duas se somam num número só |

Por que `forma` e não dois valores novos em `origem`: `origem` responde **qual porta funciona** (12.12.5, item 1) e é a leitura mais importante da decisão C. Rachar `onboarding` em dois fragmentaria essa leitura para responder outra pergunta. `forma` responde a outra pergunta sem estragar a primeira, e cruza com `origem` de graça.

**2. `conta.ativada` (evento 3) não ganha campo nenhum.**

Foram propostos quatro — `afirmacoes_propostas_no_onboarding`, `afirmacoes_confirmadas`, `afirmacoes_recusadas`, `refez_a_descricao` — mais `descricao_por_audio`. **O analista recusou os cinco**, pelo mesmo parágrafo com que recusou dois na revisão anterior: `conta.ativada` só dispara na primeira resposta a cliente real, e **a conta que abandona no meio da rodada 1 nunca chega lá** — que é justamente a conta que as fichas 12.14 e 12.15 precisam contar. Medir linha em branco só entre os ativados enviesa na direção que diz "a regra de 12.13.2 não valia", e falsificador que só erra para um lado não é falsificador.

Ficam assim:

| Proposto | Onde fica | Por quê |
|---|---|---|
| `afirmacoes_propostas_no_onboarding` | **Estado em `empresas`**, gravado quando acontece | O denominador tem que existir para quem abandonou |
| `refez_a_descricao` | **Estado em `empresas`** (`refez_a_descricao_no_onboarding`) | Pior caso do viés: a conta cujo negócio o Otto entendeu errado é a que larga ali mesmo |
| `afirmacoes_confirmadas` / `afirmacoes_recusadas` | **Somem, sem perda** | São `COUNT(DISTINCT item_chave)` de `base.atualizada` (`origem = onboarding`, `forma = afirmacao`), que existe para toda conta criada. E o `DISTINCT` é mais correto que um contador: "cada toque salva" permite dois toques na mesma linha |
| `descricao_por_audio` | **`conta.criada`** | A descrição é a última tela do **cadastro**; é o momento do evento 1, não do 3 |

As linhas em branco continuam sendo a subtração — agora `empresas.afirmacoes_propostas_no_onboarding` menos `COUNT(DISTINCT item_chave)` — e continuam sendo o dado que diz se a regra de 12.13.2 valeu.

**Dois campos que ninguém tinha pedido, acrescentados pelo analista:** `base.atualizada.item_chave text?` (ver o bloco 3) e `empresas.afirmacoes_geradas_descartadas int`, que fica ao lado da ficha 12.16 porque gerador quebrado e dono cético produzem o mesmo número sem ele.

**O que os campos medem, e o que nenhum mede.** A subtração mede **linha em branco**, e isso é a ficha 12.14 inteira. Mas *"conferindo ou passando o dedo"* nenhum campo mede: `[Sim]` distraído e `[Sim]` lido produzem o mesmo evento. O que pega isso, de graça, são três sinais que só valem juntos — intervalo entre `ocorrido_em` de eventos consecutivos (cada toque salva, então cada linha tem hora), conta que fecha 8 de 8 sem um único `recusou`, e o dano depois (`suporte.pedido_registrado.categoria = resposta_errada`). Um sozinho acusa uma base de nicho boa. Está em `dados.md` §4.3.

`respostas_propostas_no_onboarding` e `respostas_conferidas_no_onboarding`, propostos em 12.12.2, **continuam existindo e passam a significar só a rodada 2**. A ficha 12.1 lê os dois pares somados; o limiar dela não muda.

**3. Uma checagem que o analista precisa recusar ou aceitar explicitamente.**

Item não tocado na rodada 1 **não emite `base.atualizada`** — nada foi atualizado, e emitir um evento por não-ação encheria o volume com o caso mais comum. A contagem vive em `conta.ativada`, que é agregado. **A consequência declarada some.** Com `base.atualizada.item_chave` — campo acrescentado pelo analista nesta rodada —, a diferença entre as propostas e o conjunto de `item_chave` com evento naquela conta dá **quais** linhas ficaram em branco, numa consulta, sem evento novo. O campo não era só desta ficha: as duas regras de correção do README §7.1 de `bases-de-nicho` (6 em 10 editando o mesmo item o reescreve; 4 em 10 recusando o tira do arquivo) estavam escritas como se o dado existisse, e ele não existia.

**Nada em `dados.md` fora da decisão C é tocado.** A descrição do negócio continua no cadastro, então `conta.criada.segmento_classificado` fica onde está (12.13.4).

**4. As duas decisões de 12.13.11 e 12.13.12 não pedem nada a mais.** A geração na rodada 2 em `outro` (ficha 12.18) se lê cruzando `fonte_da_proposta = descricao_do_negocio`, `forma = pergunta_e_resposta` e `conta.criada.segmento_classificado`. **A tabela precisou de correção:** eu a tinha escrito como "`base.atualizada` da mesma `chave` de `lista`, somando linhas", e o analista mostrou que não fecha — uma `lista` é **um** item, então `itens_depois − itens_antes` dá 0 ou 1, e não havia `chave` no evento. Lê-se com `forma = tabela` mais o par `itens_propostos`/`itens_aceitos`, que já existe, com o CHECK estendido.

**Somando as três rodadas de revisão: zero eventos novos; `base.atualizada` ganha `forma` e `item_chave`; `conta.criada` ganha `descricao_por_audio`; `conta.ativada` ganha zero; `empresas` ganha `afirmacoes_propostas_no_onboarding`, `afirmacoes_geradas_descartadas` e `refez_a_descricao_no_onboarding`.** O treinador retirou o `rodada int?` que ia pedir — dentro de `origem = onboarding`, `rodada` é função de `forma`, e gravar os dois é gravar a coluna duas vezes, sendo a cópia a que sai de sincronia.

#### 12.13.10 O que sobrou para o Felipe, e não é meu

1. **Nada nesta revisão exige decisão dele.** Os quatro pontos são forma de tela, e forma é minha por CLAUDE.md ("direção do Felipe; forma decidida pelo especialista de UI/UX", ADR 015). Registro assim mesmo os dois lugares onde eu recusei parte do pedido, para ele derrubar se quiser: **o chip de seleção múltipla** (12.13.2) e **a rodada além da segunda** (12.13.3). Nos dois casos a recusa é por consequência concreta, não por preferência.
2. **O que precisa de outro dono, e já está endereçado:** o texto novo vai ao **guardião da marca** (marcado no lugar); `forma` e os quatro campos de `conta.ativada` vão ao **analista de produto**; o descarte de afirmação gerada com dígito vai ao **treinador-do-otto** e ao **especialista-backend** como requisito, na mesma família do lint que já existe em `bases-de-nicho/lint.py`.
3. ~~**Uma consequência para o `bases-de-nicho`:** cada arquivo precisa de pelo menos 5 itens `escolha` e pelo menos 3 itens `fato` com lacuna obrigatória.~~ **Respondido e substituído pelo treinador-do-otto em 2026-09-09** (`conversa.md` §2.7.8, item 4): o lint conta `escolha` **sem** `_comum` e o piso é **4**, o que impede encher a tela com `estacionamento`. Aceito a forma dele e retiro a minha. Detalhe no fim de 12.13.12.

#### 12.13.11 Onde a `lista` aparece (pendência 18 do `conversa.md`)

**Devolvida pelo treinador-do-otto em 2026-09-09.** A partição de 12.13.3 fala de dois tipos de item; existe um terceiro, `lista`. Ele concorda que **não é terceira classe de conhecimento** — é preço, logo rodada 2 — mas é **terceira forma de tela**: N números mais o marcador `completa`/`parcial`, o que viola por construção o limite de duas lacunas obrigatórias por tela (`bases-de-nicho/README.md` §4.2). **Cinco dos oito arquivos têm exatamente uma `lista`**, então é o caminho comum, não borda.

**Decisão: entra na rodada 2, com forma própria, como a última tela — e a tela é desenhada para ser a mais fácil do passo, não a mais difícil.**

**Por que não fica fora.** Nos cinco arquivos que têm `lista`, ela é a tabela de preço por modelo — literalmente *"quanto custa trocar a tela do iPhone 11"*, a pergunta que abre 12.1 e que chega oito vezes por semana. Tirá-la do onboarding é tirar o carro-chefe e deixar o passo com as perguntas de segunda ordem. Não faço isso.

**Por que ela não viola a regra de duas lacunas: porque nenhuma das lacunas dela é obrigatória.** A regra do README §4.2 protege contra a tela que **exige** três números — a tela de que o dono não sai sem digitar, que é o formulário que a decisão C recusa. Esta tela não exige nenhum: ela avança com zero preenchido, e o `minimo_de_linhas` decide sozinho se a tabela entra na base ou fica `rascunho` invisível (README §3.4 e §5). A regra é respeitada em substância, não por exceção.

**A reformulação que resolve o resto, e é a decisão de verdade:**

> **A tabela não existe para ser terminada no onboarding. Existe para ser começada no onboarding e terminada pela demanda.**

O dono preenche os três ou quatro aparelhos que ele mais faz e segue. O que falta não é buraco: é a próxima pergunta de cliente. Quando alguém perguntar do Moto G54 e a tabela estiver `parcial`, o Otto diz que não tem esse aqui e encaminha, e a linha aparece no bloco "o que o Otto não soube" **já rotulada**, com um campo de número: um toque e um número, na ordem em que os clientes de fato perguntam. Isso é melhor que fazer o dono adivinhar quais 15 modelos importam — e é o mesmo mecanismo de 12.3 ("o que ele não sabe é o que produz a lista de aprendizado"), aplicado a linhas de tabela em vez de perguntas.

**Duas coisas que eu tirei da tela, e são tiradas de propósito:**

| Tirado | Por quê |
|---|---|
| **O marcador `completa`/`parcial`** | Ele sai do onboarding sempre `parcial`. Perguntar "é isso mesmo, ou falta aparelho?" para quem preencheu 3 de 12 convida a marcar `completa` num toque distraído — e `completa` faz o Otto tratar ausência como *não fazemos*, que é a negativa errada de 12.13.2 voltando por outra porta. `completa` só se marca em "O que o Otto sabe", onde a tabela inteira cabe na tela e a consequência pode ser dita |
| **O botão de apagar linha** | Alvo pequeno ao lado de um campo numérico, no celular, e com um significado que a rodada 1 já dá de graça: linha em branco é inerte. Sem apagar, não há gesto destrutivo nesta tela |

**Última da rodada 2, e o motivo é o custo de abandono.** É a única tela do passo que pode levar dois minutos em vez de quinze segundos. Na frente, ela transformaria desistência parcial em desistência total. Atrás, quem sair antes dela já leva preço, prazo e garantia do carro-chefe — que é exatamente o resultado que o README §4.3 declara como o certo para quem para no meio. O item `fato` de preço ("a partir de R$ ___, depende do aparelho") responde a pergunta em primeira instância; a tabela é a segunda casa decimal.

**Como o dono a encontra depois** — três caminhos, todos já existentes, nenhum mecanismo novo:

1. **"O que o Otto sabe" (12.5.C)** mostra a tabela como uma linha com número real: *"Tabela de preço por aparelho — 4 aparelhos preenchidos · [Continuar]"*. Número, nunca percentual, nunca barra (regra 7 e 12.7).
2. **O bloco do resumo do dia (12.5.E)**, uma linha por vez, dirigida pela demanda. É o caminho principal e é o de menor custo.
3. **Mandar material (12.5.F)** — a foto da folha colada na bancada. Este é o caso em que o acelerador mais paga, e não por acaso: uma tabela de preço é a coisa que este dono tem mais chance de ter escrita em papel (ficha 12.3).

**Teto de telas intacto:** a tabela ocupa **uma** das até 6 telas da rodada 2. O passo continua em 8. Ficha **12.17**.

#### 12.13.12 Geração na rodada 2 quando não há arquivo de nicho (pendência 20)

**O treinador-do-otto discorda do desenho vigente num ponto, e tem razão no diagnóstico.** No nicho `outro` — a conta que mais precisa deste passo, porque é a única que entra sem base nenhuma —, a restrição "geração só na rodada 1" deixa a rodada 2 nascer com **um** item: `_comum/todo-negocio.yml` tem um único `fato` só-do-dono (formas de pagamento), e `_comum/hora-marcada.yml` é `inclui_condicional` declarado por arquivo de nicho, que ali não existe. Rodada 2 é onde moram preço e prazo. Um piso de 3 com 1 item disponível não é um desenho que fecha, e ele está certo em não me deixar passar com isso.

**Decisão: aceito, com uma mudança de forma que não é cosmética.**

> **Onde não existe arquivo de nicho, a geração também alimenta a rodada 2, com o mesmo teto de 3 — e todo `fato` gerado tem exatamente uma oração e exatamente uma lacuna obrigatória.**

**O argumento a fortiori dele se sustenta, mas só com essa restrição.** Ele diz: um `escolha` gerado é confirmável com um toque; um `fato` gerado com lacuna obrigatória exige o dono digitar um número e não renderiza sem ele; logo, se três `escolha` gerados são aceitáveis, três `fato` gerados são menos arriscados. Fui atrás do furo e encontrei um só, e ele é o mesmo furo de 12.13.1:

> **A moldura é do modelo e o número é do dono.** *"Troca de tela: R$ ___, à vista, com 90 dias de garantia"* — o dono digita 380 pensando no preço e acaba de fazer o Otto prometer *à vista* e *90 dias*, que ele nunca disse. O gesto de digitar o número confirma a oração inteira, e a oração inteira não foi revisada por ninguém.

Com um arquivo de nicho isso não acontece, porque a moldura passou por lint, PR e guardião. Com geração, o que sobra é a regra que eu já escrevi para a afirmação e que agora vale para os dois lados da partição:

> **Uma oração, um fato, uma lacuna.** `Troca de tela de iPhone: a partir de R$ ___.` Sem cláusula de garantia, sem condição de pagamento, sem trecho opcional em `«…»`, sem segunda lacuna.

Com uma oração só, a única coisa que a moldura pode carregar é o nome do serviço — e o nome do serviço já está preso pela **âncora obrigatória** (`conversa.md` §2.7.2), que é a mesma trava do `escolha`. O risco residual colapsa na âncora, e aí o a fortiori dele fecha. **Sem a restrição de uma oração, não fecharia**, e é por isso que aceito com forma diferente em vez de aceitar liso.

**O que fica valendo, exatamente:**

| Regra | Valor |
|---|---|
| Onde há arquivo de nicho | Geração **só na rodada 1**, teto de 3. **Inalterado** |
| Onde não há (`outro`, nicho sem arquivo) | Geração nas duas rodadas, **teto de 3 em cada uma**, na **mesma chamada** do gerador — o custo continua sendo uma geração por conta (R$ 0,066, `conversa.md` §2.7.8) |
| Todo `fato` gerado | Uma oração, uma lacuna obrigatória, `preenchivel_por: []`. Âncora obrigatória, `lint` em execução, descarte de qualquer afirmação com dígito. Tudo já decidido em 12.13.2 e `conversa.md` §2.7.3 |
| `lista` gerada | **Não existe.** Enumerar é onde o modelo é mais plausível e mais errado (`conversa.md` §2.7.3), e a tela da tabela (12.13.11) precisa de rótulos que alguém escreveu. Em `outro` não há tabela de preço no onboarding |
| Filtro da rodada 1 | Continua valendo: `fato` gerado cujo serviço foi marcado `[Não]` na rodada 1 sai da rodada 2. O denominador continua só encolhendo |

**O piso, que é o que a decisão dele obriga a acertar.** Em `outro`, a rodada 2 é 1 item de `_comum` mais até 3 gerados, e o filtro da rodada 1 pode derrubar dois. Então o piso de 3 não é garantível ali, e fingir que é seria número decorativo:

> **Piso de 3 onde há arquivo de nicho** (inalterado — os 8 arquivos passam folgado, mediana 7,5 pela medição dele). **Piso de 2 em `outro`. Abaixo de 2, a rodada 2 não abre**: os itens viram lacuna semeada e o passo vai direto para o fim.

Uma tela só de rodada 2 não paga a transição de tela nem o contador ("1 de 1" é ruído), e pular é honesto: o Otto atende assim mesmo e as perguntas chegam pelos canais que existem. Ficha **12.18**, com um falsificador de dano além do de taxa — `outro` é a conta com menos rede, e não espero 10 contas para tirar isto se ela começar a errar.

**O que isto não muda:** o teto de 3 da rodada 1 continua de pé pelo argumento original — a afirmação gerada é a que tem menos rede (sem `negativa` escrita por nós, sem caso de avaliação, sem lint em PR, sem guardião). Ele concordou com isso e não subo o teto.

**Uma coisa que registro e não escondo:** o texto gerado que o dono lê — a `pergunta` e a oração do `fato` — **não passa pelo guardião da marca, por construção**. Já era verdade para o `escolha` gerado desde 12.13.3; passa a valer para mais três frases em `outro`. O que o guardião fecha é a **moldura** ("Um cliente pergunta / Eu respondo") e as frases fixas da tela, não o conteúdo gerado. Isto é o preço de atender a conta que não cabe em nenhum dos oito nichos, é declarado, e o teto de 3 mais 3 é o que o mantém pequeno.

##### `[GUARDIÃO]` A afirmação gerada não ganha marca de procedência — e marcar seria pior

**Decisão de 2026-09-09, pedida nesta revisão.** A tela **não** diz quais linhas vieram da base do nicho e quais o modelo montou da descrição. Nem badge, nem cor, nem asterisco, nem "sugerido", nem "eu deduzi esta". Quatro razões, e a segunda sozinha decide:

1. **A moldura já é a divulgação, e ela cobre as duas origens.** A abertura diz *"Pelo que você me contou, foi isto que eu entendi da [Empresa]"*. Isso é verdade da linha gerada **e** da linha da base do nicho — o nicho também foi classificado a partir do que ele escreveu. Não há nada de honesto que a marca acrescente e que a abertura já não tenha dito.
2. **Marcar três linhas certifica as outras cinco, e essa é a mentira maior.** Um selo em 3 de 8 ensina o dono a ler as 5 restantes como fato conferido sobre o negócio *dele*. Não são: são o palpite de um arquivo escrito para um ramo inteiro, e é justamente uma delas que ele mais precisa recusar quando a base do nicho está errada — o sinal que a autocorreção de 12.13.3 existe para pegar. Trocar um risco distribuído por uma falsa garantia concentrada é pior por desenho.
3. **Procedência é *como funciona*, e o Otto diz o que faz, não como funciona.** A `persona-otto.md` põe "Sou um modelo de linguagem e não tenho acesso a…" na coluna das anti-personas: correto e inútil. "Esta frase eu gerei a partir do seu texto" é a mesma frase de terno.
4. **Não muda o gesto.** A pergunta é idêntica em toda linha: *isto é verdade sobre o meu negócio?* Um selo só pode mudar a resposta fazendo o dono conferir menos onde não há selo. Aceito, portanto, o argumento do UI/UX e do treinador — pela minha razão, não pela deles: a coerência com o prompt é boa, mas o que decide aqui é que a marca de origem só teria efeito piorando a leitura.

**O que eu exijo no lugar, e isto é requisito de texto, não recomendação.** Como eu fecho a moldura e não a saída, o que resta sob meu controle é a **forma** da linha gerada. Ela tem que ser indistinguível em voz das que nós escrevemos — se o dono sentir a emenda, ele para de confiar na lista inteira, e aí o passo perde as oito linhas, não as três:

| Regra da linha gerada | Por quê |
|---|---|
| **Uma oração, um fato** (já em 12.13.1 e 12.13.12) | Duas orações e um botão é o dono confirmando o que não julgou |
| **Nenhum dígito** (já em 12.13.2, com descarte) | Número carimbado com um toque é a regra 6 do caráter quebrada por tela |
| **Sem advérbio de hedge:** normalmente, geralmente, provavelmente, costuma, deve | Hedge é a assinatura do texto gerado. E o Otto não chuta com ressalva: ou ele afirma e o dono confere, ou ele não sabe |
| **Sem superlativo e sem adjetivo de venda:** completo, especializado, rápido, de qualidade, o melhor | `voz-e-tom.md` regra 5. Uma afirmação de escopo descreve serviço, não vende |
| **Sem emoji, sem exclamação** | Idem, e o estilo do dono nem foi escolhido ainda |
| **Mesma pessoa e mesma forma das nossas:** "Você [verbo] [serviço]" | Uma lista com duas sintaxes se lê como duas vozes |

Violação de qualquer uma é **defeito, e a linha é descartada antes da tela** — o mesmo tratamento que 12.13.2 já dá ao dígito, pelo mesmo motivo. Vale para o treinador-do-otto e para o especialista-backend, na mesma família do `lint` em execução.

**E uma coisa que não muda de forma nenhuma:** a linha gerada, confirmada, vira `texto` que o Otto vai dizer **ao cliente final** — outra audiência, com outras regras (`voz-e-tom.md` §2). O `negativa` guardado a partir de um [Não] é a que mais me preocupa, porque ela é uma recusa dita a um cliente. Ela obedece à seção 2 como qualquer resposta: não termina em "não fazemos" e ponto. Isso é do treinador (`bases-de-nicho`, `negativa`), fora deste documento, e fica registrado aqui como pendência dele.

**Sobre a pendência 19 dele (reescrever os arquivos) e o lint `rodada_1_tem_lote`:** o pedido que eu tinha feito em 12.13.10 item 3 está atendido e melhor formulado do que eu escrevi — contar `escolha` **sem** `_comum` impede o enchimento com `estacionamento`, que é um item de prioridade 3 que não decide nada da rodada 2. **Aceito a forma dele (≥4 no arquivo do nicho, `_comum` por cima) e retiro a minha.** Os cinco arquivos que reprovam são dele para reescrever; o meu pedido de "≥3 `fato` só-do-dono" também está atendido pela medição e não vira lint, o que está certo: regra que nunca reprova nada é regra que ninguém confere.

---

## 13. Decisão D — Quando os créditos do mês estão acabando

> **Revisada em 2026-09-09 (tarde) pelo ADR 024.** A unidade trocou de *atendimento* para **crédito**, com âncora 1:1. Nenhum número mudou. O que mudou de verdade nesta seção, além da palavra: o nome da tela (14.6), a definição canônica (13.3, que agora mora em `identidade.md`) e **uma mensagem que não tem forma honesta na v1** — a de 80% no WhatsApp, ver 13.5.D.

Proposta de 2026-09-09. Nasceu dentro da resposta do Felipe à pergunta 12.11.3: *"o cliente deve ser avisado quando está acabando e existe o risco de respostas não serem respondido. Coloque a possibilidade de comprar um pacote extra de atendimentos. deve ser mais caro que a assinatura para incentivar o upgrade de plano."*

Fecha a pendência 2 de `cobranca.md` ("o que acontece quando o saldo zera") e a pendência 3 ("recarga avulsa: sim ou não"). O **preço** do bloco de 100 não é meu: está sendo fechado em `cobranca.md`. Aqui ele é parâmetro, e o desenho funciona com qualquer número que respeite a regra do Felipe (mais caro por crédito que qualquer faixa).

**Texto fechado pelo guardião da marca em 2026-09-09**, em duas passadas. Na primeira, duas frases de 13.5.C ficaram bloqueadas por falta de regra de proração; na segunda, com o **sem proração** decidido pelo Felipe (`cobranca.md` pendência 4, ADR 004), a tela foi reescrita com os números reais e as duas frases seguem proibidas — agora por serem falsas. A mensagem ao cliente final de 13.4 foi revisada como **outra audiência** e está marcada como tal. O vocabulário de 13.3 entrou em `docs/marca/identidade.md`.

**Duas travas de texto que continuam de pé, e agora moram em `identidade.md`:** nenhuma tela desta seção diz que os créditos acumulados são do dono **para sempre** ("não vence no fim do mês" é verdade e está decidido; permanência, não), e **nenhuma tela desta seção mostra o valor de um crédito em reais** — a única exceção é a tela de comparação (13.5.C), onde os dois preços aparecem sempre aos pares, um grudado em cada caminho. Um preço solto ensina uma taxa de câmbio falsa; dois presos a duas escolhas ensinam a única coisa verdadeira, que é o que ele está decidindo ali.

### 13.1 O problema da pessoa

Duas pessoas, e é por isso que esta decisão não é uma tela de cobrança.

**O dono** contratou o Otto para parar de perder cliente. Se o Otto para de atender e ele não fica sabendo, ele contratou o oposto do que queria — e descobre pelo cliente reclamando, que é a mesma forma de descobrir que a decisão A existe para evitar. O medo dele não é gastar demais; **é ficar mudo sem saber.** A frase do Felipe diz isso: *"existe o risco de respostas não serem respondido"*.

**O cliente final** não tem nada com isso. Ele mandou mensagem para uma empresa. Se ninguém responde, ele vai no concorrente, e nunca vai saber por quê. Esse é o pior desfecho do produto inteiro, e `cobranca.md` já o nomeia: *"cliente final mandando mensagem para o vazio é o pior cenário para a empresa e para a marca."*

Há um terceiro problema, menor e real: **o dono não sabe quanto é 200 créditos.** Ninguém tem intuição para isso no primeiro mês. Por isso o aviso não pode ser um número solto; precisa dizer quanto tempo aquilo dura no ritmo dele.

**E há um quarto, que o ADR 024 criou e que a seção 14 existe para resolver:** com preço por ação, o dono perdeu a conferência de cabeça. Antes ele contava as conversas do dia no WhatsApp e batia com o painel. Agora ele confere pelo extrato, linha por linha — e por isso o extrato não é acessório desta decisão, é a perna que a sustenta.

### 13.2 Decisão

**O Otto avisa em 80% e em 100%, nunca para de aparecer para o cliente final, e oferece dois caminhos com os dois números na frente do dono — dizendo qual dos dois é melhor para ele, mesmo quando o melhor é o que rende menos.**

Cinco regras.

**1. Dois avisos, e só dois.** Em 80% e em 100% da franquia do mês. Nada em 50%, nada em 90%, nada diário. Aviso frequente é o jeito mais rápido de treinar alguém a ignorar avisos, e o canal do dono já carrega a pergunta de aprendizado (12.5.G.3).

**2. O aviso reaproveita o canal que a decisão C abriu.** Painel sempre; WhatsApp do dono pelas regras de 12.5.G. **Não invento um segundo canal.** O aviso de 100% é o único do produto que ignora o teto de uma por dia: sem ele, a empresa fica muda sem saber.

**3. O Otto não some quando zera.** Ele vira recepcionista de uma frase, sem gastar um token. Detalhe em 13.4.

**4. Comprar mais 100 créditos é um caminho, e a comparação com subir de faixa aparece junto, com os dois preços por crédito.** O Otto **recomenda** um dos dois, com o motivo e o número. Isso é caráter — a anti-persona "vendedor de infomercial" de `persona-otto.md` e os princípios 2 e 5 de `voz-e-tom.md` (concreto, sem hype) — e é o que torna o avulso mais caro defensável em vez de armadilha. *(Citação corrigida pelo guardião: a regra 6 do caráter é sobre não prometer preço e prazo ao cliente final; o que sustenta esta regra aqui é a anti-persona e o princípio de voz.)*

**5. O que o dono compra acumula, como o resto.** Não há teto no acumulado (ADR 004, decisão do Felipe). Um bloco de 100 que expirasse no fim do mês seria uma regra nova, contrária ao ADR, e a pior surpresa possível.

#### Sobre a regra do Felipe, e por que a honestidade a serve

O Felipe pediu que a compra avulsa seja mais cara *"para incentivar o upgrade de plano"*. O desenho faz isso, e faz **pelo caminho que não queima o cliente**:

- Quem estourou **uma vez** compra mais 100 e paga mais caro por crédito — R$ 1,49 contra R$ 0,99 da faixa dele. O incentivo funciona no bolso, sem ninguém ser enganado. E para ele **essa é a escolha certa**: R$ 149 uma vez contra R$ 447 agora.
- Quem estoura **todo mês** recebe a conta na cara — *"este é o terceiro mês seguido em que você compra mais 100; no de 500 cada crédito sai R$ 0,89 em vez de R$ 1,49"* — e sobe. O incentivo funciona pela evidência, que é a repetição, não a projeção de um mês.
- O que **não** acontece: o Otto esconder que o avulso é mais caro por crédito, **nem esconder que trocar de faixa no meio do mês sai mais caro hoje** (R$ 644 no mês da troca, pela regra sem proração de 2026-09-09). Se ele esconder qualquer um dos dois, a primeira fatura ensina, e aí a empresa perde o cliente **e** a confiança. `pesquisa-2026-09.md` diz que a reclamação nº 1 da categoria é suporte, e contestação de fatura é a porta de entrada dela (o ADR 004 já tem gatilho para isso).

Em uma frase: **cada caminho é mais caro que o outro em alguma coisa, e o Otto diz as duas em voz alta.** O avulso é mais caro por crédito; a troca de faixa é mais cara hoje. Esconder um dos dois é escolher pelo dono o eixo que vende mais.

*(Atualizado pelo guardião da marca em 2026-09-09, depois da decisão do sem proração: a frase que estava aqui — "no seu ritmo, subir sai mais barato já neste mês" — é falsa sob a regra decidida e saiu de todos os lugares.)*

### 13.3 Como isso se chama para o dono

**Aprovado pelo guardião da marca em 2026-09-09, com um ajuste (a linha da compra avulsa). Unidade trocada no mesmo dia pelo ADR 024.** Os termos viraram regra em `docs/marca/identidade.md`. "Franquia", "saldo", "carteira", "recarga", "token", "plano", "upgrade" e "overage" são termos internos. Nenhum aparece em tela. **"Crédito" deixou de ser termo interno e virou a palavra do dono** — mas com três travas, porque é palavra de dinheiro (ADR 024, parecer contrário do guardião).

| Interno | Para o dono |
|---|---|
| Franquia do ciclo | **Os créditos deste mês** |
| Saldo acumulado | **O que sobrou dos meses passados** |
| Saldo zerado | **Os créditos deste mês acabaram** |
| Recarga avulsa / pacote extra | **Comprar mais 100 créditos** (a ação e o botão) · **o pacote** só como apelido em prosa, nunca no lugar do número |
| Faixa / upgrade de plano | **Passar para o de 500** (ADR 004: faixa não tem nome, tem número) |
| Ciclo | **Mês**, e a data concreta: "voltam dia 12" |
| Saldo, carteira, "seus créditos" | **Não existe possessivo.** Crédito é trabalho já pago, não dinheiro do dono (`identidade.md`). O teste rápido: se cabe um "seu" na frente, a frase está errada |

**O ajuste, e o motivo.** O ADR 004 fixou que a faixa não tem nome, tem número, porque nome de faixa mente sobre o Otto e porque o dono precisa conferir sozinho. A mesma razão vale para a compra avulsa: **o número vem sempre na frente** — "comprar mais 100 créditos", não "comprar o pacote". Fora que os dois caminhos da tela de comparação precisam ter a mesma forma; "o pacote" contra "o de 500" compara uma etiqueta com um número, e a assimetria sempre favorece um dos lados. "Pacote" segue permitido no meio de uma frase ("o pacote resolve e você não muda nada"), nunca como o nome da coisa que ele está comprando.

Nome da tela: **Créditos**. Decidido em 14.6, com o motivo e com as duas condições de forma que o nome exige.

**A fronteira do ADR 015, obrigatória.** A caixa de entrada conta **conversas**; esta tela conta **créditos**, e os dois números não batem de propósito. Onde aparecerem juntos — e vão, no Início — a frase da diferença aparece ali. **A definição canônica mora agora em `identidade.md`** ("A moeda é o crédito"), e é esta:

> Um crédito é um dia de conversa com uma pessoa. A mesma pessoa amanhã conta outro. E se a conversa passar de 10 respostas do Otto, conta mais um.

**Quarta frase, só nas contas que têm cargo que começa conversa** — não existe na v1, que só tem o Atendente:

> Quando é o Otto que começa a conversa, conta três: procurar alguém custa mais que responder.

**Por que a terceira frase é obrigatória, e este é o ajuste mais sério da decisão D.** O ADR 004 fixou a regra das 10 respostas ("passou, conta outro") e fixou também o critério da métrica exibida: *conferível sozinho pelo empregador*. Sem a terceira frase, a definição é bonita e errada — o dono conta as conversas do dia, acha 40, o painel diz 43, e a diferença que ele não consegue explicar é a porta de entrada da contestação de fatura que o próprio ADR 004 trata como gatilho de revisão. Três frases curtas custam uma linha e salvam a confiança no número. A versão de duas frases não é usada em lugar nenhum. **E a quarta é condicional de propósito:** carregar em toda conta uma regra que não se aplica a ela é ruído; ela entra junto com o cargo, nunca antes, e a partir daí não sai mais.

**A frase da diferença, para o Início.** Fechada pelo guardião em 2026-09-09, com um ajuste de número: *contam créditos*, no plural.

> A lista conta conversas. Aqui contam créditos: uma conversa de três dias com a mesma pessoa conta 3.

### 13.4 O que o Otto faz quando os créditos acabam

`cobranca.md` deixou três opções na pendência 2 e recomendou a terceira. **Decisão: a terceira, com forma.**

| Regra | O quê | Por quê |
|---|---|---|
| **Não some** | Toda pessoa que escrever recebe uma resposta | É o pior cenário do produto e da marca. Não é negociável |
| **Uma frase, sem inferência nenhuma** | Texto fixo por preset (`tipo_resposta = fixa_saldo_zero`, que já existe em `dados.md`). Zero token | O custo tem que ser só a tarifa da Meta, senão zerar o saldo passa a custar dinheiro por mensagem sem receita |
| **Uma por pessoa por dia**, não por mensagem | Se a pessoa mandar sete mensagens, ela recebe uma | Limita o custo de tarifa, que é o único custo que sobra |
| **A conversa vai para "Esperando você"** | Reaproveita a fila do ADR 015. Não invento estado novo | O dono precisa dessas conversas na frente dele, e a fila já é o lugar delas |
| **O cliente final nunca fica sabendo que a empresa ficou sem crédito** | Regra dura | A situação comercial da empresa com a ottobr.ai não é assunto do cliente dela. Isso não é esconder: é não ser assunto |
| **O Otto volta sozinho** na virada do mês, ou no minuto em que o dono comprar | Sem passo manual | Um produto que exige religar depois de pagar é um defeito |

**Texto ao cliente final — e aqui a audiência muda.**

> **Atenção: este é o único texto das decisões C e D lido por outra audiência.** Tudo o mais nas seções 12 e 13 é a marca ou o Otto falando com o empregador. Esta frase é lida por alguém que não é cliente da ottobr.ai, não sabe que existe franquia, não tem nada com a conta da empresa e está falando **com a empresa**. Ela foi revisada com esse critério, e qualquer mudança nela volta ao guardião antes de ir para o código.

As quatro versões por preset entraram em `docs/produto/estilos-de-atendimento.md`, "Textos fixos por preset", que é a casa delas. Aqui fica a Cordial e o raciocínio:

> (Cordial) Recebi sua mensagem e já passei para a equipe.

**Um ajuste: caiu o "Oi!".** A mensagem pode cair no meio de uma conversa já em andamento — o Otto responde três vezes, a franquia zera na quarta —, e cumprimentar de novo no meio da conversa é exatamente o tipo de coisa que denuncia que alguma coisa trocou de lugar por dentro. Sem o "Oi!", a frase funciona igual na primeira e na décima mensagem.

**Por que ela passa nos três critérios que essa audiência exige:**

- **Não expõe a empresa.** Não há nada sobre pacote, mês, limite ou pagamento. A situação comercial da empresa com a ottobr.ai não é assunto do cliente dela — e isso não é esconder, é não ser assunto. Se um dia alguém propuser "estamos com alto volume hoje", isso é bloqueio: é inventar uma desculpa em nome da empresa.
- **Não mente.** As duas coisas que a frase afirma acontecem: a mensagem foi recebida e a conversa entra em "Esperando você", na frente do dono. É **fato e não promessa** (regra 6 do caráter) — por isso não é "te respondem ainda hoje", que ninguém confirmou.
- **Não soa como robô quebrado.** É a mesma frase de balcão que um encaminhamento normal usaria, com o vocabulário que `identidade.md` já fixou ("passar para alguém da equipe"). Para quem lê, é só um encaminhamento — e é isso que ela tem que ser.

**Um limite declarado, que o guardião registra em vez de esconder.** Em saldo zero o Otto não conversa: é uma frase fixa, sem inferência. Se a pessoa perguntar "é robô?" justamente nesse momento, ela não recebe a divulgação que o ADR 003 exige. Isso **não fere o caráter** — a regra 2 de `persona-otto.md` proíbe *negar* ser IA, e aqui não há negativa nem desvio: o Otto não está atendendo, a empresa está acusando o recebimento. Mas o limite fica escrito, com duas consequências: (a) a frase nunca pode ser escrita como se fosse uma conversa em andamento, e é por isso que ela é curta e neutra; (b) se a medição mostrar pergunta sobre o Otto caindo com frequência em saldo zero, a saída é encurtar o tempo em saldo zero, nunca improvisar uma resposta ali. Vale a mesma nota para o treinador-do-otto e para o ADR 003.

**Nota ao treinador-do-otto:** este texto é o mesmo que serve à régua de inadimplência (pendência 8 de `cobranca.md`, que já pede "mesma mensagem mínima do saldo zero"). Uma frase, dois usos — e é bom que seja assim: se as duas fossem diferentes, a diferença contaria ao cliente final qual das duas situações a empresa está vivendo.

### 13.5 Telas, mensagens e estados

#### A. Bloco no Início

Não aparece sempre. **Só a partir de 80%** — abaixo disso é ruído, e o Início existe para responder "ficou alguém sem resposta hoje?" (5.7).

| Estado | O que aparece |
|---|---|
| Abaixo de 80% | Nada. Zero é a decisão certa aqui. **E a navegação também não mostra número** — ver 14.6, condição 1 |
| 80% | "O Otto usou 160 dos 200 créditos deste mês. Sobram 40 — uns 5 dias no ritmo desta semana." [Ver] |
| 80%, sem ritmo confiável (menos de 7 dias de uso) | A mesma frase **sem a projeção**: "O Otto usou 160 dos 200 créditos deste mês. Sobram 40." Número sem conta não entra: a projeção só existe se sair do ritmo real dos últimos 7 dias (`cobranca.md`) |
| 100% | "Os 200 créditos deste mês acabaram. Quem escrever agora recebe uma resposta dizendo que a mensagem chegou e foi passada para vocês, e a conversa cai aqui na sua fila. Voltam dia 12." [Ver o que dá pra fazer] |
| Depois de comprar mais 100 | "Pronto, o Otto voltou. Entraram mais 100 créditos." Some no dia seguinte. **Nunca "você tem mais 100"**: o possessivo é o que transforma a tela em extrato bancário (`identidade.md`) |
| Depois de trocar de faixa | "Pronto, o Otto voltou. Agora são 500 créditos por mês." Some no dia seguinte. Estado novo em 2026-09-09: com a regra sem proração a troca vale na hora, então ela tem um "depois" igual ao da compra avulsa |
| Assinatura vencida ou bloqueada (ADR 010) | Mesma mensagem mínima ao cliente final, texto diferente aqui: "A mensalidade está em aberto e o Otto parou. Assim que o pagamento entrar, ele volta sozinho." [Ver a fatura] |

**Aprovado, com uma correção de fato no estado de 100%.** O rascunho dizia que quem escrever "recebe um aviso de que você vai responder" — e não é isso que o cliente final recebe. A frase mínima de 13.4 diz que a mensagem chegou e foi passada para a equipe; ela não promete resposta, de propósito. Descrever ao dono uma promessa que o Otto não fez é o começo de duas mentiras: a dele com o cliente e a nossa com ele. O texto agora diz o que a mensagem diz. O resto do bloco está certo: números em vez de porcentagem, data concreta ("voltam dia 12") e nenhum adjetivo.

#### B. Tela: Créditos

Objetivo em uma frase: saber quantos créditos sobram no mês, conferir o que o Otto fez para chegar nesse número, e decidir o que fazer quando estiverem acabando.

Conteúdo, de cima para baixo: o número grande com os dois lados ("160 de 200"), a linha do que sobrou dos meses passados, **a definição do que conta como um crédito logo abaixo do número** (regra 7 do agente, ADR 004; `identidade.md`), a data em que renova, — só a partir de 80% — o botão que abre a comparação, e **o extrato** (seção 14), que é a metade de baixo da mesma tela. Uma rolagem, sem abas.

| Estado | O que aparece |
|---|---|
| Carregando | Esqueleto. Nunca giro no meio da tela |
| Primeiro mês, poucos dias | "O Otto usou 12 dos 200 créditos deste mês. Ainda é cedo para dizer se vai dar." Honesto: não projetar com 3 dias. **O extrato aparece igual, com as 12 linhas** — ver 14.4, e é o estado em que ele mais vale |
| Normal | Número, sobra dos meses passados, data de renovação, extrato |
| 80% e 100% | O bloco de A, aqui também, com o botão |
| Erro | "Não consegui carregar. Tenta de novo." |

**Aprovado.** A definição ao lado do número é a canônica de 13.3, com as três frases — é justamente nesta tela que ela não pode vir encurtada.

**O que não entra:** barra de progresso sem número, gráfico de consumo, previsão em porcentagem, selo de "uso saudável", **e o valor de um crédito em reais** (trava de `identidade.md`: nesta tela não há decisão a tomar, então não há reais a mostrar). Regra 7 do agente e princípio 2 de `voz-e-tom.md` (concreto, sem superlativo).

Acessibilidade: o número não é só tamanho — é texto com rótulo; "160 de 200" nunca é comunicado só por cor ou por preenchimento de barra.

#### C. Tela: comparar os dois caminhos

**É o coração desta decisão e é onde o caráter da marca aparece ou não aparece.** Uma tela, uma tarefa, dois caminhos, os dois preços por crédito visíveis. **É também a única tela do produto em que crédito e reais aparecem juntos** (`identidade.md`), e é por isso que eles aparecem sempre aos pares: um preço solto ensina "um crédito vale R$ X"; dois presos a duas escolhas ensinam que **quanto sai o crédito depende do caminho**, que é o que ele está decidindo ali.

> **Comprar mais 100 créditos** — R$ 149, uma vez · dá R$ 1,49 cada
> **Passar para o de 500 por mês** — R$ 447 agora e todo mês · dá R$ 0,89 cada · começa na hora
>
> Trocando de faixa, os R$ 197 que você já pagou este mês não são descontados: **este mês sai R$ 644**. Do mês que vem em diante, R$ 447.
> Nos dois casos, o que você não usar não vence no fim do mês: vai para o mês seguinte.
>
> *No seu ritmo, você fecha o mês em uns 260 créditos, e é a primeira vez que passa dos 200. Comprar mais 100 resolve este mês por R$ 149. O de 500 sai mais barato por crédito — R$ 0,89 contra R$ 1,49 — e só compensa se isso virar rotina.*
>
> [Comprar 100 créditos — R$ 149] · [Passar para o de 500 — R$ 447]

**Desbloqueado e fechado em 2026-09-09**, com a regra que o Felipe decidiu: **sem proração** (`cobranca.md`, pendência 4; ADR 004, nota de 2026-09-09). A faixa nova vale na hora, ele paga cheio, e o que já pagou no mês não vira crédito.

**A frase que eu tinha bloqueado continua proibida, e agora por um motivo melhor: ela é falsa.** "Sai mais barato já neste mês" descrevia um mês que não existe. No mês da troca ele paga R$ 197 + R$ 447 = **R$ 644** — o mês mais caro do ano dele. Uma tela que empurra o compromisso maior escondendo que ele custa mais hoje é upsell disfarçado, e esta é justamente a tela cujo propósito declarado é não ser isso. Por isso a linha do R$ 644 não é rodapé nem letra miúda: fica entre os dois caminhos e o botão.

**Os três números que o dono não consegue conferir sozinho, e por isso aparecem antes de ele confirmar:**

| O que ele precisa saber | Onde está | Por que ele não descobre sozinho |
|---|---|---|
| **Quanto sai agora** | "R$ 149, uma vez" · "R$ 447 agora e todo mês" · a linha do R$ 644 | Ninguém adivinha que a troca no meio do mês cobra cheio. É a informação que a regra do Felipe cria e que só nós temos |
| **Quando começa a valer** | "começa na hora" | Sem isso ele não sabe se está comprando para hoje ou para a virada — e a resposta muda a decisão de quem está com o Otto parado |
| **O que acontece com o que sobrar** | "o que você não usar não vence no fim do mês: vai para o mês seguinte" | É o que torna a regra justa em vez de predatória. Sem acúmulo, pagar cheio no dia 20 seria comprar dez dias de capacidade que evapora |

**A recomendação do exemplo mudou de lado, e isso é o teste da regra 4 funcionando.** O rascunho recomendava subir de faixa para quem fecha o mês em 260 créditos. Com os números reais na mão, está errado: 260 créditos, uma vez, custam R$ 149 pelo avulso contra R$ 447 pela troca. Quem estoura uma vez compra 100 e pronto — e a tela diz isso, mesmo sendo o caminho que rende menos para nós. A variante do outro lado é a de quem já estourou antes:

> *Este é o terceiro mês seguido em que você compra mais 100. No de 500, cada crédito sai R$ 0,89 em vez de R$ 1,49 — e você para de comprar avulso todo mês.*

**Sobre a frase do acúmulo, e o limite dela.** "Não vence no fim do mês" é verdade e está decidido (ADR 004, sem teto). **"São seus para sempre" não está** — `cobranca.md` pendência 5 (o que acontece com o acumulado se a assinatura parar ou descer de faixa) está aberta desde que esta regra foi criada. Nenhum texto desta tela, da confirmação ou do e-mail de recibo pode afirmar permanência enquanto ela não fechar. Se aparecer "nunca vencem", "são seus" ou "guardados para sempre" em qualquer rascunho, **bloqueia**.

Duas correções de forma que continuam valendo, do parecer anterior: **as duas linhas têm a mesma estrutura** (valor agora · valor por crédito), porque atributo que aparece só de um lado é lido como vantagem exclusiva; e **os dois botões têm número**, porque "[Comprar o pacote]" contra "[Passar para o de 500]" comparava um apelido com um número.

Regras da tela, e todas existem para ela não virar upsell:

1. **Os dois preços por crédito sempre aparecem**, lado a lado, **e nunca um sozinho**. É o número que o dono confere sozinho, que é o critério que o ADR 004 fixou para a métrica exibida — e o par é o que impede a leitura falsa de "um crédito vale R$ X" (`identidade.md`).
2. **A recomendação é uma frase e diz o motivo.** Nunca "recomendado" como selo, nunca destaque visual num dos dois botões.
3. **A recomendação sai do ritmo real.** Sem 7 dias de dado, a frase de recomendação **não aparece** — em vez de inventar uma projeção. Ficam os dois caminhos com os dois preços, e pronto. **Vale igual para "é a primeira vez que passa dos 200"**: essa frase depende de haver mês fechado no histórico; no primeiro mês da conta ela some, e não é substituída por nada.
4. **O Otto recomenda comprar mais 100 quando comprar mais 100 é melhor**, e isso vai acontecer com quem estourou uma vez. Se a tela nunca recomendar o avulso, ela está mentindo.
5. **Nada de contagem regressiva, "última chance" ou preço que muda se ele esperar.** Anti-persona explícita (`persona-otto.md`: vendedor de infomercial).
6. **Os dois eixos aparecem sempre: quanto sai por crédito e quanto sai do caixa hoje.** Acrescentada em 2026-09-09, com a regra do sem proração. São dois números que apontam para lados opostos — o de 500 ganha por crédito (R$ 0,89 contra R$ 1,49) e perde no caixa (R$ 447 contra R$ 149, e R$ 644 no mês da troca) — e o dono decide com os dois. Mostrar só o preço por crédito seria escolher por ele o eixo que favorece a venda maior. **A tela dá os dois, com o mesmo peso e na mesma linha.**
7. **Nada de "para sempre".** O acúmulo dito na tela é "não vence no fim do mês". A frase **"o que você já pagou continua seu, mesmo se você parar" foi liberada** em 2026-09-09, com a pendência 5 de `cobranca.md` decidida pelo Felipe, e pode ser usada. Continuam bloqueadas "são seus para sempre", "nunca vencem" e "guardados para sempre", agora por causa da régua de inadimplência (pendência 8), que ainda não disse se quem está com fatura vencida usa o acumulado.

| Estado | O que aparece |
|---|---|
| Padrão | Os dois caminhos, com a recomendação |
| Já está na faixa de cima | Só a compra avulsa, mais uma linha honesta: "Acima de 1.200 a gente conversa para achar o tamanho certo." [Falar com a gente] |
| Confirmando a compra avulsa | Uma tela de confirmação, e esta tem consequência real (cobra dinheiro): "R$ 149 agora, uma vez. 100 créditos, que entram na hora. O que você não usar não vence no fim do mês." Mais o meio de pagamento (ADR 010) |
| Pagamento pendente (PIX, boleto) | "Assim que o pagamento cair, o Otto volta na hora." **O Otto não volta antes de confirmar.** Nunca fingir que voltou |
| Pagamento falhou | "O pagamento não passou. Tenta de novo ou usa outro jeito." Sem culpar o dono, sem código de erro |
| Trocando de faixa | Confirmação com os três números de cima, sem eufemismo: **"R$ 447 agora, e todo mês a partir do próximo. Os R$ 197 deste mês não são descontados — este mês sai R$ 644. Os 500 créditos entram na hora, e o que você não usar não vence no fim do mês."** [Passar para o de 500] · [Deixa como está] |

Três ajustes nos estados, e o da troca de faixa é novo.

**"Trocando de faixa" deixou de ser vago.** O rascunho dizia "valor novo, **a partir de quando**, e que o que sobrou continua sobrando" — porque em 2026-09-09 de manhã ninguém sabia a resposta. Agora sabe: vale na hora, cobra cheio, não desconta. A confirmação diz os R$ 644 com todas as letras, na tela em que ele ainda pode desistir. Descobrir isso na fatura seria a pior forma possível de aprender a regra, e contestação de fatura é gatilho de revisão no ADR 004.

Dois ajustes miúdos, do parecer anterior. **Caiu o "Me chama"** da faixa de cima: quem fala nessa tela é a marca ("a gente conversa"), e "me chama" põe o Otto pedindo para ser chamado no meio de uma frase que não é dele — e ainda concorre com o botão que está logo ao lado. **Caiu o "Costuma ser rápido no PIX"**: é uma promessa sobre o tempo de um terceiro, sem número e sem lastro, exatamente o que o princípio 2 de `voz-e-tom.md` proíbe. A primeira frase já resolve, e não envelhece.

#### D. Mensagens no WhatsApp do dono

Pelas regras de 12.5.G. As duas cabem em template com variáveis, porque a de 100% precisa passar mesmo com a janela fechada.

> (80%, entra no teto de uma por dia, perde só para o 100%) **Fechada pelo guardião em 2026-09-09.**
> Oi. Este mês, atendendo cliente, eu já usei 160 dos 200 créditos. Sobram 40, uns 5 dias no ritmo desta semana. Dá uma olhada no painel quando puder: [link] · Se preferir que eu não avise, responde *chega*.

> (100%, ignora o teto, sempre passa, **e é a única mensagem do produto que não carrega o desligar**) **Fechada pelo guardião em 2026-09-09.**
> Os 200 créditos deste mês acabaram e eu parei de atender. Quem escrever agora recebe uma resposta minha dizendo que a mensagem chegou e foi passada para vocês, e a conversa cai na sua fila. Voltam dia 12 — ou antes, se você comprar mais 100: [link]

**O desligar, e por que ele está numa e não na outra.** A `voz-e-tom.md` §1.1 exige que toda mensagem que o Otto **inicia** carregue como parar de recebê-la, e as duas mensagens estavam sem. O guardião decidiu, como dono da regra:

| Mensagem | Carrega o desligar? | Por quê |
|---|---|---|
| **80%** | **Sim**, na forma de G.1: "responde *chega*" | É cortesia e é recorrente — chega todo mês, em toda conta que encosta no limite. Aviso recorrente sem saída é o que treina alguém a ignorar o canal |
| **100%** | **Não. Exceção declarada**, escrita em `voz-e-tom.md` §1.1 | Não é cortesia: é o **estado do serviço contratado**. Sai no máximo uma vez por mês e, calada, deixa a empresa muda sem saber — que é exatamente o dano que o Felipe apontou. A tela de configurações já diz isso sem eufemismo (13.5.D, fim) |

**O buraco da regra 11 com um cargo só, resolvido por inversão e não por substituição.** A regra 11 do ADR 024 manda o Otto pôr o **verbo antes do número** — "*eu respondi 152 clientes e mandei 8 lembretes: 160 dos 200 créditos*". Essa forma é boa e só funciona com dois cargos. Com um cargo só, a frase que nomeia gente é falsa; a saída é pôr o trabalho na frente por inversão, e não trocar de frase:

| Tentativa | Por que não |
|---|---|
| "Já respondi 160 clientes" | **Falso.** 160 créditos não são 160 pessoas: a mesma pessoa voltando amanhã gasta outro crédito. `identidade.md` já proíbe "pessoas atendidas" quando o número não é de pessoas distintas |
| "Já respondi 160 vezes" | Pior: lê-se como 160 mensagens, e uma conversa tem muitas. Convida o dono a conferir errado e a contestar |
| "Já fiz 160 dias de conversa" | Verdadeiro e ilegível. "Dia de conversa" é a definição, não a fala |
| ~~"Já usei 160 dos 200 créditos deste mês atendendo cliente"~~ | Verdadeira, mas com "usei" abrindo a frase **a contagem entra na frente do trabalho** — que é o oposto do que a regra 11 pede |
| **"Este mês, atendendo cliente, eu já usei 160 dos 200 créditos"** | **A forma.** Mesma frase, invertida: o trabalho abre, o número fecha, e nenhuma contagem falsa de gente |

Isso não é implicância de redação: a alternativa que soa melhor é a que produz a contestação de fatura que o ADR 004 trata como gatilho de revisão. **A regra 11 foi emendada em `identidade.md` com as duas formas — a de um cargo e a de vários — e com as três formas falsas escritas por extenso**, para ninguém redescobrir o buraco daqui a seis meses. **Quando o segundo cargo entrar, a forma original volta inteira**, porque aí o número que o Otto cita é a divisão do trabalho ("respondi X, mandei Y lembretes"), não uma contagem de pessoas.

**Ajustadas: as duas estavam na terceira pessoa, e quem manda essas mensagens é o Otto.** No rascunho, a mensagem dizia "o Otto já fez 160" — o funcionário falando de si mesmo em terceira pessoa, no mesmo WhatsApp em que, no dia anterior, ele tinha escrito "hoje 3 clientes perguntaram coisas que eu não soube responder" (12.5.G.2). Ou o canal tem uma voz, ou vira notificação de sistema com nome de gente, que é o pior dos dois mundos. Regra geral, agora em `voz-e-tom.md` §1.1: **no painel a marca fala do Otto em terceira pessoa; no WhatsApp do dono quem fala é o Otto, em primeira.** A correção de fato do estado de 100% (13.5.A) vale aqui também.

**Confere contra a persona, porque aqui o Otto está falando de dinheiro com o chefe.** As duas mensagens falam do **trabalho dele** — quanto fez, quanto falta, que parou —, não do bolso do dono. Não há adjetivo, não há urgência, não há preço, não há "aproveite", e o número aparece sozinho para o dono tirar a própria conclusão. O link de compra na de 100% fica: naquele momento, o que destrava o trabalho é informação de serviço, e omitir seria proteger a nós, não a ele. **A ressalva do ADR 018 não se aplica** — ela existe para conversa que a empresa começa com o **cliente final** sobre dinheiro que ele deve, onde não saber que é IA muda a decisão da pessoa. Aqui quem recebe é o empregador, que contratou o Otto, sabe o que ele é e paga a conta. **O que faltava, e virou regra na `persona-otto.md`:** quando o assunto é a conta da empresa com a ottobr.ai, o Otto informa uma vez, mostra o caminho e não volta ao assunto — não insiste, não repete, não elogia a faixa maior e não sugere que ele trabalha melhor numa faixa do que na outra (ADR 004).

O aviso de 100% **não se desliga** nas configurações (12.5.G.1). Motivo: o dano de ele não chegar é a empresa ficar muda sem saber, que é exatamente o que o Felipe apontou. Está dito na tela de configurações, sem eufemismo:

> Quando os créditos do mês acabarem, eu te aviso de qualquer jeito. Esse aviso não dá para desligar.

### 13.5.1 Jornada — o mês acabando

| Momento | O que acontece | Ponto de desistência |
|---|---|---|
| Dia 22, 160 de 200 | Bloco no Início e uma mensagem no WhatsApp, com a projeção real | **Ele ignora.** É o comportamento provável de quem não sente dor ainda. Aceitável: o de 100% ainda vem |
| Ele toca em "Ver" | Tela Créditos, depois a comparação, com os dois preços | **Aqui.** Se a tela parecer venda, ele fecha e não volta. Por isso a recomendação pode ser "compra mais 100 e pronto" |
| Ele decide | Compra mais 100 (3 toques mais o pagamento) ou passa de faixa | Pagamento pendente é espera real, e a tela diz isso sem fingir |
| Ele não decide, dia 27, 200 de 200 | O Otto vira recepcionista de uma frase. As conversas caem em "Esperando você". Aviso no WhatsApp que ignora o teto | **O ponto que dói.** O dono passa a responder à mão, que é o que ele contratou o Otto para não fazer. É desconfortável de propósito e é honesto |
| Dia 12 | Renova. O Otto volta sozinho | — |

**O que esta jornada faz de bom sem ser uma funcionalidade:** os dias em 100% são a melhor demonstração de valor que o produto tem. O dono sente, por três dias, exatamente o trabalho que o Otto tirava dele. Não desenho nada para explorar isso — mas registro que é assim, porque explica por que o aviso de 80% pode ter conversão baixa e o produto ficar bem mesmo assim.

### 13.6 Por que as alternativas perdem

| Alternativa | Por que perde |
|---|---|
| **O Otto simplesmente para** | O pior cenário do produto e da marca, e `cobranca.md` já dizia. Cliente final para o vazio |
| **Recarga automática, ligada por padrão** | Cobrar sem o dono mandar é o caminho mais curto para contestação de fatura — que o ADR 004 já trata como gatilho de revisão. Fica **fora da v1** como opção que ele liga, com gatilho em 13.7 |
| **Deixar passar e cobrar depois** (excedente na fatura) | Fatura surpresa. Fere o critério que o ADR 004 fixou: a unidade tem que ser conferível pelo dono sozinho, e nada é menos conferível que uma conta que ele não escolheu fazer |
| **Bloquear o painel** | Absurdo pelo desenho: é exatamente quando ele mais precisa do painel, porque agora é ele quem responde |
| **Barra de progresso do consumo** | Regra 7 do agente. E mede a coisa errada: ninguém precisa saber que está em 43%; precisa saber quando vai acabar |
| **Avisar em 50%, 70%, 90%, 95%** | Queima o canal (12.5.G.3). Dois avisos, e o segundo é o que importa |
| **Esconder um dos dois lados caros** — que o avulso sai mais caro por crédito, ou que trocar de faixa no meio do mês cobra cheio (R$ 644 no mês da troca) | Ganha um mês e perde o cliente. E derruba a única coisa em que o Otto compete com a Meta, que é confiança (`pesquisa-2026-09.md`). Cada caminho é o mais caro em algum eixo; contar só um é escolher pelo dono |
| **Dizer quanto vale um crédito em reais** ("cada crédito sai R$ 0,99") | Trava de `identidade.md`. É a taxa de câmbio que a moeda existe para fechar, e ela é **falsa por desenho**: R$ 0,99 no de 200, R$ 0,89 no de 500, R$ 0,83 no de 1.200, R$ 1,49 comprando mais 100. O único lugar em que reais e crédito convivem é a tela de comparação, aos pares |

### 13.7 O que fica fora da v1

| Fora | Por quê | O que faria entrar |
|---|---|---|
| **Recarga automática** ("quando acabar, compra sozinho") | É a opção (a) da pendência 2 de `cobranca.md`. Exige mandato de cartão guardado e é o mecanismo com maior chance de gerar cliente irritado. Não é preciso: o aviso de 100% mais a compra de 3 toques resolvem | 3 contas distintas pedirem (`suporte.pedido_registrado`) |
| **Escolher o tamanho da compra avulsa** (50, 100, 300) | Custo de decisão sem ganho. Um tamanho só, e quem precisa de mais que isso está recebendo a recomendação de subir de faixa | Contas comprando 2 ou mais blocos de 100 no mesmo mês, o que já é o sinal de que o tamanho está errado |
| **Alerta na hora em que uma conversa vira o segundo crédito** (a regra dos 10) | O ADR 004 já fixou a regra; explicar isso mensagem a mensagem é ruído. **O extrato já mostra**, com a linha marcada, no lugar em que ele vai conferir (14.3) | Contestação de fatura citando conversa longa |
| **Previsão de gasto do mês seguinte** | Projeção sobre projeção. Uma semana de ritmo já é frágil; um mês inteiro é inventar | Nada previsto |
| **Limitar o Otto por conta própria** ("me avisa e para em 150") | Ninguém pediu, e é o oposto da promessa: teto voluntário é o dono escolhendo perder cliente | 5 contas pedirem |
| **Cobrar diferente por canal** | O ADR 021 já decidiu: franquia única, nunca por canal | O gatilho do próprio ADR 021 |

### 13.8 Fichas comportamentais

| # | Afirmação | Onde sustenta | Tipo | Evidência hoje | Comparável | Taxa mínima | Como se mede | O que a mata | Grau |
|---|---|---|---|---|---|---|---|---|---|
| 13.1 | O dono que recebe o aviso de 80% faz alguma coisa nas 48 h seguintes | O aviso de 80% existir | Taxa. **Com gatilho externo** (chega no WhatsApp dele) | Nenhuma | Sem análogo conferido; não inventar magnitude. Direção robusta: aviso que chega supera aviso que espera ser encontrado | Metade das contas que cruzam 80% abre o painel ou a comparação em 48 h | `aviso.enviado` com `motivo = creditos_80` e `acao_seguinte ≠ nenhuma` (12.12.3) | Menos de 1 em 5 → o aviso de 80% não paga o que custa em atenção; sobra só o de 100%. **Não trocar 80% por 90% antes de olhar isto** | NÃO VERIFICADO |
| 13.2 | Mostrar que o avulso é mais caro **não** derruba a compra dos 100 a ponto de a conta ficar sem saída | A tela de comparação honesta (13.5.C), e é a hipótese que a decisão do Felipe assume | Taxa | Nenhuma | Direção **não é robusta aqui**, e isso precisa estar escrito: transparência de preço tem efeito conhecido sobre confiança e efeito ambíguo sobre conversão imediata. Magnitude local, sem análogo aberto nesta sessão | 1 em 3 dos que veem a comparação escolhe um dos dois caminhos | `aviso.enviado.acao_seguinte ∈ (comprou_mais_100, subiu_de_faixa)` sobre as contas que cruzaram 100% | Menos de 1 em 10 escolhe qualquer um dos dois → o problema não é a honestidade, é o preço ou o momento. **A resposta nunca é esconder o preço por crédito**; é rever o tamanho do bloco ou antecipar a conversa | NÃO VERIFICADO |
| 13.3 | Quem estoura todo mês sobe de faixa quando vê a conta | A regra do Felipe (avulso mais caro empurra o upgrade) | Preferência revelada | Nenhuma | Direção robusta: diferença de preço visível e recorrente muda escolha. Magnitude local | Metade das contas que compram 2 blocos de 100 em 3 meses sobem de faixa | `pagamento.confirmado.tipo = recarga` por conta e ciclo, contra `configuracao.alterada` com `campo = faixa`; e `ciclo.fechado.creditos_comprados_no_ciclo` | Mais de 7 em 10 continuam comprando avulso em vez de subir → ou o avulso está barato demais (decisão de preço, do Felipe), ou eles preferem não aumentar o compromisso mensal, **que é uma preferência legítima e não um defeito da tela** | NÃO VERIFICADO |
| 13.4 | O cliente final que recebe a mensagem mínima volta | 13.4, a decisão de o Otto não sumir | Ausência. Ele não reclama; ele some | Nenhuma. Canal passivo não mede | A comparação existe de graça dentro do produto: encaminhamento normal × saldo zero | A taxa de volta depois de `saldo_zero` não é pior que depois de um encaminhamento normal | `conversa.iniciada.primeira_vez = false` do mesmo `cliente_hash` em 7 dias, comparando conversas com `desfecho = saldo_zero` e `desfecho = encaminhada` | Volta bem menor depois de `saldo_zero` → a frase mínima não está segurando, e o texto vai ao guardião antes de qualquer mudança de mecanismo | NÃO VERIFICADO |
| 13.5 | A empresa não descobre que zerou pelo cliente reclamando | O aviso de 100% ignorar o teto | Ausência / incidência | Nenhuma | Não se aplica | Incidência zero é o alvo | `suporte.pedido_registrado.categoria = saldo` com `conversa_id` de conversa `saldo_zero`; e a pergunta do dia do resumo | Uma única conta descobrindo pelo cliente → o aviso de 100% falhou em entrega, não em desenho. Olhar `aviso.enviado.entregue` antes de mexer na tela | NÃO VERIFICADO |
| 13.6 | "Crédito" é entendido sem explicação, e o número que ele imagina bate com o que a gente conta | O vocabulário inteiro de 13.3 e o ADR 004 | Capacidade | **Ficha já aberta em `cobranca.md`**, seção de hipóteses, com a unidade antiga. Não duplico: esta linha existe só para dizer que a tela Créditos depende dela | — | 2 de 5 pessoas pedirem explicação mata (limiar de `cobranca.md`) | O de `cobranca.md` | O de `cobranca.md`. Se ela cair, esta tela é a primeira a mudar | NÃO VERIFICADO |
| 13.7 | A palavra "crédito" **não** instala a leitura de que 1 crédito vale R$ 1 | As três travas de `identidade.md`, e é a objeção formal do guardião no ADR 024 | Capacidade. **É do tipo mais barato de testar e o menos testado** | Nenhuma | Não se aplica: a leitura é local e a faixa de entrada quase a confirma sozinha (200 por R$ 197) | 5 de 5 donos leem a tela Créditos e **não** perguntam quanto vale um crédito | Sessão de 10 minutos com a tela em papel, antes de código; depois, `suporte.pedido_registrado.categoria = saldo` com o texto do pedido lido à mão | O gatilho do próprio ADR 024: cinco donos pedirem a conta em reais ou perguntarem quanto vale um crédito. Aí a palavra volta à mesa, com "ficha" como alternativa já argumentada | NÃO VERIFICADO |

Três fichas (13.2, 13.6 e 13.7) são testáveis **antes de código**, mostrando a tela de comparação e a tela Créditos em papel a 5 donos e perguntando o que eles fariam — e, principalmente, o que eles acham que cada caminho custa e quanto eles acham que vale um crédito. **A 13.7 é a mais barata e a mais importante das três**, porque é a que decide se a palavra que o Felipe escolheu contra o parecer do guardião se sustenta.

### 13.9 Eventos — proposta ao analista de produto

**Zero eventos novos. O teto de 20 de `dados.md` continua intacto**, e a fusão proposta em **12.12.3** (`saldo.limiar_cruzado` → `aviso.enviado`) serve às duas decisões de uma vez. Foi por isso que ela foi proposta lá e não aqui.

| Evento | Campo | Para quê |
|---|---|---|
| `aviso.enviado` (evento 10, renomeado em 12.12.3) | `motivo` ganha `creditos_80` e `creditos_100` — que são o que `saldo.limiar_cruzado.limiar` já dizia. `acao_seguinte` ganha **`comprou_mais_100`**, **`subiu_de_faixa`** e **`abriu_o_painel`** | Fichas 13.1 e 13.2. O que o dono fez depois do aviso é a única leitura que diz se a decisão funciona |
| `pagamento.confirmado` (15) | `tipo = recarga` **já existe**. Acrescentar **`creditos_comprados int?`** | Sem isso, a receita de avulso não se converte em créditos e a pergunta 2.5 de `dados.md` fica cega para essa parte |
| `configuracao.alterada` (12) | `campo` ganha **`faixa`**, dentro do `grupo = conta`; `de`/`para` = o número da faixa ("200" → "500") | Subir de faixa não tinha evento. Ficha 13.3, e a decisão de preço do Felipe depende dela |
| `ciclo.fechado` (11) | **`creditos_comprados_no_ciclo int`** | Distingue "usou 100% da franquia" de "usou 100% e comprou mais", que hoje ficam iguais em M6 e mandam sinais opostos sobre a faixa |
| `conversa.iniciada` (4) / `conversa.encerrada` (8) | `saldo_zero` e `desfecho = saldo_zero` **já existem**. Nada a fazer | M2 já os exclui. A ficha 13.4 se calcula sobre o que existe |
| `suporte.pedido_registrado` (19) | `categoria = saldo` **já existe** | Ficha 13.5 |

**Uma leitura nova, sem evento novo:** *quantas contas cruzam 100% e não fazem nada, por faixa*. É `aviso.enviado` com `motivo = creditos_100` e `acao_seguinte = nenhuma`, sobre as contas que cruzaram. Diz se a faixa de entrada está pequena demais — a pergunta que `cobranca.md` deixou aberta — e diz com comportamento, não com opinião.

### 13.10 Perguntas para o Felipe

1. ~~**O tamanho da compra avulsa é 100?**~~ **Decidido, em `cobranca.md` pendência 3: bloco de 100 por R$ 149**, um bloco por compra, sem desconto por volume. Confirma o desenho de um tamanho só.
2. ~~**O aviso de 100% pode mesmo ignorar o teto de uma mensagem por dia?**~~ **Sim, decidido pelo Felipe em 2026-09-09:** *"pode sim, é um custo que a empresa pode cobrir."* O aviso de crédito zerado sai no mesmo dia, mesmo que o Otto já tenha mandado a pergunta de aprendizado. É a única mensagem com essa licença.
3. ~~**O que o dono compra avulso acumula, como a franquia?**~~ **Sim, decidido pelo Felipe em 2026-09-09.** Mesma regra da franquia, sem validade própria.
4. ~~**Recarga automática fora da v1?**~~ **Recusada, não adiada**, pelo Felipe em 2026-09-09: *"não vejo porque recarga automática, já que o cliente já tem a assinatura dele e isso foi um caso excepcional que o levou a comprar mais."* A compra avulsa é para o pico isolado; quem precisa dela todo mês precisa de outra faixa, e automatizar a exceção esconderia o sinal que deveria empurrar o upgrade. **Sai de 13.7 (fora da v1 com gatilho) e vira alternativa rejeitada em 13.6.** Toda compra é um toque do dono, sempre.
5. ~~**Quando a faixa nova passa a valer, e o que acontece com o mês em curso?**~~ **Decidido pelo Felipe em 2026-09-09: sem proração.** Vale na hora, paga cheio, o que já pagou no mês não vira crédito; o acúmulo é o que torna isso justo. Texto reescrito em 13.5.C, e as duas frases bloqueadas continuam proibidas — agora porque são falsas, não porque faltava decisão. `cobranca.md` pendência 4 e ADR 004, nota de 2026-09-09.

**A pendência que essa decisão abriu, e que ainda trava texto:** o que acontece com o acumulado se a assinatura parar ou descer de faixa (`cobranca.md`, pendência 5). Não é pergunta de desenho e não é minha. O Felipe decidiu a parte principal em 2026-09-09 (o que já foi pago sobrevive), e `identidade.md` liberou **"o que você já pagou continua seu, mesmo se você parar"**. Continuam bloqueadas, por causa da régua de inadimplência (pendência 8): **"são seus para sempre"**, **"nunca vencem"** e **"guardados para sempre"**. "Não vence no fim do mês" pode ser dito.

---

## 14. Decisão E — O extrato, e o preço da ação antes de ligar

De 2026-09-09 (tarde). Não nasceu de um pedido de tela: nasceu de duas regras do **ADR 024** que não têm forma sem desenho.

> **Regra 10.** O extrato é obrigatório. O dono vê cada ação e quanto ela custou, com data e com quem foi atendido. É o que substitui a conferência de cabeça — e sem ele, a contestação de fatura que o ADR 004 trata como gatilho de revisão vira certeza.
>
> **Regra 8.** Ação que conta mais de um crédito não acontece sem alguém ter visto o número antes de apertar. É regra de desenho, não só de texto.

### 14.1 O problema da pessoa

**O dono perdeu a conferência que ele fazia de graça.** Até o ADR 024, o critério do ADR 004 — *a unidade tem que ser conferível sozinho pelo empregador* — era satisfeito por acaso: ele abria o WhatsApp, contava as conversas do dia e batia com o painel. Não era funcionalidade nossa; era uma coincidência entre a nossa contagem e a memória dele.

Com preço por ação, a coincidência acaba. Duas ações diferentes contam números diferentes, e nenhuma memória de dono de assistência técnica guarda isso. Sobram duas saídas: ou ele confia no número sem poder conferir — e confiança sem conferência é a que quebra na primeira fatura estranha —, ou a gente devolve a conferência em forma de lista.

**O momento em que isso importa não é o mês 1; é o mês 6, às 21h, com a fatura na tela e a pergunta *"por que 214 se eu atendi umas 180 pessoas?"*.** É por isso que legibilidade aqui é requisito e não refinamento: o extrato é lido em desconfiança, não em curiosidade.

**A segunda pessoa é a mesma, seis meses antes.** Na semana 1 ele não desconfia de nada — e é justamente aí que o extrato tem que ser lido, porque é o único momento em que ele consegue conferir o **todo** e aprender que o número é honesto. Ver 14.4, que é onde essa inversão vira desenho.

### 14.2 Decisão

**O extrato é a metade de baixo da tela Créditos, agrupado por dia, com uma entrada por pessoa por dia, e o número só aparece na entrada quando ela não conta 1.**

Cinco regras.

**1. Não é tela nova, é a mesma tela do número.** O número e a prova dele ficam a uma rolagem de distância. Extrato em outro item de menu é o desenho em que ninguém confere, porque conferir passa a exigir saber que o lugar existe.

**2. O agrupamento é por dia, nunca por pessoa.** A unidade é *um dia de conversa com uma pessoa*: agrupar por pessoa esconde exatamente o eixo que a definição usa (a mesma pessoa em 3 dias viraria uma linha com "3", e o dono não confere isso contra nada). Agrupado por dia, cada dia é conferível contra a memória de um dia. **O corte por pessoa existe e já tem casa: a tela Contato** (4.9), que lista as conversas daquela pessoa. Nenhum filtro novo, nenhuma tela nova.

**3. Uma entrada por pessoa por dia. O número aparece só quando não é 1**, com o motivo colado nele. No caso comum, o extrato de um dia é uma lista sem números, e **contar as linhas dá o total do dia** — a conferência acontece sem aritmética. Quando um dia tem uma entrada com "2", a soma não bate com a contagem de linhas, e a diferença está explicada na própria linha que a causou. É o oposto de uma nota de rodapé.

**4. As entradas de crédito aparecem junto com as de gasto.** O extrato tem as duas direções, ou não fecha: a franquia do mês entrando, a compra de mais 100, o mês de indicação (ADR 011). Sem isso o dono vê o consumo e não vê de onde veio o número de cima.

**5. O extrato mostra o que foi cobrado, nunca recalcula.** Cada linha nasce do lançamento, com o preço que valia no dia (`preco_aplicado` e `versao_da_tabela`, ADR 024). Uma tela que recalcula com a tabela de hoje faz uma fatura de março mudar em setembro, e aí não é mais defesa contra contestação: é a causa dela.

### 14.3 O extrato: forma

**Objetivo em uma frase:** conferir cada ação do Otto — quem, quando, o que foi, e quanto contou.

Período padrão: **o mês em curso**, o mesmo do contador de cima, com a data em que começou. Meses anteriores por um seletor de mês no fim da lista ("Ver agosto"), nunca um seletor de intervalo de datas — intervalo é gesto de ferramenta de escritório, e o que o dono contesta é sempre um mês, porque é o que a fatura tem.

Forma, para o especialista-react. **Texto fechado pelo guardião em 2026-09-09** — e note que a lista **não tem título**: ela segue o número, sem cabeçalho próprio.

> **Este mês** · desde 12 de agosto
>
> **Terça, 9 de setembro — 14 créditos**
> Márcia Souza · respondeu · 08h12
> (11) 98812-4471 · respondeu · 09h03
> Jorge da Silva · respondeu · 09h40
> Márcia Souza · respondeu · 16h55 — **2**, passou de 10 respostas
> …
>
> **Segunda, 8 de setembro — 11 créditos**
> …
>
> **Sexta, 12 de agosto — entraram os 200 créditos de agosto**

O que cada parte faz, e por que está lá:

| Parte | Regra |
|---|---|
| **Cabeçalho do dia** | Data por extenso com o dia da semana, e o total do dia. Dia da semana não é enfeite: o dono lembra "terça" muito melhor que "dia 9" |
| **Quem** | Nome do perfil do WhatsApp, ou o número quando não há nome. Mesma regra de Contatos (4.9). **Nunca "cliente #4471"** |
| **O que** | Um verbo, sempre, mesmo na v1 em que todas as linhas dizem o mesmo. É o que faz o extrato continuar legível quando entrar um cargo que faz outra coisa — e, se o verbo só aparecesse a partir da v1.1, o dono teria que reaprender a tela |
| **Quando** | A hora da **primeira** mensagem daquela pessoa naquele dia. É por ela que ele acha a conversa no WhatsApp. Faixa de horário ("08h12 → 11h40") foi descartada: densidade sem uso |
| **Quanto** | **Só quando não é 1**, em negrito, com o motivo na mesma linha. Nunca "1" em toda linha: número repetido em toda linha treina o olho a pular o número, que é justamente o que ele precisa ver quando aparecer um 2 |
| **Tocar na linha** | Abre a conversa. **É a peça mais importante do extrato inteiro**: contestação se resolve vendo a conversa, não vendo o lançamento |
| **Entradas de crédito** | No dia em que aconteceram, em forma de frase e sem nome de pessoa: "entraram os 200 créditos de agosto", "você comprou mais 100 créditos", "um mês de créditos por indicação". Sem possessivo (`identidade.md`) |
| **Dias sem nada** | Não aparecem. Um dia sem linha é um dia sem trabalho, e uma linha "0 créditos" seria enchimento |

**Acessibilidade.** Cada linha é um link com nome acessível completo ("Márcia Souza, respondeu, 9 de setembro às 8h12, 1 crédito") — o "1" que a tela esconde do olho é dito para quem usa leitor de tela, porque ali não há contagem visual de linhas para substituir. A marca da linha que conta 2 nunca é só cor nem só negrito: tem a palavra.

| Estado | O que aparece |
|---|---|
| Carregando | Esqueleto de 5 linhas, com o cabeçalho do dia já no lugar |
| **Vazio, número recém-conectado** | "Nada aqui ainda. O Otto está de plantão desde as 14h. Cada pessoa que ele responder aparece aqui, com o horário e quanto contou." **Aprovado.** *De plantão* passa; **"o plantão acabou" e "fora do plantão" ficam bloqueados** — o Otto não tem jornada, e a família de palavras que insinua turno contradiz o "atende 24 horas por dia" da própria venda (ADR 004) |
| **Poucas linhas (conta nova)** | A lista, sem nenhum enfeite e sem projeção. Ver 14.4 |
| Normal | Dias, do mais recente para o mais antigo |
| Mês fechado (pelo seletor) | O mesmo, com o total do mês no topo e a data da fatura |
| Erro | **"Não consegui carregar. Tenta de novo."** Botão. **O número de cima continua na tela** — o contador não depende desta lista carregar |
| Uma linha de mês antigo cujo preço mudou desde então | Aparece com o preço daquele dia, sem aviso nenhum. Não é exceção: é a regra 5 |

**O ajuste do guardião, e ele é maior do que parece: a palavra *extrato* não chega à tela.** Meu rascunho de erro dizia "não consegui carregar **o extrato**", e era a única frase deste desenho capaz de pôr a palavra na frente do dono. *Extrato* é palavra de banco — e esta lista passou a decisão inteira de 14.6 se defendendo da leitura bancária **pela forma** (nome de gente, verbo, hora). Um rótulo desfaz num toque o que a forma conquistou em vinte linhas. Consequências, e valem para quem implementar:

1. **A lista não tem título visível.** A tela se chama Créditos; a lista simplesmente segue o número, sem cabeçalho próprio. "Extrato" é o nome que este documento e o código usam para falar dela, nunca o que o dono lê.
2. **Nenhuma mensagem de estado nomeia a lista.** Erro, vazio e carregamento falam do que aconteceu, não da coisa.
3. Registrado também como **regra 10 do ADR 024**, para não voltar por outra porta.

### 14.4 Onde o extrato é inútil — e a inversão que isso revela

A pergunta que me foi feita foi "qual é o estado em que ele é inútil: conta nova, três linhas?". **Respondo que não, e a inversão importa mais que a resposta.**

Com três linhas, o extrato é *redundante* — o dono lembra das três conversas — mas é o **momento em que ele mais vale**, porque é o único em que ele consegue conferir o **todo** e concluir sozinho que o número é honesto. Confiança em número se ganha quando conferir é barato. Se a tela esconder o extrato enquanto ele é pequeno ("ainda não tem nada útil aqui"), a primeira vez que ele o vê é aos 214 lançamentos, desconfiado, e aí ele não está conferindo: está procurando erro.

Daí a regra: **o extrato nunca é suprimido por ser pequeno.** Nem esqueleto vazio simpático, nem "volte quando tiver mais dados".

O estado em que ele é **de fato inútil** é o outro extremo: **o mês com 300 linhas e uma dúvida sobre uma pessoa específica.** Rolar 300 linhas procurando a Márcia é pior que não ter lista nenhuma, porque custa tempo e termina em desistência com a desconfiança intacta. A saída não é filtro nem busca — é a tela **Contato**, que já existe e já é a lista daquela pessoa. O caminho é: ele lembra de uma pessoa → Contatos → a pessoa → as conversas dela. E é por isso que a tela Contato ganha **uma linha só**, em duas formas:

> (caso comum) O Otto respondeu essa pessoa em 6 dias este mês.
>
> (quando algum dia contou 2) O Otto respondeu essa pessoa em 6 dias este mês — 7 créditos, porque um dia passou de 10 respostas.

**Fechada pelo guardião em 2026-09-09, com o eixo aprovado e uma correção que eu não tinha visto.**

- **O eixo é dias, não créditos, e a razão é de produto:** crédito ao lado do nome de uma pessoa ensina o dono a ler cliente como custo, e não é essa a relação que o produto vende. Dias é o que ele confere e não carrega esse peso.
- **A correção:** dias e créditos deixam de bater exatamente no caso que a lista de 14.3 já trata — o dia que contou 2 por passar de 10 respostas. Dizer "6 dias" numa pessoa que consumiu 7 créditos é a divergência inexplicável que a terceira frase da definição existe para matar, reaparecendo no **único lugar em que alguém está conferindo**. Por isso a segunda forma, que só aparece quando há divergência, e traz o motivo colado ao número — mesma disciplina da linha "2, passou de 10 respostas".

| Estado | Por que não é inútil / o que resolve |
|---|---|
| 3 linhas | O momento de maior valor. Não suprimir |
| 40 linhas, mês normal | O caso de projeto |
| 300 linhas, dúvida geral ("por que tanto?") | Funciona: os totais por dia mostram onde o volume está |
| 300 linhas, dúvida sobre **uma pessoa** | **Aqui ele é inútil.** Resolve na tela Contato, sem filtro novo |
| Mês antigo, dúvida sobre a fatura | Funciona pelo seletor de mês, com a regra 5 (nunca recalcula) |

### 14.5 O preço da ação, sempre antes de apertar

Duas superfícies, e só uma existe na v1.

#### A. Escolher a faixa (v1) — o que 500 créditos compram

A tela de escolha de faixa **já existia** no cadastro, e agora ela tem uma obrigação nova que vem do ADR 024: *"o de 500" eram 500 atendimentos; agora são 500 créditos*. Dizer isso na primeira fatura, e não na hora da compra, é o desenho errado.

A linha de preço passa a ser lida pelo cargo (ADR 024, decisão 1):

> **Otto Atendente** — R$ 197/mês, com 200 créditos
> **Otto Atendente** — R$ 447/mês, com 500 créditos
> **Otto Atendente** — R$ 997/mês, com 1.200 créditos
>
> Um crédito é um dia de conversa com uma pessoa. A mesma pessoa amanhã conta outro. E se a conversa passar de 10 respostas do Otto, conta mais um.

**Duas coisas que eu tirei desta tela, e digo por quê:**

- **Tirei o preço por crédito.** Ele apareceria aqui com muita naturalidade (R$ 0,99 × R$ 0,89 × R$ 0,83) e é exatamente a taxa de câmbio que a trava de `identidade.md` fecha. Aqui não há dois caminhos para comparar; há três tamanhos do mesmo caminho, e o preço unitário só ensinaria "1 crédito ≈ R$ 1". O preço por crédito aparece **só** na tela de comparação (13.5.C), aos pares.
- **Tirei a quarta frase da definição.** Na v1 não existe cargo que começa conversa, e carregar a regra dos 3 créditos numa conta que não pode gastá-los é ruído — é a regra condicional de `identidade.md` funcionando.

**A linha condicional, que entra quando existir um cargo que começa conversa** (v1.1, não na v1) — e é ela que cumpre a consequência do ADR 024. **Fechada pelo guardião em 2026-09-09:**

> Você tem o Otto Vendedor ligado. Ir atrás de um cliente que sumiu conta 3 — com 500 créditos, o Otto fala com menos gente do que se só respondesse.

**O ajuste:** meu rascunho dizia "*você* fala com menos gente". Quem fala com o cliente final é o Otto, não o dono — e trocar os dois nesta frase é justamente o tipo de deslize que apaga a linha entre as duas audiências do `CLAUDE.md`.

#### B. Ligar um cargo (v1.1, desenhado agora para não ser improvisado depois)

**Ligar um cargo não é uma chave numa lista.** Uma chave dispara no toque, e a regra 8 do ADR 024 exige que o número tenha sido visto antes. Então: a lista de cargos leva a **uma tela por cargo**, e é nela que a decisão acontece.

> **Otto Vendedor** `[GUARDIÃO — texto já aprovado pelo guardião, não mexer]`
>
> Responder quem escreveu conta 1 crédito. Ir atrás de um cliente que sumiu conta 3 — começar a conversa custa mais que responder.
>
> [Ligar o Otto Vendedor]

Regras da tela:

1. **Ligar passa pela tela; desligar é um toque na lista.** A assimetria é de propósito: a direção cara ganha a leitura, a barata não ganha fricção inventada (regra 12 do agente).
2. **O preço vem em uma frase, com o porquê junto** — nunca uma tabela de tarifas. Tabela de tarifas é o que faz o produto virar operadora de telefonia, e é o risco que o parecer contrário do guardião nomeia no ADR 024.
3. **Nunca em reais** e **nunca nomeando fornecedor** ("a Meta cobra para iniciar" está proibido pelo ADR 005). A explicação verdadeira e permitida é a que já está na frase: começar a conversa custa mais que responder.
4. **Nada de confirmação depois da tela.** A tela *é* a confirmação. Um "tem certeza?" em cima dela seria fricção sem consequência nova.
5. **Depois de ligado, a primeira vez que o cargo gasta 3 vira uma linha do resumo do dia**, na voz do Otto e com o verbo antes do número — **aprovada pelo guardião em 2026-09-09, sem ajuste**: *"Ontem eu fui atrás de 4 clientes que sumiram: 12 créditos."* Não é confirmação, é recibo — e é a segunda vez que ele vê o número, agora com o próprio dinheiro dele em jogo.
6. **A tela de escolher a faixa ganha a linha condicional de A** a partir do momento em que existe um cargo ligado que começa conversa.

### 14.6 O nome da tela: **Créditos**

O guardião registrou "Créditos" como proposta e devolveu a forma para mim (`identidade.md`, "Nome de tela"). **Fico com Créditos**, e o argumento não é gosto:

- **O nome tem que ser a pergunta, não a prova.** A tela responde "quanto falta, e vai dar até o dia 12?". O extrato é a evidência embaixo. "O trabalho do Otto" e "O que o Otto fez" nomeiam a evidência e escondem a pergunta — ficam bonitos e ninguém acha o lugar de conferir a conta.
- **É onde ele vai procurar.** A fatura mora em Configurações (ADR 010). Se o item de menu não falar da moeda, o dono com dúvida de dinheiro não tem para onde ir.
- **A objeção é real e não se resolve no rótulo.** "Créditos" + número grande + lista de lançamentos é a forma de um aplicativo de banco, que é exatamente a leitura que a trava "crédito é trabalho já pago" existe para evitar. Só que a leitura se decide **dentro** da tela, não no menu: um extrato cujas linhas dizem *"Márcia Souza · respondeu · 08h12"* não se parece com extrato bancário nenhum. Nenhum banco lista gente com nome e verbo.

**Duas condições de forma, que vêm junto com o nome e não são negociáveis:**

1. **A navegação nunca mostra número, distintivo ou cor no item Créditos** enquanto a conta estiver abaixo de 80%. Um menu que exibe "Créditos 43/200" ensina o dono a abrir o painel para vigiar consumo — hábito diário errado, num produto cuja promessa é parar de perder cliente. A partir de 80%, quem avisa é o bloco do Início e a mensagem no WhatsApp (13.5), que já existem e são melhores.
2. **Nenhum possessivo em lugar nenhum da tela.** "Seus créditos" é o teste rápido de `identidade.md`: se cabe um "seu" na frente, a frase está errada.

Renomeações que este nome arrasta, todas já aplicadas neste documento: a tela **Atendimentos** vira **Créditos** (13.3, 13.5.A, 13.5.B, §6) e **Comparar: pacote × faixa** vira **Comparar os dois caminhos** (§6), porque "pacote" nunca nomeia a coisa que ele está comprando.

### 14.7 O que fica fora da v1

| Fora | Por quê | O que faria entrar |
|---|---|---|
| **Busca ou filtro dentro do extrato** | O caso que pede filtro é "essa pessoa aqui", e ele já tem caminho: a tela Contato. Filtro é superfície nova para um problema resolvido | Contestação em que o dono não achou a linha pela tela Contato |
| **Exportar o extrato** (CSV, PDF) | Ninguém deste nicho exporta no celular, e o que o contador pede é a fatura, que o Asaas já emite | 3 contas pedirem (`suporte.pedido_registrado`) |
| **Gráfico de consumo por dia** | Regra 7 do agente. E o total por dia já está no cabeçalho de cada dia, que é o mesmo dado sem a camada de leitura | Nada previsto |
| **Lista de tarifas ("quanto custa cada ação")** | Proibida pelo ADR 024, regra 5. O preço mora na frase da ação, no momento de ligar | Nada. Rejeitada, não adiada |
| **Contestar uma linha pelo painel** ("isso está errado") | É formulário de disputa antes de existir disputa. O caminho hoje é o suporte na própria plataforma (ADR 014), e o extrato serve para a conversa acontecer com a linha na frente dos dois | 2 contas contestarem fatura — que é o gatilho do próprio ADR 024 |
| **Mostrar o custo em reais de cada linha** | Trava de `identidade.md`. E converteria o extrato num extrato bancário de verdade | Nada. Rejeitada |

### 14.8 O que sobrou de "atendimento" neste documento, de propósito

A passada do ADR 024 aposentou o **substantivo** em texto público. Três usos ficaram, e ficaram por razões diferentes — quem for revisar não deve "consertar" nenhum dos três sem antes ler isto:

| O que ficou | Onde | Por quê |
|---|---|---|
| **O verbo *atender*** | Em toda parte: "o Otto atende", "o Otto atendeu 12 pessoas hoje", "Só você atende" | Nunca saiu. `identidade.md` mantém explicitamente |
| **O cargo *Otto Atendente*** | Linha de preço, tela de faixa, cargos | É nome de cargo, não unidade |
| **"contato fora do atendimento", "horário de atendimento"** | Seções 4 e 5, nomes de evento e de campo (`atendimento_do_contato`, `contato_fora_do_atendimento`) | **Não são a unidade de cobrança**, e nenhum deles aparece em tela: o rótulo é "Só você atende". Os nomes de evento e campo são código, e código está fora do vocabulário por decisão do `CLAUDE.md`. **"Horário de atendimento" é o único que pede parecer** (14.9), porque é a única das três que uma pessoa lê numa tela de configuração |

### 14.9 Parecer do guardião da marca — fechado em 2026-09-09

**Nenhum bloqueio nos oito itens.** Três viraram ajuste de desenho, não de palavra, e estão aplicados no lugar; um deles corrigiu um erro meu que nenhuma revisão de texto pegaria (o item 4). Um item volta com dever de casa que não é do guardião.

| # | O quê | Veredito | Onde |
|---|---|---|---|
| 1 | A mensagem de 80% no WhatsApp, e o buraco da regra 11 com um cargo só | **Ajustado — inversão, não substituição.** "Este mês, atendendo cliente, eu já usei 160 dos 200 créditos": com "usei" abrindo, a contagem entrava na frente do trabalho. `identidade.md` ganhou as duas formas e as três falsas | 13.5.D |
| 2 | A frase da diferença entre conversa e crédito, no Início | **Aprovada com ajuste de número:** "Aqui **contam créditos**" | 13.3 |
| 3 | Os textos da lista: vazio, entradas de crédito, cabeçalho de dia, "2, passou de 10 respostas" | **Aprovados.** Dois ajustes: **"extrato" não chega à tela** (vira regra 10 do ADR 024) e a fronteira do *plantão* — "de plantão" passa, "o plantão acabou" e "fora do plantão" ficam bloqueados | 14.3 |
| 4 | A linha da tela Contato | **Eixo aprovado (dias), com uma segunda forma que eu não tinha visto:** dias e créditos divergem no dia que contou 2, no único lugar em que alguém está conferindo | 14.4 |
| 5 | A linha condicional da tela de faixa | **Aprovada com ajuste de sujeito:** quem fala com o cliente é o Otto, não o dono | 14.5.A |
| 6 | A linha de recibo do resumo do dia | **Aprovada** | 14.5.B |
| 7 | **"Horário de atendimento"** | **Aprovado, com o argumento melhor que o meu:** o que se aposentou foi a **unidade de cobrança**, não a palavra portuguesa — e "horário de atendimento" é o que está escrito na porta da loja dele. Continua proibida a família que puxa para ticket (fila de atendimento, abrir/encerrar atendimento, TMA, protocolo) | 14.8 |
| 8 | A pergunta de qualidade do resumo do dia | **Aprovada como texto**, com um aviso que é do analista de produto e não do guardião. Ver abaixo | 12.6 |
| Extra | O desligar nas mensagens do WhatsApp do dono | **Regra decidida por ele:** o de 80% carrega; o de 100% é exceção declarada em `voz-e-tom.md` §1.1 | 13.5.D |
| Extra | O nome público da preparação | **Fica "preparação"**, aguardando o Felipe. As minhas duas propostas caíram — uma delas por um motivo que ninguém tinha visto. Ver 15.8 | 15 |

**O item 8 não está fechado, e o que falta não é palavra.** "Alguém reclamou hoje?" é mais curta e não perde marca, mas **alarga o que se mede**: a versão antiga perguntava do atendimento; a nova pega reclamação de qualquer coisa, inclusive do produto que a loja vende. Isso pode ser exatamente o que se quer — ou pode arruinar a leitura, e quem decide é o analista de produto, dono de `dados.md`.

**O que já está descartado, e é importante que esteja escrito:** se o recorte importar, a saída **não** é *"alguém reclamou do Otto hoje?"*. Essa pergunta convida o dono a culpar o funcionário, e o dado que ela produz vem envenenado — é a mesma armadilha de atribuição que a skill `behavioral-evidence` §1 descreve: a pessoa produz uma razão plausível no momento em que se pergunta, e a razão sugerida pela pergunta é a que ela usa. **Alinhar com o analista antes de fechar.**

### 14.10 Fichas comportamentais

| # | Afirmação | Onde sustenta | Tipo | Evidência hoje | Comparável | Taxa mínima | Como se mede | O que a mata | Grau |
|---|---|---|---|---|---|---|---|---|---|
| 14.1 | O dono abre o extrato ao menos uma vez nos primeiros 30 dias | O extrato existir, e a regra de não suprimi-lo quando é pequeno (14.4) | Taxa | Nenhuma | Sem análogo aberto nesta sessão; **não inventar magnitude**. Direção robusta: rolagem na mesma tela supera item de menu separado | 5 das 10 primeiras contas rolam até o extrato em 30 dias | `resumo.aberto` não serve; pede um campo — ver 14.11 | Menos de 2 em 10 → o extrato não está sendo lido antes da dúvida, e a defesa contra contestação depende de ele ser achado **no momento da dúvida**, que é pior mas ainda funciona. Não o move de lugar antes de olhar a 14.2 | NÃO VERIFICADO |
| 14.2 | Quem contesta a fatura acha a linha que procurava | A razão de o extrato existir (regra 10 do ADR 024) | Capacidade | Nenhuma | Não se aplica | 3 de 3 casos de contestação resolvidos com a linha na frente | Ler à mão os primeiros pedidos de `suporte.pedido_registrado.categoria = saldo` e registrar se a linha foi achada | Um caso em que a linha existe e o dono não a achou → falta o corte por pessoa, e a tela Contato (14.4) não está resolvendo | NÃO VERIFICADO |
| 14.3 | O dono entende a linha "2, passou de 10 respostas" sem perguntar | A terceira frase da definição, e a regra 3 de 14.2 | Capacidade. **Do tipo mais barato de testar** | Nenhuma | Não se aplica | 4 de 5 donos leem um extrato em papel com uma linha de 2 e explicam por que aquela conta dobro | Sessão de 10 minutos, com a tela em papel, junto com a ficha 13.7 | Alguém achar que a linha é duplicada, ou que o Otto cobrou duas vezes → a forma está errada, e a alternativa desenhada (duas linhas irmãs, indentadas) volta à mesa | NÃO VERIFICADO |
| 14.4 | Ver o preço da ação antes de ligar o cargo evita a reclamação depois | A regra 8 do ADR 024 virando tela (14.5.B) | **Ausência.** Quem não reclama não avisa que não reclamou | Nenhuma. **Canal passivo não mede** | Não se aplica | Incidência zero é o alvo | `suporte.pedido_registrado` com categoria nova `preco_de_acao_inesperado`, sobre contas com cargo ligado. **Não é medível na v1** (não há cargo) | Uma conta reclamar do preço de uma ação depois de ligar → a frase não foi lida, e o problema é de posição, não de texto | NÃO VERIFICADO |
| 14.5 | O dono lê "500 créditos" como "500 conversas" e se surpreende quando não é | A obrigação de dizer isso na tela de faixa (14.5.A) | Capacidade | Nenhuma | Não se aplica. **Na v1 os dois são iguais por construção** (só o Atendente), então a hipótese só é testável quando existir o segundo cargo | Não é taxa. É um caso: nenhum dono descobre a diferença pela fatura | Primeira fatura depois de ligar um cargo que começa conversa: `suporte.pedido_registrado` no ciclo seguinte | Uma conta descobrir pela fatura → a linha condicional não está no lugar certo, ou não está aparecendo ao ligar o cargo | NÃO VERIFICADO |

**Uma observação de método, e vale para as cinco.** As fichas 14.4 e 14.5 sustentam desenho de **v1.1** e estão em grau `NÃO VERIFICADO`. Isso é aceitável aqui e não fere a regra de bloqueio da skill por um motivo específico: elas não autorizam construir nada agora. O que elas fazem é registrar a forma antes de o cargo existir, para que a decisão não seja improvisada no dia. **Nada em 14.5.B entra em backlog de v1.**

### 14.11 Eventos — proposta ao analista de produto

**Zero eventos novos. O teto de 20 de `dados.md` continua intacto.** O extrato não é um evento: é a leitura de `movimentos_de_saldo`, que já é o ledger e já é fonte da verdade do saldo (evento 9, `saldo.movimentado`). O que ele pede são campos — e um deles o ADR 024 já exige.

| Evento | Campo | Para quê |
|---|---|---|
| `saldo.movimentado` (9) | **`acao enum(responder, resposta_extra_da_conversa_longa, lembrar_horario, avisar_conta_em_aberto, ir_atras_de_cliente)`** e **`preco_aplicado int`** e **`versao_da_tabela_de_precos text`** | **Exigido pelo ADR 024** ("sem isso, uma fatura contestada seis meses depois não se reconstrói"). E é o que dá o verbo de cada linha do extrato. `tipo` continua dizendo débito × crédito; `acao` diz o que foi feito |
| `saldo.movimentado` (9) | `conversa_id` **já existe**; acrescentar **`cliente_hash text?`** | O extrato mostra quem foi. O nome de exibição vem da tabela de contatos, não do evento — o evento carrega o hash, pela regra de `dados.md`. Nulo nas linhas de entrada de crédito |
| `saldo.movimentado` (9) | **`data_local date`** | O agrupamento é por dia **no fuso da empresa**. Sem isso, uma conversa das 22h aparece no dia seguinte para metade das contas, e o dono confere contra a memória errada. É a diferença entre o extrato bater e não bater |
| `resumo.aberto` (14) | `acao_seguinte` ganha **`abriu_o_extrato`** | Ficha 14.1. Não há outro jeito de saber se o extrato é lido antes da dúvida |
| `suporte.pedido_registrado` (19) | `categoria` ganha **`preco_de_acao_inesperado`** | Ficha 14.4. Categoria reservada desde já, dispara só quando existir segundo cargo — mesmo padrão do gatilho 001 de `dados.md` |

**Uma pergunta para o analista, e ela é de dado, não de tela:** o extrato precisa que **débito e conversa sejam ligáveis nos dois sentidos** (da linha para a conversa, e da conversa para as linhas que ela gerou). O `conversa_id` em `saldo.movimentado` resolve o primeiro sentido. O segundo — "quantos créditos essa conversa gastou" — é o que a tela Contato usa em 14.4, e é uma leitura, não um campo. Confirmar que a leitura fecha sem índice novo.

---

## 15. A preparação, na jornada

De 2026-09-09 (tarde), a partir do **ADR 025**, que está aceito. **Nada aqui é decisão minha:** o valor (R$ 997), a isenção dos 10 primeiros, o que a preparação entrega, a regra de reembolso e o prazo já estão decididos. O nome público está aberto e é do guardião ("setup" não entra; "preparação" é o candidato de trabalho). O que é meu é **onde ela cabe sem quebrar as duas promessas que ela pode quebrar.**

### 15.1 As duas promessas em risco

**A primeira é o mesmo dia.** O ADR 025 diz, com todas as letras, que o Otto entra em operação no mesmo dia e que essa é a diferença inteira contra o grupo que cobra implantação e demora 45 dias (`pesquisa-2026-09.md`). Se a preparação virar pré-requisito de o Otto atender, o "mesmo dia" passa a depender da nossa agenda — e no dia em que duas contas fecharem na mesma tarde, viramos o grupo dos 45 dias com um número menor. **Não existe desenho de tela que conserte isso depois.**

**A segunda é a ativação do ADR 022.** O ADR 022 decidiu que a empresa ensina o Otto **conferindo**, e a hipótese de que o dono confere sozinho é, nas palavras do próprio ADR, a mais frágil do projeto. Se nas 10 preparações isentas a nossa pessoa configurar tudo, nós nunca vamos saber se o caminho self-service funciona — e o 11º cliente, que paga, recebe um produto cujo caminho principal nunca foi exercitado. Ver 15.5, que é onde isso vira regra.

### 15.2 Onde a preparação entra

**A preparação acontece ao lado do onboarding, nunca antes dele.** O Otto entra em operação no fim do cadastro, como o ADR 022 já mandava; a conversa com a gente melhora o que já está rodando.

| Momento | O que acontece | Quem faz | Ponto de desistência |
|---|---|---|---|
| 1. Viu o anúncio | Página de venda com **os dois valores na frente**: R$ 997 uma vez e R$ 197/mês. Nunca só a mensalidade, nunca "fale com um consultor" (ADR 025: preço escondido até a ligação é o roteiro da categoria) | Site | **Aqui, e é o caro.** O valor de entrada é R$ 1.194. Gatilho do ADR 025: 3 donos seguidos recusarem citando esse número |
| 2. Cadastro | Descreve o negócio em uma frase, escolhe estilo, cargo exibido e avatar (já existe) | Dono, sozinho | Baixo |
| 3. Pagamento | Duas cobranças, duas linhas, **nunca somadas numa parcela** (ADR 025). Nos 10 primeiros, a linha da preparação aparece e não cobra — ver 15.4 | Dono | Médio |
| 4. **O Otto entra em operação** | Conecta o número, confere as respostas do nicho com um toque cada (12.5.A), começa a atender | Dono, sozinho | O do ADR 022, que já está medido |
| 5. **Marcar a conversa** | Um bloco no Início oferece **horários de hoje**. Cai para amanhã só quando não houver hoje | Dono, um toque | **O ponto novo, e o que eu mais quero medir.** Ver 15.3 |
| 6. A conversa | 30 a 60 minutos, por voz ou WhatsApp, no celular. **Não é reunião com link de vídeo, pauta e apresentação** — o ADR 025 diz "é uma conversa, não um projeto", e o formato tem que dizer o mesmo | Nós, com o dono | Ele desmarcar. Aceitável: o Otto já está atendendo |
| 7. Primeira semana | Uma passada no que faltou, com as respostas novas entrando no que o Otto sabe | Nós, com o dono | — |
| 8. Fim | O bloco some. O dono fica com o resumo do dia, a fila e o extrato | — | — |

**O que isso arruma de graça:** o dono paga no dia 1 e vê o Otto trabalhando no dia 1. O intervalo entre pagar e ver valor — que é onde a categoria dos 45 dias perde cliente — some, e a preparação deixa de ser uma dívida nossa com ele para ser um extra que chega depois de o produto já estar de pé.

### 15.3 O bloco da preparação (Início)

**Não é tela.** É um bloco temporário no topo do Início, acima da linha da fila, que some depois do passo 7. Justificativa: é uma coisa de uma ou duas semanas na vida da conta, e tela nova para isso é item de menu morto pelo resto da assinatura.

**Os textos deste bloco ainda não passaram pelo guardião** — não estavam nos oito itens de 14.9. O que já está decidido é **o nome**: a coisa se chama **preparação** (15.8), então o bloco a nomeia assim e usa "conversa" para o encontro, nunca como nome do que foi comprado.

| Estado | O que aparece |
|---|---|
| Pago, sem conversa marcada, **com horário hoje** | `[GUARDIÃO]` "Falta marcar a preparação: uma conversa sobre o seu negócio. Hoje tem 14h, 16h30 e 18h." [três botões de horário] |
| Pago, sem conversa marcada, **sem horário hoje** | `[GUARDIÃO]` "Falta marcar a preparação: uma conversa sobre o seu negócio. O mais cedo é amanhã às 9h." [Marcar] · **Nunca escondemos que não é hoje** |
| Marcada | `[GUARDIÃO]` "A preparação é hoje às 16h. O Otto já está atendendo — a conversa é para ele acertar mais." [Remarcar] |
| Feita, primeira semana correndo | `[GUARDIÃO]` "Conversamos terça. Na sexta eu volto para ver o que faltou." Sem botão |
| Isenta (10 primeiros) | O mesmo bloco, mais a linha de 15.4 |
| Ele desmarcou duas vezes | O bloco continua, sem cobrança e sem tom de cobrança. Ninguém é lembrado de um compromisso que não quis marcar |

**O que eu tirei:** barra de progresso de onboarding, lista de pendências com visto verde, e qualquer forma de "sua conta está 60% configurada". O ADR 022 já rejeitou barra de progresso de base pelo mesmo motivo: mede tamanho, incentiva despejo, e transforma um produto que já está funcionando num produto que parece incompleto.

### 15.4 Quem não paga

Os 10 primeiros não pagam a preparação (ADR 025). Duas coisas precisam ser verdade ao mesmo tempo: ele tem que saber que não está pagando, **e** não pode concluir que a coisa vale zero.

Rascunho: `[GUARDIÃO]`

> Preparação — R$ 997 · **por nossa conta nesta primeira turma**
> Hoje você paga R$ 197.

Regras de forma:

1. **O valor aparece.** Some o preço e some a informação de que aquilo é um trabalho de gente.
2. **Nada de preço riscado com contagem regressiva.** "R$ ~~997~~ GRÁTIS — só hoje!" é a anti-persona do vendedor de infomercial (`persona-otto.md`), e é a mesma regra que proíbe "última chance" na tela de comparação (13.5.C, regra 5).
3. **Nada de "você economizou R$ 997".** É a frase do cupom, e ela transforma um gesto em desconto.
4. **Escassez só se for verdade e sem cronômetro.** "Nesta primeira turma" é fato — são 10 — e não vira contagem regressiva na tela.

### 15.5 O risco que a preparação cria, e a regra que o contém

**É o achado desta seção, e não é sobre tela.**

As 10 preparações isentas existem para medir a hora (ADR 025: "medir e registrar as horas de cada uma das 10"). Mas elas medem outra coisa também, sem querer: **elas são as 10 únicas contas em que a hipótese central do ADR 022 poderia ser observada, e a preparação é exatamente o que pode apagá-la.** Se a nossa pessoa segura o celular e confirma as respostas, `base.atualizada.origem = onboarding` sobe para 100% em todas as 10, a ficha 12.1 dá "6 de 10 conferem" com um número que não é do dono, e nós concluímos que o self-service funciona sem que ninguém tenha feito self-service.

O conserto é barato e é regra de operação, não de produto:

1. **Nas 10 preparações, quem toca na tela é o dono.** A nossa pessoa fala, pergunta e explica; não pega o aparelho. É o que uma sessão de usabilidade faria de qualquer jeito, e vale mais que a hora economizada.
2. **A ordem é: ele tenta, depois a gente ajuda.** Cada passo do "confere se acertei" começa com ele. Onde ele travar, o travamento é o dado.
3. **Registrar onde ele travou**, junto com as horas. É a coisa mais valiosa que sai das 10 preparações e não custa nada além de anotar.
4. **A conta com preparação fica marcada**, para nenhuma métrica de ativação misturar as duas populações. Ver 15.7.

Sem isso, os R$ 997 compram a hora e pagam com a única evidência que o projeto ainda não tem.

### 15.6 Fichas comportamentais

| # | Afirmação | Onde sustenta | Tipo | Evidência hoje | Comparável | Taxa mínima | Como se mede | O que a mata | Grau |
|---|---|---|---|---|---|---|---|---|---|
| 15.1 | O dono marca a conversa no mesmo dia quando o horário oferecido é hoje | O bloco de 15.3 oferecer horários de hoje em vez de um calendário | Taxa | Nenhuma | Direção robusta (§4, custo de decisão): três horários concretos superam um calendário aberto. **Magnitude local, não inventar** | 6 das 10 primeiras contas marcam no mesmo dia do pagamento | Registro das 10 preparações: data do pagamento × data da conversa marcada | Menos de 3 em 10 marcarem no mesmo dia → o gargalo não é a tela, é a nossa disponibilidade, e o desenho não conserta isso | NÃO VERIFICADO |
| 15.2 | O Otto entrar em operação antes da conversa **não** faz o dono achar a preparação inútil | A decisão de a preparação vir depois, e não antes (15.2) | Preferência. **É a hipótese que o desenho todo assume** | Nenhuma | Não se aplica | Nenhum dos 10 dizer que a conversa não era necessária | Pergunta nas 10 preparações, feita **depois** da conversa, sobre o episódio: "o que a gente resolveu aqui que você não tinha resolvido sozinho?" | 3 dos 10 não conseguirem citar nada concreto → **a preparação está pagando por um trabalho que o produto já fez sozinho**, e o preço volta à mesa antes do 11º cliente, junto com a medição de horas | NÃO VERIFICADO |
| 15.3 | O dono paga R$ 1.194 na entrada | O ADR 025 inteiro | Preferência | Nenhuma. **Ficha já aberta no ADR 025**; não duplico o limiar | Não se aplica | O do ADR 025 | O do ADR 025 | O gatilho do ADR 025: 3 donos seguidos recusarem citando o valor de entrada | NÃO VERIFICADO |
| 15.4 | A preparação **não** apaga a evidência da ativação self-service | As quatro regras de 15.5 | **Ausência.** O dano é invisível: as métricas ficam ótimas e vazias | Nenhuma | Não se aplica | Não é taxa. É procedimento: nas 10, quem toca na tela é o dono | Marca `com_preparacao` na conta (15.7), e as métricas de ativação lidas **separadas** | A primeira conta em que a nossa pessoa configurar no lugar do dono e ninguém registrar isso. **É o tipo de coisa que só se pega combinando antes** | NÃO VERIFICADO |

### 15.7 Eventos — proposta ao analista de produto

O ADR 025 já pede evento de preparação com as horas. **A minha parte é só isto, e é uma marca, não um evento:**

| Evento | Campo | Para quê |
|---|---|---|
| `conta.ativada` (3) | **`com_preparacao bool`** e **`preparacao_isenta bool`** | Sem isso, as 10 contas com uma pessoa nossa ao lado entram na mesma média das que se viraram sozinhas, e **todas as fichas de ativação do ADR 022 passam a medir a nossa mão** (15.5). É a marca mais barata do plano de dados e a que evita o erro mais caro |
| `base.atualizada` (13) | `origem` ganha **`preparacao`** | Distingue o que o dono confirmou no fluxo normal do que foi conferido junto com a gente. Ficha 12.1 depende disso para continuar significando alguma coisa |

O evento de preparação em si (agendada, feita, isenta, com as horas) é do ADR 025 e do analista. Eu só peço que **a hora medida e o ponto em que o dono travou** fiquem no mesmo registro: os dois são a mesma sessão e separá-los perde a relação entre eles.

### 15.8 O que devolvo ao Felipe

1. ~~**O nome público.**~~ **Fechado pelo guardião em 2026-09-09: fica "preparação", aguardando você.** As minhas duas propostas caíram, e uma delas por um motivo que eu não tinha visto e que vale registrar: **em cobrança, "entrada" é a primeira parcela.** Um valor pago uma vez antes das mensalidades, chamado "de entrada", é lido como sinal — como se os R$ 997 fossem adiantamento das mensalidades, que é o oposto do que o ADR 025 decidiu. "A nossa conversa" caiu por não nomear o que se compra. A objeção original a "preparação" (insinua que existe Otto despreparado) continua registrada no ADR 025, e é sua a decisão.
2. **A preparação continua obrigatória depois dos 10 primeiros?** O ADR 025 deixou aberto. O desenho de 15.2 funciona nos dois casos — se ela virar opcional, o bloco de 15.3 simplesmente não aparece —, e por isso eu não preciso da resposta para especificar. Mas ela muda a tela de venda, que não é minha.
3. **A regra de 15.5** (nas 10, quem toca na tela é o dono) é decisão de operação, não de produto. Se ela não for aceita, as fichas de ativação do ADR 022 precisam ser relidas como "com ajuda", e a hipótese mais frágil do projeto continua sem evidência.
