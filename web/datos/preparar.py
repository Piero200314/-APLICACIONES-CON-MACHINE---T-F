"""Prepara los gráficos de contexto y, opcionalmente, un CSV de trabajo privado."""
import argparse
import csv
import json
from collections import Counter
from datetime import datetime
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
GREEN, BLUE, GOLD = "#057d72", "#294b75", "#d79c38"
plt.rcParams.update({"font.size": 10, "font.family": "DejaVu Sans", "text.color": "#173451",
                     "axes.labelcolor": "#173451", "xtick.color": "#405970", "ytick.color": "#405970",
                     "axes.spines.top": False, "axes.spines.right": False,
                     "axes.spines.left": False, "axes.spines.bottom": False,
                     "savefig.facecolor": "white", "axes.axisbelow": True})
AGES = ["0–17", "18–29", "30–44", "45–59", "60+"]
YES, NO, UNKNOWN = "Con seguro", "Sin seguro", "Sin dato"

def number(text, minimum, maximum):
    try:
        value = float(text.replace(",", "."))
    except ValueError:
        return None
    return value if minimum <= value <= maximum else None

def normalize(row):
    try:
        date = datetime.strptime(row["FECHA_HORA"].strip(), "%Y%m%d").date().isoformat()
    except ValueError:
        date = ""
    age = number(row["EDAD"], 0, 120)
    group = next((label for lim, label in zip([18, 30, 45, 60, 121], AGES) if age < lim), UNKNOWN) if age is not None else UNKNOWN
    return {
        "FECHA_HORA": date, "DISTRITO": row["DISTRITO"].strip().title(),
        "SEXO": row["SEXO"].strip().capitalize() or UNKNOWN, "EDAD": age, "GRUPO_EDAD": group,
        "TENENCIA_SEGURO": {"si": YES, "sí": YES, "no": NO}.get(row["TENENCIA_SEGURO"].strip().lower(), UNKNOWN),
        "PROBLEMAS_SALUD": row["PROBLEMAS_SALUD"].strip() or UNKNOWN,
        "ATENCION_PROBLEMA_SALUD": row["ATENCION_PROBLEMA_SALUD"].strip() or UNKNOWN,
        "TALLA_ACTUAL": number(row["TALLA_ACTUAL"], 40, 250),
        "PESO_ACTUAL": number(row["PESO_ACTUAL"], 2, 300),
    }

def fmt(value):
    return f"{value:,}".replace(",", " ")

def pct(value):
    return f"{value:.1f}".replace(".", ",") + " %"

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("origen", type=Path)
    parser.add_argument("--csv-limpio", type=Path)
    args = parser.parse_args()
    with args.origen.open(encoding="utf-8-sig", newline="") as source:
        rows = [normalize(row) for row in csv.DictReader(source)]
    if not rows:
        parser.error("El CSV no contiene registros.")
    if args.csv_limpio:
        output = args.csv_limpio.resolve()
        if output == args.origen.resolve() or output.is_relative_to(ROOT / "public"):
            parser.error("Usa una ruta distinta del original y fuera de public.")
        output.parent.mkdir(parents=True, exist_ok=True)
        with output.open("w", encoding="utf-8-sig", newline="") as clean:
            writer = csv.DictWriter(clean, fieldnames=list(rows[0]))
            writer.writeheader()
            writer.writerows(rows)

    counts = Counter(r["TENENCIA_SEGURO"] for r in rows)
    valid = counts[YES] + counts[NO]
    if not valid:
        parser.error("No hay respuestas válidas de seguro.")
    uninsured = 100 * counts[NO] / valid
    figures = []

    def save(figure, title, explanation, alt):
        key = f"{len(figures)+1:02}"
        figure.savefig(ROOT / "public/graficos" / f"{key}.png", dpi=140, bbox_inches="tight", pad_inches=.22)
        plt.close(figure)
        figures.append({"id": key, "title": title, "summary": explanation, "alt": alt})

    def chart(grid="y"):
        fig, ax = plt.subplots(figsize=(7.2, 3.6), layout="constrained")
        if grid:
            ax.grid(axis=grid, color="#e7eff3")
        ax.tick_params(length=0)
        return fig, ax

    def horizontal(entries):
        fig, ax = chart("x")
        labels, values = zip(*entries)
        bars = ax.barh(labels, values, color=GREEN)
        ax.invert_yaxis()
        ax.margins(x=.2)
        ax.bar_label(bars, labels=[fmt(v) for v in values], padding=5, color=BLUE)
        return fig

    by_month = Counter(r["FECHA_HORA"][:7] for r in rows if r["FECHA_HORA"])
    months = sorted(by_month)
    fig, ax = chart()
    ax.plot(range(len(months)), [by_month[m] for m in months], color=GREEN, linewidth=2.4)
    marks = range(0, len(months), max(1, len(months)//6))
    ax.set_xticks(list(marks), [months[i] for i in marks], rotation=22)
    save(fig, "Registros por mes", f"El mes con más registros fue {max(by_month,key=by_month.get)}, con {fmt(max(by_month.values()))}. La línea muestra el volumen registrado.", "Línea mensual de la cantidad de registros.")

    fig, ax = chart(None)
    categories = [k for k in [YES, NO, UNKNOWN] if counts[k]]
    wedges, _ = ax.pie([counts[k] for k in categories], startangle=90, colors=[{YES:GREEN, NO:BLUE, UNKNOWN:GOLD}[k] for k in categories], wedgeprops={"width":.32, "edgecolor":"white"})
    ax.text(0, 0, fmt(len(rows)), ha="center", va="center", color=BLUE, size=16, weight="bold")
    ax.legend(wedges, [f"{k} · {fmt(counts[k])}" for k in categories], loc="center left", bbox_to_anchor=(1, .5), frameon=False)
    save(fig, "Tenencia de seguro", f"Se registraron {fmt(counts[YES])} respuestas con seguro, {fmt(counts[NO])} sin seguro y {fmt(counts[UNKNOWN])} sin dato.", "Anillo con el total de cada categoría de seguro.")

    households = Counter(r["SEXO"] for r in rows)
    save(horizontal(households.most_common()), "Registros por sexo", "Este gráfico describe la composición de los registros, incluidos los casos con el dato faltante.", "Barras horizontales con registros por sexo.")

    by_age = {group: Counter(r["TENENCIA_SEGURO"] for r in rows if r["GRUPO_EDAD"] == group) for group in AGES}
    comparison = [(group, 100*c[NO]/(c[YES]+c[NO])) for group,c in by_age.items() if c[YES]+c[NO]]
    fig, ax = chart()
    bars = ax.bar([group for group,_ in comparison], [v for _,v in comparison], color=GREEN)
    ax.bar_label(bars, labels=[pct(v) for _,v in comparison], padding=3, color=BLUE)
    ax.margins(y=.2)
    ax.set_ylabel("Respuestas válidas (%)")
    save(fig, "Porcentaje sin seguro por edad", f"En el conjunto, {pct(uninsured)} de las respuestas válidas indicaron que no tenían seguro. Cada barra usa las respuestas válidas de su grupo.", "Columnas con porcentaje sin seguro por grupo de edad.")

    fig, ax = chart()
    ax.hist([r["EDAD"] for r in rows if r["EDAD"] is not None], bins=range(0, 131, 10), color=BLUE, edgecolor="white")
    ax.set(xlabel="Edad (años)", ylabel="Registros")
    save(fig, "Distribución de edades", "El histograma agrupa las edades válidas en intervalos de diez años.", "Histograma de edades.")

    pairs = Counter((int(r["TALLA_ACTUAL"]//5)*5, int(r["PESO_ACTUAL"]//5)*5) for r in rows if r["TALLA_ACTUAL"] is not None and r["PESO_ACTUAL"] is not None)
    combined = [(x+2.5, y+2.5, n) for (x,y),n in pairs.items() if n >= 10]
    fig, ax = chart()
    x,y,n = zip(*combined)
    ax.scatter(x, y, s=np.sqrt(n)*5, alpha=.60, color=GREEN)
    ax.set(xlabel="Talla (cm)", ylabel="Peso (kg)")
    save(fig, "Talla y peso", "Cada punto resume un intervalo de talla y peso con al menos 10 registros. El tamaño representa la frecuencia.", "Dispersión de grupos agregados de talla y peso.")

    for field, title, summary in [
        ("PROBLEMAS_SALUD", "Problemas de salud reportados", "Se muestran las cinco respuestas más frecuentes entre los registros que reportaron algún problema."),
        ("ATENCION_PROBLEMA_SALUD", "Formas de atención reportadas", "Se muestran las cinco respuestas más frecuentes entre quienes indicaron una forma de atención."),
    ]:
        import textwrap
        responses = Counter(r[field] for r in rows if r[field].casefold() not in {"sin dato", "ninguno"})
        plot = horizontal([("\n".join(textwrap.wrap(label, 35)), n) for label,n in responses.most_common(5)])
        save(plot, title, summary, "Barras horizontales con las cinco respuestas más frecuentes.")

    fig, ax = chart()
    bottom = np.zeros(len(AGES))
    for status, color in [(YES,GREEN),(NO,BLUE),(UNKNOWN,GOLD)]:
        values = [by_age[group][status] for group in AGES]
        ax.bar(AGES, values, bottom=bottom, color=color, label=status)
        bottom += values
    ax.legend(frameon=False, loc="upper left")
    save(fig, "Cobertura de seguro por edad", "Los segmentos muestran el número de registros con seguro, sin seguro y sin dato en cada grupo con edad válida.", "Barras apiladas por grupo de edad y cobertura.")

    fig, ax = chart()
    sex = ["Femenino", "Masculino"]
    x = np.arange(len(sex))
    for status, color, offset in [(YES,GREEN,-.19),(NO,BLUE,.19)]:
        ax.bar(x + offset, [sum(r["SEXO"]==s and r["TENENCIA_SEGURO"]==status for r in rows) for s in sex], .36, color=color, label=status)
    ax.set_xticks(x, sex)
    ax.legend(frameon=False, loc="upper right")
    save(fig, "Seguro según sexo registrado", "Se comparan los conteos con y sin seguro entre los dos grupos consignados. Se excluyen los registros sin dato en sexo o seguro.", "Columnas agrupadas por sexo y tenencia de seguro.")

    dashboard = {"metrics": [{"label":"Registros analizados","value":fmt(len(rows))},{"label":"Con seguro","value":fmt(counts[YES])},{"label":"Sin seguro","value":fmt(counts[NO])},{"label":"Sin seguro · respuestas válidas","value":pct(uninsured)}],
                 "figures": figures, "missing":counts[UNKNOWN], "districts":sorted({r["DISTRITO"] for r in rows}), "valid":valid}
    (ROOT / "src/dashboard.json").write_text(json.dumps(dashboard,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(f"{len(rows)} registros · {valid} respuestas válidas · {counts[UNKNOWN]} sin dato · {uninsured:.2f}% sin seguro")

if __name__ == "__main__":
    main()
