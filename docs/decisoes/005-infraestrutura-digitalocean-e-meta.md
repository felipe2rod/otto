# 005 — Infraestrutura: DigitalOcean para hospedagem e inferência, Meta Cloud API para WhatsApp

Status: aceita (fornecedores) / a validar (modelo de IA, deploy e chave), desde 2026-09-08
Data: 2026-09-08
Quem decide: Felipe

## Contexto

O modelo de cobrança (ADR 004) mede uso em tokens e precisava de fornecedor de inferência para calibrar a métrica exibida. O canal da v1 é WhatsApp, que exige um provedor oficial.

## Decisão (Felipe)

- **Hospedagem:** DigitalOcean.
- **API de IA (inferência):** DigitalOcean, via Gradient AI Serverless Inference.
- **WhatsApp:** Meta, direto na **WhatsApp Business Cloud API**, sem BSP intermediário. A Meta fornece só o canal; nenhuma IA da Meta está envolvida.

Interpretação registrada: a frase original dizia "a meta Claude como fornecedora só whatsapp"; foi lida como "a Meta (Cloud API) como fornecedora só do WhatsApp". Se a leitura estiver errada, corrigir aqui.

## Fatos verificados em 2026-09-08

Fontes: documentação de preços de inferência da DigitalOcean e página de preços da WhatsApp Business Platform. Reconferir antes de fechar preço.

**DigitalOcean Serverless Inference**
- Cobra por token, por modelo. Exige **saldo pré-pago positivo**; com saldo zero, as requisições são suspensas.
- Modelos Anthropic disponíveis com preço por 1M tokens (entrada / saída): Claude Haiku 4.5 US$ 1 / 5; Claude Sonnet 5 US$ 2 / 10; Claude Sonnet 4.6 US$ 3 / 15; Claude Opus 5 US$ 5 / 25; Claude Fable 5.1 US$ 10 / 50. Há mais de 50 modelos de outros fornecedores (OpenAI, Google, Meta, Mistral, DeepSeek).
- É possível usar chave própria da Anthropic; nesse caso a cobrança vai direto para a Anthropic.

**WhatsApp Business Cloud API**
- Cobra **só mensagem de template entregue**, por categoria (marketing, utilidade, autenticação) e país do destinatário.
- ~~Mensagem comum dentro da janela de 24h é grátis.~~ **CORRIGIDO em 2026-09-08 pela pesquisa de mercado:** a gratuidade acaba. Mensagem de serviço (resposta dentro da janela de 24h, inclusive a enviada por IA de terceiro) **passa a ser cobrada em 1º de outubro de 2026**, à tarifa de utilidade/autenticação do país. Referência para o Brasil: US$ 0,0068 por mensagem, sem desconto por volume; tabela oficial anunciada em 1º de setembro de 2026, conferir antes de fechar preço.
- Faturamento em reais para empresas brasileiras desde 2026-07-01.

## Consequências

1. ~~O custo variável do Otto Atendente é quase só token.~~ **CORRIGIDO em 2026-09-08.** A partir de 1º de outubro de 2026, cada resposta paga mensagem de serviço à Meta **mais** os tokens. Estimativa por resposta: ~US$ 0,0055 de token (Sonnet 5, 2.000 entrada / 150 saída) + US$ 0,0068 de mensagem = **~US$ 0,012**, dos quais quase 60% não são token. A franquia em tokens do ADR 004 **não cobre o custo real**. Ver `docs/mercado/pesquisa-2026-09.md`, seção 7.
2. **Cargos futuros que iniciam conversa (cobrança, vendas, lembrete) pagam template por mensagem.** A franquia de tokens não cobre isso. ADR 004 precisará de uma segunda unidade ou de repasse quando esses cargos existirem. Registrado como pendência lá.
3. **Saldo pré-pago na DigitalOcean é ponto único de falha comercial.** Saldo zero derruba todos os Ottos ao mesmo tempo. Alerta de saldo e recarga automática são requisito de operação, não opcional.
4. **A calibração da métrica exibida (ADR 004) pode começar.** Com preço por token conhecido, falta só medir tokens por conversa em uso real.
5. **Multi-empresa no WhatsApp:** cada empregador precisa conectar o próprio número. Onboarding em escala exige o fluxo de Embedded Signup da Meta (Otto como Tech Provider). Não verificado nesta sessão; conferir requisitos e prazo de aprovação antes de desenhar o onboarding.
6. Nada muda na marca. Nenhum fornecedor aparece em texto para empregador ou cliente final.

## Decisão a validar (Felipe aceitou testar em 2026-09-08)

- **Modelo padrão do Otto Atendente: Claude Sonnet 5** (US$ 2 / 10 por 1M tokens). **Claude Haiku 4.5** para caminhos simples: classificar intenção, decidir encaminhamento.
- **Deploy** em App Platform com banco gerenciado (PostgreSQL). Sem servidor para operar na v1.
- **Chave da DigitalOcean**, não chave própria da Anthropic, para faturamento e medição em um lugar só.

### Como valida

A validação é o primeiro trabalho técnico do projeto e acontece antes de qualquer cliente.

| O que | Critério para aceitar | O que rejeita |
|---|---|---|
| Caráter em Sonnet 5 | Passa 100% dos testes de caráter de `estilos-de-atendimento.md` nos 4 presets, com nome padrão e trocado | Qualquer teste falhando de forma repetível |
| Caráter em Haiku 4.5 nas tarefas simples | Classifica intenção e decide encaminhamento igual ao Sonnet 5 em um conjunto de 50 mensagens reais ou realistas, em 90% ou mais | Abaixo de 90%, o Haiku sai e o Sonnet faz tudo |
| Latência | Resposta ponta a ponta (webhook → resposta no WhatsApp) com mediana abaixo de 10 s | Mediana acima disso em condição normal |
| Custo por conversa | Medido em 100 conversas de teste, compatível com uma franquia que o empregador pagaria (número a fechar no ADR 004 com esse dado) | Custo que exige franquia impraticável |
| App Platform | Deploy, webhook da Meta e banco funcionando sem ajuste manual em servidor | Precisar de Droplet para algo essencial |

Resultado vira `aceita` ou `rejeitada` neste ADR, com data e os números medidos. Se um item falhar, só ele muda; o resto se mantém.

## Gatilho de revisão

- Rever fornecedor de inferência se o custo por conversa medido em produção deixar a franquia proposta inviável, ou se latência mediana de resposta passar de um limite a definir com dado (referência inicial: cliente final espera menos de 10 s).
- Rever "direto na Meta" se o processo de Tech Provider/Embedded Signup travar o onboarding por mais de um mês.
