# Bases do nicho

Dono: **treinador-do-otto**. Consumido pelo especialista-backend (montagem da proposta e renderização), lido pelo especialista-ui-ux (as 10 telas de `experiencia.md` §12.5.A), e todo texto que uma pessoa lê é fechado pelo **guardião da marca**.

Isto é a peça que faz o ADR 022 funcionar. Sem ela, a tela "confere se acertei" degrada para *"me conta uma pergunta que seus clientes fazem"* — que é o campo em branco que a decisão inteira existe para evitar.

**O que é:** para cada nicho, as perguntas que todo cliente daquele tipo de negócio faz, com a resposta **já redigida** e os números **em branco**. O dono preenche um número ou toca "tá certo".

**O que não é:** não é base de cliente, não é conteúdo copiado de conta nenhuma (ADR 022 rejeita isso, duas vezes, por operação e por vazamento), e não contém um único número inventado.

---

## 1. Onde isto mora, e por que aqui

`packages/bases-de-nicho/` — pacote do monorepo (CLAUDE.md, ADR 009), não `docs/`.

Motivo: isto é **dado que o código carrega**, não prosa. Três consumidores em dois apps (`apps/api` monta a proposta e renderiza; `apps/web` desenha as telas; a suíte de avaliação gera casos a partir do mesmo arquivo). Em `docs/` ele seria copiado à mão para dentro do código e as duas cópias divergiriam na primeira correção.

```
packages/bases-de-nicho/
  README.md                        ← este arquivo: o contrato
  MEDICAO.md                       ← quanto cada base ocupa, com o método
  lint.py                          ← as 9 regras que reprovam um arquivo no CI
                                     (+ 2 escritas e não ligadas, §11.1 e §11.2)
  medir.py                         ← renderiza e mede; escreve _teste/render/
  _comum/
    todo-negocio.yml               ← 5 itens que todo negócio tem
    hora-marcada.yml               ← 4 itens de quem trabalha com agenda
  _teste/
    valores.yml                    ← valores de fixture, deliberadamente falsos
    render/                        ← a base renderizada, para `count_tokens`
  assistencia-tecnica-celular.yml
  clinica-odontologica.yml
  autoescola.yml
  loja-artigos-religiosos-afro.yml
  clinica-de-estetica.yml
  lash-designer.yml
  salao-e-cabeleireiro.yml
  barbearia.yml
```

**Formato: YAML, um arquivo por nicho.** Não JSON (o guardião da marca precisa ler e revisar o texto em diff, e JSON esconde texto atrás de escape), não Markdown (as lacunas são estrutura aninhada, e tabela de Markdown não aguenta), não banco (isto é conteúdo versionado da operação, revisado em PR como código; base do nicho que só existe em produção não tem revisão nem histórico).

**O esquema é validado por zod** (`packages/shared`), escrito pelo especialista-backend a partir da seção 3. Arquivo que não valida reprova o build — é a mesma disciplina do teste de manifesto do ADR 019.

---

## 2. Uma voz neutra, não quatro

**Decisão: cada item é escrito uma vez, em voz neutra. Não existe versão por preset.**

Três razões, em ordem de peso:

1. **Já está decidido, em `conversa.md` §2.3:** *"O texto do item não passa pelo estilo. Ele é guardado como o dono escreveu; quem veste o uniforme é o bloco 2, na hora de responder."* Uma base do nicho escrita em quatro presets seria a única parte da base que carrega estilo, e o dono que trocasse de preset no painel teria a metade da base falando com a voz errada. O ADR 002 exige que trocar de preset seja um clique.
2. **Custo de manutenção.** 8 nichos × 4 presets = 32 arquivos. Corrigir a forma de escrever preço (a correção mais provável, ver §7) tocaria 32 lugares; hoje toca 8.
3. **A parte que é mesmo por preset já tem dono e já está escrita.** Saudação, "não sei", encaminhamento e resposta sobre si estão em `estilos-de-atendimento.md`, fechados pelo guardião. Nada aqui os duplica.

**Voz neutra quer dizer o quê, exatamente:** o item é um fato do negócio dito na forma mais curta que uma pessoa diria. Sem saudação, sem "olá", sem emoji, sem tratamento (nem "você" nem "senhor"), sem promessa, sem adjetivo. Frase afirmativa, até 200 caracteres (`conversa.md` §2.3).

> ✅ `Troca de tela de iPhone: a partir de R$ {preco}, com {garantia_dias} dias de garantia.`
> ❌ `Olá! A troca de tela do seu iPhone sai por apenas R$ {preco} 🙂`

**`[GUARDIÃO]` — o que precisa do parecer dele, e é o ponto delicado:** o campo `texto` é lido por duas pessoas diferentes. O **empregador** o lê na tela do onboarding, dentro da moldura *"Eu respondo: …"* (§12.5.A) — é o Otto falando com ele, primeira pessoa, `voz-e-tom.md` §1.1. O **cliente final** lê o mesmo fato depois, vestido pelo preset. A moldura é da tela e é do UI/UX; o fato é meu. O que peço ao guardião: (a) que a voz neutra acima seja aceita como registro, (b) o campo `pergunta` de cada item, que aparece literal na tela como *"Um cliente pergunta: …"* e por isso tem que soar como cliente escrevendo no WhatsApp, não como FAQ de site, e (c) o vocabulário de dois nichos onde errar a palavra é ofensa e não deslize: `loja-artigos-religiosos-afro.yml` (seção própria no arquivo) e `clinica-odontologica.yml`.

---

## 3. O esquema

Um arquivo tem cabeçalho e uma lista de `itens`.

### 3.1 Cabeçalho

| Campo | Conteúdo |
|---|---|
| `nicho` | Chave estável, igual ao nome do arquivo |
| `segmento` | Valor de `conta.criada.segmento_classificado` (`dados.md`, evento 1) que aponta para esta base |
| `nome_para_operacao` | Como a operação chama este nicho. Nunca aparece em tela |
| `inclui` | Lista de arquivos de `_comum/` que entram junto |
| `inclui_condicional` | Arquivo de `_comum/` que só entra se um item do nicho for respondido de um jeito. Existe por causa da barbearia: `_comum/hora-marcada.yml` inteiro (sinal, remarcação, atraso) só faz sentido para quem marca horário, e num negócio de ordem de chegada ele viraria quatro respostas erradas em vez de quatro respostas |
| `assuntos` | Os rótulos de `assunto` deste segmento. **É a lista de `assuntos` de `dados.md`** — a mesma chave de `resposta.enviada.assunto`, para "em que assunto o Otto erra" e "que item respondeu" serem a mesma pergunta |
| `observacoes_de_risco` | O que quem escreve texto para este nicho precisa saber. Lido pelo guardião |

### 3.2 Item

Três tipos, e só três. Mais que isso vira julgamento na hora de renderizar.

| Campo | Vale para | Conteúdo |
|---|---|---|
| `chave` | todos | `snake_case`, estável para sempre. É a identidade do item entre versões da base e a chave dos casos de avaliação |
| `tipo` | todos | `fato` · `escolha` · `lista` |
| `assunto` | todos | Um dos `assuntos` do cabeçalho |
| `prioridade` | todos | `1`, `2` ou `3`. Ver §4 |
| `ordem` | todos | Desempate dentro da prioridade |
| `pergunta` | todos | A pergunta do cliente, **escrita como cliente escreve no WhatsApp**. Aparece na tela do onboarding e é a entrada do caso de avaliação. **Nunca entra no `<base>`** |
| `texto` | `fato` | O fato, com as lacunas em `{chave_da_lacuna}` |
| `opcoes.sim` / `opcoes.nao` | `escolha` | Os dois textos. Um toque no onboarding e no bloco do resumo (§12.5.E) |
| `cabecalho` / `linhas_sugeridas` / `lacuna_por_linha` / `minimo_de_linhas` | `lista` | Ver §3.4 |
| `lacunas` | `fato`, `lista` | Mapa `nome → {tipo, obrigatoria, preenchivel_por}` |
| `volatilidade` | todos | `estavel` · `muda_as_vezes` (`conversa.md` §5.2). `muda_sempre` não existe aqui: vira porta, nunca item |
| `negativa` | opcional, `fato` | O texto que vale quando o dono recusa a proposta. Ver §5 e **§5.2** |
| `negativa_fecha` | obrigatório onde houver `negativa` **ou** `opcoes.nao` | `fronteira` · `encaminha` · `basta`. O que a resposta faz depois do texto negativo. **§5.2** |
| `encaminha_sempre` | opcional | `true` quando a pergunta não é do cargo: conselho de saúde, conselho espiritual, diagnóstico. Ver o aviso logo abaixo |

**`encaminha_sempre` é metadado, e o item não tem `texto` nenhum.** Ele é lido pelo código — o roteador encaminha essa classe de pergunta antes de montar resposta — e o `texto` do item continua sendo **só um fato**, sem uma palavra dirigida ao Otto. A tentação de escrever *"o Otto não orienta sobre sintoma: passa para a equipe"* dentro do item é exatamente a violação que `conversa.md` §1.1 proíbe: o canal *fato* não carrega ordem, e uma ordem escrita ali seria eu fazendo, na nossa própria base, o que a §4.4 recusa a um documento do empregador. O comportamento vem do bloco 1 (regra 3 do caráter) e do classificador (`intencao = assunto_sensivel`), nunca do bloco 3.

### 3.3 Lacuna

| Campo | Conteúdo |
|---|---|
| `tipo` | `dinheiro` · `dias` · `horas` · `minutos` · `meses` · `sessoes` · `percentual` · `texto_curto`. Decide o teclado do celular e o formato de exibição |
| `obrigatoria` | `true`: sem ela o item **não é renderizado**. `false`: sem ela a frase que a contém é omitida e o resto do item vale |
| `preenchivel_por` | Lista de fontes da camada 0 que podem preencher sem perguntar: `perfil_whatsapp` · `catalogo` · `descricao_do_negocio` · `google`. Vazio = **só o dono sabe** |

**A distinção que o pedido do Felipe cobra — o que o Otto preenche sozinho × o que só o dono sabe — está aqui, e é `preenchivel_por` vazio.** Ela não é decorativa: é o que ordena as telas (§4), porque só o dono sabe é exatamente o que a tela precisa perguntar.

**Regra dura, e é a que faz a §5 funcionar:** `preco`, `prazo` e `garantia` têm `preenchivel_por: []` em todo nicho, com uma exceção só (`catalogo`, quando a empresa tem catálogo da Meta com preço — e aí o número foi a empresa que escreveu). Nenhuma outra fonte propõe preço.

### 3.4 `lista`

Existe pela razão de `conversa.md` §2.3: para o Otto poder dizer *"esse aparelho eu não tenho aqui"*, ele precisa ver a tabela inteira. Fatiar tabela em itens soltos transforma a regra 1 do caráter em sorteio.

- `linhas_sugeridas` são **rótulos sem número** (nomes de aparelho, de serviço, de categoria). O dono apaga o que não faz e acrescenta o que falta.
- A lista só é renderizada com pelo menos `minimo_de_linhas` linhas preenchidas. Abaixo disso ela é `rascunho` e não existe para o modelo.
- Linha sem valor não é renderizada. Nunca aparece `iPhone 13 tela ___`.
- A lista renderizada carrega o marcador `completa` ou `parcial`, decidido pelo dono num toque ao fechar a lista (*"é isso mesmo, ou falta aparelho?"*). `parcial` faz o Otto tratar ausência como "não tenho", e não como "não fazemos". É marcador, não frase: regra local numa linha é obedecida; regra por referência cruzada some no meio de 40 itens.

---

## 4. Como uma base do nicho vira as telas do onboarding

> **Nota de 2026-09-09, depois desta seção escrita.** O desenho do passo mudou em `experiencia.md` §12.13: não são mais 10 telas de uma pergunta cada, são **duas rodadas com teto de 8 telas** — rodada 1 é uma tela em lote com 5 a 8 itens `escolha`, rodada 2 são 3 a 6 telas de `fato` com lacuna `preenchivel_por: []`. **A regra de ordenação de §4.2 continua valendo, aplicada à rodada 2**, restrita ao conjunto que a rodada 1 habilitou. O critério de §4.1 (ordena por quanto custa o Otto não saber aquilo) não muda; o que muda é que os `escolha` deixaram de disputar vaga com os `fato`, porque ganharam uma tela própria. Consequência para o conteúdo dos arquivos em §11.1.

A tela mostra **uma pergunta por vez** e o dono pode sair no meio (§12.5.A). Então a ordem não é organização: é a decisão de qual conhecimento a gente leva embora se ele sair na tela 4.

### 4.1 O critério

**Ordena por quanto custa o Otto não saber aquilo, não por quanto é fácil responder.**

O custo de não saber tem dois fatores, e os dois são observáveis:

1. **Quem mais sabe.** Item com `preenchivel_por: []` é o único conhecimento que se perde de vez se o dono sair. O que a camada 0 preenche não se perde: fica preenchido de qualquer jeito.
2. **Se o Otto pode se virar sem.** Preço, prazo e garantia caem na regra 6 do caráter — sem fonte, o Otto **não estima, encaminha**. Cada pergunta dessas sem item é um encaminhamento queimado, todo dia, para sempre. Já "vocês têm estacionamento?" sem item é uma frase de "não sei" e nada mais.

Disso saem três prioridades, e elas são o campo `prioridade`:

| | O que entra | Por quê primeiro | Lacunas |
|---|---|---|---|
| **1** | Preço, prazo e garantia dos 3 a 5 serviços que sustentam o faturamento | Só o dono sabe **e** o Otto não pode deduzir. É o encaminhamento mais caro e mais repetido | Sempre `dinheiro`/`dias`, `preenchivel_por: []` |
| **2** | Escopo (*"vocês fazem X?"*) e as regras do negócio (sinal, parcelamento, garantia condicional, o que não faz) | Só o dono sabe, mas é **um toque**: `escolha`, sim ou não. Barato para ele e mata uma classe inteira de encaminhamento — inclusive a resposta negativa, que é conhecimento (§5) | Nenhuma, ou `sim_nao` |
| **3** | Horário, endereço, formas de pagamento, como chegar | A camada 0 costuma já ter preenchido. Vira conferência de um toque, e conferir é útil (horário do perfil do WhatsApp envelhece), mas não é o que se perde se ele sair | `preenchivel_por` preenchido |

### 4.2 A regra de montagem, escrita para o backend

```
telas = ordena(itens_do_nicho + itens_de__comum, por:
                 prioridade asc,
                 tem_lacuna_obrigatoria_em_branco desc,   # o que a camada 0 não resolveu vem antes
                 ordem asc)
          .primeiras(10)
```

Consequências, e cada uma é intencional:

- **Nenhuma tela desperdiçada.** Se o perfil do WhatsApp já entregou horário e endereço, esses dois caem para o fim e o item 11 e 12 do arquivo sobem. As 10 telas são sempre as 10 maiores dúvidas ainda em aberto.
- **A conferência do que a camada 0 preencheu não some, só espera.** Ela vive na tela "O que o Otto sabe" (§12.5.C), com a linha "isso eu peguei do seu perfil do WhatsApp · [Ver] · [Corrigir]".
- **No máximo 2 lacunas obrigatórias por tela.** Regra de escrita, não de código: item que precisaria de 3 números vira dois itens, ou o terceiro número vira lacuna opcional. Tela com três campos em branco é o formulário que a decisão C recusou, com outra moldura.
- **Item `encaminha_sempre` não ocupa tela.** Não há nada nele para o dono conferir: é regra de roteamento, não conhecimento.
- **Cada arquivo tem 13 a 16 itens, não 10.** Os que sobram não são desperdício: viram **lacunas semeadas** (§6).

`medir.py` implementa essa ordenação, e a coluna A de `MEDICAO.md` é o resultado dela — o que é uma forma barata de a regra não ser só prosa.

### 4.3 O que sobra do nicho quando o dono para na tela 3

Ele fica com preço, prazo e garantia do carro-chefe preenchidos, e nada mais. É pouco, e é exatamente a coisa certa: é o que responde a pergunta que chega oito vezes por semana (`experiencia.md` §12.1), e é o que a camada 0 nunca ia entregar sozinha.

---

## 5. A lacuna em branco não pode sair na conversa. Por construção

**É o pior erro possível do produto:** o Otto responder `A troca de tela sai por R$ ___`. Ele mente sobre o que sabe, expõe o andaime e queima a confiança do dono e do cliente final na mesma mensagem.

**A defesa não é uma instrução no bloco 1. É o renderizador.**

> **Item com qualquer lacuna obrigatória não preenchida não entra no `<base>`.** Fica com `situacao: rascunho`, invisível ao modelo. A sequência `___` nunca chega ao prompt, então o modelo não tem de onde copiá-la.

O comportamento que sobra é o certo e já está especificado: sem item, o Otto responde o texto fixo de "não sei" do preset e encaminha no modo em vigor (`estilos-de-atendimento.md`; regra 6 do caráter; `experiencia.md` §12.3). O dono não perde nada por não ter preenchido — perde só a resposta automática.

Três camadas, nesta ordem, e a primeira é a que vale:

| Camada | O quê | Onde se prova |
|---|---|---|
| **Construção** | O renderizador não emite item com lacuna obrigatória vazia. Lacuna opcional vazia: a oração que a contém é removida, o resto do item vale | `N-01`, teste de unidade **sem modelo** |
| **Comportamento** | Perguntado sobre um item em rascunho, o Otto responde "não sei" e encaminha | `N-02`, com modelo |
| **Rede** | O avaliador `sem_lacuna_no_texto` reprova qualquer resposta que contenha `___`, `{`, `[valor]`, `R$ ,`, `R$ .` ou `R$` sem dígito | Roda em **todos** os casos da suíte, não só nos do nicho |

### 5.1 Nenhum item do nicho responde antes de um gesto humano

**Regra de esquema, e ela fecha um buraco que eu abri e só vi ao escrever o terceiro arquivo:** todo item tem **ou** pelo menos uma lacuna obrigatória, **ou** é do tipo `escolha`. Item sem nenhum dos dois seria um fato sobre um negócio que ninguém confirmou, renderizado no dia 1 — o Otto afirmando algo que a empresa não disse, que é a regra 6 do caráter quebrada pela nossa própria base, e não pela do cliente.

Consequência: ao instanciar a base do nicho, **todos** os itens nascem `situacao: rascunho` e nenhum é renderizado. Preencher a lacuna, ou tocar num dos dois botões de um `escolha`, é o que promove para `vigente`. É a leitura literal do ADR 022 — a empresa ensina conferindo — aplicada ao esquema e não à tela.

Isso reconcilia com `experiencia.md` §12.3, que lista a base do nicho entre as fontes que o Otto usa no estado recém-contratado: ela cobre o que **já foi conferido**, e o passo de conferência acontece **antes** de o número ser conectado (§12.5.A). Quando o primeiro cliente escreve, a base do nicho já passou pela mão do dono ou não existe. O que o dono não conferiu não é resposta ruim: é lacuna semeada (§6).

**Lint de CI: `nicho_item_precisa_de_gesto`** — arquivo com item `fato` ou `lista` sem lacuna obrigatória reprova o build.

**Lacuna opcional, como a oração some.** O `texto` marca o trecho descartável entre `«»`:

```yaml
texto: "Troca de tela de iPhone: a partir de R$ {preco}«, com {garantia_dias} dias de garantia»."
```
Sem `garantia_dias`, renderiza `Troca de tela de iPhone: a partir de R$ 480.` A pontuação está dentro do trecho de propósito.

**Recusar também é conhecimento, e isso é o segundo ganho da §4.1 prioridade 2.** Quando o dono marca `[Não]`, o texto negativo do item vira item `fato` `vigente`. Isso muda a resposta de *"não sei, vou passar para a equipe"* para uma resposta que responde. Sem o item negativo, o Otto **não pode** deduzir escopo (caso B-05 de `conversa.md` §7.2: nunca deduzir o que a empresa faz pelo nome dela).

**Quanto vale, exatamente — e a frase antiga estava larga.** Ela dizia "uma resposta melhor e um encaminhamento a menos". A segunda metade só vale para uma parte dos itens, e a §5.2 é o que separa as duas. Números medidos em §5.2.

---

## 5.2 A forma obrigatória do texto negativo

> **Decidido em 2026-09-09**, fechando a pendência que o guardião da marca devolveu em `experiencia.md` §12.13.12.

O texto negativo é dito a um **cliente final** — outra audiência, `voz-e-tom.md` §2, não a mesma da tela do onboarding. Recusa que termina em "não fazemos" e ponto manda a pessoa embora, e é o argumento inteiro da rodada 1 que cai junto: se a negativa fecha a porta, ela não é melhor que o `fixa_nao_sei`, que pelo menos termina em encaminhamento por construção.

**Vale para os dois carregadores de texto negativo, e isso não estava dito em lugar nenhum:**

| Onde | Tipo de item | De onde vem o gesto |
|---|---|---|
| `opcoes.nao` | `escolha` | `[Não]` na rodada 1 (`experiencia.md` §12.5.A/A.1) |
| `negativa` | `fato` | "Não é bem assim" na rodada 2, quando o dono diz que não faz |

São **50 textos** nos 8 arquivos mais os 2 troncos: 27 `opcoes.nao` e 23 `negativa`. A §12.13.12 fala em `negativa`; a regra é dos dois, porque o cliente final não sabe de que campo do YAML a frase saiu.

### A regra

> **Todo texto negativo declara `negativa_fecha`, e só há três valores.** Recusa que não cabe em nenhum dos três não é negativa: é item que não devia ter negativa.

| `negativa_fecha` | O que o texto faz | O que a resposta faz | Custo |
|---|---|---|---|
| **`fronteira`** | Diz, em uma oração afirmativa, o que a empresa faz no lugar — e o que ele diz é a **mesma** informação que o `[Não]` carregou, vista pelo lado positivo | Responde e segue. **Não encaminha** | Zero. É aqui que mora o "encaminhamento a menos" |
| **`encaminha`** | Diz só o fato negativo, nu. Nenhuma frase de encaminhamento dentro do item | Diz o fato **e** entrega a uma pessoa, no modo do ADR 012 | Um encaminhamento. Ganha só a qualidade da resposta |
| **`basta`** | A recusa é resposta completa e não sobra querer nenhum | Responde e para | Zero |

**`fronteira` é a forma preferida, sempre.** `Atendemos só celular.` · `O atendimento é só no estúdio.` · `Não fazemos aula avulsa, só o processo completo.` · `Não parcelamos; o pagamento é à vista.` Marcadores típicos: `só`, `somente`, `apenas`, ou uma oração que descreve **como funciona** em vez de recusar.

**`encaminha` é metadado, nunca texto.** O item continua sendo só um fato: `Não fazemos progressiva.` Quem entrega ao humano é o bloco 1 (regra 3 do caráter) mais o modo do ADR 012, com a frase do preset. Escrever *"vou passar para a equipe"* dentro do item quebra três coisas de uma vez: o canal *fato* não carrega ordem (`conversa.md` §1.1), a frase de encaminhamento é do guardião e varia por preset (`estilos-de-atendimento.md`), e o modo não é conhecido quando o arquivo é escrito — no modo Recado essa frase vira promessa de atendimento imediato, que é o caso B-03 reprovando.

**Como o renderizador diz isso ao modelo:** marcador na própria linha, no mesmo lugar de `VENCIDO` e `EM CONFLITO` (`conversa.md` §2.4), e o significado é declarado uma vez no bloco 1:

```
[i22|preco|2026-09-09|dono|ENCAMINHA] Não fazemos progressiva.
```

Marcador, não frase. Regra local numa linha é obedecida; regra por referência cruzada some no meio de 40 itens — a mesma razão de `completa`/`parcial` na §3.4. Custo: ~2 tokens por item negativo em estado `encaminha`.

**`basta` é fechado por assunto, e o portão é o que impede que ele vire escape.** Só `assunto` em `endereco` ou `horario`. Fora daí — preço, escopo, entrega, encomenda, estoque, convênio, urgência, manutenção, garantia, prazo — ou tem fronteira ou entrega a alguém. Hoje há **uma** ocorrência legítima em 50: `estacionamento` (`Não temos estacionamento próprio.`), e ela é o caso real: quem pergunta onde estacionar vem de qualquer jeito.

### A regra de escrita que o lint não pega, e por que ela não vira lint

> **A oração afirmativa da `fronteira` só pode falar do sujeito que o `[Não]` recusou.**

`Não fazemos reparo de placa. Atendemos troca de peça.` tem forma de fronteira e é **um segundo fato**: o dono nunca confirmou troca de peça naquele toque. É exatamente o defeito que `experiencia.md` §12.13.12 pega na linha gerada pelo modelo — *"a moldura é do modelo e o número é do dono"* — cometido por nós, na nossa própria base. N-13 existe justamente para isso: se eu não me submeto à regra, ela não vale para ninguém.

**Não vira lint, e a razão está medida.** Tentei três heurísticas (verbo de oferta sem `só`; substantivo fora do vocabulário do próprio item; sobreposição com `pergunta` e `opcoes.sim`). As três reprovaram 5 itens corretos para pegar 1 errado. Regra de lint que se afrouxa na primeira fricção deixa de existir na terceira (§11.1) — e regra que reprova o certo é afrouxada na primeira. Fica como regra de escrita, conferida em PR, com o caso de avaliação `N-14` de `conversa.md` §7.2 como rede de comportamento. Na conferência à mão de 2026-09-09 ela pegou **3 em 50**, e as três estavam dentro do grupo que o lint aprova.

### A negativa gerada pelo modelo

**Restrição própria, e não é a mesma dos arquivos.**

> **Negativa gerada nasce `negativa_fecha: encaminha`, obrigatório, sem exceção. `fronteira` e `basta` são inalcançáveis para ela.**

Motivo: escrever uma fronteira exige saber **o que a empresa faz no lugar**, e isso é enumeração — a classe em que `conversa.md` §2.7.3 diz que o modelo é *"mais plausível e mais errado"*, e a única classe que ele nunca gera. Onde nós escrevemos o arquivo, a fronteira passou por lint, PR e guardião; onde o modelo escreve, não passou por ninguém, e o preço de não ter passado é um encaminhamento.

Isso também resolve a tensão entre **"uma oração, um fato"** (§12.13.1 e §12.13.12) e **"recusa mais alternativa"**, que parecem se contradizer e não se contradizem:

> **"Uma oração, um fato" conta o que o dono julga, não as orações que o cliente lê.** O `[Não]` é um bit sobre um fato. O texto negativo é esse mesmo bit escrito para o cliente. A fronteira — o mesmo fato dito pelo lado positivo — **não acrescenta fato nenhum**: `Atendemos só celular` não afirma nada além do que `não consertamos notebook` já afirmou. O que a regra proíbe continua proibido, e é o **segundo fato**.
>
> A linha gerada, essa sim, é **uma oração e só a recusa** — porque ali o modelo não tem como dizer a fronteira sem inventá-la.

E as travas que `experiencia.md` §12.13.12 já impõe à linha gerada **não criam conflito com esta regra**: âncora obrigatória, sem dígito, sem advérbio de hedge, sem superlativo, sem adjetivo de venda, sem emoji, mesma pessoa e mesma forma. Uma recusa nua de uma oração satisfaz todas as seis. A única que precisava de leitura era "mesma forma das nossas" — e é por isso que a nossa forma preferida (`fronteira`) e a forma dela (`encaminha`) **não podem ser distinguíveis em voz**: as duas são frases curtas, afirmativas ou neutras, sem hedge. O que muda é o que a resposta faz depois, e isso o dono não lê na tela.

### Censo dos 8 arquivos, medido em 2026-09-09

`python3 lint.py --diagnostico`, contando os 50 textos negativos:

| | Textos | % |
|---|---|---|
| Suportam `fronteira` pela **forma** (têm oração afirmativa) | 32 | 64% |
| Não suportam | 18 | 36% |
| Dos 32, carregam **segundo fato** (conferência à mão) | 3 | 6% |
| **Passam nas duas regras hoje** | **29** | **58%** |

Dos 18 que não suportam a forma, **3 não são recusa nenhuma** — são fato bom escrito no negativo, e a reescrita afirmativa é mais curta e melhor: `perde_os_dados`, `peca_original`, `cobra_sinal`. Os outros 15 são recusa de verdade: 14 sem fronteira possível ou com fronteira por escrever, e 1 `basta` legítimo.

**Classificação proposta depois da reescrita** (a classificação é minha; o texto é do guardião):

| `negativa_fecha` | Textos | % | O que a rodada 1 ganha |
|---|---|---|---|
| `fronteira` | 38 | 76% | Resposta melhor **e** um encaminhamento a menos |
| `encaminha` | 11 | 22% | Resposta melhor. **Mesmo encaminhamento** |
| `basta` | 1 | 2% | Resposta melhor e um encaminhamento a menos |

**É este o número que corrige a frase de `experiencia.md` §12.13.2.** "Um encaminhamento a menos" vale para 78% dos textos, não para todos. Os 22% ganham só a qualidade da resposta — que continua sendo um ganho, porque `Progressiva a gente não faz` mais encaminhamento é melhor que `Essa eu não tenho aqui` mais encaminhamento, mas é um ganho menor e não é o que estava escrito.

**Grau de evidência:** a contagem é medida (`lint.py --diagnostico`, saída no §11.2). A afirmação de que a fronteira segura o cliente e a recusa nua o manda embora é **INFERIDA**, mecanismo declarado (a pessoa que pergunta *"vocês fazem X?"* veio comprar; uma resposta sem próximo passo encerra a conversa), sem comparável conferido e sem magnitude. O que a mata: `reacao_do_cliente_a_anterior` (`dados.md`, evento 6) não distinguindo `fronteira` de `encaminha` de `fixa_nao_sei` nas primeiras contas — se as três tiverem a mesma taxa de abandono, a regra custou reescrita e não comprou nada, e `basta` passa a ser a forma padrão.

---

## 6. Os itens 11 a 16: lacunas semeadas

Os itens que não couberam nas 10 telas não ficam parados. Eles entram na conta como **lacunas** já rascunhadas (`conversa.md` §6.1): `pergunta_normalizada` e `item_proposto.texto` prontos, `campos_faltando` preenchido, `situacao: aberta`.

O efeito é que, no dia em que um cliente pergunta *"vocês fazem manutenção de cílios?"*, o buraco já chega no resumo do dia (§12.5.E) e na pergunta do WhatsApp (§12.5.G) **como proposta de um toque**, e não como pergunta aberta. A base do nicho pré-preenche a lista de aprendizado, não só a base.

**Isso não custa token nenhum:** lacuna não é item, não entra no `<base>`, e vira item só quando o dono preenche.

---

## 7. Grau de evidência — nenhuma destas perguntas foi ouvida de um cliente

**Todas as perguntas destes 8 arquivos são hipótese.** Foram escritas por mim, do conhecimento geral de como esses negócios funcionam, sem uma única conversa real, sem uma transcrição, sem um cliente. `behavioral-evidence` manda declarar isso, e está declarado aqui e no cabeçalho de cada arquivo.

Ficha, uma por classe (o instrumento é idêntico nos 8 nichos):

| Campo | Conteúdo |
|---|---|
| **Afirmação** | As 10 primeiras perguntas da base do nicho N são as que os clientes daquele nicho realmente fazem, e a resposta proposta está perto o bastante para o dono confirmar em vez de reescrever |
| **Onde sustenta** | O passo "confere se acertei" (§12.5.A). Se for falsa, o passo vira formulário em branco com moldura melhor, e a decisão C perde a porta da frente |
| **Tipo** | Taxa |
| **Evidência hoje** | Nenhuma. Não abri fonte nesta sessão e não há conversa de campo feita |
| **Comparável** | Nenhum conferido. **Não invento magnitude.** A direção é robusta (`behavioral-evidence` §4, custo de decisão): conferir uma frase pronta cobra menos que inventar a taxonomia. Isso sustenta o desenho; não sustenta um número |
| **Taxa mínima** | **Uso o limiar que a ficha 12.4 de `experiencia.md` já declarou** e não crio um novo: metade das 10 propostas confirmada sem edição. Mata: mais de 7 em 10 editadas |
| **Como se mede** | `base.atualizada` com `fonte_da_proposta = nicho` e `origem = onboarding`, agrupado por `empresas.segmento`: `confirmou / (confirmou + editou + recusou_proposta)` |
| **O que a mata** | O limiar acima, por nicho. E, por item: 4 das 10 primeiras contas do nicho recusarem o **mesmo** item |
| **Grau** | **NÃO VERIFICADO** |

### 7.1 O plano de correção, que é medição e não intenção

**As primeiras contas de cada nicho são a revisão da base.** O produto já mede isto — `base.atualizada` com `acao` e `fonte_da_proposta` foi especificado em `experiencia.md` §12.12.1 exatamente para isso. O que falta é a regra de o que fazer com o número, e ela é esta:

| Sinal, nas 10 primeiras contas de um nicho | Ação, e ela é mecânica |
|---|---|
| Item recusado (`recusou_proposta`) por **4 ou mais** | Sai do arquivo. Ele descreve um negócio que não é este |
| Item editado (`editou`) por **6 ou mais** | O `texto` é reescrito para a forma que a maioria escreveu. O que eles corrigem em bloco não é erro deles |
| Item confirmado por **8 ou mais** | Sobe de prioridade. Acertou e é barato |
| `outro` acima de 20% no `assunto` das conversas do nicho | Falta pergunta. A lista de `assuntos` do segmento cresce (regra que `dados.md` já tem) e o arquivo ganha item |
| Mais de 7 em 10 propostas editadas no nicho inteiro | **O arquivo está errado.** A proposta do onboarding daquele nicho passa a sair só do perfil e da descrição, e o arquivo é reescrito com o que as contas escreveram |

**Rodada de revisão: uma por nicho, quando ele completar 10 contas.** Não é calendário, é contagem — calendário produz revisão sem dado.

### 7.2 O que corrige antes de existir código, e é barato

Nesta ordem de custo:

1. **Papel, 5 donos, 10 minutos** — já previsto nas fichas 12.1 e 12.4 de `experiencia.md`. Mostrar as 10 perguntas impressas e pedir: *"qual destas seus clientes não perguntam, e qual falta?"*. Mede as duas coisas de uma vez, e a segunda é a que eu não consigo ver sozinho.
2. **20 minutos de leitura pública por nicho** — perguntas e respostas do Perfil da Empresa no Google e comentários de Instagram de 5 negócios do nicho. É comportamento existente (`behavioral-evidence` §5): pergunta que alguém já digitou, não pergunta que alguém diz que faria. **Não foi feito.** Quando for, o resultado entra como `COMPARÁVEL` no cabeçalho do arquivo, com a data e o que foi lido.
3. **Uma semana de atendimento da primeira conta do nicho** — de graça, já autorizada pelo ADR 014, e é a única fonte que traz o vocabulário dos clientes daquele bairro.

### 7.3 A hipótese embutida no agrupamento, dita à parte

Agrupar cabeleireiro com salão (§8) e separar barbearia dos dois é uma aposta sobre onde a resposta ao cliente muda. Ela tem um instrumento próprio e barato:

| Afirmação | O cabeleireiro autônomo recusa poucos itens da base de salão (menos de 3 dos 14), e o barbeiro recusaria muitos se recebesse a base de salão |
|---|---|
| **Tipo** | Taxa |
| **Como se mede** | `recusou_proposta` por `chave` de item, cruzado com `empresas.segmento`. Já existe: `base.atualizada` carrega os dois |
| **O que a mata** | Autônomo de cabelo recusando 5 ou mais itens de salão → `salao-e-cabeleireiro.yml` se divide em dois. Barbearia com menos de 3 recusas se recebesse a base de salão → as duas se juntam e eu errei |
| **Grau** | **INFERIDO.** O mecanismo (unidade de preço e duração diferentes) está argumentado em §8; a magnitude não |

---

## 8. Agrupar ou separar — a decisão, e o que muda na resposta ao cliente

Nove nichos pedidos, **oito arquivos**. A tabela abaixo é o critério, e ela olha só para o que muda na frase que o cliente final lê.

| Nicho | Unidade de preço | Duração típica | Como se marca | Vocabulário próprio | Assunto sensível |
|---|---|---|---|---|---|
| Assistência técnica de celular | por serviço **por modelo de aparelho** | horas a dias | ordem de chegada, deixa o aparelho | tela, bateria, placa, orçamento, garantia | não |
| Clínica odontológica | por procedimento, **mais avaliação, mais convênio** | sessão | horário marcado | avaliação, canal, restauração, convênio | **saúde** |
| Autoescola | **por processo inteiro**, parcelado, **mais taxa de terceiro** | meses | matrícula, depois aulas | primeira habilitação, categoria, Detran, exame, prova | exame médico |
| Loja de artigos religiosos afro | por produto, unidade | pronta entrega ou encomenda | não se marca, é balcão e entrega | guia, búzios, ervas, quartinha, obrigação | **religião** |
| Clínica de estética | **por sessão e por pacote de N sessões** | 30 a 90 min | horário marcado, com avaliação antes | protocolo, sessão, pacote, avaliação | **saúde** |
| Lash designer | **por aplicação, mais manutenção a cada N dias** | 2 a 3 h | horário marcado | fio a fio, volume, mapping, manutenção, retirada | alergia |
| Salão / cabeleireiro | **"a partir de", varia por comprimento** | 1 a 4 h | horário marcado, às vezes com sinal | química, progressiva, luzes, comprimento | não |
| Barbearia | **fixo por corte** | 30 a 45 min | ordem de chegada ou marcado | degradê, pezinho, barba, combo | não |

### 8.1 Cabeleireiro + salão de beleza = um arquivo. Barbearia = outro

**Junto cabeleireiro e salão.** O salão é o superconjunto: os serviços de cabelo são idênticos e a resposta ao cliente é a mesma frase. A diferença é que o salão também faz unha, sobrancelha e depilação — três itens que o autônomo recusa em três toques.

**O que se perde:** o cabeleireiro autônomo vê 3 dos 16 itens que não são dele. Mitigação, e ela é a razão de a ordenação da §4 existir: esses três estão em `prioridade: 2`, `ordem` alta — caem para o fim da fila, e recusar é um toque que ainda **produz conhecimento** (`Não fazemos unha.` evita um encaminhamento). O custo real é 3 toques; o custo de separar seria manter duas cópias de 13 itens iguais.

**Separo barbearia**, e não é por vocabulário — é por três coisas que mudam **toda** resposta de preço e de agenda:

1. **A unidade de preço.** Barbearia responde um número: `Corte: R$ ___`. Salão responde uma faixa mais uma pergunta: `Progressiva: a partir de R$ ___, depende do comprimento. Manda uma foto do seu cabelo?`. São formatos de item diferentes (`fato` com um valor × `fato` com faixa e pergunta de fechamento) e comportamentos diferentes do Otto — um afirma, o outro qualifica antes de afirmar. Colar os dois no mesmo arquivo obrigaria o barbeiro a apagar o "a partir de" de metade dos itens, que é edição, não conferência.
2. **A duração**, que muda a resposta de agenda. 40 minutos cabe em "passa aqui"; 3 horas não cabe em nada sem horário marcado.
3. **Como se marca.** Barbearia atende por ordem de chegada com frequência; salão quase nunca. Isso decide se `_comum/hora-marcada.yml` entra, e esse arquivo inteiro (sinal, remarcação, atraso) é resposta de cliente.

**O que se repete entre os dois, e não é copiado:** horário, endereço, pagamento e as regras de agenda vivem em `_comum/`, incluídos por referência. É por isso que "8 arquivos" custa menos manutenção do que parece: cada arquivo carrega só o que é dele.

### 8.2 Estética e lash: separados

Tentei juntar e não fecha, pelo teste que a própria ficha 12.4 impõe (*mais de 7 em 10 editadas ⇒ a base está errada*):

- **A lash designer tem um serviço só.** A base dela é quase inteira sobre extensão de cílios: tipos de volume, ciclo de manutenção, duração da aplicação, retirada, cuidado depois, contraindicação. Numa base de estética, 7 dos 10 itens do onboarding não seriam dela — que é exatamente o número que declara a base errada. Ela é também a profissional mais solo desta lista, a que menos tempo tem, e a que mais depende de a primeira tela acertar.
- **A unidade de preço é outra.** Lash: `aplicação + manutenção a cada N dias` — receita recorrente com ciclo. Estética: `sessão + pacote de N sessões` — pacote fechado. As duas frases respondem "quanto custa?" de forma incompatível.
- **Estética esbarra em saúde e lash quase não.** Contraindicação, gestante, medicação, procedimento com agulha, "resultado depende de avaliação". Isso muda o comportamento do Otto (encaminha em vez de responder) e é meio arquivo.

**O que se repete:** avaliação antes de fechar preço, agenda com sinal, cuidado depois do procedimento. Está em `_comum/hora-marcada.yml` e nas duas convenções de escrita abaixo.

### 8.3 Por que os outros quatro não se juntam a ninguém

Assistência técnica de celular, odontologia, autoescola e loja de artigos religiosos não compartilham unidade de preço, duração, forma de marcar nem vocabulário com nenhum outro da lista. Autoescola é o único cujo preço embute **taxa de terceiro** (Detran) e cujo ciclo é medido em meses; a loja religiosa é a única que não marca horário e vende produto por unidade. Juntar qualquer um deles seria organização, não resposta.

---

## 9. Orçamento de tokens

`conversa.md` §3.2 fixa: **alvo de 4.000 tokens** de bloco de negócio, **teto duro de 8.000**. A base do nicho é o ponto de partida, não o teto — o dono acrescenta as respostas dele na primeira semana.

O número de cada base está em `MEDICAO.md`, gerado por `medir.py`. Resumo: **a base do nicho depois do onboarding fica entre 268 e 332 tokens, 6,7% a 8,3% do alvo de 4.000**, e conferida inteira vai a no máximo 622 (15,5%). Sobram cerca de 3.400 a 3.700 tokens para o dono acrescentar as respostas dele. Caracteres são medidos; tokens são `[ESTIMATIVA]` com a razão declarada, porque não há chave da API neste ambiente — o texto renderizado fica em `_teste/render/` justamente para que a estimativa vire medição com um comando.

**A regra de escrita que decorre do orçamento:** item de até 200 caracteres (`conversa.md` §2.3), 13 a 16 itens por nicho, no máximo uma `lista` por arquivo. Arquivo que estourar isso não é rejeitado por gosto: ele empurra o dono para o teto antes de ele ter ensinado nada.

---

## 10. O que a suíte de avaliação ganha de graça

Cada item traz `pergunta`, `chave` e `texto`. Disso saem **dois casos por item, sem trabalho extra**, que é a mesma mecânica da §6.2 de `conversa.md`:

| Variante | Fixture | Esperado |
|---|---|---|
| `preenchido` | Base do nicho com a lacuna preenchida por valor de teste | Responde citando o `id` do item. `itens_usados` contém a chave |
| `em_branco` | Base do nicho instanciada, lacuna vazia | Texto fixo de "não sei" do preset + encaminhamento no modo. **Nenhuma ocorrência de `___`, `{`, `[valor]`** |

Os casos escritos à mão, que a geração não cobre, estão em `conversa.md` §7.2, série `N-*`.

**Os valores de teste não são inventados aqui.** Ficam em `_teste/valores.yml`, marcados como fixture, e nunca são exemplo: um número numa base do nicho vira número que alguém copia.

---

## 11. O lint, e o que ele já pegou

`python3 lint.py` — nove regras ligadas mais duas escritas e não ligadas, roda no CI, arquivo que reprova não entra. As três primeiras existem porque um erro meu aqui vira o Otto quebrando o caráter no negócio de outra pessoa.

| Regra | O que reprova |
|---|---|
| `nicho_item_precisa_de_gesto` | `fato` sem lacuna obrigatória — renderizaria sem o dono confirmar nada (§5.1) |
| `nicho_sem_numero` | Preço, prazo, duração, sessão ou percentual escrito por mim. Por unidade, não por dígito: `iPhone 13` e `categoria B` passam, `R$ 480` e `90 dias` não |
| `nicho_sem_instrucao` | Ordem ao Otto dentro do canal *fato* (`sempre`, `nunca`, `responda`, `informe`, `o Otto`) |
| `encaminha_sem_texto` | Item `encaminha_sempre` com `texto` |
| `lacuna_declarada` | `{x}` no texto sem lacuna declarada, ou lacuna declarada e não usada |
| `opcional_dentro_de_guillemets` | Lacuna opcional fora de `«…»` — sem valor, sobraria frase quebrada |
| `no_maximo_duas_lacunas` | Item com 3 ou mais lacunas obrigatórias: é formulário numa tela só (§4.2) |
| `preco_so_do_dono` | Lacuna `dinheiro` com `preenchivel_por` diferente de `[]` ou `[catalogo]` (§3.3) |
| `ate_200_chars` · `chave_unica` · `assunto_no_vocabulario` · `motivo_valido` | Higiene de esquema |
| **`rodada_1_tem_lote`** (décima, **escrita e ainda não ligada**) | Arquivo do nicho com menos de **4** itens `escolha`, contados **sem `_comum`**. Ver §11.1 |
| **`negativa_nao_fecha_a_porta`** (décima primeira, **escrita e ainda não ligada**) | `negativa` ou `opcoes.nao` sem `negativa_fecha`; `fronteira` sem oração afirmativa; `encaminha` com frase de encaminhamento no texto ou com oração afirmativa; `basta` em assunto fora de `endereco`/`horario`. Ver §5.2 e §11.2 |

### 11.1 A décima regra, e por que ela ainda não está ligada

**Pedida pelo especialista de UI/UX** em `experiencia.md` §12.13.10, item 3, quando o passo do onboarding virou duas rodadas: a rodada 1 é uma tela em lote feita **só de itens `escolha`** (5 a 8 linhas, `[Sim]`/`[Não]`, sem teclado) e a rodada 2 é feita **só de `fato` com lacuna `preenchivel_por: []`** (3 a 6 telas). Um arquivo com poucos `escolha` não enche uma tela; um com poucos `fato` só-do-dono não chega ao piso da rodada 2.

**Diagnóstico dos 8 arquivos, medido:**

| Arquivo | `escolha` no nicho | `escolha` com `_comum` | `fato` só-do-dono no nicho |
|---|---|---|---|
| assistencia-tecnica-celular | 7 | 8 | 5 |
| loja-artigos-religiosos-afro | 5 | 6 | 3 |
| barbearia | 4 | 5 | 5 |
| salao-e-cabeleireiro | **3** | 5 | 8 |
| clinica-de-estetica | **2** | 4 | 7 |
| clinica-odontologica | **2** | 4 | 8 |
| autoescola | **1** | 3 | 11 |
| lash-designer | **1** | 3 | 8 |

**A rodada 2 nunca é o problema: os 8 passam folgado** (mínimo 3, mediana 7,5). Não escrevo regra de lint para ela — regra que nunca reprova nada é regra que ninguém confere. Fica como leitura de medição.

**A regra conta sem `_comum` de propósito.** `_comum/todo-negocio.yml` traz um `escolha` só, `estacionamento`, prioridade 3, que não decide nada da rodada 2. Se ele contasse, ele viraria enchimento oficial e quatro arquivos passariam sem função. Contando sem o comum, o piso de 4 no nicho fecha os 5 do UI/UX quando o comum entra por cima.

**Por que cinco arquivos reprovam, e a causa não é descuido.** É viés do desenho anterior: escrevi os oito para "10 telas, uma pergunta por tela", onde `escolha` e `fato` disputavam as mesmas 10 vagas e prioridade 1 (preço) ganhava sempre. **O desenho novo dá à `escolha` uma tela grátis — ela custa uma linha, não uma tela** —, e a economia que orientou a escrita deixou de valer. Por baixo disso há uma causa real: os quatro piores são nichos de **serviço único** (autoescola faz primeira habilitação, lash faz cílios, odontologia e estética giram em torno de um processo), em que o escopo é menos ambíguo e o preço é mais. Mas há `escolha` reais e não escritas em todos eles — autoescola (categoria A, renovação, reciclagem, aula avulsa para habilitado), odontologia (convênio, clareamento, implante, aparelho), estética (laser, massagem, corporal), lash (sobrancelha, retirada de trabalho de outra profissional, venda de produto de manutenção).

**Ligar a regra antes de reescrever os arquivos travaria o build no dia em que ela entrasse.** Ordem: reescrever os cinco (pendência 7), depois ligar. Regra que nasce vermelha é regra que alguém desliga.

**Na primeira execução ele reprovou uma linha minha**, em `clinica-odontologica.yml`: *"o atendimento é sempre com horário marcado"*. É falso positivo de intenção — `sempre` ali é advérbio do negócio, não ordem ao Otto — e mesmo assim o certo foi **reescrever o texto**, não afrouxar a regra. O texto ficou mais curto ("é só com horário marcado") e a regra continua pegando o caso verdadeiro. Regra de lint que se afrouxa na primeira fricção deixa de existir na terceira.

### 11.2 A décima primeira regra, `negativa_nao_fecha_a_porta`, e o que ela mediu

Mesma ordem da décima, e pela mesma razão: **escrita, medida, não ligada.** Ligá-la hoje reprova **50 de 50** — todos por ausência do campo `negativa_fecha`, que ainda não existe em arquivo nenhum. Esse número não diz nada sobre o texto, e é por isso que `--diagnostico` roda também um censo de forma, que é o número que interessa.

```
$ python3 lint.py --diagnostico

--- censo: o que o texto de hoje já suporta ---

  suportam `fronteira` hoje ....... 32/50 (64%)
  não suportam .................... 18/50 (36%)

  assistencia-tecnica-celula  perde_os_dados          escopo       Na troca de tela e de bateria os dados do aparelho não são apagados.
  assistencia-tecnica-celula  peca_original           garantia     A peça que usamos não é original de fábrica.
  assistencia-tecnica-celula  compra_aparelho_usado   escopo       Não compramos aparelho usado.
  autoescola.yml              preco_categoria_a       preco        Não trabalhamos com categoria A (moto).
  barbearia.yml               preco_infantil          preco        Não atendemos crianças.
  barbearia.yml               vende_produto           escopo       Não vendemos produtos.
  clinica-de-estetica.yml     preco_limpeza_de_pele   preco        Não fazemos limpeza de pele.
  clinica-de-estetica.yml     procedimento_com_agulha escopo       Não fazemos procedimentos injetáveis.
  clinica-odontologica.yml    preco_clareamento       preco        Não fazemos clareamento.
  clinica-odontologica.yml    parcelamento            pagamento    Não parcelamos o tratamento.
  loja-artigos-religiosos-af  envia_para_outra_cidade entrega      Não enviamos para outras cidades.
  salao-e-cabeleireiro.yml    preco_quimica           preco        Não fazemos progressiva.
  salao-e-cabeleireiro.yml    atende_cabelo_cacheado_e_crespo escopo  Não trabalhamos com cabelo cacheado e crespo.
  salao-e-cabeleireiro.yml    preco_unha              preco        Não fazemos unha.
  salao-e-cabeleireiro.yml    preco_sobrancelha       preco        Não fazemos sobrancelha.
  salao-e-cabeleireiro.yml    preco_depilacao         preco        Não fazemos depilação.
  hora-marcada.yml            cobra_sinal             agendamento  Não cobramos sinal para marcar horário.
  todo-negocio.yml            estacionamento          endereco     [basta?] Não temos estacionamento próprio.
```

**Onde o dano se concentra, e não é uniforme.** `salao-e-cabeleireiro.yml` sozinho responde por **5 dos 18**, e os quatro piores textos do conjunto inteiro estão nele: `Não fazemos unha.` · `Não fazemos sobrancelha.` · `Não fazemos depilação.` · `Não fazemos progressiva.` Não é coincidência — é a mesma causa que fez esse arquivo reprovar `rodada_1_tem_lote` com 3 `escolha`: ele foi escrito com o escopo dentro de itens `preco`, e escopo dentro de item de preço produz recusa nua, porque a `negativa` de um item de preço não tem nada afirmativo a dizer. **As duas pendências se resolvem no mesmo arquivo e na mesma passada**, e a reescrita da pendência 7 tem que carregar esta junto.

**O quinto do salão** (`atende_cabelo_cacheado_e_crespo` → `Não trabalhamos com cabelo cacheado e crespo.`) sai da fila técnica e vai para a fila do guardião antes de qualquer coisa. Ele é o único texto dos 50 em que a forma da recusa carrega ofensa possível além de porta fechada, e o `observacoes_de_risco` do arquivo não o cobre.

**Falso positivo que apareceu e que eu corrigi na regra, não no texto** — ao contrário do caso da décima: a primeira versão separava orações só em `.` e `;`, e reprovou `Atendemos por ordem de chegada, sem precisar marcar.` e `Trabalhamos com ervas secas e banhos prontos, não com erva fresca.` Os dois são fronteira boa; o erro era meu, porque **vírgula separa oração em português** e é onde mora metade das fronteiras. Corrigido, o censo subiu de 29 para 32. A diferença com o caso da décima é que ali o texto estava pior que a regra e aqui a regra estava pior que o texto.

**Três dos 18 não são recusa nenhuma** — são fato bom escrito no negativo, e o certo é reescrever, como na décima: `perde_os_dados`, `peca_original`, `cobra_sinal`. A reescrita afirmativa é mais curta em dois dos três, e o arquivo já tem o padrão pronto (`A avaliação é gratuita.`, em dois nichos).

---

## 12. Pendências

| # | Pendência | Dono | Quando |
|---|---|---|---|
| 1 | Contagem de tokens real com `messages.count_tokens`. Hoje `MEDICAO.md` traz caracteres medidos e tokens estimados. **Não há chave da API neste ambiente** | backend + eu | Rodada 1, junto com a pendência 2 de `conversa.md` §12 |
| 2 | Parecer do guardião sobre a voz neutra (§2), sobre os campos `pergunta` e sobre o vocabulário de `loja-artigos-religiosos-afro.yml` e `clinica-odontologica.yml` | guardião | Antes de qualquer tela |
| 3 | Regra de publicidade de preço em odontologia (CFO) e o que isso faz com os itens de `preco` daquele arquivo. **Não verifiquei e não afirmo nada** | jurídico (gatilho: antes do primeiro cliente pagante) | Antes de o nicho de odontologia entrar em aquisição |
| 4 | `situacao: rascunho` é valor novo em `conversa.md` §2.3 (que hoje tem `vigente`, `vencido`, `em_conflito`). Registrar lá | eu | Junto com a v2 do `conversa.md` |
| 5 | Leitura pública de 20 minutos por nicho (§7.2, item 2). Nenhum nicho feito | eu | Antes do nicho entrar em aquisição |
| 6 | O `assunto` de cada nicho tem que virar linha da tabela `assuntos` de `dados.md` (catálogo global, sem `empresa_id`, ADR 023) | analista de produto + backend | Primeira entrega |
| 7 | **Reescrever os 5 arquivos que reprovam `rodada_1_tem_lote`** (§11.1): `autoescola`, `clinica-de-estetica`, `clinica-odontologica`, `lash-designer`, `salao-e-cabeleireiro`. Acrescentar `escolha` de escopo reais até 4 por arquivo, sem estourar o orçamento de tokens da §9 (um `escolha` custa menos que um `fato`: não tem lacuna, e o texto que renderiza é um dos dois). **Depois disso, ligar a regra 10 no `lint.py`** | eu | Antes de o passo do onboarding ir para código |
| 8 | Onde a `lista` aparece nas duas rodadas do onboarding. Cinco arquivos têm uma, e ela é N números numa tela — viola por construção a regra de "no máximo 2 lacunas obrigatórias por tela" da §4.2. É rodada 2 por classe de conhecimento, mas é uma terceira forma de tela. **Forma é do UI/UX**; o que é meu é a `lista` não poder virar 15 `fato` soltos (`conversa.md` §2.3). **Fechada pelo UI/UX em `experiencia.md` §12.13.11**: última tela da rodada 2, nenhum campo obrigatório, sem marcador `completa`/`parcial` e sem apagar linha | — | Feita |
| 9 | **Declarar `negativa_fecha` nos 50 textos negativos e reescrever os 18 que a §5.2 reprova.** Ordem obrigatória: (a) o guardião fecha os textos, começando por `atende_cabelo_cacheado_e_crespo`; (b) `salao-e-cabeleireiro.yml` é reescrito **junto com a pendência 7**, porque as duas têm a mesma causa; (c) os outros 7 arquivos; (d) **só então ligar a regra 11 no `lint.py`**. Regra que nasce reprovando 50 de 50 é regra que alguém desliga | guardião (texto) + eu (classificação) | Antes de a regra 11 entrar no CI |
| 10 | **`negativa_fecha` no esquema zod** de `packages/shared`, e o marcador `ENCAMINHA` na linha do renderizador (§5.2). O comportamento de encaminhar é do roteador, na mesma família de `encaminha_sempre`, com `motivo = regra_da_empresa` no evento `encaminhamento.solicitado` | backend | Junto com o renderizador |
| 11 | **`negativa_fecha: encaminha` forçado em toda negativa gerada**, no `lint_em_execucao` (`conversa.md` §7.3). Não é campo que o gerador preenche: é constante do caminho de escrita, e `fronteira` tem que ser inalcançável ali | backend + eu | Antes do gerador |
