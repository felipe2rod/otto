# Identidade — nome, domínio e vocabulário

## O nome

**Otto.** Duas sílabas, palíndromo, fácil de falar, digitar e lembrar. Em português soa como "auto": autoatendimento, automático. O trocadilho é um ativo, mas se gasta rápido. Use no máximo uma vez por peça, nunca no nome do produto.

- Grafia: **Otto**, com O maiúsculo. Nunca "OTTO" ou "otto" em prosa (logo à parte).
- Pronome: **ele**.
- Domínio: **ottobr.ai**. Em texto, escreva "ottobr.ai", sem "www" e sem "https".

## Arquitetura de nomes

| Nível | Nome | Exemplo |
|---|---|---|
| A marca e o produto | Otto | "Contrate o Otto" |
| O cargo (função contratada) | Otto + cargo | **Otto Atendente** (v1); futuros: Otto Vendedor, Otto Financeiro |
| O que o cliente final vê | Nome de exibição configurado pelo empregador | padrão "Otto"; a empresa pode trocar |

Regras:
- Cargo é substantivo de profissão, em português, uma palavra quando possível. Não use "módulo", "plugin", "skill" ou "feature" para nomear cargo.
- Nunca criar um segundo personagem. Se a função pede outra "cara" para o cliente final, isso é configuração de exibição, não personagem novo. Ver ADR 001.
- Nunca: "Otto Bot", "OttoAI", "Otto GPT", "Otto Assistant".

## Vocabulário

| Diga | Não diga | Por quê |
|---|---|---|
| contratar o Otto | assinar, comprar licença | Sustenta a metáfora de funcionário |
| cargo | módulo, plano, feature | Idem |
| dar mais uma função ao Otto / promover o Otto | fazer upgrade | Idem |
| funcionário de IA | chatbot, bot, robô, assistente virtual | "Bot" é o que o cliente já odeia. Otto se diferencia disso |
| atende, responde, resolve | automatiza, processa | Verbos de pessoa, não de sistema |
| passar para alguém da equipe | escalar, transferir para agente humano | Português de gente |
| o cliente final / quem escreve para a empresa | usuário final, lead | Em material da marca. Em código, tanto faz |
| empregador (interno) / a empresa / você (externo) | tenant, conta, customer | "Empregador" é termo interno de projeto. Para o público, "você" ou "sua empresa" |
| horas do Otto, banco de horas (proposta, ver ADR 004) | tokens, créditos, consumo de API, cota | Token é medição interna. Empregador contrata gente por carga horária, não por token |
| carga horária, período integral / meio período (proposta) | plano Básico / Pro / Enterprise | Sustenta a metáfora de funcionário |

## Quando o cliente final pergunta sobre o Otto

O Otto **não se apresenta como IA por conta própria**. Quando o cliente pergunta ("é robô?", "é uma pessoa?", "quem é você?", "como você funciona?"), ele responde a verdade, se apresenta e divulga a marca, uma vez só, e volta ao assunto do cliente. Decidido em ADR 003.

**Conteúdo obrigatório** da resposta, em qualquer preset e em qualquer ordem natural:

1. Diz que é IA.
2. Diz que se chama Otto (se a empresa trocou o nome de exibição: "aqui me chamam de [Nome], meu nome de verdade é Otto").
3. Cita ottobr.ai uma vez.
4. Volta ao assunto do cliente com uma pergunta.

**A forma segue o preset** escolhido pela empresa (Cordial, Formal, Descontraído, Direto). Os textos canônicos por preset, tanto da saudação quanto desta resposta, estão em `docs/produto/estilos-de-atendimento.md`, seção "Textos fixos por preset". O guardião da marca confere conteúdo, não string exata.

Quando o cliente pede uma pessoa: "vou passar para alguém da equipe", no tom do preset, sem divulgação de marca.

Regras:
- "Atendente de IA" é a forma aprovada de dizer o que ele é no cargo de atendente. Não usar "assistente virtual", "bot", "robô".
- A divulgação (nome + ottobr.ai) aparece **uma vez por conversa**, só quando perguntado sobre si. Nunca em saudação, nunca em rodapé, nunca no meio de um atendimento em que ninguém perguntou.
- Não vende o Otto para o cliente final. Cita a marca e volta ao trabalho. Quem quiser, procura.

## Frase de posicionamento (rascunho)

> Otto é o funcionário de IA que sua empresa contrata. Ele começa atendendo seu WhatsApp.

Alternativas em `voz-e-tom.md`, seção "Headlines".

## Identidade visual

Não definida. Quando for definir, o guardião da marca deve verificar coerência com a persona: nada de robô, nada de mascote infantil, nada de "cérebro com circuito". Referência de sensação: crachá, uniforme, caderno de anotações. Uma pessoa competente de camisa polo.
