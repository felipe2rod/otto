# Mapeamento Otto → PSD

Dono: especialista-grafico. Decisão em [ADR 028](../decisoes/028-compatibilidade-com-photoshop-psd.md).

Esta tabela é o espelho legível do mapeamento em `packages/psd`. **Nenhum recurso entra no documento do Otto sem linha aqui** (ADR 027, item 6). Os destinos são **Nativo** (editável no Photoshop), **Raster** (rasterizado com aviso no relatório) e **Bloqueado** (não existe no Otto até ter mapeamento).

Todo destino abaixo é **proposta até o spike de saída**. A saída vetorial para o Illustrator (SVG e PDF, [ADR 034](../decisoes/034-exportacao-vetorial-para-illustrator.md)) ganha coluna própria nesta tabela depois do spike. Até lá, vale a previsão do ADR 034, item 2. Onde diz "a verificar", o spike decide.

Referência: *Adobe Photoshop File Formats Specification* (chaves de 4 caracteres entre parênteses).

## Estrutura

| Otto | PSD | Destino | Observação |
|---|---|---|---|
| `documento` | Cabeçalho + recursos de imagem | Nativo | RGB, 8 bits, sRGB embutido. PSB acima de 30.000 px |
| `prancheta` | Grupo com dados de prancheta (`artb`) | Nativo | A verificar: versões antigas do Photoshop abrem prancheta como grupo comum |
| `grupo` | Grupo de camadas (`lsct`) | Nativo | Modo "atravessar" (`pass`) é o padrão de grupo, como no Photoshop |
| `imagem` | Camada de pixels | Nativo | Imagem por hash de conteúdo, gravada na resolução do documento |
| `forma` retângulo e elipse | Camada de preenchimento sólido (`SoCo`) + máscara vetorial (`vmsk`) + dados de forma viva (`vogk`) | Nativo | Cantos arredondados via `vogk`. A verificar |
| `forma` caminho | Preenchimento (`SoCo`) + máscara vetorial (`vmsk`) | Nativo | Curvas de Bézier cúbicas, que é o que o PSD guarda |
| Traço de forma | Dados de traço vetorial (`vstk`) | Nativo | A verificar. Se falhar, vira efeito de traço |
| Preenchimento em degradê | Camada de preenchimento degradê (`GdFl`) | Nativo | Linear e radial. Outros tipos ficam bloqueados |
| `texto` ponto e caixa | Camada de texto (`TySh`, dados do motor de texto) | Nativo | Maior risco. Pixel sempre gravado. Fonte precisa estar instalada para editar |
| Texto em caminho | — | Raster | Até o spike provar o contrário |
| `ajuste` | Camada de ajuste | Nativo | Ver lista abaixo |

## Propriedades de camada

| Otto | PSD | Destino |
|---|---|---|
| Opacidade | Opacidade da camada | Nativo |
| Opacidade de preenchimento | Fill opacity (`iOpa`) | Nativo |
| Visível e bloqueado | Flags da camada, bloqueio (`lspf`) | Nativo |
| Máscara raster | Máscara de camada (canal −2) | Nativo |
| Máscara vetorial | `vmsk` | Nativo |
| Máscara de recorte | Clipping da camada | Nativo |
| Token de cor ou de texto | Valor resolvido | Nativo (a referência se perde, e o relatório lista) |

## Modos de mesclagem

Só entram no Otto os modos do Photoshop, com a fórmula do Photoshop (ADR 030).

| Modo | Chave | Destino | Motor |
|---|---|---|---|
| Normal, multiplicação, tela, sobrepor, escurecer, clarear | `norm` `mul ` `scrn` `over` `dark` `lite` | Nativo | Skia |
| Subexposição e superexposição de cores | `idiv` `div ` | Nativo | Skia |
| Luz suave, luz direta, diferença, exclusão | `sLit` `hLit` `diff` `smud` | Nativo | Skia (a luz suave do Skia difere da do Photoshop: a verificar) |
| Matiz, saturação, cor, luminosidade | `hue ` `sat ` `colr` `lum ` | Nativo | Skia |
| Subexposição e superexposição linear | `lbrn` `lddg` | Nativo | Shader próprio |
| Luz intensa, luz linear, luz do ponto, mistura sólida | `vLit` `lLit` `pLit` `hMix` | Nativo | Shader próprio |
| Cor mais escura, cor mais clara, subtrair, dividir | `dkCl` `lgCl` `fsub` `fdiv` | Nativo | Shader próprio |
| Dissolver | `diss` | Bloqueado | Ruído do Photoshop não é reproduzível |

## Efeitos de camada (`lfx2`)

| Efeito | Destino v1 |
|---|---|
| Sombra projetada, sombra interna | Nativo |
| Brilho externo, brilho interno | Nativo |
| Traço (externo, interno, central; cor sólida) | Nativo |
| Sobreposição de cor, sobreposição de degradê | Nativo |
| Chanfro e entalhe, acetinado, sobreposição de padrão | Bloqueado (custo de reproduzir no motor) |
| Vários efeitos do mesmo tipo na mesma camada | Bloqueado na v1 |

## Camadas de ajuste

| Ajuste | Destino v1 |
|---|---|
| Brilho e contraste, níveis, curvas, matiz e saturação, exposição, vibração | Nativo |
| Preto e branco, filtro de fotografia, inverter, mapa de degradê | Nativo |
| Equilíbrio de cores, cor seletiva, misturador de canais, pesquisa de cor, limiar, posterizar | Bloqueado na v1 |

## Fora da v1

Objeto inteligente, filtros inteligentes, estilos de camada salvos, canais alfa extras, caminhos salvos fora de máscara, animação e linha do tempo, CMYK, 16 e 32 bits, perfis além de sRGB.

## Importação (aceita, ADR 028 item 4)

Tudo que tiver linha **Nativo** acima é lido de volta como nó do Otto. Tudo o mais vira `imagem` com o pixel que o PSD traz, e o relatório de importação lista cada caso. Objeto inteligente vira `imagem` com o pixel renderizado.
