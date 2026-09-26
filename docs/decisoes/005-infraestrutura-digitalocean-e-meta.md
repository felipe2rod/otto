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
| **Roteamento de modelo por conversa** (revisto em 2026-09-09) | **Recall de "precisa do modelo forte" ≥ 98%** na primeira mensagem, precisão livre | Abaixo de 98%, o roteamento sai e o Sonnet faz tudo |
| **Cache do prefixo por empresa** (novo em 2026-09-09, bloqueante) | Segunda conversa da mesma empresa vem com `cache_read_input_tokens` ≥ 5.000 e `cache_creation_input_tokens` < 1.000 | Sem isso, a tabela de preço de `cobranca.md` não fecha e qualquer comparação de modelo mede a coisa errada |

**Por que o critério do roteamento é assimétrico, e não 90% de concordância como a linha acima:** mandar conversa fácil para o Sonnet custa R$ 0,10; mandar conversa difícil para o modelo fraco custa o caráter — ele inventa preço, que é a falha da regra 1. O classificador tem que errar para cima. E o roteamento só pode decidir **antes da primeira resposta**: o cache é por modelo, então alternar no meio da conversa paga a escrita do prefixo duas vezes e sai mais caro que não rotear (números em `cobranca.md`).

**Prefixo mínimo cacheável, armadilha do Haiku:** 4.096 tokens no Haiku 4.5 contra 1.024 no Sonnet 5. Se a medida "buscar o trecho relevante da base" encolher o prompt abaixo disso, o cache do Haiku para de existir **em silêncio** (`cache_creation_input_tokens: 0`, sem erro). Conferir nos dois modelos, não só num.
| Latência | Resposta ponta a ponta (webhook → resposta no WhatsApp) com mediana abaixo de 10 s | Mediana acima disso em condição normal |
| Custo por conversa | Medido em 100 conversas de teste, compatível com uma franquia que o empregador pagaria (número a fechar no ADR 004 com esse dado) | Custo que exige franquia impraticável |
| App Platform | Deploy, webhook da Meta e banco funcionando sem ajuste manual em servidor | Precisar de Droplet para algo essencial |

Resultado vira `aceita` ou `rejeitada` neste ADR, com data e os números medidos. Se um item falhar, só ele muda; o resto se mantém.

## Gatilho de revisão

- Rever fornecedor de inferência se o custo por conversa medido em produção deixar a franquia proposta inviável, ou se latência mediana de resposta passar de um limite a definir com dado (referência inicial: cliente final espera menos de 10 s).
- Rever "direto na Meta" se o processo de Tech Provider/Embedded Signup travar o onboarding por mais de um mês.

## Nota de 2026-09-08 — transcrição de áudio: porta agora, auto-hospedar depois

Cliente final manda áudio no WhatsApp e o Claude não recebe áudio: falta um transcritor entre os dois. O ADR só nomeava DigitalOcean e Meta. Decisão:

**`TranscritorDeAudio` é uma porta de contexto (ADR 006), com adaptador de API na v1.** Trocar o transcritor vira mudança de configuração, não reescrita.

**Não auto-hospedar Whisper agora**, apesar de ser open source (MIT) e de rodar bem na DigitalOcean. O motivo não é preço de licença, é latência e volume:

| | |
|---|---|
| ~~Latência~~ | **Argumento retirado em 2026-09-08, pelo Felipe.** A meta de 10 s vale para o caminho de texto, não para o de áudio: o Otto pode avisar que vai ouvir e responder depois. O caminho de áudio é assíncrono por natureza — a fila (pg-boss, já na stack) recebe o áudio, o transcritor devolve, e só então o Sonnet é chamado. Isso vale para qualquer fornecedor, inclusive API em lote, e entra na arquitetura independentemente da escolha. |
| **Volume, em GPU** | Droplet de GPU fica ligado 24/7. O mais barato da DigitalOcean (RTX 4000 Ada) custa US$ 0,76/h = **US$ 555/mês**, e empata com a API só em 2.150 h de áudio/mês (~186 contas de 400). Descartado: mesmo nesse ponto a GPU ficaria 91% ociosa. |
| **Volume, em CPU** | Sem a restrição de latência, volta a ser viável, e o empate cai muito. Com `large-v3-turbo` (4× mais rápido que o large-v3, ao custo de 1 a 2 pontos de WER) uma droplet de CPU roda perto do tempo real. Droplet de 4 vCPU/8 GB a US$ 48/mês **empata em 186 h de áudio/mês, ou ~16 contas de 400**, e uma só droplet atende até ~44 contas. É uma opção real, não absurda. |
| **Gasto real hoje** | Com 10 contas na faixa de 400, a transcrição inteira custa **US$ 30/mês**. Trocar isso por um droplet de US$ 555 é pagar 18× mais para economizar. |
| **Qualidade** | Áudio de WhatsApp é OPUS comprimido, com ruído de rua e sotaque. Modelo pequeno erra, e transcrição errada faz o Otto responder a coisa errada — falha muito mais cara que a conta de transcrição. Qualquer troca de transcritor passa por medição de erro em áudio real de WhatsApp em pt-BR, não por benchmark de inglês. |

### A descoberta que decide, e que não é a latência nem o preço da GPU

Seguindo o desenho assíncrono até o fim: se o Otto avisa "vou ouvir seu áudio, espera só um minuto", **esse aviso é uma mensagem de serviço da Meta e custa US$ 0,0068.**

| | Por atendimento |
|---|---|
| Transcrição por API (1,73 min × US$ 0,0043) | US$ 0,00746 |
| Aviso "vou ouvir seu áudio" (1,38 áudios × US$ 0,0068) | **US$ 0,00938** |

**O aviso custa 1,26× a transcrição que ele economizaria.** E o aviso só é necessário porque o caminho ficou lento: uma API em lote responde em 2 a 3 s e o Otto pode simplesmente responder, sem aviso nenhum. A droplet de CPU a ~1× o tempo real leva 40 s num áudio de 40 s, e aí o aviso deixa de ser opção.

Ou seja, a escolha real não é "API × droplet". É **quanto tempo o Otto pode ficar calado depois de receber um áudio**:

- Se o silêncio de ~40 s for aceitável, não manda aviso, e a droplet de CPU passa a valer a partir de ~16 contas.
- Se o aviso for parte da experiência, a API sai mais barata **porque não precisa dele**.

Essa é uma decisão de experiência, não de infraestrutura: dono do desenho é o especialista-ui-ux, com dado do analista de produto.

**Decisão da v1:** API em lote, sem aviso, com a fila assíncrona construída desde já. Zero operação, zero risco de qualidade enquanto não há medição, e mantém as duas portas abertas.

**Regra de engenharia:** o aviso, se existir, é **condicional** — dispara só se a transcrição passar de ~5 s. Assim a mesma implementação serve aos dois fornecedores e o custo do aviso só aparece quando ele é realmente necessário.

### O princípio, para não refazer esta análise a cada fornecedor novo

**Serverless paga computação no varejo; droplet compra no atacado e desperdiça quando ocioso. A API de transcrição é a droplet de outra pessoa rodando com ocupação alta** — por isso ela ganha das duas enquanto o volume for baixo e intermitente, que é o formato desta carga.

Confirmação externa (2026-09-08): a regra de mercado põe o empate de auto-hospedar transcrição em **~2.400 horas de áudio por mês quando se contabiliza o custo de operação**. O empate de 186 h/mês calculado aqui olha só infraestrutura; a diferença entre os dois números **é o preço da atenção de quem opera**. Com 10 contas na faixa de 400 o volume é de 116 h/mês — 5% do limiar. Mesmo com 100 contas, 1.156 h/mês, ainda é metade.

**Gatilho para reavaliar:** volume de áudio passar de **200 horas/mês** (~17 contas na faixa de 400, o empate da droplet mais barata olhando só infraestrutura). Não é gatilho de adotar; é gatilho de refazer a conta com WER medido em áudio real de WhatsApp em pt-BR e com minutos por atendimento medidos.

**Reabre antes do gatilho se:** a DigitalOcean subir o teto de memória das Functions acima de ~2 GB (aí `large-v3-turbo` passa a caber e o serverless de CPU vira a resposta certa), ou a Gradient publicar um modelo de ASR (aí volta a ser fornecedor único, sem operação nenhuma).

**Fornecedor: Deepgram Nova-3, em lote, atrás da porta `TranscritorDeAudio`.** Decidido pelo Felipe em 2026-09-08, **em caráter provisório até a medição descrita abaixo** — a porta faz a troca ser configuração, não reescrita. Nenhum fornecedor aparece em texto para empregador ou cliente final.

Verificado em 2026-09-08: o Nova-3 tem **modelo monolingue de português, com pt-BR e pt-PT**, além do multilíngue. Preço em lote: **US$ 0,0043/min no monolingue** (o número usado no modelo de custo, que continua válido) e **US$ 0,0052/min no multilíngue**. Conta nova ganha **US$ 200 de crédito sem prazo de validade** — 775 horas de áudio, o que cobre uns 6 meses com 10 contas na faixa de 400. A validação sai de graça.

**Monolingue ou multilíngue é pergunta aberta, e importa mais no nicho candidato do que parece.** Cliente de assistência técnica fala português misturado com nome de produto em inglês ("meu iPhone tá com a tela trincada", "o Wi-Fi caiu", "meu notebook Dell"). O modelo monolingue pode estropiar esses nomes; o multilíngue lida com troca de idioma no meio da frase. A diferença de preço é de US$ 0,0009/min — irrelevante. Testar os dois.

### Nenhum benchmark publicado responde se serve para o Otto

Os números disponíveis em 2026-09-08 variam 5×, e a variação não é do modelo, é do áudio:

| Fonte | WER | O que é |
|---|---|---|
| Deepgram, sobre o Nova-3 | 5,26% a 6,84% | Mediana de produção do próprio fornecedor, com peso de inglês |
| Whisper, média multilíngue | ~10,6% | Média de 99 idiomas, no Fleurs |
| Benchmark acadêmico de português do Brasil | **24,6%** | Melhor modelo testado (WhisperLv3) em áudio difícil de PT-BR |

Comparar os 5-7% do fornecedor com os 10,6% do Whisper seria erro grosseiro: mediana de produção em inglês contra média de 99 idiomas. **E áudio de WhatsApp está na ponta difícil** — OPUS comprimido, rua, sotaque regional, fala espontânea, gíria do segmento. Não há benchmark público desse regime; só medição própria decide.

**O teste que decide (dono: treinador-do-otto, junto do conjunto de avaliação):** 30 a 50 áudios reais de WhatsApp em pt-BR, transcritos à mão como gabarito, passados por Nova-3 monolingue, Nova-3 multilíngue e Whisper large-v3. **O que se mede não é WER:**

1. **A intenção sobreviveu?** "Meu celular não liga" virar "meu celular não lida" não quebra nada — o Otto entende igual. Erro de palavra que não muda a intenção é ruído, não defeito.
2. **As entidades estão certas?** Número ("cento e cinquenta" virar "cinquenta"), modelo de produto ("iPhone 13" virar "iPhone 30"), endereço e nome. **É aqui que a transcrição errada custa dinheiro**, porque o Otto responde com confiança a coisa errada.

Um transcritor com WER pior e entidades certas é melhor para o Otto que o contrário.

**Verificado em 2026-09-08 — a Gradient da DigitalOcean não tem transcrição.** A lista de modelos tem 70+ opções de texto, imagem, embedding, reranking, text-to-video e **text-to-speech** (Qwen 3 TTS, ElevenLabs Multilingual v2), mas **nenhum speech-to-text**. TTS é texto → áudio; o que o Otto precisa é áudio → texto. O caminho de fornecedor único está fechado hoje. Reabrir se a Gradient publicar um modelo de ASR.

**Serverless também não resolve, e a análise fica registrada para não ser refeita:**

| Forma de "serverless na DO" | Por que não |
|---|---|
| Gradient Serverless Inference (a mesma que serve o Claude) | Não tem modelo de transcrição. Ver acima |
| DigitalOcean Functions (serverless de CPU) | **Verificado em 2026-09-08: o preço ganha, o teto de memória mata.** A 1 GiB e ~1,5× o tempo real, sai a US$ 0,0017 por minuto de áudio contra US$ 0,0043 da API — 60% mais barato, com 16,7 h/mês grátis no free tier de 90.000 GiB-s. Mas **o teto é 1 GB de RAM** (128 MB a 1 GB, timeout de 15 min), e os pesos não cabem: `large-v3` int8 ≈ 1,6 GB, `large-v3-turbo` ≈ 800 MB **antes** do runtime CTranslate2, do Python e dos buffers de áudio. Sobra `small` (~250 MB) ou `base` (~75 MB) — exatamente os modelos que erram em áudio de WhatsApp comprimido, com sotaque e barulho de rua. O que bloqueia não é o custo, é a qualidade que o teto obriga |
| GPU serverless com scale-to-zero | O conceito é o certo — pagar só o uso. O cold start de 30 a 60 s deixou de ser impeditivo com o caminho assíncrono, mas a DigitalOcean **não oferece GPU serverless de primeira mão**: adotar significa adotar outro fornecedor (Modal, RunPod, Replicate), que é justamente o que a pergunta tentava evitar. E manter instância quente para cortar o cold start é pagar por GPU ociosa, que é a droplet de novo |

**O número que fecha o assunto:** a carga de áudio é minúscula e intermitente. Com 10 contas na faixa de 400 são 116 horas de áudio por mês, que em L40S a 35× o tempo real dão **3,3 horas de GPU por mês — 0,45% de ocupação** de uma droplet ligada 24/7. Mesmo no ponto de empate de 186 contas, a ocupação é de 8,4%: pagar-se-ia uma GPU parada 91% do tempo. Para uma carga desse formato, **a API por uso é a opção serverless que existe.**

**A medir na primeira entrega técnica:** minutos de áudio por atendimento (estimado em 1,7), taxa de erro da transcrição em pt-BR com áudio real, e latência do transcritor dentro do orçamento de 10 s.

