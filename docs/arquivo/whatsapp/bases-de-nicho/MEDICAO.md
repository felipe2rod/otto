# Medição — quanto cada base do nicho ocupa

Gerado por `python3 medir.py`, em 2026-09-09. Reprodutível com um comando.

## O que está medido e o que está estimado, sem misturar

| | Estado |
|---|---|
| **Caracteres da base renderizada** | **Medido.** Contagem exata sobre o texto que `medir.py` escreve em `_teste/render/` |
| **Itens que renderizam** | **Medido.** Sai da mesma renderização |
| **Tokens** | **`[ESTIMATIVA]`.** Não há chave da API neste ambiente (`ANTHROPIC_API_KEY` não definida, `ant` não instalado). A razão caractere→token não foi verificada para português com o tokenizador do Claude |

A razão usada é 3,5 caracteres por token — a ponta pessimista de uma banda de 3,5 a 4,5. **Planejo pelo pior lado de propósito:** se o número verdadeiro for melhor, sobra orçamento; se eu planejasse pelo melhor lado e errasse, a base estouraria o alvo sem ninguém notar.

**Como isso vira medição, com um comando.** O texto renderizado está em `_teste/render/*.txt`. Quem tiver chave roda `messages.count_tokens` sobre cada arquivo e substitui a coluna. É a mesma pendência 1 de `conversa.md` §12 (capacidades de cache na DigitalOcean) e as duas fecham na mesma rodada.

## A tabela

`A` é o estado logo depois do onboarding: só as 10 telas que o dono conferiu, com a camada 0 tendo preenchido **nada** (pior caso, e o provável neste público — perfil do WhatsApp magro). `B` é a base do nicho inteira conferida, o que só acontece se o dono voltar nas semanas seguintes pelas outras portas.

| Nicho | A: itens | A: chars | **A: tokens** | **A: % de 4.000** | B: itens | B: chars | B: tokens | B: % de 4.000 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| assistencia-tecnica-celular | 10 | 1.161 | **332** | **8,3%** | 19 | 1.835 | 524 | 13,1% |
| autoescola | 10 | 1.161 | **332** | **8,3%** | 22 | 2.176 | 622 | 15,5% |
| barbearia | 10 | 992 | **283** | **7,1%** | 20 | 1.788 | 511 | 12,8% |
| clinica-de-estetica | 10 | 1.023 | **292** | **7,3%** | 20 | 1.946 | 556 | 13,9% |
| clinica-odontologica | 10 | 937 | **268** | **6,7%** | 21 | 1.836 | 525 | 13,1% |
| lash-designer | 10 | 1.077 | **308** | **7,7%** | 20 | 1.901 | 543 | 13,6% |
| loja-artigos-religiosos-afro | 10 | 1.152 | **329** | **8,2%** | 15 | 1.502 | 429 | 10,7% |
| salao-e-cabeleireiro | 10 | 1.004 | **287** | **7,2%** | 21 | 1.850 | 529 | 13,2% |

## O que sobra para o dono

O alvo de `conversa.md` §3.2 é **4.000 tokens** de bloco de negócio; o teto duro é 8.000.

| | Tokens | Sobra do alvo de 4.000 | Em respostas do dono |
|---|---:|---:|---:|
| Base do nicho depois do onboarding (a mais pesada: autoescola) | 332 | **3.668** | ~105 |
| Base do nicho inteira conferida (a mais pesada: autoescola) | 622 | **3.378** | ~96 |

A conversão para "respostas do dono" usa 35 tokens por resposta, que é o tamanho de uma linha de item nos arquivos renderizados. **`[ESTIMATIVA]`, mesma ressalva de razão acima.**

**A leitura que interessa: a base do nicho gasta menos de um décimo do orçamento e devolve as dez respostas mais caras do negócio.** Se ela ocupasse um terço, eu teria escrito arquivos grandes demais e o dono chegaria ao teto de 8.000 antes de ensinar o que é dele — que é o contrário do ponto.

## Onde ainda cabe erro, e o tamanho dele

1. **A razão caractere→token.** Se a razão real for 3,0 em vez de 3,5, os números sobem 17% e a base mais pesada vai a 726 tokens — **18% do alvo, ainda folgado.** Nenhuma decisão deste documento muda dentro dessa faixa. É por isso que a estimativa, mesmo não verificada, é suficiente para decidir: a margem entre o valor e o limite é grande demais para o erro caber nela.
2. **`lista` é o item que pode crescer sozinho.** Uma tabela de preço por aparelho com 7 linhas mede o que está aqui; com 40 linhas, não. O `minimo_de_linhas` protege o piso e nada protege o teto — quem protege o teto é o limite de 8.000 aplicado na escrita (`conversa.md` §8, item 4). Vale conferir na rodada 1 quantas linhas as contas reais põem.
3. **`texto_curto` preenchido pelo dono.** Meço com um valor de 17 caracteres. Um dono que escreve uma lista de 12 convênios num campo só faz aquele item triplicar. Não é problema de orçamento (1 item), é sinal de que aquele item queria ser `lista`. A revisão de 10 contas (README §7.1) pega isso.
