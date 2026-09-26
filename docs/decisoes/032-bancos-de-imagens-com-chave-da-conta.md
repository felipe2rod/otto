# 032 — Bancos de imagens: Pixabay de fábrica, e a conta pode ligar os bancos dela com a própria chave

Status: aceita (Pixabay gratuito de fábrica e chave própria da conta, pelo Felipe) / proposta (lista de bancos, regras técnicas e ordem)
Data: 2026-09-26
Quem decide: Felipe

## Contexto

Para criar uma arte a partir de pedido ou de briefing (ADR 033), o Otto precisa de imagem. Na v1 não há geração por difusão (ADR 026). A fonte é a biblioteca da conta, alimentada por **upload** do designer, e os bancos de imagens. O Felipe decidiu em 2026-09-26: **o Pixabay vem de fábrica, porque é gratuito, e o cliente pode usar as próprias chaves para se conectar a outros bancos.**

Cada banco tem regra própria de uso da API, e às vezes elas são opostas. O Pixabay proíbe usar a imagem por link direto; o Unsplash (a verificar) exige. Por isso a porta não pode esconder essas regras. Ela declara cada uma (ADR 020, `capacidades`).

## Decisão

### 1. Porta `BancoDeImagens`, um adaptador por banco

- Contrato: `buscar(consulta, filtros)` → resultados com miniatura, dimensões, autor, licença e id externo; `trazer(resultado)` → arquivo na biblioteca da conta.
- `capacidades` por adaptador: resolução máxima com a chave em uso, se exige guardar a imagem ou usar link direto, se exige avisar o banco do download, cache obrigatório, limite de requisições e se a licença exige compra por imagem.
- Teste de contrato rodando contra todos os adaptadores, inclusive um falso (ADR 020).

### 2. Pixabay de fábrica, com a chave do Otto

Regras da API (conferidas em https://pixabay.com/api/docs/ em 2026-09-26):

| Regra do Pixabay | Como o Otto cumpre |
|---|---|
| Até 100 requisições por 60 s por chave | Uma chave do Otto para todas as contas. Limite por conta aplicado por nós, e as buscas saem da fila quando a cota aperta |
| "Requests must be cached for 24 hours" | Cache das buscas por 24 h, por consulta e filtros |
| Link direto permanente proibido | `trazer` baixa a imagem para `ArmazenamentoDeArquivo` (hash de conteúdo, ADR 027). O documento nunca aponta para URL do Pixabay |
| Mostrar a origem sempre que houver resultado de busca | O painel de busca e a resposta do agente mostram "Pixabay" junto dos resultados |
| Acesso padrão vai até 1280 px (`largeImageURL`); Full HD e original exigem acesso completo aprovado | **Limite real da v1.** Pedir acesso completo ao Pixabay antes do lançamento. Até lá, o lint de resolução efetiva (ADR 027) avisa quando a imagem fica pequena para a saída |
| "Made for real human requests"; download sistemático em massa proibido | O agente só busca dentro de uma tarefa pedida por uma pessoa, com teto de buscas por tarefa. Nada de pré-carregar acervo |

Licença do conteúdo (https://pixabay.com/service/license-summary/): uso comercial permitido e atribuição dispensada. É proibido redistribuir a imagem sem alteração, usar em marca ou logotipo, usar marca reconhecível que apareça na foto e usar pessoa reconhecível de forma enganosa. **A responsabilidade de conferir direito de terceiro é de quem usa.** O Otto mostra isso ao trazer a imagem e não promete que a imagem está livre para qualquer uso.

### 3. Chave própria da conta

- A conta liga outros bancos colando a chave ou credencial dela. Candidatos, a verificar um a um: Pexels e Unsplash (gratuitos), Freepik, Shutterstock, Adobe Stock, Depositphotos e iStock/Getty (pagos).
- **A chave é segredo da conta:** guardada criptografada, por conta (ADR 023). Nunca vai ao navegador nem ao log, e nunca aparece de volta na tela depois de salva (só os últimos 4 caracteres).
- A chamada sai do servidor, com a chave da conta, e conta contra a cota da conta no banco, não contra a do Otto.
- **Compra de licença por imagem** (bancos pagos) não entra na v1. Com chave própria, a v1 busca e traz o que a licença da conta já cobre. Se o banco exige compra, o resultado aparece marcado como pago e a compra fica fora do Otto, até ter ADR próprio.

### 4. Toda imagem trazida guarda sua origem

Metadados no arquivo da biblioteca: banco, id externo, autor, URL da página, licença, data e resolução obtida. A biblioteca mostra a origem. O relatório de exportação (ADR 028) lista as imagens de banco e a licença de cada uma, porque o designer entrega o arquivo ao cliente dele e precisa saber de onde veio cada foto.

### 5. O agente e a pessoa usam o mesmo caminho

`buscarImagens(consulta, filtros)` e `trazerImagem(resultado)` entram nas ferramentas do agente (ADR 029) e no painel de biblioteca do editor. O agente escolhe entre as miniaturas olhando para elas, o que depende da imagem funcionar na DigitalOcean (ADR 029, item 4.1). Sem isso, ele escolhe só pelos metadados e diz isso.

## Consequências

- Nova porta no mapa do ADR 020 e em `docs/tecnico/arquitetura.md`.
- A busca é dado de uso (ADR 031): registra banco, texto da consulta (ADR 031, item 2), número de buscas, imagens trazidas e se a imagem ficou no documento aceito. A imagem não entra.
- Custo: o Pixabay não cobra; o custo é armazenamento e transferência (`docs/tecnico/custos.md`).
- O limite de 1280 px no acesso padrão pode ser pequeno para designer profissional (impressão e banner grande). Pedir o acesso completo é tarefa de operação, não de código.

## Evidência comportamental (fichas)

- **"Banco gratuito de fábrica basta para a maior parte das artes do dia a dia."** Tipo: suficiência de acervo. Grau: **hipótese**. **O que mata:** mais de 30% das tarefas com imagem de banco terminam com a imagem trocada pela pessoa, ou com o lint de resolução disparado.

## Gatilho de revisão

- Se mais de 20% das contas ativas ligarem um mesmo banco pago com chave própria, avaliar a integração de compra de licença por imagem.
- Se o Pixabay negar o acesso completo, rever se o Pixabay continua sendo o banco de fábrica.
