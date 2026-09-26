# 011 — Indicação de um nível e parceiros com carteira; marketing multinível descartado

Status: aceita
Data: 2026-09-08
Quem decide: Felipe

## Contexto

Felipe perguntou ao estrategista de mercado se marketing multinível (MMN) cabia como canal de aquisição do Otto. O parecer foi contra, com três motivos:

1. **Economia unitária.** Vários níveis de comissão sobre uma assinatura de referência de R$ 249, com custo variável de ~US$ 0,012 por resposta (token + mensagem de serviço da Meta a partir de 1º de outubro de 2026), saem da margem ou do preço. Subir preço para bancar rede é entregar o argumento à Meta, que oferece o Business Agent grátis.
2. **Marca.** O Otto compete em confiança e suporte. MMN no Brasil carrega associação com pirâmide; a distinção legal existe (renda vem de venda, não de recrutamento), mas o dono de assistência técnica não a faz. "Funcionário de IA" já está sendo desgastado pela Zaia; somar vocabulário de rede dobra o cético.
3. **Comprador errado.** MMN funciona quando vendedor e consumidor são a mesma pessoa e a compra é frequente. Aqui o comprador é dono de PME, contrata uma vez e fica. Não há recompra que sustente rede.

O ADR 007 já previa, como gatilho de revisão, o surgimento de **canal horizontal com clientes na mão** (contador com carteira, revendedor de maquininha, franquia). Esta decisão dá forma a esse canal.

## Opções consideradas

| Opção | Resultado |
|---|---|
| Marketing multinível (comissão em vários níveis, recrutamento de distribuidores) | **Descartada** pelos três motivos acima |
| Programa de afiliados aberto (link público, qualquer pessoa, comissão em dinheiro) | Descartada. Atrai quem não conhece o comprador e gera cliente errado; a marca vira anúncio de afiliado |
| Indicação entre clientes, recompensa em um mês do Otto, um nível | **Aceita** |
| Programa de parceiros com carteira, comissão recorrente, um nível | **Aceita** |

## Decisão

Dois mecanismos, ambos de **um nível só**. Ninguém ganha sobre quem outra pessoa trouxe. Não existe kit de entrada, taxa de adesão, "distribuidor" nem "rede".

### 1. Indicação entre clientes

Empregador indica outro empregador. A recompensa é em **um mês do Otto**, nunca em dinheiro.

| Regra | Definição |
|---|---|
| Quem pode indicar | Conta com assinatura ativa e pelo menos um ciclo pago |
| Como | Código ou link de indicação no painel do empregador. O indicado informa no cadastro. Só vale se informado antes do primeiro pagamento |
| Quem entrou recebe | Um mês de franquia da própria faixa, creditado na franquia quando o primeiro pagamento é confirmado. Paga um mês, começa com dois |
| Quem indicou recebe | Um mês de franquia da própria faixa, creditado na franquia quando o **segundo** pagamento do indicado é confirmado. A recompensa está amarrada a cliente que ficou, não a cadastro |
| Limite | Até 12 indicações premiadas por conta por ano. Sem limite de indicações não premiadas |
| Acumulado | Os atendimentos ganhos por indicação entram na franquia como qualquer outro e acumulam sem teto (decidido em 2026-09-08, ADR 004) |
| O que não é | Não vira dinheiro, não é sacável, não é transferível, não abate fatura |
| Onde aparece | Só no painel do empregador e em e-mail para o empregador. O Otto **não** oferece indicação ao cliente final no WhatsApp (ADR 003: ele não vende o Otto para quem escreve para a empresa) |

### 2. Parceiros com carteira

Pessoa jurídica que já atende donos de PME do nicho e pode indicar o Otto com credibilidade: **contador, revendedor de maquininha, assistência técnica autorizada, agência local**. Não é revenda: o contrato é entre o empregador e o Otto, a cobrança é direta pelo Asaas (ADR 010), o suporte é do Otto.

| Regra | Definição |
|---|---|
| Quem pode ser | PJ ou MEI, com nota fiscal. Cadastro aprovado manualmente pelo Felipe na v1 |
| Comissão | **20% de cada mensalidade paga** pelo cliente indicado, enquanto ele pagar. Recarga avulsa e ajuste de faixa para cima entram na base; taxa do Asaas não é descontada da base |
| Clawback | Se o cliente cancelar ou ficar inadimplente nos **primeiros 90 dias**, a comissão já paga sobre ele é descontada do próximo repasse |
| Repasse | Mensal, via PIX, contra nota fiscal, com mínimo de R$ 100 (abaixo disso acumula para o mês seguinte) |
| Atribuição | Código de parceiro informado no cadastro do empregador, antes do primeiro pagamento. Um cliente tem no máximo um parceiro ou um indicador, nunca os dois |
| Papel do parceiro | Indicar e, se quiser, ajudar o empregador a montar a base de conhecimento. Não fatura, não dá suporte em nome do Otto, não define preço |
| Exclusividade | Nenhuma, para nenhum dos lados |
| Um nível | Parceiro não cadastra parceiro e não ganha sobre parceiro |
| Ferramenta na v1 | Planilha com código de parceiro, clientes atribuídos e comissão do mês. Painel de parceiro só quando houver 10 parceiros ativos |

### 3. Marketing multinível

Descartado. Não entra em roadmap, pesquisa de preço nem material de marca.

## Consequências

- **Cobrança (`cobranca.md`).** Nova fonte de crédito na franquia (indicação) e novo custo de aquisição recorrente (comissão de parceiro). A comissão de 20% precisa entrar na conta de margem da faixa de entrada antes de fechar preço, junto com Asaas e custo variável. Ganha uma seção e uma pendência.
- **Backend (ADR 008, 009).** Código de indicação e código de parceiro na conta do empregador. O evento de pagamento confirmado (webhook do Asaas) dispara: crédito de horas do indicado no primeiro pagamento, crédito do indicador no segundo, cálculo de comissão do parceiro em todo pagamento. Cancelamento ou inadimplência em até 90 dias marca clawback. Casos de uso no núcleo; Asaas e planilha ficam na borda.
- **Painel do empregador.** Tela de indicação com código, link, quem entrou e quantos atendimentos você recebeu. Texto no vocabulário da marca.
- **Marca (`identidade.md`).** Vocabulário ganha duas linhas: "indicar" e "parceiro". Nunca "afiliado", "revendedor", "distribuidor", "rede", "downline".
- **Aquisição (ADR 007).** O programa de parceiros é o canal horizontal que o gatilho de revisão do ADR 007 previa. Ele não substitui o nicho: parceiro com carteira do nicho candidato vem primeiro.
- **Experimento 001 e conversas de campo.** Nova pergunta: "quem te indicou o último sistema que você contratou?". Se a resposta recorrente for "contador" ou "vendedor da maquininha", o canal está confirmado.
- **Jurídico.** Parceiro é PJ, sem vínculo, sem exclusividade, comissão sobre venda e nunca sobre recrutamento. Termo de parceria simples antes do primeiro repasse. A recompensa de indicação é um mês da própria franquia, não é dinheiro e não caracteriza intermediação.

## Evidência comportamental (fichas)

| Afirmação | Tipo | Grau | Comparável | O que a mata |
|---|---|---|---|---|
| Dono de PME indica um vizinho de rua quando gosta, não recruta dez | Taxa | INFERIDO | Programas de indicação de SaaS B2B para PME, que rendem indicação esparsa e de alta conversão, não volume | Se em 6 meses mais de 3 contas fizerem 10 ou mais indicações premiadas, o comportamento é de revendedor e a regra precisa mudar |
| Recompensa em um mês do Otto motiva tanto quanto desconto em dinheiro | Preferência | NÃO VERIFICADO | Nenhum comparável direto; crédito de serviço é comum em SaaS, mas com métrica genérica | Se menos de 1 em 10 contas ativas gerar pelo menos uma indicação em 6 meses |
| Contador e revendedor de maquininha aceitam indicar por 20% recorrente | Capacidade | INFERIDO | Programas de parceiros para contadores de Conta Azul e Omie (analogia estrutural: mesmo comprador, mesmo intermediário, ticket parecido) | Se, em 10 contatos com contadores do nicho, menos de 3 aceitarem indicar |
| Cliente trazido por parceiro fica mais que cliente de anúncio | Taxa | NÃO VERIFICADO | Padrão relatado em SaaS B2B, não medido aqui | Se o clawback disparar em mais de 30% das contas de parceiro |

## Gatilho de revisão

- **Indicação:** rever ou retirar se, com 50 ou mais contas ativas, menos de 1 em 10 novas contas por semestre vier de indicação.
- **Parceiros:** rever comissão ou perfil de parceiro se o clawback disparar em mais de 30% das contas de parceiro em um semestre. Construir painel de parceiro ao atingir 10 parceiros ativos.
- **Abuso:** endurecer regra de indicação se 3 ou mais contas forem criadas sem uso nos primeiros 30 dias e com indicação atribuída.
- **MMN:** só volta à discussão se as conversas de campo mostrarem donos do nicho vendendo serviços recorrentes entre si com comissão. O estrategista considera improvável.
- **Margem:** rever a comissão de 20% se, ao fechar preço, comissão + Asaas + custo variável comprimir a margem da faixa de entrada abaixo do limite que o Felipe definir (ver ADR 010).

## Nota de 2026-09-08

"Horas do Otto" caiu como métrica exibida (ADR 004). A recompensa não muda: continua sendo **um mês da própria franquia**, que é o que ela sempre foi literalmente. Só o nome muda — "um mês do Otto", nunca "horas".
