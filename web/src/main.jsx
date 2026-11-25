import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import ChartCard from './ChartCard';
import data from './panel.json';
import './style.css';

const format = new Intl.NumberFormat('es-PE');
const areas = [
  { id: 'resumen', title: 'Resumen ejecutivo', charts: ['02', '04'] },
  { id: 'cobertura', title: 'Cobertura por grupos', charts: ['09', '10'] },
  { id: 'atencion', title: 'Salud y atención', charts: ['07', '08'] },
  { id: 'perfil', title: 'Perfil y periodo del censo', charts: ['01', '03', '05', '06'] },
];
const metrics = [
  ['Registros', data.total], ['Con seguro', data.insured], ['Sin seguro', data.uninsured], ['Sin dato', data.missing],
];

function AnimatedNumber({ value, reduced }) {
  const ref = useRef(null);

  useEffect(() => {
    const element = ref.current;
    element.textContent = format.format(value);
    if (reduced) return;
    let frame;
    const start = performance.now();
    function tick(now) {
      const progress = Math.min(1, (now - start) / 850);
      element.textContent = format.format(Math.round(value * (1 - (1 - progress) ** 3)));
      if (progress < 1) frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, reduced]);

  return <><span className="sr-only">{format.format(value)}</span><span ref={ref} aria-hidden="true">{format.format(value)}</span></>;
}

function preferredTheme() {
  try {
    const saved = localStorage.getItem('censo-tema');
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {}
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function Dashboard() {
  const [theme, setTheme] = useState(preferredTheme);
  const [reduced, setReduced] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [active, setActive] = useState(null);
  const dialog = useRef(null);
  const opener = useRef(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = ({ matches }) => setReduced(matches);
    motion.addEventListener('change', onChange);
    return () => motion.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    if (active) dialog.current.showModal();
  }, [active]);

  function chooseTheme(value) {
    setTheme(value);
    try { localStorage.setItem('censo-tema', value); } catch {}
  }

  function openChart(figure, button) {
    opener.current = button;
    setActive(figure);
  }

  return <>
    <header className="top">
      <div className="wrap bar">
        <a className="brand" href="#resumen">Panel ejecutivo</a>
        <nav aria-label="Navegación principal">
          <a href="#resumen">Resumen</a><a href="#cobertura">Cobertura</a><a href="#atencion">Atención</a><a href="#perfil">Perfil</a><a href="#metodo">Metodología</a>
        </nav>
        <div className="theme" aria-label="Tema visual">
          <button type="button" aria-pressed={theme === 'light'} onClick={() => chooseTheme('light')}>Claro</button>
          <button type="button" aria-pressed={theme === 'dark'} onClick={() => chooseTheme('dark')}>Oscuro</button>
        </div>
      </div>
    </header>
    <main className="wrap" id="resumen">
      <section className="intro">
        <div className="hero-glow" aria-hidden="true" />
        <div className="intro-content">
        <p className="location">SAN BORJA · LIMA</p>
        <h1>Censo de Salud de San Borja</h1>
        <p>Cobertura de seguro y formas de atención reportadas en el censo.</p>
        <a className="hero-link" href="#cobertura">Explorar cobertura</a>
        </div>
      </section>
      <dl className="metrics">
        {metrics.map(([label, value], index) => <div className="metric" key={label} style={{ "--delay": `${index * 90}ms` }}><dt>{label}</dt><dd><AnimatedNumber value={value} reduced={reduced} /></dd></div>)}
      </dl>
      <p className="insight"><strong>{format.format(data.uninsuredRate)} % sin seguro</strong><span>{format.format(data.uninsured)} de {format.format(data.insured + data.uninsured)} respuestas válidas</span></p>
      {areas.map((area, index) => <section key={area.id} id={index ? area.id : undefined} className="area">
        <h2>{area.title}</h2>
        <div className="grid">
          {area.charts.map(id => <ChartCard key={id} figure={data.charts.find(figure => figure.id === id)}
            theme={theme} reduced={reduced} onExpand={openChart} />)}
        </div>
      </section>)}
      <section className="method" id="metodo">
        <h2>Metodología</h2>
        <p>El análisis describe los registros de San Borja. El porcentaje sin seguro excluye las respuestas faltantes. Los gráficos de problemas y formas de atención resumen preguntas distintas. Sus conteos tienen bases diferentes y no se dividen entre el total del censo. Se muestran conteos agregados, y los puntos de talla y peso representan intervalos de 5 cm y 5 kg.</p>
        <p>Fuente: Censo de Salud de San Borja. Resultados preliminares a partir del CSV del proyecto.</p>
      </section>
    </main>
    <footer><div className="wrap">SENATI · Seminario IA 501</div></footer>
    <dialog ref={dialog} aria-label={active?.title} onClose={() => { setActive(null); opener.current?.focus(); }}>
      {active && <><div className="dialog-bar"><button type="button" onClick={() => dialog.current.close()}>Cerrar</button></div>
        <ChartCard figure={active} theme={theme} reduced={reduced} /></>}
    </dialog>
  </>;
}

createRoot(document.getElementById('root')).render(<Dashboard />);
