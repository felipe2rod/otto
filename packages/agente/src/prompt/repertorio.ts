// Repertório do Otto: o que ele sabe de composição e como pede cada recurso ao editor.
// É o mesmo texto para o agente, o diretor de arte e o revisor: quem dirige escolhe pelo nome,
// quem executa usa a sintaxe, quem revisa cobra a regra.
//
// Veio de poc/src/servidor/prompt.ts (rodadas 2 a 8). O que mudou na migração:
// - as técnicas e as receitas saem conforme o que o ambiente de fato tem (recorte de sujeito, texturas,
//   banco de imagens): o Otto não anuncia recurso que o editor não possui (ADR 029, caráter);
// - o catálogo ganhou duplicar e transferir, e o motor novo parte a palavra que não cabe na caixa.

/** O que o ambiente da tarefa oferece além do catálogo. Decide quais ferramentas, técnicas e receitas aparecem. */
export interface Capacidades {
  /** buscarImagens e trazerImagem */
  bancoDeImagens: boolean;
  /** detectarSujeito e máscara de sujeito */
  sujeito: boolean;
  /** listarTexturas */
  texturas: boolean;
  /** buscarFontes num catálogo além da biblioteca da conta */
  buscaDeFontes: boolean;
}

export const CAPACIDADES_MINIMAS: Capacidades = { bancoDeImagens: false, sujeito: false, texturas: false, buscaDeFontes: false };

export const CRITERIOS_DE_PORTFOLIO = `## Critérios de peça autoral / nível portfólio

Uma peça destinada a portfólio não é apenas uma peça correta. Ela precisa ter uma ideia visual que justifique sua existência.

### 1. Conceito antes de decoração
- Toda decisão visual relevante precisa reforçar uma ideia central.
- Não adicione sombra, textura, brilho, gradiente, forma, recorte ou efeito apenas porque "fica bonito".
- Efeito sem função conceitual é ruído.
- A peça deve conseguir ser descrita por uma frase visual forte.
- Se o conceito puder ser removido sem alterar significativamente a composição, o conceito está fraco.

### 2. Distintividade
Antes de finalizar, pergunte:
"Se eu remover o logo, esta peça ainda é reconhecível como uma direção de arte específica?"
"Ela poderia pertencer a dezenas de marcas diferentes?"
"Existe pelo menos uma decisão visual que um designer não chegaria naturalmente usando um template?"

Se parecer template, banco de imagens ou composição genérica de publicidade, recomponha.

### 3. Hierarquia dramática
Não trate todos os elementos como igualmente importantes.

Escolha:
- 1 herói visual;
- 1 âncora tipográfica ou verbal;
- 1 elemento secundário;
- o restante deve sustentar esses elementos.

O herói deve dominar a composição por escala, contraste, posição, profundidade, cor ou enquadramento.

A hierarquia deve ser percebida mesmo em thumbnail.

### 4. Tensão visual
Peças memoráveis normalmente possuem algum contraste controlado:
- grande × pequeno;
- cheio × vazio;
- rígido × orgânico;
- nítido × desfocado;
- claro × escuro;
- frontal × profundo;
- estático × movimento;
- tipografia dominante × imagem subordinada;
- ordem × ruptura.

Não introduza tensão aleatória. Escolha uma tensão principal e faça a composição girar em torno dela.

### 5. Escala
Prefira decisões de escala expressivas a pequenos efeitos.

É permitido:
- título muito maior que o esperado;
- objeto ocupando grande parte da prancheta;
- elemento parcialmente cortado;
- espaço negativo deliberadamente enorme;
- detalhe muito pequeno funcionando como contraponto.

Evite fazer uma peça "premium" simplesmente diminuindo tudo e adicionando muito espaço.

### 6. Profundidade e integração
A composição não deve parecer:
"fundo + foto + texto por cima".

Sempre que fizer sentido, construa pelo menos 3 planos:
- fundo;
- plano intermediário;
- herói/primeiro plano.

Use máscara, recorte, sombra, sobreposição, escala, desfoque ou tratamento de cor para fazer os planos interagirem.

O texto pode atravessar, esconder, revelar ou ser parcialmente escondido pelo elemento principal quando isso aumentar a integração.

### 7. Fotografia como matéria-prima
Não escolha uma foto apenas porque ela mostra o objeto correto.

Escolha pela combinação:
- pose;
- silhueta;
- direção da luz;
- espaço negativo;
- perspectiva;
- textura;
- expressão;
- possibilidade de recorte;
- potencial de interação com tipografia e formas.

Uma foto tecnicamente correta mas visualmente sem personalidade deve ser descartada.

### 8. Transformação
A fotografia não precisa permanecer com aparência de "foto colocada no layout".

Quando a direção permitir, transforme a imagem através de:
- duotone;
- mapa de degradê;
- recorte;
- máscara;
- escala extrema;
- sobreposição;
- luz;
- textura;
- desfoque;
- movimento;
- interação tipográfica.

O objetivo é fazer a imagem pertencer ao sistema visual da peça.

### 9. Tipografia como elemento gráfico
Tipografia não é apenas informação.

Quando o conceito permitir, trate palavras como forma:
- escala;
- corte;
- sobreposição;
- repetição;
- contraste de pesos;
- tracking;
- espaçamento;
- alinhamento;
- interação com fotografia;
- palavra parcialmente ocultada.

Mas nunca sacrifique a legibilidade quando o texto precisa ser comunicado.

### 10. Assinatura visual
A peça precisa possuir pelo menos um recurso visual proprietário da direção:
- composição;
- tratamento fotográfico;
- elemento geométrico;
- relação entre texto e imagem;
- recorte;
- cor;
- sistema de formas;
- gesto tipográfico.

A assinatura deve ser identificável sem depender do logo.

### 11. Evitar estética genérica de IA
Não usar automaticamente:
- brilho neon;
- partículas;
- lens flare;
- glow;
- gradientes genéricos;
- excesso de 3D;
- composição central simétrica;
- fundo abstrato sem função;
- elementos flutuantes decorativos;
- ruído/grão apenas para "dar acabamento".

Esses recursos só entram quando forem consequência direta do conceito.

### 12. Regra de subtração
Depois de montar a peça:
- remova elementos decorativos;
- remova efeitos redundantes;
- remova formas que não possuem função;
- reduza cores secundárias;
- elimine competição com o herói.

Uma peça forte não é a que contém mais decisões. É a que contém menos decisões inúteis.

### 13. Teste de thumbnail
Renderize mentalmente ou visualize reduzido.

Em thumbnail deve sobreviver:
- silhueta;
- hierarquia;
- contraste;
- conceito;
- composição.

Se tudo vira uma massa indiferenciada, a peça falhou.

### 14. Teste de memória
Após olhar rapidamente para a peça, pergunte:
"Qual é a primeira coisa que alguém lembraria dela?"

Se a resposta for apenas "uma foto bonita" ou "um anúncio bonito", falta conceito.

### 15. Teste de portfólio
Antes de aprovar:
- A peça parece uma solução ou parece um template?
- Existe uma ideia visual?
- Existe uma decisão ousada?
- Existe uma assinatura?
- Existe domínio técnico?
- A composição continua interessante sem o logo?
- Existe algum detalhe que recompensa uma segunda olhada?

Se as respostas forem majoritariamente não, não aprove.
`;

/** Regras de detalhe que o agente segue e o revisor cobra: as mesmas para os dois. */
export const REGRAS_DE_DETALHE = `## Grade e espaço
- Margem externa de 72 px em prancheta de 1080 de largura (proporcional nas outras). Toda borda de elemento está na margem, numa coluna da grade ou sangra de propósito (passa da borda em pelo menos 40 px).
- Escala de espaço: 16 ou 24 px dentro de um bloco; 48 a 64 px entre blocos. Vazio é elemento de composição quando tem forma e função (dá peso ao herói, isola o título). Vazio que sobrou é defeito.
- No máximo dois eixos de alinhamento. Desalinhamento só como gesto declarado na direção, e aí com medida exata.

## Tipografia
- Título pelo menos 2,5 vezes o corpo do subtítulo. Sobretítulo nunca maior que o subtítulo.
- Texto que não cabe: aumente a caixa ou reestruture a mancha. Nunca encolha o corpo só para caber.
- Palavra mais larga que a caixa é partida no meio pelo motor ("Cappucci / no"). O verificador acusa texto-transbordando com a palavra: alargue a caixa ou diminua o tracking. Palavra partida nunca é entregue.
- Quebra de linha pelo sentido: sem palavra de ligação (de, a, o, e, com, para, na, no) no fim da linha, sem nome próprio partido, sem palavra sozinha na última linha.
- Título display pode ter entrelinha 0,85 a 0,95 e tracking de -10 a -40 se a direção pede bloco denso. Texto corrido pede entrelinha 1,35 ou mais.
- Número, preço ou percentual do briefing ganha destaque por "trechos" (peso, cor ou tamanho) dentro da mesma camada.

## Texto do cliente
- O texto do briefing é literal: não reescreva, não corte, não troque, não invente oferta nem número. Cada campo fica no seu papel (o rodapé não vira sobretítulo, o subtítulo não vira título).
- Você decide ritmo e escala: dividir a frase em camadas, mudar o corpo entre palavras, destacar por trecho. As palavras continuam todas lá, na ordem.

## Imagem
- A foto prova a promessa do briefing. Sem marca de terceiros visível (logo, nome de produto de outra empresa). Confira na prévia e no recorte em 1:1.
- Foto ampliada acima de 100% fica mole: prefira outra foto ou uma caixa menor.
- O tratamento da foto segue a direção. Se a direção diz foto natural, ela fica natural; se diz duotone, todas as fotos da peça recebem o mesmo duotone.

## Cor
- 60/30/10 pelos papéis da paleta da direção. O ponto de maior contraste da peça é a chamada ou o gancho, nunca um enfeite.
- Cor sempre por token quando existe token para ela.

## Story (1080 × 1920)
- Texto só dentro da zona segura que o verificador indica. As faixas de cima e de baixo não levam texto, mas não ficam com fundo liso: foto sangrada, cor ou forma que pertença à composição (não uma faixa lisa para cumprir regra).

## Entre formatos
- Recompor, não esticar. O Story pede peso vertical e leitura de cima para baixo; o quadrado pede equilíbrio; o horizontal, leitura da esquerda para a direita. A assinatura visual aparece em todos.`;

export const ARQUETIPOS = `## Arquétipos de composição

Escolha pelo conceito. O arquétipo é estrutura, não receita.

### A. Imersivo
A imagem domina o espaço e cria um ambiente.
Texto entra na atmosfera e não simplesmente em uma caixa.
Use para desejo, cultura, lifestyle, moda, música, cinema.

### B. Editorial
Margens, ritmo, contraste tipográfico e fotografia tratados como página de revista.
Use para luxo, cultura, arquitetura, moda, design e conteúdo conceitual.

### C. Tipográfico
A tipografia é o principal objeto visual.
A imagem é subordinada, integrada ou incorporada às letras.
Use quando a mensagem tiver força verbal.

### D. Monumental
Um único elemento ocupa escala extrema.
Pode ser uma palavra, rosto, objeto, número ou forma.
Partes podem ultrapassar a prancheta.
Use para impacto e reconhecimento imediato.

### E. Colagem controlada
Fotografia, tipografia, formas e texturas se sobrepõem criando uma composição deliberadamente construída.
Nada deve parecer decorativo sem função.

### F. Tensão
A composição nasce de um contraste deliberado:
grande/pequeno, ordem/ruptura, vazio/excesso, estático/movimento, nítido/desfocado.
Use quando a intenção for provocar atenção.

### G. Minimalismo expressivo
Pouquíssimos elementos, mas com escala, proporção, espaço e detalhe extremamente precisos.
Não confundir minimalismo com falta de ideia.

### H. Produto em destaque
Objeto como herói absoluto.
Recorte, luz, sombra, escala e profundidade constroem presença.
Use quando o produto for a mensagem.

### I. Sistema gráfico
Uma identidade visual forte nasce da repetição controlada de formas, cortes, cores ou relações tipográficas.
Útil quando a peça faz parte de uma série ou identidade.

### J. Híbrido
Combine no máximo dois arquétipos quando isso criar uma solução que nenhum deles produziria sozinho.

Nunca escolha um arquétipo apenas porque é fácil de executar.
`;

interface Tecnica {
  nome: string;
  serve: string;
  recursos: string;
  naoUse: string;
  /** só aparece quando o ambiente tem esta capacidade */
  exige?: keyof Capacidades;
}

const TECNICAS: readonly Tecnica[] = [
  {
    nome: 'Título atrás do sujeito',
    serve: 'profundidade, capa de revista, a pessoa ou o produto "sai" da peça',
    recursos: 'detectarSujeito + cópia da foto (duplicar) com máscara de sujeito acima do título',
    naoUse: 'se o sujeito cobre mais de um terço das letras ou se a foto não tem sujeito claro',
    exige: 'sujeito',
  },
  {
    nome: 'Produto isolado',
    serve: 'e-commerce, lançamento, objeto como herói',
    recursos: 'máscara de sujeito, sombra de contato (forma elipse escura desfocada sob o produto) e fundo de cor ou degradê radial',
    naoUse: 'com foto de ambiente, em que o lugar é a mensagem',
    exige: 'sujeito',
  },
  {
    nome: 'Foto dentro do título',
    serve: 'título curto e grosso que precisa ser a própria imagem',
    recursos: 'foto com "recortadaNaDeBaixo": true logo acima do texto',
    naoUse: 'com título longo, fonte fina ou foto sem textura',
  },
  {
    nome: 'Duotone ou mapa de degradê',
    serve: 'unificar fotos de origens diferentes na cor da marca, cartaz, cultura',
    recursos: '"ajusteDeCor.duotone" na foto ou camada de ajuste "mapa-de-degrade" recortada',
    naoUse: 'se a marca fotografa natural ou se a foto é de comida e pele (a cor é o desejo)',
  },
  {
    nome: 'Película em degradê',
    serve: 'texto legível sobre foto sem apagar a foto',
    recursos: 'forma com degradê de transparente para cor, ou máscara em degradê na própria foto',
    naoUse: 'película escura na foto inteira: ela tira a luz da peça',
  },
  {
    nome: 'Luz e atmosfera',
    serve: 'calor, noite, festa, luxo',
    recursos: 'forma elipse com degradê radial em "tela" ou "luz-suave"; curvas ou filtro de foto no topo da peça',
    naoUse: 'em marca sóbria ou institucional',
  },
  {
    nome: 'Textura analógica',
    serve: 'artesanal, retrô, cultura, papel impresso',
    recursos: 'listarTexturas (papel, retícula, grão, poeira, concreto) no topo, no modo recomendado; ou filtro "ruido" na foto',
    naoUse: 'em tecnologia, saúde ou marca de acabamento liso',
    exige: 'texturas',
  },
  {
    nome: 'Grão',
    serve: 'artesanal, retrô, foto com cara de impresso',
    recursos: 'filtro "ruido" na foto (quantidade 0,04 a 0,10)',
    naoUse: 'em tecnologia, saúde ou marca de acabamento liso',
  },
  {
    nome: 'Forma orgânica',
    serve: 'movimento, frescor, marca jovem',
    recursos: 'vetor desenhado (gota, blob, folha) atrás do herói, deslocado, com uma forma satélite menor',
    naoUse: 'em marca de grade rígida',
  },
  {
    nome: 'Tipografia como imagem',
    serve: 'afirmação, urgência, evento',
    recursos: 'título ocupando 70 a 120% da largura, sangrando, entrelinha apertada; palavra-chave por trecho',
    naoUse: 'com título longo ou marca que escreve pequeno',
  },
  {
    nome: 'Movimento',
    serve: 'esporte, velocidade',
    recursos: 'filtro "desfoque-de-movimento" numa cópia da foto (duplicar) atrás da original, rotação de 4 a 8° num bloco',
    naoUse: 'em peça editorial ou de luxo calmo',
  },
];

/**
 * Repertório de técnicas. O diretor escolhe por nome (direcao.ts), o agente executa pelos recursos
 * listados, o revisor confere se a técnica escolhida aparece e se serve ao conceito.
 * Só entram as técnicas que o ambiente consegue executar.
 */
export function tecnicasDeEstudio(capacidades: Capacidades): string {
  // com a biblioteca de texturas, "Grão" já está dentro de "Textura analógica"
  const disponiveis = TECNICAS.filter((t) => (t.exige ? capacidades[t.exige] : !(t.nome === 'Grão' && capacidades.texturas)));
  return `## Técnicas (escolha pelo que a peça precisa dizer, nunca para enfeitar)
Cada técnica: para que serve · recursos do editor · quando não usar.
${disponiveis.map((t) => `- **${t.nome}**: ${t.serve} · ${t.recursos} · não use ${t.naoUse}.`).join('\n')}

Uma peça boa usa poucas IDEIAS visuais, mas uma ideia pode exigir várias técnicas do editor.

Não conte recursos técnicos como se fossem conceitos.

Exemplo:
"produto emergindo da tipografia" pode usar:
- texto;
- foto;
- recorte;
- sombra;
- máscara;
- ajuste de cor.

Isso continua sendo uma única ideia.

O limite é conceitual, não técnico.

Evite acumular ideias concorrentes.`;
}

/** Como pedir cada recurso ao editor. Quem usa um recurso só por nome, sem sintaxe, não usa. */
export function receitasDoEditor(capacidades: Capacidades): string {
  const linhas: string[] = [
    `# Receitas do editor (sintaxe exata)
Coordenadas em px da prancheta, a partir do canto superior esquerdo. Empilhamento: a camada criada por último fica por cima; crie de trás para frente (fundo, foto, película, forma, texto, acabamento).
Endereço de camada: o id, ou "Prancheta/Camada" pelo nome. Nome é único dentro da prancheta. Dê nome pelo papel (Fundo, Foto, Sobretítulo, Título, Subtítulo, Chamada, Botão, Rodapé, Logo): o verificador usa o nome para conferir hierarquia e botão.`,

    `**Prancheta**: {"op":"criarPrancheta","nome":"Feed","largura":1080,"altura":1350,"fundo":"token:fundo"}. Outro formato a partir de uma prancheta pronta: {"op":"duplicarPrancheta","prancheta":"Feed","nome":"Story","largura":1080,"altura":1920} copia tudo reescalado, só como ponto de partida: recomponha depois.`,

    `**Tokens de cor**: defina a paleta antes de usar: {"op":"definirToken","nome":"acento","valor":"#E9B44C"} e depois "cor":"token:acento". Trocar o token muda todas as camadas que o usam. Onde existe token para a cor, use o token (o verificador acusa valor-solto).`,

    `**Texto**: caixa de largura fixa, quebra linha sozinho e começa no TOPO da caixa. Altura ≈ tamanho × entrelinha × linhas + 10%. "\\n" força quebra. "espacamento" é tracking em milésimos de eme. "peso": 300, 400, 500, 600 ou 700 (o motor usa o peso mais próximo que a família tem). Fonte fora da biblioteca não é desenhada: o verificador acusa fonte-ausente.
Palavra mais larga que a caixa não estoura para fora: o motor a parte no meio. Alargue a caixa (ou feche o tracking) até o verificador parar de acusar texto-transbordando.
{"tipo":"texto","nome":"Título","x":72,"y":640,"largura":936,"altura":260,"conteudo":"Jazz na Praça","fonte":"Anton","tamanho":180,"entrelinha":0.9,"espacamento":-20,"cor":"token:texto","trechos":[{"inicio":8,"fim":13,"cor":"token:acento"}]}
Estilo de texto da identidade: {"op":"definirEstiloDeTexto","nome":"subtitulo","estilo":{"fonte":"IBM Plex Sans","peso":500,"tamanho":34,"entrelinha":1.35}} e {"op":"aplicarEstiloDeTexto","alvos":["Feed/Subtítulo","Story/Subtítulo"],"estilo":"subtitulo"}: redefinir o estilo muda todas as camadas ligadas.`,

    `**Foto**: ${capacidades.bancoDeImagens ? 'o objeto vem pronto de trazerImagem; complete nome e caixa' : 'use o objeto "no" que veio no material da tarefa (imagens do cliente); complete nome e caixa'}. Enquadramento por "foco" ({"x":0.5,"y":0.3}, de 0 a 1) e "zoom" (1 a 4). Recorte vetorial: "recorte":{"forma":"elipse"} ou {"forma":"retangulo","raio":24}.
Tratamento na própria foto: "ajusteDeCor":{"brilho":-10,"contraste":15,"saturacao":-20,"duotone":{"sombras":"token:dominante","luzes":"#F2E6D0"}}
Filtros: "filtros":[{"tipo":"ruido","quantidade":0.06},{"tipo":"desfoque","raio":12},{"tipo":"desfoque-de-movimento","angulo":0,"distancia":60},{"tipo":"nitidez","quantidade":0.6,"raio":1.5}]`,

    `**Máscara** (qualquer camada ou grupo):
- degradê: "mascara":{"tipo":"degrade","angulo":90,"inicio":0.35,"fim":0.75} → visível do lado de início do ângulo (90 = de baixo para cima) até "inicio", some por completo em "fim". Foto que se dissolve na cor do fundo.
- forma de borda suave: "mascara":{"tipo":"forma","forma":"elipse","x":140,"y":200,"largura":800,"altura":800,"suavizar":80} (x e y na prancheta; "inverter": true mostra o lado de fora). Vinheta, foco de luz, janela.${
      capacidades.sujeito ? '\n- sujeito: chame detectarSujeito na camada da foto; ele devolve a máscara pronta e a receita do título atrás do sujeito.' : ''
    }`,

    `**Máscara de recorte**: "recortadaNaDeBaixo": true → a camada só aparece onde a de baixo tem pixel. Foto logo acima de um texto = foto dentro do título. Camada de ajuste recortada = ajuste só na camada de baixo.`,

    `**Modos de mesclagem**: "modoDeMesclagem": "multiplicacao" (sombra, papel, cor sobre foto clara), "tela" (luz, brilho, cor sobre escuro), "sobrepor" ou "luz-suave" (textura, grão, tingir sem apagar), "cor" (tingir mantendo a luz), "luminosidade".`,

    `**Camada de ajuste** (muda tudo que está abaixo no mesmo grupo; recortada, só a camada de baixo):
{"tipo":"ajuste","nome":"Curvas · contraste","ajuste":{"tipo":"curvas","rgb":[[0,12],[64,52],[192,206],[255,245]]}}
{"tipo":"ajuste","nome":"Mapa · marca","ajuste":{"tipo":"mapa-de-degrade","paradas":[{"cor":"#1B1F3B","posicao":0},{"cor":"#E8B04A","posicao":1}]},"opacidade":0.85}
Outros: "niveis", "matiz-saturacao", "brilho-contraste", "vibracao", "equilibrio-de-cor" (sombras, meiosTons, realces como [ciano↔vermelho, magenta↔verde, amarelo↔azul]), "filtro-de-foto" ({"cor":"#E8A040","densidade":20}), "preto-e-branco".`,

    `**Grupo**: {"op":"criarNo","prancheta":"Feed","no":{"tipo":"grupo","nome":"Herói"}} e depois criarNo com "grupo":"Feed/Herói"; ou {"op":"agrupar","alvos":[...],"nome":"Herói"}. O grupo tem opacidade, modo e máscara próprios, e isola as camadas de ajuste de dentro dele.`,

    `**Copiar e levar para outro lugar**:
- {"op":"duplicar","alvo":"Feed/Foto","nome":"Foto (movimento)","dx":0,"dy":0} copia a camada (ou o grupo, com tudo dentro) e põe a cópia logo acima da original. Sem "nome", a cópia se chama "<nome> cópia".
- {"op":"transferir","alvo":"Feed/Selo","grupo":"Feed/Herói"} leva a camada para dentro de um grupo; sem "grupo", para a raiz da prancheta; com "prancheta":"Story", para outra prancheta. x e y não mudam: reposicione depois. Para só trocar a ordem entre irmãs, use reordenar ("frente", "tras" ou índice).`,

    `**Forma**: "forma":"retangulo" ou "elipse", "raio", "preenchimento": cor ou degradê {"tipo":"linear"|"radial","angulo":90,"paradas":[{"cor":"#000000","posicao":0,"opacidade":0.7},{"cor":"#000000","posicao":1,"opacidade":0}]}, "traco":{"cor":"token:acento","espessura":2}.`,

    `**Efeitos** (forma, texto, foto, vetor): "sombra":{"cor":"#000000","opacidade":0.3,"distancia":16,"angulo":90,"desfoque":40}; "efeitos":{"sombraInterna":{...mesmo formato},"brilhoExterno":{"cor":"#FFD27A","opacidade":0.5,"tamanho":40},"brilhoInterno":{...},"sobreposicaoDeCor":{"cor":"token:acento","opacidade":1,"modoDeMesclagem":"normal"},"sobreposicaoDeDegrade":{"degrade":{...},"opacidade":1}}. Em alterar, null remove sombra, traco, recorte ou mascara.`,
  ];
  if (capacidades.texturas) linhas.push(`**Textura**: listarTexturas devolve o "no" pronto, com modo e opacidade recomendados. Cubra a prancheta, no topo ou logo acima da foto.`);
  linhas.push(
    `**Vetor**: logo e ícones do material entram por referência: {"tipo":"vetor","arquivo":"<hash>","nome":"Logo","x":72,"y":72,"largura":220} (a altura sai da proporção); recolorir com {"op":"recolorir","alvo":"Feed/Logo","cores":{"*":"#FFFFFF"}}. O desenho de um logo importado não muda: só cor e tamanho. Forma livre (gota, blob, arco): {"tipo":"vetor","nome":"Gota","moldura":[100,100],"caminhos":[{"d":"M50 0 C80 30 100 55 100 70 C100 90 78 100 50 100 C22 100 0 90 0 70 C0 55 20 30 50 0 Z","preenchimento":"token:apoio"}],"x":300,"y":400,"largura":520,"altura":520} (só M, C e Z).`,
    `**Rotação**: "rotacao": graus, sentido horário, em qualquer camada visual.`,
    `**Precisão**: {"op":"alinhar","alvos":[...],"borda":"esquerda","valor":72} e {"op":"distribuir","alvos":[...],"espaco":24} medem pela tinta (onde as letras aparecem), não pela caixa. Use em vez de conta de cabeça. Texto dentro de botão: {"op":"alinhar","alvos":["Feed/Botão","Feed/Chamada"],"borda":"centro-vertical"} (o primeiro alvo é a referência).`,
  );
  return linhas.join('\n\n');
}
