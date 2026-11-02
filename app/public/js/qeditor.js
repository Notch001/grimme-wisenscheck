// Editor für Fragen im Fragenkatalog (alle Aufgabentypen).
import { h, api, toast } from './dom.js';
import { SYMBOLS } from './draw.js';

const uid = () => Math.random().toString(36).slice(2, 7);
const clone = (o) => JSON.parse(JSON.stringify(o));
const ta = (value, onInput, rows = 2, ph = '') => h('textarea', { rows, placeholder: ph, oninput: (e) => onInput(e.target.value) }, value || '');
const inp = (value, onInput, ph = '', type = 'text') => h('input', { type, value: value ?? '', placeholder: ph, oninput: (e) => onInput(e.target.value) });
const field = (label, ...c) => h('label', { class: 'field' }, h('span', {}, label), ...c);

const DEFAULTS = {
  single: () => ({ options: [{ id: 'a', text: '' }, { id: 'b', text: '' }, { id: 'c', text: '' }], correct: 'a' }),
  multi: () => ({ options: [{ id: 'a', text: '' }, { id: 'b', text: '' }, { id: 'c', text: '' }, { id: 'd', text: '' }], correct: [] }),
  strike: () => ({ options: [{ id: 'a', text: '' }, { id: 'b', text: '' }, { id: 'c', text: '' }], wrong: [] }),
  order: () => ({ items: [{ id: 's1', text: '' }, { id: 's2', text: '' }, { id: 's3', text: '' }] }),
  match: () => ({ left: [{ id: 'l1', text: '' }, { id: 'l2', text: '' }], right: [{ id: 'r1', text: '' }, { id: 'r2', text: '' }], pairs: {} }),
  number: () => ({ answer: '', tolerance: 0, unit: '' }),
  text: () => ({ accepted: [] }),
  imagelabel: () => ({ labels: [], targets: [], radius: 6, aspect: 0.5 }),
  hotspot: () => ({ areas: [], radius: 5, aspect: 0.5, maxClicks: 12 }),
  drawing: () => ({ symbols: [], note: '' }),
  practical: () => ({ note: 'Wird vor Ort vom Ausbilder bewertet.', criteria: [] }),
};

// generischer Editor für Listen aus {id,text}
function listEditor(list, { onChange, extra, min = 1, addLabel = 'Eintrag hinzufügen', idPrefix = 'o' }) {
  const box = h('div', { class: 'listed' });
  const draw = () => {
    box.replaceChildren(...list.map((it, i) => h('div', { class: 'lrow' },
      extra ? extra(it, i) : null,
      h('input', { type: 'text', value: it.text, placeholder: `Text ${i + 1}`, oninput: (e) => { it.text = e.target.value; onChange(); } }),
      h('button', { type: 'button', class: 'btn icon', title: 'nach oben', disabled: i === 0, onclick: () => { [list[i - 1], list[i]] = [list[i], list[i - 1]]; onChange(true); draw(); } }, '↑'),
      h('button', { type: 'button', class: 'btn icon', title: 'nach unten', disabled: i === list.length - 1, onclick: () => { [list[i + 1], list[i]] = [list[i], list[i + 1]]; onChange(true); draw(); } }, '↓'),
      h('button', { type: 'button', class: 'btn icon danger', title: 'entfernen', disabled: list.length <= min, onclick: () => { list.splice(i, 1); onChange(true); draw(); } }, '✕'))),
      h('button', { type: 'button', class: 'btn small', onclick: () => { list.push({ id: idPrefix + uid(), text: '' }); onChange(true); draw(); } }, '+ ' + addLabel));
  };
  draw();
  return { node: box, redraw: draw };
}

// Bild anklicken, um Ziele/Bereiche zu setzen
function imagePicker(state, kind, redrawConfig) {
  const c = state.config;
  if (!state.image) return h('p', { class: 'callout' }, 'Bitte zuerst oben ein Bild wählen oder hochladen.');
  const layer = h('div', { class: 'layer' });
  const img = h('img', { src: state.image, alt: '' });
  const wrap = h('div', { class: 'imgwrap clickable crosshair' }, img, layer);
  let activeLabel = null;
  const labelBar = h('div', { class: 'labelbank' });
  const draw = () => {
    layer.replaceChildren(...(kind === 'imagelabel' ? c.targets : c.areas).map((t, i) => h('button', {
      type: 'button', class: 'ring', style: { left: t.x + '%', top: t.y + '%', width: (kind === 'imagelabel' ? c.radius : t.r) * 2 + '%' },
      title: 'Klicken zum Entfernen',
      onclick: (e) => { e.stopPropagation(); (kind === 'imagelabel' ? c.targets : c.areas).splice(i, 1); draw(); },
    }, kind === 'imagelabel' ? (c.labels.find((l) => l.id === t.label)?.text || '') : '')));
    if (kind === 'imagelabel') {
      labelBar.replaceChildren(...c.labels.map((l) => h('button', {
        type: 'button', class: 'chip' + (activeLabel === l.id ? ' active' : '') + (c.targets.some((t) => t.label === l.id) ? ' placed' : ''),
        onclick: () => { activeLabel = l.id; draw(); },
      }, l.text || '(leer)')));
    }
  };
  const setAspect = () => { if (img.naturalWidth) c.aspect = Math.round((img.naturalHeight / img.naturalWidth) * 1000) / 1000; };
  img.addEventListener('load', setAspect); setAspect();
  wrap.addEventListener('click', (e) => {
    const r = img.getBoundingClientRect();
    const x = Math.round(((e.clientX - r.left) / r.width) * 1000) / 10, y = Math.round(((e.clientY - r.top) / r.height) * 1000) / 10;
    if (kind === 'imagelabel') {
      if (!activeLabel) return toast('Erst eine Bezeichnung oben wählen');
      c.targets = c.targets.filter((t) => t.label !== activeLabel);
      c.targets.push({ id: uid(), label: activeLabel, x, y });
    } else c.areas.push({ x, y, r: c.radius || 5 });
    draw();
  });
  draw();
  return h('div', {}, kind === 'imagelabel' ? h('p', { class: 'hint' }, 'Bezeichnung wählen, dann im Bild die richtige Stelle anklicken.') : h('p', { class: 'hint' }, 'Alle zu markierenden Stellen im Bild anklicken. Klick auf einen Kreis entfernt ihn.'), labelBar, wrap);
}

const keepOrderBox = (c) => h('label', { class: 'symopt', title: 'z. B. bei „Alle genannten“ oder „a), b), c)“-Bezügen' }, h('input', { type: 'checkbox', checked: !!c.keepOrder, onchange: (e) => { c.keepOrder = e.target.checked; } }), ' Antwortreihenfolge fest (nicht mischen)');

const configEditors = {
  single(state) {
    const c = state.config;
    const { node } = listEditor(c.options, { min: 2, addLabel: 'Antwort', onChange: (re) => { if (re && !c.options.some((o) => o.id === c.correct)) c.correct = c.options[0].id; },
      extra: (o) => h('input', { type: 'radio', name: 'correct', checked: c.correct === o.id, title: 'richtige Antwort', onchange: () => { c.correct = o.id; } }) });
    return h('div', {}, h('p', { class: 'hint' }, 'Richtige Antwort per Auswahlpunkt markieren.'), node, keepOrderBox(c));
  },
  multi(state) {
    const c = state.config;
    const { node } = listEditor(c.options, { min: 2, addLabel: 'Antwort', onChange: () => { c.correct = c.correct.filter((id) => c.options.some((o) => o.id === id)); },
      extra: (o) => h('input', { type: 'checkbox', checked: c.correct.includes(o.id), title: 'richtig', onchange: (e) => { c.correct = e.target.checked ? [...c.correct, o.id] : c.correct.filter((x) => x !== o.id); } }) });
    return h('div', {}, h('p', { class: 'hint' }, 'Alle richtigen Antworten anhaken.'), node, keepOrderBox(c));
  },
  strike(state) {
    const c = state.config;
    const { node } = listEditor(c.options, { min: 2, addLabel: 'Aussage', onChange: () => { c.wrong = c.wrong.filter((id) => c.options.some((o) => o.id === id)); },
      extra: (o) => h('input', { type: 'checkbox', checked: c.wrong.includes(o.id), title: 'FALSCH (muss durchgestrichen werden)', onchange: (e) => { c.wrong = e.target.checked ? [...c.wrong, o.id] : c.wrong.filter((x) => x !== o.id); } }) });
    return h('div', {}, h('p', { class: 'hint' }, 'Falsche Aussagen anhaken – diese müssen vom Teilnehmer durchgestrichen werden.'), node);
  },
  order(state) {
    const { node } = listEditor(state.config.items, { min: 2, addLabel: 'Schritt', idPrefix: 's', onChange() {} });
    return h('div', {}, h('p', { class: 'hint' }, 'Schritte in der RICHTIGEN Reihenfolge eintragen. Teilnehmer sehen sie gemischt.'), node);
  },
  match(state) {
    const c = state.config;
    const wrap = h('div', {});
    const draw = () => {
      const left = h('div', { class: 'listed' }, c.left.map((l, i) => h('div', { class: 'lrow' },
        h('input', { type: 'text', value: l.text, placeholder: 'Aussage / Begriff', oninput: (e) => { l.text = e.target.value; } }),
        h('select', { onchange: (e) => { if (e.target.value) c.pairs[l.id] = e.target.value; else delete c.pairs[l.id]; } },
          h('option', { value: '' }, '→ richtige Zuordnung'), c.right.map((r) => h('option', { value: r.id, selected: c.pairs[l.id] === r.id }, r.text || '(leer)'))),
        h('button', { type: 'button', class: 'btn icon danger', disabled: c.left.length <= 1, onclick: () => { c.left.splice(i, 1); delete c.pairs[l.id]; draw(); } }, '✕'))),
        h('button', { type: 'button', class: 'btn small', onclick: () => { c.left.push({ id: 'l' + uid(), text: '' }); draw(); } }, '+ Aussage'));
      const right = h('div', { class: 'listed' }, c.right.map((r, i) => h('div', { class: 'lrow' },
        h('input', { type: 'text', value: r.text, placeholder: 'Zuordnungsziel', oninput: (e) => { r.text = e.target.value; }, onchange: draw }),
        h('button', { type: 'button', class: 'btn icon danger', disabled: c.right.length <= 2, onclick: () => { c.right.splice(i, 1); for (const k of Object.keys(c.pairs)) if (c.pairs[k] === r.id) delete c.pairs[k]; draw(); } }, '✕'))),
        h('button', { type: 'button', class: 'btn small', onclick: () => { c.right.push({ id: 'r' + uid(), text: '' }); draw(); } }, '+ Ziel'));
      wrap.replaceChildren(h('div', { class: 'two' }, h('div', {}, h('h4', {}, 'Aussagen (links)'), left), h('div', {}, h('h4', {}, 'Zuordnungsziele (rechts, mehrfach nutzbar)'), right)));
    };
    draw();
    return wrap;
  },
  number(state) {
    const c = state.config;
    return h('div', { class: 'three' }, field('Richtiger Wert', inp(c.answer, (v) => { c.answer = v; }, 'z. B. 5,45')), field('Toleranz (±)', inp(c.tolerance, (v) => { c.tolerance = v; }, '0')), field('Einheit', inp(c.unit, (v) => { c.unit = v; }, 'A, V, %')));
  },
  text(state) {
    const c = state.config;
    return h('div', {}, field('Akzeptierte Antworten (eine pro Zeile, Groß-/Kleinschreibung egal)', ta((c.accepted || []).join('\n'), (v) => { c.accepted = v.split('\n').map((s) => s.trim()).filter(Boolean); }, 3)), h('p', { class: 'hint' }, 'Leer lassen = Ausbilder bewertet manuell.'));
  },
  imagelabel(state, redraw) {
    const c = state.config;
    const { node } = listEditor(c.labels, { min: 0, addLabel: 'Bezeichnung', idPrefix: 'l', onChange: (re) => { c.targets = c.targets.filter((t) => c.labels.some((l) => l.id === t.label)); if (re) redraw(); } });
    return h('div', {}, h('h4', {}, 'Bezeichnungen'), node, field('Toleranz-Radius (% der Bildbreite)', inp(c.radius, (v) => { c.radius = Number(v) || 6; }, '6', 'number')), imagePicker(state, 'imagelabel'));
  },
  hotspot(state) {
    const c = state.config;
    return h('div', {}, h('div', { class: 'two' }, field('Toleranz-Radius (% der Bildbreite)', inp(c.radius, (v) => { c.radius = Number(v) || 5; c.areas.forEach((a) => { a.r = c.radius; }); }, '5', 'number')), field('Max. Markierungen des Teilnehmers', inp(c.maxClicks, (v) => { c.maxClicks = Number(v) || 12; }, '12', 'number'))), imagePicker(state, 'hotspot'));
  },
  drawing(state) {
    const c = state.config;
    return h('div', {}, field('Hinweis für Teilnehmer', inp(c.note, (v) => { c.note = v; })),
      h('p', { class: 'hint' }, 'Verfügbare Symbole (keine Auswahl = nur Linien, Freihand und Formen). Das optionale Bild oben dient als Vorlage/Anschauung.'),
      h('div', { class: 'symgrid' }, Object.entries(SYMBOLS).map(([k, s]) => h('label', { class: 'symopt' }, h('input', { type: 'checkbox', checked: c.symbols.includes(k), onchange: (e) => { c.symbols = e.target.checked ? [...c.symbols, k] : c.symbols.filter((x) => x !== k); } }), s.label))));
  },
  practical(state) {
    const c = state.config;
    return h('div', {}, field('Hinweis für Teilnehmer', inp(c.note, (v) => { c.note = v; })), field('Bewertungskriterien (eine pro Zeile)', ta((c.criteria || []).join('\n'), (v) => { c.criteria = v.split('\n').map((s) => s.trim()).filter(Boolean); }, 4)));
  },
};

export async function questionEditor({ question, meta, onSaved, onCancel }) {
  const state = question ? clone({ topic_id: question.topic_id, type: question.type, prompt: question.prompt, objective: question.objective, points: question.points, image: question.image, config: question.config })
    : { topic_id: meta.topics[0]?.id || null, type: 'single', prompt: '', objective: '', points: 1, image: null, config: DEFAULTS.single() };
  const media = await api('/media').catch(() => []);
  const cfgBox = h('div', { class: 'cfgbox' });
  const imgBox = h('div', {});
  const redrawCfg = () => cfgBox.replaceChildren(configEditors[state.type](state, redrawCfg));
  const redrawImg = () => {
    const file = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif', onchange: async () => {
      const f = file.files[0]; if (!f) return;
      const res = await fetch('/api/media', { method: 'POST', headers: { 'content-type': f.type }, body: f, credentials: 'same-origin' });
      const j = await res.json(); if (!res.ok) return toast(j.error, 'err');
      if (!media.includes(j.url)) media.push(j.url);
      state.image = j.url; redrawImg(); redrawCfg();
    } });
    imgBox.replaceChildren(
      h('div', { class: 'two' },
        field('Bild (optional)', h('select', { onchange: (e) => { state.image = e.target.value || null; redrawImg(); redrawCfg(); } }, h('option', { value: '' }, '– kein Bild –'), media.map((m) => h('option', { value: m, selected: state.image === m }, m.split('/').pop())))),
        field('Neues Bild hochladen', file)),
      state.image ? h('img', { class: 'thumb', src: state.image, alt: '' }) : null);
  };
  const typeSel = h('select', { onchange: (e) => { state.type = e.target.value; state.config = DEFAULTS[state.type](); redrawCfg(); } },
    Object.entries(meta.types).map(([k, t]) => h('option', { value: k, selected: state.type === k }, t.label)));
  if (question) typeSel.disabled = true;

  const topicSel = h('select', { onchange: async (e) => {
    if (e.target.value === '__new') {
      const name = prompt('Name des neuen Themenbereichs:');
      if (name?.trim()) { const t = await api('/topics', { method: 'POST', body: { name } }); if (!meta.topics.some((x) => x.id === t.id)) meta.topics.push(t); state.topic_id = t.id; }
      topicSel.replaceChildren(...topicOpts());
    } else state.topic_id = Number(e.target.value) || null;
  } }, ...[]);
  const topicOpts = () => [...meta.topics.map((t) => h('option', { value: t.id, selected: state.topic_id === t.id }, t.name)), h('option', { value: '__new' }, '+ Neuer Themenbereich …')];
  topicSel.replaceChildren(...topicOpts());

  redrawImg(); redrawCfg();
  return h('form', { class: 'card qeditor', onsubmit: async (e) => {
    e.preventDefault();
    try {
      const body = { ...state, points: Number(state.points) || 1 };
      const saved = question ? await api(`/questions/${question.id}`, { method: 'PUT', body }) : await api('/questions', { method: 'POST', body });
      toast('Frage gespeichert', 'ok'); onSaved(saved);
    } catch (err) { toast(err.message, 'err'); }
  } },
  h('h2', {}, question ? 'Frage bearbeiten' : 'Neue Frage'),
  h('div', { class: 'two' }, field('Themenbereich', topicSel), field('Aufgabentyp', typeSel)),
  field('Fragetext / Aufgabe', ta(state.prompt, (v) => { state.prompt = v; }, 3)),
  h('div', { class: 'two' }, field('Lernziel (für den Weiterbildungsplan)', inp(state.objective, (v) => { state.objective = v; }, 'z. B. Spannung korrekt messen')), field('Punkte (Gewichtung)', inp(state.points, (v) => { state.points = v; }, '1', 'number'))),
  imgBox, h('hr'), cfgBox,
  h('div', { class: 'row end' }, h('button', { type: 'button', class: 'btn', onclick: onCancel }, 'Abbrechen'), h('button', { type: 'submit', class: 'btn primary' }, 'Speichern')));
}
