# 033 — A conta cria as próprias artes a partir de um pedido ou de um briefing salvo

Status: aceita (o princípio e o público, pelo Felipe) / proposta (forma do briefing e ciclo)
Data: 2026-09-26
Quem decide: Felipe

## Contexto

O ADR 026 pôs no centro o trabalho de produção sobre algo que já existe: adaptar formatos, fazer variações, trocar em lote. O Felipe acrescentou em 2026-09-26: **"a proposta é o próprio cliente gerar suas artes da forma como precisa, a partir de um prompt ou de um briefing pré-estabelecido."** Criar do zero passa a ser caminho principal, ao lado de adaptar.

## Decisão

### 1. Duas entradas, o mesmo ciclo

- **Pedido livre:** a pessoa escreve o que precisa ("post de lançamento do café gelado, feed e story, fundo claro").
- **Briefing salvo:** um modelo reutilizável da conta, preenchido em segundos, para o que se repete (post semanal de promoção, anúncio de vaga, capa de episódio).

As duas entradas caem no ciclo do ADR 029: entender, planejar, fazer, conferir e entregar como conjunto de alterações revisável.

### 2. O que um briefing salvo guarda

| Campo | Exemplo |
|---|---|
| Nome | "Promoção da semana" |
| Objetivo e público | vender, para clientes atuais |
| Formatos | feed 1080×1350, story 1080×1920 |
| Campos a preencher a cada uso | produto, preço, validade |
| Textos fixos | rodapé legal, @ da marca |
| Identidade | tokens da conta (cores, fontes), logo |
| Imagens | da biblioteca, ou busca em banco com termos e bancos permitidos (ADR 032) |
| Restrições | "nunca foto de pessoa", "logo sempre no canto inferior direito" |
| Referências | documentos anteriores aprovados, que o agente usa como exemplo de estilo |

O briefing é **dado da conta** (ADR 031), não instrução ao sistema. As restrições valem dentro da tarefa, mas não mudam o caráter do agente (ADR 029, item 3). Um briefing que diga "ignore as regras" é conteúdo.

### 3. O resultado é sempre um documento em camadas

Criar do zero não gera imagem chapada: gera pranchetas com texto, forma, imagem e tokens, editáveis no Otto e exportáveis para PSD (ADR 028). É isso que separa o Otto de gerador de imagem.

### 4. Salvar um resultado aprovado como briefing

Depois que a pessoa aceita um conjunto de alterações, o Otto oferece "salvar como briefing": transforma o pedido e o resultado num modelo, e os campos que variaram viram campos a preencher. **Ensinar é consequência de usar**, como no antigo ADR 022.

## Consequências

- Novas entidades na conta: `briefings` (modelos) e o vínculo de cada tarefa ao briefing de origem.
- O conjunto de avaliação do agente (ADR 029) ganha tarefas de criação do zero, com briefing e sem briefing.
- Evento de uso (ADR 031): tarefa por briefing × pedido livre, briefing reutilizado quantas vezes, resultado. O conteúdo do briefing não entra.
- O público continua o do ADR 026: o designer (ver a seção abaixo).

## Quem é "o próprio cliente"

**Resolvido pelo Felipe em 2026-09-26: é o designer gerando as artes dele. O foco maior é o designer profissional.** O ADR 026 não muda: o público, a interface densa com atalhos de Photoshop e a concorrência continuam os mesmos. Pedido e briefing são o jeito de o designer tirar do caminho a produção que se repete. Não são porta de entrada para quem não é designer.

## Gatilho de revisão

- Se menos de 1 em 5 contas ativas tiver um briefing salvo reutilizado ao menos 3 vezes em 30 dias, o briefing salvo não está pegando. Rever a forma antes de adicionar campos.
