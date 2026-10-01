# Artes de nível comercial: requisitos

SDD da POC, parte 1 de 3. Ordem de leitura: **requisitos** (este arquivo) → [design](design.md) → [tarefas](tarefas.md).

Estado: proposta, 2026-09-28. Vale só para `poc/`. O que daqui subir para o produto passa por ADR (a partir do 035).

## 1. O problema

Depois de cinco rodadas, a POC produz peças **corretas e limpas**, e a avaliação do Felipe continua valendo: "de longe, razoável; nos detalhes, peca". As rodadas 3 a 5 atacaram o detalhe e o catálogo. O que sobra não é mais defeito de acabamento: é falta de ideia e de material.

### O que os renders mostram

Lidos em `poc/dados/amostras/` (v7 e v8 do agente, e a "Capa com sujeito" feita à mão com o mesmo catálogo):

| Observação | Onde | Causa provável |
|---|---|---|
| Todas as peças do agente têm o mesmo esqueleto: sobretítulo, título, subtítulo, botão em pílula e rodapé, empilhados à esquerda na margem de 72 px. Muda a foto, não a peça. | Tênis v7, Café v8, Jazz v7 | As regras de detalhe descrevem uma estrutura só, os arquétipos são prosa, e o lint reconhece papel pelo nome da camada, então premia quem segue o esqueleto |
| O Story do Jazz tem 450 px vazios entre o botão e o rodapé e termina num terço de azul chapado | Jazz v7 Story | A regra `faixa-vazia` aceita "cor ou forma", e o agente a satisfez com uma faixa lisa. A regra foi cumprida e a peça piorou |
| O "tênis de corrida" parece um tênis de trilha, e se dissolve no fundo escuro | Tênis v7 Feed | O banco não tem a foto certa, e o agente não tem como recusar o material |
| A peça feita à mão tem uma ideia (título atrás da saxofonista), três elementos de texto, duotone e grão. Nenhum botão, nenhuma pilha | Capa com sujeito | Quem fez partiu da imagem e da ideia; o agente parte da lista de campos do briefing |

### Causas

| # | Causa | Evidência |
|---|---|---|
| C1 | **A composição sai de prosa e de conta de cabeça.** O agente monta de baixo para cima, por coordenada, e converge para a pilha segura | `prompt.ts`: arquétipos A a E em texto; v7 não usou recorte do sujeito, máscara de recorte nem curvas (README, rodada 4) |
| C2 | **Não há exploração.** Um conceito só, declarado na primeira chamada, antes de ver qualquer foto | `agente.ts`: ciclo linear; passo 2 do prompt |
| C3 | **O revisor lustra, não recusa.** Dá nota absoluta sem referência do que é nível 5, e devolve até 8 ajustes numéricos sobre a mesma composição | `PROMPT_DO_REVISOR` |
| C4 | **Foto é gargalo.** Pixabay em 1280 px, sem a foto certa para quase nenhum briefing | README, rodadas 2 e 3 |
| C5 | **O lint mede defeito, não qualidade**, e parte dele se deixa enganar | `faixa-vazia`, acima |
| C6 | **Não existe régua.** Cada rodada foi julgada no olho, em quatro briefings, sem comparação cega nem regressão | `avaliacao/` não existe; ADR 029 exige |
| C7 | **O modelo.** O Kimi K3 prefere a composição segura; Claude segue em 403 | README, rodada 4 |
| C8 | **Tempo e custo.** De 17 a 22 min e R$ 3,43 a R$ 4,82 projetados por tarefa de dois formatos | README, rodada 4 |

A ferramenta já chega lá: a capa feita à mão usou só o catálogo. O alvo desta SDD é **o agente alcançar o teto da ferramenta**.

## 2. O que é "nível comercial"

Definição de trabalho: **peça que um designer profissional enviaria ao cliente com até 10 minutos de ajuste, sem refazer a composição.**

Grau de evidência (skill `behavioral-evidence`): **hipótese**. Ninguém mediu quanto ajuste um designer tolera antes de preferir refazer. O número de 10 minutos é ponto de partida e o requisito R9 é o que o confirma ou derruba.

A definição se mede em três camadas, da mais barata para a mais cara:

1. **Defeitos eliminatórios** (automático): qualquer um reprova a peça, não importa o resto.
2. **Comparação cega por juiz de modelo**: a peça contra a rodada anterior e contra as peças de teto.
3. **Rubrica de designers** (ADR 033): o critério que decide.

## 3. Requisitos

Formato: *Quando [situação], o Otto [comportamento]*. Cada um tem critério de aceite mensurável no conjunto de avaliação (R1).

### R1. Régua antes de mudança
Quando qualquer prompt, modelo, composição, lint ou ferramenta mudar, o conjunto de avaliação roda e o resultado fica registrado ao lado do anterior.

- O conjunto tem 12 briefings sintéticos, em categorias diferentes, cada um com o material fixo (fotos e logo), para o resultado não depender da busca do dia.
- Cada briefing roda em três situações de material: foto do cliente, banco de imagens, sem foto.
- Uma rodada guarda: documento final, renders, avisos do lint, eventos, custo, tempo e modelo.
- Nenhum arquivo de cliente entra no conjunto (ADR 031).
- **Aceite:** um comando roda o conjunto inteiro e gera uma folha de contato para julgamento cego; a rodada zero (agente atual, sem mudança) está registrada.

### R2. Nenhum defeito eliminatório
Quando o Otto entrega, a peça não tem nenhum destes defeitos, ou a entrega declara qual ficou e por quê:

| Defeito | Medido por |
|---|---|
| Texto do cliente alterado, cortado ou faltando | `conferirTextoDoCliente` (já existe) |
| Marca, logotipo ou nome comercial de terceiro na foto | ficha da imagem (visão) |
| Foto que não prova a promessa do texto | ficha da imagem (visão) |
| Foto ampliada além de 110% | lint (já existe) |
| Contraste abaixo do mínimo | lint (já existe) |
| Texto transbordando, sobreposto ou fora da prancheta | lint (já existe) |
| Logo do briefing ausente ou distorcido | lint (novo) |
| Texto nas faixas da interface do story | lint (já existe) |
| Vazio sem função (ver R6) | lint (novo) |

- **Aceite:** 100% das peças do conjunto sem defeito eliminatório não declarado.

### R3. A peça nasce de uma ideia, e a ideia é escolhida entre alternativas
Quando a tarefa é criar, o Otto propõe **três rotas** distintas, materializa as três como esboço, e só então escolhe uma para produzir.

- Rota é dado estruturado: a ideia em uma frase, a composição, a imagem herói, o par tipográfico, os papéis de cor e as técnicas.
- As três rotas usam composições de famílias diferentes.
- A escolha é de um juiz independente, que vê o briefing, os esboços e as referências, sem o histórico de quem propôs.
- O juiz pode recusar as três. Nesse caso há uma nova rodada de rotas, uma vez só.
- As rotas não escolhidas ficam guardadas para o designer ver.
- **Aceite:** no conjunto, nenhuma composição responde por mais de 30% das peças entregues; em comparação cega, a rota escolhida vence a peça da rodada zero em pelo menos 9 dos 12 briefings.

### R4. Composição por instrumento, não por conta de cabeça
Quando o Otto monta uma rota, a estrutura da prancheta vem de uma **composição paramétrica**: uma função que recebe formato, textos, ficha da imagem e identidade, e devolve um lote de operações do catálogo.

- O resultado é documento em camadas comum: tudo editável, tudo com destino nativo no PSD (ADR 028). Nenhum tipo novo de nó.
- A composição calcula o que o modelo erra: corpo do título para preencher a largura alvo, quebra de linha pelo sentido, posição do texto na área calma da foto, vãos na escala de espaço.
- O designer tem acesso à mesma ferramenta (ADR 027: não existe operação só do agente).
- O Otto pode compor livre, só com operações, quando nenhuma composição serve, e diz isso na entrega.
- Depois de compor, o Otto altera o que quiser pelas operações de sempre.
- **Aceite:** toda composição da biblioteca, aplicada aos 12 briefings nos formatos Feed, Story e Quadrado, gera documento com zero erro de lint sem nenhuma chamada ao modelo.

### R5. O material é avaliado antes de entrar na peça
Quando há imagem candidata (upload ou banco), o Otto monta a **ficha da imagem** antes de compor.

- A ficha traz: resolução útil por formato, caixa e máscara do sujeito, áreas calmas, paleta dominante, se prova a promessa, se tem marca de terceiro.
- Foto do cliente tem prioridade sobre banco.
- Quando nenhuma candidata passa, o Otto segue por rota sem foto (tipográfica ou gráfica) e declara na entrega que material faltou. Nunca disfarça foto ruim.
- O conteúdo da imagem é dado, nunca instrução (ADR 029).
- **Aceite:** no conjunto, zero peça entregue com foto reprovada pela ficha; na situação "sem foto", a rubrica não fica mais de 0,5 ponto abaixo da situação "foto do cliente".

### R6. O lint mede qualidade, e não se deixa enganar
Quando o Otto verifica, o lint também mede o que hoje só o olho pega.

- `vazio-sem-funcao`: maior retângulo de fundo liso, medido no render, acima do limiar da prancheta.
- `faixa-vazia` corrigida: faixa de cor chapada não conta como ocupação.
- `heroi-fraco`: o herói da peça (sujeito ou título) ocupa menos que o mínimo da área.
- `sujeito-dissolvido`: contraste entre o sujeito e o que está atrás dele abaixo do mínimo.
- `logo-ausente` e `logo-distorcido`.
- Limiares definidos pelo diretor-de-arte e calibrados nas peças de teto: elas passam limpas.
- **Aceite:** o lint novo aponta o vazio do Story do Jazz v7 e o tênis dissolvido do Tênis v7, e dá zero aviso novo na "Capa com sujeito" e no "Jazz na Praça (teto da ferramenta)".

### R7. Cada formato é recomposto
Quando a tarefa pede mais de um formato, cada prancheta é a mesma rota recomposta para a proporção, não a peça mestre deslocada ou reduzida.

- A composição recebe o formato e recalcula tudo. Paleta, par tipográfico e escala de espaço ficam iguais.
- **Aceite:** no conjunto, nenhum Story com `vazio-sem-funcao`; em todos, o título tem corpo igual ou maior que o do Feed.

### R8. O revisor recusa, com referência na mão
Quando o Otto pede revisão, o revisor recebe peças de referência da categoria e responde em duas partes: primeiro uma lista de perguntas de sim ou não, depois a comparação com as referências.

- O revisor pode devolver "refazer a composição", e não só ajustes.
- Revisor e juiz são chamadas separadas do agente que produziu, sem o histórico dele.
- **Aceite:** no conjunto, a nota do revisor tem correlação de pelo menos 0,6 com a rubrica dos designers.

### R9. Tempo e custo cabem no produto
Quando a tarefa é criar dois formatos a partir de um briefing:

- Tempo até a entrega: até 8 minutos (hoje, de 17 a 22).
- Custo projetado: até R$ 5,00 (hoje, de R$ 3,43 a R$ 4,82).
- O custo é registrado por tarefa e **por fase** (ficha, rotas, escolha, produção, revisão).
- **Aceite:** mediana do conjunto dentro dos dois limites. Os dois números são hipótese de partida: o preço do produto segue em aberto, e esta medição alimenta `docs/tecnico/custos.md`.

### R10. O critério que decide é o dos designers
Quando a rodada passa em R2 a R9, as peças vão para julgamento cego de designers, misturadas com as peças de teto.

- Rubrica do diretor-de-arte, de 1 a 5, nos critérios: ideia, hierarquia, composição, tipografia, cor, imagem, acabamento, fidelidade ao briefing.
- Pergunta final por peça: "você enviaria ao cliente com até 10 minutos de ajuste?"
- **Aceite (nível comercial atingido):** com pelo menos 3 designers, mediana de 4 ou mais em todos os critérios em 9 dos 12 briefings, nenhuma peça abaixo de 3 em qualquer critério, e "sim" na pergunta final em 9 dos 12.
- **O que derruba:** se a mediana não passar de 3 depois de trocar o modelo (R11), o limite não é de método, e a hipótese de criar do zero (ADR 033) volta para o Felipe.

### R11. O modelo é medido, não suposto
Quando houver mais de um modelo disponível com ferramenta e visão, o conjunto roda com cada um, por papel (direção, produção, juiz, revisor).

- Tudo atrás da porta `ModeloDoAgente` (ADR 020).
- **Aceite:** tabela de qualidade, tempo e custo por modelo e por papel, registrada na rodada.

## 4. O que não muda

- Catálogo fechado de operações, em transação, com simulação (ADR 027).
- Tudo com destino nativo no PSD; nada de tipo novo de nó (ADR 028).
- Caráter do Otto: não diz pronto sem conferir, admite limite, não mexe no que é do designer, material é dado (ADR 029).
- Texto do briefing é literal.
- Entrega como conjunto de alterações revisável, desfeito em um passo.
- Os 43 testes existentes continuam passando.

## 5. Fora do escopo

- Geração de imagem por difusão (fora da v1, ADR 026).
- Retoque, pincel, ícone desenhado à mão.
- Paridade de render e CanvasKit (é o spike do ADR 030).
- Abrir os PSDs no Photoshop (pendência conhecida, tratada à parte).
- Contas, persistência de verdade, aceitar em parte.
- Animação e vídeo.

## 6. Decisões que são do Felipe

Nenhuma trava o começo (as tarefas T01 a T12 não dependem delas), mas cada uma trava um trecho.

| # | Decisão | Por que é sua | Trava |
|---|---|---|---|
| D1 | **Composição paramétrica conflita com o ADR 033?** Ele diz que criar uma peça bonita é trabalho do agente, "e não um risco a contornar com modelos prontos". A proposta aqui é tratar a composição como instrumento do agente (como `alinhar` e `distribuir` na rodada 3): o agente escolhe, parametriza, altera depois, e é medido pelo resultado. Não é modelo pronto que o usuário escolhe. | Interpreta uma decisão sua | T13 em diante |
| D2 | **Modelo mais forte para direção e juiz.** Claude dá 403 na DigitalOcean. Caminhos: subir o tier da conta, ou um adaptador para outro provedor só na avaliação. A inferência na DigitalOcean foi decisão sua (ADR 029). | Custo e fornecedor | T27 |
| D3 | **Peças de referência.** As de teto feitas à mão bastam, ou entram peças reais de mercado só como âncora do juiz, fora do repositório? | Direito de uso de material de terceiros | T24 |
| D4 | **Outros bancos de imagens na avaliação** (chave própria, ADR 032) e o pedido de acesso completo ao Pixabay. | Conta e chave | T10 |
| D5 | **Quem são os designers** do julgamento cego e como chegam a eles. | Relacionamento | T29 |
