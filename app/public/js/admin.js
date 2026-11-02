// Admin-Oberfläche: Abfragen, Fragenkatalog, Auswertung.
import { h, api, clear, toast, LEVEL, fmtDate, BASE } from './dom.js';
import { questionEditor } from './qeditor.js';
import { reviewView, gradePanel } from './review.js';

let root, meta, me;
const link = (token) => `${location.origin}${BASE}/t/${token}`;
const pctText = (p) => (p === null || p === undefined ? '–' : p + ' %');
const STATUS = { draft: ['Entwurf', 'lv-pending'], open: ['Geöffnet', 'lv-ok'], closed: ['Geschlossen', 'lv-mid'] };
const PSTATUS = { invited: ['Eingeladen', 'lv-pending'], started: ['In Bearbeitung', 'lv-mid'], submitted: ['Abgegeben', 'lv-ok'] };

export async function adminApp(el) {
  root = el;
  const who = await api('/me');
  if (!who.admin) return loginPage();
  me = who.user;
  meta = await api('/meta');
  window.addEventListener('hashchange', route);
  route();
}

function loginPage() {
  const user = h('input', { type: 'text', placeholder: 'Benutzername', value: 'admin', autocomplete: 'username' });
  const pw = h('input', { type: 'password', placeholder: 'Passwort', autofocus: true, autocomplete: 'current-password' });
  clear(root).append(h('div', { class: 'login' }, h('form', { class: 'card center', onsubmit: async (e) => {
    e.preventDefault();
    try { await api('/login', { method: 'POST', body: { username: user.value, password: pw.value } }); location.hash = '#/surveys'; adminApp(root); } catch (err) { toast(err.message, 'err'); pw.select(); }
  } }, h('div', { class: 'brand big' }, h('span', { class: 'logo' }, '✓'), 'Wissenscheck'), h('p', { class: 'muted' }, 'Admin-Bereich'), user, pw, h('button', { class: 'btn primary', type: 'submit' }, 'Anmelden'))));
}

function layout(active, ...content) {
  clear(root).append(
    h('header', { class: 'a-head noprint' }, h('div', { class: 'brand' }, h('span', { class: 'logo' }, '✓'), 'Wissenscheck'),
      h('nav', {}, h('a', { href: '#/surveys', class: active === 'surveys' ? 'on' : '' }, 'Abfragen'), h('a', { href: '#/questions', class: active === 'questions' ? 'on' : '' }, 'Fragenkatalog'), h('a', { href: '#/people', class: active === 'people' ? 'on' : '' }, 'Verläufe'), h('a', { href: '#/users', class: active === 'users' ? 'on' : '' }, 'Benutzer')),
      h('span', { class: 'muted small' }, me?.username),
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
    if (page === 'users') return await usersPage();
    if (page === 'people') return await peoplePage();
    if (page === 'person') return await personPage(decodeURIComponent(id));
    if (page === 'compare') return await comparePage(id, location.hash.split('/')[3]);
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
  const limit = h('input', { type: 'number', min: 0, placeholder: 'kein Limit', value: s.time_limit_min || '' });
  const low = h('input', { type: 'number', min: 0, max: 100, value: s.threshold_low });
  const high = h('input', { type: 'number', min: 0, max: 100, value: s.threshold_high });
  const showRes = h('input', { type: 'checkbox', checked: s.show_results });
  const settings = () => ({ title: title.value, description: desc.value, time_limit_min: limit.value || null, threshold_low: Number(low.value), threshold_high: Number(high.value), show_results: showRes.checked });
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
  const csv = h('input', { type: 'file', accept: '.csv,.txt,text/csv,text/plain', onchange: async () => {
    const f = csv.files[0]; if (!f) return;
    const lines = (await f.text()).replace(/^\ufeff/, '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length && /^(name|vorname|teilnehmer)\b/i.test(lines[0])) lines.shift(); // Kopfzeile
    names.value = [names.value.trim(), ...lines.map((l) => l.replace(/"/g, ''))].filter(Boolean).join('\n');
    toast(`${lines.length} Zeilen aus CSV übernommen – bitte prüfen und „Hinzufügen“ klicken`, 'ok'); csv.value = '';
  } });
  const copy = async (t) => { try { await navigator.clipboard.writeText(t); toast('Link kopiert', 'ok'); } catch { prompt('Link kopieren:', t); } };

  layout('surveys',
    h('div', { class: 'pagehead' }, h('a', { href: '#/surveys', class: 'back' }, '← Abfragen'), h('h1', {}, s.title), h('span', { class: 'badge ' + STATUS[s.status][1] }, STATUS[s.status][0])),
    h('div', { class: 'card' },
      h('h2', {}, 'Grunddaten & Status'),
      h('div', { class: 'two' }, h('label', { class: 'field' }, h('span', {}, 'Titel'), title), h('label', { class: 'field' }, h('span', {}, 'Beschreibung für Teilnehmer'), desc)),
      h('h3', {}, 'Optionen'),
      h('div', { class: 'three' },
        h('label', { class: 'field' }, h('span', {}, 'Zeitlimit in Minuten (leer = keins)'), limit),
        h('label', { class: 'field' }, h('span', {}, 'Schwelle „Schulungsbedarf“ (unter … %)'), low),
        h('label', { class: 'field' }, h('span', {}, 'Schwelle „Auffrischung“ (unter … %)'), high)),
      h('label', { class: 'symopt' }, showRes, ' Teilnehmern nach der Abgabe ihr Ergebnis (je Themenbereich) anzeigen'),
      h('p', { class: 'hint' }, 'Das Zeitlimit läuft ab dem ersten Öffnen des Links; danach wird automatisch abgegeben.'),
      h('div', { class: 'row' },
        h('button', { class: 'btn', onclick: () => patch(settings(), 'Gespeichert') }, 'Speichern'),
        s.status !== 'open' ? h('button', { class: 'btn primary', onclick: () => { if (!s.questions.length) return toast('Bitte zuerst Aufgaben auswählen und speichern', 'err'); patch({ ...settings(), status: 'open' }, 'Abfrage geöffnet – Links sind aktiv'); } }, 'Abfrage öffnen') : h('button', { class: 'btn', onclick: () => patch({ status: 'closed' }, 'Abfrage geschlossen') }, 'Abfrage schließen'),
        h('a', { class: 'btn', href: `#/results/${id}` }, 'Zur Auswertung →'),
        h('button', { class: 'btn', title: 'Aufgaben und Optionen übernehmen, ohne Teilnehmer', onclick: async () => { const c = await api(`/surveys/${id}/duplicate`, { method: 'POST', body: {} }); toast('Kopie angelegt – jetzt Teilnehmer hinzufügen', 'ok'); location.hash = `#/survey/${c.id}`; } }, '⧉ Als Vorlage duplizieren'),
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
          h('td', {}, h('code', { class: 'link' }, `${BASE}/t/${p.token}`), ' ', h('button', { class: 'btn small', onclick: () => copy(link(p.token)) }, 'Kopieren'), ' ', h('a', { class: 'btn small', href: `${BASE}/t/${p.token}`, target: '_blank', rel: 'noopener' }, 'Öffnen')),
          h('td', { class: 'right' },
            p.status === 'submitted' ? h('a', { class: 'btn small', href: `#/participant/${p.id}` }, 'Ergebnis') : null, ' ',
            p.status === 'submitted' ? h('button', { class: 'btn small', onclick: async () => { if (confirm('Abgabe zurücknehmen, damit der Teilnehmer weiterarbeiten kann?')) { await api(`/participants/${p.id}/reopen`, { method: 'POST', body: {} }); surveyPage(id); } } }, 'Wieder öffnen') : null, ' ',
            h('button', { class: 'btn small danger', onclick: async () => { if (confirm(`${p.name} samt Antworten entfernen?`)) { await api(`/participants/${p.id}`, { method: 'DELETE' }); surveyPage(id); } } }, '✕'))))) ) : h('p', { class: 'muted' }, 'Noch keine Teilnehmer.'),
      h('h3', {}, 'Teilnehmer hinzufügen'), names, h('label', { class: 'field' }, h('span', {}, 'oder CSV-Datei importieren (Spalten: Name; E-Mail)'), csv),
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
        h('td', { class: 'right' }, h('button', { class: 'btn small', onclick: () => edit(q) }, 'Bearbeiten'), ' ', h('button', { class: 'btn small', title: 'Duplizieren', onclick: async () => { await api(`/questions/${q.id}/duplicate`, { method: 'POST', body: {} }); toast('Frage dupliziert', 'ok'); questionsPage(); } }, '⧉'), ' ', h('button', { class: 'btn small danger', onclick: async () => { if (!confirm('Frage löschen?')) return; try { await api(`/questions/${q.id}`, { method: 'DELETE' }); questionsPage(); } catch (e) { toast(e.message, 'err'); } } }, '✕')))))));
  };
  async function edit(q) {
    meta = await api('/meta');
    layout('questions', await questionEditor({ question: q, meta, onSaved: () => questionsPage(), onCancel: () => questionsPage() }));
  }
  layout('questions',
    h('div', { class: 'pagehead' }, h('h1', {}, 'Fragenkatalog'),
      h('a', { class: 'btn', href: BASE + '/api/questions-export', title: 'Alle Fragen inkl. Bilder als Datei sichern' }, '⬇ Exportieren'),
      h('label', { class: 'btn', title: 'Fragen aus einer Exportdatei hinzufügen' }, '⬆ Importieren', h('input', { type: 'file', accept: '.json,application/json', hidden: true, onchange: async (e) => {
        const f = e.target.files[0]; if (!f) return;
        try { const r = await fetch(BASE + '/api/questions-import', { method: 'POST', headers: { 'content-type': 'application/json' }, body: await f.text(), credentials: 'same-origin' }); const j = await r.json(); if (!r.ok) throw new Error(j.error); toast(`${j.imported} Fragen importiert`, 'ok'); meta = await api('/meta'); questionsPage(); } catch (err) { toast(err.message, 'err'); }
      } })),
      h('button', { class: 'btn primary', onclick: () => edit(null) }, '+ Neue Frage')),
    h('div', { class: 'card row' },
      h('select', { onchange: (e) => { topic = e.target.value; draw(); } }, h('option', { value: '' }, 'Alle Themenbereiche'), meta.topics.map((t) => h('option', { value: t.id }, t.name))),
      h('select', { onchange: (e) => { type = e.target.value; draw(); } }, h('option', { value: '' }, 'Alle Typen'), Object.entries(meta.types).map(([k, t]) => h('option', { value: k }, t.label))),
      h('input', { type: 'search', placeholder: 'Suchen …', oninput: (e) => { text = e.target.value; draw(); } }), h('span', { class: 'muted' }, `${qs.length} Fragen`)),
    h('div', { class: 'card flush' }, body));
  draw();
}

// ------------------------------------------------------------------ Auswertung (Gruppe)
async function resultsPage(id) {
  const [r, allSurveys] = await Promise.all([api(`/surveys/${id}/results`), api('/surveys')]);
  const compareSelect = (cur) => h('select', { style: { width: 'auto', minWidth: '260px' }, onchange: (e) => { if (e.target.value) location.hash = `#/compare/${e.target.value}/${cur}`; } },
    h('option', { value: '' }, '– frühere Abfrage wählen –'), allSurveys.filter((x) => String(x.id) !== String(cur)).map((x) => h('option', { value: x.id }, x.title)));
  const cell = (pct, level, extra) => h('td', { class: 'hm ' + LEVEL[level || 'pending'].cls, title: LEVEL[level || 'pending'].label }, pctText(pct), extra);
  layout('surveys',
    h('div', { class: 'pagehead' }, h('a', { href: `#/survey/${id}`, class: 'back' }, '← Abfrage'), h('h1', {}, 'Auswertung: ', r.survey.title)),
    h('div', { class: 'card banner ' + (r.complete ? 'done' : '') },
      r.complete ? h('b', {}, '✓ Alle Teilnehmer haben die Abfrage abgegeben.') : h('b', {}, `${r.submitted} von ${r.participants.length} Teilnehmern haben abgegeben.`),
      h('span', { class: 'muted' }, ' Ergebnisse sind nur für Admins sichtbar. '),
      h('a', { class: 'btn small', href: `${BASE}/api/surveys/${id}/export.csv` }, 'CSV-Export')),
    h('div', { class: 'card row noprint' }, h('b', {}, 'Vorher/Nachher-Vergleich:'), h('span', { class: 'muted' }, 'diese Abfrage verglichen mit'), compareSelect(id)),
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
  const [r, savedPlan] = await Promise.all([api(`/participants/${id}/result`), api(`/participants/${id}/plan`)]);
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
    h('div', { class: 'pagehead noprint' }, h('a', { href: `#/results/${r.survey.id}`, class: 'back' }, '← Gruppenauswertung'), h('a', { href: `#/person/${encodeURIComponent((r.participant.email || r.participant.name).toLowerCase())}`, class: 'btn' }, '📈 Verlauf dieser Person'),
      h('button', { class: 'btn', onclick: () => { document.querySelectorAll('details').forEach((d) => { d.open = true; }); window.print(); } }, '🖨 Drucken / PDF')),
    h('div', { class: 'card' },
      h('div', { class: 'row between' }, h('div', {}, h('h1', {}, r.participant.name), h('p', { class: 'muted' }, `${r.survey.title} · abgegeben ${fmtDate(r.participant.submitted_at)}`)),
        h('div', { class: 'total ' + lvl.cls }, h('div', { class: 'big' }, pctText(r.pct)), h('div', {}, lvl.label))),
      r.pendingCount ? h('p', { class: 'callout' }, `${r.pendingCount} Aufgabe(n) (Zeichnen/Praxis) sind noch nicht bewertet und fließen erst nach der Bewertung ein.`) : null),
    h('div', { class: 'two-col' },
      h('div', { class: 'card' }, h('h2', {}, 'Stärken & Schwächen'), r.topics.map(bar), h('p', { class: 'muted small' }, `Markierungen: ${r.survey.threshold_low} % und ${r.survey.threshold_high} %`)),
      rv ? h('div', { class: 'card center' }, h('h2', {}, 'Profil'), rv) : null),
    planCard(r, id, savedPlan),
    h('div', { class: 'card' }, h('h2', {}, 'Einzelne Aufgaben'), taskCards));
}

// ------------------------------------------------------------------ Benutzer
async function usersPage() {
  const users = await api('/users');
  const name = h('input', { type: 'text', placeholder: 'Benutzername', autocomplete: 'off' });
  const pw = h('input', { type: 'password', placeholder: 'Passwort (min. 6 Zeichen)', autocomplete: 'new-password' });
  layout('users',
    h('div', { class: 'pagehead' }, h('h1', {}, 'Benutzer')),
    h('p', { class: 'muted' }, 'Alle Benutzer haben vollen Admin-Zugriff auf Abfragen, Fragen und Auswertungen.'),
    h('div', { class: 'card flush' }, h('table', { class: 'tbl' },
      h('thead', {}, h('tr', {}, ['Benutzer', 'Angelegt', ''].map((t) => h('th', {}, t)))),
      h('tbody', {}, users.map((u) => h('tr', {}, h('td', {}, h('b', {}, u.username), u.id === me.id ? h('span', { class: 'muted' }, ' (du)') : null), h('td', {}, fmtDate(u.created_at)),
        h('td', { class: 'right' },
          h('button', { class: 'btn small', onclick: async () => { const p = prompt(`Neues Passwort für ${u.username}:`); if (p) { try { await api(`/users/${u.id}/password`, { method: 'PUT', body: { password: p } }); toast('Passwort geändert', 'ok'); } catch (e) { toast(e.message, 'err'); } } } }, 'Passwort ändern'), ' ',
          u.id !== me.id ? h('button', { class: 'btn small danger', onclick: async () => { if (confirm(`Benutzer ${u.username} löschen?`)) { await api(`/users/${u.id}`, { method: 'DELETE' }); usersPage(); } } }, '✕') : null)))))),
    h('form', { class: 'card row', onsubmit: async (e) => { e.preventDefault(); try { await api('/users', { method: 'POST', body: { username: name.value, password: pw.value } }); toast('Benutzer angelegt', 'ok'); usersPage(); } catch (err) { toast(err.message, 'err'); } } },
      name, pw, h('button', { class: 'btn primary', type: 'submit' }, '+ Benutzer anlegen')));
}

// ------------------------------------------------------------------ Weiterbildungsplan
const PLAN_STATUS = { open: 'offen', planned: 'geplant', done: 'erledigt' };
function planCard(r, pid, saved) {
  const suggestion = r.plan.map((p) => ({ topic: p.topic, measure: p.objectives.length ? `Schulung/Training: ${p.objectives.join('; ')}` : 'Schulung/Training', responsible: '', due: '', status: 'open' }));
  let items = saved ? saved.items.map((i) => ({ ...i })) : suggestion;
  let notes = saved?.notes || '';
  const list = h('div', { class: 'planlist' });
  const topicNames = r.topics.map((t) => t.name);
  const draw = () => list.replaceChildren(...(items.length ? [] : [h('p', { class: 'muted' }, 'Noch keine Maßnahmen.')]), ...items.map((it, i) => h('div', { class: 'planrow' },
    h('select', { 'aria-label': 'Themenbereich', onchange: (e) => { it.topic = e.target.value; } }, h('option', { value: '' }, '– Thema –'), topicNames.map((t) => h('option', { value: t, selected: it.topic === t }, t))),
    h('textarea', { rows: 2, placeholder: 'Maßnahme (Schulung, Training, Mentor …)', oninput: (e) => { it.measure = e.target.value; } }, it.measure),
    h('input', { type: 'text', placeholder: 'Verantwortlich', value: it.responsible, oninput: (e) => { it.responsible = e.target.value; } }),
    h('input', { type: 'date', value: it.due, onchange: (e) => { it.due = e.target.value; } }),
    h('select', { 'aria-label': 'Status', onchange: (e) => { it.status = e.target.value; } }, Object.entries(PLAN_STATUS).map(([k, v]) => h('option', { value: k, selected: it.status === k }, v))),
    h('button', { type: 'button', class: 'btn icon danger noprint', title: 'entfernen', onclick: () => { items.splice(i, 1); draw(); } }, '✕'))));
  draw();
  const notesEl = h('textarea', { rows: 3, placeholder: 'Anmerkungen zum Weiterbildungsplan', oninput: (e) => { notes = e.target.value; } }, notes);
  const printView = h('div', { class: 'print-only plan-print' });
  const doPrint = () => {
    printView.replaceChildren(h('h2', {}, `Weiterbildungsplan: ${r.participant.name}`), h('p', {}, `${r.survey.title} · Gesamtergebnis ${pctText(r.pct)} · Stand ${new Date().toLocaleDateString('de-DE')}`),
      h('table', { class: 'tbl' }, h('thead', {}, h('tr', {}, ['Themenbereich', 'Maßnahme', 'Verantwortlich', 'Termin', 'Status'].map((t) => h('th', {}, t)))),
        h('tbody', {}, items.map((it) => h('tr', {}, h('td', {}, it.topic), h('td', {}, it.measure), h('td', {}, it.responsible), h('td', {}, it.due ? new Date(it.due).toLocaleDateString('de-DE') : ''), h('td', {}, PLAN_STATUS[it.status]))))),
      notes ? h('p', {}, h('b', {}, 'Anmerkungen: '), notes) : null);
    document.body.classList.add('print-plan');
    window.onafterprint = () => { document.body.classList.remove('print-plan'); window.onafterprint = null; };
    window.print();
  };
  return h('div', { class: 'card', id: 'plancard' },
    h('div', { class: 'row between' }, h('h2', {}, 'Weiterbildungsplan'), saved ? h('span', { class: 'muted small' }, `gespeichert ${fmtDate(saved.updated_at)} von ${saved.updated_by}`) : h('span', { class: 'badge lv-mid' }, 'Vorschlag – noch nicht gespeichert')),
    r.plan.length || saved ? null : h('p', { class: 'muted' }, r.pendingCount ? 'Noch keine Schwächen erkennbar – bitte zuerst offene Bewertungen abschließen. Maßnahmen können trotzdem manuell ergänzt werden.' : 'Keine Schwächen festgestellt. Maßnahmen können trotzdem manuell ergänzt werden.'),
    h('p', { class: 'hint noprint' }, 'Der Vorschlag entsteht aus den Lernzielen der nicht voll gelösten Aufgaben. Alles ist frei bearbeitbar.'),
    list,
    h('div', { class: 'row noprint' }, h('button', { type: 'button', class: 'btn small', onclick: () => { items.push({ topic: '', measure: '', responsible: '', due: '', status: 'open' }); draw(); } }, '+ Maßnahme'),
      saved ? h('button', { type: 'button', class: 'btn small', onclick: () => { items = [...items, ...suggestion.filter((s) => !items.some((i) => i.topic === s.topic && i.measure === s.measure))]; draw(); } }, 'Vorschlag ergänzen') : null),
    h('label', { class: 'field noprint', style: { marginTop: '.8rem' } }, h('span', {}, 'Anmerkungen'), notesEl),
    h('div', { class: 'row end noprint' },
      h('button', { type: 'button', class: 'btn', onclick: doPrint }, '🖨 Plan drucken / PDF'),
      h('button', { type: 'button', class: 'btn primary', onclick: async () => { try { await api(`/participants/${pid}/plan`, { method: 'PUT', body: { items, notes } }); toast('Plan gespeichert', 'ok'); participantPage(pid); } catch (e) { toast(e.message, 'err'); } } }, 'Plan speichern')),
    printView);
}

// ------------------------------------------------------------------ Verläufe & Vergleich
const deltaCell = (a, b) => {
  if (a === null || a === undefined || b === null || b === undefined) return h('td', { class: 'hm lv-pending' }, '–');
  const d = b - a;
  return h('td', { class: 'hm ' + (d >= 5 ? 'lv-ok' : d <= -5 ? 'lv-low' : 'lv-pending'), title: `${a} % → ${b} %` }, `${a} → ${b}`, h('div', { class: 'small' }, (d > 0 ? '+' : '') + d));
};

async function peoplePage() {
  const people = await api('/people');
  layout('people',
    h('div', { class: 'pagehead' }, h('h1', {}, 'Verläufe')),
    h('p', { class: 'muted' }, 'Teilnehmer werden über die E-Mail-Adresse (ohne E-Mail über den Namen) abfrageübergreifend zusammengeführt. Für saubere Verläufe bei jeder Abfrage dieselbe E-Mail verwenden.'),
    h('div', { class: 'card flush' }, people.length ? h('table', { class: 'tbl' }, h('thead', {}, h('tr', {}, ['Name', 'E-Mail', 'Abgegebene Abfragen', 'Zuletzt', ''].map((t) => h('th', {}, t)))),
      h('tbody', {}, people.map((p) => h('tr', { class: 'clickrow', onclick: () => { location.hash = `#/person/${encodeURIComponent(p.key)}`; } }, h('td', {}, h('b', {}, p.name)), h('td', {}, p.email || '–'), h('td', {}, p.count), h('td', {}, fmtDate(p.last)), h('td', { class: 'right' }, p.count > 1 ? h('span', { class: 'badge lv-ok' }, 'Verlauf') : ''))))) : h('p', { class: 'muted', style: { padding: '1rem' } }, 'Noch keine abgegebenen Abfragen.')));
}

function lineChart(points) {
  const W = 520, H = 160, pad = 30;
  const x = (i) => (points.length === 1 ? W / 2 : pad + (i * (W - 2 * pad)) / (points.length - 1)), y = (v) => H - pad - (v / 100) * (H - 2 * pad);
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  el.setAttribute('viewBox', `0 0 ${W} ${H}`); el.setAttribute('class', 'linechart');
  el.innerHTML = [0, 50, 100].map((v) => `<line x1="${pad}" x2="${W - pad}" y1="${y(v)}" y2="${y(v)}" stroke="currentColor" opacity=".15"/><text x="${pad - 6}" y="${y(v) + 4}" font-size="11" text-anchor="end" fill="currentColor" opacity=".6">${v}</text>`).join('')
    + `<polyline fill="none" stroke="var(--accent)" stroke-width="2.5" points="${points.map((p, i) => `${x(i)},${y(p.v)}`).join(' ')}"/>`
    + points.map((p, i) => `<circle cx="${x(i)}" cy="${y(p.v)}" r="4.5" fill="var(--accent)"/><text x="${x(i)}" y="${y(p.v) - 10}" font-size="12" text-anchor="middle" font-weight="700" fill="currentColor">${p.v} %</text><text x="${x(i)}" y="${H - 8}" font-size="10.5" text-anchor="middle" fill="currentColor" opacity=".7">${p.label}</text>`).join('');
  return el;
}

async function personPage(key) {
  const d = await api(`/people/history?key=${encodeURIComponent(key)}`);
  const hist = d.history;
  const topics = [...new Set(hist.flatMap((x) => x.topics.map((t) => t.name)))];
  const pctIn = (x, n) => x.topics.find((t) => t.name === n)?.pct ?? null;
  const first = hist[0], last = hist.at(-1);
  layout('people',
    h('div', { class: 'pagehead' }, h('a', { href: '#/people', class: 'back' }, '← Verläufe'), h('h1', {}, d.name)),
    hist.length < 2 ? h('p', { class: 'callout' }, 'Bisher nur eine abgegebene Abfrage – ein Verlauf entsteht ab der zweiten (z. B. nach der Schulung).') : null,
    hist.length ? h('div', { class: 'card' }, h('h2', {}, 'Gesamtergebnis im Zeitverlauf'), lineChart(hist.map((x) => ({ v: x.pct ?? 0, label: new Date(x.submitted_at).toLocaleDateString('de-DE') })))) : null,
    h('div', { class: 'card flush scroll' }, h('table', { class: 'tbl heat' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Themenbereich'), hist.map((x) => h('th', {}, h('a', { href: `#/participant/${x.participant_id}` }, x.survey), h('div', { class: 'small', style: { textTransform: 'none', fontWeight: 400 } }, fmtDate(x.submitted_at)))), hist.length > 1 ? h('th', {}, 'Veränderung') : null)),
      h('tbody', {}, [{ name: 'Gesamt', get: (x) => x.pct }, ...topics.map((n) => ({ name: n, get: (x) => pctIn(x, n) }))].map((row) => h('tr', {}, h('td', {}, h('b', {}, row.name)),
        hist.map((x) => { const v = row.get(x); return h('td', { class: 'hm' }, pctText(v)); }),
        hist.length > 1 ? deltaCell(row.get(first), row.get(last)) : null))))));
}

async function comparePage(a, b) {
  const c = await api(`/compare?a=${a}&b=${b}`);
  layout('surveys',
    h('div', { class: 'pagehead' }, h('a', { href: `#/results/${b}`, class: 'back' }, '← Auswertung'), h('h1', {}, 'Vorher/Nachher-Vergleich')),
    h('div', { class: 'card' }, h('div', { class: 'two' }, h('div', {}, h('span', { class: 'tag' }, 'Vorher'), h('p', {}, h('b', {}, c.a.title))), h('div', {}, h('span', { class: 'tag' }, 'Nachher'), h('p', {}, h('b', {}, c.b.title)))),
      h('p', { class: 'muted small' }, `${c.people.length} Teilnehmer in beiden Abfragen gefunden (Zuordnung über E-Mail bzw. Name).` + (c.unmatched.a || c.unmatched.b ? ` Nicht zuordenbar: ${c.unmatched.a} (vorher), ${c.unmatched.b} (nachher).` : ''))),
    c.people.length ? h('div', { class: 'card flush scroll' }, h('table', { class: 'tbl heat' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Teilnehmer'), h('th', {}, 'Gesamt'), c.topics.map((t) => h('th', { class: 'rot' }, h('span', {}, t))))),
      h('tbody', {}, c.people.map((p) => h('tr', {}, h('td', {}, h('b', {}, p.name)), deltaCell(p.a, p.b), p.topics.map((t) => deltaCell(t.a, t.b)))),
        h('tr', { class: 'avg' }, h('td', {}, h('b', {}, 'Gruppen-Ø')), deltaCell(c.average.a, c.average.b), c.average.topics.map((t) => deltaCell(t.a, t.b)))))) : h('p', { class: 'muted' }, 'Keine Teilnehmer in beiden Abfragen gefunden.'),
    h('p', { class: 'muted small' }, 'Grün: Verbesserung ab +5 Prozentpunkten, rot: Verschlechterung ab −5.'));
}
