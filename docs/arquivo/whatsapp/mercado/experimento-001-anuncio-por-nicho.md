# Experimento 001 — anúncio genérico × anúncio por nicho

Status: desenhado, **adiado** (Felipe, 2026-09-08: "não é hora pra isso, nem temos site ainda"). Roda quando houver site e um Otto para receber quem clicar. As 10 conversas de campo não dependem de site e podem acontecer antes
Data do desenho: 2026-09-08
Decisão que sustenta: ADR 007, qual nicho primeiro

**Regra deste documento:** os critérios de decisão são escritos antes de rodar e não mudam depois. Se o resultado for ambíguo, o experimento é refeito com amostra maior, não reinterpretado.

## Pergunta

Anúncio direcionado a um nicho gera lead melhor e mais barato do que anúncio genérico de "IA para WhatsApp"?

## Desenho

Três anúncios, mesma verba, mesmo período, mesma plataforma, mesma chamada para ação (conversa no WhatsApp com o próprio Otto, ou formulário curto se o Otto ainda não existir).

| Braço | Mensagem (rascunho, passa pelo guardião da marca antes) | Público |
|---|---|---|
| **A. Genérico** | "O Otto atende seu WhatsApp. Você cuida do resto." | Dono de pequeno negócio, sem segmento |
| **B. Assistência técnica** | "O Otto atende sua assistência técnica enquanto você conserta." | Dono de assistência técnica (celular, informática, eletro, ar-condicionado) |
| **C. Barbearia** | "O Otto marca horário enquanto você corta." | Dono de barbearia ou salão |

Verba e plataforma: decisão do Felipe. Recomendação: Meta Ads, porque o público já está no WhatsApp e o formato "clique para WhatsApp" abre a janela de 72 horas grátis (ver ADR 005).

## O que medir

Por braço, em números absolutos primeiro e percentual depois. Base pequena engole percentual.

| Métrica | Como |
|---|---|
| Custo por clique | Plataforma |
| Custo por conversa iniciada | Plataforma ou contagem manual |
| **Leads que citam episódio concreto e datado** de cliente perdido por demora no WhatsApp | Pergunta na primeira resposta: "Me conta a última vez que você perdeu um cliente por não conseguir responder a tempo." Conta como sim só se houver data ou período e sequência |
| Leads que já usam alguma IA de atendimento (Meta Business Agent, Zaia, outra) | Pergunta direta |
| O que gerenciam hoje em caderno ou planilha | Pergunta aberta; agrupar respostas depois |

## Critérios de decisão, pré-registrados

- **Nicho confirmado (B ou C):** o braço de nicho entrega custo por conversa iniciada **igual ou menor** que o genérico **e** pelo menos **5 leads** com episódio datado. Escolhe-se o nicho com mais episódios datados.
- **Genérico reabre a discussão:** o braço A entrega custo por conversa iniciada menor que ambos os nichos **e** pelo menos 5 leads com episódio datado. Aí o estrategista registrou que estaria errado sobre nicho na aquisição.
- **Inconclusivo:** nenhum braço chega a 5 episódios datados. Repetir com verba maior ou período maior. Não decidir.

## Limites declarados

- Com verba pequena, n é pequeno. O experimento é **direcional**, e por isso o critério está em número absoluto de episódios, não em taxa.
- Mede quem clica em anúncio, não o mercado. Complemento obrigatório: **10 conversas de campo** com donos do nicho candidato, com as perguntas da seção 10 de `pesquisa-2026-09.md` mais "o que você gerencia hoje em caderno ou planilha?" e "quem te indicou o último sistema que você contratou?" (esta última valida o canal de parceiros do ADR 011: se a resposta recorrente for contador ou vendedor de maquininha, o canal está achado).
- Quem responde anúncio de "IA para WhatsApp" pode ser o comprador de software que já comparou, não o dono com a mão ocupada. Hipótese do estrategista; o campo verifica.

## Registro do resultado

Preencher aqui quando rodar: datas, verba, plataforma, tabela por braço, decisão tomada, e o ADR atualizado.
