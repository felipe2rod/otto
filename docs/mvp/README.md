# MVP do Otto: consolidação dos três planos

2026-10-01. O Felipe decidiu passar a POC para o MVP, com Docker. Três especialistas planejaram em paralelo:

- [backend.md](backend.md): Docker, monorepo, dados, contrato da API, worker, ordem de entrega.
- [frontend.md](frontend.md): `apps/web`, estado do editor, porta do motor de render, ordem de entrega.
- [experiencia.md](experiencia.md): recorte do MVP pela jornada, fluxos, estados e texto de interface (rascunho, ainda sem o guardião da marca).

Este arquivo diz onde os três concordam, onde divergem e o que falta decidir. Nenhum código foi escrito e a POC não foi alterada.

## Onde os três concordam

- **Seguir com POC para MVP sem esperar os três spikes.** Conta, banco, isolamento, fila, armazenamento e contrato não dependem deles. O núcleo da POC (`documento`, `render`, ciclo do agente, direção, esforço, prompt, PSD, importador de SVG) migra quase como está. É reescrito o que hoje vive em memória de processo e disco local, e a interface (`App`, `estado`, `api`, `Canvas`, `Briefing`).
- **Dois portões que não se pulam:** abrir no Photoshop os PSDs que a POC já gera (nunca foi feito, e a jornada termina aí), e fechar a interface do render com o especialista-grafico antes da fatia que estreia o worker.
- **Docker resolve o disco sem symlink.** Testado: `pnpm install` falha com o código montado do exFAT e funciona com cada `node_modules` em volume nomeado. O host fica sem `node_modules`; teste e Biome rodam por `docker compose exec`.
- **Tarefa do Otto no servidor**, na fila, sem depender do navegador aberto; progresso por fluxo de eventos com retomada.
- **Custo, modelo e tokens fora da tela.** O designer vê o tempo. O custo é gravado por chamada.
- **Aceitar em parte por prancheta**, não por camada. Só leitura enquanto o Otto trabalha. "Desfazer tudo" recusado se o designer editou depois.
- **Editor só em computador.** Por convite. Uma tarefa por vez por conta.
- **Depois do MVP:** recorte de sujeito, chave própria de banco de imagens, retomada de tarefa interrompida, conta com mais de uma pessoa, cobrança.

## Onde divergem

| Ponto | Backend | Frontend | Experiência | Recomendação |
|---|---|---|---|---|
| Ordem: exportar ou pedir ao Otto primeiro | Exportar antes (estreia fila e worker sem custo de token, libera o teste no Photoshop) | Pedir antes | — | **Exportar antes.** O portão do Photoshop é o maior risco do produto e essa ordem o antecipa. O frontend desenvolve o painel do Otto contra eventos gravados |
| Como entrar | E-mail e senha (sem fornecedor de e-mail) | Cookie de sessão, sem posição | Link por e-mail, mais aviso por e-mail ao fim da tarefa | Decisão do Felipe (abaixo) |
| O "pode" antes de tarefa grande | Depois | Estado previsto | No MVP, cumprido pelo servidor | **No MVP.** O backend mostrou que cabe em dois jobs, sem custo correndo na espera, e o ADR 029 pede |
| Esforço criativo | Migra | Fora das primeiras fatias | Três opções na tela | **Três opções, na fatia do briefing.** Os sete níveis ficam no código; nenhum foi medido |
| Leitura do site da marca | Depois (maior superfície de ataque) | Depois | No MVP | **Depois** |
| Cadastro de marcas | Não estava no modelo; aceita na fatia do briefing | — | No MVP | **No MVP**, na fatia do briefing |
| Miniatura na lista | Campo nulo no MVP | — | Atualizada a cada lote | **Depois da fatia de exportação**, ao fim de cada tarefa |
| Imagem no editor | Pela API, com a conta conferida e cache imutável | Pede cache imutável | — | **Pela API** |

## Achados na POC que mudam a migração

1. `aplicarLote` gera o id do nó novo por dentro e mede texto. Navegador e servidor chegam a resultados diferentes, o que quebra a fila otimista. Proposta: gerador de id e medidor como parâmetros. Até o motor único, o editor adota a árvore que o servidor devolve.
2. `aplicarLote` clona o documento inteiro a cada lote, e arrastar recompõe todas as pranchetas a cada movimento.
3. `documento/lint.ts` importa o render; o nome do documento muda por fora do catálogo; o cache de imagens do servidor é global, sem conta.
4. O navegador importa texto de prompt e monta a mensagem para o agente. No MVP isso é do servidor.
5. A tarefa mais simples medida levou de 4,5 a 6 minutos. Ajuste pontual precisa de um caminho rápido (pedido ao treinador).
6. O MinIO foi arquivado; o armazenamento compatível com S3 para desenvolvimento ainda não foi escolhido nem testado.

## Ordem de entrega consolidada

Cada fatia roda com `docker compose up`.

| Fatia | O que passa a existir |
|---|---|
| 0. Esqueleto | Monorepo no Docker, `packages/documento` e `packages/render` vindos da POC, banco com os papéis, testes de fronteira e isolamento, `apps/web` com site de uma página e `/entrar` |
| 1. Conta e documento | Entrar, lista de peças, abrir no editor, lote com versão, desfazer e refazer, envio de imagem e SVG |
| 2. Exportar | PSD e PNG pela fila, relatório antes dos botões. **Portão: abrir no Photoshop** |
| 3. Tarefa do Otto | Pedido livre, etapas, "pode", cancelar, revisão (aceitar, desfazer tudo, ver o antes, descartar por prancheta), custo gravado |
| 4. Briefing | Formulário, marcas, briefing salvo, esforço em três opções, Google Fonts, Pixabay, texturas. **Aqui um designer usa o produto de ponta a ponta** |
| 5. Edição manual que falta | Redimensionar pela alça, editar texto no canvas, trocar imagem, duplicar |
| 6. Produção | No ar na DigitalOcean, teto diário, retenção, eventos de uso |

## Decisões do Felipe

Decididas em 2026-10-01:

1. **Motor de render: esperar o CanvasKit** (ADR 030 mantido). O MVP começa depois do spike de render do especialista-grafico. As recomendações de backend e frontend de sair com o Canvas 2D ficam vencidas.
2. **Sem login por enquanto.** Não há entrada, convite, senha nem e-mail no MVP. Cai o aviso por e-mail ao fim da tarefa; ficam o título da aba e a notificação do navegador. Consequência a confirmar com o Felipe: o banco nasce com `conta_id` e RLS e uma conta fixa, para o login entrar depois sem migração (ADR 023).
3. **Importar PSD (ADR 028) e saída para o Illustrator em SVG e PDF (ADR 034) entram no MVP.**
4. **O repositório continua no BACKUP1 (exFAT).** `node_modules` em volumes do Docker; teste e Biome só dentro do contêiner.

Efeito na ordem acima: o spike de render vem antes da fatia 0; a fatia 1 perde "entrar"; a fatia 2 ganha SVG e PDF; entra uma fatia de importar PSD antes da produção.

Podem esperar a fatia em que aparecem (recomendação entre parênteses): Vitest no monorepo inteiro no lugar do Jest do ADR 009 (sim); Droplet com `compose` ou App Platform (Droplet enquanto for fechado); limite de 45 milhões de tokens por dia na DigitalOcean, que dá de 45 a 75 tarefas no produto inteiro (pedir aumento antes de testar com designers); retenção (pedidos 12 meses, exportação 7 dias); objeto inteligente e filtro inteligente na v1, que `docs/tecnico/psd.md` lista como fora (ADR novo); aviso aos designers do teste de que o texto dos pedidos é lido; pergunta de retorno depois do PSD (sim); peça de exemplo em conta nova (sim).

A decisão de hoje contradiz três frases do `CLAUDE.md` ("POC descartável", "sem código de aplicação", "spikes antes de qualquer tela"). Pede o ADR 035 e a correção do `CLAUDE.md`.

## Quem falta chamar

- **especialista-grafico:** mover `documento` e `render` para `packages/`, fechar a porta do render, gerador de id e medidor como parâmetros, tirar o render de dentro do lint, lote inverso, conferência do PSD no Photoshop. A fatia 0 depende dele.
- **treinador-do-otto:** etapas e plano estruturados no ciclo, caminho rápido para ajuste pontual, modelo falso com roteiro gravado.
- **guardiao-da-marca:** a seção 6 de `experiencia.md` inteira.
- **analista-de-produto:** catálogo de eventos de uso.

## O que ninguém mediu

Tempo e custo de tarefa com Claude (os números são do Kimi K3, projetados); recarga a quente dentro do contêiner com código no exFAT; NestJS carregando o núcleo ESM; quanto demora exportar duas pranchetas pesadas; memória do worker; quadros por segundo com 200 camadas.
