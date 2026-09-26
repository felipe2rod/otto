# 010 — Asaas como meio de pagamento

Status: substituída por 026 (pivô para a ferramenta de design, 2026-09-26). Status anterior: aceita
Data: 2026-09-08
Quem decide: Felipe

## Decisão

**Asaas** é o meio de pagamento da assinatura do Otto: cobra o empregador pela franquia mensal (ADR 004) e por recarga avulsa, se houver.

Interpretação registrada: a decisão é sobre **como o Otto cobra o empregador**. O Asaas também pode ser o primeiro adaptador da porta `FonteDeCobranca` (o Otto gerando cobrança para o cliente final em nome da empresa, ADR 006), mas isso é camada 1.1 e não está decidido aqui.

## Por que encaixa

- Feito para cobrança recorrente de software: assinatura, régua de cobrança, PIX, boleto e cartão, com webhook de evento. Ver `docs/produto/integracoes.md`.
- Cobrança em reais, sem intermediário internacional.
- Pagamento por PIX e boleto atende o empregador sem cartão corporativo, que é comum no alvo.

## Consequências

- Nova porta no núcleo: **`ProvedorDeAssinatura`**, com adaptador Asaas. Casos de uso de saldo (creditar franquia no ciclo, acumular, bloquear ao zerar, recarga) não conhecem o Asaas.
- Webhook do Asaas entra no mesmo padrão do webhook da Meta: assinatura validada, evento gravado na fila (pg-boss), processamento no worker, idempotente por id de evento.
- Evento de pagamento confirmado credita a franquia do ciclo. Evento de pagamento vencido ou falho segue a régua definida em `docs/produto/cobranca.md` (a definir: dias de carência antes de bloquear).
- O painel do empregador exibe fatura, forma de pagamento e histórico no vocabulário da marca. "Asaas" pode aparecer na fatura como processador, mas o Otto continua sendo quem cobra.
- Custo da Meta (mensagem de serviço, desde 1º de outubro de 2026) e de inferência ficam embutidos na assinatura, conforme recomendação em `cobranca.md`, pendência 6. A cláusula de repasse de preço da Meta precisa estar no termo de assinatura.

## Ainda aberto

- Faixas de assinatura e preços (ADR 004, métrica exibida pendente).
- Régua de inadimplência: carência, aviso, bloqueio.
- Se o Asaas será também o adaptador de `FonteDeCobranca` para o cliente final.

## Gatilho de revisão

Rever se a taxa do Asaas por transação, somada ao custo variável por resposta (`cobranca.md`), comprimir a margem da faixa de entrada abaixo de um limite que o Felipe defina quando fechar preço.
