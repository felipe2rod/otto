# 031 — Dados de uso servem ao produto; o conteúdo do arquivo é do cliente

Status: aceita (o princípio, pelo Felipe) / proposta (a fronteira linha a linha e o pedido ao Otto)
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

### 2. O pedido escrito ao Otto (proposta, a confirmar pelo Felipe)

O texto que o designer escreve ao agente é o dado mais valioso para melhorar o agente, e também pode conter nome de cliente e de campanha. Proposta:

- **Guardado para a execução e para a revisão da tarefa**, dentro da conta, como qualquer dado da conta.
- **Para melhoria do produto, entra só o rótulo derivado** (tipo de tarefa, formatos pedidos, se pediu variação ou lote), gerado por classificador no momento da tarefa. O texto em si não vai para a base de análise.
- Ler o texto de uma tarefa específica para investigar erro exige que o designer envie a tarefa ("reportar problema"), com o documento anexado por escolha dele.

### 3. Avaliação do agente não usa arquivo de cliente

O conjunto de avaliação (ADR 029) é feito de material nosso ou licenciado para isso. Arquivo de cliente só entra se a conta enviar pelo "reportar problema", para aquele caso.

### 4. Onde isso fica escrito para o designer

Termos de uso e política de privacidade dizem as duas colunas com as mesmas palavras. É um argumento de venda para profissional ("seu arquivo não treina nada"), e o guardião da marca fecha o texto. O jurídico entra antes do primeiro pagante (gatilho já registrado no `CLAUDE.md`).

## Consequências

- O analista de produto especifica eventos só com a coluna da esquerda; PR que carregue conteúdo em evento ou log é bloqueio.
- Log de servidor não guarda árvore, texto de camada nem texto do pedido ao Otto.
- O fornecedor de inferência recebe conteúdo para executar a tarefa, e isso é inevitável. O contrato com ele precisa dizer que não retém nem treina. **A verificar para a DigitalOcean** (`docs/tecnico/custos.md`).

## Evidência comportamental (fichas)

- **"Designer profissional escolhe ferramenta também por garantia de sigilo do arquivo."** Tipo: critério de compra. Grau: **hipótese**. Comparável: reação pública de criativos a mudanças de termos de uso de ferramentas de design sobre uso de conteúdo em IA (a pesquisa de mercado deve trazer os casos). **O que mata:** nas entrevistas, sigilo não aparece espontaneamente entre os critérios de escolha.

## Gatilho de revisão

- Se a investigação de erro do agente ficar travada por falta de texto de pedido em mais de metade dos casos analisados num mês, rever o item 2 com o Felipe.
