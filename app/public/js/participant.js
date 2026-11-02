// Teilnehmer-Oberfläche: Zugang per persönlichem Link, eine Aufgabe pro Seite, automatisches Speichern.
import { h, api, clear, debounce, toast } from './dom.js';
import { renderQuestion } from './qviews.js';

export async function participantApp(root, token) {
  const shell = (...c) => h('div', { class: 'p-shell' }, h('header', { class: 'p-head' }, h('div', { class: 'brand' }, h('span', { class: 'logo' }, '✓'), 'Wissenscheck')), h('main', { class: 'p-main' }, ...c));
  clear(root).append(shell(h('p', { class: 'muted' }, 'Lade …')));

  let data;
  try { data = await api(`/p/${encodeURIComponent(token)}`); } catch (e) {
    clear(root).append(shell(h('div', { class: 'card center' }, h('h1', {}, 'Link ungültig'), h('p', {}, 'Dieser Zugangslink ist nicht bekannt. Bitte wende dich an deinen Ausbilder.'))));
    return;
  }
  const { participant, survey } = data;
  if (participant.status === 'submitted') return done(`Vielen Dank, ${participant.name}!`, 'Deine Antworten wurden abgegeben. Die Auswertung erfolgt durch deinen Ausbilder.');
  if (participant.status === 'closed') return done('Abfrage nicht verfügbar', 'Diese Abfrage ist aktuell nicht geöffnet. Bitte wende dich an deinen Ausbilder.');

  function done(title, text) {
    clear(root).append(shell(h('div', { class: 'card center' }, h('div', { class: 'bigcheck' }, '✓'), h('h1', {}, title), h('p', {}, text))));
  }

  const { questions, answers } = data;
  let idx = -1; // -1 = Startseite, questions.length = Übersicht
  const saveState = h('span', { class: 'savestate muted small' });
  const pending = new Map();

  let inflight = Promise.resolve();
  async function doSave() {
    await inflight;
    if (!pending.size) return;
    const jobs = [...pending.entries()]; pending.clear();
    saveState.textContent = 'Speichere …';
    try {
      for (const [qid, response] of jobs) await api(`/p/${encodeURIComponent(token)}/answers/${qid}`, { method: 'PUT', body: { response } });
      saveState.textContent = 'Gespeichert ✓';
    } catch (e) {
      saveState.textContent = 'Nicht gespeichert!';
      toast('Speichern fehlgeschlagen: ' + e.message, 'err');
      for (const [qid, r] of jobs) if (!pending.has(qid)) pending.set(qid, r);
      throw e;
    }
  }
  const save = debounce(() => { inflight = doSave().catch(() => {}); }, 500);
  const onAnswer = (q) => (response) => { answers[q.id] = response; pending.set(q.id, response); saveState.textContent = '…'; save(); };
  const isAnswered = (q) => { const a = answers[q.id]; return a && Object.keys(a).length > 0; };
  async function flush() { await inflight; await doSave(); }

  function go(i) { idx = i; render(); window.scrollTo({ top: 0 }); }

  function start() {
    const topics = [...new Set(questions.map((q) => q.topic).filter(Boolean))];
    return h('div', { class: 'card' },
      h('h1', {}, survey.title),
      h('p', { class: 'lead' }, `Hallo ${participant.name}, schön, dass du da bist!`),
      survey.description ? h('p', {}, survey.description) : null,
      h('ul', { class: 'facts' },
        h('li', {}, h('b', {}, questions.length), ' Aufgaben'),
        h('li', {}, 'Themen: ', topics.join(' · ')),
        h('li', {}, 'Deine Antworten werden automatisch gespeichert – du kannst jederzeit unterbrechen und über deinen Link weitermachen.'),
        h('li', {}, 'Es geht nicht um eine Note: Das Ergebnis hilft, die Schulung passend für dich zu gestalten. Gib einfach dein Bestes und rate nicht wild – „weiß ich nicht“ ist völlig in Ordnung.')),
      h('button', { class: 'btn primary big', onclick: () => go(Object.keys(answers).length ? firstOpen() : 0) }, Object.keys(answers).length ? 'Fortsetzen' : 'Los geht’s'));
  }
  const firstOpen = () => { const i = questions.findIndex((q) => !isAnswered(q)); return i < 0 ? questions.length : i; };

  function progress() {
    const n = questions.filter(isAnswered).length;
    return h('div', { class: 'progress', title: `${n} von ${questions.length} bearbeitet` }, h('div', { style: { width: (n / questions.length) * 100 + '%' } }));
  }

  function question() {
    const q = questions[idx];
    return h('div', { class: 'card' },
      h('div', { class: 'qmeta' }, h('span', { class: 'tag' }, q.topic || 'Aufgabe'), h('span', { class: 'muted small' }, `Aufgabe ${idx + 1} von ${questions.length}`)),
      h('h2', { class: 'prompt' }, q.prompt),
      renderQuestion(q, answers[q.id], onAnswer(q)),
      h('div', { class: 'nav' },
        h('button', { class: 'btn', disabled: idx === 0, onclick: () => go(idx - 1) }, '← Zurück'),
        saveState,
        h('button', { class: 'btn', onclick: () => go(questions.length) }, 'Übersicht'),
        h('button', { class: 'btn primary', onclick: () => go(idx + 1) }, idx === questions.length - 1 ? 'Zur Übersicht →' : 'Weiter →')));
  }

  function overview() {
    const open = questions.filter((q) => !isAnswered(q));
    return h('div', { class: 'card' },
      h('h1', {}, 'Übersicht'),
      open.length ? h('p', {}, `${open.length} Aufgabe${open.length === 1 ? ' ist' : 'n sind'} noch unbearbeitet. Du kannst sie überspringen oder zurückgehen.`) : h('p', {}, 'Alle Aufgaben sind bearbeitet. Prüfe bei Bedarf noch einmal deine Antworten.'),
      h('div', { class: 'grid' }, questions.map((q, i) => h('button', { class: 'cell' + (isAnswered(q) ? ' done' : ''), title: q.prompt, onclick: () => go(i) }, i + 1))),
      h('div', { class: 'nav' },
        h('button', { class: 'btn', onclick: () => go(questions.length - 1) }, '← Zurück'),
        saveState,
        h('button', { class: 'btn primary big', onclick: submit }, 'Abgeben')));
  }

  async function submit() {
    const open = questions.filter((q) => !isAnswered(q)).length;
    if (!confirm(open ? `${open} Aufgabe(n) sind noch unbearbeitet. Trotzdem abgeben? Danach sind keine Änderungen mehr möglich.` : 'Abgeben? Danach sind keine Änderungen mehr möglich.')) return;
    try {
      await flush();
      await api(`/p/${encodeURIComponent(token)}/submit`, { method: 'POST', body: {} });
      done(`Vielen Dank, ${participant.name}!`, 'Deine Antworten wurden abgegeben. Die Auswertung erfolgt durch deinen Ausbilder.');
    } catch (e) { toast(e.message, 'err'); }
  }

  function render() {
    const body = idx < 0 ? start() : idx >= questions.length ? overview() : question();
    clear(root).append(h('div', { class: 'p-shell' },
      h('header', { class: 'p-head' }, h('div', { class: 'brand' }, h('span', { class: 'logo' }, '✓'), 'Wissenscheck'), idx >= 0 ? progress() : null, h('span', { class: 'who muted small' }, participant.name)),
      h('main', { class: 'p-main' }, body)));
  }
  render();
}
