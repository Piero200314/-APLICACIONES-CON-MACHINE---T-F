import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Chart } from 'chart.js/auto';

const format = new Intl.NumberFormat('es-PE');
const colors = {
  light: { accent: '#008278', navy: '#214779', neutral: '#65758e', ink: '#344662', grid: '#e7edf3' },
  dark: { accent: '#2ce3ca', navy: '#7caffb', neutral: '#a9b4c8', ink: '#bbc9dc', grid: '#314158' },
};
const display = (value, percent) => value == null ? 'Dato reservado' : percent
  ? `${format.format(value)} %` : format.format(value);

function plotValue(figure, label, set, point) {
  if (figure.type === 'scatter') {
    return `Talla aprox. ${format.format(point.x)} cm · Peso aprox. ${format.format(point.y)} kg · ${format.format(point.n)} registros`;
  }
  return `${label}${figure.series.length > 1 ? ' · ' + set : ''}: ${display(point, figure.percent)}`;
}

function ChartPlot({ figure, theme, reduced, replay }) {
  const canvas = useRef(null);
  const instance = useRef(null);
  const [hidden, setHidden] = useState([]);
  const [selection, setSelection] = useState('');
  const [recent, setRecent] = useState(false);
  const [mode, setMode] = useState('count');
  const { type, labels } = figure;
  const coverage = figure.id === '09';
  const share = coverage && mode === 'share';
  const bases = coverage ? labels.map((_, i) => {
    const yes = figure.series[0].values[i];
    const no = figure.series[1].values[i];
    return yes == null || no == null ? null : yes + no;
  }) : [];
  const series = useMemo(() => share ? figure.series.slice(0, 2).map(set => ({
    ...set, values: set.values.map((value, i) => bases[i] ? Math.round(1000 * value / bases[i]) / 10 : null),
  })) : figure.series, [figure, share]);
  const plotted = useMemo(() => share ? { ...figure, series, percent: true } : figure, [figure, series, share]);
  const pie = type === 'doughnut';
  const scatter = type === 'scatter';
  const stacked = type === 'stacked';
  const line = type === 'line';
  const palette = colors[theme];
  const swatches = [palette.accent, palette.navy, palette.neutral];
  const visibleLabels = useMemo(() => recent ? labels.slice(-6) : labels, [labels, recent]);

  useEffect(() => {
    const datasets = series.map((set, index) => ({
      label: set.label,
      data: recent ? set.values.slice(-6) : set.values,
      backgroundColor: pie ? swatches : line ? palette.accent + '22' : scatter ? palette.accent + '85' : swatches[index],
      borderColor: line ? palette.accent : 'transparent',
      borderWidth: line ? 2.5 : 0,
      borderRadius: 5,
      tension: 0.28,
      fill: line,
      pointRadius: scatter ? ({ raw }) => Math.min(11, 2 + Math.sqrt(raw?.n ?? 0) / 4) : 3,
      pointHoverRadius: scatter ? 9 : 5,
      maxBarThickness: 56,
    }));
    const axis = { grid: { color: palette.grid }, ticks: { color: palette.ink }, border: { display: false }, stacked };
    const categoryAxis = { ...axis, grid: { display: false },
      ticks: { color: palette.ink, autoSkip: true, maxRotation: 0, padding: 6 } };
    const show = (context) => plotValue(plotted, context.label, context.dataset.label, context.raw);
    instance.current = new Chart(canvas.current, {
      type: pie || line || scatter ? type : 'bar',
      data: { labels: visibleLabels, datasets },
      options: {
        responsive: true, maintainAspectRatio: false, color: palette.ink,
        animation: reduced ? false : { duration: 720, easing: 'easeOutQuart' },
        animations: !reduced && line ? {
          y: { type: 'number', from: context => context.chart.scales.y?.getBasePixel(), delay: context => context.dataIndex * 18 },
        } : undefined,
        ...(pie ? { cutout: '68%' } : {}),
        ...(pie ? {} : { scales: {
          x: scatter ? { ...axis, title: { display: true, text: 'Talla (cm)', color: palette.ink } } : categoryAxis,
          y: scatter ? { ...axis, title: { display: true, text: 'Peso (kg)', color: palette.ink } } : {
            ...axis, beginAtZero: true, ...(share ? { max: 100 } : {}), ticks: { color: palette.ink, callback: value => display(value, plotted.percent) },
          },
        } }),
        plugins: { legend: { display: false }, tooltip: { callbacks: { title: () => '', label: show } } },
        onClick(_event, elements) {
          if (!elements.length) return setSelection('');
          const { index, datasetIndex } = elements[0];
          const value = plotValue(plotted, visibleLabels[index], datasets[datasetIndex].label, datasets[datasetIndex].data[index]);
          setSelection(share ? `${value} · Base: ${format.format(bases[index])} respuestas válidas` : value);
        },
      },
    });
    return () => instance.current.destroy();
  }, [plotted, palette, pie, scatter, stacked, line, recent, reduced, series, type, visibleLabels, share]);

  useEffect(() => {
    const chart = instance.current;
    const size = pie ? labels.length : series.length;
    for (let i = 0; i < size; i++) {
      const visible = !hidden.includes(i);
      if (pie && chart.getDataVisibility(i) !== visible) chart.toggleDataVisibility(i);
      if (!pie) chart.setDatasetVisibility(i, visible);
    }
    chart.update();
  }, [hidden, plotted, labels.length, pie, recent, series.length, theme, reduced]);

  useEffect(() => {
    const chart = instance.current;
    function play() {
      chart.stop();
      chart.reset();
      chart.update();
    }
    if (reduced) return;
    if (replay) { play(); return; }
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      play();
      observer.disconnect();
    }, { threshold: .25 });
    observer.observe(canvas.current);
    return () => observer.disconnect();
  }, [plotted, recent, theme, reduced, replay]);

  const legend = pie ? labels : series.map(set => set.label);
  function toggle(index) {
    setSelection('');
    setHidden(items => items.includes(index) ? items.filter(item => item !== index)
      : items.length === legend.length - 1 ? items : [...items, index]);
  }

  return <>
    {coverage && <div className="controls" aria-label="Unidad de cobertura">
      <button type="button" aria-pressed={!share} onClick={() => { if (share) { setMode('count'); setHidden([]); setSelection(''); } }}>Cantidad</button>
      <button type="button" aria-pressed={share} onClick={() => { if (!share) { setMode('share'); setHidden([]); setSelection(''); } }}>Porcentaje válido</button>
    </div>}
    {share && <p className="chart-note">Cada barra usa las respuestas válidas de su grupo de edad.</p>}
    {line && <div className="controls" aria-label="Periodo visible">
      <button type="button" aria-pressed={!recent} onClick={() => { setRecent(false); setSelection(''); }}>Todo el periodo</button>
      <button type="button" aria-pressed={recent} onClick={() => { setRecent(true); setSelection(''); }}>Últimos 6 meses</button>
    </div>}
    {(pie || series.length > 1) && <div className="controls" aria-label="Series visibles">
      {legend.map((label, i) => <button type="button" aria-pressed={!hidden.includes(i)} key={label} onClick={() => toggle(i)}>
        <span className="swatch" style={{ background: swatches[i] }} />{label}
      </button>)}
    </div>}
    <div className="plot">
      <canvas ref={canvas} role="img" aria-label={figure.title} />
    </div>
    <p className="selection" aria-live="polite">{selection || 'Selecciona un punto o barra para consultar su valor.'}</p>
    <details>
      <summary>Ver valores agregados</summary>
      <div className="table-wrap"><table>
        <thead><tr>{scatter ? ['Talla aprox. (cm)', 'Peso aprox. (kg)', 'Registros'].map(label => <th key={label}>{label}</th>) :
          <><th>Categoría</th>{series.filter((_, i) => pie || !hidden.includes(i)).map(set => <th key={set.label}>{set.label}</th>)}{share && <th>Base válida</th>}</>}</tr></thead>
        <tbody>{scatter ? series[0].values.map(({ x, y, n }) =>
          <tr key={`${x}-${y}`}><td>{format.format(x)}</td><td>{format.format(y)}</td><td>{format.format(n)}</td></tr>) :
          visibleLabels.map((label, i) => (!pie || !hidden.includes(i)) && <tr key={label}><th scope="row">{label}</th>
            {series.filter((_, j) => pie || !hidden.includes(j)).map(set => <td key={set.label}>{display((recent ? set.values.slice(-6) : set.values)[i], plotted.percent)}</td>)}{share && <td>{display(bases[i], false)}</td>}</tr>)}</tbody>
      </table></div>
    </details>
  </>;
}


function RankedBars({ figure, replay }) {
  const [selectedIndex, setSelectedIndex] = useState(null);
  const { labels, series, percent } = figure;
  const values = series[0].values;
  const [inView, setInView] = useState(false);
  const ranking = useRef(null);
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setInView(true); observer.disconnect(); }
    }, { threshold: .15 });
    observer.observe(ranking.current);
    return () => observer.disconnect();
  }, []);
  const maxValue = Math.max(1, ...values);
  const selected = selectedIndex === null ? '' :
    `${labels[selectedIndex]}: ${display(values[selectedIndex], percent)} registros`;

  return <>
    <ol className="ranking" ref={ranking} data-in-view={inView}>
      {labels.map((label, i) => <li key={label}>
        <button type="button" className="ranking-row" aria-pressed={selectedIndex === i}
          onClick={() => setSelectedIndex(index => index === i ? null : i)}>
          <span className="ranking-label">{label}</span>
          <span className="ranking-value">{display(values[i], percent)}</span>
          <span className="ranking-track" aria-hidden="true">
            <span key={replay} className="ranking-fill" style={{ "--delay": `${i * 75}ms`, width: `${100 * (values[i] ?? 0) / maxValue}%` }} />
          </span>
        </button>
      </li>)}
    </ol>
    <p className="selection" aria-live="polite">{selected || 'Selecciona una categoría para destacarla. Los valores indican registros.'}</p>
  </>;
}

export default function ChartCard({ figure, theme, reduced, onExpand }) {
  const [replay, setReplay] = useState(0);
  return <article className="chart">
    <div className="chart-head">
      <h3>{figure.title}</h3>
      <div className="chart-actions">
      {!reduced && <button className="expand" type="button" onClick={() => setReplay(n => n + 1)}
        aria-label={`Repetir animación de ${figure.title}`}>↻</button>}
      {onExpand && <button className="expand" type="button" onClick={event => onExpand(figure, event.currentTarget)} aria-label={`Ampliar ${figure.title}`}>Ampliar</button>}
      </div>
    </div>
    <p className="description">{figure.description}</p>
    {figure.type === 'horizontal' ? <RankedBars figure={figure} replay={replay} /> :
      <ChartPlot figure={figure} theme={theme} reduced={reduced} replay={replay} />}
  </article>;
}
