# Mapeamento Otto → PSD, SVG e PDF

Dono: especialista-grafico. Decisões em [ADR 028](../decisoes/028-compatibilidade-com-photoshop-psd.md) (Photoshop) e [ADR 034](../decisoes/034-exportacao-vetorial-para-illustrator.md) (Illustrator).

Esta tabela é o espelho legível do mapeamento em `packages/psd/src/mapeamento.ts`. **Nenhum recurso entra no documento do Otto sem linha aqui** (ADR 027, item 6). Cada linha tem dois destinos:

- **Destino** (coluna PSD): **Nativo** (vira o recurso equivalente do Photoshop), **Raster** (vira camada de pixels, e o relatório avisa) ou **Bloqueado** (não existe no Otto até ter mapeamento).
- **Vetorial** (SVG e PDF, para o Illustrator): **Nativo** (vetor editável), **Raster** (a camada vira imagem embutida, com aviso) ou **Omitido** (fica de fora do arquivo, com aviso). O Illustrator não restringe o documento: quem decide o que o Otto pode ter é a coluna do PSD.

**Como as duas ficam em sincronia.** Toda linha que começa por uma chave entre crases é conferida pelo teste `packages/psd/src/mapeamento.test.ts`: a linha daqui tem de ser igual à do código, e não pode haver chave aqui que o código não tenha. Do outro lado, cada parte da tabela em código é um `Record` sobre o tipo do esquema de `@otto/documento`: um modo de mesclagem, ajuste, filtro, efeito, máscara ou tipo de nó novo quebra o `typecheck` de `packages/psd` até ganhar linha, nas duas colunas. Para mudar o mapeamento, mude o código e copie a linha que o teste mostrar.

**Estado (2026-10-01).** As três saídas estão implementadas em `packages/psd` e são conferidas por golden, cada uma relida por um programa independente do que grava: o PSD por uma segunda biblioteca de PSD; o SVG por um analisador de XML e por um renderizador de SVG; o PDF por um leitor de PDF que também o desenha. **Nenhuma linha abaixo foi conferida no Photoshop nem no Illustrator ainda.** "Nativo" quer dizer que o arquivo carrega o recurso editável e que um programa independente concorda que ele está lá. Se o Photoshop e o Illustrator o abrem editável, e com a mesma aparência, é a conferência manual dos ADRs 028 e 034 que diz. O que cair nela muda de linha aqui.

Referência do PSD: *Adobe Photoshop File Formats Specification* (chaves de 4 caracteres entre crases na coluna PSD).

## O que todo PSD leva

- **A imagem composta**, do render de referência em CPU. Qualquer leitor mostra o resultado certo, mesmo sem as fontes.
- **O pixel de cada camada**, inclusive texto e forma, sem opacidade, modo, máscara nem efeitos (esses ficam na camada). A área gravada é a que a camada ocupa dentro da prancheta.
- **Os dados editáveis** de cada camada nativa.
- **O perfil de cor sRGB** embutido (ICC versão 2, gerado pelo Otto e conferido contra o sRGB do LittleCMS).
- **O relatório**: como cada camada saiu e por quê, fontes a instalar, pesos de fonte trocados, fonte e imagem não encontradas, tokens resolvidos, origem e licença das imagens.

A ordem em que a camada é montada é a do Photoshop, e o motor desenha na mesma ordem: conteúdo, filtros, máscara, efeitos (a sombra e o brilho contornam o que a máscara deixou), opacidade e modo.

## O que todo SVG e PDF leva

- **Um SVG por prancheta; um PDF com uma página por prancheta.**
- **Cada camada com o nome dela**: no SVG, no `id` do elemento (na convenção do Illustrator: espaço vira `_`, e o que não cabe num nome XML vira `_xHH_`); no PDF, uma camada do PDF (conteúdo opcional) para cada camada do Otto, com as de dentro de um grupo aninhadas.
- **Texto como texto**, linha por linha, na quebra que o motor do Otto fez. No SVG a fonte vai por família e peso, com o nome PostScript de reserva. No PDF a fonte vai embutida inteira, sem recorte de glifos.
- **Foto como imagem embutida** (o arquivo original), com o corte da caixa como recorte vetorial.
- **O que não tem equivalente vetorial vira imagem PNG embutida**, com o dobro da resolução do documento: camada com sombra, brilho, sobreposição, filtro, máscara suave, ajuste de cor da foto. O relatório diz qual camada e por quê.
- **Camada de ajuste fica de fora**, e modo de mesclagem que o formato não tem sai como normal. O relatório avisa: a cor pode ficar diferente do que o Otto mostra.
- **O mesmo relatório do PSD**, com o destino a mais ("ficou de fora").

## Estrutura

| Chave | Otto | PSD | Destino | Vetorial | No SVG e no PDF | Observação |
|---|---|---|---|---|---|---|
| `documento` | Documento | Cabeçalho do arquivo | Nativo | Nativo | Cores em sRGB | RGB, 8 bits, com o perfil sRGB embutido. PSB quando um lado passa de 30.000 px |
| `prancheta` | Prancheta | Um arquivo por prancheta; no arquivo com todas, grupo com dados de prancheta (`artb`) | Nativo | Nativo | Um SVG por prancheta; no PDF, uma página por prancheta |  |
| `fundo-da-prancheta` | Fundo da prancheta | Camada de preenchimento sólido (`SoCo`) | Nativo | Nativo | Retângulo do tamanho da prancheta |  |
| `no:grupo` | Grupo | Grupo de camadas (`lsct`) | Nativo | Nativo | Grupo com o nome da camada; no PDF, cada camada de cima da prancheta é uma camada do PDF | O modo "atravessar" é o padrão de grupo, como no Photoshop |
| `no:forma` | Forma: retângulo (com raio) e elipse | Camada de preenchimento (`SoCo` ou `GdFl`) com máscara vetorial (`vmsk`) | Nativo | Nativo | Caminho | O raio vai como curva no caminho; não grava os dados de forma viva (`vogk`) |
| `no:texto` | Texto em caixa | Camada de texto (`TySh`) | Nativo | Nativo | Texto como texto, linha por linha, na quebra do Otto (não requebra sozinho) | Maior risco. A fonte precisa estar instalada para editar; o pixel vai junto |
| `no:imagem` | Foto | Objeto inteligente (`SoLd`) com o arquivo original embutido (`lnk2`), e o corte da caixa como máscara vetorial | Nativo | Nativo | Imagem embutida (o arquivo original), com o corte da caixa como recorte vetorial | Só PNG e JPEG são embutidos. Objeto inteligente está listado como fora da v1 no ADR 028: pede ADR |
| `no:vetor` | Vetor (logo, ícone, forma livre) | Grupo com uma camada de forma por caminho (`SoCo` + `vmsk`) | Nativo | Nativo | Grupo com um caminho para cada caminho | Só caminhos com M, C e Z |
| `no:ajuste` | Camada de ajuste | Camada de ajuste | Nativo | Omitido | Não vai: o arquivo fica sem o ajuste de cor | Um tipo por linha, abaixo |

## Conteúdo das camadas

| Chave | Otto | PSD | Destino | Vetorial | No SVG e no PDF | Observação |
|---|---|---|---|---|---|---|
| `preenchimento-em-degrade` | Preenchimento em degradê (linear e radial) | Camada de preenchimento em degradê (`GdFl`) | Nativo | Nativo | Degradê linear e radial |  |
| `traco-de-vetor` | Traço de caminho de vetor | Traçado vetorial (`vstk`) | Nativo | Nativo | Contorno do caminho | Centralizado no caminho |
| `trechos-de-texto` | Trechos de texto com estilo próprio | Estilos por sequência de caracteres, no `TySh` | Nativo | Nativo | Um pedaço de texto para cada estilo, dentro da linha |  |
| `caixa-alta-e-versalete` | Caixa alta e versalete | Atributo de caixa do caractere, no `TySh` | Nativo | Nativo | O texto vai já em maiúsculas; no versalete, as letras que eram minúsculas vão em corpo menor |  |
| `ajuste-de-cor-da-foto` | Ajuste de cor da foto (brilho, contraste, saturação, duotone) | Camadas de ajuste presas à foto por máscara de recorte | Nativo | Raster | A foto vira imagem com o ajuste já aplicado | Aproximação: o Photoshop recalcula com a fórmula dele |

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

Só entram no Otto os modos do Photoshop, com a fórmula do Photoshop (ADR 030). Os que o Skia não tem prontos são calculados pelo motor (shader na GPU, laço de pixel na CPU). O SVG e o PDF têm 15 deles; os outros 10 saem como normal na saída vetorial.

| Chave | Otto | PSD | Destino | Vetorial | No SVG e no PDF | Observação |
|---|---|---|---|---|---|---|
| `modo:atravessar` | Modo atravessar (só em grupo) | `pass` | Nativo | Nativo | Grupo sem isolamento |  |
| `modo:normal` | Modo normal | `norm` | Nativo | Nativo | Normal |  |
| `modo:escurecer` | Modo escurecer | `dark` | Nativo | Nativo | Modo de mesclagem do SVG (`mix-blend-mode`) e do PDF |  |
| `modo:multiplicacao` | Modo multiplicação | `mul ` | Nativo | Nativo | Modo de mesclagem do SVG (`mix-blend-mode`) e do PDF |  |
| `modo:subexposicao-de-cores` | Modo subexposição de cores | `idiv` | Nativo | Nativo | Modo de mesclagem do SVG (`mix-blend-mode`) e do PDF |  |
| `modo:subexposicao-linear` | Modo subexposição linear | `lbrn` | Nativo | Omitido | O formato não tem este modo: a camada sai em modo normal |  |
| `modo:cor-mais-escura` | Modo cor mais escura | `dkCl` | Nativo | Omitido | O formato não tem este modo: a camada sai em modo normal |  |
| `modo:clarear` | Modo clarear | `lite` | Nativo | Nativo | Modo de mesclagem do SVG (`mix-blend-mode`) e do PDF |  |
| `modo:tela` | Modo tela | `scrn` | Nativo | Nativo | Modo de mesclagem do SVG (`mix-blend-mode`) e do PDF |  |
| `modo:superexposicao-de-cores` | Modo superexposição de cores | `div ` | Nativo | Nativo | Modo de mesclagem do SVG (`mix-blend-mode`) e do PDF |  |
| `modo:superexposicao-linear` | Modo superexposição linear | `lddg` | Nativo | Omitido | O formato não tem este modo: a camada sai em modo normal |  |
| `modo:cor-mais-clara` | Modo cor mais clara | `lgCl` | Nativo | Omitido | O formato não tem este modo: a camada sai em modo normal |  |
| `modo:sobrepor` | Modo sobrepor | `over` | Nativo | Nativo | Modo de mesclagem do SVG (`mix-blend-mode`) e do PDF |  |
| `modo:luz-suave` | Modo luz suave | `sLit` | Nativo | Nativo | Modo de mesclagem do SVG (`mix-blend-mode`) e do PDF | O motor usa a fórmula do W3C; a do Photoshop difere um pouco nos tons escuros |
| `modo:luz-direta` | Modo luz direta | `hLit` | Nativo | Nativo | Modo de mesclagem do SVG (`mix-blend-mode`) e do PDF |  |
| `modo:luz-intensa` | Modo luz intensa | `vLit` | Nativo | Omitido | O formato não tem este modo: a camada sai em modo normal |  |
| `modo:luz-linear` | Modo luz linear | `lLit` | Nativo | Omitido | O formato não tem este modo: a camada sai em modo normal |  |
| `modo:luz-do-ponto` | Modo luz do ponto | `pLit` | Nativo | Omitido | O formato não tem este modo: a camada sai em modo normal |  |
| `modo:mistura-solida` | Modo mistura sólida | `hMix` | Nativo | Omitido | O formato não tem este modo: a camada sai em modo normal |  |
| `modo:diferenca` | Modo diferença | `diff` | Nativo | Nativo | Modo de mesclagem do SVG (`mix-blend-mode`) e do PDF |  |
| `modo:exclusao` | Modo exclusão | `smud` | Nativo | Nativo | Modo de mesclagem do SVG (`mix-blend-mode`) e do PDF |  |
| `modo:subtrair` | Modo subtrair | `fsub` | Nativo | Omitido | O formato não tem este modo: a camada sai em modo normal |  |
| `modo:dividir` | Modo dividir | `fdiv` | Nativo | Omitido | O formato não tem este modo: a camada sai em modo normal |  |
| `modo:matiz` | Modo matiz | `hue ` | Nativo | Nativo | Modo de mesclagem do SVG (`mix-blend-mode`) e do PDF |  |
| `modo:saturacao` | Modo saturação | `sat ` | Nativo | Nativo | Modo de mesclagem do SVG (`mix-blend-mode`) e do PDF |  |
| `modo:cor` | Modo cor | `colr` | Nativo | Nativo | Modo de mesclagem do SVG (`mix-blend-mode`) e do PDF |  |
| `modo:luminosidade` | Modo luminosidade | `lum ` | Nativo | Nativo | Modo de mesclagem do SVG (`mix-blend-mode`) e do PDF |  |

## Efeitos de camada

Cada efeito, no máximo uma vez por camada. O tamanho de sombra e de brilho é o "tamanho" do Photoshop; o motor desenha com desfoque gaussiano de desvio padrão igual à metade dele. **A equivalência entre os dois é o que mais precisa de conferência no Photoshop.**

| Chave | Otto | PSD | Destino | Vetorial | No SVG e no PDF | Observação |
|---|---|---|---|---|---|---|
| `efeito:sombra` | Sombra projetada | Efeito de camada (`lfx2`): sombra projetada | Nativo | Raster | A camada vira imagem embutida | Gravada com modo normal, como o motor desenha (o padrão do Photoshop é multiplicação) |
| `efeito:traco` | Traço da forma | Efeito de camada (`lfx2`): traço interno de cor sólida | Nativo | Nativo | Contorno com o dobro da espessura, cortado pela própria forma |  |
| `efeito:sombraInterna` | Sombra interna | Efeito de camada (`lfx2`): sombra interna | Nativo | Raster | A camada vira imagem embutida | Modo multiplicação |
| `efeito:brilhoExterno` | Brilho externo | Efeito de camada (`lfx2`): brilho externo | Nativo | Raster | A camada vira imagem embutida | Gravado com modo normal, como o motor desenha (o padrão do Photoshop é tela) |
| `efeito:brilhoInterno` | Brilho interno | Efeito de camada (`lfx2`): brilho interno, a partir da borda | Nativo | Raster | A camada vira imagem embutida | Modo tela |
| `efeito:sobreposicaoDeCor` | Sobreposição de cor | Efeito de camada (`lfx2`): sobreposição de cor | Nativo | Raster | A camada vira imagem embutida |  |
| `efeito:sobreposicaoDeDegrade` | Sobreposição de degradê | Efeito de camada (`lfx2`): sobreposição de degradê | Nativo | Raster | A camada vira imagem embutida |  |

## Camadas de ajuste

Com máscara, opacidade, máscara de recorte e modo de mesclagem.

| Chave | Otto | PSD | Destino | Vetorial | No SVG e no PDF | Observação |
|---|---|---|---|---|---|---|
| `ajuste:curvas` | Ajuste de curvas | `curv` | Nativo | Omitido | Não vai: o arquivo fica sem o ajuste de cor |  |
| `ajuste:niveis` | Ajuste de níveis | `levl` | Nativo | Omitido | Não vai: o arquivo fica sem o ajuste de cor |  |
| `ajuste:matiz-saturacao` | Ajuste de matiz e saturação | `hue2` | Nativo | Omitido | Não vai: o arquivo fica sem o ajuste de cor | Só o canal principal |
| `ajuste:brilho-contraste` | Ajuste de brilho e contraste | `brit` | Nativo | Omitido | Não vai: o arquivo fica sem o ajuste de cor |  |
| `ajuste:vibracao` | Ajuste de vibração | `vibA` | Nativo | Omitido | Não vai: o arquivo fica sem o ajuste de cor |  |
| `ajuste:equilibrio-de-cor` | Ajuste de equilíbrio de cores | `blnc` | Nativo | Omitido | Não vai: o arquivo fica sem o ajuste de cor |  |
| `ajuste:filtro-de-foto` | Ajuste de filtro de fotografia | `phfl` | Nativo | Omitido | Não vai: o arquivo fica sem o ajuste de cor |  |
| `ajuste:preto-e-branco` | Ajuste de preto e branco | `blwh` | Nativo | Omitido | Não vai: o arquivo fica sem o ajuste de cor | Com os pesos padrão do Photoshop |
| `ajuste:mapa-de-degrade` | Ajuste de mapa de degradê | `grdm` | Nativo | Omitido | Não vai: o arquivo fica sem o ajuste de cor |  |

## Filtros

Filtro só é editável no Photoshop dentro de objeto inteligente. Por isso, em foto ele vira filtro inteligente, e em forma, texto e vetor a camada vira pixel.

| Chave | Otto | PSD | Destino | Vetorial | No SVG e no PDF | Observação |
|---|---|---|---|---|---|---|
| `filtro:desfoque` | Filtro de desfoque, em foto | Filtro inteligente: desfoque gaussiano | Nativo | Raster | A foto vira imagem com o filtro já aplicado | Filtro inteligente está listado como fora da v1 no ADR 028: pede ADR |
| `filtro:desfoque-de-movimento` | Filtro de desfoque de movimento, em foto | Filtro inteligente: desfoque de movimento | Nativo | Raster | A foto vira imagem com o filtro já aplicado | Pede ADR, como o desfoque |
| `filtro:ruido` | Filtro de ruído, em foto | Filtro inteligente: adicionar ruído | Nativo | Raster | A foto vira imagem com o filtro já aplicado | O grão do Photoshop não é o do Otto: ao reaplicar, o desenho do grão muda. Pede ADR |
| `filtro:nitidez` | Filtro de nitidez, em foto | Filtro inteligente: máscara de nitidez | Nativo | Raster | A foto vira imagem com o filtro já aplicado | Pede ADR, como o desfoque |

## O que vira pixel no PSD, com aviso no relatório

| Chave | Otto | PSD | Destino | Vetorial | No SVG e no PDF | Observação |
|---|---|---|---|---|---|---|
| `filtro-fora-de-foto` | Filtro em forma, texto ou vetor | Camada de pixels | Raster | Raster | A camada vira imagem embutida | No Photoshop, filtro editável só existe em objeto inteligente |
| `foto-recortada-com-ajuste-de-cor` | Foto presa por máscara de recorte e com ajuste de cor | Camada de pixels, com o ajuste já aplicado | Raster | Raster | A camada vira imagem embutida | O ajuste não tem como ficar preso só à foto |
| `foto-em-webp` | Foto em WebP | Camada de pixels | Raster | Raster | A foto vira imagem PNG, na resolução do documento | O arquivo original não é embutido |
| `texto-sem-fonte` | Texto cuja fonte não foi entregue | Camada de pixels vazia | Raster | Raster | Imagem vazia | O motor não troca de fonte: a camada sai sem o texto, e o relatório diz qual fonte falta |
| `vetor-fora-do-padrao` | Vetor com caminho que não é só M, C e Z | Camada de pixels | Raster | Raster | A camada vira imagem embutida |  |

## O que só a saída vetorial trata diferente

Recursos que já têm linha acima, e que ganham linha própria porque na saída vetorial o destino muda.

| Chave | Otto | PSD | Destino | Vetorial | No SVG e no PDF | Observação |
|---|---|---|---|---|---|---|
| `mascara-suave-ou-invertida` | Máscara de forma com borda suave ou invertida | Máscara de camada (canal −2) | Nativo | Raster | A camada vira imagem embutida | É a máscara de forma; tem linha própria porque na saída vetorial vira imagem |
| `recorte-em-texto` | Máscara de recorte cuja base é texto, ou uma camada que virou imagem | Recorte (clipping) da camada | Nativo | Raster | A base e as camadas presas a ela viram uma imagem só | Tem linha própria porque na saída vetorial vira imagem |
| `degrade-transparente-no-pdf` | Degradê com parada transparente, no PDF | Camada de preenchimento em degradê (`GdFl`) | Nativo | Raster | Só no PDF: no SVG vai como degradê | É o preenchimento em degradê; tem linha própria porque no PDF vira imagem |

## Bloqueado

Não existe no documento do Otto.

| Chave | Otto | PSD | Destino | Vetorial | No SVG e no PDF | Observação |
|---|---|---|---|---|---|---|
| `modo-dissolver` | Modo dissolver | — | Bloqueado | — | — | O ruído do Photoshop não é reproduzível |
| `chanfro-acetinado-padrao` | Chanfro e entalhe, acetinado, sobreposição de padrão | — | Bloqueado | — | — | Custo de reproduzir no motor |
| `efeito-repetido` | Vários efeitos do mesmo tipo na mesma camada | — | Bloqueado | — | — | Fora da v1 |
| `ajustes-fora-da-lista` | Exposição, inverter, cor seletiva, misturador de canais, pesquisa de cor, limiar, posterizar | — | Bloqueado | — | — | Fora da v1 |
| `texto-em-caminho` | Texto em caminho | — | Bloqueado | — | — | Até um spike provar que abre bem |
| `cor-fora-de-rgb-8-bits` | CMYK, 16 e 32 bits, perfis além de sRGB | — | Bloqueado | — | — | Fora da v1 (ADR 028, item 3) |

## Pede decisão

- **Objeto inteligente e filtro inteligente.** O ADR 028 os lista como fora da v1, e a exportação os usa para foto, como a POC já fazia: a foto original vai embutida e o filtro continua editável. Está mantido como estava e **pede ADR**: ou o ADR 028 passa a aceitá-los, ou a foto volta a ser camada de pixels (e o filtro vira pixel, com aviso). A mesma foto em várias camadas é embutida uma vez só; no Photoshop elas são instâncias do mesmo objeto inteligente.
- **Camada de ajuste na saída vetorial.** Fica de fora (o vetor continua editável e a cor muda). A outra saída possível é achatar em imagem tudo o que está abaixo do ajuste, que mantém a cor e perde o vetor. Está como "fica de fora, com aviso" e **cabe ao Felipe confirmar** depois de ver no Illustrator.
- **Miniatura do PSD.** O arquivo não leva miniatura (a biblioteca só a gera com canvas). O Photoshop não precisa dela; o explorador de arquivos usa a composta.

## Fora da v1

Estilos de camada salvos, canais alfa extras, caminhos salvos fora de máscara, animação e linha do tempo, CMYK, 16 e 32 bits, perfis além de sRGB, sangria e marcas de corte.

## Importação (aceita, ADR 028 item 4)

Ainda não implementada. Tudo que tiver linha **Nativo** acima é lido de volta como nó do Otto. Tudo o mais vira `imagem` com o pixel que o PSD traz, e o relatório de importação lista cada caso. Objeto inteligente vira `imagem` com o pixel renderizado.
