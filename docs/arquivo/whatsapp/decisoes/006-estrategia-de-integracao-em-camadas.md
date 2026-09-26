# 006 — Estratégia de integração em camadas, com portas de contexto

Status: substituída por 026 (pivô para a ferramenta de design, 2026-09-26). Status anterior: proposta (Claude, aguardando Felipe)
Data: 2026-09-08
Quem decide: Felipe

## Contexto

A pesquisa de mercado (ADR anterior e `docs/mercado/pesquisa-2026-09.md`) mostrou que a fraqueza do Meta Business Agent é justamente falta de integração e de memória. Integração é o wedge do Otto. Mas o mapa de ferramentas (`docs/produto/integracoes.md`) revelou dois fatos que impedem a resposta óbvia de "integrar com tudo":

1. Segundo o Sebrae (TIC 2025), só **47% dos pequenos negócios usam software integrativo**. Mais da metade do mercado-alvo roda em WhatsApp, planilha e caderno.
2. O mercado de ferramentas é fragmentado: quatro ERPs relevantes, cinco plataformas de e-commerce, dezenas de sistemas verticais por nicho. Integrar com todos é impossível para uma empresa nova.

## Opções consideradas

**A. Integrar com os líderes de cada categoria antes de lançar.** Cobertura ampla desde o dia 1.
**B. Não integrar na v1.** Base de conhecimento manual e pronto.
**C. Três camadas, com portas de contexto.** Camada 0 sem integração para todo mundo, camada 1 horizontal, camada 2 vertical depois do segmento decidido.

## Decisão proposta

**Opção C.**

1. **Contexto antes de ferramenta.** Seis tipos de contexto (identidade, oferta, disponibilidade, cliente, status, cobrança) organizam o trabalho. Ferramentas são fontes, não requisitos.
2. **Camada 0 é requisito de v1 e não integra com nada:** histórico do próprio WhatsApp, perfil do WhatsApp Business, catálogo da Meta, Perfil da Empresa no Google, upload de planilha e conversa de configuração. **Nenhuma funcionalidade do Otto pode exigir integração.**
3. **Camada 1, horizontal, nesta ordem:** Google Calendar, Google Sheets, Bling. Depois um meio de cobrança.
4. **Camada 2, vertical, só depois de o segmento estar decidido.**
5. **Portas de contexto na arquitetura.** Uma porta por tipo de contexto, adaptadores por fornecedor, e **toda porta tem um adaptador manual**. O prompt de negócio consome porta, nunca fornecedor.
6. **Leitura livre, escrita confirmada.** O Otto só afirma o que leu de uma fonte e só grava depois de confirmar com o cliente final.

## Consequências

- O Otto atende 100% do mercado-alvo desde a v1, e integra para melhorar, não para funcionar.
- A camada 0 vira a aposta de ativação mais importante: ler o histórico do WhatsApp e entregar a base de conhecimento **pré-preenchida** substitui o formulário que a hipótese de `visao.md` considera frágil.
- Ler histórico de conversa exige consentimento explícito do empregador, com peso de LGPD. Vira requisito de onboarding, não letra miúda.
- Trocar de fornecedor não muda o comportamento do Otto, o que protege contra mudança de API e contra fim de parceria.
- Dado lido ao vivo não envelhece. Isso ataca diretamente a "deriva de conteúdo", queixa recorrente da categoria.

## Efeito sobre a escolha de segmento

Achado que muda o critério: **em saúde, o sistema de gestão já traz IA de atendimento embutida.** A Amplimed (R$ 89/mês) tem a Amélia Agendamento, IA integrada à agenda que conversa com o paciente em tempo real; o iClinic tem lembrete por WhatsApp e IA própria; o Feegow tem integração com WhatsApp e IA própria. Em beleza, BarberCode e Belasis já mandam WhatsApp.

O critério de segmento passa a incluir: **onde o sistema que o cliente já usa ainda não colocou uma IA em cima.** Isso desfavorece clínicas como primeiro nicho, apesar de serem candidato óbvio.

## Gatilho de revisão

- Construir integração nova quando **5 ou mais contas distintas** pedirem a mesma ferramenta, ou quando ela aparecer em mais de **20% das contas ativas**. Perguntar "que sistema você usa hoje?" no onboarding transforma isso em dado desde a primeira conta.
- Rever a premissa da camada 0 se, nas primeiras 30 contas, a maioria já tiver ERP ou sistema vertical. Aí a camada 1 sobe de prioridade.
