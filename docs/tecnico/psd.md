# Mapeamento Otto → PSD, SVG e PDF, e PSD → Otto

Dono: especialista-grafico. Decisões em [ADR 028](../decisoes/028-compatibilidade-com-photoshop-psd.md) (Photoshop) e [ADR 034](../decisoes/034-exportacao-vetorial-para-illustrator.md) (Illustrator).

Esta tabela é o espelho legível do mapeamento em `packages/psd/src/mapeamento.ts`. **Nenhum recurso entra no documento do Otto sem linha aqui** (ADR 027, item 6). Cada linha tem dois destinos:

- **Destino** (coluna PSD): **Nativo** (vira o recurso equivalente do Photoshop), **Raster** (vira camada de pixels, e o relatório avisa) ou **Bloqueado** (não existe no Otto até ter mapeamento).
- **Importação** (PSD para o Otto): **Editável** (o recurso volta como ele mesmo), **Imagem** (a exportação o gravou como pixel, e é pixel que volta) ou **—** (não existe no arquivo). O que o PSD pode trazer e o Otto não tem está em [Importação de PSD](#importação-de-psd), com tabela própria.
- **Vetorial** (SVG e PDF, para o Illustrator): **Nativo** (vetor editável) ou **Raster** (a camada vira imagem embutida, com aviso). Nada fica de fora do arquivo: o destino "Omitido" existe no código e, desde 2026-10-02, nenhuma linha o usa. O Illustrator não restringe o documento: quem decide o que o Otto pode ter é a coluna do PSD.

**Como as duas ficam em sincronia.** Toda linha que começa por uma chave entre crases é conferida pelo teste `packages/psd/src/mapeamento.test.ts`: a linha daqui tem de ser igual à do código, e não pode haver chave aqui que o código não tenha. Do outro lado, cada parte da tabela em código é um `Record` sobre o tipo do esquema de `@otto/documento`: um modo de mesclagem, ajuste, filtro, efeito, máscara ou tipo de nó novo quebra o `typecheck` de `packages/psd` até ganhar linha, nas duas colunas. Para mudar o mapeamento, mude o código e copie a linha que o teste mostrar.

**Estado (2026-10-02).** As três saídas estão implementadas em `packages/psd` e são conferidas por golden, cada uma relida por um programa independente do que grava: o PSD por uma segunda biblioteca de PSD; o SVG por um analisador de XML e por um renderizador de SVG; o PDF por um leitor de PDF que também o desenha.

A **importação de PSD** entrou em 2026-10-02 e tem a seção dela no fim: [Importação de PSD](#importação-de-psd).

**Primeira conferência manual: 2026-10-02**, pelo Felipe, com cinco peças no Photoshop 2025 (26.7) e no Illustrator 2022 (26.1). As respostas estão em [`conferencias/2026-10-02/`](conferencias/2026-10-02/). O que falhou foi corrigido no mesmo dia e está na seção [O que a conferência de 2026-10-02 mudou](#o-que-a-conferência-de-2026-10-02-mudou), com o que ficou provado por teste e o que só uma segunda conferência confirma. "Nativo" continua querendo dizer: o arquivo carrega o recurso editável e um programa independente concorda que ele está lá. Se o Photoshop e o Illustrator o abrem editável, com a mesma aparência, é a conferência manual que diz, a cada release que mexe em `packages/psd`.

Referência do PSD: *Adobe Photoshop File Formats Specification* (chaves de 4 caracteres entre crases na coluna PSD).

## O que todo PSD leva

- **A imagem composta**, do render de referência em CPU. Qualquer leitor mostra o resultado certo, mesmo sem as fontes.
- **O pixel de cada camada**, inclusive texto e forma, sem opacidade, modo, máscara nem efeitos (esses ficam na camada). A área gravada é a que a camada ocupa dentro da prancheta.
- **Os dados editáveis** de cada camada nativa.
- **O perfil de cor sRGB** embutido (ICC versão 2, gerado pelo Otto e conferido contra o sRGB do LittleCMS).
- **O relatório**: como cada camada saiu e por quê, fontes a instalar, pesos de fonte trocados, fonte e imagem não encontradas, tokens resolvidos, origem e licença das imagens.

- **Todo parâmetro de efeito escrito por extenso**: contorno linear, retração e expansão 0, ruído 0, sem luz global. Efeito gravado pela metade (sombra sem contorno) faz o Photoshop recusar a camada ao abrir.

A ordem em que a camada é montada é a do Photoshop, e o motor desenha na mesma ordem: conteúdo, filtros, máscara, efeitos (a sombra e o brilho contornam o que a máscara deixou), opacidade e modo.

## O que todo SVG e PDF leva

- **Um arquivo por prancheta**, no SVG e no PDF. O PDF com uma página por prancheta só sai a pedido (`arquivos: 'juntas'`): o Illustrator abre só a primeira página, a menos que a pessoa escolha o intervalo na janela de abertura.
- **Cada camada com o nome dela, no SVG**: no `id` do elemento (na convenção do Illustrator: espaço vira `_`, e o que não cabe num nome XML vira `_xHH_`). **No PDF os nomes não chegam ao Illustrator**: o arquivo leva uma camada do PDF (conteúdo opcional) para cada camada do Otto, que o Acrobat e outros leitores mostram, mas o Illustrator abre tudo numa "Camada 1" sem nomes. Quem quer os nomes abre o SVG.
- **Texto como texto**, linha por linha, na quebra que o motor do Otto fez. No SVG a fonte vai por família e peso, com o nome PostScript de reserva, e a opacidade do texto vai num grupo em volta dele (o Illustrator ignora a opacidade posta no próprio texto). No PDF a fonte vai embutida inteira, sem recorte de glifos, e o texto é escrito com um glifo por caractere, pelo mapa de caracteres da fonte, com o kerning dela: sem ligadura nem desenho alternativo de letra, que o Illustrator converte em contorno.
- **Foto como imagem embutida** (o arquivo original), com o corte da caixa como recorte vetorial.
- **O que não tem equivalente vetorial vira imagem embutida**, com o dobro da resolução do documento (uma foto sozinha, no máximo na resolução do arquivo dela): camada com sombra, brilho, sobreposição, filtro, máscara suave, ajuste de cor da foto. Imagem sem transparência vai em JPEG, quando o motor codifica JPEG (variante completa do CanvasKit); senão, em PNG. O relatório diz qual camada e por quê.
- **Camada de ajuste achata** (decisão do Felipe, 2026-10-02): a mais alta delas e tudo o que está abaixo viram **uma** imagem com o fundo da prancheta ("Fundo (achatado)"); o que está acima continua vetor. Presa a uma camada por máscara de recorte, só ela e a base viram imagem. Dentro de um grupo isolado, só o grupo vira imagem.
- **Modo de mesclagem que o arquivo não guarda vira a imagem equivalente em modo normal.** O motor desenha a prancheta até a camada, sem ela e com ela, e calcula a imagem (cor e transparência) que, posta em modo normal por cima, dá a mesma cor. A camada sai como essa imagem, com o nome dela, e **o que está abaixo continua vetor e editável**. A imagem é um retrato do momento da exportação: se o que está abaixo mudar no Illustrator, ela não acompanha. No SVG isso vale para **todo** modo diferente de normal: o Illustrator não aplica o `mix-blend-mode`, e a camada abria como um véu por cima da peça. No PDF, 15 modos vão como modo de mesclagem do PDF, e só os outros 10 viram imagem.
- **SVG 1.1 completo, declarado** (versão, perfil e tipo de documento): sem isso o Illustrator trata o arquivo como SVG Tiny e avisa que o recorte se perde.
- **PDF sem grupo à toa**: camada de uma pintura só (uma imagem, um texto, um caminho) leva a opacidade e o modo direto nela. Objeto de formulário, que o Illustrator abre como grupo de recorte do tamanho da página, só para grupo com opacidade ou modo.
- **O mesmo relatório do PSD**, com os avisos da saída vetorial: `camadas-achatadas`, `modo-em-imagem` e `imagem-sobre-texto` (imagem do tamanho da prancheta por cima de texto: no Illustrator é preciso travá-la para o clique da ferramenta Texto entrar no texto).

## Estrutura

| Chave | Otto | PSD | Destino | Vetorial | No SVG e no PDF | Importação | Ao importar | Observação |
|---|---|---|---|---|---|---|---|---|
| `documento` | Documento | Cabeçalho do arquivo | Nativo | Nativo | Cores em sRGB | Editável | Só RGB de 8 bits. Outro perfil RGB de matriz e curva (Adobe RGB, ProPhoto) é convertido para sRGB | RGB, 8 bits, com o perfil sRGB embutido. PSB quando um lado passa de 30.000 px |
| `prancheta` | Prancheta | Um arquivo por prancheta; no arquivo com todas, grupo com dados de prancheta (`artb`) | Nativo | Nativo | Um SVG por prancheta; um PDF por prancheta (a pedido, um PDF só com uma página por prancheta) | Editável | Prancheta do Photoshop vira prancheta. Arquivo sem pranchetas vira uma prancheta do tamanho dele |  |
| `fundo-da-prancheta` | Fundo da prancheta | Camada de preenchimento sólido (`SoCo`) | Nativo | Nativo | Retângulo do tamanho da prancheta | Editável | A camada de cor sólida embaixo de tudo, ou a cor da prancheta do Photoshop |  |
| `no:grupo` | Grupo | Grupo de camadas (`lsct`) | Nativo | Nativo | Grupo com o nome da camada no SVG. No PDF vai como camada do PDF, que o Illustrator não mostra: lá os objetos chegam sem nome | Editável | Com modo, opacidade e as camadas dentro. Efeito de camada em grupo não vem | O modo "atravessar" é o padrão de grupo, como no Photoshop |
| `no:forma` | Forma: retângulo (com raio) e elipse | Camada de preenchimento (`SoCo` ou `GdFl`) com máscara vetorial (`vmsk`) | Nativo | Nativo | Caminho | Editável | Retângulo (com o mesmo raio nos quatro cantos) e elipse, girados ou não. Caminho livre de cor sólida vira vetor | O raio vai como curva no caminho. Sem rotação, leva também os dados de forma viva (`vogk`): o painel Propriedades mostra o raio |
| `no:texto` | Texto em caixa | Camada de texto (`TySh`) | Nativo | Nativo | Texto como texto, linha por linha, na quebra do Otto (não requebra sozinho). No Illustrator chega um objeto de texto por linha e por mudança de estilo | Editável | Texto em caixa e texto de ponto, com a fonte entregue pelo nome PostScript. Sem a fonte, vira imagem | A fonte precisa estar instalada para editar; o pixel vai junto. A caixa gravada desce para a primeira linha cair onde o motor a pôs. O Photoshop pede para atualizar o texto ao abrir (limite da biblioteca) |
| `no:imagem` | Foto | Objeto inteligente (`SoLd`) com o arquivo original embutido (`lnk2`), e o corte da caixa como máscara vetorial | Nativo | Nativo | Imagem embutida (o arquivo original), com o corte da caixa como recorte vetorial | Editável | Objeto inteligente com foto PNG ou JPEG embutida: a foto original, com caixa, foco e aproximação | Só PNG e JPEG são embutidos. Objeto inteligente está listado como fora da v1 no ADR 028: pede ADR |
| `no:vetor` | Vetor (logo, ícone, forma livre) | Grupo com uma camada de forma por caminho (`SoCo` + `vmsk`) | Nativo | Nativo | Grupo com um caminho para cada caminho | Editável | O grupo de formas que a exportação grava volta a ser um vetor só, com a caixa justa no desenho | Só caminhos com M, C e Z |
| `no:ajuste` | Camada de ajuste | Camada de ajuste | Nativo | Raster | O ajuste e o que está abaixo dele viram uma imagem só, com a cor certa (presa a uma camada, só ela e o ajuste) | Editável | Com modo, opacidade, máscara de recorte e a máscara que o Otto tenha | Um tipo por linha, abaixo |

## Conteúdo das camadas

| Chave | Otto | PSD | Destino | Vetorial | No SVG e no PDF | Importação | Ao importar | Observação |
|---|---|---|---|---|---|---|---|---|
| `preenchimento-em-degrade` | Preenchimento em degradê (linear e radial) | Camada de preenchimento em degradê (`GdFl`) | Nativo | Nativo | Degradê linear e radial | Editável | Linear e radial, até 6 paradas, escala de 100%. Interpolação perceptual ou linear vem aproximada, com paradas a mais | Escala de 100%. A suavidade vai em 100%, o padrão do Photoshop (a biblioteca não grava outra): a transição pode diferir um pouco da do motor, que é linear |
| `traco-de-vetor` | Traço de caminho de vetor | Traçado vetorial (`vstk`) | Nativo | Nativo | Contorno do caminho | Editável | Traçado pelo centro, de cor sólida, sem tracejado | Centralizado no caminho |
| `trechos-de-texto` | Trechos de texto com estilo próprio | Estilos por sequência de caracteres, no `TySh` | Nativo | Nativo | Um pedaço de texto para cada estilo, dentro da linha | Editável | Até 40 trechos. O estilo que cobre mais texto é o da camada |  |
| `caixa-alta-e-versalete` | Caixa alta e versalete | Atributo de caixa do caractere, no `TySh` | Nativo | Nativo | Caixa alta: o texto vai já em maiúsculas. Versalete: as letras que eram minúsculas vão em maiúscula a 70% do corpo, na mesma linha (no Illustrator, um objeto de texto por mudança de corpo) | Editável | Quando vale para o texto inteiro | O versalete do motor é o sintético do Photoshop: as minúsculas viram maiúsculas a 70% do corpo |
| `ajuste-de-cor-da-foto` | Ajuste de cor da foto (brilho, contraste, saturação, duotone) | Camadas de ajuste presas à foto: Níveis (`levl`) para brilho e contraste, Misturador de canais (`mixr`) para saturação, Mapa de degradê (`grdm`) para duotone | Nativo | Raster | A foto vira imagem com o ajuste já aplicado | Editável | Níveis, Misturador de canais e Mapa de degradê presos à foto voltam a ser o ajuste de cor dela, quando são exatamente os que a exportação grava | Níveis e Misturador são lineares, como a conta do motor: dão o mesmo resultado, a 2 níveis |

## Propriedades de camada

| Chave | Otto | PSD | Destino | Vetorial | No SVG e no PDF | Importação | Ao importar | Observação |
|---|---|---|---|---|---|---|---|---|
| `opacidade` | Opacidade | Opacidade da camada | Nativo | Nativo | Opacidade | Editável | Opacidade; a do preenchimento entra nela quando não há efeito |  |
| `visivel-e-bloqueado` | Visível e bloqueado | Flags da camada e bloqueio (`lspf`) | Nativo | Nativo | Camada oculta vai oculta; o bloqueio não vai | Editável | Oculta e bloqueada (posição ou tudo) |  |
| `rotacao` | Rotação | Na geometria: caminho girado, transformação do texto e do objeto inteligente | Nativo | Nativo | Na geometria: caminho girado, transformação do texto e da imagem | Editável | Lida da geometria: do caminho, da transformação do texto e dos cantos da foto |  |
| `recorte-da-foto` | Recorte da foto em forma | Máscara vetorial (`vmsk`) | Nativo | Nativo | Recorte vetorial | Editável | Máscara vetorial em retângulo ou elipse sobre a foto embutida |  |
| `recortada-na-de-baixo` | Máscara de recorte na camada de baixo | Recorte (clipping) da camada | Nativo | Nativo | Recorte vetorial pela forma da camada de baixo, quando ela é forma, vetor ou foto | Editável | Máscara de recorte |  |
| `token` | Token de cor | Valor resolvido | Nativo | Nativo | Valor resolvido | — | O PSD não tem variável de cor: vem o valor | A referência se perde; o relatório lista cada token |
| `mascara:degrade` | Máscara em degradê | Máscara de camada (canal −2) | Nativo | Raster | A camada vira imagem embutida | Editável | Reconhecida pelos pixels da máscara e conferida com o desenho do motor. O que não bate não é adivinhado | Vai como pixels: no Photoshop não é mais um degradê editável |
| `mascara:forma` | Máscara de forma | Máscara de camada (canal −2) | Nativo | Nativo | Recorte vetorial, quando não tem borda suave nem está invertida | Editável | Idem; e a máscara vetorial em retângulo ou elipse, sem rotação | Vai como pixels, por causa da borda suave |
| `mascara:sujeito` | Máscara do sujeito da foto | Máscara de camada (canal −2) | Nativo | Raster | A camada vira imagem embutida | Editável | Máscara de pixels em foto embutida, reamostrada na resolução em que a foto aparece |  |

## Modos de mesclagem

Só entram no Otto os modos do Photoshop, com a fórmula do Photoshop (ADR 030). Os que o Skia não tem prontos são calculados pelo motor (shader na GPU, laço de pixel na CPU). O PDF tem 15 deles; com os outros 10, a camada vira a imagem equivalente em modo normal. No SVG, todos viram essa imagem (linha `modo-no-svg`).

| Chave | Otto | PSD | Destino | Vetorial | No SVG e no PDF | Importação | Ao importar | Observação |
|---|---|---|---|---|---|---|---|---|
| `modo:atravessar` | Modo atravessar (só em grupo) | `pass` | Nativo | Nativo | Grupo sem isolamento | Editável | O mesmo modo |  |
| `modo:normal` | Modo normal | `norm` | Nativo | Nativo | Normal | Editável | O mesmo modo |  |
| `modo:escurecer` | Modo escurecer | `dark` | Nativo | Nativo | Modo de mesclagem do PDF. No SVG vira imagem: ver `modo-no-svg` | Editável | O mesmo modo |  |
| `modo:multiplicacao` | Modo multiplicação | `mul ` | Nativo | Nativo | Modo de mesclagem do PDF. No SVG vira imagem: ver `modo-no-svg` | Editável | O mesmo modo |  |
| `modo:subexposicao-de-cores` | Modo subexposição de cores | `idiv` | Nativo | Nativo | Modo de mesclagem do PDF. No SVG vira imagem: ver `modo-no-svg` | Editável | O mesmo modo |  |
| `modo:subexposicao-linear` | Modo subexposição linear | `lbrn` | Nativo | Raster | Nem o SVG nem o PDF têm este modo: a camada vira uma imagem em modo normal que dá a mesma cor sobre o que está abaixo dela. O que está abaixo continua vetor | Editável | O mesmo modo |  |
| `modo:cor-mais-escura` | Modo cor mais escura | `dkCl` | Nativo | Raster | Nem o SVG nem o PDF têm este modo: a camada vira uma imagem em modo normal que dá a mesma cor sobre o que está abaixo dela. O que está abaixo continua vetor | Editável | O mesmo modo |  |
| `modo:clarear` | Modo clarear | `lite` | Nativo | Nativo | Modo de mesclagem do PDF. No SVG vira imagem: ver `modo-no-svg` | Editável | O mesmo modo |  |
| `modo:tela` | Modo tela | `scrn` | Nativo | Nativo | Modo de mesclagem do PDF. No SVG vira imagem: ver `modo-no-svg` | Editável | O mesmo modo |  |
| `modo:superexposicao-de-cores` | Modo superexposição de cores | `div ` | Nativo | Nativo | Modo de mesclagem do PDF. No SVG vira imagem: ver `modo-no-svg` | Editável | O mesmo modo |  |
| `modo:superexposicao-linear` | Modo superexposição linear | `lddg` | Nativo | Raster | Nem o SVG nem o PDF têm este modo: a camada vira uma imagem em modo normal que dá a mesma cor sobre o que está abaixo dela. O que está abaixo continua vetor | Editável | O mesmo modo |  |
| `modo:cor-mais-clara` | Modo cor mais clara | `lgCl` | Nativo | Raster | Nem o SVG nem o PDF têm este modo: a camada vira uma imagem em modo normal que dá a mesma cor sobre o que está abaixo dela. O que está abaixo continua vetor | Editável | O mesmo modo |  |
| `modo:sobrepor` | Modo sobrepor | `over` | Nativo | Nativo | Modo de mesclagem do PDF. No SVG vira imagem: ver `modo-no-svg` | Editável | O mesmo modo |  |
| `modo:luz-suave` | Modo luz suave | `sLit` | Nativo | Nativo | Modo de mesclagem do PDF. No SVG vira imagem: ver `modo-no-svg` | Editável | O mesmo modo | O motor usa a fórmula do W3C; a do Photoshop difere um pouco nos tons escuros |
| `modo:luz-direta` | Modo luz direta | `hLit` | Nativo | Nativo | Modo de mesclagem do PDF. No SVG vira imagem: ver `modo-no-svg` | Editável | O mesmo modo |  |
| `modo:luz-intensa` | Modo luz intensa | `vLit` | Nativo | Raster | Nem o SVG nem o PDF têm este modo: a camada vira uma imagem em modo normal que dá a mesma cor sobre o que está abaixo dela. O que está abaixo continua vetor | Editável | O mesmo modo |  |
| `modo:luz-linear` | Modo luz linear | `lLit` | Nativo | Raster | Nem o SVG nem o PDF têm este modo: a camada vira uma imagem em modo normal que dá a mesma cor sobre o que está abaixo dela. O que está abaixo continua vetor | Editável | O mesmo modo |  |
| `modo:luz-do-ponto` | Modo luz do ponto | `pLit` | Nativo | Raster | Nem o SVG nem o PDF têm este modo: a camada vira uma imagem em modo normal que dá a mesma cor sobre o que está abaixo dela. O que está abaixo continua vetor | Editável | O mesmo modo |  |
| `modo:mistura-solida` | Modo mistura sólida | `hMix` | Nativo | Raster | Nem o SVG nem o PDF têm este modo: a camada vira uma imagem em modo normal que dá a mesma cor sobre o que está abaixo dela. O que está abaixo continua vetor | Editável | O mesmo modo |  |
| `modo:diferenca` | Modo diferença | `diff` | Nativo | Nativo | Modo de mesclagem do PDF. No SVG vira imagem: ver `modo-no-svg` | Editável | O mesmo modo |  |
| `modo:exclusao` | Modo exclusão | `smud` | Nativo | Nativo | Modo de mesclagem do PDF. No SVG vira imagem: ver `modo-no-svg` | Editável | O mesmo modo |  |
| `modo:subtrair` | Modo subtrair | `fsub` | Nativo | Raster | Nem o SVG nem o PDF têm este modo: a camada vira uma imagem em modo normal que dá a mesma cor sobre o que está abaixo dela. O que está abaixo continua vetor | Editável | O mesmo modo |  |
| `modo:dividir` | Modo dividir | `fdiv` | Nativo | Raster | Nem o SVG nem o PDF têm este modo: a camada vira uma imagem em modo normal que dá a mesma cor sobre o que está abaixo dela. O que está abaixo continua vetor | Editável | O mesmo modo |  |
| `modo:matiz` | Modo matiz | `hue ` | Nativo | Nativo | Modo de mesclagem do PDF. No SVG vira imagem: ver `modo-no-svg` | Editável | O mesmo modo |  |
| `modo:saturacao` | Modo saturação | `sat ` | Nativo | Nativo | Modo de mesclagem do PDF. No SVG vira imagem: ver `modo-no-svg` | Editável | O mesmo modo |  |
| `modo:cor` | Modo cor | `colr` | Nativo | Nativo | Modo de mesclagem do PDF. No SVG vira imagem: ver `modo-no-svg` | Editável | O mesmo modo |  |
| `modo:luminosidade` | Modo luminosidade | `lum ` | Nativo | Nativo | Modo de mesclagem do PDF. No SVG vira imagem: ver `modo-no-svg` | Editável | O mesmo modo |  |

## Efeitos de camada

Cada efeito, no máximo uma vez por camada. O tamanho de sombra e de brilho é o "tamanho" do Photoshop; o motor desenha com desfoque gaussiano de desvio padrão igual à metade dele. Na conferência de 2026-10-02 a sombra projetada bateu; a sombra interna e o brilho externo ficaram um pouco diferentes (diferença média de 8,5 níveis numa camada de teste). Desde então todos os parâmetros vão escritos por extenso; **se a diferença continua, é a segunda conferência que diz.**

| Chave | Otto | PSD | Destino | Vetorial | No SVG e no PDF | Importação | Ao importar | Observação |
|---|---|---|---|---|---|---|---|---|
| `efeito:sombra` | Sombra projetada | Efeito de camada (`lfx2`): sombra projetada | Nativo | Raster | A camada vira imagem embutida | Editável | Cor, opacidade, ângulo, distância e tamanho. Expansão, contorno e ruído não vêm; modo que não é o do motor vira nota | Gravada com modo normal, como o motor desenha (o padrão do Photoshop é multiplicação) |
| `efeito:traco` | Traço da forma | Efeito de camada (`lfx2`): traço interno de cor sólida | Nativo | Nativo | Contorno com o dobro da espessura, cortado pela própria forma | Editável | Só em forma, por dentro, de cor sólida |  |
| `efeito:sombraInterna` | Sombra interna | Efeito de camada (`lfx2`): sombra interna | Nativo | Raster | A camada vira imagem embutida | Editável | Como a sombra projetada | Modo multiplicação, contorno linear, sem retração nem ruído |
| `efeito:brilhoExterno` | Brilho externo | Efeito de camada (`lfx2`): brilho externo | Nativo | Raster | A camada vira imagem embutida | Editável | Cor, opacidade e tamanho. Brilho em degradê não vem | Gravado com modo normal, como o motor desenha (o padrão do Photoshop é tela); técnica mais suave, contorno linear, sem expansão |
| `efeito:brilhoInterno` | Brilho interno | Efeito de camada (`lfx2`): brilho interno, a partir da borda | Nativo | Raster | A camada vira imagem embutida | Editável | Como o brilho externo | Modo tela |
| `efeito:sobreposicaoDeCor` | Sobreposição de cor | Efeito de camada (`lfx2`): sobreposição de cor | Nativo | Raster | A camada vira imagem embutida | Editável | Cor, opacidade e modo |  |
| `efeito:sobreposicaoDeDegrade` | Sobreposição de degradê | Efeito de camada (`lfx2`): sobreposição de degradê | Nativo | Raster | A camada vira imagem embutida | Editável | Com o degradê que o Otto tenha, opacidade e modo | Escala de 100%, alinhada à camada |

## Camadas de ajuste

Com máscara, opacidade, máscara de recorte e modo de mesclagem.

| Chave | Otto | PSD | Destino | Vetorial | No SVG e no PDF | Importação | Ao importar | Observação |
|---|---|---|---|---|---|---|---|---|
| `ajuste:curvas` | Ajuste de curvas | `curv` | Nativo | Raster | O ajuste e o que está abaixo dele viram uma imagem só, com a cor certa (presa a uma camada, só ela e o ajuste) | Editável | Os três canais juntos e cada canal, até 16 pontos |  |
| `ajuste:niveis` | Ajuste de níveis | `levl` | Nativo | Raster | O ajuste e o que está abaixo dele viram uma imagem só, com a cor certa (presa a uma camada, só ela e o ajuste) | Editável | Só os três canais juntos |  |
| `ajuste:matiz-saturacao` | Ajuste de matiz e saturação | `hue2` | Nativo | Raster | O ajuste e o que está abaixo dele viram uma imagem só, com a cor certa (presa a uma camada, só ela e o ajuste) | Editável | Só o ajuste geral, sem colorir | Só o canal principal |
| `ajuste:brilho-contraste` | Ajuste de brilho e contraste | `brit` | Nativo | Raster | O ajuste e o que está abaixo dele viram uma imagem só, com a cor certa (presa a uma camada, só ela e o ajuste) | Editável | O comum (não o legado) |  |
| `ajuste:vibracao` | Ajuste de vibração | `vibA` | Nativo | Raster | O ajuste e o que está abaixo dele viram uma imagem só, com a cor certa (presa a uma camada, só ela e o ajuste) | Editável | Vibração e saturação |  |
| `ajuste:equilibrio-de-cor` | Ajuste de equilíbrio de cores | `blnc` | Nativo | Raster | O ajuste e o que está abaixo dele viram uma imagem só, com a cor certa (presa a uma camada, só ela e o ajuste) | Editável | Sombras, meios-tons e realces, preservando a luminosidade |  |
| `ajuste:filtro-de-foto` | Ajuste de filtro de fotografia | `phfl` | Nativo | Raster | O ajuste e o que está abaixo dele viram uma imagem só, com a cor certa (presa a uma camada, só ela e o ajuste) | Editável | Cor em RGB e densidade |  |
| `ajuste:preto-e-branco` | Ajuste de preto e branco | `blwh` | Nativo | Raster | O ajuste e o que está abaixo dele viram uma imagem só, com a cor certa (presa a uma camada, só ela e o ajuste) | Editável | Com os pesos padrão; pesos próprios e tonalidade não vêm | Com os pesos padrão do Photoshop |
| `ajuste:mapa-de-degrade` | Ajuste de mapa de degradê | `grdm` | Nativo | Raster | O ajuste e o que está abaixo dele viram uma imagem só, com a cor certa (presa a uma camada, só ela e o ajuste) | Editável | Até 6 paradas, opaco |  |

## Filtros

Filtro só é editável no Photoshop dentro de objeto inteligente. Por isso, em foto ele vira filtro inteligente, e em forma, texto e vetor a camada vira pixel.

| Chave | Otto | PSD | Destino | Vetorial | No SVG e no PDF | Importação | Ao importar | Observação |
|---|---|---|---|---|---|---|---|---|
| `filtro:desfoque` | Filtro de desfoque, em foto | Filtro inteligente: desfoque gaussiano | Nativo | Raster | A foto vira imagem com o filtro já aplicado | Editável | Filtro inteligente em foto embutida, com opacidade de 100% e modo normal | Filtro inteligente está listado como fora da v1 no ADR 028: pede ADR |
| `filtro:desfoque-de-movimento` | Filtro de desfoque de movimento, em foto | Filtro inteligente: desfoque de movimento | Nativo | Raster | A foto vira imagem com o filtro já aplicado | Editável | Filtro inteligente em foto embutida, com opacidade de 100% e modo normal | Pede ADR, como o desfoque |
| `filtro:ruido` | Filtro de ruído, em foto | Filtro inteligente: adicionar ruído | Nativo | Raster | A foto vira imagem com o filtro já aplicado | Editável | Idem, com distribuição uniforme. O desenho do grão muda (a semente sai do id da camada) | O grão do Photoshop não é o do Otto: ao reaplicar, o desenho do grão muda. Pede ADR |
| `filtro:nitidez` | Filtro de nitidez, em foto | Filtro inteligente: máscara de nitidez | Nativo | Raster | A foto vira imagem com o filtro já aplicado | Editável | Idem, com limiar zero | Pede ADR, como o desfoque. No Photoshop, reaplicar o filtro mudou um pouco a aparência (conferência de 2026-10-02): causa em aberto |

## O que vira pixel no PSD, com aviso no relatório

| Chave | Otto | PSD | Destino | Vetorial | No SVG e no PDF | Importação | Ao importar | Observação |
|---|---|---|---|---|---|---|---|---|
| `filtro-fora-de-foto` | Filtro em forma, texto ou vetor | Camada de pixels | Raster | Raster | A camada vira imagem embutida | Imagem | A exportação gravou como pixel: volta como imagem | No Photoshop, filtro editável só existe em objeto inteligente |
| `foto-recortada-com-ajuste-de-cor` | Foto presa por máscara de recorte e com ajuste de cor | Camada de pixels, com o ajuste já aplicado | Raster | Raster | A camada vira imagem embutida | Imagem | A exportação gravou como pixel: volta como imagem | O ajuste não tem como ficar preso só à foto |
| `foto-em-webp` | Foto em WebP | Camada de pixels | Raster | Raster | A foto vira imagem, na resolução do documento | Imagem | A exportação gravou como pixel: volta como imagem | O arquivo original não é embutido |
| `texto-sem-fonte` | Texto cuja fonte não foi entregue | Camada de pixels vazia | Raster | Raster | Imagem vazia | Imagem | A exportação gravou como pixel: volta como imagem | O motor não troca de fonte: a camada sai sem o texto, e o relatório diz qual fonte falta |
| `vetor-fora-do-padrao` | Vetor com caminho que não é só M, C e Z | Camada de pixels | Raster | Raster | A camada vira imagem embutida | Imagem | A exportação gravou como pixel: volta como imagem |  |

## O que só a saída vetorial trata diferente

Recursos que já têm linha acima, e que ganham linha própria porque na saída vetorial o destino muda.

| Chave | Otto | PSD | Destino | Vetorial | No SVG e no PDF | Importação | Ao importar | Observação |
|---|---|---|---|---|---|---|---|---|
| `mascara-suave-ou-invertida` | Máscara de forma com borda suave ou invertida | Máscara de camada (canal −2) | Nativo | Raster | A camada vira imagem embutida | Editável | É a máscara de forma | É a máscara de forma; tem linha própria porque na saída vetorial vira imagem |
| `recorte-em-texto` | Máscara de recorte cuja base é texto, ou uma camada que virou imagem | Recorte (clipping) da camada | Nativo | Raster | A base e as camadas presas a ela viram uma imagem só | Editável | É a máscara de recorte | Tem linha própria porque na saída vetorial vira imagem |
| `degrade-transparente-no-pdf` | Degradê com parada transparente, no PDF | Camada de preenchimento em degradê (`GdFl`) | Nativo | Raster | Só no PDF: no SVG vai como degradê | — | É só da saída vetorial | É o preenchimento em degradê; tem linha própria porque no PDF vira imagem |
| `modo-no-svg` | Modo de mesclagem que o PDF tem, numa peça exportada em SVG | O modo da camada | Nativo | Raster | Só no SVG: o Illustrator não aplica o modo de mesclagem do SVG. A camada vira uma imagem em modo normal que dá a mesma cor sobre o que está abaixo dela. O que está abaixo continua vetor | — | É só da saída vetorial | São os modos de mesclagem; tem linha própria porque no SVG a camada vira imagem |

## Bloqueado

Não existe no documento do Otto.

| Chave | Otto | PSD | Destino | Vetorial | No SVG e no PDF | Importação | Ao importar | Observação |
|---|---|---|---|---|---|---|---|---|
| `modo-dissolver` | Modo dissolver | — | Bloqueado | — | — | — | — | O ruído do Photoshop não é reproduzível |
| `chanfro-acetinado-padrao` | Chanfro e entalhe, acetinado, sobreposição de padrão | — | Bloqueado | — | — | — | — | Custo de reproduzir no motor |
| `efeito-repetido` | Vários efeitos do mesmo tipo na mesma camada | — | Bloqueado | — | — | — | — | Fora da v1 |
| `ajustes-fora-da-lista` | Exposição, inverter, cor seletiva, misturador de canais, pesquisa de cor, limiar, posterizar | — | Bloqueado | — | — | — | — | Fora da v1. O misturador de canais só aparece no PSD como o jeito de gravar a saturação da foto |
| `texto-em-caminho` | Texto em caminho | — | Bloqueado | — | — | — | — | Até um spike provar que abre bem |
| `cor-fora-de-rgb-8-bits` | CMYK, 16 e 32 bits, perfis além de sRGB | — | Bloqueado | — | — | — | — | Fora da v1 (ADR 028, item 3) |

## Pede decisão

- **Objeto inteligente e filtro inteligente.** O ADR 028 os lista como fora da v1, e a exportação os usa para foto, como a POC já fazia: a foto original vai embutida e o filtro continua editável. Está mantido como estava e **pede ADR**: ou o ADR 028 passa a aceitá-los, ou a foto volta a ser camada de pixels (e o filtro vira pixel, com aviso). A mesma foto em várias camadas é embutida uma vez só; no Photoshop elas são instâncias do mesmo objeto inteligente.
- **Miniatura do PSD.** O arquivo não leva miniatura (a biblioteca só a gera com canvas). O Photoshop não precisa dela; o explorador de arquivos usa a composta.

## O que a conferência de 2026-10-02 mudou

Provado por teste quer dizer: há um teste que lê o valor gravado (com a segunda biblioteca, com o leitor independente ou nos bytes) e que falhava pelo motivo visto na conferência. A confirmar quer dizer: só abrindo no programa.

**No Photoshop**

| O que apareceu | Causa | O que mudou | Situação |
|---|---|---|---|
| Erro ao abrir camada com sombra projetada; traço interno perdido | A sombra ia com o contorno vazio (nome em branco, curva sem pontos), e o Photoshop recusava os efeitos da camada inteira | Contorno linear e os demais parâmetros escritos por extenso, em todos os efeitos | Provado por teste que o contorno vai preenchido; abrir sem erro, a confirmar |
| Texto sobe ao atualizar ou editar | O Photoshop assenta a primeira linha pela altura da maiúscula no topo da caixa; o motor a assenta pela ascendente da fonte | A caixa gravada desce (primeira linha de base − topo − altura da maiúscula) e encolhe o mesmo tanto | Provado por teste que a caixa vai deslocada pela medida que o Felipe encontrou; o texto parado, a confirmar |
| Pedido de "Atualizar" ao abrir | A biblioteca não grava a parte dos dados de texto que guarda o texto já diagramado | Nada: é limite da biblioteca, e trocar de biblioteca é outra decisão | Não tem correção com esta biblioteca |
| Escala do degradê em 10000% | A biblioteca espera fração (1 = 100%), e ia 100 | Vai 1, no preenchimento e na sobreposição de degradê | Provado por teste |
| Ajuste de cor da foto mais fraco ou diferente | Brilho/Contraste e Matiz/Saturação do Photoshop têm outra conta que a do motor, que é linear | Brilho e contraste vão como Níveis; saturação vai como Misturador de canais. As duas camadas são lineares, como o motor | Provado por teste que as duas contas dão o resultado do motor, a 2 níveis; a aparência, a confirmar |
| Versalete menor no Photoshop | O versalete sintético do Photoshop é 70% do corpo; o motor usava 75% | O motor passou a 70% | Provado por teste no motor; a comparação, a confirmar |
| Nitidez muda ao reaplicar o filtro inteligente | Não determinada. A hipótese é a reamostragem da foto, que o Photoshop faz por outro método antes de aplicar o filtro, e que a nitidez amplifica | Nada no motor. O comando das peças grava um PNG da peça sem o filtro, para separar as duas causas | Em aberto |
| Sombra interna e brilho externo um pouco diferentes | Parâmetros que ficavam no padrão da biblioteca (contorno, retração, técnica, intervalo) | Todos escritos por extenso | A confirmar |
| Formas não são "formas vivas" | Faltavam os dados de origem da forma (`vogk`) | Retângulo, retângulo arredondado e elipse sem rotação levam os dados; a forma girada continua como caminho | Provado por teste que os dados vão; o painel Propriedades mostrar o raio, a confirmar |
| Suavidade do degradê | A biblioteca só grava 100% | Nada | Limite da biblioteca |

**No Illustrator**

| O que apareceu | Causa | O que mudou | Situação |
|---|---|---|---|
| SVG abre com um véu: o modo de mesclagem se perde | O Illustrator 2022 não aplica `mix-blend-mode` | No SVG, camada com modo de mesclagem vira a imagem equivalente em modo normal; o que está abaixo continua vetor. O arquivo não leva mais modo nenhum | Provado por teste: desenhado só em modo normal, o arquivo é o render do Otto. A aparência no Illustrator, a confirmar |
| Opacidade do texto perdida no SVG | O Illustrator ignora `opacity` no elemento de texto | A opacidade vai num grupo em volta do texto, que leva o nome da camada | Provado por teste que vai no grupo; o Illustrator respeitar, a confirmar |
| Aviso "o recorte será perdido no percurso de ida e volta para Tiny" | O arquivo não declarava versão nem perfil, e era tratado como SVG Tiny | SVG 1.1 completo, com tipo de documento | A confirmar |
| PDF: uma camada só, sem nomes, com grupos de recorte aninhados | O Illustrator não lê as camadas do PDF (conteúdo opcional). Cada camada com opacidade virava um objeto de formulário, que ele abre como grupo de recorte | Formulário só para grupo com opacidade ou modo. Os nomes não têm como chegar pelo PDF | Menos grupos: provado por teste. Nomes: só pelo SVG |
| PDF: texto em Fraunces convertido em contorno, aos pedaços | A fonte troca o "n" e o "m" por desenhos alternativos, e esses glifos iam para o arquivo sem caractere correspondente nem largura | O texto vai com um glifo por caractere, pelo mapa de caracteres, com o kerning da fonte escrito entre eles | Provado por teste com a Fraunces; abrir como texto, a confirmar |
| Texto em pedaços (um objeto por linha, por estilo e por mudança de corpo do versalete) | Nenhum dos dois formatos guarda parágrafo, e o versalete vai como mudança de corpo | No PDF o texto com kerning continua inteiro (antes podia chegar letra por letra). O versalete continua como mudança de corpo: o `font-variant` do SVG é desenhado de um jeito por programa, e o renderizador independente dos testes o ignora | Um objeto por linha e por mudança de estilo é o limite. O versalete do SVG fica para decidir depois do teste à parte da segunda conferência |
| PDF de várias páginas abre só a primeira | É o comportamento do Illustrator | O padrão passou a ser um PDF por prancheta | Provado por teste |
| SVG de 12 MB, 36 s para abrir | Imagens embutidas em PNG com o dobro da resolução | JPEG quando não há transparência; foto sozinha no máximo na resolução do arquivo dela | Medido no comando das peças |
| Ferramenta Texto cria texto novo em vez de entrar no texto | Imagem do tamanho da prancheta por cima do texto recebe o clique | Aviso `imagem-sobre-texto` no relatório | Só aviso |

## Fora da v1

Estilos de camada salvos, canais alfa extras, caminhos salvos fora de máscara, animação e linha do tempo, CMYK, 16 e 32 bits, perfis além de sRGB, sangria e marcas de corte.

## Importação de PSD

ADR 028, item 4: **importação limitada. O que não tem mapeamento vira imagem, com relatório.** Implementada em `packages/psd` (`importarPsd`, `fontesDoPsd`), em 2026-10-02.

O caminho: a **inspeção** (`inspecionar.ts`) lê só a estrutura do arquivo, direto dos bytes, e recusa o que passa dos tetos ou não é RGB de 8 bits, antes de qualquer decodificação; a **leitura** é da biblioteca, atrás da porta `FormatoDeArquivoEmCamadas.ler`, com o pixel de cada camada decodificado uma camada de cada vez; o **mapeamento de volta** (`desmontar.ts`) decide o que cada camada vira; e a árvore nasce pelo **catálogo de operações** (`criarPrancheta`, `criarNo`), validada pelo mesmo esquema de qualquer mudança. O mesmo arquivo dá sempre a mesma árvore, id por id.

### As regras

- **O que o Otto representa vem editável** (coluna "Importação" das tabelas acima). A geometria é reconhecida, não adivinhada: o retângulo, a elipse, a foto e a máscara que o Otto propõe só são aceitos quando, refeitos pelo código da exportação ou desenhados pelo motor, batem com o que o arquivo traz. O que não bate fica como caminho livre (vetor) ou como pixel.
- **O que o Otto não representa vem como imagem**, com o pixel que o arquivo traz para aquela camada, em PNG, com as máscaras aplicadas. A camada continua com nome, posição, opacidade, modo, máscara de recorte e os efeitos que o Otto tem.
- **O que não tem pixel e o Otto não tem não vem**: camada de ajuste desconhecida, efeito desconhecido (o pixel gravado de uma camada não traz os efeitos dela, e virar imagem não os traria), máscara de pixels em grupo. O relatório diz, camada a camada.
- **Nada é trocado em silêncio.** Texto com fonte que o Otto não tem vem como imagem, e a fonte vai para o relatório pelo nome PostScript. Quem importa pode pedir a troca por outra fonte: aí o texto vem editável, e a troca fica no relatório.
- **O nome da camada vem como está no arquivo.** Só muda quando está vazio ou repetido na mesma prancheta (no Otto o nome é único nela): ganha um número, e o relatório guarda o original. Nome e texto de camada de um PSD alheio são dado de terceiro: nada aqui os interpreta.
- **Cor.** Só RGB de 8 bits. CMYK, tons de cinza, Lab, indexado e 16 ou 32 bits são **recusados**, com a frase que diz como converter no Photoshop: converter aqui mudaria a cor sem o designer ver. Perfil RGB que não é sRGB (Adobe RGB é o espaço de trabalho de muito Photoshop) é **convertido** para sRGB quando é de matriz e curva: pixels, cores de camada, de texto, de efeito e de degradê. Conferido contra o LittleCMS, a um nível.
- **Texto.** Em caixa: o Photoshop encosta a altura da maiúscula da primeira linha no topo da caixa, e o motor encosta a ascendente; a caixa do Otto sobe a diferença, para a linha de base cair no mesmo lugar (medido na conferência de 2026-10-02 e em arquivos gravados pelo Photoshop). De ponto: a caixa é a que cabe a linha mais larga, com a linha de base da primeira linha no ponto do arquivo. **A quebra de linha é a do motor do Otto, não a do Photoshop**: pode mudar.

### O que só existe do lado do PSD

| Chave | No PSD | Destino | No Otto | Observação |
|---|---|---|---|---|
| `psd:camada-de-pixels` | Camada de pixels (inclusive a camada "Fundo" do Photoshop) | Imagem | Imagem, com o pixel da camada em PNG | É o que a camada é: não se perde edição nenhuma |
| `psd:camada-vazia` | Camada sem pixel | Ignorado | — |  |
| `psd:arquivo-achatado` | Arquivo sem camadas, só com a imagem composta (salvo achatado) | Imagem | Uma imagem do tamanho do documento |  |
| `psd:fundo-de-cor-solida` | A camada mais de baixo, de uma cor só, cobrindo o documento ou a prancheta inteira | Editável | A cor de fundo da prancheta | É como a exportação grava o fundo da prancheta |
| `psd:fundo-transparente` | Documento ou prancheta com fundo transparente | Aproximado | Fundo branco | A prancheta do Otto sempre tem cor de fundo |
| `psd:fora-das-pranchetas` | Camada fora de qualquer prancheta, num arquivo com pranchetas | Ignorado | — |  |
| `psd:forma-livre` | Forma de caminho livre (caneta), de cor sólida | Editável | Vetor |  |
| `psd:grupo-de-formas` | Grupo só com formas de caminho livre e com efeito de camada, ou gravado pelo Otto a partir de um vetor | Editável | Um vetor só, com um caminho por forma | É como a exportação grava o vetor |
| `psd:mascara-de-pixels` | Máscara de camada que não é uma forma nem um degradê do Otto | Imagem | Em foto embutida: máscara de recorte da foto, editável. Em camada de pixels, texto e forma: aplicada no pixel, e a camada vira imagem. Em grupo e em camada de ajuste: não vem | O Otto só tem máscara de forma, de degradê e de recorte de foto |
| `psd:mascara-vetorial-livre` | Máscara vetorial de caminho livre, fora de camada de forma | Imagem | Em camada com pixel: aplicada no pixel, e a camada vira imagem. Em grupo e em camada de ajuste: não vem |  |
| `psd:duas-mascaras` | Máscara de pixels e máscara vetorial na mesma camada | Imagem | Em camada com pixel: as duas aplicadas no pixel. Em grupo e em camada de ajuste: vem a que o Otto reconhece |  |
| `psd:efeito-em-grupo` | Efeito de camada em grupo | Ignorado | — | O grupo do Otto não tem efeito |
| `psd:opacidade-do-preenchimento` | Opacidade do preenchimento | Aproximado | Sem efeito de camada, entra na opacidade. Com efeito, não vem |  |
| `psd:texto-sem-fonte` | Texto com fonte que o Otto não tem | Imagem | Imagem, com o pixel gravado, e a fonte listada no relatório | O Otto não troca de fonte em silêncio. Com a fonte enviada, importar de novo traz o texto editável |
| `psd:perfil-de-cor` | Perfil de cor RGB que não é sRGB (Adobe RGB, ProPhoto, Display P3) | Editável | As cores e os pixels convertidos para sRGB | Só perfil de matriz e curva. Os outros são lidos como sRGB, com aviso |
| `psd:cor-fora-de-rgb-8-bits` | CMYK, tons de cinza, Lab, indexado, bitmap; 16 e 32 bits por canal | Recusado | — | O Otto não converte: a conversão muda a cor, e é no Photoshop que o designer a controla (ADR 028, item 3) |
| `psd:acima-dos-tetos` | Arquivo acima dos tetos de tamanho, dimensões, camadas, profundidade de grupo ou pixel de camada; arquivo truncado ou malformado | Recusado | — | Os tetos estão em inspecionar.ts |
| `psd:fora-da-arvore` | Guias, fatias, composições de camada, animação e linha do tempo, anotações, canais alfa, caminhos salvos | Ignorado | — | Não são camadas: não entram no relatório |
| `psd:conteudo-desconhecido` | Camada de vídeo, 3D, ou de um tipo que a biblioteca não reconhece | Imagem | Imagem, com o pixel gravado |  |
| `psd:texto-em-caminho` | Texto em caminho | Imagem | Imagem, com o pixel gravado | O Otto não tem texto em caminho (bloqueado) |
| `psd:texto-deformado` | Texto deformado (arco, bandeira...), inclinado, ou com escala diferente nos dois eixos | Imagem | Imagem, com o pixel gravado |  |
| `psd:texto-vertical` | Texto na vertical | Imagem | Imagem, com o pixel gravado |  |
| `psd:estilo-de-texto` | Texto com negrito ou itálico falsos, sublinhado, riscado, escala horizontal ou vertical, deslocamento da linha de base, sobrescrito, contorno, ou caixa alta só num trecho | Imagem | Imagem, com o pixel gravado | Trocar a aparência do texto em silêncio seria pior do que perder a edição |
| `psd:paragrafo-de-texto` | Texto justificado, com recuo, com espaço antes ou depois do parágrafo, ou com alinhamento diferente por parágrafo | Aproximado | Texto editável, com o alinhamento do primeiro parágrafo, sem recuo nem espaço |  |
| `psd:preenchimento` | Forma com preenchimento de padrão, ou com degradê que o Otto não tem (ângulo, diamante, refletido, ruído, escala, mais de 6 paradas, ponto médio fora do centro) | Imagem | Imagem, com o pixel gravado |  |
| `psd:degrade-aproximado` | Degradê com interpolação perceptual ou linear (o padrão do Photoshop desde 2022) | Aproximado | Degradê com paradas a mais (até as 6 do Otto), perto da curva do Photoshop | O Otto interpola do jeito clássico, em sRGB |
| `psd:caminho-composto` | Forma feita de caminhos que se subtraem, se intersectam ou se excluem | Imagem | Imagem, com o pixel gravado |  |
| `psd:traco-vetorial` | Traçado de forma tracejado, em degradê, por fora, ou com opacidade e modo próprios | Imagem | Imagem, com o pixel gravado | O pixel gravado da forma já traz o traçado |
| `psd:objeto-inteligente` | Objeto inteligente que não é uma foto PNG ou JPEG embutida: outro PSD, arte vetorial, arquivo vinculado | Imagem | Imagem, com o pixel gravado |  |
| `psd:objeto-inteligente-deformado` | Objeto inteligente com deformação, perspectiva, espelhado, ou com escala diferente nos dois eixos | Imagem | Imagem, com o pixel gravado |  |
| `psd:filtro-inteligente` | Filtro inteligente que o Otto não tem, ou fora da faixa dele | Imagem | Imagem, com o pixel gravado | O pixel gravado do objeto inteligente já traz os filtros |
| `psd:ajuste-desconhecido` | Camada de ajuste que o Otto não tem: exposição, inverter, cor seletiva, misturador de canais, pesquisa de cor, limiar, posterizar | Ignorado | — | Camada de ajuste não tem pixel: não há como trazer como imagem. A cor do que está abaixo dela fica diferente |
| `psd:ajuste-parcial` | Camada de ajuste que o Otto tem, com parâmetro que ele não tem: níveis por canal, matiz por faixa de cor, preto e branco com pesos próprios | Aproximado | A camada de ajuste, sem o parâmetro |  |
| `psd:efeito-desconhecido` | Chanfro e entalhe, acetinado, sobreposição de padrão; traço por fora, pelo centro ou em degradê; traço em camada que não é forma | Ignorado | — | O pixel gravado da camada não traz os efeitos: virar imagem não os traria |
| `psd:efeito-repetido` | Vários efeitos do mesmo tipo na mesma camada | Aproximado | O primeiro deles |  |
| `psd:efeito-parcial` | Efeito que o Otto tem, com parâmetro que ele não tem: expansão, retração, contorno, ruído, ou o modo de mesclagem do efeito | Aproximado | O efeito, sem o parâmetro |  |
| `psd:modo-dissolver` | Modo de mesclagem dissolver | Aproximado | Modo normal |  |
| `psd:faixas-de-mesclagem` | Faixas de mesclagem ("mesclar se") | Ignorado | — | A camada vem, sem as faixas |
| `psd:mascara-parcial` | Máscara com densidade ou difusão próprias | Aproximado | A máscara, sem a densidade e a difusão |  |

### Tetos e entrada hostil

PSD é entrada de terceiro. Os tetos padrão (configuráveis por quem chama) estão em `LIMITES_DE_IMPORTACAO`:

| Teto | Padrão | Por quê |
|---|---|---|
| Tamanho do arquivo | 300 MB | |
| Maior lado | 30.000 px | É o da prancheta do Otto |
| Área do documento | 100 milhões de pixels | |
| Registros de camada | 1.000 (cada grupo conta dois) | |
| Profundidade de grupo | 10 | É o que o próprio Photoshop permite |
| Maior camada ou máscara | 64 milhões de pixels | É o maior bloco de memória alocado de uma vez (256 MB) |
| Soma das camadas e máscaras | 400 milhões de pixels | Limita o tempo: é o que um arquivo que mente sobre o tamanho das camadas obrigaria a decodificar |

A inspeção confere também que nenhum tamanho declarado passa do fim do arquivo (arquivo truncado) e que os registros fazem sentido. Erro da biblioteca ao ler vira `ErroDeImportacao('arquivo-malformado')`. Provado por teste: arquivo cortado em 40 pontos e 240 arquivos com bytes trocados ao acaso, sempre com `ErroDeImportacao` ou uma importação válida, nunca outro erro.

### Ida e volta

Exportar uma peça do Otto em PSD e importar o arquivo dá a mesma árvore, fora sete diferenças, conferidas por teste (`ida-e-volta.test.ts`) nas sete cenas de golden. O teste tira exatamente estas e exige que o resto seja igual, campo a campo, e que o render do que voltou seja o render do que foi (diferença média abaixo de 0,25 nível).

1. **Token de cor volta como o valor dele.** O PSD não tem variável de cor.
2. **Forma, texto e vetor com filtro voltam como imagem.** A exportação já os grava como pixel.
3. **A altura da caixa de texto volta como a maior entre a caixa e o texto.** A exportação aumenta a caixa para o texto caber (senão o Photoshop esconde a linha que não cabe) e não guarda a original. Em texto girado, x e y mudam junto (a caixa gira em torno do centro); o canto de cima fica no mesmo ponto. A sobreposição de degradê de um texto acompanha a caixa, e muda com ela.
4. **O peso que a conta não tem volta como o peso da fonte usada.** O PSD guarda a fonte, não o pedido.
5. **O vetor volta com a caixa justa no desenho**, a moldura do tamanho dela, sem rotação (a rotação já está nos pontos) e com o traço na espessura final. O desenho é o mesmo; com escala diferente nos dois eixos, o traço esticado do Otto vira um traço de espessura só.
6. **A origem da imagem de banco (banco, autor, licença) não volta.** Não vai para o PSD.
7. **A máscara do sujeito volta reamostrada**, na resolução em que a foto aparece: outro arquivo, o mesmo recorte.

E uma que muda o pixel sem mudar a árvore: **o grão do filtro de ruído** sai do id da camada, e a camada importada tem outro id.

### PSDs de fora do Otto

Não há Photoshop no CI. O que há: 30 arquivos do conjunto de teste público da biblioteca de leitura (licença MIT, em `packages/psd/recursos-de-teste/psd-de-fora`), a maior parte gravada pelo Photoshop, **com a imagem composta que o próprio Photoshop calculou**. O teste importa cada um e compara o render do Otto com essa composta. Camadas de pixels, grupos, formas, máscara pintada, objeto inteligente e texto que virou imagem batem com a composta (diferença média abaixo de 0,5 nível na maior parte).

Dois achados desse conjunto, sobre o motor e não sobre a importação:

- **As fórmulas dos 27 modos de mesclagem do motor batem com o Photoshop 27.7** (arquivo `2026-blend-modes.psd`): 25 a 1 nível, luz linear a 2 e luz intensa a 4. É a primeira comparação das fórmulas com o Photoshop de verdade (ADR 030).
- **Sobreposição de cor com modo, em camada com modo: o motor não faz como o Photoshop.** O Photoshop mescla a camada com o que está abaixo e depois a sobreposição com o resultado; o motor mescla a sobreposição com a camada e depois aplica o modo da camada. Com um dos dois em modo normal dá no mesmo; com os dois em outro modo, a cor muda muito (até 255 níveis no arquivo de teste). Está registrado como pendência no teste (`it.todo`), para corrigir no motor.

E um defeito da exportação, achado ao fazer a volta e corrigido junto: **degradê em camada girada.** No Otto o degradê (do preenchimento e da sobreposição) gira com a camada; no PSD o ângulo é o do documento. A exportação gravava o ângulo do Otto sem descontar a rotação. Agora vai o ângulo menos a rotação, e a importação soma de volta. Provado por teste no valor gravado; a aparência no Photoshop, a confirmar (lá o degradê "alinhado à camada" se estende pela caixa da camada já girada, que é maior).

### O que só o Felipe confirma

Um PSD dele, importado pelo comando `importar:psd`, com o roteiro que o comando grava ao lado. Em especial: a posição e a quebra do texto com as fontes dele, e a cor de um arquivo em Adobe RGB.
