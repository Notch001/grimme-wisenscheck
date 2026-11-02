// Admin-Oberfläche: Abfragen, Fragenkatalog, Auswertung.
import { h, api, clear, toast, LEVEL, fmtDate } from './dom.js';
import { questionEditor } from './qeditor.js';
import { reviewView, gradePanel } from './review.js';

let root, meta;
const link = (token) => `${location.origin}/t/${token}`;
const pctText = (p) => (p === null || p === undefined ? '–' : p + ' %');
const STATUS = { draft: ['Entwurf', 'lv-pending'], open: ['Geöffnet', 'lv-ok'], closed: ['Geschlossen', 'lv-mid'] };
const PSTATUS = { invited: ['Eingeladen', 'lv-pending'], started: ['In Bearbeitung', 'lv-mid'], submitted: ['Abgegeben', 'lv-ok'] };

export async function adminApp(el) {
  root = el;
  const me = await api('/me');
  if (!me.admin) return loginPage();
  meta = await api('/meta');
  window.addEventListener('hashchange', route);
  route();
}

function loginPage() {
  const pw = h('input', { type: 'password', placeholder: 'Admin-Passwort', autofocus: true, autocomplete: 'current-password' });
  clear(root).append(h('div', { class: 'login' }, h('form', { class: 'card center', onsubmit: async (e) => {
    e.preventDefault();
    try { await api('/login', { method: 'POST', body: { password: pw.value } }); location.hash = '#/surveys'; adminApp(root); } catch (err) { toast(err.message, 'err'); pw.select(); }
  } }, h('div', { class: 'brand big' }, h('span', { class: 'logo' }, '✓'), 'Wissenscheck'), h('p', { class: 'muted' }, 'Admin-Bereich'), pw, h('button', { class: 'btn primary', type: 'submit' }, 'Anmelden'))));
}

function layout(active, ...content) {
  clear(root).append(
    h('header', { class: 'a-head noprint' }, h('div', { class: 'brand' }, h('span', { class: 'logo' }, '✓'), 'Wissenscheck'),
      h('nav', {}, h('a', { href: '#/surveys', class: active === 'surveys' ? 'on' : '' }, 'Abfragen'), h('a', { href: '#/questions', class: active === 'questions' ? 'on' : '' }, 'Fragenkatalog')),
      h('button', { class: 'btn small', onclick: async () => { await api('/logout', { method: 'POST', body: {} }); adminApp(root); } }, 'Abmelden')),
    h('main', { class: 'a-main' }, ...content));
}

async function route() {
  const [, page, id] = location.hash.split('/');
  try {
    if (page === 'survey') return await surveyPage(id);
    if (page === 'results') return await resultsPage(id);
    if (page === 'participant') return await participantPage(id);
    if (page === 'questions') return await questionsPage();
    return await surveysPage();
  } catch (e) {
    if (e.status === 401) return adminApp(root);
    layout('', h('div', { class: 'card' }, h('h1', {}, 'Fehler'), h('p', {}, e.message)));
  }
}

// ------------------------------------------------------------------ Abfragen
async function surveysPage() {
  const list = await api('/surveys');
  const title = h('input', { type: 'text', placeholder: 'Titel der neuen Abfrage, z. B. „Wissenscheck Neueinsteiger Januar“' });
  layout('surveys',
    h('div', { class: 'pagehead' }, h('h1', {}, 'Abfragen')),
    h('form', { class: 'card row', onsubmit: async (e) => { e.preventDefault(); if (!title.value.trim()) return; const s = await api('/surveys', { method: 'POST', body: { title: title.value } }); location.hash = `#/survey/${s.id}`; } }, title, h('button', { class: 'btn primary', type: 'submit' }, '+ Neue Abfrage')),
    list.length ? h('div', { class: 'cards' }, list.map((s) => h('a', { class: 'card tile', href: `#/survey/${s.id}` },
      h('div', { class: 'row between' }, h('h3', {}, s.title), h('span', { class: 'badge ' + STATUS[s.status][1] }, STATUS[s.status][0])),
      h('p', { class: 'muted' }, `${s.question_count} Aufgaben · ${s.participant_count} Teilnehmer`),
      h('div', { class: 'progress' }, h('div', { style: { width: (s.participant_count ? (s.submitted_count / s.participant_count) * 100 : 0) + '%' } })),
      h('p', { class: 'small muted' }, `${s.submitted_count} von ${s.participant_count} abgegeben`)))) : h('p', { class: 'muted' }, 'Noch keine Abfrage angelegt.'));
}

async function surveyPage(id) {
  const [s, qs] = await Promise.all([api(`/surveys/${id}`), api('/questions')]);
  const draft = s.status === 'draft';
  let selected = s.questions.map((q) => q.id);
  const title = h('input', { type: 'text', value: s.title });
  const desc = h('textarea', { rows: 2 }, s.description);
  const patch = async (body, msg) => { await api(`/surveys/${id}`, { method: 'PUT', body }); if (msg) toast(msg, 'ok'); return surveyPage(id); };

  // Fragenauswahl nach Themenbereich
  const byTopic = new Map();
  for (const q of qs) { const k = q.topic_name || 'Ohne Themenbereich'; if (!byTopic.has(k)) byTopic.set(k, []); byTopic.get(k).push(q); }
  const counter = h('b', {}, selected.length);
  const picker = h('div', { class: 'picker' }, [...byTopic.entries()].map(([topic, list]) => {
    const boxes = list.map((q) => h('label', { class: 'pick' }, h('input', { type: 'checkbox', checked: selected.includes(q.id), disabled: !draft, onchange: (e) => { selected = e.target.checked ? [...selected, q.id] : selected.filter((x) => x !== q.id); counter.textContent = selected.length; } }),
      h('span', { class: 'tag t-' + q.type }, meta.types[q.type].label), ' ', q.prompt));
    const all = h('input', { type: 'checkbox', disabled: !draft, checked: list.every((q) => selected.includes(q.id)), onchange: (e) => { const ids = list.map((q) => q.id); selected = e.target.checked ? [...new Set([...selected, ...ids])] : selected.filter((x) => !ids.includes(x)); counter.textContent = selected.length; boxes.forEach((b) => { b.querySelector('input').checked = e.target.checked; }); } });
    return h('details', { class: 'topicgroup' }, h('summary', {}, all, ' ', h('b', {}, topic), h('span', { class: 'muted' }, ` (${list.length})`)), boxes);
  }));

  const names = h('textarea', { rows: 4, placeholder: 'Ein Teilnehmer pro Zeile:\nMax Mustermann, max@firma.de\nErika Beispiel' });
  const copy = async (t) => { try { await navigator.clipboard.writeText(t); toast('Link kopiert', 'ok'); } catch { prompt('Link kopieren:', t); } };

  layout('surveys',
    h('div', { class: 'pagehead' }, h('a', { href: '#/surveys', class: 'back' }, '← Abfragen'), h('h1', {}, s.title), h('span', { class: 'badge ' + STATUS[s.status][1] }, STATUS[s.status][0])),
    h('div', { class: 'card' },
      h('h2', {}, 'Grunddaten & Status'),
      h('div', { class: 'two' }, h('label', { class: 'field' }, h('span', {}, 'Titel'), title), h('label', { class: 'field' }, h('span', {}, 'Beschreibung für Teilnehmer'), desc)),
      h('div', { class: 'row' },
        h('button', { class: 'btn', onclick: () => patch({ title: title.value, description: desc.value }, 'Gespeichert') }, 'Speichern'),
        s.status !== 'open' ? h('button', { class: 'btn primary', onclick: () => { if (!s.questions.length) return toast('Bitte zuerst Aufgaben auswählen und speichern', 'err'); patch({ status: 'open' }, 'Abfrage geöffnet – Links sind aktiv'); } }, 'Abfrage öffnen') : h('button', { class: 'btn', onclick: () => patch({ status: 'closed' }, 'Abfrage geschlossen') }, 'Abfrage schließen'),
        h('a', { class: 'btn', href: `#/results/${id}` }, 'Zur Auswertung →'),
        h('button', { class: 'btn danger', onclick: async () => { if (confirm('Abfrage inkl. aller Antworten endgültig löschen?')) { await api(`/surveys/${id}`, { method: 'DELETE' }); location.hash = '#/surveys'; } } }, 'Löschen'))),

    h('div', { class: 'card' },
      h('div', { class: 'row between' }, h('h2', {}, 'Aufgaben (', counter, ' ausgewählt)'), draft ? h('button', { class: 'btn primary', onclick: () => patch({ question_ids: orderBy(selected, qs) }, 'Aufgaben gespeichert') }, 'Auswahl speichern') : h('span', { class: 'muted small' }, 'Aufgaben sind nach dem Öffnen gesperrt')),
      picker),

    h('div', { class: 'card' },
      h('h2', {}, `Teilnehmer (${s.participants.length})`),
      s.participants.length ? h('table', { class: 'tbl' },
        h('thead', {}, h('tr', {}, ['Name', 'Status', 'Fortschritt', 'Zugangslink', ''].map((t) => h('th', {}, t)))),
        h('tbody', {}, s.participants.map((p) => h('tr', {},
          h('td', {}, h('b', {}, p.name), p.email ? h('div', { class: 'muted small' }, p.email) : null),
          h('td', {}, h('span', { class: 'badge ' + PSTATUS[p.status][1] }, PSTATUS[p.status][0]), p.submitted_at ? h('div', { class: 'muted small' }, fmtDate(p.submitted_at)) : null),
          h('td', {}, `${p.answered} / ${s.questions.length}`),
          h('td', {}, h('code', { class: 'link' }, `/t/${p.token}`), ' ', h('button', { class: 'btn small', onclick: () => copy(link(p.token)) }, 'Kopieren'), ' ', h('a', { class: 'btn small', href: `/t/${p.token}`, target: '_blank', rel: 'noopener' }, 'Öffnen')),
          h('td', { class: 'right' },
            p.status === 'submitted' ? h('a', { class: 'btn small', href: `#/participant/${p.id}` }, 'Ergebnis') : null, ' ',
            p.status === 'submitted' ? h('button', { class: 'btn small', onclick: async () => { if (confirm('Abgabe zurücknehmen, damit der Teilnehmer weiterarbeiten kann?')) { await api(`/participants/${p.id}/reopen`, { method: 'POST', body: {} }); surveyPage(id); } } }, 'Wieder öffnen') : null, ' ',
            h('button', { class: 'btn small danger', onclick: async () => { if (confirm(`${p.name} samt Antworten entfernen?`)) { await api(`/participants/${p.id}`, { method: 'DELETE' }); surveyPage(id); } } }, '✕'))))) ) : h('p', { class: 'muted' }, 'Noch keine Teilnehmer.'),
      h('h3', {}, 'Teilnehmer hinzufügen'), names,
      h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: async () => {
        const list = names.value.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => { const [name, email] = l.split(/[,;\t]/).map((x) => x.trim()); return { name, email }; });
        if (!list.length) return;
        await api(`/surveys/${id}/participants`, { method: 'POST', body: { list } }); toast(`${list.length} Teilnehmer angelegt`, 'ok'); surveyPage(id);
      } }, 'Hinzufügen & Links erzeugen'))));
}
const orderBy = (ids, qs) => qs.filter((q) => ids.includes(q.id)).map((q) => q.id);

// ------------------------------------------------------------------ Fragenkatalog
async function questionsPage() {
  const qs = await api('/questions');
  let topic = '', type = '', text = '';
  const body = h('div', {});
  const draw = () => {
    const f = qs.filter((q) => (!topic || String(q.topic_id) === topic) && (!type || q.type === type) && (!text || q.prompt.toLowerCase().includes(text.toLowerCase())));
    body.replaceChildren(h('table', { class: 'tbl' }, h('thead', {}, h('tr', {}, ['Themenbereich', 'Typ', 'Aufgabe', 'In Abfragen', ''].map((t) => h('th', {}, t)))),
      h('tbody', {}, f.map((q) => h('tr', {}, h('td', {}, q.topic_name || '–'), h('td', {}, h('span', { class: 'tag t-' + q.type }, meta.types[q.type].label)), h('td', {}, q.prompt, q.image ? ' 🖼' : ''), h('td', {}, q.used_in),
        h('td', { class: 'right' }, h('button', { class: 'btn small', onclick: () => edit(q) }, 'Bearbeiten'), ' ', h('button', { class: 'btn small danger', onclick: async () => { if (!confirm('Frage löschen?')) return; try { await api(`/questions/${q.id}`, { method: 'DELETE' }); questionsPage(); } catch (e) { toast(e.message, 'err'); } } }, '✕')))))));
  };
  async function edit(q) {
    meta = await api('/meta');
    layout('questions', await questionEditor({ question: q, meta, onSaved: () => questionsPage(), onCancel: () => questionsPage() }));
  }
  layout('questions',
    h('div', { class: 'pagehead' }, h('h1', {}, 'Fragenkatalog'), h('button', { class: 'btn primary', onclick: () => edit(null) }, '+ Neue Frage')),
    h('div', { class: 'card row' },
      h('select', { onchange: (e) => { topic = e.target.value; draw(); } }, h('option', { value: '' }, 'Alle Themenbereiche'), meta.topics.map((t) => h('option', { value: t.id }, t.name))),
      h('select', { onchange: (e) => { type = e.target.value; draw(); } }, h('option', { value: '' }, 'Alle Typen'), Object.entries(meta.types).map(([k, t]) => h('option', { value: k }, t.label))),
      h('input', { type: 'search', placeholder: 'Suchen …', oninput: (e) => { text = e.target.value; draw(); } }), h('span', { class: 'muted' }, `${qs.length} Fragen`)),
    h('div', { class: 'card flush' }, body));
  draw();
}

// ------------------------------------------------------------------ Auswertung (Gruppe)
async function resultsPage(id) {
  const r = await api(`/surveys/${id}/results`);
  const cell = (pct, level, extra) => h('td', { class: 'hm ' + LEVEL[level || 'pending'].cls, title: LEVEL[level || 'pending'].label }, pctText(pct), extra);
  layout('surveys',
    h('div', { class: 'pagehead' }, h('a', { href: `#/survey/${id}`, class: 'back' }, '← Abfrage'), h('h1', {}, 'Auswertung: ', r.survey.title)),
    h('div', { class: 'card banner ' + (r.complete ? 'done' : '') },
      r.complete ? h('b', {}, '✓ Alle Teilnehmer haben die Abfrage abgegeben.') : h('b', {}, `${r.submitted} von ${r.participants.length} Teilnehmern haben abgegeben.`),
      h('span', { class: 'muted' }, ' Ergebnisse sind nur für Admins sichtbar. '),
      h('a', { class: 'btn small', href: `/api/surveys/${id}/export.csv` }, 'CSV-Export')),
    h('div', { class: 'legend' }, ['low', 'mid', 'ok', 'pending'].map((k) => h('span', { class: 'badge ' + LEVEL[k].cls }, LEVEL[k].label + (k === 'low' ? ` (< ${r.survey.threshold_low} %)` : k === 'mid' ? ` (< ${r.survey.threshold_high} %)` : k === 'ok' ? ` (≥ ${r.survey.threshold_high} %)` : '')))),
    h('div', { class: 'card flush scroll' }, h('table', { class: 'tbl heat' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Teilnehmer'), h('th', {}, 'Gesamt'), r.topics.map((t) => h('th', { class: 'rot' }, h('span', {}, t.name))))),
      h('tbody', {}, r.participants.map((p) => h('tr', { class: 'clickrow', onclick: () => { if (p.status === 'submitted') location.hash = `#/participant/${p.id}`; else toast('Dieser Teilnehmer hat noch nicht abgegeben'); } },
        h('td', {}, h('b', {}, p.name), p.status !== 'submitted' ? h('div', { class: 'small muted' }, PSTATUS[p.status][0]) : null, p.pendingCount ? h('div', { class: 'small warn' }, `${p.pendingCount} Bewertung(en) offen`) : null),
        cell(p.pct, p.level), p.topics.map((t) => cell(t.pct, t.level)))),
      h('tr', { class: 'avg' }, h('td', {}, h('b', {}, 'Gruppen-Ø')), h('td', {}), r.average.map((a) => h('td', { class: 'hm' }, h('b', {}, pctText(a.pct)))))))),
    h('p', { class: 'muted small' }, 'Zeile anklicken für die individuelle Auswertung mit Schwächen und Weiterbildungsvorschlag.'));
}

// ------------------------------------------------------------------ Auswertung (Teilnehmer)
function radar(topics) {
  const n = topics.length; if (n < 3) return null;
  const S = 360, C = S / 2, R = 120;
  const ang = (i) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
  const pt = (i, v) => [C + Math.cos(ang(i)) * R * v, C + Math.sin(ang(i)) * R * v];
  const poly = (vals) => vals.map((v, i) => pt(i, v).join(',')).join(' ');
  const rings = [0.25, 0.5, 0.75, 1].map((v) => `<polygon points="${poly(topics.map(() => v))}" fill="none" stroke="currentColor" opacity=".18"/>`).join('');
  const axes = topics.map((_, i) => `<line x1="${C}" y1="${C}" x2="${pt(i, 1)[0]}" y2="${pt(i, 1)[1]}" stroke="currentColor" opacity=".18"/>`).join('');
  const labels = topics.map((t, i) => { const [x, y] = pt(i, 1.2); const a = Math.cos(ang(i)); const short = t.name.replace(/^Grundlagen /, '').replace(' von Maschinen', '').replace('Funktionsweise der Maschinen', 'Funktion').replace('Wartung und Einstellung', 'Wartung').replace('Diagnose / Fehlersuche', 'Diagnose'); return `<text x="${x}" y="${y}" font-size="12" fill="currentColor" text-anchor="${a > 0.3 ? 'start' : a < -0.3 ? 'end' : 'middle'}" dominant-baseline="middle">${short}</text>`; }).join('');
  const vals = topics.map((t) => (t.pct ?? 0) / 100);
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  el.setAttribute('viewBox', `-40 0 ${S + 80} ${S}`); el.setAttribute('class', 'radar');
  el.innerHTML = rings + axes + `<polygon points="${poly(vals)}" class="radar-fill"/>` + vals.map((v, i) => `<circle cx="${pt(i, v)[0]}" cy="${pt(i, v)[1]}" r="3.5" class="radar-dot"/>`).join('') + labels;
  return el;
}

async function participantPage(id) {
  const r = await api(`/participants/${id}/result`);
  const lvl = LEVEL[r.level];
  const bar = (t) => h('div', { class: 'tbar' },
    h('div', { class: 'tlabel' }, h('b', {}, t.name), h('span', { class: 'muted small' }, ` ${t.total} Aufgaben` + (t.pendingCount ? ` · ${t.pendingCount} offen` : ''))),
    h('div', { class: 'track' }, h('div', { class: 'fill ' + LEVEL[t.level].cls, style: { width: (t.pct ?? 0) + '%' } }), h('i', { class: 'mark', style: { left: r.survey.threshold_low + '%' } }), h('i', { class: 'mark', style: { left: r.survey.threshold_high + '%' } })),
    h('div', { class: 'tpct' }, pctText(t.pct)), h('span', { class: 'badge ' + LEVEL[t.level].cls }, LEVEL[t.level].label));

  const byTopic = new Map();
  for (const it of r.items) { if (!byTopic.has(it.topic)) byTopic.set(it.topic, []); byTopic.get(it.topic).push(it); }
  const rv = radar(r.topics);

  const taskCards = [...byTopic.entries()].map(([topic, items]) => h('details', { class: 'topicgroup', open: items.some((i) => i.pending || i.score < 1) && false },
    h('summary', {}, h('b', {}, topic), h('span', { class: 'muted' }, ` · ${items.filter((i) => !i.pending && i.score >= 1).length}/${items.length} voll richtig`)),
    items.map((it, n) => {
      const cls = it.pending ? 'lv-pending' : it.score >= 1 ? 'lv-ok' : it.score > 0 ? 'lv-mid' : 'lv-low';
      const manual = ['drawing', 'practical'].includes(it.question.type) || (it.question.type === 'text' && it.pending);
      return h('div', { class: 'task' },
        h('div', { class: 'row between' }, h('div', {}, h('span', { class: 'tag t-' + it.question.type }, meta.types[it.question.type].label), ' ', h('b', {}, it.question.prompt)),
          h('span', { class: 'badge ' + cls }, it.pending ? 'offen' : Math.round(it.score * 100) + ' %')),
        it.objective ? h('p', { class: 'muted small' }, 'Lernziel: ', it.objective) : null,
        reviewView(it),
        manual ? gradePanel(it, id, () => participantPage(id)) : null);
    })));

  layout('surveys',
    h('div', { class: 'pagehead noprint' }, h('a', { href: `#/results/${r.survey.id}`, class: 'back' }, '← Gruppenauswertung'),
      h('button', { class: 'btn', onclick: () => { document.querySelectorAll('details').forEach((d) => { d.open = true; }); window.print(); } }, '🖨 Drucken / PDF')),
    h('div', { class: 'card' },
      h('div', { class: 'row between' }, h('div', {}, h('h1', {}, r.participant.name), h('p', { class: 'muted' }, `${r.survey.title} · abgegeben ${fmtDate(r.participant.submitted_at)}`)),
        h('div', { class: 'total ' + lvl.cls }, h('div', { class: 'big' }, pctText(r.pct)), h('div', {}, lvl.label))),
      r.pendingCount ? h('p', { class: 'callout' }, `${r.pendingCount} Aufgabe(n) (Zeichnen/Praxis) sind noch nicht bewertet und fließen erst nach der Bewertung ein.`) : null),
    h('div', { class: 'two-col' },
      h('div', { class: 'card' }, h('h2', {}, 'Stärken & Schwächen'), r.topics.map(bar), h('p', { class: 'muted small' }, `Markierungen: ${r.survey.threshold_low} % und ${r.survey.threshold_high} %`)),
      rv ? h('div', { class: 'card center' }, h('h2', {}, 'Profil'), rv) : null),
    h('div', { class: 'card' },
      h('h2', {}, 'Vorschlag für Schulung / Weiterbildungsplan'),
      r.plan.length ? r.plan.map((p) => h('div', { class: 'plan' },
        h('div', { class: 'row' }, h('span', { class: 'badge ' + LEVEL[p.level].cls }, LEVEL[p.level].label), h('b', {}, p.topic), h('span', { class: 'muted' }, pctText(p.pct))),
        p.objectives.length ? h('ul', {}, p.objectives.map((o) => h('li', {}, o))) : h('p', { class: 'muted small' }, 'Keine einzelnen Lernziele hinterlegt.'))) : h('p', {}, r.pendingCount ? 'Noch keine Schwächen erkennbar – bitte zuerst offene Bewertungen abschließen.' : 'Keine Schwächen festgestellt. 🎉')),
    h('div', { class: 'card' }, h('h2', {}, 'Einzelne Aufgaben'), taskCards));
}
