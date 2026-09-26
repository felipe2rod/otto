# 014 — Conteúdo das conversas a serviço do produto

Status: aceita
Data: 2026-09-08
Quem decide: Felipe

## Contexto

O plano de dados (`dados.md`) e o agente analista de produto nasceram com uma regra rígida: conteúdo de mensagem não é dado de analytics; só metadados e rótulos derivados; leitura de texto só por amostra anonimizada e com consentimento à parte. A intenção era prudência com dado pessoal do cliente final.

Felipe perguntou se havia motivo legal para isso que termos de uso adequados não resolvessem. A resposta foi: não há proibição absoluta. Com contrato certo (Otto como operador da empresa cliente, cláusula de uso para melhoria do produto, base de legítimo interesse, pseudonimização, retenção declarada), usar o conteúdo é defensável. Os limites reais são três: dado sensível que aparece espontaneamente (a LGPD não aceita legítimo interesse para saúde, religião, orientação sexual), transparência com o cliente final, que depende do aviso de privacidade da empresa cliente, e o princípio de necessidade.

Felipe decidiu: **ser menos rígido. A rigidez estava atrapalhando o desenvolvimento do produto. Só há freio onde houver consequência legal clara. Os três limites são sensíveis, mas se resolvem de outras formas, sem prejudicar o produto.**

## Decisão

1. **O conteúdo das conversas pode ser usado para melhorar o produto.** Ler, classificar, agrupar, medir qualidade de resposta, treinar avaliadores, montar casos de teste. Isso vale para a operação (Felipe e time) e para processos automáticos.
2. **O que autoriza é o termo de contratação** que a empresa aceita no cadastro, com data e versão registradas. Ele nomeia a finalidade (melhorar o atendimento e o produto), declara pseudonimização e retenção, e obriga a empresa a mencionar o tratamento no aviso de privacidade dela. Sem tela extra, sem consentimento separado.
3. **Os três limites se resolvem no produto, não com proibição:**
   - **Dado sensível.** O classificador que já roda em cada mensagem marca conteúdo sensível (saúde, religião, sexualidade, biometria, menor de idade). Mensagem marcada fica fora da análise de produto e da amostra humana. Nicho com dado sensível por natureza (saúde) exige ADR próprio antes de entrar.
   - **Transparência.** Cláusula contratual obrigando a empresa a informar; texto pronto para ela copiar no aviso de privacidade, escrito pelo guardião da marca.
   - **Necessidade.** Toda leitura de conteúdo tem uma pergunta de produto nomeada em `dados.md`. Não é proibição; é o mesmo critério que vale para qualquer dado: se não muda decisão, não se coleta.
4. **Pseudonimização barata continua.** Telefone do cliente final vira hash nos eventos de análise. Custa nada e não atrapalha. No banco de produto, onde a empresa precisa ver quem escreveu, fica em claro.
5. **Retenção é a que a empresa escolher** para as conversas dela (30, 90 ou 365 dias; padrão 90). Dados derivados para análise seguem a retenção de `dados.md`.
6. **Confirmar com advogado antes do lançamento**: cláusula do termo, relatório de impacto simples e os termos da Meta para conteúdo de mensagens (não verificados). Isso é tarefa, não bloqueio.

## Consequências

- **Agente analista-de-produto.** Regra 1 reescrita: conteúdo é insumo legítimo de produto; texto fora dos eventos por economia, não por proibição; leitura de texto tem pergunta nomeada. Postura geral: dado a serviço do produto; freio só com consequência legal clara.
- **Agente especialista-backend.** Regra 9 reescrita: histórico é lido pela operação com base no termo aceito; classificador marca sensível; log não guarda texto por higiene de log, não por proibição de uso.
- **`dados.md`.** Seção "O que não se coleta" encolhe para o que realmente não se coleta (dado sensível marcado, telefone em claro nos eventos). Pendência 8 fecha. Eventos podem ganhar campos derivados de conteúdo à vontade (assunto, tom, qualidade avaliada). Amostra humana deixa de ser exceção.
- **Registro de pedidos de suporte (pendência 10 de `dados.md`).** Não há planilha. Pedido de suporte, reclamação e pedido de integração são registrados **dentro da própria plataforma**, em área de operação, desde os primeiros clientes. Os gatilhos de ADR que contavam com a planilha passam a contar com esse registro.
- **Termo de contratação.** Ganha a cláusula de uso para melhoria e a obrigação de transparência. Texto com o guardião; revisão jurídica antes do lançamento.

## Gatilho de revisão

- Rever se advogado apontar consequência legal clara que o desenho acima não cubra.
- Rever antes de entrar em nicho com dado sensível por natureza (saúde, jurídico, religioso).
- Rever se a Meta restringir contratualmente o uso de conteúdo de mensagens de forma que afete o item 1.
