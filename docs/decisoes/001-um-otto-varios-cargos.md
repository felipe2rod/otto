# 001 — Um Otto, vários cargos

Status: aceita
Data: 2026-09-08 (proposta) / 2026-09-08 (aceita pelo Felipe)
Quem decide: Felipe

## Contexto

Otto nasce como atendente de WhatsApp, mas a intenção é que faça outras funções (vendas, cobrança, agenda). Dúvida do Felipe: é bom para a marca a mesma "pessoa" fazer várias tarefas, ou isso enfraquece?

A pergunta muda de resposta dependendo de quem está olhando, e o Otto tem duas audiências (`docs/produto/visao.md`). Para o **empregador**, Otto é o funcionário que ele contratou. Para o **cliente final**, quem atende é a empresa; Otto veste o uniforme dela. A dúvida sobre "uma pessoa fazendo tudo" só existe de verdade na relação com o empregador.

## Opções consideradas

**A. Um Otto, vários cargos.** Otto é uma pessoa só. Cada função nova é um cargo que ele assume: Otto Atendente, Otto Vendedor, Otto Financeiro. O empregador "dá mais uma função" ou "promove" o Otto.

**B. Otto como agência.** Otto é a marca, e cada função é um personagem: a Lia atende, o Max vende, a Bia cobra. O empregador "contrata pela Otto".

**C. Otto só atendente.** Outras funções nascem com outras marcas.

## Análise

| Critério | A. Um Otto | B. Agência | C. Só atendente |
|---|---|---|---|
| Custo de marca | Um personagem, uma voz, um visual | Multiplica por função. Cada personagem precisa de persona, voz, teste | Um por produto, sem sinergia |
| Narrativa de venda | "Contrate o Otto. Comece pelo atendimento." Upsell é "dê mais uma função a ele" | "Contrate a equipe Otto." Upsell é contratar mais um personagem; mais gente para o empregador lembrar | Sem upsell |
| Coerência com a realidade da PME | Alta. Em empresa pequena uma pessoa faz várias coisas | Baixa. PME não contrata três pessoas para WhatsApp | Neutra |
| Risco "faz tudo, não faz nada bem" | Existe. Mitigado por vender cargo por cargo, com escopo fechado por cargo | Menor, cada personagem tem escopo | Nenhum |
| Cliente final vê conflito de papéis (mesmo atendente vende e cobra)? | Não é problema de marca: a identidade que o cliente final vê é configurada pela empresa, e pode variar por cargo se ela quiser | Idem | Idem |
| Escalabilidade de nomes | "Otto + cargo" cresce sem limite | Precisa inventar e sustentar um nome por função | n/a |

## Decisão

**Opção A**, confirmada pelo Felipe em 2026-09-08. Otto é uma pessoa só. Funções são cargos.

A pergunta que fechou: se o produto é "vários funcionários de IA" (opção B) ou um funcionário que acumula funções (opção A). Ficou A, com um argumento que não existia quando este ADR foi escrito e veio da discussão do ADR 018: **as caras dividem o mesmo número de WhatsApp.** Com a opção B, a mesma pessoa recebe mensagem da Lia numa semana e da Bia na outra, do mesmo número, e percebe que os dois são o mesmo sistema fingindo ser dois. O plural do produto vive nos **cargos**, nunca nas caras.

- Nome de cargo: "Otto" + profissão em português (Otto Atendente). Nunca personagem novo.
- O empregador vê um único Otto no painel, com uma lista de cargos ativos.
- Se uma função pedir "outra cara" para o cliente final (ex.: cobrança com nome mais institucional), isso é **estilo de atendimento por cargo**, configurado pela empresa, não um personagem da marca. Ver `docs/produto/estilos-de-atendimento.md`, "Fora da v1".
- Marketing pode usar a metáfora de carreira: "comece pelo atendimento", "dê mais uma função ao Otto", "promova o Otto". Não usar "upgrade", "plano", "módulo".

## Consequências

- Uma persona para manter (`docs/marca/persona-otto.md`), o que torna o guardião da marca viável com um documento.
- A promessa de cada cargo precisa ser fechada e pequena, para que "Otto faz várias coisas" não vire "Otto faz qualquer coisa". Todo cargo novo tem uma lista de "não faz".
- O caráter (o que não muda) é o mesmo em todo cargo. Isso vira teste automatizado.
- Reversível: se B se mostrar melhor, os cargos viram personagens sem reescrever produto. O custo da reversão é de marca, não de código.

## Evidência comportamental

| Afirmação | Tipo | Grau | O que a mata |
|---|---|---|---|
| Empregador entende "dar mais uma função ao Otto" como compra natural | Preferência | INFERIDO | Nas primeiras 10 ofertas de segundo cargo, menos de 3 aceitam ou pedem esclarecimento sobre "quem faz o quê" |
| Cliente final não estranha o mesmo atendente em funções diferentes | Ausência | NÃO VERIFICADO | Não decide esta ADR: a identidade vista pelo cliente final é configurável por cargo de qualquer forma |
| Um personagem só barateia marca e onboarding em relação a vários | Capacidade | OBSERVADO em analogia fraca (mascotes múltiplos são raros em produtos B2B; analogia estrutural não conferida) | n/a |

Nenhuma dessas afirmações sustenta código caro. A decisão é de marca e reversível.

## Gatilho de revisão

Revisar se, nas primeiras 10 contas que ativarem um segundo cargo, **3 ou mais pedirem nome ou identidade separada para o cliente final** e a configuração de estilo por cargo não resolver. Incidência, não atribuição.
