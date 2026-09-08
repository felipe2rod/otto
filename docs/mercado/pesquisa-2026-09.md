# Pesquisa de mercado — setembro de 2026

Levantamento feito em 2026-09-08 por pesquisa aberta (desk research). Fontes ao final.

**Aviso de método.** Isto é pesquisa de escritório, não pesquisa de campo. Segundo `behavioral-evidence`, quase tudo aqui é grau **COMPARÁVEL** (número de terceiro, analogia estrutural declarada) ou **RELATADO** (reclamação pública). Reclamação pública é amostra enviesada por construção: quem escreve no Reclame Aqui é quem está com raiva, não a média. Serve para achar **padrão de falha**, não para medir satisfação. Nenhum número daqui sustenta escopo caro sozinho. O que falta é conversa com dono de empresa, e isso a pesquisa não substitui.

---

## 1. Resumo executivo

Cinco coisas mudam o plano do Otto.

1. **A Meta virou concorrente direto.** O Meta Business Agent, IA de atendimento nativa dentro do WhatsApp, chegou ao Brasil em fevereiro de 2026, foi de graça até julho e começou a ser cobrado em 1º de agosto de 2026, por token. A Meta diz ter mais de 1 milhão de empresas usando. É grátis de instalar, não precisa de desenvolvedor, e está dentro do app que o dono já abre.
2. **O "funcionário de IA" já é posicionamento ocupado no Brasil.** A Zaia vende exatamente isso, no-code, R$ 249/mês. Não é fatal, mas o Otto não pode se apresentar como quem inventou a ideia.
3. **A janela de 24h deixa de ser grátis em 1º de outubro de 2026.** Isso invalida a premissa de custo que estava no nosso ADR 005 e em `cobranca.md`. Corrigido; ver seção 7.
4. **O padrão de reclamação é sempre o mesmo, em toda a categoria: suporte.** Instabilidade sem aviso, cobrança depois do cancelamento, mudança de plano sem avisar, chamado sem resposta. A tecnologia raramente é a queixa principal. **Isso é oportunidade de produto, não de marketing.**
5. **O cliente final não quer bot, e isso é medido.** 73,2% dos consumidores brasileiros preferem ser atendidos por pessoa. Só 20% tiveram experiência positiva com chatbot, número parado em relação a 2025. E a valorização de "o robô me passa para um humano" subiu de 54% para 63% entre 2025 e 2026. O caráter que já escrevemos para o Otto (passa para pessoa, não inventa, admite limite) mira exatamente essa dor.

---

## 2. Tamanho e contexto

| Dado | Valor | Fonte |
|---|---|---|
| Empresas ativas no Brasil | ~24,2 milhões, 93,8% micro e pequenas | ISP Solution / Sebrae |
| MEIs e micro/pequenas que usam WhatsApp como principal canal de vendas | 82% | Sebrae, pesquisa de fev-mar de 2026 |
| Smartphones brasileiros com WhatsApp instalado | 98,3% | levantamentos de mercado 2026 |
| Consumidores que citam WhatsApp como principal meio de contato com empresa | 83,8% | pesquisa de atendimento 2026 |
| Empresas usando o Meta Business Agent (global) | mais de 1 milhão | Meta |

O mercado é enorme e o canal é praticamente universal. O problema nunca vai ser tamanho de mercado; vai ser diferenciação e custo de aquisição.

---

## 3. Mapa competitivo

A categoria se divide em cinco grupos, e eles competem por clientes diferentes.

| Grupo | Quem | Preço típico | Cliente |
|---|---|---|---|
| **A. A plataforma dona do canal** | Meta Business Agent | Token (US$ 2 / 1M), sem mensalidade | Qualquer um, do MEI à grande |
| **B. Enterprise brasileiro** | Blip (Take Blip), Zenvia, Huggy | R$ 600 a R$ 2.600+/mês, com implantação | Média e grande empresa com TI |
| **C. Self-service para PME** | BotConversa, Digisac, Poli, Chatsac, Kommo, ManyChat | R$ 69 a R$ 800/mês | PME que monta sozinha |
| **D. IA-first no-code** | Zaia, GPT Maker | R$ 249/mês fixo ou crédito por interação | PME e agência |
| **E. Vertical** | Anota AI (restaurante/delivery) | R$ 219,99 a R$ 329,99/mês | Um nicho, profundamente |
| **F. Enterprise global** | Intercom Fin, Sierra, Decagon | US$ 0,99 a ~US$ 1,50 por resolução; contratos de US$ 100k a 400k/ano | Grande empresa global |

**O Otto nasce entre C e D, e a briga real é contra A.**

---

## 4. Perfis

### Meta Business Agent — o concorrente que importa

| | |
|---|---|
| O que é | IA de atendimento nativa no WhatsApp, Instagram e Messenger. Criada em minutos, sem programação |
| Chegada ao Brasil | Fevereiro de 2026 (segundo país, depois do México) |
| Preço | US$ 2 por 1M de tokens desde 1º de agosto de 2026. A Meta estima ~US$ 0,045 por resposta, porque uma mensagem consome de 20 a 25 mil tokens. Cobrança de IA e entrega vem junta, numa linha só |
| Força | Distribuição imbatível, custo zero de instalação, dentro do app, sem intermediário, marca conhecida |
| Fraqueza documentada | Sem integração com CRM, ERP, base de pedidos ou sistema de tickets. Sem caixa de entrada de equipe na versão gratuita. Sem memória histórica da relação: cada conversa começa do zero. O encaminhamento para humano vira notificação sem dono, e o lead esfria. Sem broadcast e sem API na versão grátis |
| O que isso significa para o Otto | O Otto não pode competir em "IA que responde no WhatsApp". Isso virou commodity da plataforma. Tem que competir no que a Meta não faz: memória do cliente, equipe, integração com o negócio, e alguém responsável quando dá errado |

### Zaia — o concorrente de posicionamento

| | |
|---|---|
| O que é | Plataforma no-code para criar "funcionários de IA" para suporte e vendas. Mesma metáfora do Otto |
| Preço | R$ 249/mês, 7 dias de teste grátis |
| Força | Posicionamento pronto, no ar em horas, preço claro, IA generativa em todos os planos pagos |
| Fraqueza (reclamações públicas) | Instabilidade diária, mudanças em código em horário comercial sem aviso, agentes alucinando depois de alteração, funcionalidade removida da noite para o dia, preço de plano alterado sem justificativa, chamado sem resposta por mais de duas semanas. Uma das entidades ligadas à marca aparece com 16 reclamações e **0% de resposta** |
| O que isso significa para o Otto | A metáfora "funcionário de IA" já está no mercado, e está queimando. Quem tentou e se decepcionou é o cético do nosso ICP. Para ele, prova pesa mais que recurso |

### Blip, Zenvia, Huggy — o enterprise brasileiro

| | Blip | Zenvia | Huggy |
|---|---|---|---|
| Preço | Sob consulta; referência de mercado a partir de ~R$ 1.023 a R$ 2.600/mês | Componentes somados passam de R$ 475; entrada citada em R$ 600/mês; enterprise R$ 2.000+ | Plano avançado R$ 989/mês anual, R$ 1.239 mensal |
| Força | Parceiro oficial da Meta, robusto, escala, marca | Presença regional forte, multicanal | Multicanal, bootstrap, opera em 7 países |
| Fraqueza | Ticket alto exclui PME. Implantação relatada em 45 dias ou mais. Venda consultiva | Preço variável mês a mês conforme canal, difícil de prever | Preço alto para PME |
| Reclamações públicas | Dificuldade de cancelamento de contrato, atendimento pouco humanizado, chatbot rígido e ineficiente | Cobrança depois do pedido de cancelamento; cancelamento arrastado por três meses; só URA, sem falar com pessoa; cliente jogado entre comercial e suporte; e-mail sem resposta | Menos material público encontrado |

**O padrão dos três: caros, lentos de implantar e com atrito de saída.** Nenhum atende bem o dono de salão com um número de WhatsApp.

### Self-service e vertical

- **BotConversa:** a partir de R$ 129/mês com IA; a mais barata entre as que usam API oficial, a R$ 147/mês. Envio ilimitado no plano Pro.
- **Anota AI:** o caso de sucesso vertical. Mais de 50 mil estabelecimentos, comprada pelo iFood por cerca de R$ 60 milhões, preço transparente de R$ 219,99 a R$ 329,99. **A prova de que verticalizar funciona no Brasil.** Tem reclamação pública grave: robô com resposta cínica e falha de suporte que levou ao banimento do número da empresa.
- **Faixa geral do mercado self-service:** R$ 69 a ~R$ 800/mês, mais as taxas da Meta. Para PME com 1.000 a 5.000 conversas por mês, o custo total citado fica entre R$ 99 e R$ 1.200/mês.

### Enterprise global — de onde vem a tendência de preço

Fin (Intercom) cobra **US$ 0,99 por resolução**, com mínimo de 50 por mês, mais assento de US$ 29 a US$ 139. Foi comprada pela Salesforce por cerca de US$ 3,6 bilhões em junho de 2026. Sierra cobra por resolução, estimada em ~US$ 1,50, com contrato anual a partir de ~US$ 150 mil. Decagon cobra por conversa tocada, ~US$ 0,99, com plataforma anual de ~US$ 50 mil.

**A leitura estratégica:** lá fora o preço está migrando de assinatura para **resultado entregue**. Sierra só ganha quando resolve; Decagon ganha por esforço. Essa é uma escolha filosófica que vai chegar ao Brasil, e ela conversa direto com a nossa metáfora de funcionário.

---

## 5. Reclamações — o que se repete

Separado por audiência, porque são dores diferentes.

### Do empregador (quem paga)

Em ordem de frequência no material encontrado:

1. **Suporte que não responde.** Chamado aberto sem resposta por semanas, e-mail ignorado, URA sem saída para humano. Aparece em Zenvia, Zaia, Chatbot Maker.
2. **Cobrança depois do cancelamento.** Cancelamento pedido e não processado, cobrança seguindo, processo arrastado por meses. Aparece em Zenvia, Blip, Zaia.
3. **Instabilidade sem aviso.** Mudança em produção em horário comercial, funcionalidade removida da noite para o dia, sem comunicado de manutenção. Aparece com força na Zaia.
4. **Preço e plano alterados unilateralmente.**
5. **Não entregou o que foi vendido.** Casos de contrato de IA para WhatsApp que virou pedido de rescisão judicial e estorno.
6. **Banimento do número.** Caso relatado de empresa banida no primeiro disparo por validação inadequada do suporte. **Esse é o pior desfecho possível para uma PME:** perder o WhatsApp é perder o negócio.
7. **Deriva de conteúdo.** A IA continua respondendo com preço velho, produto que mudou, promessa que a empresa não pode mais cumprir.

### Do cliente final (quem conversa)

| Dado | Valor |
|---|---|
| Prefere ser atendido por pessoa | 73,2% |
| Não gosta de resposta automática (usuários de WhatsApp) | 59% |
| Teve experiência positiva com chatbot | 20%, igual a 2025 |
| Valoriza o robô saber passar para um humano | 63%, contra 54% em 2025 |

As queixas nomeadas: resposta automática genérica, demora, não resolver, e dificuldade de chegar em uma pessoa.

**Conclusão que vale ouro para o produto:** o mercado não é ganho por quem tem a IA mais esperta. É ganho por quem **erra menos e sai de cena na hora certa.** Nosso caráter (não inventa, admite limite, passa para pessoa) não é enfeite de marca. É o requisito funcional do mercado.

---

## 6. Onde o Otto tem espaço

Descartando o que não dá para disputar:

- **Não dá para ganhar em preço de inferência.** A Meta cobra US$ 2/1M de tokens, exatamente o mesmo que pagamos por Sonnet 5 na DigitalOcean.
- **Não dá para ganhar em distribuição.** A Meta está dentro do app.
- **Não dá para ganhar em "tem IA".** Todo mundo tem, inclusive de graça.

O que sobra, e é bastante:

1. **O que a Meta não faz.** Memória da relação com o cliente, caixa de entrada com dono, encaminhamento que não esfria, integração com o negócio. As fraquezas do Business Agent estão documentadas e são exatamente o buraco.
2. **Suporte como produto.** A reclamação nº 1 da categoria inteira é suporte. Uma empresa que responde rápido e não some ganha cliente por eliminação. Isso é caro e não escala fácil, o que é justamente o motivo de os concorrentes falharem nisso.
3. **Confiabilidade visível.** Sem mudança em produção sem aviso, sem remover funcionalidade, sem alterar preço unilateralmente. Escrever isso como promessa pública é diferenciação real num mercado onde o oposto é a norma.
4. **O caráter honesto.** 73% preferem humano e 63% valorizam a transferência. Um atendente que passa para pessoa na hora certa vende melhor do que um que promete resolver tudo.
5. **Verticalizar.** A Anota AI provou o modelo: um nicho, profundamente, e sai por R$ 60 milhões. Nosso ICP ainda está aberto (`visao.md`, pendência 5). A pesquisa reforça: **escolher um nicho é mais defensável do que ser genérico contra a Meta.**

O que a pesquisa **não** respondeu, e só campo responde: se o dono de empresa que já usa o Business Agent da Meta de graça pagaria por algo melhor, e quanto.

---

## 7. Correção de premissa: a janela de 24h deixa de ser grátis

**Isto invalida o que estava escrito no ADR 005 e em `cobranca.md`, e a data é daqui a três semanas.**

- Mensagem de serviço, que é a resposta dentro da janela de 24 horas, **inclusive a enviada por IA de terceiro**, era grátis desde novembro de 2024. **Passa a ser cobrada em 1º de outubro de 2026**, à mesma tarifa de utilidade e autenticação do país. Template de utilidade também perde a gratuidade.
- Tarifa citada para o Brasil: **US$ 0,0068 por mensagem**, sem faixa de desconto por volume. A tabela por país foi anunciada em 1º de setembro de 2026. **Conferir a tabela oficial antes de fechar preço.**
- A Meta cobra a IA nativa dela juntando IA e entrega numa linha só. Terceiros pagam as duas coisas separadas.

### Custo estimado por resposta do Otto

Premissas: 2.000 tokens de entrada (caráter, estilo, base, histórico) e 150 de saída, com Claude Sonnet 5 na DigitalOcean a US$ 2/1M entrada e US$ 10/1M saída. **São premissas, não medições.** O número real sai do protótipo de validação do ADR 005.

| Item | Custo |
|---|---|
| Tokens de entrada | US$ 0,0040 |
| Tokens de saída | US$ 0,0015 |
| Mensagem de serviço da Meta | US$ 0,0068 |
| **Total por resposta** | **~US$ 0,012** |

Uma conversa de 8 respostas custa ~US$ 0,10. Uma conta com 500 conversas por mês custa ~US$ 50 de custo variável.

**A boa notícia:** o Business Agent da Meta custa ~US$ 0,045 por resposta, pela estimativa da própria Meta. O Otto sai a ~US$ 0,012, cerca de **um terço**. Temos margem para ser melhor e mais barato que a IA nativa, o que não era óbvio antes desta pesquisa.

**A má notícia:** a mensagem de serviço vira quase 60% do custo variável, e ela não é token. O modelo de franquia do ADR 004 mede só token. **Ou a franquia passa a medir as duas coisas, ou o custo de WhatsApp precisa entrar na faixa da assinatura.** Isso vira pendência no ADR 004.

---

## 8. Riscos que a pesquisa expôs

| Risco | Severidade | Nota |
|---|---|---|
| A Meta melhorar o Business Agent e fechar o buraco (CRM, equipe, memória) | Alta | É a plataforma. Pode fazer isso a qualquer momento. Nossa defesa é nicho e serviço, não recurso |
| Banimento do número do cliente | Alta | Já aconteceu com concorrente e destruiu a relação. Validação de número e conformidade viram requisito de dia 1 |
| Mudança de preço unilateral da Meta | Média | Já mudou duas vezes em 15 meses (julho de 2025, outubro de 2026). Contrato com cliente não pode fixar preço sem cláusula de repasse |
| Posicionamento "funcionário de IA" queimado pela concorrência | Média | Zaia no Brasil, Artisan lá fora. Ver seção 9 |
| Custo de aquisição em mercado lotado | Média | Dezenas de players, todos com blog otimizado e comparativo. Conteúdo não vai diferenciar |

---

## 9. Uma lição de marca vinda de fora

As empresas globais que venderam "funcionário de IA" com agressividade colheram reação ruim. A campanha "Stop Hiring Humans", da Artisan, é o caso citado: promessa que nenhum produto de IA entrega em 2026, e o resultado é avaliação de uma estrela pela distância entre marketing e experiência.

**Isso valida duas escolhas que já tomamos e recomenda uma terceira:**

- Validado: caráter que admite limite e passa para pessoa (`persona-otto.md`).
- Validado: não vender pelo medo, e sem hype (`voz-e-tom.md`).
- Recomendado: **o Otto nunca deve ser vendido como substituto de gente.** Ele é o funcionário que atende o que a equipe não dá conta, de madrugada, no fim de semana, na hora do almoço. "Contrate o Otto" funciona. "Demita seu atendente" destrói a marca e contradiz o dado de que 73% preferem humano.

---

## 10. Perguntas que só o campo responde

Nenhuma destas foi respondida por esta pesquisa. Todas sustentam decisão cara e por isso valem entrevista antes de código.

1. O dono que hoje usa o Business Agent grátis da Meta pagaria por um Otto melhor? Quanto?
2. Ele sabe que existe o Business Agent? (Se não souber, o concorrente real ainda é "ninguém atende".)
3. Qual foi a última vez que ele perdeu cliente por demora no WhatsApp? Data e episódio, não opinião.
4. Ele já tentou alguma dessas plataformas? Por que parou?
5. Quem responde o WhatsApp hoje, e quanto custa essa pessoa?

---

## Fontes

Consultadas em 2026-09-08.

- Meta, preços da WhatsApp Business Platform: https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing
- Meta, atualizações de preço do Business Agent e mensagens de serviço: https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/non-template-messages
- DigitalOcean, preços de inferência: https://docs.digitalocean.com/products/inference/details/pricing/
- Maxbot, Meta Business Agent e cobrança a partir de agosto de 2026: https://www.maxbot.com.br/blog/meta-business-agent
- Wati, limitações do Meta Business Agent: https://www.wati.io/en/blog/meta-business-agent/
- Wati, mudança de preço de mensagens de serviço: https://www.wati.io/en/blog/whatsapp-service-message-pricing/
- Landbot, mudança de outubro de 2026: https://landbot.io/blog/whatsapp-business-api-pricing-change-october
- Reclame Aqui, Zaia: https://www.reclameaqui.com.br/empresa/zaia-servicos-de-tecnologia/
- Reclame Aqui, Zenvia: https://www.reclameaqui.com.br/empresa/zenvia/
- Reclame Aqui, Blip: https://www.reclameaqui.com.br/take-blip/cancelamento-de-contrato-e-problemas-com-a-plataforma-blip_nm9fEpHrcInSicPK/
- Reclame Aqui, Anota AI: https://www.reclameaqui.com.br/anota-ai/robo-de-whatsapp-com-respostas-cinicas-e-suporte-falho-causa-banimento-da-empresa_PdW0b1zkTLDeGBOr/
- Reclame Aqui, Chatbot Maker: https://www.reclameaqui.com.br/chatbot-maker-tecnologia-da-informacao/
- Clint, custo de agente de IA para WhatsApp: https://www.clint.digital/blog/custo-agente-ia-whatsapp-2026/
- AI Hub Brasil, Anota AI, Take Blip, Huggy: https://botaihub.com.br/
- Aissist, benchmark de preço de agentes de IA 2026: https://aissist.io/industries/ai-agent-pricing-benchmark-2026
- Intercom, comparativo de preço de agentes: https://www.intercom.com/learning-center/ai-customer-service-agent-pricing-comparison
- Value Add VC, modelo de negócio da Sierra: https://valueaddvc.com/blog/how-does-sierra-ai-make-money-outcome-based-pricing-enterprise-agents-and-the-business-model-breakdown
- TechCrunch, Artisan e a reação ao "stop hiring humans": https://techcrunch.com/2026/04/23/dont-stop-hiring-humans-stop-hiring-the-wrong-humans-artisans-founder-says/
- Notícia Preta, 73% preferem atendimento humano: https://noticiapreta.com.br/consumidores-preferem-atendimento-humano-chatbots-ia/
- Sebrae via Meets, 82% das MPEs usam WhatsApp: https://blog.meets.com.br/whatsapp-business-estatisticas-e-10-tendencias-para-2026/
- Unred, estatísticas de WhatsApp no Brasil: https://unred.com.br/blog/estatisticas-whatsapp-brasil
