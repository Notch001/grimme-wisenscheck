// Admin-Ansicht: Antwort des Teilnehmers im Vergleich zur Musterlösung + manuelle Bewertung.
import { h, api, toast } from './dom.js';
import { drawingView } from './draw.js';

const ok = (b) => h('span', { class: b ? 'v-ok' : 'v-bad' }, b ? '✓' : '✗');

function optionsReview(q, picked, correctSet, label) {
  return h('ul', { class: 'rv-list' }, q.config.options.map((o) => {
    const p = picked.includes(o.id), c = correctSet.includes(o.id);
    return h('li', { class: `rv ${c ? 'is-correct' : ''} ${p ? 'is-picked' : ''}` },
      h('span', { class: 'rv-mark' }, p ? ok(c) : (c ? h('span', { class: 'v-miss', title: 'richtig, aber nicht gewählt' }, '○') : '')),
      h('span', {}, o.text), c ? h('small', { class: 'muted' }, label) : null);
  }));
}

function imageOverlay(q, markers) {
  const layer = h('div', { class: 'layer' }, markers);
  return h('div', { class: 'imgwrap' }, h('img', { src: q.image, alt: '' }), layer);
}

export function reviewView(item) {
  const q = item.question, c = q.config, r = item.response;
  const none = h('p', { class: 'muted' }, 'Keine Antwort abgegeben.');
  switch (q.type) {
    case 'single': return optionsReview(q, r?.value ? [r.value] : [], [c.correct], 'richtige Antwort');
    case 'multi': return optionsReview(q, r?.values || [], c.correct, 'richtig');
    case 'strike': {
      const struck = r?.struck || [];
      return h('ul', { class: 'rv-list' }, c.options.map((o) => {
        const isWrong = c.wrong.includes(o.id), s = struck.includes(o.id);
        return h('li', { class: 'rv' }, h('span', { class: 'rv-mark' }, ok(isWrong === s)),
          h('span', { class: s ? 'struck-txt' : '' }, o.text), h('small', { class: 'muted' }, isWrong ? 'sollte durchgestrichen sein' : 'richtig (stehen lassen)'));
      }));
    }
    case 'order': {
      const given = r?.order || [];
      return h('table', { class: 'tbl' }, h('thead', {}, h('tr', {}, h('th', {}, '#'), h('th', {}, 'Antwort des Teilnehmers'), h('th', {}, 'Richtig'), h('th', {}))),
        h('tbody', {}, c.items.map((it, i) => h('tr', {}, h('td', {}, i + 1), h('td', {}, c.items.find((x) => x.id === given[i])?.text || '–'), h('td', {}, it.text), h('td', {}, ok(given[i] === it.id))))));
    }
    case 'match': {
      const given = r?.pairs || {};
      const name = (id) => c.right.find((x) => x.id === id)?.text;
      return h('table', { class: 'tbl' }, h('thead', {}, h('tr', {}, h('th', {}, 'Aussage'), h('th', {}, 'Antwort'), h('th', {}, 'Richtig'), h('th', {}))),
        h('tbody', {}, c.left.map((l) => h('tr', {}, h('td', {}, l.text), h('td', {}, name(given[l.id]) || '–'), h('td', {}, name(c.pairs[l.id])), h('td', {}, ok(given[l.id] === c.pairs[l.id]))))));
    }
    case 'number':
    case 'text':
      return h('p', {}, 'Antwort: ', h('b', {}, r?.value ?? '–'), ' ', c.unit || '', h('span', { class: 'muted' }, c.answer !== undefined ? `   (richtig: ${c.answer}${c.tolerance ? ` ±${c.tolerance}` : ''} ${c.unit || ''})` : c.accepted?.length ? `   (akzeptiert: ${c.accepted.join(', ')})` : ''));
    case 'imagelabel': {
      const placed = r?.placements || {};
      const markers = [
        ...c.targets.map((t) => h('div', { class: 'ring', style: { left: t.x + '%', top: t.y + '%', width: c.radius * 2 + '%' }, title: c.labels.find((l) => l.id === t.label)?.text })),
        ...Object.entries(placed).map(([lid, p]) => h('div', { class: 'pin static', style: { left: p.x + '%', top: p.y + '%' } }, c.labels.find((l) => l.id === lid)?.text)),
      ];
      return h('div', {}, h('p', { class: 'muted small' }, 'Grüne Kreise = richtige Bereiche, Beschriftungen = Platzierung des Teilnehmers.'), imageOverlay(q, markers));
    }
    case 'hotspot': {
      const markers = [
        ...c.areas.map((a) => h('div', { class: 'ring', style: { left: a.x + '%', top: a.y + '%', width: a.r * 2 + '%' } })),
        ...(r?.points || []).map((p) => h('div', { class: 'dot static', style: { left: p.x + '%', top: p.y + '%' } })),
      ];
      return h('div', {}, h('p', { class: 'muted small' }, 'Grüne Kreise = gesuchte Bereiche, rote Punkte = Markierungen des Teilnehmers.'), imageOverlay(q, markers));
    }
    case 'drawing':
      return r?.elements?.length ? h('div', {}, q.image ? h('img', { class: 'refimg', src: q.image, alt: '' }) : null, drawingView(r.elements)) : none;
    case 'practical':
      return h('div', {}, c.criteria?.length ? h('ul', { class: 'plain' }, c.criteria.map((x) => h('li', {}, '▫ ', x))) : null, r?.note ? h('p', {}, h('b', {}, 'Notiz des Teilnehmers: '), r.note) : null);
    default: return none;
  }
}

// Manuelle Bewertung (Zeichnen, praktische Aufgaben, Kurztext ohne Musterantwort)
export function gradePanel(item, participantId, onSaved) {
  const q = item.question;
  const steps = [0, 25, 50, 75, 100];
  let score = item.manual;
  const comment = h('input', { type: 'text', placeholder: 'Kommentar (optional)', value: item.comment || '' });
  const btns = h('div', { class: 'seg' });
  const draw = () => btns.replaceChildren(...steps.map((s) => h('button', { type: 'button', class: 'btn small' + (score !== null && Math.round(score * 100) === s ? ' primary' : ''), onclick: () => { score = s / 100; draw(); } }, s + ' %')));
  draw();
  const criteria = q.type === 'practical' && q.config.criteria?.length ? q.config.criteria : null;
  let boxes = [];
  const crit = criteria ? h('div', { class: 'crit' }, criteria.map((t, i) => {
    const cb = h('input', { type: 'checkbox', onchange: () => { const n = boxes.filter((b) => b.checked).length; score = n / boxes.length; draw(); } });
    boxes.push(cb);
    return h('label', {}, cb, ' ', t);
  })) : null;
  if (crit && score !== null) boxes.forEach((b, i) => { b.checked = i < Math.round(score * boxes.length); });
  return h('div', { class: 'gradepanel' },
    h('b', {}, 'Bewertung durch Ausbilder'),
    crit ? h('p', { class: 'muted small' }, 'Erfüllte Kriterien anhaken – die Punktzahl wird daraus berechnet (oder unten direkt wählen).') : null, crit,
    btns, comment,
    h('div', { class: 'row' },
      h('button', { type: 'button', class: 'btn primary small', onclick: async () => {
        try { await api(`/participants/${participantId}/answers/${q.id}/grade`, { method: 'PUT', body: { score, comment: comment.value } }); toast('Bewertung gespeichert', 'ok'); onSaved?.(); } catch (e) { toast(e.message, 'err'); }
      } }, 'Speichern'),
      item.pending ? h('span', { class: 'badge lv-pending' }, 'Bewertung offen') : null));
}
