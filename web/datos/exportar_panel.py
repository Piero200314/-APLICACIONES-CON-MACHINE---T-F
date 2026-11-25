"""Exporta únicamente los agregados fijos que consume el panel React."""
import argparse
import csv
import json
from collections import Counter
from pathlib import Path

from preparar import AGES, NO, UNKNOWN, YES, normalize

MINIMUM = 10
ROOT = Path(__file__).resolve().parents[1]


def published(count):
    return count if count == 0 or count >= MINIMUM else None


def series(label, values):
    return {"label": label, "values": [published(value) for value in values]}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("csv", type=Path)
    args = parser.parse_args()
    with args.csv.open(encoding="utf-8-sig", newline="") as source:
        rows = [normalize(row) for row in csv.DictReader(source)]

    insurance = Counter(r["TENENCIA_SEGURO"] for r in rows)
    statuses = [YES, NO, UNKNOWN]
    by_age = {label: Counter(r["TENENCIA_SEGURO"] for r in rows if r["GRUPO_EDAD"] == label) for label in AGES}
    valid = insurance[YES] + insurance[NO]
    missing = insurance[UNKNOWN]
    charts = []

    def chart(key, title, kind, labels, datasets, description, percent=False):
        charts.append(dict(id=key, title=title, type=kind, labels=list(labels), series=datasets, description=description, percent=percent))

    def top_categories(field, key, title, description):
        counts = Counter(r[field] for r in rows if r[field].casefold() not in {"sin dato", "ninguno"})
        entries = [(name, count) for name, count in counts.most_common(5) if count >= MINIMUM]
        chart(key, title, "horizontal", [name for name, _ in entries],
              [series("Registros", [count for _, count in entries])], description)

    months = Counter(r["FECHA_HORA"][:7] for r in rows if r["FECHA_HORA"])
    first_month, last_month = min(months), max(months)
    year, month = map(int, first_month.split("-"))
    month_labels = []
    while f"{year:04d}-{month:02d}" <= last_month:
        month_labels.append(f"{year:04d}-{month:02d}")
        year, month = (year + 1, 1) if month == 12 else (year, month + 1)
    chart("01", "Registros por mes", "line", month_labels, [series("Registros", [months[m] for m in month_labels])],
          "Evolución del volumen de registros según la fecha del censo.")
    chart("02", "Tenencia de seguro", "doughnut", statuses, [series("Registros", [insurance[label] for label in statuses])],
          "Selecciona una categoría en la leyenda para mostrarla u ocultarla.")
    sex = Counter(r["SEXO"] for r in rows)
    chart("03", "Registros por sexo", "bar", list(sex), [series("Registros", list(sex.values()))],
          "Distribución de los registros según el sexo consignado.")
    rates = []
    for group in AGES:
        yes, no = by_age[group][YES], by_age[group][NO]
        rates.append(round(100 * no / (yes + no), 1) if yes >= MINIMUM and no >= MINIMUM else None)
    chart("04", "Sin seguro por grupo de edad", "bar", AGES, [{"label": "Sin seguro", "values": rates}],
          "Porcentaje calculado sobre las respuestas válidas de cada grupo de edad.", percent=True)
    bins = Counter(min(int(r["EDAD"] // 10), 11) for r in rows if r["EDAD"] is not None)
    chart("05", "Distribución de edades", "bar", [f"{i*10}–{i*10+9}" for i in range(11)] + ["110+"],
          [series("Registros", [bins[i] for i in range(12)])], "Histograma de edades agrupadas en intervalos de diez años.")
    pairs = Counter((int(r["TALLA_ACTUAL"] // 5) * 5, int(r["PESO_ACTUAL"] // 5) * 5)
                    for r in rows if r["TALLA_ACTUAL"] is not None and r["PESO_ACTUAL"] is not None)
    points = [{"x": x + 2.5, "y": y + 2.5, "n": count} for (x, y), count in sorted(pairs.items()) if count >= MINIMUM]
    chart("06", "Relación entre talla y peso", "scatter", [], [{"label": "Grupos", "values": points}],
          "Cada punto resume un grupo de al menos diez registros. Su tamaño representa la frecuencia.")
    top_categories("PROBLEMAS_SALUD", "07", "Problemas de salud reportados", "Cinco categorías más frecuentes entre quienes reportaron algún problema.")
    top_categories("ATENCION_PROBLEMA_SALUD", "08", "Formas de atención reportadas", "Cinco respuestas más frecuentes entre quienes reportaron una forma de atención.")
    chart("09", "Cobertura de seguro por edad", "stacked", AGES,
          [series(label, [by_age[group][label] for group in AGES]) for label in statuses],
          "Conteos por grupo de edad y estado del seguro.")
    labels = ["Femenino", "Masculino"]
    chart("10", "Seguro según sexo registrado", "bar", labels,
          [series(status, [sum(r["SEXO"] == label and r["TENENCIA_SEGURO"] == status for r in rows) for label in labels])
           for status in [YES, NO]], "Comparación de las respuestas válidas por sexo registrado.")

    dashboard = {"total": len(rows), "insured": insurance[YES], "uninsured": insurance[NO],
                 "missing": missing, "uninsuredRate": round(100 * insurance[NO] / valid, 1), "charts": charts}
    (ROOT / "src/panel.json").write_text(json.dumps(dashboard, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
