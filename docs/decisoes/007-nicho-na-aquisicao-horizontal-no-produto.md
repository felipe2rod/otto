# 007 — Nicho na aquisição, horizontal no produto e na marca

Status: aceita (princípio) / a validar (qual nicho primeiro)
Data: 2026-09-08
Quem decide: Felipe

## Contexto

O estrategista de mercado recomendou cabeça de ponte em um nicho. Felipe rejeitou de início: a visão final é o Otto conhecer o negócio do cliente melhor que o dono, expandir por cargos e, com integrações, virar o sistema de gestão do negócio. A preocupação era que nichar amarrasse a comunicação e atrasasse essa visão.

A discussão separou duas coisas que estavam juntas: **destino** (produto horizontal, vários cargos, sistema de gestão) e **porta de entrada** (de onde vêm os primeiros clientes e o que o Otto já sabe antes de conhecê-los). Felipe cedeu em 2026-09-08: "direcionar o tráfego para nichos específicos pode funcionar".

## Decisão

1. **A marca é horizontal.** Otto é "o funcionário de IA que aprende o seu negócio". Nada em `docs/marca/` muda. Nenhum nicho entra no nome, no posicionamento ou na persona.
2. **O produto é horizontal.** Um Otto, vários cargos (ADR 001). Portas de contexto com adaptador manual (ADR 006). Nada é construído de forma que só sirva a um segmento.
3. **A aquisição é por nicho.** Anúncio, landing, roteiro de venda e Otto pré-configurado miram um segmento por vez. O primeiro nicho decide de onde vêm os 10 primeiros clientes e qual base de conhecimento o Otto já traz pronta.
4. **O nicho é ordem de entrada, não teto.** Depois de dominar o primeiro, o próximo vizinho (pista de boliche). A expansão por cargos acontece dentro de cada nicho conquistado.
5. **O primeiro nicho ainda não está decidido.** Candidato do estrategista: assistência técnica de bairro (celular, informática, eletrodoméstico, ar-condicionado). Reserva: barbearia sem sistema. Decide-se com o experimento abaixo, não com opinião.

## Por que isso não contraria a visão

- Conhecer o negócio melhor que o dono exige saber que perguntas ele recebe, que planilha usa, que sistema tem. Isso é específico por segmento. Genérico, o Otto conhece nenhum.
- O gatilho de integração do ADR 006 (5 contas pedindo a mesma ferramenta) só dispara se as contas forem parecidas.
- "CRM/ERP completo" para todos é entrar contra Bling, Conta Azul, Omie e Tiny. Sistema de gestão inteiro de **um tipo de negócio que hoje não tem nenhum** é caminho aberto. A Anota AI fez isso com restaurante.

## Como valida o primeiro nicho

Experimento 001 em `docs/mercado/experimento-001-anuncio-por-nicho.md`, mais 10 conversas de campo com donos do nicho candidato. Critérios de decisão escritos antes de rodar.

## Consequências

- `visao.md`, pendência 5, passa de "não decidido" para "em validação, com experimento".
- A landing e o primeiro anúncio falam com um segmento. A página institucional (ottobr.ai) continua horizontal.
- A camada 0 do ADR 006 ganha uma peça: **base de conhecimento pré-preenchida por nicho**, o que o Otto já sabe sobre aquele tipo de negócio antes de ler o histórico do cliente.
- Guardião da marca: texto de aquisição por nicho é permitido e esperado; texto de marca por nicho não.

## Gatilho de revisão

- Voltar a discutir entrada genérica se surgir **canal horizontal com clientes na mão** (contador com carteira, revendedor de maquininha, franquia) que entregue clientes sem custo de aquisição.
- Trocar o nicho candidato se o experimento 001 ou as 10 conversas derrubarem o critério pré-registrado.
