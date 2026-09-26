# 011 — Pagamento via WhatsApp com múltiplos provedores, sem intermediar dinheiro

Status: aceita (princípio e escopo) / escolhida por Claude (ordem dos provedores)
Data: 2026-09-08
Quem decide: Felipe

## Contexto

Felipe decidiu que o Otto deve facilitar o pagamento do cliente final dentro do WhatsApp (fluxo 2 de `cobranca.md`), integrando com as principais ferramentas de pagamento que o empregador já usa. Mantém-se a regra de `cobranca.md`: **o Otto não intermedia dinheiro**. A cobrança é criada na conta do empregador, no provedor dele.

Fato novo verificado em 2026-09-08: a **WhatsApp Cloud API tem pagamentos nativos para o Brasil**, via mensagem `order_details`, com cinco opções: código PIX dinâmico, link de pagamento, boleto, cartão em um clique fora do app, e template de detalhes do pedido. A Meta **não faz conciliação**; o negócio concilia pelo `reference_id` com o próprio provedor. Adquirentes anunciadas no lançamento brasileiro: Cielo, Mercado Pago e Rede.

## Decisão

1. **A cobrança sobe de camada 1.1 para v1.** Depois da camada 0 e do Google Calendar, antes do Google Sheets. Isso empurra o Sheets para v1.1.
2. **Porta `FonteDeCobranca`** no núcleo, um adaptador por provedor, mais o **adaptador manual: PIX estático**. Com a chave PIX da empresa, o Otto manda a chave, pede o comprovante e avisa o empregador. Funciona para 100% dos empregadores, sem integração e sem confirmação automática. É a camada 0 da cobrança.
3. **Entrega no chat pela mensagem `order_details` da Meta** quando disponível para a conta; senão, texto com PIX copia-e-cola e link. O `reference_id` da Meta é o mesmo id da cobrança no provedor.
4. **Conciliação é do Otto.** Webhook do provedor confirma pagamento → evento `PagamentoConfirmado` no barramento → o Otto confirma no chat e avisa o empregador. Idempotente por referência.
5. **Escrita só com confirmação.** O Otto só cria cobrança depois que o cliente final confirmou valor e item, e só com preço lido de uma fonte (ADR 006).
6. **Credenciais do empregador** (chave de API do provedor) guardadas criptografadas, por empresa, com escopo mínimo. Nunca em log.

## Ordem dos provedores (escolha de Claude, reversível)

Critério: quantas PMEs usam × API pública para criar cobrança com PIX e webhook × custo de integrar.

| Fase | Provedor | Por quê |
|---|---|---|
| v1 | **PIX estático** (manual) | Universal. Sem ele, ninguém fica de fora |
| v1 | **Mercado Pago** | API pública madura, QR PIX dinâmico, `notification_url`, base enorme de PME, e é adquirente do pagamento nativo do WhatsApp |
| v1 | **Asaas** | Adaptador já existe pelo fluxo 1 (ADR 010). Custo marginal quase zero |
| v1 | **InfinitePay** | Link e checkout com API pública e playground, muito popular em PME, recebe na hora |
| v1.1 | **PagBank** (PagSeguro) | Orders API pública com PIX, boleto e cartão |
| v1.1 | **Stone / Pagar.me** | Pagar.me é o gateway do grupo Stone, API pública |
| v1.1 | **Efí** | API PIX completa, cobrança imediata e Pix Automático |
| v2 | **Cielo, Rede, Getnet** | Adquirentes do pagamento nativo do WhatsApp, mas API de e-commerce mais burocrática. Entram quando o `order_details` com cartão fizer diferença |
| v2 | **SumUp, Cora** | API existe; base menor no alvo. Cora exige plano Pro |
| gatilho | **Ton** | Não confirmei API pública de link. Entra se 5 contas pedirem |
| gatilho | **Bancos** (Itaú, BB, Bradesco, Santander, Sicoob, Nubank PJ) | API PIX exige certificado e homologação por banco. Só com demanda medida |

Gatilho para qualquer provedor fora da v1: **5 contas distintas pedindo**, ou o provedor aparecer em mais de 20% das contas ativas (mesmo critério do ADR 006). Perguntar "como você recebe hoje?" no onboarding transforma isso em dado desde a primeira conta.

## Consequências

- `docs/produto/integracoes.md` ganha a seção de cobrança e o roadmap muda de ordem.
- O especialista em backend ganha o contrato da porta e a regra de conciliação.
- A taxa é do empregador, no provedor dele. O Otto não paga nem fica com nada. Isso mantém o Otto fora da regulação de arranjo de pagamento.
- O empregador que não tem provedor recebe sugestão de abrir conta no Asaas (adaptador já existe) ou usa PIX estático.

## Não verificado

- A notícia de que o Banco Central autorizou o "WhatsApp Pay" em janeiro de 2026 apareceu só em blog de terceiro. As fontes primárias encontradas são de 2021 e 2023. **Não tratar como fato até achar comunicado oficial.** O que está confirmado na documentação da Meta é o `order_details` com PIX dinâmico, link e boleto, que já basta para este ADR.
- Se `order_details` está habilitado para toda conta Cloud API no Brasil ou exige aprovação. Conferir no protótipo.

## Gatilho de revisão

Rever a ordem dos provedores após as 30 primeiras contas, com o dado de "como você recebe hoje?". Rever a decisão de não intermediar dinheiro só com ADR próprio.
