# 028 — Compatibilidade com Photoshop: exportar PSD editável é requisito de v1

Status: aceita (exportar e importar PSD, pelo Felipe; importação aceita em 2026-09-26) / proposta (regras de mapeamento e biblioteca)
Data: 2026-09-26
Quem decide: Felipe

## Contexto

O Felipe pediu que a ferramenta seja compatível com o Photoshop para exportar em PSD. O usuário é o designer profissional (ADR 026), que termina, revisa ou entrega em Photoshop. PSD que abre como uma imagem achatada não serve. O que serve é PSD com camadas, grupos, texto editável, formas vetoriais, máscaras e efeitos no lugar certo.

O formato PSD é documentado pela Adobe (*Adobe Photoshop File Formats Specification*), mas vários blocos importantes, como o motor de texto e os efeitos, são estruturas complexas e mal documentadas. Nenhuma biblioteca escreve 100% do formato. Photoshop e Otto também não têm os mesmos recursos.

## Opções consideradas

1. **Exportar PSD achatado ou só com camadas raster.** Fácil, mas inútil para quem vai editar.
2. **Tentar paridade completa com o Photoshop.** Impossível, e seria outra empresa.
3. **Limitar o modelo do Otto ao que o PSD representa, e mapear cada recurso de forma explícita.** Escolhida.

## Decisão

### 1. Regra de ouro: o que o Photoshop não representa, o Otto não tem na v1

O documento do Otto (ADR 027) só aceita recursos com mapeamento declarado. Cada entrada da tabela de mapeamento tem um de três destinos:

| Destino | Significado | Exemplo |
|---|---|---|
| **Nativo** | Vira o recurso equivalente do Photoshop, editável | Grupo, texto, forma, máscara, sombra projetada |
| **Rasterizado com aviso** | Vira camada de pixels com o resultado visual; o relatório de exportação avisa | Texto em caminho curvo, se o spike mostrar que não abre bem |
| **Bloqueado** | Não existe no Otto até ter mapeamento | Modo de mesclagem que o Photoshop não tem |

A tabela completa e viva mora em `docs/tecnico/psd.md` e no código de `packages/psd`. Os dois ficam em sincronia, e é o CI que confere.

### 2. O que a exportação escreve sempre

- **A imagem composta** (merged image) renderizada pelo motor do Otto. Assim qualquer leitor, inclusive visualizador de sistema e Photoshop com fonte ausente, mostra o resultado certo.
- **O pixel de cada camada**, inclusive das camadas de texto e de forma. O Photoshop exibe esses pixels até a pessoa editar a camada.
- **Os dados editáveis** das camadas nativas: motor de texto para texto, preenchimento com máscara vetorial para forma, descritor de efeitos para efeitos.
- **O relatório de exportação**: lista de tudo que foi rasterizado, de toda fonte usada (o Photoshop precisa tê-la instalada para editar o texto) e de todo token resolvido em valor.
- **PSB** automaticamente quando algum lado passar de 30.000 px.

### 3. Escopo de cor da v1

RGB, 8 bits por canal, sRGB embutido. CMYK, 16 bits e outros perfis ficam fora, com gatilho (abaixo).

### 4. Importação

**Aceita pelo Felipe em 2026-09-26:** importar PSD entra na v1 em modo limitado, porque o designer vai querer abrir no Otto o arquivo que já tem. Tudo que chegar sem mapeamento vira camada raster (o PSD sempre traz o pixel da camada) e aparece num relatório de importação. Texto importado só vira texto editável se a fonte estiver na conta. Se não estiver, vira raster e o relatório diz qual fonte falta.

### 5. Biblioteca atrás de porta

- A leitura e a escrita ficam atrás da porta `FormatoDeArquivoEmCamadas` (ADR 020). O núcleo não conhece a biblioteca.
- Candidata para o adaptador: **ag-psd** (TypeScript, leitura e escrita, roda em navegador e Node). Licença, suporte a texto, efeitos, camadas de ajuste e PSB são **a verificar no spike**, não fatos.
- Para conferência no CI, uma segunda leitura independente (ex.: `psd-tools` em Python) abre o arquivo exportado. Se duas bibliotecas diferentes concordam na estrutura, o arquivo provavelmente está bem formado.

### 6. Como se prova que funciona

- **CI:** cada tipo de nó tem um documento de teste (golden). O teste exporta, relê com a segunda biblioteca, compara a estrutura (árvore de camadas, nomes, modos, opacidade, texto) e compara a imagem composta com o render do Otto (diferença perceptual abaixo de um limite).
- **Manual, a cada release que mexe em `packages/psd`:** uma pessoa abre os goldens no Photoshop, edita um texto, move uma forma e liga e desliga um efeito, e registra o resultado. Não existe Photoshop em CI. Esse passo é inevitável e fica escrito como tal.

## Consequências

- O conjunto de modos de mesclagem e de efeitos do Otto é, de propósito, um subconjunto do Photoshop. O motor de renderização (ADR 030) precisa implementar os modos do Photoshop com a mesma fórmula, inclusive os que o Skia não tem prontos (luz intensa, luz linear, luz pontual, mistura sólida, cor mais escura, cor mais clara, subtrair e dividir).
- O texto é a parte de maior risco: quebra de linha, kerning e entrelinha do Otto precisam bater com os do Photoshop, ou o texto "pula" quando o designer clica nele. O spike mede isso primeiro.
- O agente sabe dos limites: a ferramenta `exportar` devolve o relatório, e o agente avisa o designer do que foi rasterizado.

## Evidência comportamental (fichas)

- **"Designer aceita que a camada de texto pule um pouco ao editar no Photoshop."** Tipo: tolerância a defeito. Grau: **hipótese fraca**. Comparável: exportações de Figma para PSD por plugin, com reclamação comum de texto deslocado. A analogia é forte, porque o defeito é o mesmo. **O que mata:** designers de teste apontam texto deslocado como motivo para parar de exportar.

## Gatilho de revisão

- Se o spike não produzir texto editável que abra no Photoshop com deslocamento menor que 1 px na primeira linha em pelo menos 3 fontes comuns, o texto nativo sai da v1 e vira "rasterizado com aviso" até resolver.
- CMYK e 16 bits entram quando 3 contas pedirem saída para impressão e o relatório mostrar exportações abandonadas por isso.
- Se a biblioteca escolhida não escrever algum recurso marcado "nativo", ele cai para "rasterizado com aviso" até existir adaptador que escreva.
