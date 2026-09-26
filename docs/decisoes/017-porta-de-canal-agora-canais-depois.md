# 017 — Porta de canal agora, canais depois

Status: aceita (a porta) / **item 3 revisto pelo ADR 021 em 2026-09-09**
Data: 2026-09-08
Quem decide: Felipe

> **Revisão de 2026-09-09 (ADR 021 — Otto multicanal).** A porta e tudo que este ADR decidiu sobre ela continuam valendo, inclusive os riscos de e-mail e de widget e o gatilho de nicho para os dois. O que caiu foi o **item 3**: os canais não ficam mais fora por princípio. Este ADR só olhou e-mail e widget e não considerou **Instagram Direct e Messenger**, que rodam no mesmo app da Meta, não trocam o nicho do ADR 007 e são o que o concorrente principal já faz. Ordem dos canais e unidade de cobrança no [ADR 021](021-otto-multicanal.md), que decidiu **multicanal e não omnicanal**: cada endereço é um contato e o produto não tenta identificar a mesma pessoa entre canais.

## Contexto

Felipe quer que o Otto atenda também por **e-mail** e por um **chat no site da empresa cliente** (widget). Hoje `visao.md` fecha a v1 em "um cargo, um canal" e lista outros canais como fora de escopo.

Duas análises foram feitas, e elas apontam para lados diferentes que se resolvem juntos.

**O estrategista disse: não abrir canal agora.** Três razões. A primeira, que ampliar canal antes de validar o nicho é o mesmo erro de ampliar cargo antes de validar cargo. A segunda, que o hedge contra a Meta é direcionalmente real mas de magnitude não provada: o chat no site é a única superfície fora do controle da Meta, o que importa porque a plataforma é o concorrente, mas 82% das MPEs usam WhatsApp como canal principal e 83,8% dos consumidores o citam como contato preferido (`pesquisa-2026-09.md`). A terceira, e a mais importante: **isto é decisão de nicho disfarçada de decisão de canal.** Dono de assistência técnica de bairro provavelmente não usa e-mail com cliente final nem depende de site; vive de indicação e WhatsApp. E-mail e widget servem melhor clínica, escritório, agência e B2B. Construir os dois seria trocar de nicho sem passar pelo ADR 007, ainda por cima com o experimento 001 adiado.

**O especialista de backend disse: construir a abstração agora.** Não há código escrito. Este é exatamente o momento em que a decisão de abstração custa quase nada e depois custa reescrita. Sem ela, o telefone vira a chave de identidade em todo lugar, a janela de 24 horas vira regra do núcleo, e o custo por resposta nasce grudado na tarifa da Meta.

As duas coisas são compatíveis: **decidir a arquitetura agora, construir os canais depois.**

## Decisão

### 1. A porta `CanalDeAtendimento` entra no núcleo na v1

Interface no núcleo, um adaptador por canal. Na v1 existe um adaptador real, o da Meta Cloud API. E-mail e widget ficam como interface declarada e implementação que recusa, não como código morto.

| Operação | Contrato |
|---|---|
| `receberMensagem` | Normaliza o evento bruto do canal em mensagem recebida: remetente, texto, anexos, id externo, horário |
| `enviarResposta` | Envia o conteúdo já pronto; devolve id externo para idempotência |
| `identificarRemetente` | Devolve identidade com tipo (telefone, e-mail, sessão anônima), valor e se é confiável. **Não** devolve o hash do cliente: isso é do núcleo |
| `janelaDeCusto` | Se existe janela, quando expira e quanto custa a mensagem fora dela. A Meta preenche; e-mail e widget respondem que não existe |
| `capacidades` | Suporta anexo, suporta thread, exige confirmação de entrega |

**Não sobe para a porta**, porque é específico de um canal: formato de template pago, assinatura do webhook da Meta, SPF e DKIM, identificador de mensagem da Meta, sessão do widget, leitura de MIME.

### 2. O que muda no que já está desenhado

| Hoje assume WhatsApp | Como fica |
|---|---|
| Janela de 24 horas e mensagem de serviço cobrada | Vira resposta do adaptador, não regra do núcleo. O cálculo de custo pergunta ao canal em vez de presumir |
| Identidade é o telefone, e o hash do cliente nasce dele | O hash passa a nascer do par tipo e valor da identidade. Sessão anônima do widget não é pessoa recorrente sem login, e o produto não pode fingir que é |
| Lista de contatos fora do atendimento (ADR 015), indexada por telefone | Passa a indexar por canal mais identidade. "Fornecedor" faz sentido no WhatsApp; em e-mail vira filtro de remetente; no widget não existe, porque todo visitante é desconhecido |
| Grupo nunca atendido | Continua, mas como regra **do adaptador da Meta**, não do núcleo. Não existe grupo em e-mail nem em widget |
| Aviso de encaminhamento por template da Meta (ADR 012) | Precisa de um canal de aviso próprio ao empregador (e-mail interno ou aviso no painel), porque nem toda empresa vai acompanhar todos os canais pelo WhatsApp |
| Custo por resposta é token mais tarifa da Meta | Vira token mais a tarifa do canal, que pode ser zero |
| Fila por situação (ADR 015) | Não muda. Já é estado, não canal |

**Eventos.** `resposta.enviada` e `conversa.encerrada` ganham o campo `canal`, hoje implícito e ausente do catálogo de `dados.md`. Isso entra agora, mesmo com um canal só, porque retroencaixar canal em série histórica não funciona.

### 3. Os canais não entram na v1

E-mail e widget ficam fora, pelas três razões do estrategista. O que decide se entram, e para qual segmento, é dado de campo, não opinião.

### 4. A pergunta que decide

Entra no registro das 10 conversas de campo, e ela vale mais que o debate de canal:

> **Você tem site? Cliente te procura por e-mail, ou é tudo WhatsApp?**

Se o nicho candidato responder que não tem site e não usa e-mail, os dois canais servem a outro segmento, e abri-los é mudar de nicho. Essa decisão passa pelo ADR 007, não por este.

## Consequências

- **Backend.** A porta entra no primeiro código, junto com a validação do ADR 005. O adaptador da Meta é o único real. O custo disso é baixo; o custo de não fazer é reescrever identidade, contatos e custo por resposta depois.
- **Dados.** Campo `canal` nos eventos de resposta e de conversa. Nova coluna no registro de campo com a pergunta acima.
- **Cobrança.** Pendência nova: **canal sem tarifa da Meta custa menos por conversa.** Se a métrica exibida for única, ela fica generosa demais em um canal e cara demais em outro. Decidir se a franquia é por canal ou única quando o segundo canal existir, não antes.
- **ADR 015.** A lista de contatos fora do atendimento passa a ser por canal mais identidade. A regra de grupo desce para o adaptador da Meta.
- **ADR 012.** O aviso ao empregador precisa de um caminho que não dependa da Meta.
- **Marca.** Nada muda. O Otto é o mesmo funcionário em qualquer canal; o que muda é onde ele trabalha, não quem ele é.

## Riscos próprios de cada canal, registrados para quando chegar a hora

- **E-mail.** Entrega depende de SPF, DKIM e DMARC no domínio de envio, com provedor de envio dedicado e separado de qualquer domínio de marketing. Precisa de encadeamento de thread, assunto herdado, anexo com antivírus e limite de tamanho. O equivalente ao banimento do WhatsApp aqui é cair em spam, e é igualmente difícil de reverter.
- **Widget.** Sessão anônima não tem identidade estável. Robô pode inflar custo de inferência sem que haja saldo identificável a debitar, o que é uma porta de abuso direta contra a franquia. O script roda no domínio do cliente, com as questões de isolamento que isso traz. E o dado do visitante tem base legal mais frágil que no WhatsApp, onde a pessoa iniciou a conversa.

## Evidência comportamental (fichas)

| Afirmação | Tipo | Grau | O que a mata |
|---|---|---|---|
| Dono de assistência técnica de bairro não usa e-mail com cliente e não tem site | Capacidade | INFERIDO (vive de indicação e WhatsApp; sem fonte para o nicho) | 5 ou mais das 10 conversas de campo dizerem que têm site com movimento ou que recebem cliente por e-mail |
| Chat no site protege o Otto se a Meta fechar o buraco | Ausência | NÃO VERIFICADO | Só se mede se acontecer. Por isso a porta entra e o canal não |
| Visitante anônimo de site converte em conversa útil sem pedir identificação | Taxa | NÃO VERIFICADO | Nenhum comparável levantado |

## Gatilho de revisão

- **Abrir um canal novo** exige as duas coisas juntas: nicho confirmado (ADR 007) e dado de campo mostrando volume real naquele canal para aquele nicho.
- **Widget antes de e-mail**, se algum entrar. É mais perto do núcleo, não depende de reputação de domínio e é o único canal fora da Meta.
- **Antecipar o widget** se houver sinal concreto de que a Meta está fechando o buraco de memória e equipe no WhatsApp.
- Revisar a porta se um terceiro canal aparecer e não couber nas cinco operações.
