# 035 — Da POC ao MVP, com Docker

Status: aceita (itens 1 a 5, pelo Felipe) / proposta (itens 6 e 7)
Data: 2026-10-01
Quem decide: Felipe

## Contexto

A POC em `poc/` (2026-09-26 a 2026-09-30) mostrou em oito rodadas que o ciclo do agente funciona: ele opera o documento pelo catálogo, confere por render e lint, e entrega um conjunto de alterações que exporta para PSD. Ela foi escrita como descartável, e a visão punha três spikes (saída, render, agente) antes de qualquer tela.

Em 2026-10-01 o Felipe decidiu passar a POC para o MVP e usar Docker. Backend, React e UI/UX planejaram em paralelo (`docs/mvp/`), e o especialista-grafico fez o spike de render (`docs/tecnico/spike-render.md`).

## Opções consideradas

1. **Jogar a POC fora e fazer os três spikes antes**, como estava escrito. Recusado: a POC já respondeu o spike do agente, e conta, banco, fila, armazenamento e contrato não dependem dos outros dois.
2. **Promover a POC como está.** Recusado: persistência em JSON, tarefa em memória de processo, cache sem conta e motor em Canvas 2D não servem ao produto.
3. **Migrar o núcleo da POC para o monorepo e reescrever a borda**, depois do spike de render. Escolhido.

## Decisão

1. **A POC vira o MVP.** O núcleo (documento, operações, resumo, lint, ciclo do agente, direção de arte, esforço criativo, prompt, PSD, importador de SVG) migra para os pacotes do monorepo. É reescrito o que vive em memória de processo e disco local, e a interface. `poc/` fica como referência até a migração terminar.
2. **Docker no desenvolvimento e na produção.** Um `compose` sobe tudo. O repositório continua no disco BACKUP1 (exFAT, sem symlink): cada `node_modules` mora em volume nomeado, e teste e Biome rodam dentro do contêiner.
3. **O motor do MVP é o CanvasKit** (ADR 030 mantido). O MVP não sai com o Canvas 2D da POC.
4. **Sem login por enquanto.** Entrada, convite, senha e e-mail ficam fora do MVP.
5. **Importar PSD (ADR 028) e saída para o Illustrator em SVG e PDF (ADR 034) entram no MVP.**
6. **Proposta: render de referência em CPU, prévia do editor em GPU.** O spike passou com ressalva. Em raster de CPU, Node e Chrome dão zero pixel diferente nas dez cenas. Os 60 quadros por segundo com 200 camadas só saem em WebGL, que difere do raster de CPU (quase sempre em 1 nível; bordas, desfoque e alguns modos passam disso). Proposta: agente, lint, exportação e goldens usam CPU, com tolerância zero; o canvas do editor é prévia em GPU, com limite próprio de diferença. Se aceita, o ADR 030 ganha essa redação.
7. **Proposta: o banco nasce com `conta_id`, RLS e uma conta fixa**, para o login entrar depois sem migração (ADR 023).

## Consequências

- Os spikes de saída e de agente deixam de ser pré-requisito e viram portões dentro das fatias: abrir no Photoshop e no Illustrator o que a fatia de exportação gera, e medir custo e tempo de tarefa com Claude na fatia do agente.
- A ordem de entrega está em `docs/mvp/README.md`.
- Sem login, o aviso de fim de tarefa é só o título da aba e a notificação do navegador.
- O pacote do CanvasKit no npm não escreve PDF. O PDF do ADR 034 precisa de outra biblioteca, a escolher.
- O servidor renderiza em CPU: 1,1 a 2,4 s por prancheta de 50 camadas, medido num processador de 2011.
- `CLAUDE.md` deixa de dizer "POC descartável", "sem código de aplicação" e "spikes antes de qualquer tela".

## Gatilho de revisão

- Se a diferença entre a prévia em GPU e o render de referência aparecer em reclamação de designer ("exportou diferente do que eu via") em mais de uma peça de teste, entra o botão "ver como exporta" (render de referência no navegador).
- Se o PSD ou o PDF não abrir editável no Photoshop ou no Illustrator na fatia de exportação, a fatia do agente não começa.
- Quando o primeiro designer de fora for usar, o login entra antes.
