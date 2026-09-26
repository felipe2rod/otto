# 012 — Encaminhamento configurado pelo empregador

Status: substituída por 026 (pivô para a ferramenta de design, 2026-09-26). Status anterior: aceita
Data: 2026-09-08
Quem decide: Felipe

## Contexto

O Otto passa a conversa para uma pessoa quando não sabe, quando o cliente final pede, quando o assunto é sensível ou quando a regra da empresa manda (`visao.md`). O plano de dados (`dados.md`, pendência 1) travou em uma pergunta: **quando o Otto passa, onde a pessoa da empresa pega?** Sem resposta, o tempo até alguém assumir não pode ser medido, e esse tempo é a falha da Meta que o Otto promete corrigir ("encaminhamento que esfria").

Foram apresentadas três formas fixas ao Felipe: caixa de entrada no painel, aviso com link no WhatsApp do dono, ou resposta direta pelo aplicativo do WhatsApp Business. Felipe decidiu que **nenhuma delas é a resposta**: quem define é o próprio cliente, conforme a necessidade dele. Há empresa que não quer encaminhar nada e há empresa com dez atendentes esperando. O produto precisa servir aos dois extremos.

## Decisão

O destino do encaminhamento é **configuração do empregador**, com três modos. O modelo de dados, a configuração e os eventos contemplam os três desde o início.

| Modo | Para quem | O que o Otto faz quando encaminharia | Como a pessoa responde |
|---|---|---|---|
| **Recado** | Ninguém | Anota o recado: nome, o que a pessoa precisa, melhor horário para retorno. Diz ao cliente final que a empresa vai retornar, no texto do preset. Recado vai para o painel e para o resumo do dia | Não responde pelo Otto. A empresa retorna por conta própria |
| **Aviso** | Uma ou algumas pessoas cadastradas | Manda aviso no WhatsApp de cada pessoa cadastrada, com link. Quem abrir primeiro assume. Enquanto ninguém assume, o Otto segue com o cliente no que souber | Pela conversa aberta no painel (web, celular), pelo link do aviso |
| **Equipe** | Fila de atendentes | Coloca a conversa na fila da caixa de entrada da equipe, com o resumo do que já foi dito. Quem pegar primeiro assume (v1); distribuição por regra vem depois | Pela caixa de entrada do painel, com vários atendentes ao mesmo tempo |

Regras comuns aos três modos:

1. **Fora do horário de atendimento**, qualquer modo cai para **Recado**. O horário é configuração do empregador.
2. **Um modo por empresa** na v1. Modo por motivo de encaminhamento (ex.: assunto sensível vai para o dono, dúvida vai para a fila) é evolução, quando houver pedido de 5 contas (mesmo critério do ADR 006).
3. **O Otto não some depois de encaminhar.** Ele informa o cliente final que alguém vai assumir, continua respondendo o que souber e, se ninguém assumir no prazo que o empregador definir, volta ao modo Recado para aquela conversa.
4. **Quem assumiu passa a responder; o Otto para de gerar resposta naquela conversa** até a pessoa devolver para ele ou a conversa encerrar. Tudo que a equipe escreve passa pelo mesmo número, via Cloud API.
5. **Responder pelo aplicativo do WhatsApp Business no mesmo número** (coexistência com a Cloud API) **não está na v1**. Depende de recurso da Meta que não validamos. Se a validação do ADR 005 mostrar que funciona, vira um quarto modo por ADR próprio.
6. O texto que o cliente final lê em cada modo segue o preset (`estilos-de-atendimento.md`) e passa pelo guardião da marca. Nunca "ticket", "protocolo", "atendente humano".

## Ordem de entrega

Modelo de dados e configuração com os três modos desde a primeira versão do banco. Entrega da interface por etapa:

1. **Recado** e **Aviso** na v1, porque o primeiro nicho candidato (assistência técnica de bairro) é de uma a três pessoas, todas com a mão ocupada.
2. **Equipe** com fila entra quando o primeiro cliente com mais de três atendentes assinar, ou quando o experimento 001 mostrar que o nicho vencedor tem equipe.

Isso é sequência de construção, não de decisão. Os três modos são produto desde já; o que se escalona é a tela.

## Consequências

- **Dados (`dados.md`).** O evento `encaminhamento.solicitado` ganha `modo` e `pessoas_avisadas`; `conversa.encerrada` ganha `quem_assumiu` (ninguém, pessoa avisada, atendente da fila) e `recado_registrado`. O tempo até a equipe assumir só existe nos modos Aviso e Equipe; no modo Recado, a métrica é **recados retornados pela empresa**, que exige a empresa marcar o recado como resolvido no painel. Pendência 1 de `dados.md` fecha.
- **Backend.** Nova configuração da empresa: `modo_de_encaminhamento`, `horario_de_atendimento`, `pessoas_para_aviso`, `prazo_para_assumir`. Novo contexto delimitado **atendimento humano**: conversa assumida, fila, recado. O aviso por WhatsApp é mensagem iniciada pela empresa para o número da própria equipe, fora da janela de 24 h: paga template da Meta. Entra no custo variável e em `cobranca.md`, pendência 7.
- **Frontend.** Tela de configuração do encaminhamento no onboarding e uma caixa de entrada que serve ao modo Aviso (uma conversa por link) e ao modo Equipe (fila). A mesma tela, com e sem fila.
- **Marca.** "Recado" é palavra da marca para o que a empresa faz sem equipe. Vocabulário de `identidade.md` ganha a linha.
- **Visão.** `visao.md` passa a dizer que a forma de passar para a equipe é escolha da empresa.

## Evidência comportamental (fichas)

| Afirmação | Tipo | Grau | O que a mata |
|---|---|---|---|
| Dono de assistência técnica de bairro prefere aviso no próprio WhatsApp a abrir um painel | Preferência | INFERIDO (o WhatsApp já está aberto o dia todo; painel é desvio) | Se, em 10 contas do nicho, mais de 5 escolherem Recado ou pedirem outra coisa |
| Recado sem retorno da empresa é o que faz o cliente final desistir, mais que resposta da IA | Atribuição | NÃO VERIFICADO | Só se mede com o campo `recado_retornado` do painel e a pergunta do dia do resumo |
| Existe demanda de empresa com fila de atendentes no primeiro ano | Taxa | NÃO VERIFICADO | Nenhum cliente com mais de 3 atendentes em 12 meses: a fila fica no papel |

## Gatilho de revisão

- Construir a fila (modo Equipe) quando o primeiro cliente com mais de 3 atendentes assinar.
- Rever o modo Aviso se, em 30 dias, mais de 30% dos avisos não forem assumidos dentro do prazo configurado (dado de `conversa.encerrada.quem_assumiu`).
- Abrir ADR para coexistência com o aplicativo do WhatsApp Business se a validação do ADR 005 mostrar que a Meta permite o mesmo número nos dois lugares.
- Modo por motivo de encaminhamento quando 5 contas pedirem.
