# Visão de produto

## O que é

Otto é um funcionário de IA que empresas contratam. Não é uma plataforma, não é uma ferramenta, não é um chatbot. É alguém que entra na empresa para ocupar um cargo.

**Promessa ao empregador:** seu WhatsApp atendido, o tempo todo, por alguém que conhece seu negócio, responde o que sabe e passa para você o que não sabe.

## Duas pessoas, dois produtos na mesma conversa

| | Empregador | Cliente final |
|---|---|---|
| Quem é | Dono/gestor de empresa pequena ou média que vende ou agenda pelo WhatsApp | Quem manda mensagem para essa empresa |
| O que quer | Parar de perder cliente por demora e parar de responder WhatsApp às 22h | Resposta rápida e certa, e uma pessoa quando precisar |
| Paga? | Sim | Não |
| Vê a marca Otto? | Sim, o tempo todo | Quase não. Vê a empresa. Vê "Otto" só se a empresa mantiver o nome padrão |

Quem paga e quem usa são pessoas diferentes. Cada afirmação sobre "o cliente" neste projeto precisa dizer qual dos dois.

## v1 — Otto Atendente

Um cargo, um canal.

**Faz:**
- Responde mensagens de WhatsApp da empresa com base em uma base de conhecimento que o empregador alimenta (horário, endereço, preços, serviços, políticas, perguntas frequentes).
- Coleta o que a empresa precisa para atender (nome, o que a pessoa quer) sem interrogatório.
- Passa para uma pessoa da equipe quando: não sabe, o cliente pede, o assunto é sensível, ou a regra da empresa manda.
- Dá ao empregador um resumo do dia: quantos atendeu, quantos passou, o que não soube responder (isso alimenta a base).

**Contexto vem de três camadas** (ADR 006, `docs/produto/integracoes.md`): camada 0 sem integração nenhuma (histórico do WhatsApp, perfil, catálogo, Perfil da Empresa no Google, planilha), camada 1 horizontal (Google Calendar, Sheets, Bling, cobrança), camada 2 vertical depois do segmento decidido. Nenhuma funcionalidade pode exigir integração: só 47% dos pequenos negócios usam software integrativo.

**Não faz na v1:**
- Vender ativamente, cobrar, agendar em sistema externo, integrar com CRM ou ERP.
- Outros canais (Instagram, site, telefone).
- Prompt livre para o empregador (ver ADR 002).

Escopo pequeno de propósito. A tese é que "responder bem e encaminhar bem" já vale o salário.

## Hipóteses centrais (declaradas como hipóteses)

Seguindo `behavioral-evidence`. Nenhuma tem evidência coletada ainda. Nenhuma pode sustentar tela nova ou arquitetura cara até subir de grau.

| Afirmação | Tipo | Grau | O que a mata | Experimento barato |
|---|---|---|---|---|
| Empresas pequenas perdem venda por demora no WhatsApp e sabem disso | Atribuição | NÃO VERIFICADO | 10 donos entrevistados; menos de 5 conseguem citar um episódio concreto com data | Entrevista episódica: "me conta a última vez que perdeu um cliente por demora no WhatsApp" |
| O empregador alimenta a base de conhecimento na primeira semana | Taxa | NÃO VERIFICADO | Menos de metade das 20 primeiras contas passa de 10 itens na base em 7 dias | Medir no onboarding. Se falhar, o Otto tem que extrair a base do histórico de conversas em vez de pedir |
| O cliente final aceita ser atendido por IA se a resposta for rápida e certa | Preferência | NÃO VERIFICADO | Taxa de "quero falar com uma pessoa" acima de um limiar a definir nas primeiras 500 conversas | Medir incidência do pedido de humano por conversa, por preset |
| "Funcionário de IA" comunica melhor que "chatbot com IA" para o empregador | Preferência | INFERIDO | Teste A/B de landing com CTR ou conversão pior para "funcionário" | Duas landings, mesmo tráfego |

## Concorrência

Mapa completo em `docs/mercado/pesquisa-2026-09.md` (2026-09-08). O essencial:

- **O concorrente principal é a Meta.** O Meta Business Agent é IA de atendimento nativa no WhatsApp, chegou ao Brasil em fevereiro de 2026, cobra só token desde agosto e já tem mais de 1 milhão de empresas. Não dá para competir em distribuição, preço de inferência ou "tem IA".
- **O buraco da Meta é o nosso espaço:** sem memória da relação, sem caixa de entrada de equipe, sem integração com o negócio, e encaminhamento para humano que esfria.
- **"Funcionário de IA" já é usado pela Zaia** (R$ 249/mês), que acumula reclamação de instabilidade e suporte ausente.
- **A reclamação nº 1 de toda a categoria é suporte**, não tecnologia. Isso é oportunidade de produto.
- **73,2% dos consumidores preferem atendimento humano** e 63% valorizam o robô que passa para uma pessoa. O caráter do Otto é requisito de mercado, não enfeite.
- **Nunca vender o Otto como substituto de gente.** Quem fez isso lá fora colheu reação negativa.

## Perguntas que o Felipe precisa decidir

1. **Um Otto, vários cargos** — recomendação em ADR 001. Confirmar ou mudar.
2. **Caráter fixo, estilo configurável** — recomendação em ADR 002. Confirmar ou mudar.
3. ~~Revelação de IA~~ **Decidido pelo Felipe em 2026-09-08 (ADR 003):** o Otto não se apresenta como IA por conta própria. Quando perguntado sobre si, diz que é IA, que é o Otto, e cita ottobr.ai uma vez.
4. **Nome de exibição padrão.** Recomendação: "Otto", com troca livre. Motivo: exposição orgânica da marca no canal onde ela mais aparece. Hipótese não verificada: a maioria dos empregadores não vai trocar.
5. **Segmento inicial.** Princípio decidido em ADR 007: **nicho na aquisição, horizontal no produto e na marca.** Qual nicho primeiro está em validação pelo experimento 001 (`docs/mercado/experimento-001-anuncio-por-nicho.md`) mais 10 conversas de campo. Candidato: assistência técnica de bairro; reserva: barbearia sem sistema. O critério mudou com o mapa de integrações (2026-09-08): além de "onde tem dor de atendimento", vale perguntar **onde o sistema que o cliente já usa ainda não colocou uma IA em cima**. Em saúde já colocou (Amplimed tem a Amélia, que conversa com o paciente em tempo real; iClinic e Feegow têm IA e WhatsApp). Em beleza, começou. Isso favorece prestador de serviço sem sistema, comércio de bairro e agenda informal. Contra a Meta, nicho é mais defensável que genérico. A Anota AI provou o modelo no Brasil (restaurantes, mais de 50 mil estabelecimentos, comprada pelo iFood por ~R$ 60 milhões). Candidatos: clínicas e consultórios, salões e barbearias, lojas de bairro, prestadores de serviço. Escolher um para os primeiros 10 clientes.
6. **Infraestrutura.** Decidido (ADR 005): hospedagem e inferência na DigitalOcean, WhatsApp direto na Meta Cloud API. A validar, com critérios no ADR: Claude Sonnet 5 como modelo padrão, Haiku 4.5 para tarefas simples, App Platform com banco gerenciado. Pendente: linguagem/framework.
7. **Cobrança.** Decidido: assinatura com franquia em tokens, acumulável, consumida pelo uso. Pendente: métrica exibida, teto do acumulado, o que acontece quando zera, recarga avulsa, faixas. Recomendações em `docs/produto/cobranca.md`.
