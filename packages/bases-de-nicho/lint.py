#!/usr/bin/env python3
"""
Lint das bases do nicho. Roda no CI; arquivo que reprova não entra.

São nove regras, e as três primeiras são as que existem porque um erro meu aqui
vira o Otto quebrando o caráter num negócio de outra pessoa:

  1. nicho_item_precisa_de_gesto  — item que renderiza sem o dono ter feito nada
  2. nicho_sem_numero             — preço, prazo ou duração escritos por mim
  3. nicho_sem_instrucao          — ordem ao Otto dentro do canal `fato`

Uso:  python3 lint.py                 (código de saída 1 se houver falha)
      python3 lint.py --diagnostico   (roda também as regras escritas e não ligadas)
"""

import pathlib
import re
import sys

import yaml

AQUI = pathlib.Path(__file__).parent

# Números que não podem existir numa base do nicho: dinheiro, prazo, duração,
# quantidade de sessões, percentual. Nome de produto com dígito ("iPhone 13",
# "Moto G54", "categoria B") é permitido e por isso a regra é por unidade, não
# por dígito.
NUMERO_PROIBIDO = re.compile(
    r"(R\$\s*\d)"
    r"|(\d+\s*(dias?|horas?|semanas?|meses|mês|minutos?|min\b|anos?|sess(ão|ões)|vezes|x\b))"
    r"|(\d+\s*%)",
    re.IGNORECASE,
)

# Palavras que denunciam ordem dirigida ao Otto dentro do bloco 3.
INSTRUCAO = re.compile(
    r"\b(sempre|nunca|responda|diga|informe|ofere(ç|c)a|pergunte|encaminhe|"
    r"n(ã|a)o mencione|o Otto)\b",
    re.IGNORECASE,
)

LACUNA = re.compile(r"\{([a-z0-9_]+)\}")
OPCIONAL = re.compile(r"«[^»]*»")

TIPOS_DE_LACUNA = {
    "dinheiro", "dias", "horas", "minutos", "meses",
    "sessoes", "percentual", "texto_curto",
}
FONTES = {"perfil_whatsapp", "catalogo", "descricao_do_negocio", "google"}
MOTIVOS = {"cliente_pediu", "nao_sabe", "assunto_sensivel", "regra_da_empresa", "fora_do_cargo"}

falhas = []


def falha(arq, chave, regra, detalhe):
    falhas.append(f"{arq}::{chave}  [{regra}]  {detalhe}")


def confere(caminho):
    arq = caminho.name
    base = yaml.safe_load(caminho.read_text(encoding="utf-8"))
    assuntos = set(base.get("assuntos", []))
    vistos = set()

    for item in base.get("itens", []):
        ch = item.get("chave", "<sem chave>")

        if ch in vistos:
            falha(arq, ch, "chave_unica", "chave repetida no arquivo")
        vistos.add(ch)

        if not item.get("pergunta"):
            falha(arq, ch, "pergunta_obrigatoria", "todo item precisa da pergunta do cliente")

        if assuntos and item.get("assunto") not in assuntos:
            falha(arq, ch, "assunto_no_vocabulario",
                  f"'{item.get('assunto')}' não está em `assuntos` do cabeçalho")

        tipo = item.get("tipo")
        lacunas = item.get("lacunas") or {}
        texto = item.get("texto")

        # --- regra 1 ---
        if item.get("encaminha_sempre"):
            if texto:
                falha(arq, ch, "encaminha_sem_texto",
                      "item de encaminhamento não pode ter `texto`: viraria linha no <base>")
            if item.get("motivo_do_encaminhamento") not in MOTIVOS:
                falha(arq, ch, "motivo_valido",
                      "`motivo_do_encaminhamento` fora do enum de encaminhamento.solicitado")
        elif tipo == "escolha":
            if not (item.get("opcoes", {}).get("sim") and item["opcoes"].get("nao")):
                falha(arq, ch, "escolha_com_dois_textos", "faltou `sim` ou `nao`")
        elif tipo == "fato":
            obrig = [n for n, s in lacunas.items() if s.get("obrigatoria")]
            if not obrig:
                falha(arq, ch, "nicho_item_precisa_de_gesto",
                      "fato sem lacuna obrigatória renderizaria sem o dono confirmar nada")
            if len(obrig) > 2:
                falha(arq, ch, "no_maximo_duas_lacunas",
                      f"{len(obrig)} lacunas obrigatórias numa tela só (README §4.2)")
        elif tipo == "lista":
            if not item.get("minimo_de_linhas"):
                falha(arq, ch, "lista_precisa_de_minimo", "`minimo_de_linhas` ausente")
        else:
            falha(arq, ch, "tipo_valido", f"tipo desconhecido: {tipo}")

        # --- regras 2 e 3, sobre todo texto que uma pessoa lê ---
        textos = [t for t in [texto, item.get("negativa")] if t]
        textos += list((item.get("opcoes") or {}).values())
        for t in textos:
            if NUMERO_PROIBIDO.search(t):
                falha(arq, ch, "nicho_sem_numero",
                      f"preço, prazo ou duração escrito na base: {t!r}")
            if INSTRUCAO.search(t):
                falha(arq, ch, "nicho_sem_instrucao",
                      f"parece ordem ao Otto, e o canal `fato` não carrega ordem: {t!r}")
            if len(t) > 200:
                falha(arq, ch, "ate_200_chars",
                      f"{len(t)} caracteres (conversa.md §2.3)")

        # --- coerência entre texto e lacunas ---
        if texto:
            nomes = set(LACUNA.findall(texto))
            if nomes != set(lacunas):
                falha(arq, ch, "lacuna_declarada",
                      f"texto usa {sorted(nomes)}, lacunas declaram {sorted(lacunas)}")
            dentro = set()
            for trecho in OPCIONAL.findall(texto):
                dentro |= set(LACUNA.findall(trecho))
            for nome, spec in lacunas.items():
                if not spec.get("obrigatoria") and nome not in dentro:
                    falha(arq, ch, "opcional_dentro_de_guillemets",
                          f"lacuna opcional `{nome}` fora de «…»: sem valor, sobra frase quebrada")
                if spec.get("obrigatoria") and nome in dentro:
                    falha(arq, ch, "obrigatoria_fora_de_guillemets",
                          f"lacuna obrigatória `{nome}` dentro de «…»")

        for nome, spec in lacunas.items():
            if spec.get("tipo") not in TIPOS_DE_LACUNA:
                falha(arq, ch, "tipo_de_lacuna", f"`{nome}`: tipo {spec.get('tipo')}")
            for f in spec.get("preenchivel_por", []):
                if f not in FONTES:
                    falha(arq, ch, "fonte_da_camada_zero", f"`{nome}`: fonte {f}")
            if spec.get("tipo") == "dinheiro" and spec.get("preenchivel_por") not in ([], ["catalogo"]):
                falha(arq, ch, "preco_so_do_dono",
                      f"`{nome}`: preço só vem do dono ou do catálogo (README §3.3)")

        for linha in item.get("linhas_sugeridas", []):
            if NUMERO_PROIBIDO.search(linha):
                falha(arq, ch, "nicho_sem_numero", f"linha de lista com valor: {linha!r}")


# --------------------------------------------------------------------------
# Regra 11 — `negativa_nao_fecha_a_porta`.  ESCRITA E AINDA NÃO LIGADA.
#
# Pendência do guardião da marca (2026-09-09, `experiencia.md` §12.13.12): o
# texto negativo é dito a um CLIENTE FINAL — outra audiência, `voz-e-tom.md` §2.
# Recusa que termina em "não fazemos" e ponto manda a pessoa embora, e o
# argumento que sustenta a rodada 1 ("resposta melhor que não sei e um
# encaminhamento a menos") só vale se ela não fizer isso.
#
# Vale para os DOIS carregadores de texto negativo: `negativa` (item `fato`) e
# `opcoes.nao` (item `escolha`).  Contrato em README §5.2.
#
# Não está em `confere()` de propósito: liga depois de os arquivos serem
# reescritos (README §12, pendência 9).  Regra que nasce vermelha é regra que
# alguém desliga — a mesma ordem da décima regra.
# --------------------------------------------------------------------------

FECHA_VALIDOS = {"fronteira", "encaminha", "basta"}

# `basta` só é alcançável onde a recusa é resposta completa e não sobra querer:
# comodidade e funcionamento.  Fora daqui, ou tem fronteira ou entrega a alguém.
ASSUNTOS_QUE_ADMITEM_BASTA = {"endereco", "horario"}

NEGACAO = re.compile(r"\b(n[ãa]o|nem|sem|nenhum[ao]?|nunca)\b", re.IGNORECASE)
FRONTEIRA_LEXICAL = re.compile(r"\b(s[óo]|somente|apenas)\b", re.IGNORECASE)
# Frase de encaminhamento é do preset e do modo (ADR 012, estilos-de-atendimento).
# Dentro do item ela vira ordem ao Otto (§1.1) e promete atendimento no modo Recado.
ENCAMINHAMENTO_NO_TEXTO = re.compile(
    r"(passar? para|passo para|equipe|algu[ée]m|retorn|entro em contato|"
    r"verific|te aviso|chamar? algu)",
    re.IGNORECASE,
)


def _oracoes(texto):
    # Vírgula separa oração em português e é onde mora metade das fronteiras
    # ("Atendemos por ordem de chegada, sem precisar marcar").
    return [o.strip() for o in re.split(r"[.;,]", texto) if o.strip()]


def _tem_oracao_afirmativa(texto):
    """Uma oração afirmativa sobre a empresa: sem negação, ou com fronteira lexical.

    Checagem de FORMA, não de substância. Que a fronteira seja verdadeira e fale
    do mesmo sujeito é regra de escrita (README §5.2) e caso de avaliação (`G-02`),
    não regex: as tentativas de mecanizar isso reprovaram 5 itens corretos para
    pegar 1 errado, e regra assim é regra que alguém desliga (§11.1).
    """
    for o in _oracoes(texto):
        if len(o.split()) < 2:
            continue  # fragmento solto não carrega fronteira
        if not NEGACAO.search(o) or FRONTEIRA_LEXICAL.search(o):
            return True
    return False


def regra_11(caminho):
    """Devolve lista de (chave, detalhe). Não escreve em `falhas`: não está ligada."""
    arq = caminho.name
    base = yaml.safe_load(caminho.read_text(encoding="utf-8"))
    achados = []
    for item in base.get("itens", []):
        ch = item.get("chave", "<sem chave>")
        negativos = [t for t in [item.get("negativa"),
                                 (item.get("opcoes") or {}).get("nao")] if t]
        if not negativos:
            continue

        fecha = item.get("negativa_fecha")
        if fecha not in FECHA_VALIDOS:
            achados.append((ch, f"`negativa_fecha` ausente ou inválido: {fecha!r}"))
            fecha = None

        for t in negativos:
            if fecha == "fronteira" and not _tem_oracao_afirmativa(t):
                achados.append((ch, f"`fronteira` sem oração afirmativa: {t!r}"))
            if fecha == "encaminha":
                if ENCAMINHAMENTO_NO_TEXTO.search(t):
                    achados.append((ch, f"frase de encaminhamento dentro do item: {t!r}"))
                if _tem_oracao_afirmativa(t):
                    achados.append((ch, f"`encaminha` com oração afirmativa — declare `fronteira`: {t!r}"))
            if fecha == "basta" and item.get("assunto") not in ASSUNTOS_QUE_ADMITEM_BASTA:
                achados.append((ch, f"`basta` em assunto `{item.get('assunto')}`: fora de {sorted(ASSUNTOS_QUE_ADMITEM_BASTA)}"))
    return achados


def diagnostico():
    """Roda as regras escritas e não ligadas. Não afeta o código de saída."""
    arquivos = sorted(AQUI.glob("*.yml")) + sorted((AQUI / "_comum").glob("*.yml"))
    total_neg = 0
    reprovados = 0
    print("\n--- regra 11 `negativa_nao_fecha_a_porta` (escrita, não ligada) ---\n")
    for c in arquivos:
        base = yaml.safe_load(c.read_text(encoding="utf-8"))
        n = sum(1 for i in base.get("itens", [])
                if i.get("negativa") or (i.get("opcoes") or {}).get("nao"))
        total_neg += n
        achados = regra_11(c)
        chaves = {a[0] for a in achados}
        reprovados += len(chaves)
        print(f"{c.name:36} {n:2} negativas, {len(chaves):2} reprovam")
        for chave, detalhe in achados:
            print(f"    {chave:32} {detalhe}")
    print(f"\n{total_neg} textos negativos, {reprovados} itens reprovam "
          f"({reprovados / total_neg:.0%}).")
    censo_de_forma(arquivos)


def censo_de_forma(arquivos):
    """O que o texto de hoje suporta, ignorando o campo que ainda não existe.

    Responde a pergunta do guardião: quantas negativas já estão escritas na
    forma que não fecha a porta?
    """
    print("\n--- censo: o que o texto de hoje já suporta ---\n")
    ok, sem_fronteira = [], []
    for c in arquivos:
        base = yaml.safe_load(c.read_text(encoding="utf-8"))
        for item in base.get("itens", []):
            for t in [item.get("negativa"), (item.get("opcoes") or {}).get("nao")]:
                if not t:
                    continue
                alvo = ok if _tem_oracao_afirmativa(t) else sem_fronteira
                alvo.append((c.name, item["chave"], item.get("assunto"), t))
    total = len(ok) + len(sem_fronteira)
    print(f"  suportam `fronteira` hoje ....... {len(ok):2}/{total} ({len(ok)/total:.0%})")
    print(f"  não suportam .................... {len(sem_fronteira):2}/{total} "
          f"({len(sem_fronteira)/total:.0%})\n")
    for arq, chave, assunto, t in sem_fronteira:
        gate = "basta?" if assunto in ASSUNTOS_QUE_ADMITEM_BASTA else "encaminha ou reescreve"
        print(f"  {arq[:26]:27} {chave:32} {assunto:18} [{gate}]  {t}")


def main():
    arquivos = sorted(AQUI.glob("*.yml")) + sorted((AQUI / "_comum").glob("*.yml"))
    for c in arquivos:
        confere(c)
    if "--diagnostico" in sys.argv:
        diagnostico()
    if falhas:
        print(f"{len(falhas)} falha(s):\n")
        for f in falhas:
            print("  " + f)
        sys.exit(1)
    print(f"{len(arquivos)} arquivos, nenhuma falha.")


if __name__ == "__main__":
    main()
