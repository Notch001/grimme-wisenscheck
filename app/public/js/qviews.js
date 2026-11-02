// Darstellung der Aufgaben für Teilnehmer. Jede View ruft onChange(response | null) bei Änderungen auf.
import { h } from './dom.js';
import { drawEditor } from './draw.js';

const lettered = (i) => String.fromCharCode(97 + i) + ')';

function imageBlock(q, extra) {
  if (!q.image) return null;
  const img = h('img', { src: q.image, alt: 'Aufgabenbild', draggable: 'false' });
  return h('div', { class: 'imgwrap' }, img, extra);
}

const views = {
  single(q, resp, onChange) {
    const wrap = h('div', { class: 'choices' });
    const draw = () => {
      wrap.replaceChildren(...q.config.options.map((o, i) => h('button', {
        type: 'button', class: 'choice' + (resp?.value === o.id ? ' picked' : ''), role: 'radio', 'aria-checked': resp?.value === o.id,
        onclick: () => { resp = { value: o.id }; onChange(resp); draw(); },
      }, h('span', { class: 'mark radio' }), h('span', {}, o.text))));
    };
    draw();
    return h('div', {}, h('p', { class: 'hint' }, 'Eine Antwort auswählen.'), wrap);
  },

  multi(q, resp, onChange) {
    let values = [...(resp?.values || [])];
    const wrap = h('div', { class: 'choices' });
    const draw = () => {
      wrap.replaceChildren(...q.config.options.map((o) => h('button', {
        type: 'button', class: 'choice' + (values.includes(o.id) ? ' picked' : ''), role: 'checkbox', 'aria-checked': values.includes(o.id),
        onclick: () => { values = values.includes(o.id) ? values.filter((v) => v !== o.id) : [...values, o.id]; onChange(values.length ? { values } : null); draw(); },
      }, h('span', { class: 'mark check' }), h('span', {}, o.text))));
    };
    draw();
    return h('div', {}, h('p', { class: 'hint' }, 'Mehrere Antworten möglich – wähle alle zutreffenden aus.'), wrap);
  },

  strike(q, resp, onChange) {
    let struck = [...(resp?.struck || [])];
    const wrap = h('div', { class: 'choices' });
    const draw = () => {
      wrap.replaceChildren(...q.config.options.map((o) => h('button', {
        type: 'button', class: 'choice strike' + (struck.includes(o.id) ? ' struck' : ''),
        onclick: () => { struck = struck.includes(o.id) ? struck.filter((v) => v !== o.id) : [...struck, o.id]; onChange(struck.length ? { struck } : null); draw(); },
      }, h('span', { class: 'mark x' }, '✕'), h('span', { class: 'txt' }, o.text))));
    };
    draw();
    return h('div', {}, h('p', { class: 'hint' }, 'Tippe auf die falschen Aussagen, um sie durchzustreichen.'), wrap);
  },

  order(q, resp, onChange) {
    let order = resp?.order?.length === q.config.items.length ? resp.order.map((id) => q.config.items.find((i) => i.id === id)).filter(Boolean) : [...q.config.items];
    if (order.length !== q.config.items.length) order = [...q.config.items];
    const list = h('ol', { class: 'orderlist' });
    let dragIdx = null;
    const move = (i, d) => { const j = i + d; if (j < 0 || j >= order.length) return; [order[i], order[j]] = [order[j], order[i]]; onChange({ order: order.map((x) => x.id) }); draw(); };
    const draw = () => {
      list.replaceChildren(...order.map((it, i) => h('li', {
        class: 'orderitem', draggable: 'true',
        ondragstart: (e) => { dragIdx = i; e.dataTransfer.effectAllowed = 'move'; },
        ondragover: (e) => e.preventDefault(),
        ondrop: (e) => { e.preventDefault(); if (dragIdx === null || dragIdx === i) return; const [m] = order.splice(dragIdx, 1); order.splice(i, 0, m); dragIdx = null; onChange({ order: order.map((x) => x.id) }); draw(); },
      },
      h('span', { class: 'grip', 'aria-hidden': 'true' }, '⋮⋮'),
      h('span', { class: 'num' }, `Schritt ${i + 1}`),
      h('span', { class: 'grow' }, it.text),
      h('button', { type: 'button', class: 'btn icon', 'aria-label': 'nach oben', disabled: i === 0, onclick: () => move(i, -1) }, '↑'),
      h('button', { type: 'button', class: 'btn icon', 'aria-label': 'nach unten', disabled: i === order.length - 1, onclick: () => move(i, 1) }, '↓'))));
    };
    draw();
    return h('div', {}, h('p', { class: 'hint' }, 'Bringe die Schritte in die richtige Reihenfolge (ziehen oder Pfeile nutzen).'), list);
  },

  match(q, resp, onChange) {
    const pairs = { ...(resp?.pairs || {}) };
    const rows = q.config.left.map((l, i) => {
      const sel = h('select', {
        'aria-label': l.text,
        onchange: () => { if (sel.value) pairs[l.id] = sel.value; else delete pairs[l.id]; onChange(Object.keys(pairs).length ? { pairs: { ...pairs } } : null); sel.classList.toggle('filled', !!sel.value); },
      }, h('option', { value: '' }, '– wählen –'), q.config.right.map((r) => h('option', { value: r.id, selected: pairs[l.id] === r.id }, r.text)));
      sel.classList.toggle('filled', !!pairs[l.id]);
      return h('div', { class: 'matchrow' }, h('div', { class: 'ml' }, h('b', {}, lettered(i)), ' ', l.text), sel);
    });
    return h('div', {}, h('p', { class: 'hint' }, 'Wähle zu jeder Zeile die passende Zuordnung.'), q.image ? imageBlock(q) : null, h('div', { class: 'matchlist' }, rows));
  },

  number(q, resp, onChange) {
    const inp = h('input', { type: 'text', inputmode: 'decimal', placeholder: 'Wert eingeben', value: resp?.value ?? '', oninput: () => onChange(inp.value.trim() ? { value: inp.value } : null) });
    return h('div', {}, h('p', { class: 'hint' }, 'Gib das Ergebnis als Zahl ein (Komma oder Punkt).'), h('div', { class: 'numinput' }, inp, q.config.unit ? h('span', { class: 'unit' }, q.config.unit) : null));
  },

  text(q, resp, onChange) {
    const inp = h('input', { type: 'text', placeholder: 'Antwort eingeben', value: resp?.value ?? '', oninput: () => onChange(inp.value.trim() ? { value: inp.value } : null) });
    return h('div', { class: 'numinput' }, inp);
  },

  imagelabel(q, resp, onChange) {
    let placements = { ...(resp?.placements || {}) };
    let active = null;
    const bank = h('div', { class: 'labelbank' });
    const layer = h('div', { class: 'layer' });
    const wrap = imageBlock(q, layer);
    wrap.classList.add('clickable');
    const draw = () => {
      bank.replaceChildren(...q.config.labels.map((l) => h('button', {
        type: 'button', class: 'chip' + (active === l.id ? ' active' : '') + (placements[l.id] ? ' placed' : ''),
        onclick: () => { active = active === l.id ? null : l.id; draw(); },
      }, l.text, placements[l.id] ? ' ✓' : '')));
      layer.replaceChildren(...Object.entries(placements).map(([lid, p]) => {
        const l = q.config.labels.find((x) => x.id === lid);
        return h('button', {
          type: 'button', class: 'pin', style: { left: p.x + '%', top: p.y + '%' }, title: 'Zum Entfernen anklicken',
          onclick: (e) => { e.stopPropagation(); delete placements[lid]; onChange(Object.keys(placements).length ? { placements: { ...placements } } : null); draw(); },
        }, l?.text || '?');
      }));
    };
    wrap.addEventListener('click', (e) => {
      if (!active) return;
      const r = wrap.querySelector('img').getBoundingClientRect();
      placements[active] = { x: Math.round(((e.clientX - r.left) / r.width) * 1000) / 10, y: Math.round(((e.clientY - r.top) / r.height) * 1000) / 10 };
      active = null; onChange({ placements: { ...placements } }); draw();
    });
    draw();
    return h('div', {}, h('p', { class: 'hint' }, 'Wähle eine Bezeichnung und klicke dann auf die passende Stelle im Bild. Platzierte Bezeichnungen lassen sich per Klick wieder entfernen.'), bank, wrap);
  },

  hotspot(q, resp, onChange) {
    let points = [...(resp?.points || [])];
    const layer = h('div', { class: 'layer' });
    const counter = h('span', { class: 'muted' });
    const wrap = imageBlock(q, layer);
    wrap.classList.add('clickable', 'crosshair');
    const draw = () => {
      counter.textContent = `${points.length} Markierung${points.length === 1 ? '' : 'en'} gesetzt`;
      layer.replaceChildren(...points.map((p, i) => h('button', {
        type: 'button', class: 'dot', style: { left: p.x + '%', top: p.y + '%' }, title: 'Zum Entfernen anklicken',
        onclick: (e) => { e.stopPropagation(); points.splice(i, 1); onChange(points.length ? { points: [...points] } : null); draw(); },
      })));
    };
    wrap.addEventListener('click', (e) => {
      if (points.length >= q.config.maxClicks) return;
      const r = wrap.querySelector('img').getBoundingClientRect();
      points.push({ x: Math.round(((e.clientX - r.left) / r.width) * 1000) / 10, y: Math.round(((e.clientY - r.top) / r.height) * 1000) / 10 });
      onChange({ points: [...points] }); draw();
    });
    draw();
    return h('div', {}, h('p', { class: 'hint' }, 'Klicke in das Bild, um Markierungen zu setzen. Ein Klick auf eine Markierung entfernt sie wieder.'), wrap, h('div', { class: 'row' }, counter));
  },

  drawing(q, resp, onChange) {
    return h('div', {}, q.config.note ? h('p', { class: 'hint' }, q.config.note) : null, q.image ? imageBlock(q) : null,
      drawEditor({ symbols: q.config.symbols, value: resp?.elements || [], onChange }));
  },

  practical(q, resp, onChange) {
    const ta = h('textarea', { rows: 3, placeholder: 'z. B. Messwert oder Anmerkungen notieren (optional)', oninput: () => onChange(ta.value.trim() ? { note: ta.value } : null) }, resp?.note || '');
    return h('div', {}, h('div', { class: 'callout' }, h('b', {}, 'Praktische Aufgabe. '), q.config.note || 'Wird vor Ort vom Ausbilder bewertet.'), q.image ? imageBlock(q) : null, ta);
  },
};

export function renderQuestion(q, resp, onChange) {
  const body = views[q.type](q, resp, onChange);
  return h('div', { class: 'qbody' },
    q.image && !['match', 'imagelabel', 'hotspot', 'drawing', 'practical'].includes(q.type) ? imageBlock(q) : null,
    body);
}
