# @otto/psd

Exportação do documento do Otto para PSD editável (ADR 028) e para SVG e PDF editáveis (ADR 034, para o Illustrator): o mapeamento, o relatório de exportação e a porta `FormatoDeArquivoEmCamadas` (ADR 020), com três adaptadores. O PSD veio de `poc/src/servidor/psd.ts`. Dono: especialista-grafico.

O nome do pacote ficou "psd" por história: ele é o pacote de saída em arquivo em camadas, nos três formatos.

```bash
docker compose run --rm teste pnpm --filter @otto/psd test
docker compose run --rm teste pnpm --filter @otto/psd typecheck
# o mapeamento mudou de propósito? regenere os goldens e confira o diff da estrutura e do relatório antes de versionar
docker compose run --rm -e ATUALIZAR_GOLDENS=1 teste pnpm --filter @otto/psd test
docker compose run --rm teste pnpm exec biome check --write packages/psd/goldens   # o Biome formata o JSON dos goldens
# PSD, SVG e PDF de peças reais (as da POC) para abrir no Photoshop e no Illustrator; saem em packages/psd/saida/, fora do git
docker compose run --rm teste pnpm --filter @otto/psd exportar:pecas
```

## Como se organiza

| Arquivo | O que faz |
|---|---|
| `porta.ts` | `FormatoDeArquivoEmCamadas` e o modelo que atravessa por ela: camadas, máscaras, efeitos e texto como o Photoshop os entende, sem nenhum tipo de biblioteca |
| `mapeamento.ts` | A tabela Otto → PSD em código. Espelho de `docs/tecnico/psd.md`; o teste confere as duas |
| `montar.ts` | O mapeamento em ação: do documento para as camadas do arquivo e para o relatório. Não toca em pixel |
| `relatorio.ts` | O relatório: tipos, avisos e a versão em texto |
| `exportar.ts` | `exportarPsd`, `exportarPng`, `relatorioDeExportacao`: junta o mapeamento, o render de referência em CPU e a porta |
| `adaptadores/biblioteca-de-psd.ts` | O único arquivo que conhece a biblioteca que grava o PSD. Só traduz o modelo da porta. O perfil sRGB entra aqui, direto nos bytes (a biblioteca não o grava) |
| `perfil-srgb.ts` | O perfil ICC sRGB, gerado aqui (2,5 KB), para o PSD e para o PDF |
| `montar-vetorial.ts` | O mapeamento vetorial em ação: o que sai em vetor, o que vira imagem e o que fica de fora, e o relatório |
| `exportar-vetorial.ts` | `exportarVetorial`, `relatorioDeExportacaoVetorial`: junta o mapeamento vetorial, o motor (quebra de linha do texto, imagens) e a porta |
| `adaptadores/svg.ts` | O SVG, escrito aqui, sem biblioteca |
| `adaptadores/biblioteca-de-pdf.ts` | O único arquivo que conhece a biblioteca de PDF. As camadas do PDF são montadas com os objetos de baixo nível dela |
| `comandos/exportar-pecas.ts` | Exporta peças da POC para a conferência no Photoshop e no Illustrator |

Nada entra no documento sem linha em `mapeamento.ts`: cada parte da tabela é um `Record` sobre o tipo do esquema, e um recurso novo em `@otto/documento` quebra o `typecheck` daqui até ser mapeado.

## Para a fila de exportação

```ts
import { carregarCanvasKit } from '@otto/render/node';
import { criarFormatoPsd, exportarPng, exportarPsd, relatorioDeExportacao, relatorioEmTexto } from '@otto/psd';

const ck = await carregarCanvasKit();          // uma instância por processo
const formato = criarFormatoPsd();             // FormatoDeArquivoEmCamadas

const { arquivos, relatorio } = await exportarPsd(ck, formato, doc, recursos, {
  nome,                                        // nome da peça: vira nome de arquivo
  pranchetas,                                  // ids; sem isto, todas
  arquivos: 'por-prancheta',                   // ou 'juntas': um arquivo só, cada prancheta como prancheta do Photoshop
  entreEtapas: () => new Promise((ok) => setImmediate(ok)),
});
// arquivos: { nome: string; bytes: Uint8Array }[]  (".psd"; ".psb" quando um lado passa de 30.000 px)

const png = await exportarPng(ck, doc, recursos, { nome, pranchetas, escala: 1, semFundo: false });

// sem renderizar e sem bytes: só com o que a API sabe dos recursos
const previsto = relatorioDeExportacao(doc, { fontes, imagens }, { pranchetas, arquivos: 'por-prancheta' });
```

- `recursos` é `{ fontes: { familia, peso, bytes, postScript?, arquivo? }[], imagens: { arquivo, bytes, tipo? }[] }`. As imagens são as fotos do documento **e as máscaras de sujeito**, pela chave do documento (sha256). Quem confere a conta dona de cada arquivo é quem chama. O que não for entregue não derruba a exportação: aparece em `relatorio.emFalta`, a foto sai como retângulo cinza e o texto sai vazio.
- `relatorioDeExportacao` recebe `{ fontes: { familia, peso, postScript, arquivo? }[], imagens: { arquivo, tipo }[] }` e roda o mesmo código que monta o arquivo. O teste garante que ele é igual ao relatório que `exportarPsd` devolve, fora a lista de arquivos. Custa de 1 a 6 ms.
- A exportação cria e destrói a própria sessão de render. É trabalho de CPU, síncrono entre uma etapa e outra: `entreEtapas` é chamada antes de montar e antes de compor cada prancheta, para o processo responder ao sinal de vida. Dentro de uma prancheta não há pausa.
- Empacotar (zip) e guardar é de quem chama. `relatorioEmTexto(nome, relatorio)` dá o relatório em markdown para ir junto.
- `relatorio.avisos[].texto` e `relatorio.camadas[].observacao` são texto que o designer lê, escrito aqui em português. **Não passaram pelo guardião da marca.** Cada aviso tem `codigo`, para a interface poder trocar a frase.

### Saída vetorial (SVG e PDF)

```ts
import { criarFormatoPdf, criarFormatoSvg, exportarVetorial, relatorioDeExportacaoVetorial } from '@otto/psd';

const svg = await exportarVetorial(ck, criarFormatoSvg(), doc, recursos, { nome, pranchetas, escalaDaImagem: 2, entreEtapas });
// svg.arquivos: um ".svg" por prancheta
const pdf = await exportarVetorial(ck, criarFormatoPdf(), doc, recursos, { nome, pranchetas, arquivos: 'juntas' });
// pdf.arquivos: um ".pdf" com uma página por prancheta ('por-prancheta' dá um arquivo por prancheta)
const previsto = relatorioDeExportacaoVetorial(doc, { fontes, imagens }, { pranchetas, formato: 'pdf' });
```

- `recursos` é o mesmo do PSD. O relatório é `RelatorioDeExportacaoVetorial`: a mesma forma do relatório do PSD, com um destino a mais nas camadas (`'omitido-com-aviso'`) e os códigos de aviso próprios (`CodigoDeAvisoVetorial`). Os tipos do relatório do PSD não mudaram.
- `relatorioDeExportacaoVetorial` sai sem renderizar, e o teste garante que é igual ao que a exportação devolve. No PDF passe `formato: 'pdf'`: degradê com parada transparente vira imagem só nele.
- `escalaDaImagem` (padrão 2) é a resolução das camadas que viram imagem. É o que mais pesa no tempo e na memória.
- A porta agora admite `escrever` assíncrono (a biblioteca de PDF é) e o formato declara `capacidades` (páginas, degradê transparente). `exportarPsd` não mudou de assinatura.

Medido nas cinco peças de `exportar:pecas` (1080 px, uma ou duas pranchetas): SVG de 5,8 a 7 s, e 29,5 s na peça com desfoque de movimento; PDF de 7,3 a 10,4 s, e 31 s na mesma peça. Arquivos de 1,8 a 12,9 MB. A memória do processo passou de 1 GB ao exportar PSD, PNG, SVG e PDF das cinco peças em seguida: a imagem em escala 2 tem quatro vezes os pixels.

### Tempo e memória do PSD, medidos

Nas 48 peças da POC que o esquema aceita (1 a 5 pranchetas de 1080 px, 2 a 41 camadas), numa instância do motor, no contêiner de desenvolvimento, em 2026-10-01:

| | |
|---|---|
| `exportarPsd`, um arquivo por prancheta | mediana 1,1 s; 90% até 3,8 s; a pior, 13,7 s |
| `exportarPng` | parecido com o PSD: de 0,2 a 7,8 s (o render e a compressão do PNG) |
| `relatorioDeExportacao` | 1 a 6 ms |
| Tamanho dos arquivos de uma peça | de 0,3 a 32 MB (mediana perto de 9 MB) |
| Memória do processo | sobe a cada peça e estaciona entre 400 e 520 MB (a memória do WebAssembly não volta ao sistema) |

A pior peça tem desfoque de movimento de 100 px numa foto de 900 × 600: o laço de pixel custa de 1 a 3 s por render, e a camada é renderizada duas vezes (na composta e no pixel dela). Em geral o PSD custa perto de duas vezes o render da composta.

## Como se prova

- **Goldens** (`goldens/`): sete cenas, uma por tipo de nó e uma peça com duas pranchetas. Cada uma é exportada, relida por uma **segunda biblioteca**, independente da que grava (`@webtoon/psd`), e comparada em três coisas: os bytes do arquivo (exportar duas vezes dá o mesmo arquivo), a estrutura que a segunda biblioteca enxerga (`<cena>.estrutura.json`: nomes, grupos, opacidade, modo, recorte, área do pixel, texto, máscara e os blocos de cada camada) e a **composta contra o render de referência do Otto, sem um pixel de diferença**. O relatório de cada cena também é golden (`<cena>.relatorio.json`).
- **O adaptador contra a própria biblioteca** (`adaptadores/biblioteca-de-psd.test.ts`): os dados editáveis de cada camada relidos, com os valores do documento (fonte PostScript, caixa e transformação do texto, trechos, nós do caminho, efeitos e modos, ajustes, objeto inteligente, filtros inteligentes, pranchetas, PSB).
- **O pixel de cada camada**: as camadas lidas pela segunda biblioteca, empilhadas, refazem a composta a 2 níveis; a máscara gravada é a cobertura que o motor usa.
- **O perfil sRGB**: a segunda biblioteca o lê inteiro de cada PSD. O perfil em si foi conferido uma vez, à mão, contra o sRGB do LittleCMS (pelo Pillow): converter 6088 cores de um para o outro dá diferença máxima de 1 nível.
- **SVG** (`vetorial.test.ts`): relido por um analisador de XML independente (ids, `<text>` com as linhas e os pedaços, imagem embutida, recortes, degradês) e **desenhado por um renderizador de SVG independente** (`@resvg/resvg-js`), comparado com o render do Otto: menos de 1% a 5% dos pixels a mais de 24 níveis, conforme a cena (a borda suavizada e o texto, que cada renderizador faz do seu jeito). Goldens: os `.svg` de cada cena.
- **PDF** (`pdf.test.ts`): aberto por um leitor de PDF independente (`pdfjs-dist`), que dá as páginas, as camadas com os nomes, o texto extraído, e **desenha a página** (com `@napi-rs/canvas`), comparada com o render do Otto pelo mesmo critério. A fonte embutida, descomprimida, é o arquivo original byte a byte. Goldens: os `.pdf` de cada cena. O leitor não monta a árvore de camada dentro de camada; a árvore é conferida nos bytes do arquivo.
- **O que nenhum teste prova: que o Photoshop e o Illustrator abrem e editam.** Não há Photoshop nem Illustrator no CI. A cada release que mexe neste pacote, uma pessoa abre os arquivos de `goldens/` e os de `exportar:pecas` e segue `saida/CONFERIR-NO-PHOTOSHOP.txt` e `saida/CONFERIR-NO-ILLUSTRATOR.txt`. O que falhar muda de linha em `docs/tecnico/psd.md`. **Essas conferências ainda não foram feitas nenhuma vez.**

## O que falta

- Miniatura do PSD.
- Leitura (`ler`) na porta: entra com a importação de PSD.
- Objeto inteligente e filtro inteligente estão em uso para foto, como na POC, e o ADR 028 os lista como fora da v1: **pede ADR**.
- Na saída vetorial: camada de ajuste fica de fora e a cor muda (em peça que depende de duotone por ajuste, muda muito); recorte com base em texto vira imagem (o SVG e o PDF têm recorte por texto, falta ver se o Illustrator o abre editável); a mesma foto em várias camadas é embutida uma vez no PDF e uma vez por camada no SVG; o PDF não leva kerning (as letras vão no avanço da fonte), e o Illustrator refaz o texto com o dele.
- A biblioteca de PDF só lê camadas; a criação delas é nossa, com os objetos de baixo nível. Se o Illustrator não as reconhecer, o nome das camadas no Illustrator fica só no SVG.
