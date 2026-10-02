# Mapeamento Otto → PSD, SVG e PDF

Dono: especialista-grafico. Decisões em [ADR 028](../decisoes/028-compatibilidade-com-photoshop-psd.md) (Photoshop) e [ADR 034](../decisoes/034-exportacao-vetorial-para-illustrator.md) (Illustrator).

Esta tabela é o espelho legível do mapeamento em `packages/psd/src/mapeamento.ts`. **Nenhum recurso entra no documento do Otto sem linha aqui** (ADR 027, item 6). Cada linha tem dois destinos:

- **Destino** (coluna PSD): **Nativo** (vira o recurso equivalente do Photoshop), **Raster** (vira camada de pixels, e o relatório avisa) ou **Bloqueado** (não existe no Otto até ter mapeamento).
- **Vetorial** (SVG e PDF, para o Illustrator): **Nativo** (vetor editável) ou **Raster** (a camada vira imagem embutida, com aviso). Nada fica de fora do arquivo: o destino "Omitido" existe no código e, desde 2026-10-02, nenhuma linha o usa. O Illustrator não restringe o documento: quem decide o que o Otto pode ter é a coluna do PSD.

**Como as duas ficam em sincronia.** Toda linha que começa por uma chave entre crases é conferida pelo teste `packages/psd/src/mapeamento.test.ts`: a linha daqui tem de ser igual à do código, e não pode haver chave aqui que o código não tenha. Do outro lado, cada parte da tabela em código é um `Record` sobre o tipo do esquema de `@otto/documento`: um modo de mesclagem, ajuste, filtro, efeito, máscara ou tipo de nó novo quebra o `typecheck` de `packages/psd` até ganhar linha, nas duas colunas. Para mudar o mapeamento, mude o código e copie a linha que o teste mostrar.

**Estado (2026-10-02).** As três saídas estão implementadas em `packages/psd` e são conferidas por golden, cada uma relida por um programa independente do que grava: o PSD por uma segunda biblioteca de PSD; o SVG por um analisador de XML e por um renderizador de SVG; o PDF por um leitor de PDF que também o desenha.

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

| Chave | Otto | PSD | Destino | Vetorial | No SVG e no PDF | Observação |
|---|---|---|---|---|---|---|
| `documento` | Documento | Cabeçalho do arquivo | Nativo | Nativo | Cores em sRGB | RGB, 8 bits, com o perfil sRGB embutido. PSB quando um lado passa de 30.000 px |
| `prancheta` | Prancheta | Um arquivo por prancheta; no arquivo com todas, grupo com dados de prancheta (`artb`) | Nativo | Nativo | Um SVG por prancheta; um PDF por prancheta (a pedido, um PDF só com uma página por prancheta) |  |
| `fundo-da-prancheta` | Fundo da prancheta | Camada de preenchimento sólido (`SoCo`) | Nativo | Nativo | Retângulo do tamanho da prancheta |  |
| `no:grupo` | Grupo | Grupo de camadas (`lsct`) | Nativo | Nativo | Grupo com o nome da camada no SVG. No PDF vai como camada do PDF, que o Illustrator não mostra: lá os objetos chegam sem nome | O modo "atravessar" é o padrão de grupo, como no Photoshop |
| `no:forma` | Forma: retângulo (com raio) e elipse | Camada de preenchimento (`SoCo` ou `GdFl`) com máscara vetorial (`vmsk`) | Nativo | Nativo | Caminho | O raio vai como curva no caminho. Sem rotação, leva também os dados de forma viva (`vogk`): o painel Propriedades mostra o raio |
| `no:texto` | Texto em caixa | Camada de texto (`TySh`) | Nativo | Nativo | Texto como texto, linha por linha, na quebra do Otto (não requebra sozinho). No Illustrator chega um objeto de texto por linha e por mudança de estilo | A fonte precisa estar instalada para editar; o pixel vai junto. A caixa gravada desce para a primeira linha cair onde o motor a pôs. O Photoshop pede para atualizar o texto ao abrir (limite da biblioteca) |
| `no:imagem` | Foto | Objeto inteligente (`SoLd`) com o arquivo original embutido (`lnk2`), e o corte da caixa como máscara vetorial | Nativo | Nativo | Imagem embutida (o arquivo original), com o corte da caixa como recorte vetorial | Só PNG e JPEG são embutidos. Objeto inteligente está listado como fora da v1 no ADR 028: pede ADR |
| `no:vetor` | Vetor (logo, ícone, forma livre) | Grupo com uma camada de forma por caminho (`SoCo` + `vmsk`) | Nativo | Nativo | Grupo com um caminho para cada caminho | Só caminhos com M, C e Z |
| `no:ajuste` | Camada de ajuste | Camada de ajuste | Nativo | Raster | O ajuste e o que está abaixo dele viram uma imagem só, com a cor certa (presa a uma camada, só ela e o ajuste) | Um tipo por linha, abaixo |

## Conteúdo das camadas

| Chave | Otto | PSD | Destino | Vetorial | No SVG e no PDF | Observação |
|---|---|---|---|---|---|---|
| `preenchimento-em-degrade` | Preenchimento em degradê (linear e radial) | Camada de preenchimento em degradê (`GdFl`) | Nativo | Nativo | Degradê linear e radial | Escala de 100%. A suavidade vai em 100%, o padrão do Photoshop (a biblioteca não grava outra): a transição pode diferir um pouco da do motor, que é linear |
| `traco-de-vetor` | Traço de caminho de vetor | Traçado vetorial (`vstk`) | Nativo | Nativo | Contorno do caminho | Centralizado no caminho |
| `trechos-de-texto` | Trechos de texto com estilo próprio | Estilos por sequência de caracteres, no `TySh` | Nativo | Nativo | Um pedaço de texto para cada estilo, dentro da linha |  |
| `caixa-alta-e-versalete` | Caixa alta e versalete | Atributo de caixa do caractere, no `TySh` | Nativo | Nativo | Caixa alta: o texto vai já em maiúsculas. Versalete: as letras que eram minúsculas vão em maiúscula a 70% do corpo, na mesma linha (no Illustrator, um objeto de texto por mudança de corpo) | O versalete do motor é o sintético do Photoshop: as minúsculas viram maiúsculas a 70% do corpo |
| `ajuste-de-cor-da-foto` | Ajuste de cor da foto (brilho, contraste, saturação, duotone) | Camadas de ajuste presas à foto: Níveis (`levl`) para brilho e contraste, Misturador de canais (`mixr`) para saturação, Mapa de degradê (`grdm`) para duotone | Nativo | Raster | A foto vira imagem com o ajuste já aplicado | Níveis e Misturador são lineares, como a conta do motor: dão o mesmo resultado, a 2 níveis |

## Propriedades de camada

| Chave | Otto | PSD | Destino | Vetorial | No SVG e no PDF | Observação |
|---|---|---|---|---|---|---|
| `opacidade` | Opacidade | Opacidade da camada | Nativo | Nativo | Opacidade |  |
| `visivel-e-bloqueado` | Visível e bloqueado | Flags da camada e bloqueio (`lspf`) | Nativo | Nativo | Camada oculta vai oculta; o bloqueio não vai |  |
| `rotacao` | Rotação | Na geometria: caminho girado, transformação do texto e do objeto inteligente | Nativo | Nativo | Na geometria: caminho girado, transformação do texto e da imagem |  |
| `recorte-da-foto` | Recorte da foto em forma | Máscara vetorial (`vmsk`) | Nativo | Nativo | Recorte vetorial |  |
| `recortada-na-de-baixo` | Máscara de recorte na camada de baixo | Recorte (clipping) da camada | Nativo | Nativo | Recorte vetorial pela forma da camada de baixo, quando ela é forma, vetor ou foto |  |
| `token` | Token de cor | Valor resolvido | Nativo | Nativo | Valor resolvido | A referência se perde; o relatório lista cada token |
| `mascara:degrade` | Máscara em degradê | Máscara de camada (canal −2) | Nativo | Raster | A camada vira imagem embutida | Vai como pixels: no Photoshop não é mais um degradê editável |
| `mascara:forma` | Máscara de forma | Máscara de camada (canal −2) | Nativo | Nativo | Recorte vetorial, quando não tem borda suave nem está invertida | Vai como pixels, por causa da borda suave |
| `mascara:sujeito` | Máscara do sujeito da foto | Máscara de camada (canal −2) | Nativo | Raster | A camada vira imagem embutida |  |

## Modos de mesclagem

Só entram no Otto os modos do Photoshop, com a fórmula do Photoshop (ADR 030). Os que o Skia não tem prontos são calculados pelo motor (shader na GPU, laço de pixel na CPU). O PDF tem 15 deles; com os outros 10, a camada vira a imagem equivalente em modo normal. No SVG, todos viram essa imagem (linha `modo-no-svg`).

| Chave | Otto | PSD | Destino | Vetorial | No SVG e no PDF | Observação |
|---|---|---|---|---|---|---|
| `modo:atravessar` | Modo atravessar (só em grupo) | `pass` | Nativo | Nativo | Grupo sem isolamento |  |
| `modo:normal` | Modo normal | `norm` | Nativo | Nativo | Normal |  |
| `modo:escurecer` | Modo escurecer | `dark` | Nativo | Nativo | Modo de mesclagem do PDF. No SVG vira imagem: ver `modo-no-svg` |  |
| `modo:multiplicacao` | Modo multiplicação | `mul ` | Nativo | Nativo | Modo de mesclagem do PDF. No SVG vira imagem: ver `modo-no-svg` |  |
| `modo:subexposicao-de-cores` | Modo subexposição de cores | `idiv` | Nativo | Nativo | Modo de mesclagem do PDF. No SVG vira imagem: ver `modo-no-svg` |  |
| `modo:subexposicao-linear` | Modo subexposição linear | `lbrn` | Nativo | Raster | Nem o SVG nem o PDF têm este modo: a camada vira uma imagem em modo normal que dá a mesma cor sobre o que está abaixo dela. O que está abaixo continua vetor |  |
| `modo:cor-mais-escura` | Modo cor mais escura | `dkCl` | Nativo | Raster | Nem o SVG nem o PDF têm este modo: a camada vira uma imagem em modo normal que dá a mesma cor sobre o que está abaixo dela. O que está abaixo continua vetor |  |
| `modo:clarear` | Modo clarear | `lite` | Nativo | Nativo | Modo de mesclagem do PDF. No SVG vira imagem: ver `modo-no-svg` |  |
| `modo:tela` | Modo tela | `scrn` | Nativo | Nativo | Modo de mesclagem do PDF. No SVG vira imagem: ver `modo-no-svg` |  |
| `modo:superexposicao-de-cores` | Modo superexposição de cores | `div ` | Nativo | Nativo | Modo de mesclagem do PDF. No SVG vira imagem: ver `modo-no-svg` |  |
| `modo:superexposicao-linear` | Modo superexposição linear | `lddg` | Nativo | Raster | Nem o SVG nem o PDF têm este modo: a camada vira uma imagem em modo normal que dá a mesma cor sobre o que está abaixo dela. O que está abaixo continua vetor |  |
| `modo:cor-mais-clara` | Modo cor mais clara | `lgCl` | Nativo | Raster | Nem o SVG nem o PDF têm este modo: a camada vira uma imagem em modo normal que dá a mesma cor sobre o que está abaixo dela. O que está abaixo continua vetor |  |
| `modo:sobrepor` | Modo sobrepor | `over` | Nativo | Nativo | Modo de mesclagem do PDF. No SVG vira imagem: ver `modo-no-svg` |  |
| `modo:luz-suave` | Modo luz suave | `sLit` | Nativo | Nativo | Modo de mesclagem do PDF. No SVG vira imagem: ver `modo-no-svg` | O motor usa a fórmula do W3C; a do Photoshop difere um pouco nos tons escuros |
| `modo:luz-direta` | Modo luz direta | `hLit` | Nativo | Nativo | Modo de mesclagem do PDF. No SVG vira imagem: ver `modo-no-svg` |  |
| `modo:luz-intensa` | Modo luz intensa | `vLit` | Nativo | Raster | Nem o SVG nem o PDF têm este modo: a camada vira uma imagem em modo normal que dá a mesma cor sobre o que está abaixo dela. O que está abaixo continua vetor |  |
| `modo:luz-linear` | Modo luz linear | `lLit` | Nativo | Raster | Nem o SVG nem o PDF têm este modo: a camada vira uma imagem em modo normal que dá a mesma cor sobre o que está abaixo dela. O que está abaixo continua vetor |  |
| `modo:luz-do-ponto` | Modo luz do ponto | `pLit` | Nativo | Raster | Nem o SVG nem o PDF têm este modo: a camada vira uma imagem em modo normal que dá a mesma cor sobre o que está abaixo dela. O que está abaixo continua vetor |  |
| `modo:mistura-solida` | Modo mistura sólida | `hMix` | Nativo | Raster | Nem o SVG nem o PDF têm este modo: a camada vira uma imagem em modo normal que dá a mesma cor sobre o que está abaixo dela. O que está abaixo continua vetor |  |
| `modo:diferenca` | Modo diferença | `diff` | Nativo | Nativo | Modo de mesclagem do PDF. No SVG vira imagem: ver `modo-no-svg` |  |
| `modo:exclusao` | Modo exclusão | `smud` | Nativo | Nativo | Modo de mesclagem do PDF. No SVG vira imagem: ver `modo-no-svg` |  |
| `modo:subtrair` | Modo subtrair | `fsub` | Nativo | Raster | Nem o SVG nem o PDF têm este modo: a camada vira uma imagem em modo normal que dá a mesma cor sobre o que está abaixo dela. O que está abaixo continua vetor |  |
| `modo:dividir` | Modo dividir | `fdiv` | Nativo | Raster | Nem o SVG nem o PDF têm este modo: a camada vira uma imagem em modo normal que dá a mesma cor sobre o que está abaixo dela. O que está abaixo continua vetor |  |
| `modo:matiz` | Modo matiz | `hue ` | Nativo | Nativo | Modo de mesclagem do PDF. No SVG vira imagem: ver `modo-no-svg` |  |
| `modo:saturacao` | Modo saturação | `sat ` | Nativo | Nativo | Modo de mesclagem do PDF. No SVG vira imagem: ver `modo-no-svg` |  |
| `modo:cor` | Modo cor | `colr` | Nativo | Nativo | Modo de mesclagem do PDF. No SVG vira imagem: ver `modo-no-svg` |  |
| `modo:luminosidade` | Modo luminosidade | `lum ` | Nativo | Nativo | Modo de mesclagem do PDF. No SVG vira imagem: ver `modo-no-svg` |  |

## Efeitos de camada

Cada efeito, no máximo uma vez por camada. O tamanho de sombra e de brilho é o "tamanho" do Photoshop; o motor desenha com desfoque gaussiano de desvio padrão igual à metade dele. Na conferência de 2026-10-02 a sombra projetada bateu; a sombra interna e o brilho externo ficaram um pouco diferentes (diferença média de 8,5 níveis numa camada de teste). Desde então todos os parâmetros vão escritos por extenso; **se a diferença continua, é a segunda conferência que diz.**

| Chave | Otto | PSD | Destino | Vetorial | No SVG e no PDF | Observação |
|---|---|---|---|---|---|---|
| `efeito:sombra` | Sombra projetada | Efeito de camada (`lfx2`): sombra projetada | Nativo | Raster | A camada vira imagem embutida | Gravada com modo normal, como o motor desenha (o padrão do Photoshop é multiplicação) |
| `efeito:traco` | Traço da forma | Efeito de camada (`lfx2`): traço interno de cor sólida | Nativo | Nativo | Contorno com o dobro da espessura, cortado pela própria forma |  |
| `efeito:sombraInterna` | Sombra interna | Efeito de camada (`lfx2`): sombra interna | Nativo | Raster | A camada vira imagem embutida | Modo multiplicação, contorno linear, sem retração nem ruído |
| `efeito:brilhoExterno` | Brilho externo | Efeito de camada (`lfx2`): brilho externo | Nativo | Raster | A camada vira imagem embutida | Gravado com modo normal, como o motor desenha (o padrão do Photoshop é tela); técnica mais suave, contorno linear, sem expansão |
| `efeito:brilhoInterno` | Brilho interno | Efeito de camada (`lfx2`): brilho interno, a partir da borda | Nativo | Raster | A camada vira imagem embutida | Modo tela |
| `efeito:sobreposicaoDeCor` | Sobreposição de cor | Efeito de camada (`lfx2`): sobreposição de cor | Nativo | Raster | A camada vira imagem embutida |  |
| `efeito:sobreposicaoDeDegrade` | Sobreposição de degradê | Efeito de camada (`lfx2`): sobreposição de degradê | Nativo | Raster | A camada vira imagem embutida | Escala de 100%, alinhada à camada |

## Camadas de ajuste

Com máscara, opacidade, máscara de recorte e modo de mesclagem.

| Chave | Otto | PSD | Destino | Vetorial | No SVG e no PDF | Observação |
|---|---|---|---|---|---|---|
| `ajuste:curvas` | Ajuste de curvas | `curv` | Nativo | Raster | O ajuste e o que está abaixo dele viram uma imagem só, com a cor certa (presa a uma camada, só ela e o ajuste) |  |
| `ajuste:niveis` | Ajuste de níveis | `levl` | Nativo | Raster | O ajuste e o que está abaixo dele viram uma imagem só, com a cor certa (presa a uma camada, só ela e o ajuste) |  |
| `ajuste:matiz-saturacao` | Ajuste de matiz e saturação | `hue2` | Nativo | Raster | O ajuste e o que está abaixo dele viram uma imagem só, com a cor certa (presa a uma camada, só ela e o ajuste) | Só o canal principal |
| `ajuste:brilho-contraste` | Ajuste de brilho e contraste | `brit` | Nativo | Raster | O ajuste e o que está abaixo dele viram uma imagem só, com a cor certa (presa a uma camada, só ela e o ajuste) |  |
| `ajuste:vibracao` | Ajuste de vibração | `vibA` | Nativo | Raster | O ajuste e o que está abaixo dele viram uma imagem só, com a cor certa (presa a uma camada, só ela e o ajuste) |  |
| `ajuste:equilibrio-de-cor` | Ajuste de equilíbrio de cores | `blnc` | Nativo | Raster | O ajuste e o que está abaixo dele viram uma imagem só, com a cor certa (presa a uma camada, só ela e o ajuste) |  |
| `ajuste:filtro-de-foto` | Ajuste de filtro de fotografia | `phfl` | Nativo | Raster | O ajuste e o que está abaixo dele viram uma imagem só, com a cor certa (presa a uma camada, só ela e o ajuste) |  |
| `ajuste:preto-e-branco` | Ajuste de preto e branco | `blwh` | Nativo | Raster | O ajuste e o que está abaixo dele viram uma imagem só, com a cor certa (presa a uma camada, só ela e o ajuste) | Com os pesos padrão do Photoshop |
| `ajuste:mapa-de-degrade` | Ajuste de mapa de degradê | `grdm` | Nativo | Raster | O ajuste e o que está abaixo dele viram uma imagem só, com a cor certa (presa a uma camada, só ela e o ajuste) |  |

## Filtros

Filtro só é editável no Photoshop dentro de objeto inteligente. Por isso, em foto ele vira filtro inteligente, e em forma, texto e vetor a camada vira pixel.

| Chave | Otto | PSD | Destino | Vetorial | No SVG e no PDF | Observação |
|---|---|---|---|---|---|---|
| `filtro:desfoque` | Filtro de desfoque, em foto | Filtro inteligente: desfoque gaussiano | Nativo | Raster | A foto vira imagem com o filtro já aplicado | Filtro inteligente está listado como fora da v1 no ADR 028: pede ADR |
| `filtro:desfoque-de-movimento` | Filtro de desfoque de movimento, em foto | Filtro inteligente: desfoque de movimento | Nativo | Raster | A foto vira imagem com o filtro já aplicado | Pede ADR, como o desfoque |
| `filtro:ruido` | Filtro de ruído, em foto | Filtro inteligente: adicionar ruído | Nativo | Raster | A foto vira imagem com o filtro já aplicado | O grão do Photoshop não é o do Otto: ao reaplicar, o desenho do grão muda. Pede ADR |
| `filtro:nitidez` | Filtro de nitidez, em foto | Filtro inteligente: máscara de nitidez | Nativo | Raster | A foto vira imagem com o filtro já aplicado | Pede ADR, como o desfoque. No Photoshop, reaplicar o filtro mudou um pouco a aparência (conferência de 2026-10-02): causa em aberto |

## O que vira pixel no PSD, com aviso no relatório

| Chave | Otto | PSD | Destino | Vetorial | No SVG e no PDF | Observação |
|---|---|---|---|---|---|---|
| `filtro-fora-de-foto` | Filtro em forma, texto ou vetor | Camada de pixels | Raster | Raster | A camada vira imagem embutida | No Photoshop, filtro editável só existe em objeto inteligente |
| `foto-recortada-com-ajuste-de-cor` | Foto presa por máscara de recorte e com ajuste de cor | Camada de pixels, com o ajuste já aplicado | Raster | Raster | A camada vira imagem embutida | O ajuste não tem como ficar preso só à foto |
| `foto-em-webp` | Foto em WebP | Camada de pixels | Raster | Raster | A foto vira imagem, na resolução do documento | O arquivo original não é embutido |
| `texto-sem-fonte` | Texto cuja fonte não foi entregue | Camada de pixels vazia | Raster | Raster | Imagem vazia | O motor não troca de fonte: a camada sai sem o texto, e o relatório diz qual fonte falta |
| `vetor-fora-do-padrao` | Vetor com caminho que não é só M, C e Z | Camada de pixels | Raster | Raster | A camada vira imagem embutida |  |

## O que só a saída vetorial trata diferente

Recursos que já têm linha acima, e que ganham linha própria porque na saída vetorial o destino muda.

| Chave | Otto | PSD | Destino | Vetorial | No SVG e no PDF | Observação |
|---|---|---|---|---|---|---|
| `mascara-suave-ou-invertida` | Máscara de forma com borda suave ou invertida | Máscara de camada (canal −2) | Nativo | Raster | A camada vira imagem embutida | É a máscara de forma; tem linha própria porque na saída vetorial vira imagem |
| `recorte-em-texto` | Máscara de recorte cuja base é texto, ou uma camada que virou imagem | Recorte (clipping) da camada | Nativo | Raster | A base e as camadas presas a ela viram uma imagem só | Tem linha própria porque na saída vetorial vira imagem |
| `degrade-transparente-no-pdf` | Degradê com parada transparente, no PDF | Camada de preenchimento em degradê (`GdFl`) | Nativo | Raster | Só no PDF: no SVG vai como degradê | É o preenchimento em degradê; tem linha própria porque no PDF vira imagem |
| `modo-no-svg` | Modo de mesclagem que o PDF tem, numa peça exportada em SVG | O modo da camada | Nativo | Raster | Só no SVG: o Illustrator não aplica o modo de mesclagem do SVG. A camada vira uma imagem em modo normal que dá a mesma cor sobre o que está abaixo dela. O que está abaixo continua vetor | São os modos de mesclagem; tem linha própria porque no SVG a camada vira imagem |

## Bloqueado

Não existe no documento do Otto.

| Chave | Otto | PSD | Destino | Vetorial | No SVG e no PDF | Observação |
|---|---|---|---|---|---|---|
| `modo-dissolver` | Modo dissolver | — | Bloqueado | — | — | O ruído do Photoshop não é reproduzível |
| `chanfro-acetinado-padrao` | Chanfro e entalhe, acetinado, sobreposição de padrão | — | Bloqueado | — | — | Custo de reproduzir no motor |
| `efeito-repetido` | Vários efeitos do mesmo tipo na mesma camada | — | Bloqueado | — | — | Fora da v1 |
| `ajustes-fora-da-lista` | Exposição, inverter, cor seletiva, misturador de canais, pesquisa de cor, limiar, posterizar | — | Bloqueado | — | — | Fora da v1. O misturador de canais só aparece no PSD como o jeito de gravar a saturação da foto |
| `texto-em-caminho` | Texto em caminho | — | Bloqueado | — | — | Até um spike provar que abre bem |
| `cor-fora-de-rgb-8-bits` | CMYK, 16 e 32 bits, perfis além de sRGB | — | Bloqueado | — | — | Fora da v1 (ADR 028, item 3) |

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

## Importação (aceita, ADR 028 item 4)

Ainda não implementada. Tudo que tiver linha **Nativo** acima é lido de volta como nó do Otto. Tudo o mais vira `imagem` com o pixel que o PSD traz, e o relatório de importação lista cada caso. Objeto inteligente vira `imagem` com o pixel renderizado.
