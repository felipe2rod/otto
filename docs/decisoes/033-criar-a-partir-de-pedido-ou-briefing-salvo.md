# 033 — A conta cria as próprias artes a partir de um pedido ou de um briefing salvo

Status: aceita (o princípio, o público e o formulário como caminho padrão, pelo Felipe) / proposta (campos exatos e ciclo)
Data: 2026-09-26
Quem decide: Felipe

## Contexto

O ADR 026 pôs no centro o trabalho de produção sobre algo que já existe: adaptar formatos, fazer variações, trocar em lote. O Felipe acrescentou em 2026-09-26: **"a proposta é o próprio cliente gerar suas artes da forma como precisa, a partir de um prompt ou de um briefing pré-estabelecido."** Criar do zero passa a ser caminho principal, ao lado de adaptar.

## Decisão

### 1. O formulário de briefing é o caminho padrão; o pedido livre é a opção de liberdade

**Decidido pelo Felipe em 2026-09-26**, para evitar que o agente entenda errado:

- **Padrão: formulário de briefing.** A pessoa cria uma peça preenchendo campos (seção 2). Formato, texto, cores e imagens chegam ao agente como **dado estruturado**, não como frase para interpretar. É o que aparece primeiro na tela.
- **Segundo plano: pedido livre.** Um campo de texto aberto, para quando o designer quer mais liberdade ("faz algo mais ousado, fundo escuro, tipografia grande"). Fica acessível, mas não é o caminho principal.
- **Briefing salvo** é um formulário já preenchido e reutilizável: a pessoa só troca os campos que variam (produto, preço, validade).
- O formulário tem um campo de **observações** em texto livre, para o detalhe que não coube nos campos, sem sair do caminho estruturado.

As entradas caem no ciclo do ADR 029: entender, planejar, fazer, conferir e entregar como conjunto de alterações revisável. Pelo formulário, o passo "entender" praticamente some. Pelo pedido livre, o agente confirma o que entendeu antes de fazer quando algo essencial ficou ambíguo (formato, texto principal).

**Cuidado com o formulário longo** (hipótese de atrito): os campos que não mudam vêm preenchidos do cadastro do cliente (identidade, logo, textos fixos) e do briefing salvo. Na segunda peça de um mesmo cliente, preencher deve levar menos de um minuto.

### 2. Os campos do formulário (e o que um briefing salvo guarda)

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

### 2.1 A qualidade do layout criado do zero é responsabilidade do agente

**Decidido pelo Felipe em 2026-09-26:** criar uma peça bonita a partir do briefing é o trabalho do agente, e não um risco a contornar com modelos prontos. Consequência: o conjunto de avaliação (ADR 029) inclui **rubrica de qualidade visual julgada por designers**, além das regras automáticas, e ela é o critério de lançamento da criação do zero.

### 2.2 De onde vêm as imagens

Três fontes, todas no mesmo painel e nas mesmas ferramentas do agente (Felipe, 2026-09-26): **upload** do designer (fotos do cliente, produto, loja), **Pixabay** de fábrica e **bancos do próprio cliente** ligados com a chave dele (ADR 032). O formulário deixa escolher a fonte por campo de imagem.

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
