#!/usr/bin/env python3
"""Sócios de empresa por partido — dispersão bancada × proporção.

Lê dados.json e reagrega do zero, sem número fixo no código: quando a extração
for atualizada, o gráfico se refaz sozinho.

O eixo x é o tamanho da bancada porque é ele que decide o quanto a proporção
significa alguma coisa. A banda ao fundo é a faixa em que um partido cairia por
puro acaso se sorteasse seus deputados da população inteira — ela abre para a
esquerda, e é por isso que 91% numa bancada de onze não diz nada.
"""
import json
from math import comb
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.lines import Line2D

RAIZ = Path(__file__).resolve().parent.parent
SAIDA = RAIZ / "socios-por-partido.png"

# Siglas que trocaram de nome. Sem fundir, a grafia dupla que existe no próprio
# meta.partidos ("PCDOB" e "PC do B") vira duas linhas e inventa um achado que
# não existe — 0% de sócios numa bancada de seis.
FUNDE = {"PCDOB": "PC do B", "PMDB": "MDB", "PR": "PL", "PRB": "REPUBLICANOS",
         "PSL": "UNIÃO", "DEM": "UNIÃO", "PFL": "UNIÃO", "PPS": "CIDADANIA"}

MIN_BANCADA = 10   # abaixo disso a faixa do acaso cobre quase todo o eixo

# ── superfície e tinta: as mesmas variáveis do index.html ──────────────────
PAPEL, TINTA, TINTA2, TINTA3 = "#e9ede8", "#131816", "#5b6663", "#828c88"
REGUA, SUNK = "#ccd4cd", "#dfe5de"

# Paleta categórica por espectro, validada all-pairs contra o papel #e9ede8 com
# o validador do skill dataviz: separação sob daltonismo ΔE 9,6 (protan) e 17,3
# a olho normal, contraste acima de 3:1 nas três. O piso de croma reprova o
# cinza — de propósito: aquele check existe para pegar hue que vira cinza sem
# querer, e aqui o cinza é a informação (o centro é o sem-cor da política).
COR = {"esquerda": "#c96430", "centro": "#5f6a66", "direita": "#2a78d6"}
ORDEM_ESPECTRO = ["esquerda", "centro", "direita"]

# Uma família só, com peso de verdade para o título. Avenir Next
# aguenta corpo pequeno melhor que a serifa do site e resolve texto
# e número sem trocar de fonte no meio do gráfico.
SANS = "Avenir Next"


def agrega():
    D = json.loads((RAIZ / "dados.json").read_text())
    M, pessoas = D["meta"], D["pessoas"]
    partidos, espectro_de = M["partidos"], M["espectro_por_partido"]

    grupos = {}
    for p in pessoas:
        idx = p[5][-1][1]           # partido do último ponto da série
        if idx < 0:
            continue
        sigla = partidos[idx]
        grupos.setdefault(FUNDE.get(sigla, sigla), []).append(p)

    # Sócio = tem ao menos uma empresa no cruzamento com a Receita.
    def socios(v):
        return sum(1 for p in v if p[3] > 0)

    linhas = [{"sigla": k, "n": len(v), "socios": socios(v),
               "pct": socios(v) / len(v) * 100,
               "espectro": espectro_de.get(k) or "centro"}
              for k, v in grupos.items() if len(v) >= MIN_BANCADA]
    linhas.sort(key=lambda r: -r["pct"])

    fora = [p for v in grupos.values() if len(v) < MIN_BANCADA for p in v]
    # A média é da turma inteira, não só de quem entrou no gráfico.
    total_socios = sum(1 for p in pessoas if p[3] > 0)
    return linhas, {
        "pessoas": len(pessoas), "socios": total_socios,
        "media": total_socios / len(pessoas) * 100,
        "no_grafico": sum(r["n"] for r in linhas),
        "fora": len(fora), "fora_siglas": sum(1 for v in grupos.values()
                                              if len(v) < MIN_BANCADA),
        "gerado": M.get("gerado", ""),
    }


def faixa(n, p, alpha=0.05):
    """Percentis 2,5 e 97,5 de Binomial(n, p)/n, por soma direta da PMF.

    Sem SciPy: n aqui não passa de algumas centenas, e comb() dá conta.
    """
    pmf = [comb(n, k) * p**k * (1 - p)**(n - k) for k in range(n + 1)]
    acc, lo = 0.0, 0
    for k, v in enumerate(pmf):
        acc += v
        if acc > alpha / 2:
            lo = k
            break
    acc, hi = 0.0, n
    for k in range(n, -1, -1):
        acc += pmf[k]
        if acc > alpha / 2:
            hi = k
            break
    return lo / n * 100, hi / n * 100


def suaviza(vals, janela=9):
    """Média móvel centrada.

    A faixa exata é uma escada: como o numerador só anda de um em um, o limite
    salta a cada n. Esse serrilhado é artefato da contagem inteira, não
    informação — e desenhado cru rouba a atenção do dado. A média móvel devolve
    a curva que a escada aproxima, sem mexer nos valores citados no texto, que
    saem de faixa() direto.
    """
    r = janela // 2
    return [sum(vals[max(0, i - r):i + r + 1]) / len(vals[max(0, i - r):i + r + 1])
            for i in range(len(vals))]



# Deslocamento do rótulo, em pontos tipográficos, ajustado à mão olhando o PNG.
# São dezoito pontos fixos: resolver na mão sai mais limpo do que qualquer
# repulsão automática, e não depende de biblioteca extra. (dx, dy, alinhamento).
# O rótulo traz só a sigla — a porcentagem já está no eixo, e repeti-la em cada
# ponto enche o gráfico de número que ninguém compara.
ROTULO = {
    "NOVO":          (13,   0, "left"),
    "PV":            (13,   0, "left"),
    "PODE":          (13,   0, "left"),
    "SOLIDARIEDADE": (13,   0, "left"),
    "AVANTE":        (13,  10, "left"),
    "PTB":           (13, -10, "left"),
    "PDT":           (13,   0, "left"),
    "PSB":           (13,  -1, "left"),
    "PSDB":          (13,   2, "left"),
    "PSD":           (-13,  1, "right"),
    "MDB":           (0,   14, "center"),
    "PL":            (13,   1, "left"),
    "UNIÃO":         (13,   8, "left"),
    "PP":            (13,  -6, "left"),
    "REPUBLICANOS":  (0,  -24, "center"),
    "PT":            (13,   0, "left"),
    "PC do B":       (13,   0, "left"),
    "PSOL":          (13,   0, "left"),
}

XMIN, XMAX, YMIN, YMAX = 8.8, 260, -3, 105


def desenha(linhas, meta):
    fig = plt.figure(figsize=(12.5, 8.5), dpi=200, facecolor=PAPEL)
    ax = fig.add_axes([0.088, 0.175, 0.895, 0.615])
    ax.set_facecolor(PAPEL)
    ax.set_xscale("log")
    ax.set_xlim(XMIN, XMAX)
    ax.set_ylim(YMIN, YMAX)

    # ── faixa do acaso, ao fundo ──────────────────────────────────────────
    p0 = meta["media"] / 100
    ns = list(range(9, int(XMAX) + 1))
    los, his = zip(*(faixa(n, p0) for n in ns))
    ax.fill_between(ns, suaviza(los), suaviza(his), color=SUNK, zorder=0,
                    linewidth=0)
    ax.axhline(meta["media"], color=TINTA3, linewidth=1.1,
               linestyle=(0, (5, 4)), zorder=1)

    # ── moldura discreta ──────────────────────────────────────────────────
    for y in (0, 25, 50, 75, 100):
        ax.axhline(y, color=REGUA, linewidth=0.7, zorder=0.5)
    for s in ax.spines.values():
        s.set_visible(False)
    ax.tick_params(which="both", length=0, colors=TINTA2, pad=8)
    ax.set_yticks([0, 25, 50, 75, 100])
    ax.set_yticklabels(["0%", "25%", "50%", "75%", "100%"],
                       fontfamily=SANS, fontsize=11, color=TINTA2)
    ax.set_xticks([10, 20, 40, 80, 150])
    ax.set_xticklabels(["10", "20", "40", "80", "150"],
                       fontfamily=SANS, fontsize=11, color=TINTA2)
    ax.xaxis.set_minor_locator(matplotlib.ticker.NullLocator())
    ax.yaxis.set_minor_locator(matplotlib.ticker.NullLocator())
    ax.set_xlabel("tamanho da bancada", fontfamily=SANS, fontsize=12,
                  color=TINTA2, labelpad=12)
    ax.set_ylabel("% com sociedade empresarial", fontfamily=SANS, fontsize=12,
                  color=TINTA2, labelpad=12)

    # ── pontos e siglas ───────────────────────────────────────────────────
    for r in linhas:
        ax.plot(r["n"], r["pct"], "o", markersize=11,
                color=COR[r["espectro"]], markeredgecolor=PAPEL,
                markeredgewidth=2, zorder=5, clip_on=False)
    for r in linhas:
        dx, dy, ha = ROTULO.get(r["sigla"], (13, 0, "left"))
        ax.annotate(r["sigla"], xy=(r["n"], r["pct"]), xytext=(dx, dy),
                    textcoords="offset points", ha=ha, va="center",
                    fontfamily=SANS, fontsize=11.5, color=TINTA,
                    zorder=6, annotation_clip=False)

    # Duas etiquetas curtas, e só. Sem elas a linha tracejada e a banda ficam
    # sem nome; com mais que isso o gráfico vira texto corrido.
    ax.text(XMAX, meta["media"] + 1.6, f"média  {meta['media']:.0f}%",
            fontfamily=SANS, fontsize=11.5, color=TINTA2, ha="right",
            va="bottom", zorder=4)
    ax.text(XMIN * 1.04, 52, "faixa do acaso, 95%", fontfamily=SANS,
            fontsize=11.5, color=TINTA2, ha="left", va="center", zorder=4)

    # ── legenda ───────────────────────────────────────────────────────────
    ax.legend(handles=[Line2D([], [], marker="o", linestyle="", markersize=9,
                              color=COR[e], label=e) for e in ORDEM_ESPECTRO],
              loc="lower left", bbox_to_anchor=(0.0, 1.025), ncol=3,
              frameon=False, handletextpad=0.5, columnspacing=2.0,
              prop={"family": SANS, "size": 12}, labelcolor=TINTA2)

    # ── título e rodapé ───────────────────────────────────────────────────
    fig.text(0.058, 0.955, "Parlamentares com sociedades empresariais por "
             "Partido", fontfamily=SANS, fontweight="demibold", fontsize=25,
             color=TINTA, va="top")
    fig.text(0.058, 0.898,
             "Deputados federais eleitos entre 2006 e 2022, no quadro de "
             "sócios da Receita Federal", fontfamily=SANS, fontsize=13.5,
             color=TINTA2, va="top")
    fig.text(0.058, 0.082,
             "TSE e Receita Federal (set/2024). Cruzamento por nome e seis "
             "dígitos do CPF: é indício, não fato.\n"
             f"{len(linhas)} partidos com {MIN_BANCADA}+ deputados, "
             f"{meta['no_grafico']} das {meta['pessoas']} pessoas. Partido é o "
             "da última declaração; siglas renomeadas foram fundidas.",
             fontfamily=SANS, fontsize=10, color=TINTA3, va="top",
             linespacing=1.8)

    fig.savefig(SAIDA, facecolor=PAPEL)
    plt.close(fig)


if __name__ == "__main__":
    linhas, meta = agrega()
    print(f"{'partido':16s} {'n':>4} {'sócios':>7} {'%':>7}   espectro")
    for r in linhas:
        print(f"{r['sigla']:16s} {r['n']:4d} {r['socios']:7d} "
              f"{r['pct']:6.1f}%   {r['espectro']}")
    print(f"\nmédia geral: {meta['socios']}/{meta['pessoas']} = "
          f"{meta['media']:.1f}%")
    desenha(linhas, meta)
    print(f"\n→ {SAIDA}")
