# Cobrança

Modelo decidido pelo Felipe em 2026-09-08 (ADR 004). Métrica exibida ainda aberta. Infraestrutura decidida em ADR 005: inferência na DigitalOcean (preço por token conhecido), WhatsApp direto na Meta.

## O modelo

- **Meio de pagamento: Asaas** (ADR 010). Assinatura recorrente com PIX, boleto e cartão; webhook de pagamento credita a franquia do ciclo.
- **Assinatura mensal** dá ao empregador uma **franquia de uso**, medida internamente em **tokens**.
- A franquia é **acumulativa**: o que não foi usado no mês passa para o seguinte.
- O saldo **se gasta conforme o uso da IA** (cada resposta do Otto consome).
- Como o saldo se converte em algo que o empregador entende (a **métrica exibida**) não está decidido, porque depende da infraestrutura escolhida (modelo, custo por token, overhead de contexto).

## O que é interno e o que é externo

| | Interno (medição) | Externo (o que o empregador vê) |
|---|---|---|
| Unidade | token | a definir. Nunca "token" |
| Onde aparece | banco, logs, painel de admin da ottobr.ai | site, painel do empregador, e-mail de aviso |
| Quem decide | infraestrutura | marca + produto |

**Regra de marca:** a palavra "token" não aparece para o empregador. Dono de loja não sabe o que é token, não consegue prever quantos gasta e não confia em unidade que não entende. Token é como a folha de pagamento calcula; não é como se contrata alguém.

## Candidatas a métrica exibida

Todas são conversões de token com fator calibrado. A escolha é de comunicação, não de contabilidade.

| Unidade | A favor | Contra | Encaixe com "funcionário" |
|---|---|---|---|
| **Horas do Otto** | Fala a língua de quem contrata gente. Acumular vira **"banco de horas"**, conceito que todo empregador brasileiro conhece e que já embute a ideia de saldo que passa de um mês para o outro | "Hora" não é hora de relógio: é um pacote de tokens. Precisa de definição pública e honesta ("1 hora do Otto ≈ N mensagens típicas") ou fere o caráter (não inventa) | Alto |
| **Atendimentos** | Concreto e ligado ao valor | Conversa longa e curta custam diferente; ou a empresa subsidia, ou a unidade mente | Médio |
| **Mensagens** | Simples de contar | Token por mensagem varia muito com a base de conhecimento; prever fica difícil | Baixo |
| **Créditos** | Genérico, seguro, fácil de implementar | Zero personalidade. É o que todo SaaS faz. Não sustenta a metáfora | Baixo |

**Recomendação (proposta, não decidida):** horas do Otto, com banco de horas para o acumulado, e uma definição pública do que é uma hora, exibida no painel junto com o consumo real ("esta semana o Otto trabalhou 3h20 e atendeu 41 pessoas"). Isso mantém a metáfora, comunica o rollover sem explicar rollover, e passa no caráter porque a conversão é declarada.

Fica aberto até haver medição real de tokens por conversa. O preço por token já é conhecido (ADR 005); falta o volume. Definir o fator antes de medir é inventar número.

**Base de custo verificada em 2026-09-08 (reconferir antes de fechar preço):** Claude Sonnet 5 na DigitalOcean custa US$ 2 por 1M tokens de entrada e US$ 10 por 1M de saída; Haiku 4.5, US$ 1 / 5.

**Atenção, mudança de regra da Meta.** A resposta dentro da janela de 24h era grátis e **passa a ser cobrada em 1º de outubro de 2026**, como mensagem de serviço, à tarifa de utilidade do país (referência Brasil: US$ 0,0068 por mensagem). Estimativa de custo por resposta do Otto: ~US$ 0,012, sendo ~US$ 0,0055 de token e US$ 0,0068 de Meta. **Quase 60% do custo variável não é token.** Fonte e conta em `docs/mercado/pesquisa-2026-09.md`, seção 7.

## Decisões pendentes que o modelo cria

1. **Teto do acumulado.** Sem teto, uma conta que fica meses sem usar vira passivo. Sugestão: acumula até um múltiplo da franquia mensal (o banco de horas da CLT também tem prazo para compensar; a metáfora ajuda). O múltiplo é decisão de Felipe.
2. **O que acontece quando o saldo zera.** O Otto não pode simplesmente sumir do WhatsApp: cliente final mandando mensagem para o vazio é o pior cenário para a empresa e para a marca. Opções: (a) recarga automática opcional, (b) o Otto responde uma mensagem mínima ("a equipe te responde em breve") e o empregador é avisado, (c) as duas. Recomendação: (c), com aviso ao empregador em 80% e em 100%.
3. **Recarga avulsa** fora da assinatura: sim ou não, e a que preço em relação à franquia.
4. **Múltiplos cargos** e a franquia: um saldo só para o Otto inteiro (coerente com "uma pessoa só", ADR 001) ou um por cargo. Recomendação: um saldo só. Uma pessoa, um banco de horas.
5. **Faixas de assinatura.** Quantas, e nomeadas como? Sugestão coerente com a marca: por carga horária ("meio período", "período integral"), não "Básico / Pro / Enterprise". A definir junto com a métrica.
6. **A franquia medida só em token não cobre o custo real, a partir de 1º de outubro de 2026.** Cada resposta paga mensagem de serviço à Meta. Decidir: (a) a franquia passa a medir "atendimento" incluindo os dois custos, (b) o custo de WhatsApp entra embutido na faixa da assinatura, ou (c) repasse separado. Recomendação: (b) para a v1, porque o empregador não deve ver duas contas, e a métrica exibida ("horas do Otto") já abstrai os dois. **Isto é decisão nova, criada pela pesquisa de mercado; precisa entrar no ADR 004.**
7. **Cargos que iniciam conversa** (cobrança, vendas, lembretes) pagam template da Meta, mais caro que mensagem de serviço, fora da janela de 24h. Quando esses cargos existirem, decidir preço separado. Não é problema da v1.
8. **Régua de inadimplência.** Pagamento vencido no Asaas: quantos dias de carência antes de avisar, quantos antes de bloquear, e o que o Otto responde ao cliente final enquanto bloqueado (mesma mensagem mínima do saldo zero). A decidir.
9. **Cláusula de repasse.** A Meta mudou o preço duas vezes em 15 meses (julho de 2025 e outubro de 2026). O contrato com o empregador não pode fixar preço sem previsão de repasse.

## Como isso aparece na marca

- Site e painel falam de **carga horária**, **banco de horas**, **o que o Otto fez com as horas**. Nunca token, nunca crédito, nunca "consumo de API".
- Aviso de saldo é mensagem de gente: "O Otto já usou 80% das horas deste mês. Faltam cerca de 6 horas, o que dá uns 3 dias no ritmo atual." Sem barra de progresso sem número.
- Na frase de posicionamento e headlines, evitar prometer preço fixo ("um cargo, um preço" foi retirado de `voz-e-tom.md`).

## O que medir desde o primeiro cliente

- Tokens por conversa e por mensagem, por segmento e por preset. É isto que calibra o fator da métrica exibida.
- Percentual da franquia usado por mês, por conta. Diz se as faixas estão certas.
- Quantas contas chegam a 80% e a 100%. Diz se o teto e a recarga importam.
- Quantas contas acumulam mais de um mês de franquia sem usar. Diz se o rollover está gerando passivo ou fidelidade.

## Hipóteses (declaradas)

| Afirmação | Tipo | Grau | O que a mata |
|---|---|---|---|
| Empregador entende "banco de horas do Otto" sem explicação | Capacidade | NÃO VERIFICADO | 2 de 5 pessoas pedirem explicação ao ver a tela de saldo |
| Empregador prefere franquia acumulável a franquia que zera | Preferência | INFERIDO (direção conhecida: perda percebida ao zerar; magnitude local) | Não decide nada caro: acumular é decisão de negócio já tomada |
| Unidade abstrata ("hora do Otto") gera menos contestação de fatura que "tokens" | Ausência | NÃO VERIFICADO | Só se mede provocando: mostrar as duas versões de fatura a 5 empregadores e registrar perguntas |
| Consumo por conversa é estável o bastante para o fator "hora" não parecer mentira | Taxa | NÃO VERIFICADO | Variância de tokens por conversa acima de um limiar a definir com dado real |
