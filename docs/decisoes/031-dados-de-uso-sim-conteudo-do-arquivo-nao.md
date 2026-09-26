# 031 — Dados de uso servem ao produto; o conteúdo do arquivo é do cliente

Status: aceita (o princípio e o uso do texto do pedido, pelo Felipe) / proposta (a fronteira linha a linha, acesso e retenção)
Data: 2026-09-26
Quem decide: Felipe

## Contexto

No produto de WhatsApp, o conteúdo das conversas foi liberado para melhorar o produto (antigo ADR 014). No editor, o arquivo costuma ser trabalho de um cliente do designer, muitas vezes sob contrato de sigilo, com marca, campanha ainda não lançada e foto licenciada. O Felipe decidiu em 2026-09-26: **o conteúdo do arquivo é trabalho do cliente, mas o Otto coleta métricas e dados de uso para melhorar o produto.**

## Decisão

### 1. A fronteira

| Coletado para o produto (uso) | Não coletado (conteúdo) |
|---|---|
| Eventos com tipo, quando e quanto: operações aplicadas por tipo, tipos de nó tocados, número de pranchetas e camadas, tamanho do documento | A árvore do documento, os textos das camadas, os nomes de camada |
| Tarefa do agente: tipo classificado, voltas, tokens, imagens enviadas, duração, resultado (aceita, em parte, desfeita), erros de operação por código | Imagens, renders e arquivos enviados, fontes |
| Exportação e importação: duração, tamanho, recursos rasterizados e bloqueados **por tipo**, fontes faltando **por contagem** | O PSD em si e os nomes das fontes do cliente |
| Desempenho: quadros por segundo, tempo de render, erros do editor | Capturas de tela do editor |
| Sessão: entradas, duração, atalhos e painéis usados | Tokens de identidade visual com valor (cor e fonte da marca do cliente) |

**Regra de bolso:** se o dado permite reconstruir, ver ou identificar o trabalho do cliente, é conteúdo.

### 2. O pedido escrito ao Otto é dado de uso (decidido pelo Felipe em 2026-09-26)

O texto que o designer escreve ao agente, seja pedido livre, seja o preenchimento de um briefing (ADR 033), **pode ser lido e analisado pela equipe para melhorar o produto**, mesmo quando cita cliente, campanha, preço ou data. O Felipe escolheu isso em vez de guardar só um rótulo derivado, porque o agente melhora mais rápido quando se vê como as pessoas pedem de verdade.

A fronteira do item 1 continua para o **arquivo**: ler o pedido não dá acesso ao documento, às imagens nem ao resultado. Para ver o documento de uma tarefa com problema, só pelo "reportar problema".

Regras que acompanham:

- **Os termos de uso dizem isso com todas as letras.** O designer precisa saber, antes de contratar, que o texto dos pedidos é lido pela equipe do Otto. Texto fechado pelo guardião da marca e pelo jurídico.
- **Acesso restrito** a quem trabalha na qualidade do agente, com registro de quem leu.
- **Retenção declarada** (proposta: 12 meses) e fora do log de servidor.
- **Classificação continua valendo:** tipo de tarefa, formatos e criação × adaptação são gerados de todo pedido, para a análise em volume.
- **Vale igual para o texto da busca em banco de imagens** (ADR 032) que o agente ou o designer fez.
- **Pedido não vira caso de avaliação sem anonimizar:** nome de cliente, marca, preço e data são trocados antes de entrar no conjunto de avaliação (ADR 029).

### 3. Avaliação do agente não usa arquivo de cliente

O conjunto de avaliação (ADR 029) é feito de material nosso ou licenciado para isso. Arquivo de cliente só entra se a conta enviar pelo "reportar problema", para aquele caso.

### 4. Onde isso fica escrito para o designer

Termos de uso e política de privacidade dizem as duas colunas com as mesmas palavras. É um argumento de venda para profissional ("seu arquivo não treina nada"), mas **só se vier junto com o outro lado**: os pedidos escritos ao Otto são lidos para melhorar o produto (item 2). Prometer sigilo total seria mentira. O guardião da marca fecha o texto. O jurídico entra antes do primeiro pagante (gatilho já registrado no `CLAUDE.md`).

## Consequências

- O analista de produto especifica eventos só com a coluna da esquerda; PR que carregue conteúdo em evento ou log é bloqueio.
- Log de servidor não guarda árvore, texto de camada nem texto do pedido ao Otto. O pedido vai para a base de análise com acesso restrito, não para o log.
- O fornecedor de inferência recebe conteúdo para executar a tarefa, e isso é inevitável. O contrato com ele precisa dizer que não retém nem treina. **A verificar para a DigitalOcean** (`docs/tecnico/custos.md`).

## Evidência comportamental (fichas)

- **"Designer profissional escolhe ferramenta também por garantia de sigilo do arquivo."** Tipo: critério de compra. Grau: **hipótese**. Comparável: reação pública de criativos a mudanças de termos de uso de ferramentas de design sobre uso de conteúdo em IA (a pesquisa de mercado deve trazer os casos). **O que mata:** nas entrevistas, sigilo não aparece espontaneamente entre os critérios de escolha.

## Gatilho de revisão

- Se uma conta pedir por escrito que o texto dos pedidos dela não seja lido, e isso acontecer com 3 contas ou mais, criar a opção por conta em vez de tratar caso a caso.
