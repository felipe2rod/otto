# Infraestrutura

Decisões em ADR 005. Fornecedores aceitos; modelo, deploy e chave em validação (critérios no ADR). Aqui, o que isso implica para construir. Linguagem e framework não decididos.

## Componentes

| Componente | Fornecedor | Observação |
|---|---|---|
| Hospedagem da aplicação | DigitalOcean (proposta: App Platform) | Sem servidor para operar na v1. Droplets se precisar de controle |
| Banco de dados | DigitalOcean Managed Database (proposta: PostgreSQL) | Conversas, base de conhecimento, saldo, configuração de estilo |
| Inferência (IA) | DigitalOcean Gradient AI Serverless Inference | Saldo pré-pago. Modelo proposto: Claude Sonnet 5, com Haiku 4.5 para tarefas simples |
| WhatsApp | Meta WhatsApp Business Cloud API | Direto, sem BSP. Webhook de entrada, envio por API |
| Fila/agendamento | pg-boss em PostgreSQL (v1); Kafka gerenciado da DigitalOcean quando houver segundo consumidor | ADR 009. Resumo diário, retentativas, processamento do webhook fora da requisição |
| ORM | Prisma, atrás de repositório | ADR 009 |
| Empacotamento | Docker multi-stage; compose local com postgres, api e web | ADR 009 |
| Pagamento da assinatura | Asaas, via porta `ProvedorDeAssinatura` | ADR 010. Webhook idempotente, mesmo padrão do webhook da Meta |

## Fluxo de uma mensagem

1. Cliente final envia mensagem → webhook da Meta chama o Otto.
2. Otto identifica a empresa pelo número de destino, carrega estilo, base e saldo.
3. Se saldo zero: mensagem mínima ao cliente (texto do preset), aviso ao empregador, fim.
4. Monta prompt em três blocos (caráter → estilo → negócio; ver `docs/produto/estilos-de-atendimento.md`).
5. Chama inferência. Registra tokens de entrada e saída por conversa, por empresa, por preset, por modelo.
6. Responde pela Cloud API dentro da janela de 24h (custo zero de WhatsApp).
7. Debita o saldo. Se cruzou 80% ou 100% da franquia, dispara aviso.

## O que registrar desde o primeiro dia

Tudo que a métrica exibida (ADR 004) precisa para ser calibrada:
- tokens de entrada e saída por mensagem e por conversa
- empresa, segmento, preset, cargo, modelo
- latência da inferência e da resposta ponta a ponta
- se a conversa terminou em resposta, encaminhamento ou "não sei"
- perguntas do cliente final sobre o Otto ("é robô?"), para o ADR 003

## Riscos operacionais

| Risco | Efeito | Mitigação |
|---|---|---|
| Saldo pré-pago da DigitalOcean zera | Todos os Ottos param | Alerta em limiar, recarga automática, monitor externo |
| Webhook da Meta fora do ar ou lento | Cliente final sem resposta | Fila com retentativa; responder em até 10 s ou mandar acuse curto |
| Janela de 24h fecha antes da resposta | Resposta vira template pago ou não sai | Otto responde na hora; equipe humana avisada antes do fim da janela |
| Aprovação como Tech Provider da Meta demora | Onboarding manual de cada número | Começar o processo já; onboarding manual para os 10 primeiros |
| Modelo muda comportamento em atualização | Caráter quebra silenciosamente | Testes de caráter rodam a cada deploy e a cada troca de modelo |

## Primeira entrega técnica: validar o ADR 005

Antes de cliente, antes de painel. Um protótipo mínimo que:
1. Recebe webhook da Meta e responde pela Cloud API.
2. Monta o prompt em três blocos e chama Sonnet 5 na DigitalOcean.
3. Roda os testes de caráter nos 4 presets, nome padrão e trocado, e um conjunto de 50 mensagens para comparar Haiku 4.5 e Sonnet 5 em classificação e encaminhamento.
4. Registra tokens e latência de cada chamada.
5. Sobe em App Platform com banco gerenciado.

Saída: os números da tabela "Como valida" do ADR 005 preenchidos.

## Portas de contexto

O Otto lê contexto por porta, nunca por fornecedor (ADR 006). Uma porta por tipo de contexto, adaptadores por fonte, e **toda porta tem adaptador manual** para o cliente sem sistema.

```
FonteDeIdentidade  → PerfilWhatsApp, PerfilGoogle, ConfigManual
FonteDeOferta      → CatalogoWhatsApp, Bling, Nuvemshop, Planilha, ConfigManual
FonteDeAgenda      → GoogleCalendar, Trinks, Amplimed, Planilha
FonteDeCliente     → HistoricoWhatsApp, ContaAzul, CRM
FonteDePedido      → Bling, Nuvemshop
FonteDeCobranca    → MercadoPago, Asaas, InfinitePay
ProvedorDeAssinatura → Asaas   (cobrança do empregador pelo Otto, ADR 010)
```

Toda leitura registra fonte e horário. Escrita (marcar, criar pedido, cobrar) exige confirmação do cliente final e nunca acontece sem leitura prévia bem-sucedida.

## Pendências técnicas

- ~~Linguagem, framework, ORM, fila, HTTP~~ Decididos em ADR 008 e 009: NestJS + Express, Prisma, pg-boss (Kafka depois), zod, pino, Docker, Next.js, monorepo pnpm.
- App Platform × Droplets: a validar (ADR 005).
- Requisitos e prazo do Embedded Signup / Tech Provider na Meta. Não verificado.
- Testes de caráter em Sonnet 5 e Haiku 4.5: são a validação do ADR 005, ver seção acima.
