#!/usr/bin/env python3
"""
Mede o tamanho de cada base do nicho, renderizada como ela apareceria dentro de
<base> no bloco 3 (formato de `docs/tecnico/conversa.md` §2.4).

Isto NÃO é o renderizador de produção. O de produção é do especialista-backend
(contrato em `conversa.md` §8, item 1: determinístico, ordenado por id, sem
relógio, com escape do delimitador). Este script existe para eu conseguir
responder "quantos tokens cada base ocupa" sem chutar, e para deixar o texto
renderizado em disco, de modo que quem tiver chave da API rode `count_tokens`
com um comando e substitua a estimativa por medição.

Uso:
    python3 medir.py                 # imprime a tabela e escreve _teste/render/
    python3 medir.py --so-tabela     # não escreve arquivo
"""

import sys
import pathlib
import datetime
import re

import yaml

AQUI = pathlib.Path(__file__).parent
DATA = "2026-09-09"
FONTE = "dono"

# Razão caractere→token. NÃO VERIFICADA para português com o tokenizador do
# Claude. É estimativa declarada, não medição. A rodada 1 substitui por
# `messages.count_tokens` (README, pendência 1).
RAZAO_OTIMISTA = 4.5
RAZAO_CENTRAL = 4.0
RAZAO_PESSIMISTA = 3.5


def carrega(caminho):
    with open(caminho, encoding="utf-8") as f:
        return yaml.safe_load(f)


def preenche(texto, lacunas, valores):
    """Preenche as lacunas obrigatórias, remove as orações «...» de lacuna
    opcional não preenchida. Aqui, para medir, toda opcional é considerada
    NÃO preenchida: é o caso mais provável e o mais barato."""
    # remove os trechos opcionais inteiros
    texto = re.sub(r"«[^»]*»", "", texto)
    for nome, spec in (lacunas or {}).items():
        marcador = "{" + nome + "}"
        if marcador in texto:
            texto = texto.replace(marcador, valores["por_tipo"][spec["tipo"]])
    return texto


def junta(nicho_arq):
    base = carrega(AQUI / nicho_arq)
    itens = list(base.get("itens", []))
    for inc in base.get("inclui", []):
        itens += carrega(AQUI / inc).get("itens", [])
    for inc in base.get("inclui_condicional", []):
        itens += carrega(AQUI / inc["arquivo"]).get("itens", [])
    return base, itens


def dez_telas(itens):
    """A regra de montagem do README §4.2, com a camada 0 tendo preenchido nada
    (pior caso, e o mais provável neste público: perfil do WhatsApp magro).
    Item `encaminha_sempre` não ocupa tela: não há nada para conferir nele."""
    conferiveis = [i for i in itens if not i.get("encaminha_sempre")]
    conferiveis.sort(key=lambda i: (i["prioridade"], i["ordem"]))
    return conferiveis[:10]


def renderiza(nicho_arq, valores, itens=None):
    base = carrega(AQUI / nicho_arq)
    if itens is None:
        _, itens = junta(nicho_arq)

    linhas = []
    n_render = n_rascunho = 0
    for i, item in enumerate(itens, start=1):
        ident = f"i{i}"
        tipo = item["tipo"]
        assunto = item["assunto"]

        if item.get("encaminha_sempre"):
            # metadado de roteamento: não vira linha no <base> (README §3.2)
            n_rascunho += 1
            continue

        if tipo == "fato":
            texto = preenche(item["texto"], item.get("lacunas"), valores)
            linhas.append(f"[{ident}|{assunto}|{DATA}|{FONTE}] {texto}")
            n_render += 1
        elif tipo == "escolha":
            texto = item["opcoes"][valores["escolha"]]
            linhas.append(f"[{ident}|{assunto}|{DATA}|{FONTE}] {texto}")
            n_render += 1
        elif tipo == "lista":
            v = valores["por_linha_de_lista"][item["lacuna_por_linha"]["tipo"]]
            corpo = " | ".join(f"{r} {v}" for r in item["linhas_sugeridas"])
            linhas.append(
                f"[{ident}|{assunto}|lista|completa|{DATA}|{FONTE}] {item['cabecalho']}"
            )
            linhas.append(f"  {corpo}")
            n_render += 1
        else:
            raise SystemExit(f"tipo desconhecido em {nicho_arq}: {tipo}")

    cabecalho = f'<base empresa="Empresa de teste" gerada_em="{DATA}">'
    texto = "\n".join([cabecalho] + linhas + ["</base>"])
    return base, texto, n_render, n_rascunho


def main():
    valores = carrega(AQUI / "_teste" / "valores.yml")
    arquivos = sorted(p.name for p in AQUI.glob("*.yml"))
    escreve = "--so-tabela" not in sys.argv
    if escreve:
        (AQUI / "_teste" / "render").mkdir(parents=True, exist_ok=True)

    print("A. Depois do onboarding — só as 10 telas conferidas (README §4.2)")
    print("B. Base do nicho inteira — se o dono conferir tudo, inclusive o que")
    print("   entrou pelas outras portas nas semanas seguintes\n")
    print(
        f"{'nicho':30} {'A itens':>8} {'A chars':>8} {'A tok':>7} {'A %':>6}  "
        f"{'B itens':>8} {'B chars':>8} {'B tok':>7} {'B %':>6}"
    )
    print("-" * 100)
    for arq in arquivos:
        base, itens = junta(arq)

        _, tex_a, n_a, _ = renderiza(arq, valores, dez_telas(itens))
        _, tex_b, n_b, rasc_b = renderiza(arq, valores, itens)

        tok_a = len(tex_a) / RAZAO_PESSIMISTA
        tok_b = len(tex_b) / RAZAO_PESSIMISTA
        print(
            f"{base['nicho']:30} {n_a:8} {len(tex_a):8} {tok_a:7.0f} "
            f"{100*tok_a/4000:5.1f}%  {n_b:8} {len(tex_b):8} {tok_b:7.0f} "
            f"{100*tok_b/4000:5.1f}%"
        )
        if escreve:
            d = AQUI / "_teste" / "render"
            (d / (base["nicho"] + "-10-telas.txt")).write_text(tex_a + "\n", encoding="utf-8")
            (d / (base["nicho"] + "-completa.txt")).write_text(tex_b + "\n", encoding="utf-8")

    print("-" * 100)
    print(
        f"\nRazão caractere→token usada: central {RAZAO_CENTRAL}, "
        f"pessimista {RAZAO_PESSIMISTA}. NÃO VERIFICADA — ver README, pendência 1."
    )
    print("A coluna que vale para planejamento é a pessimista.")
    if escreve:
        print(f"\nTexto renderizado em {AQUI / '_teste' / 'render'}/")
        print("Para medir de verdade, com chave da API:")
        print("  client.messages.count_tokens(model='claude-sonnet-5', "
              "messages=[{'role':'user','content':open(arquivo).read()}])")


if __name__ == "__main__":
    main()
