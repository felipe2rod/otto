# 026 — Pivô: o Otto passa a ser uma ferramenta de design operada por agente de IA

Status: aceita (pivô, usuário, agente próprio, editor no navegador, nome e posicionamento, pelo Felipe) / proposta (o que fica fora da v1)
Data: 2026-09-26
Quem decide: Felipe

## Contexto

O Felipe testou agentes de IA controlando Photoshop, Canva e Figma por MCP e achou o resultado satisfatório. O problema não é a qualidade do agente. O problema é depender de ferramenta de terceiro:

- **O agente só enxerga o que a ferramenta expõe.** O modelo de documento, o histórico e a renderização são de outra empresa. Quando a API não oferece uma operação, o agente não consegue fazê-la.
- **Conectores externos quebram por decisão alheia.** Mudança de API, limite de uso, termos de uso ou licença de automação podem acabar com o produto de um dia para o outro. O ADR 020 já tinha escrito o princípio: fornecedor só no adaptador. Aqui o fornecedor seria o próprio produto, e não um adaptador.
- **Essas ferramentas foram feitas para a mão humana.** O agente trabalha por tentativa: clica, olha a tela, tenta de novo. Uma ferramenta desenhada para agente expõe estado estruturado, operações validadas e verificação barata.

Até aqui o Otto era um atendente de WhatsApp (ADRs 001–025). Esse produto foi arquivado em `docs/arquivo/whatsapp/`.

## Opções consideradas

1. **Novo cargo do Otto ("Otto Designer")**, convivendo com o Atendente. Recusado pelo Felipe: pivô total.
2. **Projeto separado**, com o Otto intacto. Recusado pelo Felipe.
3. **Pivô total: o Otto vira a ferramenta de design.** Escolhido.

Sobre quem usa, as opções foram pequena empresa sem designer (caminho do Canva), designer profissional e "agentes primeiro" (API como produto). **Escolhido pelo Felipe: designer profissional.**

Sobre onde roda o agente, as opções foram agente próprio, só agentes externos por API/MCP ou os dois. **Escolhido pelo Felipe: só agente próprio.**

## Decisão

1. **O Otto é um editor de design gráfico em camadas**, no território do Photoshop e do Canva (composição, texto, forma, imagem, efeito), com um **agente de IA próprio** embutido que opera o mesmo documento que o designer.
2. **O usuário é o designer profissional.** Ele já tem Photoshop e não vai abandoná-lo. Por isso a **compatibilidade com PSD é requisito de v1** (ADR 028): o Otto entra no fluxo que já existe em vez de pedir que o designer saia dele.
3. **Posicionamento proposto:** o Otto não tenta ganhar do Photoshop na ferramenta manual, porque essa briga não se vence. Ele ganha no **trabalho de produção que o agente faz**: variações, adaptação para vários formatos, montagem a partir de briefing, aplicação de identidade visual, trocas em lote. O designer dirige, confere e, quando precisa, termina no Photoshop. Slogan **aceito pelo Felipe em 2026-09-26**: *"o agente faz a produção, você faz o design."* A forma final de cada peça ainda passa pelo guardião.
4. **Ferramenta feita para agente, não adaptada para ele.** Documento estruturado, operações tipadas e validadas, histórico único para humano e agente, e verificação por renderização e por regras. Ver ADR 027.
5. **Agente próprio, sem API nem MCP pública na v1.** As ferramentas do agente são as mesmas operações do documento (ADR 027), então abrir uma API depois é barato. Isso, porém, é decisão futura com gatilho, não trabalho de agora. Ver ADR 029.
6. **Nenhuma dependência de ferramenta de design externa em tempo de execução.** Photoshop, Canva e Figma não são chamados pelo Otto. O PSD é **formato de arquivo** que a gente lê e escreve, não integração.
7. **O nome continua "Otto"** (aceito pelo Felipe em 2026-09-26). O produto e o agente são a mesma entidade: quem abre o editor trabalha com o Otto. O "funcionário de IA com cargos" do ADR 001 sai de cena.

## O que sobrevive do produto anterior

| ADR | Destino |
|---|---|
| 008 — NestJS, Nest na borda | Vigente |
| 009 — Stack | Vigente, com nota: a justificativa de pg-boss mudou (fila de exportação e de tarefas do agente) |
| 019 — Site estático, app dinâmico | Vigente na forma. O "painel" vira o editor |
| 020 — Agnóstico a fornecedor | Vigente. O mapa de portas foi refeito (ADR 029 e 030) |
| 023 — Isolamento multi-empresa | Vigente. "Empresa" passa a ser a conta (pessoa ou estúdio) |
| Todos os outros | Arquivados, `substituída por 026` |

## Fora da v1 (proposta)

- Edição colaborativa em tempo real entre pessoas. O "multiplayer" da v1 é designer + agente.
- API ou MCP pública para agentes externos (item 5).
- Geração de imagem por modelo de difusão. É outra porta, com outro custo e outra questão de direitos. Entra com ADR próprio.
- CMYK, 16 bits por canal, perfis de cor além de sRGB (ADR 028).
- Aplicativo de desktop. **O editor roda no navegador** (confirmado pelo Felipe em 2026-09-26).
- Vídeo e animação.

## Consequências

- `CLAUDE.md`, os agentes de `.claude/agents/`, a visão e a marca foram reescritos para a nova proposta.
- Cobrança, preço e unidade de consumo voltam a ser pergunta aberta. O custo de inferência do agente por tarefa precisa ser medido antes de qualquer preço, o mesmo raciocínio do antigo ADR 005.
- A pesquisa de mercado de 2026-09 não vale mais. A concorrência nova (Adobe, Canva, Figma, Photopea e agentes de design) precisa de pesquisa própria, com o estrategista de mercado.
- **A primeira entrega técnica são dois spikes** (ADR 028 e 030). O primeiro exporta um documento com os tipos de camada da v1 para PSD e confere no Photoshop. O segundo renderiza o mesmo documento de forma idêntica no navegador e no servidor. Se algum deles falhar, a arquitetura muda antes de existir código de produto.

## Evidência comportamental (fichas)

- **"Designer profissional aceita um agente fazendo produção dentro de uma ferramenta nova."** Tipo: adoção. Grau: **hipótese**, apoiada só nos testes do próprio Felipe. Comparável: designers que já usam ações e scripts do Photoshop e plugins de automação. A analogia vale para a vontade de automatizar produção repetitiva e falha na troca de ferramenta, que é bem mais cara do que instalar um plugin. **O que mata:** em entrevista ou teste com designers, a maioria recusa abrir arquivo fora do Photoshop, mesmo com PSD de volta.
- **"PSD de ida e volta é o que torna a troca aceitável."** Tipo: barreira de adoção. Grau: **hipótese**. **O que mata:** designers que testam o Otto exportam e não voltam. O Otto vira gerador de PSD, e não editor.

## Gatilho de revisão

- Das 10 primeiras pessoas que testarem, se menos de 3 fizerem uma segunda sessão no editor sem ser pedido, o posicionamento de editor está errado: rever para "gerador de PSD" (agente sem editor completo).
- Se o spike de PSD (ADR 028) não abrir no Photoshop com texto editável e camadas corretas, rever o requisito de v1 antes de escrever o editor.
