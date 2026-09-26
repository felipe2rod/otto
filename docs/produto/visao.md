# Visão do produto

Atualizado em 2026-09-26, depois do pivô (ADR 026). Quase tudo aqui é hipótese e está escrito como hipótese.

## O que é o Otto

Um editor de design gráfico em camadas, no navegador, com um agente de IA próprio que trabalha no mesmo documento que o designer. O documento exporta para PSD editável, e o designer pode terminar no Photoshop quando quiser.

## Para quem

**Designer profissional**: freelancer, estúdio pequeno ou time interno de marca. Já usa Photoshop e passa boa parte da semana em trabalho de produção: adaptar uma peça para dez formatos, fazer variações de um anúncio, montar posts a partir de um modelo, aplicar identidade visual em material novo.

## O que o agente faz na v1 (hipótese de valor)

- **Adaptar formatos:** de uma peça 1080×1080 para story, banner, capa e anúncio, reposicionando e não só esticando.
- **Variações:** N versões de título, cor ou composição para teste.
- **Montar a partir de briefing:** texto + imagens da biblioteca + identidade da conta → primeira versão em camadas.
- **Aplicar identidade:** trocar cores, fontes e estilos por tokens da marca do cliente.
- **Lote:** trocar texto, preço ou foto em série a partir de uma lista.
- **Revisar:** apontar texto transbordando, contraste baixo, fonte faltando e imagem em baixa resolução.

Tudo isso termina num conjunto de alterações que o designer revisa. O agente não entrega nada "pronto" sem ter conferido (ADR 029).

## O que o editor tem na v1

Pranchetas, grupos, imagem raster, forma vetorial, texto, máscara raster e vetorial, efeitos de camada e camadas de ajuste, sempre no subconjunto que o Photoshop representa (ADR 028). Tokens de identidade visual. Biblioteca de imagens e fontes da conta. Importar e exportar PSD. Exportar PNG, JPG e PDF.

## O que o Otto não é

- **Não é substituto do Photoshop** na ferramenta manual (pincel, retoque, pintura digital). Ele não compete nessa camada.
- **Não é gerador de imagem por IA.** Gerar imagem é outra porta, com outro custo e outra questão de direitos, e fica fora da v1 (ADR 026).
- **Não é Canva para leigo.** O usuário é profissional, e a interface assume que ele sabe o que é camada, máscara e modo de mesclagem.
- **Não é plataforma de agentes.** Não há API nem MCP pública na v1 (ADR 029).

## Perguntas abertas

1. **Preço e unidade de cobrança.** Ainda não decidido: primeiro se calcula o custo. Estimativa em `docs/tecnico/custos.md`, substituída pelo custo medido no spike do agente (ADR 029, item 5). Inferência na DigitalOcean.
2. **Importação de PSD na v1:** aceita (ADR 028).
3. **Concorrência.** Ver `docs/mercado/pesquisa-2026-09-design.md`.
4. **Primeiro recorte de aquisição:** que tipo de designer e que tipo de trabalho primeiro (social media de agência? e-commerce? estúdio de marca?). O raciocínio de "nicho na aquisição, horizontal no produto" do antigo ADR 007 pode ser reaproveitado se o Felipe quiser.
5. **Nome e posicionamento:** "Otto" e "o agente faz a produção, você faz o design", aceitos pelo Felipe (ADR 026).
6. **Desktop:** navegador na v1. Aplicativo, só com gatilho.

## Primeira entrega técnica

Antes de qualquer tela de produto, três spikes. Se qualquer um falhar, a arquitetura muda.

1. **PSD** (ADR 028): um documento com um nó de cada tipo exporta para PSD, abre no Photoshop com texto editável, formas vetoriais, máscaras e efeitos, e a imagem composta bate com o render do Otto.
2. **Render** (ADR 030): o mesmo documento renderiza igual no navegador e no Node, e o editor segura 60 quadros por segundo com 200 camadas.
3. **Agente** (ADR 029): com o catálogo mínimo de operações, o agente adapta uma peça para 3 formatos e confere o próprio resultado. Mede tokens, imagens enviadas e voltas.
