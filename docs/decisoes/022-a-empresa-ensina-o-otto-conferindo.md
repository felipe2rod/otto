# 022 — A empresa ensina o Otto conferindo, não escrevendo

Status: aceita
Data: 2026-09-09 (respondida pelo Felipe no mesmo dia)
Quem decide: Felipe

Desenho completo em `docs/produto/experiencia.md` §12 (Decisão C, especialista de UI/UX) e `docs/tecnico/conversa.md` (treinador-do-otto). Este ADR registra a decisão; os dois documentos carregam o detalhe.

## Contexto

Felipe pediu um fluxo em que o empregador ensine o Otto sobre a empresa, e levantou quatro caminhos: upload de documento, explicar em conversa, formulário, ou uma documentação que ensine o empregador a fazer isso.

A tensão é conhecida e está registrada desde o começo do projeto. `visao.md` lista "o empregador alimenta a base de conhecimento na primeira semana" como hipótese `NÃO VERIFICADO`, e `integracoes.md` §3 diz que ela é **a que mais ameaça a ativação**, com a direção já apontada: trocar *"preencha esta base"* por *"confere se acertei"*.

O problema da pessoa: o dono de assistência técnica tem o conhecimento inteiro na cabeça e nenhuma parte dele escrita. Não existe PDF de política de garantia. Existe caderno, folha na bancada e histórico de WhatsApp. "Ensine o Otto sobre a sua empresa" chega para ele como tarefa de **redação** sobre um assunto que ele domina mas nunca organizou, no celular, com a mão no aparelho de alguém.

## Opções consideradas

| Caminho | Veredito |
|---|---|
| **Formulário estruturado** | **Não é a porta.** O custo caro não é digitar, é inventar o que escrever diante de campo em branco — ele precisa inventar a taxonomia antes de responder. É exatamente o desenho que a hipótese frágil pressupõe. Sobrevive como passo de onboarding **já preenchido** |
| **Upload de documento** | **Acelerador, com a forma corrigida.** O material deste dono não é PDF: é foto do caderno, foto da folha na bancada, áudio, às vezes planilha — e o lugar de mandar é o WhatsApp, não uma tela de upload. Material nunca vira conhecimento direto: vira proposta que ele confere |
| **Conversa com o Otto** | **É o formato de tudo**, e vira duas coisas: a tela "Conversar com o Otto" (que também resolve o modo de teste que o ADR 015 deixou pendente) e a barra de um toque dentro da conversa real |
| **Documentação / guia** | **Sai.** Ele não lê; guia é sintoma de tela errada; e a parte útil funciona melhor como exemplo dentro da tela. Documentação escrita faz sentido em outro lugar: página pública de venda, dono do redator de aquisição |

## Decisão

**O caminho principal é conferir, não escrever.** O Otto chega com as respostas prontas e o gesto do dono é um toque: "tá certo" ou "não é bem assim". Quando o Otto não sabe, o buraco vira proposta de resposta no lugar onde o dono já está — não tarefa para depois.

Seis regras:

1. **O Otto atende antes de aprender.** Nenhuma configuração de conhecimento é obrigatória para ele começar. No dia 1 ele é um recepcionista honesto que anota tudo, e o painel diz o número em vez de escondê-lo. Sem isso, a ativação do produto inteiro fica pendurada na hipótese mais frágil que existe aqui.
2. **Tudo o que se ensina tem a forma de uma resposta a uma pergunta de cliente.** Não existe campo "políticas" ou "sobre a empresa". O que não cabe nessa forma é configuração, e já tem tela.
3. **Ensinar é subproduto de responder.** O gesto principal não é ir a uma tela: é a barra de um toque que aparece depois de o dono responder a um cliente encaminhado — *guardar essa resposta?*. Custo de desvio zero: ele acabou de digitar o texto que o Otto precisa.
4. **A proposta vem do que já existe**, nesta ordem de custo: base do nicho (ADR 007), descrição do negócio do cadastro, perfil do WhatsApp Business, catálogo da Meta, Perfil da Empresa no Google, e uma semana de atendimento. O dono nunca vê campo em branco.
5. **Documento é dado, nunca instrução.** Material subido não entra cru no prompt: vira itens que o dono aprova. A aprovação é controle de acerto; o controle de segurança é estrutural (canal de confiança separado, delimitador rejeitado na escrita, `empresaId` só do webhook). Imperativo dirigido ao Otto é recusado mesmo se o dono aprovar em bloco.
6. **A base tem teto, e o teto é margem.** Alvo de 4.000 tokens no bloco de negócio (margem 66,3% na faixa de entrada), teto duro de 8.000 (margem 63,0%, o piso da faixa aprovada no ADR 004). Não existe "mande tudo e o Otto aprende": a diferença entre essa frase e "mande o material, o Otto tira respostas, você confere" é a margem do produto inteiro.

**Vocabulário para o empregador:** "base de conhecimento" não aparece em tela. O que o Otto sabe → **respostas**. Alimentar/treinar → **ensinar**. Documento → **material**. "Treinar" foi descartado: é jargão de IA e sugere sessão longa.

## Respostas do Felipe, 2026-09-09

| Ponto | Decisão |
|---|---|
| O Otto pode falar com o dono no WhatsApp para perguntar o que não soube? | **Sim, se o cliente autorizar — e por padrão está autorizado.** Teto de uma mensagem por dia. O desenho do consentimento está em `experiencia.md` §12 |
| O passo "confere se acertei" entra no onboarding? | **Sim** |
| O teto do que o Otto sabe de cor é visível ao dono? | **Sim, visível.** Ele também abriu uma decisão nova, sobre a franquia acabando e o pacote extra de atendimentos — está no ADR 004, nota de 2026-09-09, e em `experiencia.md` Decisão D |
| Rejeitar a base compartilhada entre empresas do mesmo nicho? | **Rejeitada pelo Felipe**, em 2026-09-09: *"rejeito fortemente. Pense na escalabilidade disso, inviável."* Ver a nota abaixo — a rejeição fica de pé por dois motivos independentes, e o dele não era o que estava escrito aqui |

### A base compartilhada, rejeitada por dois motivos

O Felipe rejeitou lendo a proposta como "um banco de dados por nicho". **Não precisaria ser** — a forma mais provável seria uma tabela só, com as respostas marcadas por nicho, dentro do mesmo banco do ADR 023. Mas a rejeição fica de pé, e agora por dois motivos que não dependem um do outro:

1. **O dele, de operação.** Qualquer que seja a forma, alguém teria que curar o que entra: decidir que a resposta que a assistência A escreveu serve para a B, mantê-la quando o preço muda, e responder por ela quando estiver errada. Isso não escala com o número de clientes, e é trabalho humano recorrente num produto cujo custo variável está fechado em R$ 0,295 por atendimento.
2. **O de vazamento, que era o registrado.** A resposta que o dono guarda é texto escrito por ele, sobre o negócio dele, muitas vezes com preço que ele não publica. Servir isso a um concorrente do mesmo bairro é vazamento por desenho, e nenhuma camada do ADR 023 pega — porque do ponto de vista do banco está tudo certo.

**O que continua valendo, e não é isto:** a base **pré-configurada por nicho**, escrita pela nossa operação (ADR 007, "Otto pré-configurado mira um nicho por vez"). Ela é conteúdo nosso, não de cliente; é escrita uma vez, não curada continuamente; e é o que faz o passo "confere se acertei" ter o que mostrar. As duas coisas se pareciam no nome e não têm nada em comum na origem do conteúdo.

## Consequências

- **Duas telas novas e três barras** dentro de telas que os ADRs 012 e 015 já exigiam. Nenhum evento novo: campos em quatro eventos existentes, e o teto de 20 eventos de `dados.md` fica intacto.
- **Uma coluna nova no registro de campo**, sem código: `tem_material_escrito_do_negocio`. Pode inverter a prioridade entre foto e PDF antes de alguém escrever a primeira linha.
- **O modo de teste** que o ADR 015 deixou pendente é absorvido pela tela "Conversar com o Otto".
- **Sai do desenho:** barra de progresso de "Otto 40% treinado" (mede o tamanho da base, que é a coisa errada, e custa margem), guia e central de ajuda no painel, base ilimitada por documento, pastas e etiquetas, versionamento.
- **Rejeitada, não adiada:** base de conhecimento compartilhada entre empresas do mesmo nicho depois da configuração. É a única peça do desenho com risco de vazar conteúdo de um cliente para outro. A base **pré-configurada** por nicho, escrita pela operação, continua valendo — ela não tem conteúdo de cliente nenhum.
- **Revisão proposta a `integracoes.md` §3:** a jogada mais forte da camada 0 não é ler o histórico para trás, e sim acumular a partir de agora. A Cloud API não entrega histórico anterior à conexão, o consentimento é hipótese não verificada com peso de LGPD, e uma semana de atendimento entrega o mesmo de graça, já autorizada pelo ADR 014.
- **Ressalva ao ADR 004:** a segunda camada ("o resto é consultado") **não existe na v1**. Buscar trecho por mensagem custa 6,4× o token cacheado e só empata acima de ~4.900 tokens de base. Até o gatilho de recuperação, tudo o que o Otto sabe é de cor.

## Evidência comportamental (fichas)

Fichas completas em `experiencia.md` §12.8 (dez fichas) e `conversa.md` §11. As duas que decidem:

| Afirmação | Tipo | Grau | O que a mata |
|---|---|---|---|
| Conferir uma resposta pronta tem custo de decisão muito menor que escrever diante de campo em branco | Preferência | **INFERIDO**, direção robusta (custo de decisão, `behavioral-evidence` §4); magnitude não aberta | Testável com papel e 5 donos, antes de qualquer código |
| O dono toca "guardar essa resposta" logo depois de responder ao cliente | Taxa | **NÃO VERIFICADO** | Menos de 1 em 10 encaminhamentos respondidos virando resposta guardada, em 48 h, nas 10 primeiras contas |

## Gatilho de revisão

- **A porta da frente errou:** menos de 3 das 10 primeiras contas com pelo menos 5 respostas guardadas em 14 dias. Aí o problema não é a tela, é a premissa de que ele quer ensinar — e o produto vira encaminhador honesto sem base.
- **Upload sobe de acelerador a porta:** mais de 5 contas mandando material antes de guardar a primeira resposta pela barra.
- **Guia volta à mesa:** 5 ou mais pedidos de suporte, registrados na plataforma (ADR 014), sobre *como* ensinar — e não sobre o que o Otto respondeu.
- **Recuperação (RAG) entra:** 3 contas ativas no teto de 8.000 tokens, ou mediana das contas ativas acima de 5.000.
