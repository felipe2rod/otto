# Registros de decisão

Uma decisão por arquivo, numerada. Status: `proposta` (Claude sugeriu, Felipe não olhou), `a validar` (Felipe aceitou testar; vira `aceita` ou `rejeitada` com o critério do próprio ADR), `aceita`, `rejeitada`, `substituída por NNN`.

Template:

```
# NNN — Título

Status: proposta | a validar | aceita | rejeitada | substituída por NNN
Data: AAAA-MM-DD
Quem decide: Felipe

## Contexto
## Opções consideradas
## Decisão
## Consequências
## Evidência comportamental (fichas)
## Gatilho de revisão
```

Gatilho de revisão é sempre em **incidência observável**, nunca em atribuição ("quando clientes disserem que saíram por causa de X" não vale).

## Em vigor

| ADR | Assunto | Status |
|---|---|---|
| [008](008-backend-em-nestjs.md) | Backend em NestJS, Nest na borda | aceita, com nota do pivô |
| [009](009-stack-tecnica.md) | Stack técnica | aceita, com nota do pivô |
| [019](019-site-estatico-painel-dinamico-no-mesmo-app.md) | Site estático, editor dinâmico, no mesmo app | proposta, com nota do pivô |
| [020](020-plataforma-agnostica-a-fornecedor.md) | Plataforma agnóstica a fornecedor | aceita, com nota do pivô |
| [023](023-isolamento-multi-empresa.md) | Isolamento entre contas | aceita, com nota do pivô |
| [026](026-pivo-para-ferramenta-de-design.md) | Pivô: ferramenta de design operada por agente | aceita / proposta em partes |
| [027](027-documento-feito-para-agente.md) | Documento feito para o agente | proposta |
| [028](028-compatibilidade-com-photoshop-psd.md) | Compatibilidade com Photoshop (PSD) | aceita / proposta em partes |
| [029](029-agente-proprio-operando-o-documento.md) | Agente próprio operando o documento | aceita / proposta em partes |
| [030](030-motor-de-renderizacao-unico.md) | Um motor de renderização só | proposta |
| [031](031-dados-de-uso-sim-conteudo-do-arquivo-nao.md) | Dados de uso sim, conteúdo do arquivo não | aceita / proposta em partes |
| [032](032-bancos-de-imagens-com-chave-da-conta.md) | Bancos de imagens: Pixabay de fábrica, chave própria da conta | aceita / proposta em partes |
| [033](033-criar-a-partir-de-pedido-ou-briefing-salvo.md) | Criar a partir de pedido ou de briefing salvo (pelo designer) | aceita / proposta em partes |
| [034](034-exportacao-vetorial-para-illustrator.md) | Exportação vetorial para o Illustrator (SVG e PDF) | aceita / proposta em partes |

Os ADRs 001–007, 010–018, 021, 022, 024 e 025 eram do Otto Atendente (WhatsApp) e estão em [`docs/arquivo/whatsapp/decisoes/`](../arquivo/whatsapp/decisoes/), marcados `substituída por 026`. A numeração continua de onde parou e não se reaproveita número.
