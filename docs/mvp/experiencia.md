# Experiência do MVP (rascunho)

Status: **rascunho para decisão do Felipe**, escrito em 2026-10-01 pelo especialista-ui-ux.
Destino: depois de decidido, vira `docs/produto/experiencia.md`.
Leitores: especialista-react (implementa), especialista-backend (seção 8), guardião da marca (seção 6), analista de produto (seção 7), treinador-do-otto (seções 3.5, 3.9 e 8.3), Felipe (seção 9).

Como ler: a seção 1 diz o que entra. As seções 3 a 5 descrevem cada fluxo com seus estados. A seção 6 traz o texto de interface dos pontos críticos, **todo ele rascunho que passa pelo guardião da marca antes de ir ao código**. A seção 7 diz como cada hipótese do `poc/README.md` fica observável. As seções 9 e 10 separam o que o Felipe decide do que eu supus sem verificar.

Quase tudo aqui sobre o que o designer vai fazer é **hipótese**. Onde a afirmação sustenta escopo, ela tem ficha na seção 7.2 (skill `behavioral-evidence`).

---

## 0. O que li na POC e muda o desenho

Conferido no código de `poc/src/web/` e `poc/src/servidor/servidor.ts`, não suposto:

| O que a POC faz hoje | Consequência para o MVP |
|---|---|
| Camadas à **esquerda**, Otto e Propriedades empilhados à direita (`estilo.css`, grade `250px 1fr 340px`) | Contraria o princípio "camadas à direita, ferramentas à esquerda". Redesenho na seção 4 |
| Lista de documentos é um `<select>` no topo (`App.tsx`) | Vira tela própria, com miniatura e estado da tarefa |
| O relatório de exportação tem a lista de fontes (`RelatorioDeExportacao.fontes`), mas `Exportar.tsx` **não a mostra**; os botões de baixar vêm antes do relatório | Fere o princípio de honestidade de exportação. Redesenho na seção 3.10 |
| O nome do modelo de IA aparece no topo e no bloco de custo (`App.tsx`, `PainelDoOtto.tsx`) | Fornecedor de modelo não aparece em texto público (`identidade.md`). Sai |
| O bloco de custo mostra tokens, chamadas, cache e projeção em reais | É painel de quem constrói, não de quem usa. Seção 3.11 |
| A linha do tempo da tarefa abre sozinha enquanto o Otto trabalha (`<details open>`) | Fecha por padrão: abrir vira sinal da hipótese 3 |
| Edição do documento travada enquanto a tarefa roda; **liberada** durante a revisão; se o designer edita, "Desfazer tudo" devolve erro 409 | O estado some com a regra da seção 3.7 (editar aceita) |
| Ctrl+Z durante a revisão desfaz os lotes do Otto um a um | A tarefa vira uma unidade só no histórico |
| Interromper a tarefa produz "Parei com erro: tarefa cancelada" | Estado próprio, com texto próprio |
| Tarefa vive em memória; o stream reconecta só enquanto o processo do servidor está de pé | Com Docker e deploy, a tarefa precisa sobreviver a reinício (seção 8.1) |
| Uma tarefa nova é recusada enquanto outra está em revisão no mesmo documento | Mantido, com a saída "Aceitar e pedir ajuste" |
| Arrastar move a camada; as alças de seleção são desenhadas mas **não redimensionam**; texto só se edita no painel; não há refazer, duplicar nem seleção múltipla | Edição manual mínima, seção 3.9 |
| Briefings salvos ficam no `localStorage`, até 12 | Passam para a conta |
| Seletor de esforço com 8 opções ("Sem nível" mais sete), no briefing e no pedido livre | Simplifica, seção 3.4 |
| Logo só em SVG; fotos em PNG, JPG ou WebP até 25 MB; leitura do site com limite de 60 s | Mantidos, com estados |

Dois fatos do `poc/README.md` pesam mais que todo o resto:

1. **Nenhum PSD da POC foi aberto no Photoshop.** A jornada do MVP termina em "PSD aberto no Photoshop". Antes de qualquer designer ver o produto, alguém abre os arquivos e registra o resultado (ADR 028, item 6). Sem isso, a tela de exportação promete o que ninguém conferiu.
2. **Uma tarefa de dois formatos leva de 14 a 30 minutos** (rodadas 3 a 7, medidas com outro modelo). O README já avisava que 5 a 6 minutos de espera podiam matar a hipótese 1. O desenho inteiro da seção 3.6 parte de que ninguém fica olhando 20 minutos para uma tela.

---

## 1. Recorte do MVP

### 1.1 A menor jornada completa

Um designer, sozinho, sem ninguém do lado:

```
entra por convite → cadastra uma marca (site, logo, cores, fontes)
  → preenche o briefing (textos, formatos, foto do cliente)
  → confere a direção e diz "pode"
  → sai; é avisado quando termina
  → revisa as alterações do Otto, resolve ou dispensa as pendências
  → ajusta à mão ou pede um ajuste curto
  → lê o relatório, exporta para PSD e abre no Photoshop
  → volta e faz a segunda peça da mesma marca em menos de um minuto de formulário
  → pede a adaptação para outro formato
```

Os dois últimos passos não são enfeite: sem a segunda peça não se mede a promessa do ADR 033, e sem a adaptação a hipótese 4 fica sem instrumento.

### 1.2 O que entra, como entra e o que fica fora

**Entra como está na POC** (o comportamento; o código muda de casa):

- Canvas com pan (espaço, botão do meio), zoom na roda, pranchetas lado a lado, guias da zona da interface no story.
- Camadas tocadas pelo Otto marcadas em âmbar no canvas (contorno tracejado) e no painel (ponto com rótulo). A marca não depende só de cor.
- Árvore de camadas com grupo, ocultar, bloquear ("o Otto não mexe"), indicador de máscara e de máscara de recorte.
- Painel de propriedades por tipo de camada, com cada confirmação virando um lote.
- "Segure para ver o antes".
- Histórico com autoria (Otto × Você).
- Leitura do site da marca preenchendo identidade e logo para o designer conferir.
- Busca em banco de imagens com crédito no relatório.
- Relatório de exportação por camada (a estrutura; a tela muda).
- Regras de caráter já observadas: texto do cliente literal, pendência declarada em vez de troca sem pedido.

**Entra redesenhado:**

| Peça | O que muda |
|---|---|
| Disposição do editor | Ferramentas e Otto à esquerda, Propriedades e Camadas à direita (seção 4) |
| Formulário de briefing | Tela própria, em três blocos, ordenado pelo que varia; identidade vem da marca (3.4) |
| Esforço criativo | Três opções visíveis em vez de sete; fora do pedido de ajuste (3.4) |
| Espera | Etapas, tempo decorrido, faixa típica, sair e voltar, aviso (3.6) |
| Revisão | Por prancheta, pendências acionáveis, "Aceitar e pedir ajuste", tarefa como uma unidade do histórico (3.7) |
| Exportação | Relatório antes dos botões, fontes visíveis, PNG, estados de exportação longa (3.10) |
| Custo | Sai da tela do designer; fica o tempo (3.11) |
| Pedido livre | Continua em segundo plano; com peça aberta vira "pedir um ajuste", com a seleção como contexto (3.9) |

**Entra novo:**

- Entrada por convite e conta (3.1).
- Lista de peças com miniatura e estado (3.2).
- Marca: o cadastro do cliente, de onde o formulário puxa o que não muda (3.3).
- O "pode" de verdade, que a POC anuncia e não espera (3.5).
- Tarefa que sobrevive a fechar a aba e a reinício do servidor, com aviso (3.6).
- Pendências com estado: aberta, resolvida, dispensada (3.8).
- Edição manual que falta: redimensionar pela alça, editar texto no canvas, trocar a imagem de uma camada, refazer, duplicar (3.9).
- Exportar PNG por prancheta. Sem isso o leigo, que não tem Photoshop, termina a jornada sem nada na mão.
- Pergunta de retorno depois do PSD (3.10 e 7.1).

**Fica fora do MVP** (cada linha é escopo cortado, não esquecido):

| Fora | Por quê | Volta quando |
|---|---|---|
| Importar PSD | Importador limitado com relatório é um produto dentro do produto | Decisão do Felipe (9.10). Custa caro à hipótese 4: ver 7.1 |
| SVG e PDF para o Illustrator | ADR 034 põe na v1, não no MVP; dobra o trabalho de mapeamento e de conferência manual | Decisão do Felipe (9.9) |
| Aceitar em parte por camada | Exige desfazer seletivo no log de operações | 3 designers em sessão tentarem aceitar só parte de uma prancheta |
| Upload de fonte da conta | Abre a questão de licença de fonte (gatilho do agente jurídico) | Decisão do Felipe (9.11) |
| Outros bancos de imagens com chave da conta | ADR 032 permite; não é preciso para a jornada | Depois do MVP |
| "Salvar resultado como briefing" com campos variáveis detectados | O briefing salvo simples cobre o caso | Gatilho do ADR 033 |
| Criar camada à mão (texto, forma), caneta, pincel | O Otto não compete na ferramenta manual (ADR 026); o designer termina no Photoshop | Os atalhos sem ferramenta mostrarem o que se procura (7.1) |
| Seleção múltipla, alinhar e distribuir à mão | Segundo corte: entra se couber, porque o pedido curto ao Otto não é curto no relógio (3.9) | Se couber no MVP |
| Editar tokens além das cores, estilos de texto da identidade | Existe no catálogo; a tela fica para depois | Depois do MVP |
| Conta com mais de uma pessoa, papéis, compartilhar peça | "Conta" no MVP é uma pessoa | Depois do MVP |
| Cobrança, planos, créditos | Preço em aberto (`CLAUDE.md`) | Quando houver preço |
| Editor em tela pequena | Editor em camadas não cabe; em tela estreita a peça abre só para olhar | Depois do MVP |
| Lixeira com restauração na tela | Exclusão pede confirmação e o backend guarda por 30 dias | Depois do MVP |
| Formato com tamanho livre | O catálogo de formatos com zona segura é do diretor-de-arte | Quando o catálogo existir |

---

## 2. Mapa de telas e estados da tarefa

### 2.1 Telas

```
/entrar                 entrada por e-mail (link)
/editor                 Peças: lista com miniatura e estado
/editor/marcas          Marcas: cadastro do cliente
/editor/nova            Briefing (tela inteira)
/editor/p/:id           Editor da peça (canvas, Otto, camadas, propriedades)
   └ Exportar           diálogo sobre o editor
```

Cinco telas e um diálogo. Não há tela de "configurações" no MVP: e-mail da conta e sair ficam num menu no canto do topo.

Vocabulário de tela (a confirmar com o guardião): **peça** é o documento; **prancheta** é cada formato dentro da peça; **marca** é o cadastro do cliente; **tarefa** é o que se pede ao Otto; **alterações do Otto** é o conjunto que se revisa.

### 2.2 Estados da tarefa

Nome de estado é do código; a coluna "o designer lê" é texto de tela.

```
        enviar briefing ou pedido
                  │
             [na fila] ───────────────────────────┐
                  │                               │
        [definindo a direção]                     │ interromper
                  │                               │ (em qualquer ponto)
          tarefa grande? ── não ──┐               │
                  │ sim           │               │
        [aguardando o "pode"]     │               │
           │ pode   │ ajustar     │               │
           │        └─ refaz a direção            │
           ▼                      ▼               ▼
         [produzindo e conferindo] ── falha ──► [não terminou]
                  │                               │ ficar com o que foi feito ─► revisão
        [pronto para revisar]                     │ tentar de novo ─► na fila
           │ aceitar      │ desfazer tudo         │ desfazer tudo ─► desfeita
        [aceita]       [desfeita]
```

| Estado | O designer lê | Onde aparece |
|---|---|---|
| na fila | Na fila | cartão da peça, painel do Otto |
| definindo a direção | Otto trabalhando | cartão, painel, título da aba |
| aguardando o "pode" | Aguardando seu "pode" | cartão (destaque), painel, aviso |
| produzindo e conferindo | Otto trabalhando | cartão, painel, título da aba |
| pronto para revisar | Pronto para revisar | cartão (destaque), painel, aviso |
| não terminou | Não terminou | cartão (destaque), painel, aviso |
| aceita, desfeita | sem selo | histórico |

Uma peça tem no máximo uma tarefa viva (qualquer estado antes de aceita ou desfeita). É a regra da POC e ela simplifica tudo o que vem depois.

---

## 3. Fluxos

Cada fluxo traz os estados vazio, carregando, erro e parcial quando existem.

### 3.1 Entrada e criação de conta

**Desenho.** Uma tela, um campo: e-mail. O Otto manda um link; clicar no link entra. Não há senha, então não há "esqueci a senha". Criar conta e entrar são o mesmo gesto. Recomendo MVP **fechado por convite** (decisão 9.1): cada tarefa custa de R$ 1 a R$ 7 projetados e não há preço.

```
┌───────────────────────────────────────────┐
│  Otto                                     │
│  O agente faz a produção,                 │
│  você faz o design.                       │
│                                           │
│  E-mail  [____________________________]   │
│          [ Receber o link de entrada ]    │
│                                           │
│  Ao entrar, você concorda com os termos.  │
│  Seus arquivos não são lidos pela equipe  │
│  nem usados para treinar nada. O texto    │
│  dos pedidos que você escreve ao Otto     │
│  pode ser lido para melhorar o produto.   │
└───────────────────────────────────────────┘
```

O aviso sobre o texto dos pedidos é exigência do ADR 031 (item 2): aparece **antes** de a pessoa entrar, com as duas metades juntas. Texto final do guardião; o jurídico entra antes do primeiro pagante.

| Estado | O que a pessoa vê |
|---|---|
| Enviando | Botão vira "Enviando…", desativado |
| Link enviado | "Mandei um link para {e-mail}. Ele vale por 15 minutos." e "Usar outro e-mail" |
| E-mail fora da lista de convite | "O Otto está em teste fechado. Guardei seu e-mail e aviso quando abrir." Sem revelar se o e-mail já tem conta |
| Link vencido ou já usado | "Este link venceu." e o campo de e-mail já preenchido |
| Falha ao enviar | "Não consegui enviar o link. Tente de novo em instantes." |
| Sessão vencida no editor | Volta para `/entrar` e, depois do link, para a mesma peça. O rascunho do formulário de briefing fica guardado no navegador |

**Primeiro acesso.** Sem tutorial e sem assistente de boas-vindas. A pessoa cai em Peças, onde há uma **peça de exemplo** pronta (decisão 9.15) e o botão "Nova peça". A peça de exemplo deixa ver camadas, histórico com autoria e exportação, e baixar um PSD no primeiro minuto, antes de qualquer espera.

### 3.2 Lista de peças

```
┌ Otto ─ [Peças] Marcas ───────────────────────────────── felipe@… ▾ ┐
│                                                                    │
│  Peças                      Marca: [Todas ▾]      [ Nova peça ]    │
│                                                                    │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐            │
│  │ miniatura│  │ miniatura│  │ miniatura│  │ miniatura│            │
│  │          │  │          │  │          │  │          │            │
│  ├──────────┤  ├──────────┤  ├──────────┤  ├──────────┤            │
│  │Lançamento│  │Promoção  │  │Jazz na   │  │Exemplo   │            │
│  │Crové     │  │Orfeu     │  │Praça     │  │          │            │
│  │2 formatos│  │1 formato │  │2 formatos│  │2 formatos│            │
│  │● Pronto  │  │◐ Otto    │  │          │  │          │            │
│  │para      │  │trabalhan-│  │há 2 dias │  │          │            │
│  │revisar   │  │do, 8 min │  │          │  │          │            │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘            │
└────────────────────────────────────────────────────────────────────┘
```

- Ordem: peças que pedem ação primeiro (aguardando "pode", pronto para revisar, não terminou), depois por alteração mais recente.
- Miniatura: render da primeira prancheta. Enquanto o Otto trabalha, a miniatura mostra o estado mais recente.
- Menu do cartão: renomear, duplicar, nova peça com este briefing, excluir (com confirmação que diz o nome da peça).
- Filtro por marca. Sem busca no MVP.

| Estado | O que a pessoa vê |
|---|---|
| Vazio (não há peça nem a de exemplo) | "Nenhuma peça ainda. Preencha um briefing e o Otto monta a primeira versão em camadas." e o botão "Nova peça" |
| Carregando | Cartões-esqueleto na mesma grade |
| Erro | "Não consegui carregar suas peças." e "Tentar de novo". Nunca uma lista vazia no lugar do erro: vazio lido como "perdi tudo" é o pior engano desta tela |
| Parcial | Miniatura que não carregou vira o contorno do formato com o nome; o cartão continua clicável |
| Filtro sem resultado | "Nenhuma peça da marca {nome}." e "Nova peça para {nome}" |

### 3.3 Marcas (o cadastro do cliente)

É de onde o formulário puxa o que não muda. Sem ele não existe "segunda peça em menos de um minuto".

Uma marca guarda: nome, site, cores com papel (primária, destaque, fundo, texto), fonte de título e de texto, logo, ícones e elementos, rodapé fixo, restrições permanentes ("nunca foto de pessoa").

- **A marca nasce dentro do primeiro briefing**, não numa tela à parte: quem chega pela primeira vez preenche identidade no próprio formulário e ela é salva como marca ao enviar. A tela Marcas serve para editar depois.
- **Marca sem identidade é um estado válido e dito.** A POC descobriu na rodada 7 que mandar as cores de exemplo como se fossem da marca estraga a peça. Então não há cor nem fonte padrão: enquanto o campo está vazio, a tela diz "Sem identidade definida: a direção de arte escolhe".
- Para o leigo, a marca é o próprio negócio. O nome "Marca" serve aos dois (alternativa "Cliente", decisão 9.14).

**Leitura do site** (existe na POC, ganha estados):

| Estado | O que a pessoa vê |
|---|---|
| Lendo | "Abrindo {site} e medindo cores, fontes e logo. Leva até um minuto." e "Cancelar". O resto do formulário continua editável |
| Lido | Captura do topo do site, faixa de cores, fontes; os campos preenchidos ganham a marca "lido do site, confira" até serem tocados |
| Parcial: fonte comercial | "O site usa Didot, que não está disponível aqui. Pus Bodoni Moda, a mais próxima. No Photoshop você troca pela original." |
| Parcial: sem logo em vetor | "Não achei o logo em vetor no site. Envie o arquivo em SVG." |
| Erro: site não abriu ou tempo esgotado | "Não consegui abrir {site}. Confira o endereço ou preencha a identidade à mão." Os campos manuais continuam ali |
| Erro: endereço recusado | "Só consigo ler sites públicos." |

**Logo e ícones.** Ao enviar um SVG, a tela mostra **a miniatura do vetor como o Otto o entendeu**, ao lado do nome do arquivo. A rodada 6 teve um logo destruído e outro recusado; o designer precisa ver em dois segundos se o logo chegou inteiro, antes de gastar vinte minutos. Avisos da importação aparecem em linguagem do ofício: "Importei o logo. Ficou de fora: texto não convertido em curva (1), clip-path (1)."

Logo em PNG: aceito como imagem, com a nota "Logo em PNG não muda de cor. Para a versão em branco ou monocromática, envie em SVG." (suposição 10.6).

### 3.4 Formulário de briefing

**De modal para tela inteira**, em três blocos na ordem do que varia. A POC mostra cinco seções de uma vez, com identidade no meio; na segunda peça de uma marca, quatro delas não mudam.

```
┌ Nova peça ───────────────────────────── Começar de: [briefing salvo ▾] ┐
│                                                                        │
│ 1  MARCA                                                               │
│    [ Crové ▾ ]   ■ ■ ■ ■  Lilita One · Poppins  [logo]     editar      │
│                                                                        │
│ 2  ESTA PEÇA                                                           │
│    Título *        [______________________________________]            │
│    Subtítulo       [______________________________________]            │
│    Chamada         [______________]   Rodapé  @crove (da marca)        │
│    Formatos *      [Feed 1080×1350] [Quadrado] [Story] [Banner] [Capa] │
│    Imagem          (•) Minhas imagens  ( ) Banco de imagens  ( ) Sem   │
│                    [ enviar fotos ]  ▢ ▢                               │
│    Objetivo        [Vender ▾]     Público [_____________________]      │
│                                                                        │
│ 3  MAIS OPÇÕES  ▸   (cuidado, estilo, restrições, observações)         │
│                                                                        │
├────────────────────────────────────────────────────────────────────────┤
│ Salvar como briefing        2 formatos · costuma levar de 15 a 30 min  │
│                                         [ Cancelar ]  [ Criar a peça ] │
└────────────────────────────────────────────────────────────────────────┘
```

Regras:

- **Bloco 1, Marca.** Escolhida a marca, a identidade aparece recolhida numa linha (amostras, fontes, logo). "Editar" abre os campos ali mesmo. Na primeira vez, o bloco vem aberto com "Ler do site".
- **Bloco 2, Esta peça.** Só o que muda de uma peça para outra. Obrigatórios: título e ao menos um formato (a regra da POC).
- **Bloco 3, Mais opções.** Recolhido. Cuidado (esforço), estilo, restrições (as permanentes vêm da marca, já preenchidas) e observações.
- **Rodapé fixo** mostra o número de formatos e a faixa de tempo típica antes do clique. Quem vai esperar 20 minutos sabe disso antes, não depois.
- **Rascunho automático** no navegador. Fechar a aba sem enviar não perde o que foi digitado.
- **Briefing salvo** vai para a conta (na POC é `localStorage`). "Começar de" lista os salvos. No cartão de cada peça, "Nova peça com este briefing" abre o formulário já preenchido com o briefing que gerou aquela peça: o dado já está guardado na tarefa.
- "Preencher com exemplo" da POC sai do formulário: a peça de exemplo cumpre esse papel sem custar uma tarefa.

**Imagem: "Minhas imagens" vem primeiro e marcado.** A POC mostrou em três rodadas que foto de banco é o gargalo (marca de terceiros na foto, ampliação de até 210%, produto errado). Com objetivo "vender" ou "lançar produto" e a opção "Banco de imagens" escolhida, uma linha abaixo: "Peça de produto pede a foto do produto. Banco de imagens quase nunca tem o produto certo, e as fotos chegam a 1280 px."

| Estado da imagem | O que a pessoa vê |
|---|---|
| Enviando | Barra por arquivo; o botão de criar espera o envio terminar |
| Enviada | Miniatura com as medidas ("2400×1600") |
| Baixa resolução para o formato escolhido | Na miniatura: "800×600. No Story vai ser ampliada 240% e perder nitidez." com "Usar assim" e "Trocar". **Avisa, não bloqueia**: às vezes é a única foto que o cliente mandou |
| Formato não reconhecido | "Não reconheci este arquivo. Aceito PNG, JPG e WebP." |
| Acima de 25 MB | "Arquivo de {n} MB. O limite é 25 MB." |
| Falha no envio | Na miniatura: "Não enviou." e "Tentar de novo". As outras fotos ficam |

| Estado do formulário | O que a pessoa vê |
|---|---|
| Vazio, primeira vez | Bloco 1 aberto, bloco 2 com exemplos nos campos (texto de exemplo em cinza, nunca valor) |
| Carregando marca ou briefing salvo | Campos-esqueleto; o que já foi digitado não é sobrescrito sem aviso |
| Inválido | O botão fica desativado e diz o motivo ao lado: "Falta o título" ou "Escolha ao menos um formato" |
| Enviando | "Enviando ao Otto…" |
| Otto ocupado em outra peça | O botão vira "Criar a peça (entra na fila)" e a linha ao lado diz qual peça está na frente |
| Limite do dia atingido | "Hoje não consigo começar tarefas novas. O limite volta amanhã. Seu briefing fica salvo como rascunho." |
| Erro ao enviar | "Não consegui enviar o briefing. Nada se perdeu; tente de novo." |

**Esforço criativo: simplifica para três.** A rodada 8 criou sete níveis e registrou que **nenhuma peça foi gerada por nível**: ninguém sabe, hoje, o que separa "Avançado" de "Conceitual" no resultado. O designer também não saberia escolher. O que ele consegue pesar é tempo contra cuidado. Proposta:

| Na tela | Mapeia para (proposta, o treinador ajusta depois de medir) | Diz ao designer |
|---|---|---|
| Direto | `STANDARD` | "Resolve bem, sem explorar alternativas. O mais rápido." |
| Cuidadoso (padrão) | `REFINED` | "Mais atenção a composição, tipografia e acabamento." |
| Autoral | `CONCEPTUAL` | "Explora conceitos antes de escolher. O mais demorado." |

- Os sete níveis continuam no código. A tela mostra três e cada um ganha a faixa de tempo **quando ela for medida**; antes disso, só a ordem ("o mais rápido", "o mais demorado"), sem número inventado.
- A frase da POC fica: "Não muda o estilo nem a quantidade de elementos."
- **O seletor sai do pedido de ajuste.** "Título em azul" não tem esforço criativo.
- Decisão do Felipe (9.3), porque os sete níveis são dele e de ontem.

**Máximo de formatos por tarefa: três** (decisão 9.13). Dois formatos já levam de 14 a 30 minutos; cinco não foram medidos. Para os outros formatos existe "Adaptar para".

### 3.5 O "pode" antes de tarefa grande

O ADR 029 manda esperar o "pode" em tarefa grande: mais de uma prancheta, ou remoção. A POC anuncia e segue. No MVP o "pode" existe e é **cumprido pelo servidor**, não só pedido no prompt (seção 8.1).

**Quando o Otto espera:**

| Situação | Espera? |
|---|---|
| Briefing com dois ou três formatos | Sim, depois de definir a direção |
| Briefing com um formato | Não. Mostra a direção e segue; dá para interromper |
| Ajuste em uma prancheta, sem remover nada | Não |
| Adaptar para um formato | Não |
| Adaptar para dois ou mais formatos, variações em várias pranchetas | Sim |
| Qualquer tarefa que remova camada ou prancheta | Sim |

**Por que na direção e não antes.** No briefing por formulário, o plano é o próprio formulário: o designer acabou de escolher os formatos. O que ele ainda não viu é a **direção de arte**, que sai em uma chamada, no começo. Conferir a direção custa um minuto de atenção e evita vinte minutos numa direção errada. É o ponto mais barato de toda a tarefa para corrigir o rumo.

```
┌ Otto ─────────────────────────────────── aguardando seu "pode" ┐
│ Esta é a direção. Posso produzir?                              │
│                                                                │
│ Conceito     Lua de latão: o sax dentro de um círculo que      │
│              cruza o título.                                   │
│ Assinatura   O círculo se repete como selo das datas.          │
│ Paleta       ■ fundo  ■ título  ■ acento                       │
│ Tipografia   Alfa Slab no título · Plex Sans no texto          │
│ Imagem       Sax em duotone azul e dourado, do banco.          │
│ Vou criar    Feed 1080×1350 · Story 1080×1920                  │
│ Tempo        costuma levar de 15 a 30 minutos; pode sair.      │
│                                                                │
│ [ Pode ]   [ Ajustar a direção ]   Cancelar a tarefa           │
└────────────────────────────────────────────────────────────────┘
```

- **Pode**: segue. O painel passa a mostrar as etapas (3.6).
- **Ajustar a direção**: abre um campo de texto ("O que muda?"). O Otto refaz a direção e mostra de novo. Sem limite de voltas na tela; cada volta é uma chamada.
- **Cancelar a tarefa**: nada foi criado, a peça volta ao que era.
- **Sem resposta**: o Otto espera, sem gastar. Não segue sozinho depois de um prazo (decisão 9.4). Depois de 10 minutos sem resposta e com a aba fora de vista, manda o aviso "Aguardando seu pode".
- Em tarefa sobre peça existente, o cartão é menor: três ou quatro linhas de plano, com o que será criado, alterado e **removido** em linhas separadas. Remoção nunca vem misturada no texto.

| Estado | O que a pessoa vê |
|---|---|
| Definindo a direção | Etapa "Definindo a direção de arte" ativa; a tela de briefing já avisou: "Em instantes mostro a direção. Depois do seu 'pode', a produção leva de 15 a 30 minutos e você pode sair." |
| Direção não saiu válida (duas tentativas) | "Não consegui fechar uma direção de arte. Posso seguir só com o briefing?" com "Pode" e "Cancelar a tarefa" |
| Refazendo depois de "ajustar" | O cartão anterior fica esmaecido, com "Refazendo a direção com o seu ajuste." |

O treinador-do-otto define como a direção vira texto curto de tela (a POC mostra o texto bruto da direção) e como o agente declara o plano de forma estruturada.

### 3.6 A espera

**Princípio: o designer não espera olhando.** O desenho serve a quem sai. Quem quiser ficar pode, e isso fica registrado (hipótese 3).

**O que ele vê se ficar** (painel do Otto, com o canvas atualizando a cada lote, como na POC):

```
┌ Otto ───────────────────────────────── trabalhando · há 8 min ┐
│ Briefing · Lançamento Crové · cuidadoso                        │
│                                                                │
│  ✓ Li o briefing e a marca                                     │
│  ✓ Direção de arte                                             │
│  ✓ Feed montado                                                │
│  ◐ Montando o Story                                            │
│  ○ Conferência: render e verificação                           │
│  ○ Segunda conferência                                         │
│                                                                │
│  Tarefas como esta costumam levar de 15 a 30 minutos.          │
│  Pode fechar esta aba: o trabalho continua e eu aviso          │
│  quando estiver pronto para revisar.                           │
│                                                                │
│  ▸ Como o Otto está trabalhando (23 passos)                    │
│                                              [ Interromper ]   │
└────────────────────────────────────────────────────────────────┘
```

- **Etapas, não log.** A lista tem de cinco a sete etapas com nome de coisa feita. O log passo a passo da POC ("Aplicou…", "Conferiu o render…") continua existindo, **fechado**, em "Como o Otto está trabalhando".
- **Sem barra de porcentagem.** O ciclo do agente não é previsível (de 14 a 49 chamadas nas rodadas medidas). Barra que chuta porcentagem mente. Mostro etapa atual, tempo decorrido e a faixa típica de tarefas do mesmo tipo.
- **Passou da faixa**: "Está levando mais que o normal. Continuo trabalhando. Se quiser, interrompa e fique com o que já foi feito."
- **Canvas ao vivo.** As pranchetas aparecem conforme são montadas. Navegar, dar zoom e selecionar para olhar: liberado. Editar: travado, com a razão dita uma vez no topo do canvas: "O Otto está trabalhando nesta peça. A edição volta quando ele terminar."

**O que ele pode fazer enquanto isso:**

- Fechar a aba, o navegador ou o computador.
- Abrir outra peça e editar à mão.
- Preencher o briefing da próxima peça (entra na fila, decisão 9.7).
- Interromper. O que já foi feito vira conjunto para revisar.

**Como é avisado**, do mais leve ao mais forte:

1. **Título da aba** muda: "Otto trabalhando (8 min) · Crové" → "● Pronto para revisar · Crové".
2. **Notificação do navegador**, se permitida. A permissão é pedida no contexto, na primeira tarefa, junto da frase "pode fechar esta aba" ("Avisar neste computador quando terminar"), e nunca na chegada.
3. **E-mail**, se a aba não estava visível quando a tarefa mudou de estado (decisão 9.8). É o único canal que alcança quem fechou o navegador. Três motivos apenas: pronto para revisar, aguardando o "pode" há 10 minutos, não terminou.
4. **Selo no cartão** da lista de peças, para quem volta sem aviso.

**Voltar.** Abrir a peça em qualquer momento mostra o estado atual completo: etapas concluídas, canvas no ponto em que está, tempo decorrido. Não há "reconectando" como estado de erro; se o stream cair, o painel mostra "Sem atualização ao vivo, tentando de novo" e continua com o último estado conhecido.

| Estado | O que a pessoa vê |
|---|---|
| Na fila | "Na fila. Começo quando terminar {outra peça}." |
| Trabalhando | Etapas, tempo, faixa típica |
| Além da faixa | A frase "levando mais que o normal" |
| Stream caiu | "Sem atualização ao vivo, tentando de novo." O estado é relido a cada 20 s |
| Aba reaberta | Estado atual, sem animação de "carregando tudo de novo" |
| Interrompida pelo designer | "Você interrompeu. O que eu já tinha feito está aqui para revisar." |
| Não terminou | Ver 5.1 |

### 3.7 Revisão das alterações do Otto

Quando o Otto entrega, o painel vira revisão. O canvas enquadra as pranchetas da tarefa.

```
┌ Otto ─────────────────────────────────── pronto para revisar ┐
│ Alterações do Otto · 21 min                                   │
│ Montei Feed e Story com o conceito "lua de latão". A foto     │
│ do sax vem do banco.                                          │
│                                                               │
│ PENDÊNCIAS (2)                                                │
│  ! Foto do sax ampliada 140% no Story         [ver] [trocar]  │
│  ! Story: faixa vazia acima da zona da interface      [ver]   │
│                                                               │
│ PRANCHETAS                                                    │
│  ▢ Feed 1080×1350    nova · 14 camadas   [ver] [descartar]    │
│  ▢ Story 1080×1920   nova · 15 camadas   [ver] [descartar]    │
│                                                               │
│ [ Aceitar ]  [ Desfazer tudo ]  [ Segure para ver o antes ]   │
│                                                               │
│ Quase lá?  [ o que muda?___________________ ]                 │
│            [ Aceitar e pedir ajuste ]                         │
│                                                               │
│ ▸ Como o Otto trabalhou (41 passos)                           │
└───────────────────────────────────────────────────────────────┘
```

**As três saídas da POC ficam** (Aceitar, Desfazer tudo, Segure para ver o antes) e entram quatro regras:

1. **Aceitar em parte, no MVP, é por prancheta.** "Descartar" numa prancheta criada pela tarefa a remove; o resto fica. Tecnicamente é uma operação comum de remover prancheta, não um desfazer seletivo, por isso é barato. Aceitar parte das camadas de uma prancheta fica fora (decisão 9.5): quem quer isso aceita e ajusta, ou pede ajuste.
2. **Editar aceita.** A primeira tentativa de edição manual durante a revisão pergunta uma vez: "Editar aceita as alterações do Otto." com "Aceitar e editar" e "Voltar à revisão". Some o erro 409 da POC ("você editou depois das alterações do Otto").
3. **A tarefa é uma unidade do histórico.** Durante a revisão, Ctrl+Z não desmonta o conjunto lote a lote: mostra "As alterações do Otto estão em revisão. Aceite ou desfaça tudo." Depois de aceita, Ctrl+Z desfaz a tarefa inteira em um passo, e Ctrl+Shift+Z a refaz. No painel de histórico, a tarefa aparece como uma linha ("Otto · Briefing · 14 alterações") que abre para mostrar os lotes, com a ação **"Voltar para antes desta tarefa"**. Se houver edições do designer depois, o aviso diz quantas vão junto.
4. **"Aceitar e pedir ajuste"** resolve o caso mais provável (a peça está 80% boa): aceita o conjunto e abre uma tarefa nova por cima, num gesto só e com o nome dizendo o que faz.

**Para onde o olho vai.** Pendências antes das pranchetas: é o que o Otto disse que não resolveu, e esconder isso depois do botão "Aceitar" seria desonesto. "Ver" numa pendência seleciona a camada e enquadra.

**"Segure para ver o antes"** em prancheta nova mostra o canvas sem ela. Vale mais em tarefa de ajuste e de adaptação, em que existe um antes.

| Estado | O que a pessoa vê |
|---|---|
| Entregue sem pendência | O bloco de pendências diz "Nenhuma pendência. Conferi o render e a verificação não acusou nada." Zero também é informação |
| Entregue com avisos da verificação | Os avisos entram na lista de pendências, com a camada |
| Entrega parcial (parou no limite de conferências) | Resumo começa por "Parei no limite de conferências." e as pendências dizem o que ficou |
| Não fez alteração nenhuma | "Não alterei nada." e o motivo que o Otto deu. Sem botões de aceitar ou desfazer |
| Aceitando, desfazendo | Botões desativados, "Aceitando…" |
| Erro ao aceitar ou desfazer | "Não consegui {aceitar}. A peça continua como estava; tente de novo." |
| Peça aberta em duas abas | Ver 5.3 |

### 3.8 Pendências que o Otto declara

Na POC a pendência é uma frase numa lista que some quando a tarefa é aceita. No MVP ela é um item da peça, com estado.

- **Estrutura mínima:** texto, tipo, camadas a que se refere, estado (aberta, resolvida, dispensada).
- **Tipos que importam agora:** foto em baixa resolução ou ampliada; foto de banco no lugar da foto do produto; marca de terceiro visível na foto; aviso que sobrou da verificação; limite de conferências atingido; pedido que o Otto não conseguiu cumprir ("isso eu não consigo fazer aqui").
- **Ações:** "ver" (seleciona e enquadra), a ação que resolve quando existe ("trocar" abre o envio de imagem para aquela camada), e "dispensar".
- **Sobrevivem ao aceite.** Ficam numa lista "Pendências" no painel do Otto, com contagem no topo do editor, até serem resolvidas ou dispensadas.
- **Aparecem na exportação.** "1 pendência aberta" entra no resumo do relatório, antes de baixar.
- **Resolvem sozinhas quando a causa some:** trocar a foto por outra com resolução suficiente fecha a pendência de resolução. As demais o designer dispensa.

| Estado | O que a pessoa vê |
|---|---|
| Nenhuma | "Nenhuma pendência." |
| Abertas | Lista com tipo, texto e ações |
| Camada da pendência foi removida | A pendência some junto |
| Dispensada | Sai da lista; fica recuperável em "ver dispensadas" |

### 3.9 Ajuste: conversa curta e edição manual

**Pedido de ajuste.** Com a peça aberta e sem tarefa viva, o painel do Otto mostra um campo e quatro atalhos:

```
┌ Otto ─────────────────────────────────────────────────────────┐
│ [ Adaptar para… ] [ Variações de título ] [ Revisar a peça ]  │
│                                                               │
│ Peça um ajuste                                                │
│ ┌───────────────────────────────────────────────────────────┐ │
│ │ sobre: Título (Feed)  ×                                   │ │
│ │ deixa em azul e um pouco maior                            │ │
│ └───────────────────────────────────────────────────────────┘ │
│                                    Ctrl+Enter  [ Pedir ]      │
│ ▸ Pendências (1)     ▸ Histórico (38)                         │
└───────────────────────────────────────────────────────────────┘
```

- **A seleção vai como contexto.** Com uma camada selecionada, o campo mostra "sobre: {camada}" e o pedido leva o id dela como dado. "Deixa em azul" deixa de depender de o Otto adivinhar de que camada se fala.
- **"Adaptar para…"** abre os formatos que a peça ainda não tem. Um formato: segue. Dois ou mais: passa pelo "pode".
- Sem seletor de esforço aqui.

**O pedido curto não é curto no relógio.** Na POC, a tarefa mais simples medida levou de 4,5 a 6 minutos. "Título em azul" pelo Otto, hoje, demora mais do que pelo painel de propriedades. Duas consequências:

1. Peço ao treinador-do-otto e ao backend um **caminho rápido para ajuste pontual** (uma prancheta, poucas operações, verificação sem direção de arte nem segunda conferência), com alvo de menos de um minuto. Sem isso, "ajuste pontual é conversa curta" é promessa de tela que o relógio desmente.
2. A edição manual do MVP precisa cobrir os ajustes pontuais mais comuns, porque é para lá que o designer vai quando o Otto demora.

**Edição manual mínima.** O critério é **ajustar o que o Otto fez**, não construir do zero:

| Ação | Na POC | No MVP |
|---|---|---|
| Selecionar, mover (arrastar, setas, Shift+seta) | existe | fica |
| Redimensionar pela alça, Shift mantém a proporção | alça desenhada, sem função | **entra** |
| Editar texto no canvas (duplo clique ou Enter) | só no painel | **entra** |
| Trocar a imagem de uma camada (enviar outra no mesmo lugar) | não existe | **entra**: é o conserto do gargalo da foto |
| Reenquadrar a foto (foco e zoom) | campos numéricos | fica; arrastar a foto dentro da moldura com duplo clique, se couber |
| Cor, fonte, tamanho, peso, alinhamento, entrelinha, tracking | existe | fica |
| Ocultar, bloquear, renomear, remover, ordem | existe (ordem só "frente" e "trás") | fica; arrastar na lista de camadas para reordenar, se couber |
| Desfazer | existe | fica |
| Refazer | não existe | **entra** |
| Duplicar camada | não existe | **entra** |
| Agrupar, desagrupar | existe | fica |
| Máscara, efeitos, filtros, ajuste, mesclagem, recorte do sujeito | existe no painel | fica, em grupos recolhidos (seção 4.2) |
| Seleção múltipla, alinhar e distribuir | não existe (as operações existem no catálogo) | segundo corte: entra se couber |
| Criar texto, forma ou camada de ajuste do zero | ajuste e textura pelo painel de camadas | texto e forma ficam fora; ajuste e textura ficam onde estão |

Toda ação continua virando operação do catálogo, com o histórico único (ADR 027).

| Estado | O que a pessoa vê |
|---|---|
| Operação recusada pelo servidor | O gesto volta atrás no canvas e um aviso curto diz o motivo em linguagem do ofício, nunca o erro cru |
| Camada bloqueada | Cursor de bloqueado; clique não seleciona no canvas, só na lista |
| Fonte ainda carregando | O texto aparece esmaecido com "carregando a fonte"; nunca com fonte trocada em silêncio |
| Sem conexão | Faixa no topo: "Sem conexão. A edição volta quando a conexão voltar." A edição trava: melhor travar do que deixar editar algo que não será salvo |
| Salvamento | Indicador discreto no topo: "salvo" ou "salvando…". Ctrl+S não abre o diálogo do navegador; pisca "salvo automaticamente" |

### 3.10 Exportação com relatório

**O relatório vem antes dos botões.** O designer vê o que vai em pixel e que fontes precisa ter no Photoshop antes de baixar. Nunca ao abrir o arquivo.

```
┌ Exportar para PSD ─ Lançamento Crové ───────────────────────────────┐
│                                                                     │
│  27 camadas editáveis · 2 em pixel · 3 fontes para instalar         │
│  1 pendência aberta                                                 │
│                                                                     │
│  VAI EM PIXEL (2)                                                   │
│   Feed / Textura de papel     objeto inteligente, modo multiplicação│
│   Story / Foto do produto     imagem, com a original embutida       │
│                                                                     │
│  FONTES QUE VOCÊ PRECISA TER NO PHOTOSHOP (3)                       │
│   Lilita One Regular · Poppins Regular · Poppins SemiBold           │
│   Vão no pacote. Instale antes de abrir, ou o Photoshop troca a     │
│   fonte quando você editar o texto.                                 │
│                                                                     │
│  PENDÊNCIAS ABERTAS (1)                                             │
│   Foto do sax ampliada 140% no Story                         [ver]  │
│                                                                     │
│  IMAGENS E LICENÇAS (1)                                             │
│   Feed / Sax: Pixabay, por {autor} · página da imagem               │
│                                                                     │
│  ▸ Todas as camadas (29)                                            │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│ [ Baixar pacote (.zip): PSDs, fontes e relatório ]                  │
│ PSD único com pranchetas · Feed.psd · Story.psd · PNG de cada uma   │
└─────────────────────────────────────────────────────────────────────┘
```

- **A primeira linha é o resumo em quatro números.** Quem lê só isso já sabe o essencial.
- **"Vai em pixel"** lista a camada e o motivo. Vazio é dito: "Nada foi rasterizado. Todas as camadas saem editáveis."
- **Fontes** é a seção que a POC calcula e não mostra. Com fonte substituída na leitura do site, a linha diz qual é a original: "Bodoni Moda (no lugar de Didot, que não está disponível aqui)."
- **A tabela camada a camada** da POC fica, recolhida, para quem quer conferir tudo.
- **PNG** entra como saída de segundo plano: prévia para mandar ao cliente e saída do leigo.
- **O relatório vai dentro do pacote** como texto, igual ao que a tela mostrou.
- Uma frase sobre o que o Photoshop faz ao abrir (a biblioteca avisa que ele pode pedir para atualizar as camadas de texto) **só entra na tela depois de alguém abrir o arquivo no Photoshop e ver o que acontece**. Hoje seria texto sobre algo que ninguém viu (suposição 10.2).

| Estado | O que a pessoa vê |
|---|---|
| Montando o relatório | Esqueleto das seções; botões desativados com "Montando o relatório…" |
| Relatório não saiu | "Não consegui montar o relatório, então não libero o download: você baixaria sem saber o que vai em pixel." e "Tentar de novo" |
| Exportação rápida | O botão vira "Preparando…" e o download começa |
| Exportação longa (mais de alguns segundos) | Progresso por prancheta ("Feed pronto · Story em andamento"). Dá para fechar o diálogo: "Aviso aqui quando o arquivo estiver pronto." Um aviso no topo do editor traz o link |
| Parcial | "O Story não exportou. O Feed está pronto para baixar." com "Tentar o Story de novo" |
| Link vencido | Clicar gera um novo link; o designer não vê "expirado" |
| Fonte que não pôde ser empacotada | Na seção de fontes: "Não consegui incluir {fonte} no pacote. Baixe em {origem}." |
| Peça com tarefa viva | "O Otto ainda está trabalhando nesta peça. Exporte quando ele terminar, ou interrompa." O estado em revisão **pode** ser exportado, com a linha "Inclui alterações do Otto ainda não aceitas." |

**Depois do PSD, a pergunta de retorno.** Abrir no Photoshop acontece fora do Otto: nenhum evento enxerga. Na próxima vez que o designer abrir a peça, ou a lista, depois de ter baixado um PSD, uma faixa fina e dispensável pergunta, uma vez por peça:

```
O PSD de "Lançamento Crové" abriu no Photoshop?
[ Usei como saiu ] [ Ajustei no Photoshop ] [ Refiz no Photoshop ]
[ Não abriu direito ] [ Ainda não abri ]                         ×
```

"Não abriu direito" abre "O que aconteceu?" e a opção de mandar a peça para a equipe olhar, que é o único caminho pelo qual a equipe vê um arquivo (ADR 031). É a superfície que mede a hipótese 2 e metade da hipótese 1 (seção 7.1).

### 3.11 Custo da tarefa e limites

**O designer não vê custo em reais nem tokens** (decisão 9.6). Vê o **tempo** que a tarefa levou, na revisão e no histórico.

Por quê:

- Não existe preço nem unidade de cobrança. Mostrar "R$ 3,48" ancora uma expectativa que o produto ainda não decidiu.
- A reclamação número um da categoria é crédito de IA (`docs/mercado/pesquisa-2026-09-design.md`, citada no `CLAUDE.md`). Um medidor de consumo na tela, antes de haver plano, importa a ansiedade sem necessidade.
- Tokens, chamadas e cache não dizem nada a quem usa.

O custo continua **registrado por tarefa** (ADR 029, item 5) e visível para o Felipe fora do editor.

**Limite é outra coisa, e esse aparece.** Se a conta tem teto de tarefas por dia (decisão 9.7), o designer sabe antes de bater nele: na tela de briefing, "Tarefas hoje: 4 de 6", em contagem de tarefas, nunca em "créditos". Bater no teto no meio do trabalho, sem aviso, é pior do que qualquer número.

---

## 4. Espaço de trabalho do editor

### 4.1 Disposição

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│ Otto › Peças › Lançamento Crové ▾     salvo    ↶ ↷    Pendências 1   [Exportar] │
├──┬──────────────────────┬────────────────────────────────┬──────────────────────┤
│V │ OTTO                 │                                │ PROPRIEDADES         │
│H │                      │                                │  (da seleção)        │
│Z │ etapas, "pode",      │            canvas              │                      │
│  │ revisão ou           │                                │                      │
│  │ pedido de ajuste     │    ┌─────┐   ┌───┐             ├──────────────────────┤
│  │                      │    │Feed │   │Sto│             │ CAMADAS              │
│  │                      │    │     │   │ry │             │  ▢ Feed              │
│  │ ▸ Pendências         │    └─────┘   │   │             │    T Título       •  │
│  │ ▸ Histórico          │              └───┘             │    ▨ Foto            │
│  │                      │                     62%  ⤢     │  ▢ Story             │
└──┴──────────────────────┴────────────────────────────────┴──────────────────────┘
 44        320                       flexível                        280
```

- **Direita igual ao Photoshop:** Propriedades em cima, Camadas embaixo. É onde a mão do designer já vai.
- **Esquerda:** a barra de ferramentas estreita e, ao lado dela, o painel do Otto. O Otto é a novidade e ganha lugar próprio, sem tirar nada do lugar conhecido. Pôr o Otto como aba da coluna direita faria clicar numa camada durante a revisão esconder a revisão.
- **Barra de ferramentas com três itens:** Mover (V), Mão (H), Zoom (Z). É pouco e é honesto: não há ferramenta de texto que não cria texto. A barra existe para as próximas entrarem no lugar esperado.
- **Topo:** caminho de volta para Peças, nome da peça (clicar renomeia), estado do salvamento, desfazer e refazer, contagem de pendências, Exportar. Sem nome de modelo.
- **Tab** esconde e mostra os painéis, como no Photoshop. O painel do Otto recolhe para um ícone na barra quando não há tarefa viva; reabre sozinho quando há.
- **Largura mínima útil: 1280 px.** Abaixo disso a coluna direita recolhe. Abaixo de 1024 px a peça abre só para olhar (canvas com pan e zoom) e uma linha diz "Para revisar e editar, abra no computador."

### 4.2 O que é obrigatório para o leigo e o que fica disponível

Não existe modo simples. Existe uma ordem de leitura:

| Camada da interface | Quem precisa | Como aparece |
|---|---|---|
| Formulário de briefing, "pode", revisão (aceitar, desfazer), exportar PNG ou PSD | Qualquer pessoa | Sempre visível; é o caminho da esquerda para o centro e para o botão Exportar |
| Clicar numa coisa no canvas, mover, redimensionar, editar o texto, trocar a foto | Quem quer ajustar | Direto no canvas, sem abrir painel |
| Propriedades básicas da seleção: texto, fonte, tamanho, cor, posição | Quem quer ajustar com precisão | Primeiro grupo do painel, aberto |
| Mesclagem, máscara, máscara de recorte, efeitos, filtros, camada de ajuste, tokens | Profissional | Grupos do painel **recolhidos**, que lembram o último estado. Nada escondido atrás de configuração |
| Árvore de camadas | Profissional; o leigo pode ignorar | Sempre visível à direita. Não atrapalha quem não usa |

O leigo consegue ir do briefing ao PNG sem tocar na coluna direita. O profissional encontra a coluna direita onde espera. É a mesma tela.

### 4.3 Atalhos mínimos

Os do Photoshop, sem inventar nenhum. Na POC existem: Ctrl+Z, setas, Shift+seta, Delete, espaço para a mão, Ctrl+roda para zoom e Shift+1 para enquadrar.

| Atalho | Ação | Situação |
|---|---|---|
| V · H ou espaço · Z | Mover · Mão · Zoom | V e Z novos |
| Ctrl+Z · Ctrl+Shift+Z | Desfazer · Refazer | refazer novo |
| Ctrl+0 · Ctrl+1 | Enquadrar tudo · 100% | novos (Shift+1 continua valendo) |
| Ctrl++ · Ctrl+− · Ctrl+roda · Alt+roda | Zoom | Alt+roda novo |
| Setas · Shift+setas | Mover 1 px · 10 px | existe |
| Delete ou Backspace | Remover camada | existe |
| Ctrl+J | Duplicar camada | novo |
| Ctrl+G · Ctrl+Shift+G | Agrupar · Desagrupar | novo (hoje só botão) |
| Ctrl+] · Ctrl+[ | Trazer para a frente · Enviar para trás | novo |
| Enter ou duplo clique · Esc · Ctrl+Enter | Editar texto · Sair · Confirmar | novo |
| Tab | Esconder e mostrar painéis | novo |
| Ctrl+Enter no campo do Otto | Pedir | existe |

Os atalhos só valem com o foco fora de campo de texto, como a POC já faz. Ctrl+0, Ctrl++ e Ctrl+− são zoom do navegador: o editor precisa capturá-los com o foco no canvas (a confirmar pelo especialista-react, suposição 10.8).

**Tecla do Photoshop sem ferramenta no Otto** (T, U, P, B, Ctrl+T e outras) não faz nada, e fica registrada como evento só com o nome da tecla. É o jeito de ver, sem perguntar, que ferramenta a mão do designer procurou (seção 7.1).

---

## 5. Estados transversais

### 5.1 A tarefa não terminou

Depois de 20 minutos de espera, este é o pior momento do produto. Três regras: dizer o que aconteceu em uma frase, **não perder o que foi feito**, oferecer o próximo passo.

| Causa | O que o Otto diz | Saídas |
|---|---|---|
| Falha de rede ou do serviço de IA, depois das novas tentativas automáticas | "Parei no meio: perdi a conexão com o serviço que uso para trabalhar. O que eu já tinha feito está aqui." | Ficar com o que foi feito (vai para revisão) · Tentar de novo · Desfazer tudo |
| Servidor reiniciou | "Parei no meio por uma falha do nosso lado. O que eu já tinha feito está aqui." | as mesmas |
| Limite de passos da tarefa | Não é erro: entrega com pendência "Parei no limite de conferências." | revisão normal |
| Interrompida pelo designer | "Você interrompeu. O que eu já tinha feito está aqui para revisar." | revisão normal |
| Falhou antes de alterar qualquer coisa | "Não consegui começar. Nada foi alterado na peça." | Tentar de novo |
| Limite do dia, descoberto no meio | "Bati no limite de hoje no meio da tarefa. O que eu já tinha feito está aqui." | Ficar com o que foi feito · Desfazer tudo. "Tentar de novo" só amanhã, e a tela diz isso |

"Tentar de novo" recomeça a tarefa do início, com o mesmo briefing, e avisa que o conjunto parcial será desfeito. Retomar do ponto em que parou seria melhor para quem esperou; fica como pedido ao backend e ao treinador (decisão 9.16).

**Lote recusado não é estado do designer.** O Otto lê o erro e refaz; a POC mostrou que isso funciona. Aparece só no log fechado, em tom neutro: "Uma alteração foi recusada pela validação. Refiz." Vira pendência apenas se o Otto desistir de algo por causa disso.

### 5.2 Fonte faltando

No MVP as fontes são as do Google Fonts (decisão 9.11), então "faltando" tem três formas:

| Caso | Onde aparece | Texto |
|---|---|---|
| Fonte da marca é comercial | Leitura do site, formulário, relatório de exportação | "Didot não está disponível aqui. Usei Bodoni Moda, a mais próxima." |
| A fonte não carregou no editor | Camada de texto esmaecida, marca na lista de camadas, faixa no topo | "Não consegui carregar {fonte}. O texto aparece, mas a medida pode estar errada. Tentar de novo." |
| A fonte não pôde ir no pacote | Relatório | "Não consegui incluir {fonte} no pacote. Baixe em {origem}." |

Nunca trocar a fonte em silêncio: texto com medida errada é o defeito que o designer só descobre no Photoshop.

### 5.3 Conflito de versão

A edição fica travada enquanto o Otto trabalha, o que elimina o conflito entre designer e agente. Sobra a mesma peça aberta em duas abas.

- Cada lote vai com a versão da peça que a aba conhece. Se o servidor tem outra, recusa.
- A aba atrasada desfaz o gesto e mostra: "Esta peça foi alterada em outra aba. Recarreguei a versão atual; sua última alteração não entrou." O canvas já mostra a versão nova.
- Sem mesclagem, sem diálogo de escolha. Colaboração em tempo real está fora da v1 (ADR 026).

### 5.4 Imagem em baixa resolução

Aparece em quatro lugares, sempre com o mesmo número: no envio (3.4), como pendência (3.8), como marca na camada (ícone com a ampliação, "140%") e no relatório de exportação. A regra da POC continua: o Otto não troca a foto do designer sem pedido; declara e oferece.

### 5.5 Importação com camadas não suportadas

Sem importar PSD no MVP, o caso real é o SVG de logo e de ícone (3.3): miniatura do que foi entendido e lista do que ficou de fora. Quando a importação de PSD entrar, o padrão é o mesmo: relatório **antes** de a peça abrir, com o que virou pixel e que fonte falta (ADR 028, item 4).

### 5.6 Acessibilidade, por baixo de tudo

- Tudo o que tem botão tem teclado e foco visível. Diálogos prendem o foco e devolvem ao fechar; Esc fecha.
- Mudança de etapa e de estado da tarefa é anunciada (`aria-live` educado), uma vez por etapa, não a cada lote.
- Marca do Otto, pendência e erro nunca dependem só de cor: há forma, ícone e texto.
- Contraste de texto de interface de 4,5:1 no tema escuro do editor.
- Preferência por menos movimento respeitada: sem animação no canvas além do que o designer provoca.

---

## 6. Texto de interface dos pontos críticos

**Tudo nesta seção é rascunho e passa pelo guardião da marca antes de ir ao código.** Critérios seguidos (`docs/marca/identidade.md`): colega de estúdio, direto, técnico e curto; "tarefa", nunca "prompt" ou "comando"; "alterações do Otto", nunca "IA gerou"; "exportar para PSD", nunca "converter para Photoshop"; vocabulário do ofício sem explicar; nenhum fornecedor de modelo ou de infraestrutura.

Perguntas para o guardião: (a) o Otto fala em primeira pessoa no painel ("Parei no meio", "Conferi o render")? Usei primeira pessoa nas falas do Otto e voz neutra nos rótulos do sistema. (b) "Peça", "prancheta", "marca" como nomes de tela. (c) Como chamar a segunda conferência, que na POC aparece como "Diretor de arte": o Otto é uma entidade só. (d) "Pixabay" e "Google Fonts" aparecem como origem de imagem e de fonte: é crédito exigido e informação de licença, não fornecedor de infraestrutura. Confirmar.

### 6.1 Durante a espera

| Momento | Texto |
|---|---|
| Na fila | Na fila. Começo quando terminar {peça}. |
| Etapa 1 | Lendo o briefing e a marca. |
| Etapa 2 | Definindo a direção de arte. |
| Pede o "pode" | Esta é a direção. Posso produzir? |
| Depois do "pode" | Combinado. Leva de 15 a 30 minutos. Pode fechar esta aba: o trabalho continua e eu aviso quando estiver pronto para revisar. |
| Etapa por formato | Montando o {Feed}. |
| Conferência | Conferindo: render e verificação. |
| Segunda conferência achou problema | Revisei a peça e achei {3} pontos. Corrigindo. |
| Além da faixa | Está levando mais que o normal. Continuo trabalhando. Se quiser, interrompa e fique com o que já foi feito. |
| Edição travada (topo do canvas) | O Otto está trabalhando nesta peça. A edição volta quando ele terminar. |
| Pedido de permissão para avisar | Avisar neste computador quando terminar |
| Entrega | Pronto para revisar. {resumo do Otto} |
| Entrega sem pendência | Nenhuma pendência. Conferi o render e a verificação não acusou nada. |
| Título da aba | Otto trabalhando ({8} min) · {peça} / ● Aguardando seu "pode" · {peça} / ● Pronto para revisar · {peça} |

E-mails (três, sem imagem, uma ação cada):

| Motivo | Assunto | Corpo |
|---|---|---|
| Pronto para revisar | {Peça}: pronto para revisar | Terminei {Peça} em {21} minutos. {n} pendências para você olhar. [Revisar as alterações] |
| Aguardando o "pode" | {Peça}: preciso do seu "pode" | Defini a direção de {Peça} e estou esperando você conferir antes de produzir. [Ver a direção] |
| Não terminou | {Peça}: parei no meio | Não consegui terminar {Peça}. O que eu já tinha feito está guardado. [Abrir a peça] |

### 6.2 Erro de tarefa

| Situação | Texto |
|---|---|
| Parou por falha do serviço | Parei no meio: perdi a conexão com o serviço que uso para trabalhar. O que eu já tinha feito está aqui. |
| Parou por falha nossa | Parei no meio por uma falha do nosso lado. O que eu já tinha feito está aqui. |
| Não começou | Não consegui começar. Nada foi alterado na peça. |
| Limite do dia, antes de começar | Hoje não consigo começar tarefas novas. O limite volta amanhã. Seu briefing fica salvo como rascunho. |
| Limite de conferências | Parei no limite de conferências. Ficou pendente: {lista}. |
| Não consegue fazer | Isso eu não consigo fazer aqui: {o quê}. {O que dá para fazer no lugar, se houver.} |
| Direção não saiu | Não consegui fechar uma direção de arte. Posso seguir só com o briefing? |
| Interrompida | Você interrompeu. O que eu já tinha feito está aqui para revisar. |
| Botões | Ficar com o que foi feito · Tentar de novo · Desfazer tudo |
| Aviso do "tentar de novo" | Tentar de novo recomeça do início e desfaz o que foi feito até aqui. |
| Lote recusado (só no log) | Uma alteração foi recusada pela validação. Refiz. |

### 6.3 Revisão

| Elemento | Texto |
|---|---|
| Título | Alterações do Otto |
| Botões | Aceitar · Desfazer tudo · Segure para ver o antes · Aceitar e pedir ajuste |
| Selo no canvas durante a comparação | Antes das alterações do Otto |
| Editar durante a revisão | Editar aceita as alterações do Otto. [Aceitar e editar] [Voltar à revisão] |
| Ctrl+Z durante a revisão | As alterações do Otto estão em revisão. Aceite ou desfaça tudo. |
| Desfazer a tarefa já aceita | Desfiz as {14} alterações do Otto. Ctrl+Shift+Z refaz. |
| Voltar para antes da tarefa, com edições depois | Voltar para antes desta tarefa desfaz também {3} alterações suas feitas depois. |
| Descartar prancheta | Descartar o {Story}? As outras pranchetas ficam. |
| Legenda | alterada pelo Otto |

### 6.4 Relatório de exportação

| Elemento | Texto |
|---|---|
| Título | Exportar para PSD |
| Apoio | Um PSD por prancheta, com texto e forma editáveis. Cada camada leva o próprio pixel, e o arquivo traz a composta. |
| Resumo | {27} camadas editáveis · {2} em pixel · {3} fontes para instalar · {1} pendência aberta |
| Em pixel, vazio | Nada foi rasterizado. Todas as camadas saem editáveis. |
| Em pixel, com itens | Vai em pixel ({2}). Você vê o resultado no Photoshop, mas não edita como texto ou forma. |
| Fontes | Fontes que você precisa ter no Photoshop ({3}). Vão no pacote. Instale antes de abrir, ou o Photoshop troca a fonte quando você editar o texto. |
| Fonte substituída | {Bodoni Moda} (no lugar de {Didot}, que não está disponível aqui) |
| Pendências | Pendências abertas ({1}). Você pode exportar assim; elas vão anotadas no relatório. |
| Imagens | Imagens e licenças ({1}) |
| Relatório não saiu | Não consegui montar o relatório, então não libero o download: você baixaria sem saber o que vai em pixel. |
| Botões | Baixar pacote (.zip): PSDs, fontes e relatório · PSD único com as {2} pranchetas · {Feed}.psd · PNG |
| Com revisão aberta | Inclui alterações do Otto ainda não aceitas. |
| Exportação longa | Preparando: {Feed} pronto, {Story} em andamento. Pode fechar; aviso aqui quando o arquivo estiver pronto. |
| Parcial | O {Story} não exportou. O {Feed} está pronto para baixar. |
| Pergunta de retorno | O PSD de "{peça}" abriu no Photoshop? [Usei como saiu] [Ajustei no Photoshop] [Refiz no Photoshop] [Não abriu direito] [Ainda não abri] |

### 6.5 Entrada

| Elemento | Texto |
|---|---|
| Botão | Receber o link de entrada |
| Aviso de privacidade | Seus arquivos não são lidos pela equipe nem usados para treinar nada. O texto dos pedidos que você escreve ao Otto pode ser lido para melhorar o produto. |
| Fora da lista | O Otto está em teste fechado. Guardei seu e-mail e aviso quando abrir. |

O aviso de privacidade é texto com efeito jurídico: guardião agora, jurídico antes do primeiro pagante (ADR 031, item 4).

---

## 7. Evidência: como o MVP testa as quatro hipóteses

### 7.1 Cada hipótese e o que a torna observável

Aviso de amostra antes de tudo: com cinco ou dez designers, **porcentagem não decide nada**. Cada número abaixo é lido por pessoa, em valor absoluto ("3 de 5"), e cada conclusão é sinal de poucas contas. O que decide é a sessão observada; os eventos mostram onde olhar. Todos os eventos seguem o ADR 031: tipo, quando e quanto, nunca texto de camada, nome de peça ou valor de cor. A lista final é do analista de produto.

**Hipótese 1: a primeira versão pelo briefing economiza tempo.**

- O relógio de parede (de 14 a 30 minutos) é o número errado. O que se compara é o **tempo ativo do designer**: preencher o formulário, responder ao "pode", revisar, ajustar. A espera só conta enquanto a aba da peça está visível.
- Eventos: `briefing_aberto`, `briefing_enviado` (segundos de preenchimento, quantos campos editados, origem: em branco, briefing salvo, peça anterior), `pode_respondido` (segundos), `revisao_decidida`, `edicao_manual` (tipo de operação), `exportacao_baixada`. Somados com a visibilidade da aba, dão o tempo ativo por peça.
- A outra metade da comparação ("fazendo do zero") **não é observável no produto**. Na sessão com designers, pedir o episódio: "A última peça parecida com esta: quando você começou e quando mandou ao cliente?" Grau: relatado episódico.
- "Peça que ele enviaria ao cliente" é medida pela pergunta de retorno (3.10): "Usei como saiu" e "Ajustei no Photoshop" contam; "Refiz no Photoshop" não.
- **O que a derruba aqui:** tempo ativo no Otto, somado ao ajuste que ele relata no Photoshop, igual ou maior que o tempo do episódio que ele contou; ou "Refiz no Photoshop" na maioria das peças exportadas.
- **Risco que o desenho ataca:** a espera mata a hipótese antes da qualidade. Se a pessoa fica olhando 20 minutos, o tempo ativo é o relógio de parede. Por isso o "pode fechar esta aba" e o aviso. O evento `aba_visivel_durante_a_tarefa` (fração do tempo) diz se o desenho funcionou.

**Hipótese 2: o PSD é o argumento de confiança.**

- No produto vejo o download (`exportacao_baixada`, com formato: pacote, PSD ou PNG). **Não vejo o arquivo ser aberto.** É uma afirmação de ausência e nenhum canal passivo a mede.
- A superfície que pergunta é a faixa de retorno da seção 3.10. Evento: `retorno_do_psd` com a opção escolhida.
- Sinal revelado: razão entre PSD e PNG por conta. Designer que só baixa PNG está usando o Otto como gerador de imagem.
- **O que a derruba:** a maioria nunca baixa PSD; ou baixa e responde "Ainda não abri" de forma repetida; ou responde "Refiz no Photoshop". "Não abriu direito" não derruba a hipótese: derruba o PSD, e é o achado mais valioso que o MVP pode produzir.

**Hipótese 3: revisar o conjunto de alterações é controle, não atrito.**

Os dois jeitos de ela cair viram sinais diferentes:

- *Aceita sem olhar.* Evento `revisao_decidida` com os segundos desde a entrega e a contagem de gestos de conferência antes da decisão: `antes_visto`, prancheta enquadrada, camada do Otto selecionada, pendência aberta com "ver". Aceite com zero gestos de conferência é aceite sem olhar. Uso contagem de conferência e não tempo de tela, porque tela confusa também aumenta o tempo.
- *Pede para ver o Otto trabalhando.* O log passo a passo fica **fechado por padrão**. Abrir é `passos_abertos`. Ficar com a aba visível durante a maior parte da tarefa é o outro sinal.
- O "pode" tem a mesma leitura: `pode_respondido` em menos de cinco segundos, sem nunca usar "Ajustar a direção", diz que o ponto de conferência é atrito.
- **O que a derruba:** a maioria das revisões é aceite sem gesto de conferência; ou a maioria das tarefas é assistida com o log aberto.

**Hipótese 4: adaptar formato é o trabalho que dói.**

- O instrumento é a escolha revelada: com uma peça pronta, "Adaptar para…" está a um clique, e "Nova peça" também. Evento `tarefa_pedida` com o tipo classificado (criar por briefing, adaptar, variação, ajuste, revisão) e a ordem da sessão.
- Sinal: por conta, quantas tarefas de adaptar e quantas de criar **a partir da segunda sessão**, quando já não é curiosidade.
- **Limite sério:** sem importar PSD, o designer só adapta peça nascida no Otto. A dor real dele é adaptar o arquivo que **já existe** no Photoshop. O MVP mede a hipótese 4 pela metade. Na sessão com designers, completar com o episódio ("a última vez que você adaptou uma peça para outros formatos: quantos formatos, quanto tempo?") e com a ferramenta que ele usa hoje para isso.
- **O que a derruba:** quem cria no Otto quase nunca pede adaptação da própria peça; e, no episódio contado, adaptar não aparece como tempo relevante.

**Fora das quatro, dois instrumentos baratos:**

- **Segunda sessão sem ser pedido** (gatilho do ADR 026: menos de 3 em 10 e o posicionamento de editor está errado): `sessao_iniciada` com o número de ordem por conta.
- **Atalho sem ferramenta** (`atalho_sem_ferramenta`, só o nome da tecla): mostra que ferramenta manual a mão procurou. É comportamento revelado sobre o que falta, sem perguntar.

### 7.2 Fichas das afirmações que sustentam escopo

Graus conforme a skill: observado, relatado episódico, comparável, inferido, não verificado. **Nenhuma destas está observada com designers.** Onde o grau é inferido, a coluna "o que sustenta" só traz coisa barata de desfazer, ou diz qual fato medido sustenta a peça cara no lugar da inferência.

| # | Afirmação (comportamento observável) | Tipo | Grau e evidência | O que sustenta | Como se mede | O que a mata |
|---|---|---|---|---|---|---|
| F1 | Durante a tarefa, o designer tira a aba da frente e volta pelo aviso | Sequência (tem gatilho externo: o aviso) | Inferido. Comparável candidato, não aberto nesta sessão: fila de render de vídeo e 3D (mesma fricção de enviar e esperar minutos, mesmo momento antes do valor) | A tarefa durável e o aviso por e-mail são caros, mas quem os sustenta é o fato medido (14 a 30 minutos) e a exigência do Docker, não esta ficha | Fração de aba visível; segundos do aviso ao retorno | A maioria assiste do começo ao fim, ou não volta no mesmo dia depois do aviso |
| F2 | Antes de aceitar, o designer faz ao menos um gesto de conferência | Sequência | Inferido. É a hipótese 3 | Ordem do painel de revisão (barato) | Gestos de conferência por revisão | Aceite sem gesto na maioria |
| F3 | No "pode", o designer lê a direção e às vezes ajusta | Taxa | Não verificado. Procurei medição na POC: o "pode" nunca foi implementado | O ponto de conferência na direção (reversível: vira opcional) | Segundos até a resposta; uso de "Ajustar" | Resposta em menos de 5 s em quase todas, sem nenhum ajuste |
| F4 | Com três níveis de cuidado, ninguém procura os sete | **Ausência** | Não verificado. A rodada 8 registra que os níveis não foram medidos | Seletor de três opções (reversível: os sete continuam no código) | Canal passivo não mede. Perguntar em sessão; olhar a distribuição entre os três | Designers em sessão pedem um nível entre dois, ou todos ficam no padrão (aí três já é demais) |
| F5 | A segunda peça da mesma marca leva menos de um minuto de formulário | Capacidade | Não verificado. O limiar é do ADR 033 | Marca como entidade e os três blocos do formulário (custo médio) | Segundos entre abrir e enviar, a partir da segunda peça da marca; campos editados | Mediana acima de um minuto; os campos editados dizem onde |
| F6 | Com o aviso sobre foto de banco, o designer envia a foto do cliente | Taxa | Inferido. O que está observado é o lado do agente: banco não tem a foto certa (rodadas 2, 3 e 6) | Ordem das opções de imagem e a linha de aviso (barato) | Fonte da imagem por briefing, cruzada com objetivo | Banco continua a escolha em peça de produto, e as pendências de foto dominam |
| F7 | Um leigo vai do briefing ao PNG sem usar a coluna direita | Capacidade | Não verificado | Nada caro: não se constrói modo separado | Observação direta com duas ou três pessoas que não são designers | Trava antes do PNG, ou precisa das camadas para chegar a algo aceitável |
| F8 | Se o ajuste pelo Otto leva mais de um minuto, o designer faz à mão | Preferência revelada | Inferido. Direção robusta: custo de execução maior derruba uso | A lista de edição manual mínima (custo médio) | Razão entre edições manuais e pedidos de ajuste depois da entrega | Designers pedem ajuste ao Otto mesmo esperando, e não tocam no painel |
| F9 | Sem ver custo, o designer não desconfia; vendo, se preocupa com consumo | Preferência | Comparável fraco: a reclamação nº 1 da categoria é crédito (`pesquisa-2026-09-design.md`, citada no `CLAUDE.md`; não reabri a fonte). Analogia parcial: lá existe plano pago, aqui ainda não | Esconder o custo (reversível em uma tela) | Sessão: alguém pergunta quanto custou? | Designers em sessão perguntam pelo custo de forma espontânea |
| F10 | O Otto à esquerda não atrapalha quem vem do Photoshop | Capacidade | Não verificado | A disposição dos painéis (custo médio para trocar depois) | Observação: onde ele procura as camadas e o Otto no primeiro minuto | Procura o Otto à direita, ou tenta fechar o painel para "ter o canvas de volta" |

A pesquisa com os primeiros designers tem que poder derrubar alguma destas. As mais frágeis, em que eu apostaria menos: **F3** (o "pode" pode ser só mais um clique) e **F8** (talvez o designer prefira esperar a mexer em painel que não conhece).

---

## 8. O que preciso de cada especialista

### 8.1 Backend

1. **Tarefa durável.** Roda sem cliente conectado, com estado gravado a cada mudança, e sobrevive a reinício do contêiner. Estados da seção 2.2. Se o processo cair no meio, a tarefa vira "não terminou" com o conjunto parcial preservado, e não desaparece.
2. **Progresso que se retoma.** Ao abrir a peça em qualquer momento: fotografia do estado atual (tarefa, etapas, peça) e, em seguida, o stream. Reconexão sem perder eventos. Releitura periódica como reserva quando o stream cai.
3. **Evento de etapa.** O painel mostra etapas com nome (3.6). Preciso de um evento explícito de etapa vindo do ciclo, não de inferência do frontend sobre lotes.
4. **O "pode" cumprido pelo servidor.** Estado de espera sem custo correndo; rotas para aprovar, ajustar (com texto) e cancelar. Regra aplicada na entrada do lote: sem plano aprovado, lote que toca uma segunda prancheta ou remove algo é recusado.
5. **Aviso.** E-mail em três transições (pronto para revisar, aguardando o "pode" há 10 minutos, não terminou), só quando nenhuma sessão da conta tinha a peça visível. Exige fornecedor de e-mail atrás de porta (ADR 020).
6. **Conta e entrada.** Link por e-mail, lista de convite, sessão, isolamento por conta (ADR 023). Recurso de outra conta responde 404.
7. **Marcas e briefings.** Marca (identidade, logo, ícones, rodapé, restrições) e briefing salvo, por conta. O briefing de cada tarefa fica guardado para "Nova peça com este briefing".
8. **Lista de peças** com estado da tarefa viva, minutos decorridos, número de formatos, marca e miniatura (render da primeira prancheta, atualizado a cada lote ou ao fim).
9. **Envio de arquivo com retorno útil.** Imagem: medidas e a ampliação que cada formato escolhido vai exigir. Vetor: avisos e uma miniatura do que foi entendido. Erros com código distinto (formato, tamanho, leitura).
10. **Leitura do site** com código de erro por causa (não abriu, tempo esgotado, endereço recusado) e cancelamento.
11. **Pendências como entidade:** texto, tipo, camadas, estado; resolução automática quando a causa some (resolução da imagem).
12. **Histórico com a tarefa como unidade:** desfazer e refazer; "voltar para antes desta tarefa" com a contagem de edições posteriores; versão da peça em todo lote, com recusa legível quando a aba está atrasada.
13. **Exportação:** relatório sem exportar (existe na POC), com as fontes e as substituições; PNG por prancheta; progresso por prancheta quando for longo; download por link de vida curta que se renova sem o designer ver; resultado parcial.
14. **Limites ditos antes:** tarefas simultâneas por conta, teto do dia e posição na fila, consultáveis antes de enviar o briefing; recusa com motivo legível. O limite diário do fornecedor de inferência é da plataforma inteira, então a checagem tem que ser antes de começar a tarefa, não no meio.
15. **Faixa de tempo típica** por tipo de tarefa, número de formatos e nível de cuidado (por exemplo, do primeiro ao terceiro quartil das tarefas concluídas), para a tela não inventar número.
16. **Interromper** com estado próprio e conjunto parcial preservado.
17. **Pergunta de retorno do PSD** e "mandar esta peça para a equipe olhar" (o único caminho de leitura do arquivo, ADR 031).
18. **Peça de exemplo** criada em toda conta nova.
19. **Custo por tarefa** registrado como hoje, sem ir ao navegador do designer.

Pergunta ao backend: quanto demora exportar um pacote de duas pranchetas pesadas? Se fica abaixo de uns três segundos, a exportação longa é caso raro e o diálogo simplifica.

### 8.2 Frontend (especialista-react)

1. **Rotas e telas** da seção 2.1.
2. **Nova disposição** do editor (4.1), com Tab, recolhimento por largura e o modo só de olhar em tela estreita.
3. **Máquina de estados da tarefa** na interface, alimentada por fotografia mais stream; título da aba; notificação do navegador pedida em contexto.
4. **Formulário em três blocos** com rascunho local, estados de envio de arquivo por item e a regra de identidade vazia.
5. **Revisão** com pendências acionáveis, lista por prancheta, "Aceitar e pedir ajuste", a pergunta de "editar aceita" e a tarefa como unidade do histórico.
6. **Edição manual** da seção 3.9: alças de redimensionar, texto no canvas, trocar imagem, refazer, duplicar. Todo gesto vira operação; o canvas continua fora do React.
7. **Atalhos** da seção 4.3 e o evento de atalho sem ferramenta.
8. **Exportar** com o relatório antes dos botões e os estados de 3.10.
9. **Estados transversais** da seção 5: sem conexão, fonte que não carregou, aba atrasada, sessão vencida.
10. **Nada de nome de modelo, token ou custo** na tela.
11. **Eventos de uso** conforme a lista que o analista fechar.

Limite conhecido que herda da POC: arrastar numa peça pesada recompõe a prancheta inteira (rodada 4). Com alças de redimensionar isso piora. É do spike de render (ADR 030), e eu preciso saber cedo se arrastar e redimensionar ficam fluidos.

### 8.3 Outros

- **Treinador-do-otto:** plano e direção em forma estruturada e curta para o cartão do "pode"; pendências com tipo e camadas; caminho rápido para ajuste pontual (alvo abaixo de um minuto); a seleção do designer como contexto do pedido; mapeamento dos três níveis de cuidado para os sete, depois de medir; como o Otto se apresenta na segunda conferência.
- **Guardião da marca:** toda a seção 6 e as quatro perguntas dela.
- **Analista de produto:** os eventos da seção 7.1 contra o ADR 031 (em especial `atalho_sem_ferramenta`, `retorno_do_psd` e a visibilidade da aba) e a definição de "gesto de conferência".
- **Especialista-grafico:** abrir os PSDs no Photoshop antes de qualquer teste com designer; dizer o que o Photoshop mostra ao abrir (para o texto do relatório); confirmar logo em PNG como camada de imagem; fluidez de arrastar e redimensionar.
- **Diretor-de-arte:** catálogo de formatos com zonas seguras (hoje são cinco formatos fixos no código) e a prioridade dos avisos da verificação que viram pendência.

---

## 9. Decisões que são do Felipe

Cada linha: a decisão e a minha recomendação.

1. **MVP aberto ou por convite?** Por convite: cada tarefa custa e ainda não há preço.
2. **Como se entra?** Link por e-mail, sem senha: um fluxo só, e o e-mail já é necessário para o aviso.
3. **Esforço criativo: sete níveis ou três na tela?** Três (Direto, Cuidadoso, Autoral), com os sete preservados no código; padrão no do meio. Medir os níveis antes de pôr tempo ao lado de cada um.
4. **O "pode": esperar sem prazo, ou seguir sozinho depois de alguns minutos?** Esperar sem prazo, com aviso aos 10 minutos. Revisar se a ficha F3 mostrar que ninguém lê.
5. **Aceitar em parte entra no MVP?** Só por prancheta ("descartar"), mais "voltar para antes desta tarefa". Por camada, fora.
6. **Mostrar o custo da tarefa ao designer?** Não. Mostrar o tempo. O custo fica registrado para você.
7. **Quantas tarefas ao mesmo tempo e por dia, por conta?** Uma por vez, as outras em fila; teto diário definido pelo custo medido e pelo limite do fornecedor, mostrado como contagem de tarefas.
8. **Aviso por e-mail quando a tarefa termina?** Sim. Com espera de 14 a 30 minutos, é o que permite sair. Pede um fornecedor de e-mail.
9. **Saída para o Illustrator (ADR 034) no MVP?** Fora do MVP, mantida na v1.
10. **Importar PSD no MVP?** Fora, sabendo que a hipótese 4 fica medida pela metade. Se a hipótese 4 for a que mais importa a você, esta é a peça a trazer de volta primeiro.
11. **Fonte da marca enviada pela conta?** Fora do MVP: só Google Fonts, com a substituição dita na tela e no relatório. Entra junto com o parecer jurídico sobre fonte.
12. **PNG no MVP?** Sim: é a saída do leigo e a prévia do profissional, e o render já existe.
13. **Máximo de formatos por tarefa?** Três, até medir tarefas maiores.
14. **Cadastro do cliente como "Marca"?** Sim, e com esse nome (serve ao designer e ao leigo). Alternativa: "Cliente".
15. **Peça de exemplo em toda conta nova?** Sim: deixa ver camadas e baixar um PSD no primeiro minuto, sem custo de tarefa.
16. **Tarefa que parou: recomeçar ou retomar do ponto?** Recomeçar no MVP; retomar depende do que o backend e o treinador disserem que custa.
17. **Editor só em computador?** Sim; em tela estreita a peça abre só para olhar.
18. **Objeto inteligente e filtro inteligente** estão na POC e `docs/tecnico/psd.md` os lista como fora da v1 (rodada 4 do README). Não é decisão de experiência, mas muda o que o relatório de exportação diz. Pede ADR; recomendo decidir antes de fechar o texto do relatório.
19. **Pergunta de retorno depois do PSD?** Sim: é o único instrumento da hipótese 2.

Não é decisão, é bloqueio: **abrir os PSDs no Photoshop antes de mostrar o MVP a qualquer designer.**

---

## 10. O que supus sem conseguir verificar

1. **A faixa de 14 a 30 minutos vale para o MVP.** Foi medida nas rodadas 3 a 7 com outro modelo. Com o modelo atual e com cada nível de cuidado, o tempo não está no README. O desenho da espera funciona nos dois casos; os textos com número, não.
2. **O que o Photoshop mostra ao abrir o PSD.** Ninguém abriu. Todo texto de tela sobre o comportamento do Photoshop espera essa conferência.
3. **A direção de arte sai em um ou dois minutos.** É uma chamada, mas a duração não foi medida. Se levar cinco, o "pode" na direção obriga o designer a esperar mais do que um ponto de conferência justifica.
4. **O ciclo do agente consegue declarar etapas e um plano estruturado.** Hoje ele emite eventos de lote, render e verificação; etapa e plano são texto livre.
5. **Um caminho rápido para ajuste pontual é viável** abaixo de um minuto. Não há medição de tarefa pequena com o modelo atual.
6. **Logo em PNG pode entrar como camada de imagem.** O leitor de site já devolve logo como imagem em um caso, mas o formulário só aceita SVG.
7. **O MVP reaproveita o comportamento da POC**, reescrito no monorepo. Se for reaproveitar o código da POC como está, a lista "entra como está" fica mais barata e a "entra redesenhado" mais cara.
8. **O navegador deixa o editor capturar Ctrl+0, Ctrl++ e Ctrl+−** com o foco no canvas.
9. **Exportar duas pranchetas leva segundos, não minutos.** Se levar minutos, a exportação longa vira o caso comum.
10. **O limite diário do fornecedor de inferência continua o medido em 2026-09-29** (cerca de 45 milhões de tokens por dia para a plataforma inteira, com uma tarefa gastando perto de 1 milhão). É o que torna a decisão 9.7 obrigatória.
11. **A pesquisa de mercado diz o que o `CLAUDE.md` resume** sobre crédito de IA. Não reabri `docs/mercado/pesquisa-2026-09-design.md`.
12. **Nenhuma afirmação sobre o designer foi observada.** Tudo na seção 7.2 é inferido ou não verificado. Os comparáveis citados são candidatos: não abri fonte nesta sessão e não trago magnitude de nenhum.
