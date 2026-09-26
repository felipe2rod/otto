# 021 — Otto multicanal: cada canal é um contato, e está tudo bem

Status: aceita (multicanal, e não omnicanal, pelo Felipe) / proposta (ordem dos canais)
Data: 2026-09-09
Quem decide: Felipe

Revisa o **item 3 do ADR 017** ("os canais não entram na v1").

## Contexto

Felipe: "iremos ser omnichannel, não há motivos para o Otto atuar apenas no WhatsApp." Apresentada a diferença entre multicanal e omnicanal, corrigiu no mesmo dia: **"o certo é multicanal. Não vejo porque identificar a pessoa em canais diferentes."**

Fica registrada a distinção, porque ela vai voltar em toda conversa sobre canal:

| | O que é | O que custa |
|---|---|---|
| **Multicanal** | O Otto atende em N canais. Cada endereço é um contato, cada conversa é uma conversa | Um adaptador por canal. É quase só isso |
| **Omnicanal** | A mesma pessoa e o mesmo histórico, tenha ela falado por onde falar | A identidade: fusão, prova de fusão, desfazer fusão, tela para o empregador confirmar — e o risco de errar |

**Multicanal está escolhido.** E não é só o caminho barato: é o mais seguro. A fusão de identidade era **a única peça de todo o desenho com risco de vazamento entre clientes finais** — fundir errado mostra a conversa de uma pessoa para outra, o freio com consequência legal clara do ADR 014. Sem fusão, esse risco não existe.

### O ADR 017 errou o mapa de canais, e isso continua valendo

O 017 decidiu sobre os dois canais que estavam na mesa — e-mail e widget — e concluiu, com razão para esses dois, que abri-los seria trocar de nicho sem passar pelo ADR 007. **Não olhou Instagram Direct e Messenger.** Três motivos independentes os separam dos outros:

1. **O concorrente principal já está lá.** `pesquisa-2026-09.md` descreve o Meta Business Agent como IA nativa "no WhatsApp, **Instagram e Messenger**". Ficar em um canal só nunca foi foco em relação a ele; era déficit.
2. **Não trocam o nicho — reforçam.** Assistência técnica, barbearia, salão, loja de bairro e prestador de serviço, os candidatos do ADR 007, vivem no Instagram. E-mail e widget é que servem clínica, escritório e B2B, e o argumento do 017 sobrevive inteiro para eles.
3. **Custo marginal de outra ordem.** Mesmo app da Meta, mesma mecânica de webhook e de validação de assinatura que o WhatsApp já exige. Produto, permissão e endpoint diferem e precisam ser conferidos no protótipo, mas app, fila, idempotência e mídia já estão pagos. E-mail (SPF, DKIM, DMARC, reputação, thread) e widget (sessão anônima, isolamento, abuso) são do zero.

**Contraponto registrado:** Instagram e Messenger **aprofundam** a concentração na Meta. O widget continua sendo a única superfície fora do controle dela, como o 017 identificou. São duas lógicas — alcance e margem × proteção — e a primeira não resolve a segunda.

## Decisão

### 1. Multicanal: cada identidade é um contato, e o produto não tenta adivinhar a pessoa

O Otto **não** procura descobrir que o telefone `+55…` e o `@fulano` são a mesma pessoa. Não há agregado `Pessoa`, não há fusão, não há sugestão de fusão, não há tela para desfazer.

**Nada muda no plano de dados.** O `cliente_hash` continua como o ADR 017 já definiu: HMAC do par (tipo de identidade, valor da identidade), com sal por empresa. Ele identifica a identidade, que é justamente o que este ADR diz ser a unidade do produto. Nenhum campo novo, nenhum evento novo.

**Regra de comportamento, e ela ficou mais simples:** o Otto trata cada conversa como quem chegou ali. Nunca diz "vi que você me chamou no Instagram" — não porque seja proibido, mas porque ele não sabe. Menos estranheza para o cliente final, zero chance de errar a pessoa.

### 2. Um atendimento é uma conversa com uma identidade em 24h

A unidade de cobrança do ADR 004 fica como está, com o canal apenas explicitado: quem falar no WhatsApp e no Instagram no mesmo dia gera **dois** atendimentos. O teto de 10 respostas conta por conversa.

Isso é coerente com o custo — são duas conversas, dois prefixos, duas tarifas de canal — e **não** fere o critério do ADR 004. O empregador vê duas conversas na caixa de entrada e a conta bate com o que ele vê. Era a versão com pessoa que pedia uma explicação.

### 3. Franquia única, nunca por canal

Isto não depende de identidade e continua valendo. Canal sem tarifa da Meta custa menos por conversa (no WhatsApp a tarifa é 42% do custo variável; no Instagram e no Messenger, a conferir), mas franquia por canal poria uma taxa de câmbio na cabeça do empregador, e é isso que o ADR 004 proíbe. A proteção é medir: **`custo médio por crédito por canal`** entra junto com o primeiro canal novo. Se o mix derrubar a margem abaixo do piso, revê-se a franquia, nunca a unidade exibida.

Efeito provável, ainda não medido: o mix mexe na margem **para cima**.

### 4. Uma caixa de entrada só

Multicanal não quer dizer N caixas. As conversas são separadas, a caixa é uma: as quatro situações do ADR 015 já são independentes de canal, e **o canal é uma marca na conversa, nunca uma aba**. Ordenar por situação e espera; filtrar por canal é filtro, não estrutura. A forma é do especialista-ui-ux.

### 5. O Otto é o mesmo em todo canal

Caráter e estilo são da empresa, não do canal. **Não existe "Otto do Instagram".** O que varia é restrição de formato — tamanho, anexo, botão, janela de resposta — e isso vem de `capacidades` da porta (ADR 020), não de uma segunda persona. É o ADR 001 aplicado a canal: o plural do produto vive nos cargos, nunca nas caras.

### 6. Ordem de entrada (proposta, reversível)

| Fase | Canal | Por quê | O que precisa antes |
|---|---|---|---|
| v1 | **WhatsApp** | Decidido (ADR 005) | — |
| v1.1 | **Instagram Direct + Messenger** | Paridade com o concorrente principal, mesmo nicho, fundação já paga | Conferir no protótipo: permissão, endpoint, janela de resposta e se há tarifa por mensagem |
| v1.2 | **Widget no site** | Primeira superfície fora da Meta, a proteção que o ADR 017 identificou | Os riscos do 017 continuam: sessão anônima não é pessoa recorrente, e robô consome inferência sem saldo identificável |
| v2 | **E-mail** | Serve outro segmento; o argumento do ADR 017 sobrevive inteiro aqui | Domínio de envio dedicado, SPF, DKIM, DMARC, thread, anexo |
| gatilho | **Telegram, SMS, RCS** | Demanda medida | 5 contas distintas ou 20% das contas ativas (critério do ADR 006) |

Instagram e Messenger entram **por custo marginal e paridade**, não por gatilho de demanda. Os demais mantêm o gatilho do ADR 017: nicho confirmado mais dado de campo.

### 7. O que não é canal

**Telefone e voz são outro produto**, não outro canal: transcrição em tempo real, latência de conversa falada, custo e falha de outra natureza. **Marketplace** (Mercado Livre, iFood) é integração, não canal.

### 8. Este é o teste da porta do ADR 017

O adaptador do Instagram é o **segundo adaptador real** de `CanalDeAtendimento`. Pelo gatilho do ADR 020: se o núcleo precisar mudar para ele caber, o contrato foi desenhado sobre o WhatsApp, e a correção se registra ali. As cinco operações não ganham nada até esse adaptador provar que falta.

## Consequências

- **`visao.md`.** "Um cargo, um canal" passa a descrever só a v1. "Outros canais (Instagram, site, telefone)" sai de "não faz" e vira roteiro, menos telefone.
- **Dados (`dados.md`).** Só o enum `canal` cresce para `whatsapp, instagram, messenger, widget, email`, e `mensagem_servico_cobravel` passa a vir da tarifa do canal em vez de ser específico do WhatsApp. **`cliente_hash` fica exatamente como está.** Nenhum campo de pessoa, nenhum evento de fusão.
- **Cobrança (`cobranca.md`).** A pendência "canal sem tarifa da Meta" tem resposta: franquia única, custo medido por canal.
- **ADR 015 — o efeito colateral que sobra, e é o único.** Contato fora do atendimento é marcado **por endereço**, não por pessoa. Quem marcar o sogro no WhatsApp continua podendo receber mensagem dele no Instagram. Sem fusão, não há como evitar, e a saída é honestidade na tela: o painel diz que está silenciando **aquele número**, não "aquela pessoa", e ao ligar um canal novo oferece marcar de novo. Custa uma frase certa, não arquitetura.
- **ADR 012.** O aviso ao empregador não pode depender do canal da conversa. Vai por `AvisoAoEmpregador` (ADR 020).
- **ADR 020.** `CanalDeAtendimento` ganha o segundo adaptador real. É a porta que sai do papel primeiro.
- **Marca.** "Multicanal" e "omnichannel" são jargão e não aparecem para empregador nem cliente final. O que ele lê é da ordem de "o Otto atende onde seu cliente chamar". Texto final com o guardião.
- **Estratégia.** Sair do WhatsApp-só **tira uma desvantagem da mesa, não põe uma vantagem.** O diferencial continua sendo memória, equipe, integração e suporte (`pesquisa-2026-09.md`).

## O que fica em aberto de propósito

Juntar identidades depois é possível, e o custo de fazer depois não é o mesmo de fazer agora: dá para ligar dois endereços **daí em diante**, mas o histórico anterior fica separado, porque não há como saber retroativamente quem era quem. Registrado como fato para quando o assunto voltar, não como pedido.

## Evidência comportamental (fichas)

| Afirmação | Tipo | Grau | O que a mata |
|---|---|---|---|
| Empresa pequena de bairro recebe pedido por Instagram Direct, não só por WhatsApp | Incidência | INFERIDO (o Meta Business Agent cobre os três canais, o que sugere demanda; sem dado para o nicho candidato) | 10 conversas de campo: menos de 4 citarem Instagram como canal de venda |
| **O mesmo cliente final falar com a mesma empresa por dois canais é raro o bastante para não incomodar** | Taxa | **NÃO VERIFICADO — é a aposta deste ADR** | 5 empregadores distintos relatarem cliente duplicado ou histórico partido |
| O empregador entende contar dois atendimentos quando a mesma pessoa fala em dois canais | Atribuição | INFERIDO (ele vê duas conversas na caixa; a conta bate com a tela) | Reclamação de conta que não bate, o mesmo teste do ADR 004 |

## Gatilho de revisão

- **5 empregadores distintos relatarem cliente duplicado** ou histórico partido entre canais. Aí omnicanal volta à mesa, com a conta de fusão feita de novo — e com o risco de vazamento pesando junto. Mesmo critério do ADR 006.
- **Reclamação de cobrança** por contar dois créditos para a mesma pessoa em canais diferentes, nas mesmas 5 contas.
- **Custo médio por crédito acima do piso de margem** por efeito de mix de canal. Revisar a franquia, nunca a unidade exibida.
- **Núcleo precisar mudar para o adaptador do Instagram caber** (gatilho do ADR 020).
- **E-mail e widget continuam presos ao gatilho do ADR 017:** nicho confirmado mais volume medido de campo. Este ADR não os antecipa.

Nenhum desses gatilhos exige coletar nada a mais do que já está no plano.

## Nota de 2026-09-09 — a unidade exibida virou crédito (ADR 024)

Nada deste ADR muda de conteúdo. A unidade exibida deixou de ser "atendimento" e passou a ser **crédito**, com âncora 1:1, então a regra que este ADR fixou continua idêntica com a palavra trocada: **um crédito é um dia de conversa com uma identidade**, em qualquer canal. Quem falar no WhatsApp e no Instagram no mesmo dia gera **dois créditos** — duas conversas, dois prefixos, duas tarifas de canal —, e o empregador vê as duas conversas na caixa de entrada, que é o que faz a conta bater. O teto de 10 respostas continua contando por conversa.
