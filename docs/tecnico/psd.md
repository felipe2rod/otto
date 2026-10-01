# Mapeamento Otto → PSD

Dono: especialista-grafico. Decisão em [ADR 028](../decisoes/028-compatibilidade-com-photoshop-psd.md).

Esta tabela é o espelho legível do mapeamento em `packages/psd/src/mapeamento.ts`. **Nenhum recurso entra no documento do Otto sem linha aqui** (ADR 027, item 6). Os destinos são **Nativo** (vira o recurso equivalente do Photoshop), **Raster** (vira camada de pixels, e o relatório de exportação avisa) e **Bloqueado** (não existe no Otto até ter mapeamento).

**Como as duas ficam em sincronia.** Toda linha que começa por uma chave entre crases é conferida pelo teste `packages/psd/src/mapeamento.test.ts`: a linha daqui tem de ser igual à do código, e não pode haver chave aqui que o código não tenha. Do outro lado, cada parte da tabela em código é um `Record` sobre o tipo do esquema de `@otto/documento`: um modo de mesclagem, ajuste, filtro, efeito, máscara ou tipo de nó novo quebra o `typecheck` de `packages/psd` até ganhar linha. Para mudar o mapeamento, mude o código e copie a linha que o teste mostrar.

**Estado (2026-10-01).** A exportação está implementada em `packages/psd` e é conferida por golden: o arquivo é relido por uma segunda biblioteca, independente da que grava. **Nenhuma linha abaixo foi conferida no Photoshop ainda.** "Nativo" quer dizer que o arquivo carrega o recurso editável e que duas bibliotecas concordam que ele está lá. Se o Photoshop o abre editável, e com a mesma aparência, é a conferência manual do ADR 028, item 6, que diz. O que cair nela muda de linha aqui.

A saída vetorial para o Illustrator (SVG e PDF, [ADR 034](../decisoes/034-exportacao-vetorial-para-illustrator.md)) ganha coluna própria depois do spike dela.

Referência: *Adobe Photoshop File Formats Specification* (chaves de 4 caracteres entre crases na coluna PSD).

## O que todo arquivo leva

- **A imagem composta**, do render de referência em CPU. Qualquer leitor mostra o resultado certo, mesmo sem as fontes.
- **O pixel de cada camada**, inclusive texto e forma, sem opacidade, modo, máscara nem efeitos (esses ficam na camada). A área gravada é a que a camada ocupa dentro da prancheta.
- **Os dados editáveis** de cada camada nativa.
- **O relatório**: como cada camada saiu e por quê, fontes a instalar, pesos de fonte trocados, fonte e imagem não encontradas, tokens resolvidos, origem e licença das imagens.

A ordem em que a camada é montada é a do Photoshop, e o motor desenha na mesma ordem: conteúdo, filtros, máscara, efeitos (a sombra e o brilho contornam o que a máscara deixou), opacidade e modo.

## Estrutura

| Chave | Otto | PSD | Destino | Observação |
|---|---|---|---|---|
| `documento` | Documento | Cabeçalho do arquivo | Nativo | RGB, 8 bits. PSB quando um lado passa de 30.000 px. Ainda sem perfil sRGB embutido |
| `prancheta` | Prancheta | Um arquivo por prancheta; no arquivo com todas, grupo com dados de prancheta (`artb`) | Nativo |  |
| `fundo-da-prancheta` | Fundo da prancheta | Camada de preenchimento sólido (`SoCo`) | Nativo |  |
| `no:grupo` | Grupo | Grupo de camadas (`lsct`) | Nativo | O modo "atravessar" é o padrão de grupo, como no Photoshop |
| `no:forma` | Forma: retângulo (com raio) e elipse | Camada de preenchimento (`SoCo` ou `GdFl`) com máscara vetorial (`vmsk`) | Nativo | O raio vai como curva no caminho; não grava os dados de forma viva (`vogk`) |
| `no:texto` | Texto em caixa | Camada de texto (`TySh`) | Nativo | Maior risco. A fonte precisa estar instalada para editar; o pixel vai junto |
| `no:imagem` | Foto | Objeto inteligente (`SoLd`) com o arquivo original embutido (`lnk2`), e o corte da caixa como máscara vetorial | Nativo | Só PNG e JPEG são embutidos. Objeto inteligente está listado como fora da v1 no ADR 028: pede ADR |
| `no:vetor` | Vetor (logo, ícone, forma livre) | Grupo com uma camada de forma por caminho (`SoCo` + `vmsk`) | Nativo | Só caminhos com M, C e Z |
| `no:ajuste` | Camada de ajuste | Camada de ajuste | Nativo | Um tipo por linha, abaixo |

## Conteúdo das camadas

| Chave | Otto | PSD | Destino | Observação |
|---|---|---|---|---|
| `preenchimento-em-degrade` | Preenchimento em degradê (linear e radial) | Camada de preenchimento em degradê (`GdFl`) | Nativo |  |
| `traco-de-vetor` | Traço de caminho de vetor | Traçado vetorial (`vstk`) | Nativo | Centralizado no caminho |
| `trechos-de-texto` | Trechos de texto com estilo próprio | Estilos por sequência de caracteres, no `TySh` | Nativo |  |
| `caixa-alta-e-versalete` | Caixa alta e versalete | Atributo de caixa do caractere, no `TySh` | Nativo |  |
| `ajuste-de-cor-da-foto` | Ajuste de cor da foto (brilho, contraste, saturação, duotone) | Camadas de ajuste presas à foto por máscara de recorte | Nativo | Aproximação: o Photoshop recalcula com a fórmula dele |

## Propriedades de camada

| Chave | Otto | PSD | Destino | Observação |
|---|---|---|---|---|
| `opacidade` | Opacidade | Opacidade da camada | Nativo |  |
| `visivel-e-bloqueado` | Visível e bloqueado | Flags da camada e bloqueio (`lspf`) | Nativo |  |
| `rotacao` | Rotação | Na geometria: caminho girado, transformação do texto e do objeto inteligente | Nativo |  |
| `recorte-da-foto` | Recorte da foto em forma | Máscara vetorial (`vmsk`) | Nativo |  |
| `recortada-na-de-baixo` | Máscara de recorte na camada de baixo | Recorte (clipping) da camada | Nativo |  |
| `token` | Token de cor | Valor resolvido | Nativo | A referência se perde; o relatório lista cada token |
| `mascara:degrade` | Máscara em degradê | Máscara de camada (canal −2) | Nativo | Vai como pixels: no Photoshop não é mais um degradê editável |
| `mascara:forma` | Máscara de forma (suave, invertida) | Máscara de camada (canal −2) | Nativo | Vai como pixels, por causa da borda suave |
| `mascara:sujeito` | Máscara do sujeito da foto | Máscara de camada (canal −2) | Nativo |  |

## Modos de mesclagem

Só entram no Otto os modos do Photoshop, com a fórmula do Photoshop (ADR 030). Os que o Skia não tem prontos são calculados pelo motor (shader na GPU, laço de pixel na CPU).

| Chave | Otto | PSD | Destino | Observação |
|---|---|---|---|---|
| `modo:atravessar` | Modo atravessar (só em grupo) | `pass` | Nativo |  |
| `modo:normal` | Modo normal | `norm` | Nativo |  |
| `modo:escurecer` | Modo escurecer | `dark` | Nativo |  |
| `modo:multiplicacao` | Modo multiplicação | `mul ` | Nativo |  |
| `modo:subexposicao-de-cores` | Modo subexposição de cores | `idiv` | Nativo |  |
| `modo:subexposicao-linear` | Modo subexposição linear | `lbrn` | Nativo |  |
| `modo:cor-mais-escura` | Modo cor mais escura | `dkCl` | Nativo |  |
| `modo:clarear` | Modo clarear | `lite` | Nativo |  |
| `modo:tela` | Modo tela | `scrn` | Nativo |  |
| `modo:superexposicao-de-cores` | Modo superexposição de cores | `div ` | Nativo |  |
| `modo:superexposicao-linear` | Modo superexposição linear | `lddg` | Nativo |  |
| `modo:cor-mais-clara` | Modo cor mais clara | `lgCl` | Nativo |  |
| `modo:sobrepor` | Modo sobrepor | `over` | Nativo |  |
| `modo:luz-suave` | Modo luz suave | `sLit` | Nativo | O motor usa a fórmula do W3C; a do Photoshop difere um pouco nos tons escuros |
| `modo:luz-direta` | Modo luz direta | `hLit` | Nativo |  |
| `modo:luz-intensa` | Modo luz intensa | `vLit` | Nativo |  |
| `modo:luz-linear` | Modo luz linear | `lLit` | Nativo |  |
| `modo:luz-do-ponto` | Modo luz do ponto | `pLit` | Nativo |  |
| `modo:mistura-solida` | Modo mistura sólida | `hMix` | Nativo |  |
| `modo:diferenca` | Modo diferença | `diff` | Nativo |  |
| `modo:exclusao` | Modo exclusão | `smud` | Nativo |  |
| `modo:subtrair` | Modo subtrair | `fsub` | Nativo |  |
| `modo:dividir` | Modo dividir | `fdiv` | Nativo |  |
| `modo:matiz` | Modo matiz | `hue ` | Nativo |  |
| `modo:saturacao` | Modo saturação | `sat ` | Nativo |  |
| `modo:cor` | Modo cor | `colr` | Nativo |  |
| `modo:luminosidade` | Modo luminosidade | `lum ` | Nativo |  |

## Efeitos de camada

Cada efeito, no máximo uma vez por camada. O tamanho de sombra e de brilho é o "tamanho" do Photoshop; o motor desenha com desfoque gaussiano de desvio padrão igual à metade dele. **A equivalência entre os dois é o que mais precisa de conferência no Photoshop.**

| Chave | Otto | PSD | Destino | Observação |
|---|---|---|---|---|
| `efeito:sombra` | Sombra projetada | Efeito de camada (`lfx2`): sombra projetada | Nativo | Gravada com modo normal, como o motor desenha (o padrão do Photoshop é multiplicação) |
| `efeito:traco` | Traço da forma | Efeito de camada (`lfx2`): traço interno de cor sólida | Nativo |  |
| `efeito:sombraInterna` | Sombra interna | Efeito de camada (`lfx2`): sombra interna | Nativo | Modo multiplicação |
| `efeito:brilhoExterno` | Brilho externo | Efeito de camada (`lfx2`): brilho externo | Nativo | Gravado com modo normal, como o motor desenha (o padrão do Photoshop é tela) |
| `efeito:brilhoInterno` | Brilho interno | Efeito de camada (`lfx2`): brilho interno, a partir da borda | Nativo | Modo tela |
| `efeito:sobreposicaoDeCor` | Sobreposição de cor | Efeito de camada (`lfx2`): sobreposição de cor | Nativo |  |
| `efeito:sobreposicaoDeDegrade` | Sobreposição de degradê | Efeito de camada (`lfx2`): sobreposição de degradê | Nativo |  |

## Camadas de ajuste

Com máscara, opacidade, máscara de recorte e modo de mesclagem.

| Chave | Otto | PSD | Destino | Observação |
|---|---|---|---|---|
| `ajuste:curvas` | Ajuste de curvas | `curv` | Nativo |  |
| `ajuste:niveis` | Ajuste de níveis | `levl` | Nativo |  |
| `ajuste:matiz-saturacao` | Ajuste de matiz e saturação | `hue2` | Nativo | Só o canal principal |
| `ajuste:brilho-contraste` | Ajuste de brilho e contraste | `brit` | Nativo |  |
| `ajuste:vibracao` | Ajuste de vibração | `vibA` | Nativo |  |
| `ajuste:equilibrio-de-cor` | Ajuste de equilíbrio de cores | `blnc` | Nativo |  |
| `ajuste:filtro-de-foto` | Ajuste de filtro de fotografia | `phfl` | Nativo |  |
| `ajuste:preto-e-branco` | Ajuste de preto e branco | `blwh` | Nativo | Com os pesos padrão do Photoshop |
| `ajuste:mapa-de-degrade` | Ajuste de mapa de degradê | `grdm` | Nativo |  |

## Filtros

Filtro só é editável no Photoshop dentro de objeto inteligente. Por isso, em foto ele vira filtro inteligente, e em forma, texto e vetor a camada vira pixel.

| Chave | Otto | PSD | Destino | Observação |
|---|---|---|---|---|
| `filtro:desfoque` | Filtro de desfoque, em foto | Filtro inteligente: desfoque gaussiano | Nativo | Filtro inteligente está listado como fora da v1 no ADR 028: pede ADR |
| `filtro:desfoque-de-movimento` | Filtro de desfoque de movimento, em foto | Filtro inteligente: desfoque de movimento | Nativo | Pede ADR, como o desfoque |
| `filtro:ruido` | Filtro de ruído, em foto | Filtro inteligente: adicionar ruído | Nativo | O grão do Photoshop não é o do Otto: ao reaplicar, o desenho do grão muda. Pede ADR |
| `filtro:nitidez` | Filtro de nitidez, em foto | Filtro inteligente: máscara de nitidez | Nativo | Pede ADR, como o desfoque |

## O que vira pixel, com aviso no relatório

| Chave | Otto | PSD | Destino | Observação |
|---|---|---|---|---|
| `filtro-fora-de-foto` | Filtro em forma, texto ou vetor | Camada de pixels | Raster | No Photoshop, filtro editável só existe em objeto inteligente |
| `foto-recortada-com-ajuste-de-cor` | Foto presa por máscara de recorte e com ajuste de cor | Camada de pixels, com o ajuste já aplicado | Raster | O ajuste não tem como ficar preso só à foto |
| `foto-em-webp` | Foto em WebP | Camada de pixels | Raster | O arquivo original não é embutido |
| `texto-sem-fonte` | Texto cuja fonte não foi entregue | Camada de pixels vazia | Raster | O motor não troca de fonte: a camada sai sem o texto, e o relatório diz qual fonte falta |
| `vetor-fora-do-padrao` | Vetor com caminho que não é só M, C e Z | Camada de pixels | Raster |  |

## Bloqueado

Não existe no documento do Otto.

| Chave | Otto | PSD | Destino | Observação |
|---|---|---|---|---|
| `modo-dissolver` | Modo dissolver | — | Bloqueado | O ruído do Photoshop não é reproduzível |
| `chanfro-acetinado-padrao` | Chanfro e entalhe, acetinado, sobreposição de padrão | — | Bloqueado | Custo de reproduzir no motor |
| `efeito-repetido` | Vários efeitos do mesmo tipo na mesma camada | — | Bloqueado | Fora da v1 |
| `ajustes-fora-da-lista` | Exposição, inverter, cor seletiva, misturador de canais, pesquisa de cor, limiar, posterizar | — | Bloqueado | Fora da v1 |
| `texto-em-caminho` | Texto em caminho | — | Bloqueado | Até um spike provar que abre bem |
| `cor-fora-de-rgb-8-bits` | CMYK, 16 e 32 bits, perfis além de sRGB | — | Bloqueado | Fora da v1 (ADR 028, item 3) |

## Pede decisão

- **Objeto inteligente e filtro inteligente.** O ADR 028 os lista como fora da v1, e a exportação os usa para foto, como a POC já fazia: a foto original vai embutida e o filtro continua editável. Está mantido como estava e **pede ADR**: ou o ADR 028 passa a aceitá-los, ou a foto volta a ser camada de pixels (e o filtro vira pixel, com aviso). A mesma foto em várias camadas é embutida uma vez só; no Photoshop elas são instâncias do mesmo objeto inteligente.
- **Perfil de cor.** O arquivo sai em RGB de 8 bits sem perfil sRGB embutido (o ADR 028, item 3, pede o perfil). Falta embutir o perfil ICC; até lá o relatório avisa.
- **Miniatura.** O arquivo não leva miniatura (a biblioteca só a gera com canvas). O Photoshop não precisa dela; o explorador de arquivos usa a composta.

## Fora da v1

Estilos de camada salvos, canais alfa extras, caminhos salvos fora de máscara, animação e linha do tempo, CMYK, 16 e 32 bits, perfis além de sRGB.

## Importação (aceita, ADR 028 item 4)

Ainda não implementada. Tudo que tiver linha **Nativo** acima é lido de volta como nó do Otto. Tudo o mais vira `imagem` com o pixel que o PSD traz, e o relatório de importação lista cada caso. Objeto inteligente vira `imagem` com o pixel renderizado.
