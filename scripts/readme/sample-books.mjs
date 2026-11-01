/**
 * Builds the sample books shown in the README screenshots: "Orbits", a short illustrated textbook
 * written for this repository, and a shelf of shorter books with designed covers. Each is written as
 * HTML and printed to PDF by Playwright's Chromium, so the text is real and selectable, headings
 * become the PDF outline, and cross-references become internal links.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const font = (pkg, file) => pathToFileURL(path.join(ROOT, 'node_modules', pkg, 'files', file)).href;

const PALETTE = { ink: '#1f2430', navy: '#1d3557', accent: '#d9822b', sky: '#3a6ea5', muted: '#5b6472' };

// ——— Shared page styles ———

function styles({ runningHead }) {
  return `
@font-face { font-family: 'Source Serif'; font-weight: 200 900; font-style: normal;
  src: url(${font('@fontsource-variable/source-serif-4', 'source-serif-4-latin-wght-normal.woff2')}) format('woff2'); }
@font-face { font-family: 'Source Serif'; font-weight: 200 900; font-style: italic;
  src: url(${font('@fontsource-variable/source-serif-4', 'source-serif-4-latin-wght-italic.woff2')}) format('woff2'); }
@font-face { font-family: 'Inter'; font-weight: 100 900;
  src: url(${font('@fontsource-variable/inter', 'inter-latin-wght-normal.woff2')}) format('woff2'); }

@page {
  size: 7.5in 10in;
  margin: 0.85in 0.85in 0.9in;
  @top-right { content: '${runningHead}'; font: 500 7.5pt Inter; letter-spacing: 0.14em; color: ${PALETTE.muted}; }
  @bottom-center { content: counter(page); font: 8.5pt Inter; color: ${PALETTE.muted}; }
}
@page cover { margin: 0; @top-right { content: none; } @bottom-center { content: none; } }

html { font: 10.5pt/1.55 'Source Serif', Georgia, serif; color: ${PALETTE.ink}; }
body { margin: 0; }
p { margin: 0 0 0.7em; text-align: justify; hyphens: auto; orphans: 3; widows: 3; }
a { color: ${PALETTE.sky}; text-decoration: none; }
em { font-style: italic; }
sub, sup { font-size: 0.72em; line-height: 0; }

.cover { page: cover; break-after: page; width: 7.5in; height: 10in; position: relative; overflow: hidden; }

.chapter { break-before: page; }
.chapter-label { font: 600 8.5pt Inter; letter-spacing: 0.18em; text-transform: uppercase; color: ${PALETTE.accent};
  margin: 0.9in 0 0.4em; }
h1 { font: 600 25pt/1.15 Inter; letter-spacing: -0.01em; color: ${PALETTE.navy}; margin: 0 0 0.35em; }
.chapter-intro { font-size: 11.5pt; font-style: italic; color: #3d4452; margin: 0 0 1.6em; padding-bottom: 1.1em;
  border-bottom: 1px solid #e3ddd0; text-align: left; }
h2 { font: 600 13pt/1.3 Inter; color: ${PALETTE.navy}; margin: 1.5em 0 0.55em; break-after: avoid; }
.exercises-title { font: 600 8.5pt Inter; letter-spacing: 0.14em; text-transform: uppercase; color: ${PALETTE.navy}; margin: 1.4em 0 0.5em; break-after: avoid; }

.law { font-weight: 600; color: ${PALETTE.navy}; }
.equation { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; margin: 0.6em 0 0.9em;
  break-inside: avoid; }
.equation math { grid-column: 2; font-size: 12pt; }
.equation .number { grid-column: 3; justify-self: end; font: 8.5pt Inter; color: ${PALETTE.muted}; }
math { font-family: 'Cambria Math', 'STIX Two Math', math; }

figure { margin: 1.1em 0 1.3em; break-inside: avoid; text-align: center; }
figure svg { width: 100%; height: auto; }
figcaption { font: 8.5pt/1.45 Inter; color: #4a5160; text-align: left; margin-top: 0.4em; }
figcaption b, caption b { color: ${PALETTE.accent}; font-weight: 600; }

.box { break-inside: avoid; border-radius: 4px; padding: 0.75em 1em 0.35em; margin: 1em 0 1.2em; }
.box-title { font: 600 8.5pt Inter; letter-spacing: 0.12em; text-transform: uppercase; margin: 0 0 0.45em; }
.example { background: #eef3f9; border-left: 3px solid ${PALETTE.sky}; }
.example .box-title { color: ${PALETTE.sky}; }
.key { background: #fbf1e3; border-left: 3px solid ${PALETTE.accent}; }
.key .box-title { color: ${PALETTE.accent}; }

.exercises ol { padding-left: 1.4em; margin: 0; }
.exercises li { margin-bottom: 0.45em; text-align: justify; }
.exercises li.calc::marker { content: counter(list-item) '*  '; }

table { width: 100%; border-collapse: collapse; font: 9pt/1.4 Inter; margin: 0.6em 0 1.6em; break-inside: avoid; }
caption { caption-side: top; text-align: left; font: 8.5pt Inter; color: #4a5160; margin-bottom: 0.5em; }
th { text-align: left; font-weight: 600; color: ${PALETTE.navy}; border-bottom: 1.5px solid ${PALETTE.navy}; padding: 0.35em 0.5em; }
td { border-bottom: 1px solid #e6e1d6; padding: 0.32em 0.5em; }
td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }

`;
}

// ——— Equations (MathML) ———

const mi = (s) => `<mi>${s}</mi>`;
const mn = (s) => `<mn>${s}</mn>`;
const mo = (s) => `<mo>${s}</mo>`;
const mtext = (s) => `<mtext>${s}</mtext>`;
const row = (...parts) => `<mrow>${parts.join('')}</mrow>`;
const frac = (a, b) => `<mfrac>${a}${b}</mfrac>`;
const sup = (a, b) => `<msup>${a}${b}</msup>`;
const sub = (a, b) => `<msub>${a}${b}</msub>`;
const sqrt = (...parts) => `<msqrt>${parts.join('')}</msqrt>`;
const paren = (...parts) => `${mo('(')}${parts.join('')}${mo(')')}`;

function equation(id, number, ...parts) {
  return `<div class="equation" id="${id}"><math display="block">${parts.join('')}</math><span class="number">(${number})</span></div>`;
}

// ——— Figures (SVG) ———

const LABEL = `font-family="Inter" font-size="11" fill="${PALETTE.muted}"`;
const SYMBOL = `font-family="Source Serif" font-style="italic" font-size="15" fill="${PALETTE.ink}"`;

function figureEllipse() {
  const [cx, cy, a, b] = [220, 120, 170, 112];
  const c = Math.sqrt(a * a - b * b);
  const planet = { x: cx + a * Math.cos(-0.9), y: cy + b * Math.sin(-0.9) };
  return `<svg viewBox="-40 0 520 250" xmlns="http://www.w3.org/2000/svg">
  <line x1="${cx - a - 14}" y1="${cy}" x2="${cx + a + 14}" y2="${cy}" stroke="#b9b2a3" stroke-dasharray="4 4"/>
  <line x1="${cx}" y1="${cy - b - 10}" x2="${cx}" y2="${cy + b + 10}" stroke="#b9b2a3" stroke-dasharray="4 4"/>
  <ellipse cx="${cx}" cy="${cy}" rx="${a}" ry="${b}" fill="none" stroke="${PALETTE.navy}" stroke-width="2.2"/>
  <line x1="${cx + c}" y1="${cy}" x2="${planet.x}" y2="${planet.y}" stroke="${PALETTE.sky}" stroke-width="1.2"/>
  <circle cx="${cx + c}" cy="${cy}" r="13" fill="${PALETTE.accent}" opacity="0.18"/>
  <circle cx="${cx + c}" cy="${cy}" r="8" fill="${PALETTE.accent}"/>
  <circle cx="${cx - c}" cy="${cy}" r="4" fill="#fff" stroke="${PALETTE.navy}" stroke-width="1.5"/>
  <circle cx="${planet.x}" cy="${planet.y}" r="6" fill="${PALETTE.sky}"/>
  <text x="${cx + a / 2 - 4}" y="${cy - 8}" ${SYMBOL}>a</text>
  <text x="${cx + 8}" y="${cy + b / 2 + 6}" ${SYMBOL}>b</text>
  <text x="${cx + c / 2 - 4}" y="${cy + 20}" ${SYMBOL}>c</text>
  <text x="${cx + c - 10}" y="${cy + 32}" ${LABEL}>Sun</text>
  <text x="${cx - c - 30}" y="${cy + 24}" ${LABEL}>empty focus</text>
  <text x="${cx + a + 6}" y="${cy - 10}" ${LABEL}>perihelion</text>
  <text x="${cx - a - 54}" y="${cy - 10}" ${LABEL}>aphelion</text>
  <text x="${planet.x + 10}" y="${planet.y - 6}" ${LABEL}>planet</text>
</svg>`;
}

function figureEqualAreas() {
  const [cx, cy, a, b] = [220, 118, 175, 108];
  const c = Math.sqrt(a * a - b * b);
  const focus = { x: cx + c, y: cy };
  const point = (t) => ({ x: cx + a * Math.cos(t), y: cy + b * Math.sin(t) });
  const sector = (t1, t2) => {
    const points = Array.from({ length: 41 }, (_, i) => point(t1 + ((t2 - t1) * i) / 40));
    return [focus, ...points];
  };
  const area = (polygon) =>
    Math.abs(
      polygon.reduce((sum, p, i) => {
        const q = polygon[(i + 1) % polygon.length];
        return sum + p.x * q.y - q.x * p.y;
      }, 0) / 2,
    );
  // A wide sector near perihelion, and a narrow one near aphelion of the same area.
  const near = sector(-0.62, 0.62);
  const target = area(near);
  let half = 0.05;
  while (area(sector(Math.PI - half, Math.PI + half)) < target) half += 0.002;
  const far = sector(Math.PI - half, Math.PI + half);
  const path = (polygon) => `M${polygon.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' L')} Z`;
  return `<svg viewBox="0 0 440 240" xmlns="http://www.w3.org/2000/svg">
  <path d="${path(near)}" fill="${PALETTE.sky}" fill-opacity="0.22" stroke="${PALETTE.sky}" stroke-width="1"/>
  <path d="${path(far)}" fill="${PALETTE.sky}" fill-opacity="0.22" stroke="${PALETTE.sky}" stroke-width="1"/>
  <ellipse cx="${cx}" cy="${cy}" rx="${a}" ry="${b}" fill="none" stroke="${PALETTE.navy}" stroke-width="2.2"/>
  <circle cx="${focus.x}" cy="${focus.y}" r="13" fill="${PALETTE.accent}" opacity="0.18"/>
  <circle cx="${focus.x}" cy="${focus.y}" r="8" fill="${PALETTE.accent}"/>
  <text x="${cx + a - 52}" y="${cy + 4}" ${LABEL}>fast</text>
  <text x="${cx - a + 12}" y="${cy + 4}" ${LABEL}>slow</text>
  <text x="${focus.x - 10}" y="${focus.y + 30}" ${LABEL}>Sun</text>
</svg>`;
}

function figureRetrograde() {
  // Geocentric path of Mars around an opposition, with its orbital tilt exaggerated so the loop opens.
  const samples = [];
  const tilt = (6 * Math.PI) / 180;
  for (let day = -105; day <= 105; day += 1) {
    const t = day / 365.25;
    const earth = { x: Math.cos(2 * Math.PI * t), y: Math.sin(2 * Math.PI * t), z: 0 };
    const angle = 2 * Math.PI * (t / 1.881);
    const mars = {
      x: 1.524 * Math.cos(angle),
      y: 1.524 * Math.sin(angle) * Math.cos(tilt),
      z: 1.524 * Math.sin(angle + 0.9) * Math.sin(tilt),
    };
    const d = { x: mars.x - earth.x, y: mars.y - earth.y, z: mars.z - earth.z };
    samples.push({ day, lon: Math.atan2(d.y, d.x), lat: Math.atan2(d.z, Math.hypot(d.x, d.y)) });
  }
  const lons = samples.map((s) => s.lon);
  const lats = samples.map((s) => s.lat);
  const [minLon, maxLon] = [Math.min(...lons), Math.max(...lons)];
  const [minLat, maxLat] = [Math.min(...lats), Math.max(...lats)];
  // Sky charts put east on the left.
  const x = (lon) => 400 - ((lon - minLon) / (maxLon - minLon)) * 360;
  const y = (lat) => 175 - ((lat - minLat) / (maxLat - minLat)) * 110;
  const line = samples
    .map((s, i) => `${i ? 'L' : 'M'}${x(s.lon).toFixed(1)},${y(s.lat).toFixed(1)}`)
    .join(' ');
  const random = (() => {
    let seed = 7;
    return () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
  })();
  const stars = Array.from({ length: 46 }, () => {
    const r = 0.5 + random() * 1.3;
    return `<circle cx="${(10 + random() * 420).toFixed(1)}" cy="${(12 + random() * 200).toFixed(1)}" r="${r.toFixed(2)}" fill="#c9d3e6"/>`;
  }).join('');
  const marks = samples
    .filter((s) => s.day % 30 === 0)
    .map(
      (s) =>
        `<circle cx="${x(s.lon).toFixed(1)}" cy="${y(s.lat).toFixed(1)}" r="3.4" fill="${PALETTE.accent}"/>`,
    )
    .join('');
  return `<svg viewBox="0 0 440 225" xmlns="http://www.w3.org/2000/svg">
  <rect width="440" height="225" rx="6" fill="#141b2d"/>
  ${stars}
  <path d="${line}" fill="none" stroke="#f0c48a" stroke-width="2"/>
  ${marks}
  <text x="20" y="212" font-family="Inter" font-size="10.5" fill="#9aa6bf">east</text>
  <text x="394" y="212" font-family="Inter" font-size="10.5" fill="#9aa6bf">west</text>
</svg>`;
}

function figureCannon() {
  const [cx, cy, r] = [220, 152, 82];
  const top = { x: cx, y: cy - r - 14 };
  const landing = (deg) => {
    const t = ((deg - 90) * Math.PI) / 180;
    return { x: cx + r * Math.cos(t), y: cy + r * Math.sin(t) };
  };
  const shot = (deg, bulge) => {
    const end = landing(deg);
    const control = { x: top.x + bulge, y: top.y - 6 };
    return `<path d="M${top.x},${top.y} Q${control.x},${control.y} ${end.x.toFixed(1)},${end.y.toFixed(1)}" fill="none" stroke="${PALETTE.sky}" stroke-width="1.6"/>`;
  };
  return `<svg viewBox="0 0 440 290" xmlns="http://www.w3.org/2000/svg">
  <circle cx="${cx}" cy="${cy}" r="${r + 14}" fill="none" stroke="${PALETTE.accent}" stroke-width="2" stroke-dasharray="6 5"/>
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="#dde7f2" stroke="${PALETTE.navy}" stroke-width="1.6"/>
  <path d="M${cx - 16},${cy - r + 4} L${cx},${cy - r - 14} L${cx + 16},${cy - r + 4} Z" fill="#8a7f6c"/>
  ${shot(28, 38)}
  ${shot(55, 76)}
  ${shot(92, 118)}
  <text x="${cx + 108}" y="${cy - 82}" ${LABEL}>orbit</text>
  <text x="${cx - 26}" y="${cy + 4}" ${LABEL}>Earth</text>
</svg>`;
}

function figureHohmann() {
  const [cx, cy, r1, r2] = [220, 140, 64, 98];
  const at = (r1 + r2) / 2;
  const bt = Math.sqrt(r1 * r2);
  const centre = cx + (r1 - r2) / 2;
  return `<svg viewBox="0 0 440 280" xmlns="http://www.w3.org/2000/svg">
  <defs><marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
    <path d="M0,0 L10,5 L0,10 Z" fill="${PALETTE.accent}"/></marker></defs>
  <circle cx="${cx}" cy="${cy}" r="${r1}" fill="none" stroke="${PALETTE.sky}" stroke-width="1.6"/>
  <circle cx="${cx}" cy="${cy}" r="${r2}" fill="none" stroke="#b5472f" stroke-width="1.6"/>
  <path d="M${cx + r1},${cy} A${at},${bt} 0 0 0 ${cx - r2},${cy}" fill="none" stroke="${PALETTE.accent}" stroke-width="2.4" marker-end="url(#arrow)"/>
  <path d="M${cx - r2},${cy} A${at},${bt} 0 0 0 ${cx + r1},${cy}" fill="none" stroke="${PALETTE.accent}" stroke-width="1" stroke-dasharray="3 4" opacity="0.6"/>
  <circle cx="${cx}" cy="${cy}" r="11" fill="${PALETTE.accent}" opacity="0.2"/>
  <circle cx="${cx}" cy="${cy}" r="7" fill="${PALETTE.accent}"/>
  <circle cx="${cx + r1}" cy="${cy}" r="5" fill="${PALETTE.sky}"/>
  <circle cx="${cx - r2}" cy="${cy}" r="5" fill="#b5472f"/>
  <text x="${cx + r1 + 9}" y="${cy + 4}" ${SYMBOL} font-size="13">Δv₁</text>
  <text x="${cx - r2 - 34}" y="${cy + 4}" ${SYMBOL} font-size="13">Δv₂</text>
  <text x="${cx + 34}" y="${cy + r1 + 18}" ${LABEL}>Earth’s orbit</text>
  <text x="${cx + 52}" y="${cy + r2 + 22}" ${LABEL}>Mars’s orbit</text>
  <text x="${centre - 30}" y="${cy - bt - 12}" ${LABEL}>transfer orbit</text>
</svg>`;
}

const figure = (id, number, svg, caption) =>
  `<figure id="${id}">${svg}<figcaption><b>Figure ${number}</b>&ensp;${caption}</figcaption></figure>`;

// ——— Covers ———

const COVERS = {
  orbits: (book) => `
  <div class="cover" style="background: radial-gradient(120% 90% at 70% 30%, #24406b 0%, #14213d 55%, #0b1324 100%); color: #f5efe3;">
    <svg viewBox="0 0 540 720" style="position:absolute; inset:0; width:100%; height:100%">
      ${Array.from({ length: 60 }, (_, i) => `<circle cx="${(i * 97) % 540}" cy="${(i * 53) % 720}" r="${0.6 + (i % 3) * 0.5}" fill="#e8ecf5" opacity="${0.25 + (i % 4) * 0.12}"/>`).join('')}
      <g transform="translate(330 300) rotate(-18)" fill="none" stroke="#f2a541">
        <ellipse rx="70" ry="52" stroke-opacity="0.9" stroke-width="1.6"/>
        <ellipse rx="130" ry="96" stroke-opacity="0.6" stroke-width="1.3"/>
        <ellipse rx="205" ry="150" stroke-opacity="0.38" stroke-width="1.1"/>
        <ellipse rx="290" ry="214" stroke-opacity="0.22" stroke-width="1"/>
      </g>
      <circle cx="330" cy="300" r="16" fill="#f2a541"/>
      <circle cx="330" cy="300" r="34" fill="#f2a541" opacity="0.15"/>
      <circle cx="${330 + 66}" cy="${300 - 19}" r="5" fill="#9cc3f0"/>
      <circle cx="${330 - 112}" cy="${300 + 66}" r="7" fill="#e07b5f"/>
      <circle cx="${330 + 150}" cy="${300 + 90}" r="9" fill="#e9d4a3"/>
    </svg>
    <div style="position:absolute; left:0.75in; right:0.75in; bottom:1.2in;">
      <div style="font: 600 9pt Inter; letter-spacing: 0.3em; text-transform: uppercase; color:#f2a541;">${book.edition}</div>
      <div style="font: 600 64pt/1 'Source Serif'; letter-spacing:-0.01em; margin: 0.12in 0 0.1in;">${book.title}</div>
      <div style="font: 400 16pt/1.3 'Source Serif'; font-style: italic; color:#d8deea;">${book.subtitle}</div>
      <div style="font: 500 11pt Inter; letter-spacing: 0.06em; margin-top: 0.45in; color:#c3cad8;">${book.author}</div>
    </div>
  </div>`,
  plain: (book) => `
  <div class="cover" style="background:${book.background}; color:${book.color};">
    <svg viewBox="0 0 540 720" style="position:absolute; inset:0; width:100%; height:100%">${book.motif}</svg>
    <div style="position:absolute; left:0.7in; right:0.7in; top:0.95in;">
      <div style="font: 600 8.5pt Inter; letter-spacing: 0.28em; text-transform: uppercase; opacity:0.75;">${book.edition}</div>
      <div style="font: ${book.titleFont}; margin: 0.16in 0 0.12in;">${book.title}</div>
      <div style="font: 400 14pt/1.35 'Source Serif'; font-style: italic; opacity:0.85;">${book.subtitle}</div>
    </div>
    <div style="position:absolute; left:0.7in; bottom:0.8in; font: 500 10.5pt Inter; letter-spacing:0.06em; opacity:0.85;">${book.author}</div>
  </div>`,
};

// ——— Orbits ———

const CH = {
  ch1: 'The Sky in Motion',
  ch2: 'Kepler’s Laws',
  ch3: 'Universal Gravitation',
  ch4: 'Energy and Angular Momentum',
  ch5: 'Changing Orbits',
  appA: 'Planetary Data',
};

function orbitsBody() {
  const ref = (id, text) => `<a href="#${id}">${text}</a>`;
  return `
<section class="chapter" id="ch1">
  <div class="chapter-label">Chapter 1</div>
  <h1>1&ensp;${CH.ch1}</h1>
  <p class="chapter-intro">A few points of light refuse to keep their places among the stars. Explaining their paths took two thousand years and ended with an ellipse.</p>

  <h2 id="s1-1">1.1&ensp;The Wandering Stars</h2>
  <p>Watch the night sky for a few hours and the stars wheel together around the celestial pole, keeping their patterns as if fixed to a single turning sphere. A handful of bright points do not keep their places. Night after night they drift eastward against the background constellations, and every so often one of them slows, stops and loops backward for several weeks before resuming its course. The Greeks called these objects <em>planētes</em>, wanderers, and accounting for their paths occupied astronomers for the next two thousand years.</p>
  <p>The backward loops, now called retrograde motion, are the clearest clue to what is going on. Mars makes one roughly every twenty-six months, always when it stands opposite the Sun in our sky (${ref('fig1-1', 'Figure 1.1')}). Any successful model of the heavens has to reproduce not only the loops but their timing.</p>
  ${figure('fig1-1', '1.1', figureRetrograde(), 'The path of Mars against the stars over seven months around an opposition, with dots a month apart. For about ten weeks the planet moves westward. The loop is drawn wider than it appears in the sky.')}

  <h2 id="s1-2">1.2&ensp;From Circles to Ellipses</h2>
  <p>Ptolemy’s <em>Almagest</em>, written in the second century, placed the Earth at the centre and let each planet ride a small circle, the epicycle, whose centre itself travelled around a larger one. With enough adjustment the scheme predicted planetary positions to within a degree or so, which was as good as the naked-eye observations it was built from.</p>
  <p>Copernicus moved the Sun to the centre in 1543. Retrograde motion then needs no extra machinery: it is what we see when the faster-moving Earth overtakes an outer planet, much as a slower car seems to drift backward as you pass it on a motorway. Yet Copernicus kept perfect circles, and his predictions were no better than Ptolemy’s.</p>
  <p>The decisive data came from Tycho Brahe, who spent two decades measuring planetary positions to about two minutes of arc. His assistant, Johannes Kepler, inherited the records and spent years trying to fit the orbit of Mars. No arrangement of circles worked; the best still missed Tycho’s positions by eight minutes of arc. Kepler trusted the observations over the circles, and in 1609 he published the answer: the orbit of Mars is an ellipse with the Sun at one focus.</p>

  <h2 id="s1-3">1.3&ensp;How to Use This Book</h2>
  <p>The chapters build in order. Chapter 2 states Kepler’s three laws as he found them, purely as descriptions of the data. Chapter 3 shows how Newton’s law of gravitation explains them, and Chapter 4 recasts the same results in terms of energy and angular momentum, the form most useful for calculation. Chapter 5 applies these tools to moving a spacecraft from one orbit to another.</p>
  <p>Worked examples appear in shaded boxes. Each chapter ends with exercises; those marked with an asterisk need a calculator. Physical constants and planetary data are collected in ${ref('appA', 'Appendix A')}.</p>

  <div class="exercises"><div class="exercises-title">Exercises</div><ol>
    <li>Using a sketch of the Earth and Mars on their orbits, explain why the retrograde loop of Mars is centred on opposition.</li>
    <li>Why are Mercury and Venus never seen opposite the Sun in the sky?</li>
    <li>Eight minutes of arc is about a quarter of the Moon’s apparent diameter. Express it as a fraction of a full circle.</li>
    <li>Galileo saw Venus go through a full set of phases, from crescent to nearly full. Explain why the Ptolemaic arrangement cannot produce this.</li>
  </ol></div>
</section>

<section class="chapter" id="ch2">
  <div class="chapter-label">Chapter 2</div>
  <h1>2&ensp;${CH.ch2}</h1>
  <p class="chapter-intro">Kepler’s laws describe how planets move without saying why. Every later result in this book has to reduce to them.</p>

  <h2 id="s2-1">2.1&ensp;The Ellipse</h2>
  <p>An ellipse is the set of points whose distances to two fixed points, the <em>foci</em>, add up to the same constant. Pin a loop of string at two points, pull it taut with a pencil, and the curve you trace is an ellipse. The longest diameter is the major axis, of length 2<em>a</em>; half of it, <em>a</em>, is the <em>semi-major axis</em>, and it is the single most important number describing an orbit. The shortest diameter is the minor axis, of length 2<em>b</em>.</p>
  <p>Each focus lies a distance <em>c</em> from the centre, and the shape of the ellipse is captured by its eccentricity,</p>
  ${equation('eq2-1', '2.1', mi('e'), mo('='), frac(mi('c'), mi('a')))}
  <p>A circle has <em>e</em>&nbsp;=&nbsp;0; as <em>e</em> approaches 1 the ellipse becomes long and thin. The Earth’s orbit has <em>e</em>&nbsp;=&nbsp;0.017, close enough to a circle that the difference cannot be seen in a scale drawing. Mars, at <em>e</em>&nbsp;=&nbsp;0.093, was the planet that gave the circles away.</p>
  <p><span class="law">First law.</span> Each planet moves on an ellipse with the Sun at one focus. The other focus is empty. The point of closest approach is the <em>perihelion</em> and the farthest is the <em>aphelion</em>; from ${ref('fig2-1', 'Figure 2.1')} their distances are</p>
  ${equation('eq2-2', '2.2', sub(mi('r'), mi('p')), mo('='), mi('a'), paren(mn('1'), mo('−'), mi('e')), mo(','), '<mspace width="1.5em"/>', sub(mi('r'), mi('a')), mo('='), mi('a'), paren(mn('1'), mo('+'), mi('e')))}
  ${figure('fig2-1', '2.1', figureEllipse(), 'An elliptical orbit with semi-major axis <i>a</i>, semi-minor axis <i>b</i> and focal distance <i>c</i>. The Sun sits at one focus; the other is empty. The eccentricity is exaggerated.')}

  <h2 id="s2-2">2.2&ensp;Equal Areas in Equal Times</h2>
  <p><span class="law">Second law.</span> The line joining a planet to the Sun sweeps out equal areas in equal times. Near perihelion the line is short, so the planet must move quickly to cover a given area; near aphelion it moves slowly (${ref('fig2-2', 'Figure 2.2')}). The Earth is about 3 per cent faster in early January than in early July, which is one reason northern winter is a few days shorter than northern summer.</p>
  ${figure('fig2-2', '2.2', figureEqualAreas(), 'The two shaded sectors are swept out in equal times. Near perihelion the planet covers the longer arc.')}
  <div class="box key"><div class="box-title">Key idea</div><p>A planet is fastest at perihelion and slowest at aphelion. The second law fixes how much faster: the speeds are in inverse proportion to the distances.</p></div>
  <p>Kepler found this law empirically. We shall see in Chapter 4 that it is a statement of the conservation of angular momentum, and that it holds for any force directed along the line to the Sun, not only gravity.</p>

  <h2 id="s2-3">2.3&ensp;The Harmonic Law</h2>
  <p><span class="law">Third law.</span> The square of a planet’s orbital period is proportional to the cube of its semi-major axis. Measuring periods in years and distances in astronomical units (AU), the mean Earth–Sun distance, the constant of proportionality is one:</p>
  ${equation('eq2-3', '2.3', sup(mi('T'), mn('2')), mo('='), sup(mi('a'), mn('3')))}
  <p>Kepler published this in 1619, ten years after the first two laws, and called it the harmonic law because he believed it expressed a musical order among the planets. Its practical value is that one measured quantity fixes the other. Periods and distances for all eight planets are listed in ${ref('tableA-1', 'Table A.1')}.</p>
  <div class="box example"><div class="box-title">Worked example 2.1&ensp;The period of Mars</div><p>Mars has <em>a</em>&nbsp;=&nbsp;1.524&nbsp;AU. Then <em>T</em><sup>2</sup>&nbsp;=&nbsp;1.524<sup>3</sup>&nbsp;=&nbsp;3.54, so <em>T</em>&nbsp;=&nbsp;1.88 years, or about 687 days. The measured sidereal period is 686.98 days.</p></div>

  <div class="exercises"><div class="exercises-title">Exercises</div><ol>
    <li>Show that the semi-minor axis is <em>b</em>&nbsp;=&nbsp;<em>a</em>√(1&nbsp;−&nbsp;<em>e</em><sup>2</sup>).</li>
    <li>Halley’s Comet has <em>a</em>&nbsp;=&nbsp;17.8&nbsp;AU and <em>e</em>&nbsp;=&nbsp;0.967. Find its perihelion and aphelion distances.</li>
    <li class="calc">Find the period of an asteroid with <em>a</em>&nbsp;=&nbsp;2.77&nbsp;AU.</li>
    <li>Sketch an orbit with <em>e</em>&nbsp;=&nbsp;0.5 and mark where the planet moves fastest and slowest.</li>
    <li class="calc">A planet’s speed at perihelion is 1.2 times its speed at aphelion. Find the eccentricity of its orbit.</li>
  </ol></div>
</section>

<section class="chapter" id="ch3">
  <div class="chapter-label">Chapter 3</div>
  <h1>3&ensp;${CH.ch3}</h1>
  <p class="chapter-intro">Newton showed that Kepler’s three laws and the fall of an apple follow from a single force law.</p>

  <h2 id="s3-1">3.1&ensp;The Inverse-Square Law</h2>
  <p>Two bodies of mass <em>M</em> and <em>m</em> separated by a distance <em>r</em> attract each other with a force</p>
  ${equation('eq3-1', '3.1', mi('F'), mo('='), frac(row(mi('G'), mi('M'), mi('m')), sup(mi('r'), mn('2'))))}
  <p>directed along the line between them. The constant <em>G</em>&nbsp;=&nbsp;6.674&nbsp;×&nbsp;10<sup>−11</sup>&nbsp;N&nbsp;m<sup>2</sup>&nbsp;kg<sup>−2</sup> is small, which is why the pull between everyday objects goes unnoticed; it took Cavendish’s torsion balance, in 1798, to measure it in a laboratory.</p>
  <p>For orbital work the product <em>GM</em> is known far better than either factor, and it gets its own symbol, <em>μ</em>. For the Earth <em>μ</em>&nbsp;=&nbsp;3.986&nbsp;×&nbsp;10<sup>14</sup>&nbsp;m<sup>3</sup>&nbsp;s<sup>−2</sup>, known to better than one part in a billion from the tracking of satellites.</p>
  <p>Newton connected falling and orbiting with a thought experiment (${ref('fig3-1', 'Figure 3.1')}). Fire a cannonball horizontally from a high mountain and it falls to the ground some distance away. Fire it faster and it lands farther off. At a high enough speed the ground curves away beneath it as fast as it falls, and the cannonball never lands. It is in orbit.</p>
  ${figure('fig3-1', '3.1', figureCannon(), 'Newton’s cannon. Each faster shot lands farther away until, at orbital speed, the ball falls all the way around the Earth.')}

  <h2 id="s3-2">3.2&ensp;Circular Orbits</h2>
  <p>On a circular orbit of radius <em>r</em>, gravity supplies exactly the centripetal force needed: <em>mv</em><sup>2</sup>/<em>r</em>&nbsp;=&nbsp;<em>μm</em>/<em>r</em><sup>2</sup>, so</p>
  ${equation('eq3-2', '3.2', mi('v'), mo('='), sqrt(frac(mi('μ'), mi('r'))))}
  <p>The speed does not depend on the mass of the orbiting body. A spanner let go by an astronaut stays beside the station because it was already moving at the right speed for that radius.</p>
  <div class="box example"><div class="box-title">Worked example 3.1&ensp;The International Space Station</div><p>The station orbits about 400&nbsp;km above the surface, at <em>r</em>&nbsp;=&nbsp;6,778&nbsp;km. Equation 3.2 gives <em>v</em>&nbsp;=&nbsp;7.67&nbsp;km/s. One circuit, 2π<em>r</em>, takes 5,550&nbsp;s, or 92.5 minutes, so the crew sees about sixteen sunrises a day.</p></div>

  <h2 id="s3-3">3.3&ensp;Kepler’s Third Law Revisited</h2>
  <p>Dividing the circumference by the speed from ${ref('eq3-2', 'Equation 3.2')} gives the period of a circular orbit, <em>T</em>&nbsp;=&nbsp;2π√(<em>r</em><sup>3</sup>/<em>μ</em>). Newton showed that the same expression holds for an ellipse, with <em>r</em> replaced by the semi-major axis:</p>
  ${equation('eq3-3', '3.3', sup(mi('T'), mn('2')), mo('='), frac(row(mn('4'), sup(mi('π'), mn('2'))), mi('μ')), sup(mi('a'), mn('3')))}
  <p>This is Kepler’s third law with the constant made explicit. Because <em>μ</em> appears in it, the law now weighs the central body: time the orbit of any moon and you have the mass of its planet.</p>

  <div class="exercises"><div class="exercises-title">Exercises</div><ol>
    <li>Compare the Sun’s gravitational pull on the Moon with the Earth’s. Which is larger, and why does the Moon still orbit the Earth?</li>
    <li class="calc">Find the radius of a geostationary orbit, whose period is one sidereal day (86,164&nbsp;s).</li>
    <li>Astronauts on the station feel weightless, yet gravity there is about 90 per cent of its strength at the surface. Explain.</li>
    <li class="calc">Io orbits Jupiter with <em>a</em>&nbsp;=&nbsp;421,700&nbsp;km and <em>T</em>&nbsp;=&nbsp;1.769 days. Estimate the mass of Jupiter.</li>
  </ol></div>
</section>

<section class="chapter" id="ch4">
  <div class="chapter-label">Chapter 4</div>
  <h1>4&ensp;${CH.ch4}</h1>
  <p class="chapter-intro">Forces describe an orbit moment by moment. Two conserved quantities describe all of it at once.</p>

  <h2 id="s4-1">4.1&ensp;Orbital Energy</h2>
  <p>A body in orbit has kinetic energy ½<em>mv</em><sup>2</sup> and gravitational potential energy −<em>μm</em>/<em>r</em>, taken as zero at infinite separation. Their sum per unit mass, the <em>specific orbital energy</em>, stays the same all the way around the orbit:</p>
  ${equation('eq4-1', '4.1', mi('ε'), mo('='), frac(sup(mi('v'), mn('2')), mn('2')), mo('−'), frac(mi('μ'), mi('r')), mo('='), mo('−'), frac(mi('μ'), row(mn('2'), mi('a'))))}
  <p>The second equality is the useful one: the energy depends only on the size of the orbit, not on its shape. Every orbit with the same semi-major axis has the same energy and, by ${ref('eq3-3', 'Equation 3.3')}, the same period. Bound orbits have <em>ε</em>&nbsp;&lt;&nbsp;0. At <em>ε</em>&nbsp;=&nbsp;0 the path becomes a parabola, and for <em>ε</em>&nbsp;&gt;&nbsp;0 a hyperbola; in both cases the body escapes.</p>
  <div class="box key"><div class="box-title">Key idea</div><p>Orbits of the same size have the same energy and the same period, however elongated they are.</p></div>

  <h2 id="s4-2">4.2&ensp;The Vis-Viva Equation</h2>
  <p>Solving Equation 4.1 for the speed gives the relation engineers reach for first:</p>
  ${equation('eq4-2', '4.2', sup(mi('v'), mn('2')), mo('='), mi('μ'), paren(frac(mn('2'), mi('r')), mo('−'), frac(mn('1'), mi('a'))))}
  <p>Given the size of an orbit, it returns the speed at any distance. The speed is greatest at perihelion and least at aphelion, the two points located by ${ref('eq2-2', 'Equation 2.2')} and the geometry of ${ref('fig2-1', 'Figure 2.1')}.</p>
  <p>Angular momentum supplies the second law. Gravity pulls along the line to the Sun and so exerts no torque, which means the angular momentum per unit mass, <em>h</em>&nbsp;=&nbsp;<em>rv</em><sub>⊥</sub>, is constant. In a short time d<em>t</em> the radius sweeps a thin triangle of area ½<em>rv</em><sub>⊥</sub>&nbsp;d<em>t</em>&nbsp;=&nbsp;½<em>h</em>&nbsp;d<em>t</em>, which is Kepler’s equal-area law in one line.</p>
  <div class="box example"><div class="box-title">Worked example 4.1&ensp;The speeds of the Earth</div><p>With <em>a</em>&nbsp;=&nbsp;1.496&nbsp;×&nbsp;10<sup>8</sup>&nbsp;km and <em>e</em>&nbsp;=&nbsp;0.0167, perihelion is at 1.471&nbsp;×&nbsp;10<sup>8</sup>&nbsp;km and aphelion at 1.521&nbsp;×&nbsp;10<sup>8</sup>&nbsp;km. Taking the Sun’s <em>μ</em>&nbsp;=&nbsp;1.327&nbsp;×&nbsp;10<sup>20</sup>&nbsp;m<sup>3</sup>&nbsp;s<sup>−2</sup>, Equation 4.2 gives 30.29&nbsp;km/s at perihelion and 29.29&nbsp;km/s at aphelion.</p></div>

  <h2 id="s4-3">4.3&ensp;Escape Speed</h2>
  <p>Setting <em>ε</em>&nbsp;=&nbsp;0 in Equation 4.1 gives the speed needed to leave a body’s gravity for good, starting from a distance <em>r</em>:</p>
  ${equation('eq4-3', '4.3', sub(mi('v'), mtext('esc')), mo('='), sqrt(frac(row(mn('2'), mi('μ')), mi('r'))))}
  <p>At the Earth’s surface this is 11.2&nbsp;km/s, exactly √2 times the speed of a circular orbit at the same height. Leaving the solar system from the Earth’s distance takes 42.1&nbsp;km/s relative to the Sun, though a spacecraft launched in the direction of the Earth’s motion gets 29.8&nbsp;km/s of that for free.</p>

  <div class="exercises"><div class="exercises-title">Exercises</div><ol>
    <li>Show that a circular orbit has <em>ε</em>&nbsp;=&nbsp;−<em>v</em><sup>2</sup>/2.</li>
    <li class="calc">A satellite at perigee is 7,000&nbsp;km from the Earth’s centre and moving at 8.0&nbsp;km/s. Find the semi-major axis of its orbit.</li>
    <li>Why is it easier to launch eastward, and from a site near the equator?</li>
    <li class="calc">Find the escape speed from the surface of the Moon (<em>μ</em>&nbsp;=&nbsp;4.905&nbsp;×&nbsp;10<sup>12</sup>&nbsp;m<sup>3</sup>&nbsp;s<sup>−2</sup>, radius 1,737&nbsp;km).</li>
  </ol></div>
</section>

<section class="chapter" id="ch5">
  <div class="chapter-label">Chapter 5</div>
  <h1>5&ensp;${CH.ch5}</h1>
  <p class="chapter-intro">A spacecraft changes its orbit by firing its engine. Chapter 4 already contains everything needed to work out how much.</p>

  <h2 id="s5-1">5.1&ensp;Impulsive Burns</h2>
  <p>Most engines burn for minutes while an orbit lasts hours or years, so it is a good approximation to treat each burn as an instantaneous change in velocity, Δ<em>v</em>. The position is unchanged at the moment of the burn; only the speed and direction change, and the orbit with them. Because propellant is limited, the total Δ<em>v</em> of a mission is its basic budget.</p>
  <p>A burn along the direction of motion raises the opposite side of the orbit; a burn against it lowers the opposite side. This is why a spacecraft that wants to catch another one ahead of it on the same orbit first slows down: the lower orbit has the shorter period.</p>

  <h2 id="s5-2">5.2&ensp;The Hohmann Transfer</h2>
  <p>To move between two circular orbits of radius <em>r</em><sub>1</sub> and <em>r</em><sub>2</sub> in the same plane, Walter Hohmann showed in 1925 that the cheapest two-burn path is half of an ellipse that just touches both circles (${ref('fig5-1', 'Figure 5.1')}). Its semi-major axis is <em>a</em><sub>t</sub>&nbsp;=&nbsp;(<em>r</em><sub>1</sub>&nbsp;+&nbsp;<em>r</em><sub>2</sub>)/2. The first burn, at <em>r</em><sub>1</sub>, raises the speed from the circular value to the perihelion speed of the transfer orbit, given by the vis-viva equation (${ref('eq4-2', 'Equation 4.2')}):</p>
  ${equation('eq5-1', '5.1', sub(row(mi('Δ'), mi('v')), mn('1')), mo('='), sqrt(frac(mi('μ'), sub(mi('r'), mn('1')))), paren(sqrt(frac(row(mn('2'), sub(mi('r'), mn('2'))), row(sub(mi('r'), mn('1')), mo('+'), sub(mi('r'), mn('2'))))), mo('−'), mn('1')))}
  <p>Half an orbit later the spacecraft arrives at <em>r</em><sub>2</sub> moving too slowly to stay there, and a second burn circularizes the orbit. The trip takes half the period of the transfer ellipse, which ${ref('eq3-3', 'Equation 3.3')} supplies.</p>
  ${figure('fig5-1', '5.1', figureHohmann(), 'A Hohmann transfer from the Earth’s orbit to that of Mars. The burns happen at the perihelion and aphelion of the transfer ellipse.')}
  <div class="box example"><div class="box-title">Worked example 5.1&ensp;Earth to Mars</div><p>Treat both orbits as circles of 1.000 and 1.524&nbsp;AU. The transfer ellipse has <em>a</em><sub>t</sub>&nbsp;=&nbsp;1.262&nbsp;AU, so the trip takes ½&nbsp;×&nbsp;1.262<sup>3/2</sup>&nbsp;=&nbsp;0.709 years, or 259 days. Equation 5.1 gives a first burn of 2.95&nbsp;km/s on top of the Earth’s orbital speed. Mars must be 44° ahead of the Earth at departure so that it reaches the meeting point at the same moment; that alignment comes round every 26 months, the same rhythm as the retrograde loops of Chapter 1.</p></div>

  <h2 id="s5-3">5.3&ensp;Gravity Assists</h2>
  <p>A spacecraft passing close to a planet swings around it on a hyperbola. In the planet’s frame it leaves at the speed it arrived with, only in a new direction. In the Sun’s frame, however, the planet’s own orbital velocity is added before and after, and the turn can leave the spacecraft much faster or slower than before. Voyager 2 used successive encounters with Jupiter, Saturn and Uranus in this way and reached Neptune in twelve years, against the thirty a Hohmann transfer would have taken.</p>
  <p>The energy is not free: the planet loses exactly what the spacecraft gains, although its enormous mass means its orbit changes by an immeasurably small amount.</p>

  <div class="exercises"><div class="exercises-title">Exercises</div><ol>
    <li>Find the second burn, Δ<em>v</em><sub>2</sub>, for the Earth–Mars transfer.</li>
    <li class="calc">How long does a Hohmann transfer from the Earth to Jupiter (5.20&nbsp;AU) take?</li>
    <li>A spacecraft needs to catch another 100&nbsp;km ahead of it on the same circular orbit. Should it burn forwards or backwards first? Explain.</li>
    <li>Why can a flyby of the Sun not change a spacecraft’s energy relative to the Sun?</li>
  </ol></div>
</section>

<section class="chapter" id="appA">
  <div class="chapter-label">Appendix A</div>
  <h1>A&ensp;${CH.appA}</h1>
  <p class="chapter-intro">Values are rounded to the precision used in the examples and exercises.</p>
  <table id="tableA-1">
    <caption><b>Table A.1</b>&ensp;Orbits of the planets</caption>
    <thead><tr><th>Planet</th><th class="num">Semi-major axis (AU)</th><th class="num">Eccentricity</th><th class="num">Period (years)</th><th class="num">Inclination</th></tr></thead>
    <tbody>
      ${[
        ['Mercury', '0.387', '0.206', '0.241', '7.0°'],
        ['Venus', '0.723', '0.007', '0.615', '3.4°'],
        ['Earth', '1.000', '0.017', '1.000', '0.0°'],
        ['Mars', '1.524', '0.093', '1.881', '1.9°'],
        ['Jupiter', '5.203', '0.048', '11.86', '1.3°'],
        ['Saturn', '9.537', '0.054', '29.45', '2.5°'],
        ['Uranus', '19.19', '0.047', '84.02', '0.8°'],
        ['Neptune', '30.07', '0.009', '164.8', '1.8°'],
      ]
        .map(
          ([name, ...values]) =>
            `<tr><td>${name}</td>${values.map((v) => `<td class="num">${v}</td>`).join('')}</tr>`,
        )
        .join('')}
    </tbody>
  </table>
  <table id="tableA-2">
    <caption><b>Table A.2</b>&ensp;Constants</caption>
    <thead><tr><th>Quantity</th><th>Symbol</th><th class="num">Value</th></tr></thead>
    <tbody>
      ${[
        ['Gravitational constant', 'G', '6.674 × 10⁻¹¹ N m² kg⁻²'],
        ['Gravitational parameter, Sun', 'μ☉', '1.327 × 10²⁰ m³ s⁻²'],
        ['Gravitational parameter, Earth', 'μ⊕', '3.986 × 10¹⁴ m³ s⁻²'],
        ['Gravitational parameter, Moon', 'μ☾', '4.905 × 10¹² m³ s⁻²'],
        ['Astronomical unit', 'AU', '1.496 × 10¹¹ m'],
        ['Mean radius of the Earth', 'R⊕', '6,371 km'],
        ['Sidereal day', '', '86,164 s'],
      ]
        .map(
          ([name, symbol, value]) =>
            `<tr><td>${name}</td><td><i>${symbol}</i></td><td class="num">${value}</td></tr>`,
        )
        .join('')}
    </tbody>
  </table>
</section>`;
}

// ——— The shelf ———

const hexagon = (x, y) =>
  `<polygon transform="translate(${x} ${y})" points="${Array.from({ length: 6 }, (_, i) => {
    const angle = (Math.PI / 3) * i + Math.PI / 6;
    return `${(60 * Math.cos(angle)).toFixed(1)},${(60 * Math.sin(angle)).toFixed(1)}`;
  }).join(' ')}"/>`;

const SHELF = [
  {
    file: 'linear-algebra.pdf',
    title: 'Linear Algebra',
    subtitle: 'A Geometric Introduction',
    author: 'Daniel Okafor',
    edition: 'Third edition',
    background: '#0f4c5c',
    color: '#f3efe6',
    titleFont: "600 46pt/1.02 'Source Serif'",
    motif: `<g transform="translate(270 470)" stroke="#f3efe6" stroke-opacity="0.18">
      ${Array.from({ length: 13 }, (_, i) => `<line x1="${-300 + i * 50}" y1="-260" x2="${-300 + i * 50 + 130}" y2="260"/><line x1="-330" y1="${-240 + i * 40}" x2="330" y2="${-240 + i * 40 - 70}"/>`).join('')}
    </g>
    <g transform="translate(250 520)" stroke-width="5" stroke-linecap="round">
      <line x1="0" y1="0" x2="150" y2="-60" stroke="#f28f6b"/><line x1="0" y1="0" x2="60" y2="-150" stroke="#f6c667"/>
      <line x1="0" y1="0" x2="210" y2="-210" stroke="#f3efe6" stroke-dasharray="2 10"/>
    </g>`,
    chapters: [
      'Vectors',
      'Systems of Equations',
      'Matrices',
      'Determinants',
      'Vector Spaces',
      'Eigenvalues',
      'Orthogonality',
      'Applications',
    ],
  },
  {
    file: 'organic-chemistry.pdf',
    title: 'Organic Chemistry',
    subtitle: 'Structure, Mechanism and Synthesis',
    author: 'Ines Varga · Paul Lindqvist',
    edition: 'Second edition',
    background: '#7a1f2b',
    color: '#fbeee6',
    titleFont: "600 44pt/1.02 'Source Serif'",
    motif: `<g fill="none" stroke="#fbeee6" stroke-width="3" stroke-opacity="0.55" transform="translate(300 500)">
      ${hexagon(0, 0)}${hexagon(104, 60)}${hexagon(104, 180)}${hexagon(-104, 60)}${hexagon(0, 240)}
      <circle r="30" stroke-opacity="0.35"/>
    </g>`,
    chapters: [
      'Bonding',
      'Alkanes',
      'Stereochemistry',
      'Substitution',
      'Elimination',
      'Aromaticity',
      'Carbonyls',
      'Synthesis',
    ],
  },
  {
    file: 'the-living-cell.pdf',
    title: 'The Living Cell',
    subtitle: 'An Introduction to Cell Biology',
    author: 'Ruth Adeyemi',
    edition: 'Fourth edition',
    background: '#1f4d3a',
    color: '#eef5e8',
    titleFont: "600 48pt/1.02 'Source Serif'",
    motif: `<g transform="translate(300 500)">
      <ellipse rx="220" ry="170" fill="#2d6a4f" stroke="#b7e4c7" stroke-width="3" stroke-opacity="0.6"/>
      <circle cx="-30" cy="10" r="70" fill="#40916c" stroke="#d8f3dc" stroke-width="2.5" stroke-opacity="0.7"/>
      <circle cx="-40" cy="0" r="22" fill="#95d5b2" opacity="0.8"/>
      <ellipse cx="120" cy="-70" rx="38" ry="18" fill="none" stroke="#d8f3dc" stroke-width="2.5" stroke-opacity="0.6" transform="rotate(25 120 -70)"/>
      <ellipse cx="100" cy="90" rx="34" ry="16" fill="none" stroke="#d8f3dc" stroke-width="2.5" stroke-opacity="0.6" transform="rotate(-20 100 90)"/>
      ${Array.from({ length: 18 }, (_, i) => `<circle cx="${(Math.cos(i * 1.7) * (90 + (i % 5) * 18)).toFixed(1)}" cy="${(Math.sin(i * 1.7) * (70 + (i % 4) * 15)).toFixed(1)}" r="4" fill="#d8f3dc" opacity="0.5"/>`).join('')}
    </g>`,
    chapters: [
      'Cells and Their Parts',
      'Membranes',
      'Energy',
      'DNA',
      'Gene Expression',
      'Signalling',
      'Division',
      'Development',
    ],
  },
  {
    file: 'microeconomics.pdf',
    title: 'Microeconomics',
    subtitle: 'Choices, Markets and Prices',
    author: 'Thomas Whitcombe',
    edition: 'Sixth edition',
    background: '#e2a93b',
    color: '#2b2116',
    titleFont: "650 44pt/1.02 'Source Serif'",
    motif: `<g transform="translate(110 420)" fill="none" stroke-width="5" stroke-linecap="round">
      <line x1="0" y1="0" x2="0" y2="230" stroke="#2b2116" stroke-width="3"/><line x1="0" y1="230" x2="330" y2="230" stroke="#2b2116" stroke-width="3"/>
      <path d="M30 20 Q150 160 310 200" stroke="#7a3e12"/><path d="M30 210 Q170 120 310 30" stroke="#fff4dc"/>
      <circle cx="166" cy="128" r="8" fill="#2b2116" stroke="none"/>
    </g>`,
    chapters: [
      'Scarcity',
      'Supply and Demand',
      'Elasticity',
      'Consumers',
      'Firms',
      'Competition',
      'Market Power',
      'Public Goods',
    ],
  },
  {
    file: 'history-of-mathematics.pdf',
    title: 'A Concise History of Mathematics',
    subtitle: 'From Clay Tablets to Computers',
    author: 'Priya Raman',
    edition: 'Revised edition',
    background: '#efe6d2',
    color: '#3b2a1a',
    titleFont: "600 38pt/1.06 'Source Serif'",
    motif: `<g transform="translate(270 520)" fill="none" stroke="#8c5a2b" stroke-width="2.4" stroke-opacity="0.7">
      <circle cx="-60" r="120"/><circle cx="60" r="120"/>
      <line x1="-60" y1="0" x2="60" y2="0"/><line x1="0" y1="-104" x2="0" y2="104"/>
      <polygon points="-60,0 60,0 0,-104" stroke="#3b2a1a" stroke-opacity="0.8"/>
    </g>`,
    chapters: [
      'Counting',
      'Babylon and Egypt',
      'Greece',
      'India and the Islamic World',
      'Renaissance Algebra',
      'Calculus',
      'Rigour',
      'Computation',
    ],
  },
];

function shelfBody(book) {
  return book.chapters
    .map(
      (title, index) => `
<section class="chapter" id="c${index + 1}">
  <div class="chapter-label">Chapter ${index + 1}</div>
  <h1>${index + 1}&ensp;${title}</h1>
</section>`,
    )
    .join('');
}

// ——— Printing ———

function html({ head, body, title }) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title><style>${styles(head)}</style></head><body>${body}</body></html>`;
}

async function print(page, file, documentHtml, outDir) {
  const source = path.join(outDir, file.replace(/\.pdf$/, '.html'));
  await writeFile(source, documentHtml);
  await page.goto(pathToFileURL(source).href);
  await page.evaluate(() => document.fonts.ready);
  const target = path.join(outDir, file);
  await page.pdf({
    path: target,
    preferCSSPageSize: true,
    printBackground: true,
    outline: true,
    tagged: true,
  });
  return target;
}

export const ORBITS_FILE = 'orbits.pdf';

export async function generateSampleBooks(outDir = path.join(ROOT, '.scratch', 'readme')) {
  await mkdir(outDir, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage();
  try {
    const orbits = {
      title: 'Orbits',
      subtitle: 'An Introduction to Celestial Mechanics',
      author: 'Margaret Halloran',
      edition: 'Second edition',
    };
    const files = [
      await print(
        page,
        ORBITS_FILE,
        html({
          title: 'Orbits: An Introduction to Celestial Mechanics',
          head: { runningHead: 'ORBITS' },
          body: COVERS.orbits(orbits) + orbitsBody(),
        }),
        outDir,
      ),
    ];

    for (const book of SHELF) {
      files.push(
        await print(
          page,
          book.file,
          html({
            title: `${book.title}: ${book.subtitle}`,
            head: { runningHead: book.title.toUpperCase() },
            body: COVERS.plain(book) + shelfBody(book),
          }),
          outDir,
        ),
      );
    }
    return files;
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  for (const file of await generateSampleBooks()) console.log(path.relative(ROOT, file));
}
