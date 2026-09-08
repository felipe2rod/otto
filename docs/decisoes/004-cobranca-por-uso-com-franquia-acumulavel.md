# 004 — Cobrança por uso, com assinatura e franquia acumulável

Status: aceita (modelo) / proposta (métrica exibida)
Data: 2026-09-08
Quem decide: Felipe

## Contexto

Precisa existir um modelo de cobrança coerente com a marca de "funcionário contratado" e com o custo variável real (o Otto gasta tokens de modelo a cada resposta).

## Decisão (Felipe)

- Assinatura mensal com franquia de uso.
- Medição interna em **tokens**.
- Franquia **acumulativa** entre meses.
- Saldo consumido conforme uso da IA.
- **Métrica exibida ao empregador: não decidida.** Depende da infraestrutura. Fica aberta.

## Proposta complementar (Claude, aguardando Felipe)

- Nunca expor "token" ao empregador.
- Métrica exibida candidata: **horas do Otto**, acumulado como **banco de horas**, com fator de conversão público e consumo real ao lado.
- Um saldo só por conta, independente do número de cargos (coerente com ADR 001).
- Teto para o acumulado e comportamento definido quando o saldo zera (o Otto não pode sumir do WhatsApp em silêncio).
- Faixas de assinatura nomeadas por carga horária, não por "Básico/Pro".

Detalhes, alternativas e hipóteses em `docs/produto/cobranca.md`.

## Consequências

- Retirado de `voz-e-tom.md` o exemplo "um cargo, um preço", que prometia preço fixo.
- A calibração do fator de conversão é trabalho de infraestrutura e só começa com modelo escolhido. Não inventar o número antes.
- O painel do empregador precisa mostrar saldo em linguagem de gente e avisar em 80% e 100%.

## Gatilho de revisão

- Rever a métrica exibida se, nas primeiras 30 contas, **5 ou mais** contestarem fatura ou perguntarem "o que é uma hora do Otto" no suporte.
- Rever o rollover se mais de metade das contas acumular acima do teto proposto, ou se o passivo acumulado passar de um limite financeiro que Felipe defina.
