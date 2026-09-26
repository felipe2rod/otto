# Integrações — o que o Otto precisa saber e de onde vem

Mapa levantado em 2026-09-08 por pesquisa aberta. Fontes ao final. Complementa `docs/mercado/pesquisa-2026-09.md`.

**Por que isso importa.** A pesquisa de mercado mostrou que a fraqueza documentada do Meta Business Agent é exatamente esta: sem integração com CRM, ERP ou base de pedidos, e sem memória da relação. **Integração não é funcionalidade acessória do Otto. É o motivo de ele existir em vez do agente grátis da Meta.**

---

## 1. Comece pelo contexto, não pela ferramenta

A pergunta certa não é "com quais sistemas integrar". É "o que o Otto precisa saber para atender bem". A lista de ferramentas sai disso, e não o contrário.

Seis tipos de contexto cobrem quase todo atendimento de PME:

| # | Contexto | Pergunta do cliente final que ele responde | Sem isso, o Otto |
|---|---|---|---|
| 1 | **Identidade e operação** | "Vocês abrem sábado?", "onde fica?" | Não atende nem o básico |
| 2 | **Oferta e preço** | "Quanto custa X?", "vocês fazem Y?" | Inventa ou empurra para a equipe |
| 3 | **Disponibilidade** | "Tem horário amanhã?" | Não marca nada |
| 4 | **Quem é este cliente** | "Sou eu de novo, aquele do orçamento" | Trata todo mundo como novo |
| 5 | **Status de pedido ou agendamento** | "Cadê meu pedido?", "que horas é minha consulta?" | Perde a pergunta mais comum do varejo |
| 6 | **Cobrança** | "Como pago?" | Não fecha, só informa |

**Os contextos 1, 2 e 3 resolvem a maior parte do atendimento da v1.** Os 4, 5 e 6 são o que separa o Otto de um FAQ automático.

---

## 2. A realidade: metade dos clientes não tem sistema nenhum

Dado do Sebrae, pesquisa TIC de 2025: **47% dos pequenos negócios usam algum aplicativo ou software integrativo.** 76% têm computador. E 82% dos MEIs e micro e pequenas empresas usam o WhatsApp como principal canal de vendas.

A leitura é dura e define a arquitetura: **mais da metade do mercado-alvo roda em WhatsApp, planilha e caderno.** Uma estratégia baseada só em integração atinge menos da metade dos clientes possíveis, e provavelmente a metade que já está mais bem servida.

Por isso o mapa tem três camadas, e a primeira não integra com nada.

---

## 3. Camada 0 — funciona sem integração nenhuma

Fontes de contexto que existem para todo cliente, do MEI ao médio. **Isto é requisito de v1, não fallback.**

| Fonte | Contexto que dá | Como se obtém | Custo de obter |
|---|---|---|---|
| **Histórico do próprio WhatsApp** | 1, 2, 4 e o vocabulário do negócio | O empregador já respondeu essas perguntas centenas de vezes. Ler o histórico e propor a base de conhecimento pronta | Baixo. Vem junto com a conexão do número |
| **Perfil do WhatsApp Business** | 1 | Endereço, horário, descrição, site. Já preenchido na maioria dos casos | Muito baixo, é da própria API |
| **Catálogo do WhatsApp** | 2 | Produtos e preços que a empresa já cadastrou na Meta | Baixo, mesma API |
| **Perfil da Empresa no Google** (ex-Google Meu Negócio) | 1 | Horário, endereço, telefone, avaliações. Gratuito e presente na maioria das PMEs | Baixo, API do Google |
| **Planilha ou arquivo** | 2, 3 | Upload de CSV, PDF de cardápio, tabela de preço | Muito baixo |
| **Conversa de configuração** | 1, 2, 6 | O Otto pergunta ao empregador o que faltou, no WhatsApp dele | Zero de engenharia externa |

**A jogada mais forte da camada 0 é o histórico.** A hipótese em `visao.md` de que o empregador alimenta a base na primeira semana é frágil, e ela é a que mais ameaça a ativação. Ler o histórico e chegar com a base pré-preenchida troca "preencha esta base" por "confere se acertei". Isso é a diferença entre um formulário e um funcionário que já observou o trabalho.

---

## 4. Camada 1 — horizontais, servem qualquer segmento

Escolhidos por cobertura ampla e API pública. São as integrações que valem construir antes de decidir o nicho.

| Ferramenta | Categoria | Contexto | API | Nota |
|---|---|---|---|---|
| **Google Calendar** | Agenda | 3, 5 | Pública, madura, gratuita | O denominador comum. Quem não tem sistema de agenda muitas vezes tem Google Agenda |
| **Google Sheets** | Planilha | 2, 3, 4 | Pública | Muita PME opera a agenda e a tabela de preço aqui. Ler planilha é integração de verdade para esse público |
| **Bling** | ERP / estoque / fiscal | 2, 5 | **Pública e aberta**, com portal de desenvolvedor e programa de parceiros | O mais generalista do país, forte em marketplace. Faixa de R$ 250 a R$ 800/mês |
| **Conta Azul** | ERP financeiro | 2, 4, 6 | REST com documentação OpenAPI; produção exige plano compatível | A empresa afirma que 62% dos contadores brasileiros operam com ela. Chega pelo contador, não pelo dono |
| **Cobrança (contexto 6)** | Pagamento | 6 | Ver seção 4.1 | Decisão própria em ADR 011: múltiplos provedores, Otto não intermedia dinheiro |

**Recomendação de ordem:** Google Calendar, depois cobrança (ADR 011), depois Google Sheets, depois Bling.

### 4.1 Cobrança: o cliente final paga dentro do WhatsApp

Decidido em ADR 011. O Otto cria a cobrança **na conta do empregador, no provedor que ele já usa**, e entrega no chat. Não toca no dinheiro.

**Veículo de entrega:** a WhatsApp Cloud API tem pagamentos nativos no Brasil pela mensagem `order_details`, com PIX dinâmico, link, boleto e cartão. A Meta não concilia; o Otto concilia pelo webhook do provedor usando o mesmo `reference_id`. Quando `order_details` não estiver disponível, texto com PIX copia-e-cola e link.

**Contrato da porta `FonteDeCobranca`:**

```
criarCobranca(empresa, clienteFinal, valor, descricao, referencia, vencimento?)
  → { id, pixCopiaECola?, qrCode?, linkPagamento?, boletoUrl?, expiraEm }
consultarStatus(id) → pendente | pago | expirado | cancelado
webhook do provedor → evento PagamentoConfirmado(referencia) no barramento
```

**Provedores, por fase:**

| Fase | Provedor | API para criar cobrança com PIX | Nota |
|---|---|---|---|
| v1 | **PIX estático** | não precisa | Adaptador manual. O Otto manda a chave PIX da empresa, pede comprovante, avisa o empregador. Serve a 100% dos empregadores |
| v1 | **Mercado Pago** | pública; QR PIX dinâmico; `notification_url` | Maior base entre PMEs; adquirente do pagamento nativo do WhatsApp |
| v1 | **Asaas** | pública | Adaptador já existe pelo fluxo 1 |
| v1 | **InfinitePay** | pública, com playground | Link e checkout; recebe na hora; muito usada em PME |
| v1.1 | **PagBank** | Orders API pública | PIX, boleto, cartão, recorrência |
| v1.1 | **Stone / Pagar.me** | pública | Pagar.me é o gateway do grupo Stone |
| v1.1 | **Efí** | API PIX completa | Cobrança imediata, Pix Automático; exige certificado |
| v2 | **Cielo, Rede, Getnet** | API de e-commerce | Adquirentes do `order_details` com cartão; mais burocracia |
| v2 | **SumUp, Cora** | pública (Cora exige plano Pro) | Base menor no alvo |
| gatilho | **Ton** | não confirmada | Entra se 5 contas pedirem |
| gatilho | **Bancos** | API PIX com certificado e homologação | Só com demanda medida |

**Regras:** cobrança só depois de o cliente final confirmar valor e item, com preço lido de uma fonte; credenciais do empregador criptografadas por empresa; idempotência por referência; taxa é do empregador, no provedor dele.

Outros ERPs relevantes, para referência: **Tiny** (R$ 280 a R$ 750/mês), **Omie** (R$ 450 a R$ 1.800/mês, mais completo, cliente maior). Não são prioridade de v1.

---

## 5. Camada 2 — verticais, dependem do segmento escolhido

**Não construir nada aqui antes de decidir o nicho** (`visao.md`, pendência 5). Cada linha abaixo é um investimento que só se paga se o segmento for o escolhido.

### Beleza: salão, barbearia, estética

| Ferramenta | Nota |
|---|---|
| **Trinks** | Uma das mais conhecidas do país, desde 2015. Salão, barbearia, estética, spa |
| **Belasis** | Integra agenda, cliente, financeiro e **a própria WhatsApp Business API**, e expõe API para conectar a outras plataformas e IAs |
| **Belio** | Recomendado para negócios de 2 a 15 profissionais |
| **AppBarber, BarberCode** | Foco em barbearia. O BarberCode **já manda lembrete por WhatsApp** |

### Saúde: clínica e consultório

| Ferramenta | Preço de entrada | Nota crítica |
|---|---|---|
| **iClinic** | grupo Afya | Agenda com **lembrete por WhatsApp** e IA própria, o Afya Assist |
| **Feegow** | R$ 129/mês | Mais de 200 funcionalidades, certificação SBIS, faturamento TISS, **integração com WhatsApp**, API e integrações nativas, IA própria (Noa Notes) |
| **Amplimed** | R$ 89/mês | Tem a **Amélia Agendamento: uma IA integrada à agenda que conversa com o paciente em tempo real** |
| **Doctoralia** | marketplace | Agendamento online, traz paciente novo |

### Comércio e e-commerce

| Ferramenta | Nota |
|---|---|
| **Nuvemshop** | Maior da América Latina, plano gratuito sem limite de produto. Base enorme de lojista pequeno |
| **Loja Integrada** | Plano gratuito com limites |
| **Tray** | Grupo Locaweb, lojista médio |
| **Shopify** | A partir de ~R$ 279/mês |
| **Mercado Livre, Shopee** | Chegam via Bling, não direto |

### Alimentação e delivery

**Segmento praticamente fechado.** A Anota AI tem mais de 50 mil estabelecimentos e pertence ao iFood. Entrar aqui é competir com o dono do canal de pedidos. Não recomendado para a v1.

---

## 6. O achado que muda a escolha de segmento

**Nos sistemas de saúde, o concorrente do Otto já vem embutido.**

- A Amplimed, a R$ 89/mês, tem a **Amélia Agendamento**, descrita como assistente integrada à agenda que conversa com o paciente em tempo real.
- O iClinic tem lembrete por WhatsApp e IA própria.
- O Feegow tem integração com WhatsApp e IA própria.

Ou seja: na clínica, o Otto não disputa com "ninguém atende". Disputa com um recurso que o cliente **já paga** dentro de um sistema que ele **não vai trocar**, e que tem uma vantagem que o Otto nunca terá ali: acesso nativo ao prontuário e à agenda.

O mesmo começa a valer em beleza, onde BarberCode e Belasis já mandam WhatsApp.

**Implicação:** o critério de escolha de segmento passa a incluir uma pergunta nova. Não é só "onde tem dor de atendimento". É **"onde o sistema que o cliente já usa ainda não colocou uma IA em cima"**. Segmentos com sistema de gestão fragmentado, antigo ou inexistente valem mais que segmentos bem servidos.

Candidatos que a pesquisa sugere olhar com esse critério: prestador de serviço sem sistema (reforma, assistência técnica, instalação), comércio de bairro, e serviços com agenda informal. São os que vivem na camada 0.

---

## 7. Ler é seguro, escrever é o valor e o risco

Toda integração tem duas direções, e elas têm perfis de risco opostos.

| | Leitura | Escrita |
|---|---|---|
| Exemplos | Preço, horário, saldo de estoque, próximo horário livre, status do pedido | Marcar consulta, criar pedido, cancelar, gerar cobrança |
| Valor | Elimina a **deriva de conteúdo**, a queixa nº 7 da pesquisa de mercado: preço velho, produto que mudou | É o que faz o Otto valer salário em vez de mensalidade de FAQ |
| Risco | Baixo | Alto: horário dobrado, pedido errado, cobrança indevida |
| Regra do Otto | Livre | Confirma com o cliente final antes de gravar, e nunca grava o que não conseguiu ler antes |

Isso já está coberto pelo caráter em `persona-otto.md` (não inventa, não promete o que a empresa não confirmou). Vale escrever explicitamente no prompt de negócio: **o Otto só afirma o que leu de uma fonte, e só grava o que confirmou.**

Um efeito colateral bom: dado lido ao vivo nunca envelhece. A base de conhecimento manual envelhece sozinha, e é por isso que a deriva de conteúdo é queixa de categoria inteira.

---

## 8. Arquitetura: portas, não fornecedores

Recomendação para não transformar o Otto em um emaranhado de integrações. Coerente com a skill de clean architecture já instalada no projeto.

Definir **portas de contexto**, uma por tipo de contexto da seção 1, e escrever adaptadores por fornecedor:

```
FonteDeIdentidade    → PerfilWhatsApp, PerfilGoogle, ConfigManual
FonteDeOferta        → CatalogoWhatsApp, Bling, Nuvemshop, Planilha, ConfigManual
FonteDeAgenda        → GoogleCalendar, Trinks, Amplimed, Planilha
FonteDeCliente       → HistoricoWhatsApp, ContaAzul, CRM
FonteDePedido        → Bling, Nuvemshop
FonteDeCobranca      → MercadoPago, Asaas, InfinitePay
```

Três regras:
1. O prompt de negócio consome **porta**, nunca fornecedor. Trocar Bling por Tiny não muda o comportamento do Otto.
2. **Toda porta tem um adaptador manual**, para o cliente da camada 0. Nenhuma funcionalidade pode exigir integração.
3. Toda leitura registra a fonte e o horário, para o Otto poder dizer "o preço que tenho aqui é de hoje de manhã" quando fizer diferença.

---

## 9. O que fazer, em ordem

| Fase | O que | Depende de |
|---|---|---|
| **1. v1** | Camada 0 inteira. Foco no histórico do WhatsApp virando base de conhecimento pré-preenchida | Nada. Já dá para começar |
| **2. v1** | Google Calendar, leitura e escrita com confirmação | Porta de agenda definida |
| **3. v1** | Cobrança no WhatsApp: PIX estático, Mercado Pago, Asaas, InfinitePay, com `order_details` da Meta | ADR 011 |
| **4. v1.1** | Google Sheets como fonte de oferta e agenda | Porta definida |
| **4b. v1.1** | PagBank, Stone/Pagar.me, Efí | Demanda medida |
| **5. v2** | Bling, para quem tem estoque e pedido | Demanda medida, não suposta |
| **6. v2** | A vertical do segmento escolhido | **Segmento decidido** |

**Gatilho para construir integração nova, em incidência e não em opinião:** construir quando **5 ou mais contas distintas** pedirem a mesma ferramenta, ou quando ela aparecer no cadastro de mais de 20% das contas ativas. Perguntar no onboarding "que sistema você usa hoje?" é barato e transforma essa decisão em dado.

---

## 10. Hipóteses declaradas

| Afirmação | Tipo | Grau | O que a mata |
|---|---|---|---|
| Dá para montar base de conhecimento útil lendo o histórico do WhatsApp | Capacidade | NÃO VERIFICADO | Testar em 5 históricos reais; se menos de 3 renderem base aproveitável, a camada 0 muda de plano |
| O empregador aceita o Otto lendo o histórico de conversas | Preferência | NÃO VERIFICADO | Objeção de privacidade no onboarding. Tem peso de LGPD, precisa de consentimento explícito |
| A maioria dos clientes-alvo não tem sistema integrável | Taxa | COMPARÁVEL (Sebrae TIC 2025: 47% usam software integrativo; analogia estrutural conferida quanto a porte, não quanto a segmento) | Cadastro das primeiras 30 contas mostrando maioria com ERP ou sistema vertical |
| Integração é o que faz o cliente escolher o Otto em vez do agente grátis da Meta | Preferência | INFERIDO | Entrevista: perguntar direto a quem já usa o Business Agent |
| Segmento com sistema vertical que já tem IA é pior mercado inicial | Sequência | INFERIDO, mas com evidência direta de produto (Amélia, Afya Assist, BarberCode) | Uma clínica que já usa Amplimed contratar o Otto assim mesmo |

---

## Fontes

Consultadas em 2026-09-08.

- Sebrae, pesquisa TIC 2025, transformação digital nos pequenos negócios: https://sebraepr.com.br/impulsiona/pesquisa-tic-2025-transformacao-digital-nos-pequenos-negocios/
- Sebrae, digitalização recorde dos pequenos negócios: https://agenciasebrae.com.br/inovacao-e-tecnologia/digitalizacao-recorde-pequenos-negocios-no-brasil-atingem-nivel-historico-em-2025/
- API pública do Bling: https://www.bling.com.br/api-bling
- API da Conta Azul para desenvolvedores: https://contaazul.com/desenvolvedores/
- Comparativos de ERP para PME: https://clarezagestao.com/comparativo-bling-tiny-omie-contaazul
- Trinks, gestão para salões e clínicas: https://negocios.trinks.com/
- Belasis, agenda com API e WhatsApp Business API: https://www.belasis.com.br/
- Comparativo de sistemas de agendamento para beleza: https://blog.belio.com.br/artigos/melhores-sistemas-agendamento-salao-beleza-2026/
- Amplimed e a IA Amélia: https://www.amplimed.com.br/sistema-gestao-de-clinica/
- Comparativo Feegow, iClinic, Amplimed: https://www.apphealth.com.br/comparativo-feegow-iclinic-amplimed-app-health
- Melhores sistemas para clínicas e consultórios 2026: https://www.gestaods.com.br/melhores-sistemas-para-clinicas-e-consultorios/
- Plataformas de e-commerce para lojas pequenas: https://www.emanda.com.br/blog/plataformas-de-ecommerce/
- Comparativo de meios de pagamento e link de pagamento: https://www.infinitepay.io/blog/melhor-link-de-pagamento
- Gateways de pagamento no Brasil: https://fwctecnologia.com/en/blog/post/payment-gateways-brazil-comparison-2026
- Perfil da Empresa no Google: https://business.google.com/br/business-profile/
