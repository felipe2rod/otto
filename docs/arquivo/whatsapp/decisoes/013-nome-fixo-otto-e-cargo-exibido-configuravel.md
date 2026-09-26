# 013 — Nome fixo "Otto", cargo exibido e foto configurados pela empresa

Status: substituída por 026 (pivô para a ferramenta de design, 2026-09-26). Status anterior: aceita (nome e cargo) / proposta (regra da foto)
Data: 2026-09-08
Quem decide: Felipe

## Contexto

Até aqui o nome que o cliente final via era configurável: padrão "Otto", troca livre (ADR 002, `identidade.md`, `estilos-de-atendimento.md`). Isso obrigava a uma resposta especial quando a empresa trocava o nome ("aqui me chamam de Ana, mas meu nome de verdade é Otto") e a testes de caráter em duas variantes.

Felipe decidiu em 2026-09-08: **o nome é Otto, sempre.** O que a empresa configura é a **função que aparece ao lado do nome** e a **foto**. Exemplo dele: "Otto, atendente".

## Decisão

### Nome

"Otto" é o nome do funcionário em toda empresa. Não se troca, não se abrevia, não vira apelido. Coerente com o ADR 001 (uma pessoa só) e com o ADR 003 (quando perguntado, ele diz quem é). A resposta "aqui me chamam de [Nome]" deixa de existir; os testes de caráter perdem a variante "nome trocado".

### Cargo exibido

A empresa define um **rótulo curto de função**, que acompanha o nome onde o Otto se apresenta. Formato: `Otto, <função>`.

| Regra | Definição |
|---|---|
| Padrão | O nome do cargo contratado, em minúsculas: "atendente" para o Otto Atendente. Cargos futuros trazem o seu ("vendedor", "cobrador") |
| A empresa pode | Trocar por como ela chama a função internamente: "recepção", "agendamento", "suporte", "SAC", "pré-venda", "atendimento da oficina" |
| Limite de forma | Até 30 caracteres, uma linha, sem emoji, sem nome de pessoa, sem "IA", "bot", "robô" ou "virtual" (vocabulário de `identidade.md`) |
| Limite de conteúdo | Descreve uma função. Não pode ser um nome ("Ana"), um título que engane ("gerente", "dono", "Dr.") nem promessa ("resolve tudo") |
| Onde aparece | Na saudação ("Oi! Eu sou o Otto, atendente da Oficina do Zé. Em que posso ajudar?"), na resposta sobre si ("Sou IA. Meu nome é Otto, trabalho no atendimento aqui, de ottobr.ai."), na assinatura do resumo do dia e no painel |
| Onde não aparece | O Otto não repete "Otto, atendente" a cada mensagem. Se apresenta uma vez; depois é só a conversa |
| Quem valida | O painel valida forma. Conteúdo duvidoso ("gerente") é aceito com aviso e vai para o registro de suporte da plataforma; regra fecha com dado |

O nome da empresa entra na saudação depois da função: "Otto, atendente da [Empresa]". A empresa pode tirar o "da [Empresa]" se o perfil do WhatsApp já deixa claro onde o cliente está.

### Foto

Dois lugares, duas regras:

1. **Perfil do WhatsApp.** O número é da empresa; a foto e o nome do perfil são dela e continuam sendo. O Otto não mexe. A empresa decide se coloca o logotipo, a fachada ou uma imagem do Otto.
2. **Avatar do Otto** no painel, no onboarding, no resumo do dia e no material que a empresa quiser usar. **Proposta (Felipe decide):** a empresa escolhe entre **avatares oficiais do Otto**, com variações de pose e de roupa, e com a **cor da camisa igual à cor da marca da empresa** (o Otto veste a camisa, `persona-otto.md`). Upload de foto qualquer não entra, porque uma foto de outra pessoa faz o Otto deixar de ser o Otto (ADR 001). Alternativa, se Felipe preferir liberdade total: upload livre, e a marca aceita que o Otto tenha muitas caras.

## Consequências

- **ADR 002** perde "nome de exibição" da lista do que a empresa configura e ganha "cargo exibido" e "avatar". **ADR 003** perde o item 3 (apelido). Ambos recebem nota apontando para este ADR; não são reescritos.
- **`identidade.md`.** Tabela de nomes: "o que o cliente final vê" passa a "Otto, <função configurada>". Resposta sobre si perde a variante de apelido.
- **`estilos-de-atendimento.md`.** Tabela de configuração: "Nome de exibição" sai; entram "Cargo exibido" (padrão: nome do cargo) e "Avatar". Textos fixos por preset perdem a variante "nome trocado" e ganham a função na saudação. Testes de caráter rodam por preset, uma variante só. Métrica "percentual que muda o nome" vira "percentual que muda o cargo exibido".
- **`persona-otto.md`.** Lista do que a empresa configura: troca "nome de exibição" por "cargo exibido e avatar".
- **`visao.md`**, pergunta 4: decidida.
- **Backend.** Configuração da empresa: `cargo_exibido` (texto, padrão por cargo) e `avatar_id`. O bloco de estilo do prompt recebe os dois. Teste de caráter: uma variante por preset.
- **Dados (`dados.md`).** `configuracao.alterada` registra troca de cargo exibido e de avatar em vez de nome.
- **Marca.** Ganho: a marca Otto aparece em toda conversa, em toda empresa, sem depender de o cliente final perguntar. Isso reforça o ADR 003 e a exposição orgânica que a pergunta 4 da visão apostava.

## Evidência comportamental (fichas)

| Afirmação | Tipo | Grau | O que a mata |
|---|---|---|---|
| Empresas aceitam um atendente chamado Otto sem pedir para trocar o nome | Taxa | NÃO VERIFICADO | 3 ou mais das 10 primeiras contas pedirem troca de nome no suporte |
| "Otto, atendente da Oficina" soa como gente da empresa para o cliente final, não como sistema | Preferência | INFERIDO (nome próprio + função é como empresa apresenta funcionário) | Incidência de "é robô?" na primeira mensagem maior que a observada com saudação sem função, medida por `houve_pergunta_sobre_o_otto` |

## Gatilho de revisão

- Rever nome fixo se 3 ou mais das 10 primeiras contas pedirem troca de nome pelo suporte.
- Fechar a regra de conteúdo do cargo exibido com os 50 primeiros rótulos cadastrados.
- Decidir a regra da foto (avatares oficiais × upload livre) antes da tela de onboarding existir.
