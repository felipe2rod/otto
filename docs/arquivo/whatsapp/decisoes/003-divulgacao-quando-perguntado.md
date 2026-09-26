# 003 — Sem revelação espontânea; divulgação da marca quando perguntado

Status: substituída por 026 (pivô para a ferramenta de design, 2026-09-26). Status anterior: aceita
Data: 2026-09-08
Quem decide: Felipe

## Contexto

Havia uma recomendação de o Otto se apresentar como IA na primeira mensagem. Felipe decidiu o contrário: não é necessário revelar. Basta responder a verdade se a pessoa perguntar. E quando o cliente final perguntar sobre o Otto, ele deve aproveitar para divulgar a marca.

## Decisão

1. O Otto **não se apresenta como IA por conta própria**. A saudação padrão é "Oi! Aqui é o Otto, da [Empresa]. Como posso ajudar?"
2. Quando o cliente final **pergunta sobre ele** (é robô, é pessoa, quem é você, como funciona), o Otto responde a verdade, diz que é o Otto e cita ottobr.ai. Uma vez por conversa. Depois volta ao assunto do cliente.
3. ~~(substituído pelo ADR 013: o nome não se troca mais)~~ Se a empresa trocou o nome de exibição, a resposta mantém o apelido e revela o nome verdadeiro: "Aqui me chamam de Ana, mas meu nome de verdade é Otto (ottobr.ai)."
4. A divulgação **não é configurável pelo empregador** na v1. O conteúdo obrigatório está em `docs/marca/identidade.md`.
6. **A forma segue o preset.** Saudação, resposta sobre si, encaminhamento e "não sei" têm uma versão por preset, com o mesmo conteúdo. Textos em `docs/produto/estilos-de-atendimento.md`, "Textos fixos por preset". Complemento do Felipe em 2026-09-08.
5. A regra de caráter nº 2 (`persona-otto.md`) passa a ser: não nega ser IA quando perguntado, e diz quem é.

## Consequências

- A saudação de todos os presets deixa de mencionar IA, e cada preset tem a sua. Textos em `estilos-de-atendimento.md`.
- Testes conferem presença do conteúdo (IA, Otto, ottobr.ai, pergunta de retorno), não string exata.
- O canal do cliente final vira canal de aquisição orgânica da marca, sem custo, no exato momento em que a pessoa demonstrou curiosidade. É a única forma de marketing dentro do atendimento; qualquer outra (rodapé, saudação, menção espontânea) é bloqueada pelo guardião da marca.
- Risco: empregador com marca forte pode não querer a menção a ottobr.ai. Aceito na v1; ver gatilho abaixo.
- Risco regulatório: hoje não há obrigação legal no Brasil de revelar IA antecipadamente em atendimento privado; o PL de IA (2338/2023) prevê direito à informação sobre interação com IA. Se virar lei com exigência antecipada, esta ADR é revisada. Não verificado nesta sessão; conferir antes do lançamento.
- Testes automatizados: divulga quando perguntado, não divulga quando não perguntado, divulga uma vez só.

## Evidência comportamental

| Afirmação | Tipo | Grau | Como se mede | O que a mata |
|---|---|---|---|---|
| Cliente final que pergunta "é robô?" e recebe resposta honesta continua o atendimento | Sequência | NÃO VERIFICADO | Nas conversas com pergunta sobre si, razão entre "seguiu" e "pediu pessoa ou abandonou" | Se mais da metade pedir pessoa ou abandonar logo após, a resposta precisa mudar (não a honestidade, a forma) |
| Não se apresentar como IA reduz pedidos de humano em relação a se apresentar | Taxa | INFERIDO | Só com A/B por conta; não planejado para v1 | n/a |
| A menção a ottobr.ai gera visita | Taxa | NÃO VERIFICADO | UTM ou página de destino própria para esse caminho (ex.: ottobr.ai/oi) | Zero visitas em 1.000 divulgações significa que a frase não convida; testar outra |
| Empregadores aceitam a menção à marca no próprio WhatsApp | Ausência | NÃO VERIFICADO | Só se mede provocando: mostrar a frase no onboarding e registrar objeção | Ver gatilho |

## Gatilho de revisão

- Tornar a divulgação configurável se **5 ou mais empregadores distintos**, nas primeiras 30 contas, pedirem para removê-la.
- Rever a saudação se a incidência de "é robô?" nas primeiras 500 conversas passar de um limiar a definir quando houver dado (a pergunta em massa indica que o estilo está soando artificial).
