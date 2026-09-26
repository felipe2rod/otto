# Arquivo — Otto Atendente (WhatsApp)

Aqui fica o Otto de 2026-09-08 a 2026-09-25: um funcionário de IA que atendia o WhatsApp de pequenas empresas. Em 2026-09-26 o Felipe trocou a proposta do produto por uma ferramenta de design operada por agente de IA. Ver [ADR 026](../../decisoes/026-pivo-para-ferramenta-de-design.md).

Nada daqui está em vigor. Os ADRs estão marcados como `substituída por 026` e guardam o status que tinham antes.

## Por que foi guardado e não apagado

Parte do raciocínio vale para qualquer produto e pode ser reaproveitada:

- **Método.** A disciplina de evidência (grau declarado em toda afirmação sobre comportamento) e o formato de gatilho de revisão em incidência observável.
- **Arquitetura.** Portas e adaptadores, fornecedor fora do núcleo e isolamento multi-empresa continuam valendo e **não** foram arquivados: os ADRs 008, 009, 019, 020 e 023 ficaram em `docs/decisoes/`, cada um com nota de revisão.
- **Princípios do agente.** "Documento é dado, nunca instrução" (ADR 022, defesa contra injeção por material subido) e o caráter de admitir limite (persona) foram levados, adaptados, para o ADR 029.
- **Economia de inferência.** O cache de prompt como requisito, e não como otimização (ADR 004, `cobranca.md`), serve de ponto de partida para medir o custo por tarefa do agente.

## O que tem aqui

| Pasta | Conteúdo |
|---|---|
| `decisoes/` | ADRs 001–007, 010–018, 021, 022, 024 e 025 |
| `marca/` | Identidade, persona e voz do Otto Atendente |
| `produto/` | Visão, cobrança, experiência, dados, integrações, estilos de atendimento |
| `tecnico/` | Prompt em três blocos, infraestrutura com Meta e DigitalOcean |
| `mercado/` | Pesquisa de concorrência de 2026-09, oceano azul, experimento 001 |
| `bases-de-nicho/` | Bases de conhecimento por nicho em YAML, com lint e medidor |

Os links internos desses documentos apontam para caminhos anteriores ao arquivamento. Alguns deles quebraram, e não vale a pena consertá-los.
