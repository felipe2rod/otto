# 034 — Exportação vetorial para o Illustrator na v1: SVG e PDF editáveis

Status: aceita (entrar na v1, pelo Felipe) / proposta (formatos, mapeamento e biblioteca)
Data: 2026-09-26
Quem decide: Felipe

## Contexto

O Felipe observou que os profissionais trabalham hoje sobretudo em **Photoshop ou Illustrator**, e decidiu em 2026-09-26 que a saída para o Illustrator entra na v1. O ADR 028 cobre só o Photoshop (PSD). Como o documento do Otto guarda forma e texto como vetor (ADR 027), a saída vetorial é natural. Mas o Illustrator não entende o documento do Otto, e o PSD leva forma como máscara vetorial dentro de camada, que não é o jeito de trabalhar no Illustrator.

## Opções consideradas

1. **Escrever `.ai` nativo.** O formato atual é PDF com dados privados da Adobe, sem especificação pública. Recusado: não dá para escrever com segurança.
2. **Mandar o designer abrir o PSD no Illustrator.** O Illustrator importa PSD, mas trata camada como imagem. Recusado: perde o vetor.
3. **Exportar SVG e PDF**, os dois formatos abertos que o Illustrator abre como vetor editável. Escolhido.

## Decisão

### 1. Dois formatos

| Formato | Para quê | Observação |
|---|---|---|
| **SVG** | Peça de tela (social, web), ícone, logo | Grupos com o nome da camada (`id`), texto como `<text>`, imagem embutida |
| **PDF** | Entrega e impressão, abrir no Illustrator | Camadas do PDF (conteúdo opcional) com o nome das camadas do Otto, texto como texto com a fonte embutida, uma página por prancheta |

### 2. Mesmo princípio do PSD: mapeamento declarado e relatório

- Todo recurso do documento ganha, além da linha do PSD (ADR 028), uma linha de **destino vetorial**: Nativo (vetor editável), Raster (vira imagem embutida, com aviso) ou Omitido (com aviso).
- **O Illustrator não restringe o modelo do Otto.** A regra de ouro do ADR 028 ("o que o Photoshop não representa, o Otto não tem") continua sendo a que limita o documento. Na saída vetorial, o que não tem equivalente é rasterizado com aviso, e não bloqueado.
- Previsão, a verificar no spike: forma, caminho, traço, preenchimento sólido e degradê linear/radial, grupo, máscara de recorte e texto são **Nativo**. Efeitos de camada (sombra, brilho), camadas de ajuste e modos de mesclagem além de normal e multiplicação provavelmente viram **Raster** daquela camada.
- O relatório de exportação é o mesmo do ADR 028: o que foi rasterizado, as fontes usadas e os tokens resolvidos.

### 3. Texto

É o risco principal, como no PSD. PDF gerado fora da Adobe costuma abrir no Illustrator com o texto quebrado em pedaços (linha por linha ou letra por letra). O spike mede isso. Se quebrar, o texto sai como **uma caixa de texto por parágrafo**, posicionado, e o relatório avisa que o fluxo de texto não é contínuo.

### 4. Biblioteca atrás de porta

- Mesma porta do PSD, `FormatoDeArquivoEmCamadas` (ADR 020), com um adaptador SVG (escrito por nós, formato simples) e um adaptador PDF.
- Candidatas para PDF, **a verificar**: o módulo de PDF do Skia (se o CanvasKit usado incluir, o que garante o mesmo desenho do render, ADR 030) ou uma biblioteca de PDF em Node.
- Conferência no CI: o SVG é relido e comparado estruturalmente, e o PDF é rasterizado e comparado com o render do Otto. **A conferência manual no Illustrator** a cada release que mexe nisso é inevitável, como a do Photoshop.

### 5. Fora da v1

Importar SVG, PDF ou `.ai`; CMYK e cores especiais (Pantone); sangria e marcas de corte. Estes três últimos entram junto com o gatilho de impressão do ADR 028.

## Consequências

- O spike de PSD (visão, "Primeira entrega técnica") passa a ser **spike de saída**: o mesmo documento de teste exporta PSD, SVG e PDF, e é aberto no Photoshop e no Illustrator.
- `docs/tecnico/psd.md` ganha a coluna de destino vetorial (dono: especialista-grafico).
- O especialista-grafico passa a ser dono também da saída vetorial.

## Evidência comportamental (fichas)

- **"Profissional que termina no Illustrator aceita PDF/SVG em vez de `.ai`."** Tipo: aceitação de formato. Grau: **hipótese**, sustentada pela observação do Felipe e pela prática comum de entregar PDF. **O que mata:** designers de teste pedem `.ai` explicitamente, ou dizem que o arquivo abre "bagunçado" no Illustrator.

## Gatilho de revisão

- Se o spike mostrar texto quebrado letra por letra no Illustrator em PDF **e** em SVG, rever se o texto sai como texto ou como contorno (curvas), com a escolha na hora de exportar.
- Se as exportações vetoriais passarem de 30% do total de exportações, antecipar o pedido de CMYK e sangria.
