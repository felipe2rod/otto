# @otto/psd

Exportação do documento do Otto para PSD editável (ADR 028): o mapeamento Otto → PSD, o relatório de exportação e a porta `FormatoDeArquivoEmCamadas` (ADR 020). Veio de `poc/src/servidor/psd.ts`. Dono: especialista-grafico.

```bash
docker compose run --rm teste pnpm --filter @otto/psd test
docker compose run --rm teste pnpm --filter @otto/psd typecheck
# o mapeamento mudou de propósito? regenere os goldens e confira o diff da estrutura e do relatório antes de versionar
docker compose run --rm -e ATUALIZAR_GOLDENS=1 teste pnpm --filter @otto/psd test
docker compose run --rm teste pnpm exec biome check --write packages/psd/goldens   # o Biome formata o JSON dos goldens
# PSDs de peças reais (as da POC) para abrir no Photoshop; saem em packages/psd/saida/, fora do git
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
| `adaptadores/biblioteca-de-psd.ts` | O único arquivo que conhece a biblioteca que grava o PSD. Só traduz o modelo da porta |
| `comandos/exportar-pecas.ts` | Exporta peças da POC para a conferência no Photoshop |

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

### Tempo e memória, medidos

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
- **O que nenhum teste prova: que o Photoshop abre e edita.** Não há Photoshop no CI. A cada release que mexe neste pacote, uma pessoa abre os PSDs de `goldens/` e os de `exportar:pecas` no Photoshop e segue `saida/CONFERIR-NO-PHOTOSHOP.txt`. O que falhar muda de linha em `docs/tecnico/psd.md`. **Essa conferência ainda não foi feita nenhuma vez.**

## O que falta

- Perfil sRGB embutido (o ADR 028 pede; o relatório avisa que não vai).
- Miniatura do arquivo.
- Leitura (`ler`) na porta: entra com a importação de PSD.
- Objeto inteligente e filtro inteligente estão em uso para foto, como na POC, e o ADR 028 os lista como fora da v1: **pede ADR**.
- SVG e PDF para o Illustrator (ADR 034): outra fatia.
