// Zeichen-Editor für Schaltpläne und Schaltzeichen + gemeinsames Rendering (auch für die Auswertung).
import { h, esc } from './dom.js';

export const W = 800, H = 400, GRID = 20;

// Symbole: um (0,0) zentriert, Anschlüsse links/rechts bei x = ±40
const S = (body) => `<g stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round">${body}</g>`;
const meter = (t) => S(`<line x1="-40" y1="0" x2="-18" y2="0"/><line x1="18" y1="0" x2="40" y2="0"/><circle r="18"/>`) + `<text y="6" text-anchor="middle" font-size="18" font-weight="700" fill="currentColor">${t}</text>`;
export const SYMBOLS = {
  source:    { label: 'Spannungsquelle', svg: S(`<line x1="-40" y1="0" x2="-6" y2="0"/><line x1="-6" y1="-18" x2="-6" y2="18"/><line x1="6" y1="-9" x2="6" y2="9"/><line x1="6" y1="0" x2="40" y2="0"/>`) + `<text x="-20" y="-8" font-size="14" fill="currentColor">+</text>` },
  resistor:  { label: 'Widerstand', svg: S(`<line x1="-40" y1="0" x2="-26" y2="0"/><rect x="-26" y="-9" width="52" height="18"/><line x1="26" y1="0" x2="40" y2="0"/>`) },
  lamp:      { label: 'Leuchte', svg: S(`<line x1="-40" y1="0" x2="-16" y2="0"/><line x1="16" y1="0" x2="40" y2="0"/><circle r="16"/><line x1="-11" y1="-11" x2="11" y2="11"/><line x1="-11" y1="11" x2="11" y2="-11"/>`) },
  voltmeter: { label: 'Voltmeter (V)', svg: meter('V') },
  ammeter:   { label: 'Strommesser (A)', svg: meter('A') },
  ohmmeter:  { label: 'Ohmmeter (Ω)', svg: meter('Ω') },
  motor:     { label: 'Motor', svg: meter('M') },
  ground:    { label: 'Masse', svg: S(`<line x1="-40" y1="0" x2="-8" y2="0"/><line x1="-8" y1="-16" x2="-8" y2="16"/><line x1="0" y1="-10" x2="0" y2="10"/><line x1="8" y1="-4" x2="8" y2="4"/>`) },
};

const pts = (a) => a.map((p) => p.join(',')).join(' ');
function arrowHead(a, b) {
  const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
  const l = 12, s = 0.45;
  const p1 = [b[0] - l * Math.cos(ang - s), b[1] - l * Math.sin(ang - s)];
  const p2 = [b[0] - l * Math.cos(ang + s), b[1] - l * Math.sin(ang + s)];
  return `<polygon points="${pts([b, p1, p2])}" fill="currentColor"/>`;
}

export function elementSvg(e) {
  switch (e.t) {
    case 'sym': return `<g transform="translate(${e.x} ${e.y}) rotate(${e.r || 0})">${SYMBOLS[e.k]?.svg || ''}</g>`;
    case 'line': return `<polyline points="${pts(e.pts)}" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>` + (e.arrow && e.pts.length > 1 ? arrowHead(e.pts[e.pts.length - 2], e.pts[e.pts.length - 1]) : '');
    case 'free': return `<polyline points="${pts(e.pts)}" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`;
    case 'rect': return `<rect x="${e.x}" y="${e.y}" width="${e.w}" height="${e.h}" fill="none" stroke="currentColor" stroke-width="2.4"/>`;
    case 'ell': return `<ellipse cx="${e.cx}" cy="${e.cy}" rx="${e.rx}" ry="${e.ry}" fill="none" stroke="currentColor" stroke-width="2.4"/>`;
    case 'tri': return `<polygon points="${pts([[e.x + e.w / 2, e.y], [e.x + e.w, e.y + e.h], [e.x, e.y + e.h]])}" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/>`;
    case 'text': return `<text x="${e.x}" y="${e.y}" font-size="18" fill="currentColor">${esc(e.s)}</text>`;
    default: return '';
  }
}

function gridDefs() {
  return `<defs><pattern id="g" width="${GRID}" height="${GRID}" patternUnits="userSpaceOnUse"><circle cx="${GRID / 2}" cy="${GRID / 2}" r="1" fill="currentColor" opacity=".25"/></pattern></defs><rect width="${W}" height="${H}" fill="url(#g)"/>`;
}

// Nur-Lese-Darstellung (Auswertung)
export function drawingView(elements) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('class', 'draw-canvas readonly');
  svg.innerHTML = gridDefs() + (elements || []).map(elementSvg).join('');
  return svg;
}

const snap = (v) => Math.round(v / GRID) * GRID;

export function drawEditor({ symbols = [], value = [], onChange }) {
  let els = JSON.parse(JSON.stringify(value || []));
  let tool = 'select', sel = -1, draft = null, sym = symbols[0] || null;
  const history = [];

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('class', 'draw-canvas');
  svg.setAttribute('tabindex', '0');

  const toolBtns = {};
  const status = h('span', { class: 'muted small' });

  function commit(push = true) {
    if (push) { history.push(JSON.stringify(els)); if (history.length > 60) history.shift(); }
    onChange?.(els.length ? { elements: els } : null);
    redraw();
  }
  function redraw() {
    const body = els.map((e, i) => `<g data-i="${i}" class="${i === sel ? 'sel' : ''}">${elementSvg(e)}</g>`).join('');
    let d = '';
    if (draft) {
      if (draft.t === 'line') d = elementSvg({ t: 'line', pts: [...draft.pts, draft.cur].filter(Boolean), arrow: draft.arrow });
      else d = elementSvg(draft);
    }
    svg.innerHTML = gridDefs() + body + `<g class="draft">${d}</g>`;
    for (const [k, b] of Object.entries(toolBtns)) b.classList.toggle('active', k === tool || (k.startsWith('sym:') && tool === 'sym' && k === 'sym:' + sym));
    status.textContent = ({
      select: 'Elemente anklicken und verschieben', line: 'Klicken = Punkt setzen · Doppelklick = Linie beenden', arrow: 'Klicken = Punkt setzen · Doppelklick = Pfeil beenden',
      free: 'Mit gedrückter Maustaste/Finger zeichnen', rect: 'Ziehen für Rechteck', ell: 'Ziehen für Kreis/Ellipse', tri: 'Ziehen für Dreieck', text: 'Klicken, dann Text eingeben', sym: 'Klicken, um das Symbol zu platzieren',
    })[tool] || '';
  }
  function pos(ev, doSnap = true) {
    const m = svg.getScreenCTM().inverse();
    const p = new DOMPoint(ev.clientX, ev.clientY).matrixTransform(m);
    return doSnap ? [snap(p.x), snap(p.y)] : [Math.round(p.x), Math.round(p.y)];
  }
  function finishLine() {
    if (draft && draft.t === 'line') {
      const p = draft.pts;
      if (p.length >= 2) { els.push({ t: 'line', pts: p, ...(draft.arrow ? { arrow: true } : {}) }); draft = null; commit(); return; }
    }
    draft = null; redraw();
  }

  let drag = null;
  svg.addEventListener('pointerdown', (ev) => {
    svg.focus();
    const p = pos(ev), raw = pos(ev, false);
    if (tool === 'select') {
      const g = ev.target.closest('g[data-i]');
      sel = g ? Number(g.dataset.i) : -1;
      if (g) { drag = { start: raw, orig: JSON.stringify(els[sel]), moved: false }; svg.setPointerCapture(ev.pointerId); }
      redraw();
    } else if (tool === 'line' || tool === 'arrow') {
      if (!draft) draft = { t: 'line', pts: [p], cur: p, arrow: tool === 'arrow' };
      else if (JSON.stringify(draft.pts.at(-1)) !== JSON.stringify(p)) draft.pts.push(p);
      redraw();
    } else if (tool === 'free') {
      draft = { t: 'free', pts: [raw] }; svg.setPointerCapture(ev.pointerId);
    } else if (tool === 'rect' || tool === 'ell' || tool === 'tri') {
      draft = { t: tool, ox: p[0], oy: p[1] }; shapeUpdate(draft, p); svg.setPointerCapture(ev.pointerId);
    } else if (tool === 'text') {
      const s = prompt('Beschriftung:');
      if (s && s.trim()) { els.push({ t: 'text', x: p[0], y: p[1], s: s.trim() }); sel = els.length - 1; commit(); }
    } else if (tool === 'sym' && sym) {
      els.push({ t: 'sym', k: sym, x: p[0], y: p[1], r: 0 }); sel = els.length - 1; commit();
    }
  });
  function shapeUpdate(d, p) {
    const x = Math.min(d.ox, p[0]), y = Math.min(d.oy, p[1]), w = Math.abs(p[0] - d.ox), hh = Math.abs(p[1] - d.oy);
    if (d.t === 'ell') Object.assign(d, { cx: x + w / 2, cy: y + hh / 2, rx: w / 2, ry: hh / 2 });
    else Object.assign(d, { x, y, w, h: hh });
  }
  svg.addEventListener('pointermove', (ev) => {
    if (draft?.t === 'line') { draft.cur = pos(ev); redraw(); }
    else if (draft?.t === 'free' && ev.buttons) { draft.pts.push(pos(ev, false)); redraw(); }
    else if (draft && ['rect', 'ell', 'tri'].includes(draft.t)) { shapeUpdate(draft, pos(ev)); redraw(); }
    else if (drag) {
      const raw = pos(ev, false);
      const dx = snap(raw[0] - drag.start[0]), dy = snap(raw[1] - drag.start[1]);
      const o = JSON.parse(drag.orig), e = els[sel];
      if (e.t === 'sym' || e.t === 'text') { e.x = o.x + dx; e.y = o.y + dy; }
      else if (e.t === 'rect' || e.t === 'tri') { e.x = o.x + dx; e.y = o.y + dy; }
      else if (e.t === 'ell') { e.cx = o.cx + dx; e.cy = o.cy + dy; }
      else e.pts = o.pts.map((q) => [q[0] + dx, q[1] + dy]);
      drag.moved = dx !== 0 || dy !== 0; redraw();
    }
  });
  svg.addEventListener('pointerup', () => {
    if (draft?.t === 'free') { if (draft.pts.length > 1) els.push(draft); draft = null; commit(); }
    else if (draft && ['rect', 'ell', 'tri'].includes(draft.t)) {
      const big = draft.t === 'ell' ? draft.rx > 3 : draft.w > 3;
      if (big) { const { ox, oy, ...e } = draft; els.push(e); } draft = null; commit();
    } else if (drag) { if (drag.moved) commit(); drag = null; }
  });
  svg.addEventListener('dblclick', () => { if (draft?.t === 'line') { draft.pts.pop(); if (draft.pts.length < 2) draft.pts.push(draft.cur); finishLine(); } });
  svg.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') { if (draft) finishLine(); }
    if ((ev.key === 'Delete' || ev.key === 'Backspace') && sel >= 0) { ev.preventDefault(); del(); }
  });

  function del() { if (sel < 0) return; els.splice(sel, 1); sel = -1; commit(); }
  function undo() { if (history.length < 2) return; history.pop(); els = JSON.parse(history.at(-1)); sel = -1; draft = null; onChange?.(els.length ? { elements: els } : null); redraw(); }
  function rotate() { if (sel >= 0 && els[sel].t === 'sym') { els[sel].r = ((els[sel].r || 0) + 90) % 360; commit(); } }

  const mk = (key, label, fn, title) => { const b = h('button', { type: 'button', class: 'btn small tool', title: title || label, onclick: fn }, label); toolBtns[key] = b; return b; };
  const setTool = (t) => () => { if (draft) finishLine(); tool = t; sel = -1; redraw(); };
  const toolbar = h('div', { class: 'draw-toolbar' },
    mk('select', '⇱ Auswahl', setTool('select')),
    mk('line', '／ Leitung', setTool('line')),
    mk('arrow', '➝ Pfeil', setTool('arrow')),
    mk('free', '✎ Freihand', setTool('free')),
    mk('rect', '▭', setTool('rect'), 'Rechteck'),
    mk('ell', '◯', setTool('ell'), 'Kreis / Ellipse'),
    mk('tri', '△', setTool('tri'), 'Dreieck'),
    mk('text', 'T Text', setTool('text')),
    h('span', { class: 'sep' }),
    h('button', { type: 'button', class: 'btn small', onclick: rotate, title: 'Ausgewähltes Symbol drehen' }, '↻ Drehen'),
    h('button', { type: 'button', class: 'btn small', onclick: del, title: 'Ausgewähltes Element löschen' }, '✕ Löschen'),
    h('button', { type: 'button', class: 'btn small', onclick: undo }, '↶ Zurück'),
    h('button', { type: 'button', class: 'btn small', onclick: () => { if (els.length && confirm('Alles löschen?')) { els = []; sel = -1; commit(); } } }, 'Alles löschen'),
  );
  const palette = symbols.length ? h('div', { class: 'draw-toolbar palette' }, h('span', { class: 'muted small' }, 'Symbole:'),
    symbols.map((k) => {
      const b = h('button', { type: 'button', class: 'btn small tool symbtn', title: SYMBOLS[k].label, onclick: () => { if (draft) finishLine(); tool = 'sym'; sym = k; sel = -1; redraw(); } });
      b.innerHTML = `<svg viewBox="-44 -24 88 48" width="44" height="24">${SYMBOLS[k].svg}</svg>`;
      b.append(' ' + SYMBOLS[k].label);
      toolBtns['sym:' + k] = b;
      return b;
    })) : null;

  history.push(JSON.stringify(els));
  redraw();
  return h('div', { class: 'draw-editor' }, toolbar, palette, svg, status);
}
