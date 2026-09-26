# 015 — Contatos fora do atendimento e fila por situação

Status: aceita (contatos e fila) / a confirmar pelo Felipe (etapa do negócio fora da v1)
Data: 2026-09-08
Quem decide: Felipe, com desenho do especialista de UI/UX e parecer do estrategista

## Contexto

Felipe pediu um produto customizável e flexível, com o objetivo declarado de "gerar o máximo de valor possível para o cliente". Deu dois exemplos: uma lista de contatos salvos que não entram no atendimento por IA, e uma forma de organizar conversas com categorias, etiquetas ou quadros estilo kanban, com etapas de exemplo "cliente novo, prospecção, venda, já comprou". Delegou explicitamente ao especialista de UI/UX escolher a melhor forma.

A tensão: `visao.md` diz que o escopo da v1 é pequeno de propósito ("responder bem e encaminhar bem já vale o salário"). Isto amplia.

O estrategista foi consultado. Parecer: excluir contatos entra; etiqueta, categoria e kanban não defendem contra a Meta e atrasam. Razões: **etiqueta já é nativa e grátis no aplicativo WhatsApp Business**, então organizar não é o buraco da Meta; o buraco documentado é **memória da relação**, que é ficha do cliente preenchida pelo Otto, não quadro que o dono mantém; kanban joga o Otto no território de Digisac, Kommo e Poli, onde eles têm anos de recurso; e cada campo configurável multiplica caso de suporte com um fundador só, contra a defesa nº 1 do Otto, que é responder e não sumir.

## Decisão A — Contatos que o Otto não atende

A empresa marca contatos que o Otto ignora. Casos reais: fornecedor, contador, família, funcionário, cliente que exigiu falar só com gente.

| Item | Decisão |
|---|---|
| Como entra | **Marcado a partir da conversa**, um toque (o caminho principal, reativo, depois do primeiro susto); **digitado** (número e nome opcional); **automático** para as pessoas cadastradas para aviso no modo Aviso (ADR 012), que hoje seriam atendidas como cliente ao escrever para a empresa |
| O que o Otto faz | **Silêncio total** para aquela pessoa. Não responde, não saúda, não anota recado, porque não houve conversa para anotar |
| O que a empresa recebe | **Aviso no WhatsApp**, em qualquer modo de encaminhamento, e a conversa em "Esperando você". Sem o aviso, a empresa perderia a mensagem do fornecedor, já que responder pelo aplicativo do WhatsApp Business não está na v1 (ADR 012, regra 5) |
| Reverter | Um toque, sem confirmação. Chave "O Otto atende essa pessoa" na tela do contato |
| Motivo | Opcional, um toque, quatro fichas: fornecedor ou parceiro, pessoal, da equipe, cliente que pediu falar só com gente. Ignorar é o padrão |
| Grupos | **Regra global: o Otto nunca atende grupo.** Sem lista, sem configuração |
| Número desconhecido que pede uma pessoa | Não tem relação com a lista. É pedido de pessoa, tratado pelo modo de encaminhamento da empresa (ADR 012). **O Otto nunca coloca ninguém na lista sozinho**: quem pede o Zé hoje pode voltar amanhã perguntando preço |
| Lógica inversa (o Otto só atende quem está numa lista) | **Rejeitada, não adiada.** Cliente novo é sempre número desconhecido; a falha seria silenciosa e invisível |
| Importar agenda ou planilha | Fora da v1. Volume esperado por conta é de poucas pessoas. Entra se uma conta passar de 20 contatos fora do atendimento |

## Decisão B — Fila por situação

A organização principal é uma **fila por situação, atribuída pelo Otto, sobre uma lista de pessoas**. Quatro situações fechadas, que a empresa não cria nem renomeia.

| Situação | Significa | Quem coloca | Ordem |
|---|---|---|---|
| **Esperando você** | O Otto encaminhou e ninguém assumiu; ou o prazo esgotou; ou escreveu alguém de "só você atende"; ou é grupo | Otto | Mais antiga primeiro |
| **Com você** / **Com [nome]** | Alguém da empresa assumiu; o Otto parou naquela conversa | Quem assumiu | Mais recente primeiro |
| **Com o Otto** | O Otto está atendendo. Nada a fazer | Otto | Mais recente primeiro |
| **Resolvida** | Encerrada, nada pendente. Recado retornado entra aqui | Otto, ou a empresa com um toque | Só as de hoje |

Regras:

1. **É a mesma caixa de entrada que o ADR 012 já exigia**, não tela nova. No modo Recado, "Esperando você" é a lista de recados; no modo Aviso, o que ninguém assumiu; no modo Equipe, a fila.
2. **A situação é regra, não modelo.** Sai do estado que já existe (encaminhamento, quem assumiu, recado, contato fora do atendimento). Não depende de classificação de texto, logo é barata e não erra por criatividade.
3. **O Otto classifica sempre; a empresa corrige com um toque, e a correção é sinal.** Duas correções possíveis: "resolvi isso" e "isso é comigo". Fila que exige triagem manual está vazia de valor no primeiro dia e morta na segunda semana.
4. **Conversa Resolvida em que o cliente escreve de novo volta sozinha para "Com o Otto".**
5. **A lista principal nunca carrega mais de um dia de conversas resolvidas.** O feed é o trabalho de hoje; a **memória mora na pessoa**, na tela de contato, com histórico de conversas. É isso que a Meta não tem.
6. **Assunto é leitura, não pasta.** O resumo do dia diz "hoje 4 pessoas perguntaram preço", usando o campo que o classificador já grava. Sem filtro, sem etiqueta, sem manutenção.
7. **Valor no dia 1, sem configurar nada:** a primeira linha do painel responde "quem ficou esperando você", com número, não sensação. É a metade de cima da mesma tela do resumo do dia.

### Por que as outras formas perderam

| Forma | Motivo |
|---|---|
| **Etiquetas livres** | Campo em branco obriga o dono a inventar uma taxonomia; ele nunca usou sistema. O Otto não classifica em conjunto aberto que ainda não existe. Em 30 dias vira "urgente", "urgente2", "ver" |
| **Kanban** | Arrastar cartão no celular com a mão ocupada é o gesto mais caro do produto. Exige desenhar colunas antes de haver valor. Ilegível com 300 conversas. E quadro que ninguém arrasta mente; painel que mente é pior que painel nenhum |
| **Categorias fixas de assunto** | Não respondem "o que é comigo?". Entram como leitura no resumo, não como pasta |
| **Etapa comercial** (o exemplo do Felipe) | É sequência real, e Felipe está certo de que é sequência e não rótulo solto. Mas é **do negócio, não da conversa**: em assistência técnica a sequência é orçamento, aprovado, em conserto, pronto, entregue, que não se parece com funil de venda. Cada segmento tem a sua. Fica para depois, **com desenho pronto** |

### Etapa do negócio: fora da v1, com desenho pronto e gatilho

Registrado para a decisão futura não recomeçar do zero. **"Fora da v1" não é "não".**

1. A empresa **não desenha colunas**. Responde em texto livre "por que fases passa um cliente aqui?" e o Otto propõe de 3 a 5 etapas para aceitar ou ajustar. Mesmo princípio do ADR 007.
2. **O Otto move a etapa sozinho**, lendo a conversa. O dono nunca arrasta; corrige com um toque, e a correção é sinal.
3. A etapa mora **na pessoa**, não na conversa.
4. É **lista com filtro**, não quadro.
5. **Gatilho:** cinco contas pedirem (mesma regra do ADR 006), **ou** a fase 0 mostrar que o dono já mantém isso hoje em caderno ou planilha. A evidência já está sendo coletada: a pergunta está no registro de campo.
6. Etapa que o Otto não consegue mover sozinho não entra.

## Consequências

- **`visao.md`.** A v1 ganha duas linhas em "Faz": contatos fora do atendimento e caixa de entrada com fila por situação. O escopo cresce de forma contida: a fila é a caixa de entrada que o ADR 012 já exigia.
- **`experiencia.md`.** Documento novo do especialista de UI/UX, com telas, estados, jornadas e fichas comportamentais. É a fonte para o especialista-react.
- **Dados (`dados.md`).** `conversa.encerrada` ganha `desfecho = nao_atendida`, sem o que M1 e M2 contariam contato fora do atendimento como falha do Otto. `recado.retornado` vira `conversa.marcada`, absorvendo as correções manuais de situação. Campos novos em configuração, conversa iniciada, conta ativada, resumo e registro de suporte. Sem evento novo.
- **Backend.** Nova entidade contato por empresa, com atendimento ligado ou desligado e motivo. O webhook consulta a lista antes de montar o prompt: contato fora do atendimento não gera inferência, o que **reduz custo variável**. Grupo idem. Aviso à empresa é template pago da Meta (`cobranca.md`, pendência 7).
- **Marca.** "Só você atende" e "O Otto não atende essa pessoa" são as frases da lista; texto fechado pelo guardião.
- **Treinador do Otto.** Caso de teste novo: mensagem de contato fora do atendimento não gera resposta nenhuma, em nenhum preset.

## Evidência comportamental (fichas)

| Afirmação | Tipo | Grau | O que a mata |
|---|---|---|---|
| Existe alguém que escreve no número comercial e não é cliente, em quase toda conta | Capacidade | INFERIDO (número comercial de negócio pequeno costuma ser o mesmo do dono) | Menos de 3 das 10 primeiras contas marcarem algum contato em 30 dias |
| O dono quer saber "quem ficou esperando" mais do que "quantos atendi" | Preferência | NÃO VERIFICADO | Nas 10 conversas de campo, a maioria descrever o dia pelo volume e não pelo pendente |
| O dono de 1 a 3 pessoas não mantém funil comercial | Taxa | INFERIDO | 6 das 10 conversas de campo mostrarem um artefato mantido diariamente (etiqueta em uso, planilha de status, caderno) |
| Silêncio total para contato marcado não gera reclamação do contato | Ausência | NÃO VERIFICADO | Só se mede provocando: pergunta do dia no resumo |

## Gatilho de revisão

- **Etapa do negócio entra** com cinco contas pedindo, ou com 6 de 10 conversas de campo mostrando artefato mantido diariamente.
- **Etiquetas livres** só voltam à mesa se a etapa do negócio for entregue e fracassar.
- **Importar contatos** entra com uma conta acima de 20 contatos fora do atendimento.
- **Busca na lista** entra com volume medido, não com palpite.
- **Modo de teste** ("o Otto só atende meus números enquanto testo") entra se 3 das 10 primeiras contas pedirem para testar antes de soltar o número.
- Rever a lista inteira se menos de 3 das 10 primeiras contas marcarem algum contato em 30 dias.
