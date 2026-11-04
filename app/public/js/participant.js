// Teilnehmer-Oberfläche: Zugang per persönlichem Link, eine Aufgabe pro Seite, automatisches Speichern.
import { h, api, clear, debounce, toast } from './dom.js';
import { renderQuestion } from './qviews.js';
import { initI18n, t, getLang, langSwitcher } from './i18n.js';

// Serverfehler sind deutsch; für den Teilnehmerfluss bekannte Status auf t()-Texte abbilden
const errText = (e) => (e.status === 404 ? t('err.link') : e.status === 409 ? t('err.closed') : t('err.generic'));
const arrow = (dir) => h('span', { class: 'arr', 'aria-hidden': 'true' }, dir === 'back' ? '←' : '→');

export async function participantApp(root, token) {
  await initI18n();
  const P = `/p/${encodeURIComponent(token)}`;
  let page = null; // liefert die aktuelle Seite; wird bei Sprachwechsel neu aufgerufen
  const paint = () => clear(root).append(page());
  const brand = () => h('div', { class: 'brand' }, h('span', { class: 'logo' }, '✓'), t('app.name'));
  const shell = (...c) => h('div', { class: 'p-shell' }, h('header', { class: 'p-head' }, brand(), langSwitcher(onLang, 'solo')), h('main', { class: 'p-main' }, ...c));

  let data = null, survey, questions, results;
  let participant;
  function apply(d) { survey = d.survey; questions = d.questions; if (d.results) results = d.results; }
  // Sprachwechsel: Texte neu vom Server holen; Antworten, Position und Timer bleiben unberührt
  async function onLang() {
    if (data) { try { apply(await api(`${P}?lang=${encodeURIComponent(getLang())}`)); } catch { /* alte Texte bleiben */ } }
    paint();
  }

  page = () => shell(h('p', { class: 'muted' }, t('part.loading')));
  paint();

  try { data = await api(`${P}?lang=${encodeURIComponent(getLang())}`); } catch (e) {
    page = () => shell(h('div', { class: 'card center' }, h('h1', {}, e.status === 404 ? t('part.invalid.title') : t('err.generic')), e.status === 404 ? h('p', {}, t('part.invalid.text')) : null));
    paint();
    return;
  }
  participant = data.participant;
  apply(data);
  if (participant.status === 'submitted') return done('part.done.title', 'part.done.text', true);
  if (participant.status === 'closed') return done('part.closed.title', 'part.closed.text');

  function done(titleKey, textKey, withResults) {
    const LV = { low: ['level.low', 'lv-low'], mid: ['level.mid', 'lv-mid'], ok: ['level.ok', 'lv-ok'], pending: ['level.pending', 'lv-pending'] };
    page = () => {
      const res = withResults && results ? h('div', { class: 'myresults' }, h('h2', {}, t('part.result.title')),
        results.topics.map((tp) => h('div', { class: 'tbar' }, h('div', { class: 'tlabel' }, h('b', {}, tp.name)),
          h('div', { class: 'track' }, h('div', { class: 'fill ' + LV[tp.level][1], style: { width: (tp.pct ?? 0) + '%' } })), h('div', { class: 'tpct' }, tp.pct === null ? '–' : tp.pct + ' %'), h('span', { class: 'badge ' + LV[tp.level][1] }, t(LV[tp.level][0])))),
        results.pending ? h('p', { class: 'muted small' }, t('part.result.pending')) : null) : h('p', { class: 'muted' }, t('part.result.byTrainer'));
      return shell(h('div', { class: 'card center' }, h('div', { class: 'bigcheck' }, '✓'), h('h1', {}, t(titleKey, { name: participant.name })), h('p', {}, t(textKey)), res));
    };
    paint();
  }

  const { answers } = data;
  const skew = data.now ? new Date(data.now).getTime() - Date.now() : 0; // Server-/Client-Zeitabweichung
  const deadline = data.deadline ? new Date(data.deadline).getTime() - skew : null;
  const timer = h('span', { class: 'timer' });
  let expired = false;
  if (deadline) {
    const tick = async () => {
      const left = Math.max(0, deadline - Date.now());
      const m = Math.floor(left / 60000), sec = String(Math.floor((left % 60000) / 1000)).padStart(2, '0');
      timer.textContent = `⏱ ${m}:${sec}`;
      timer.classList.toggle('low', left < 120000);
      if (left <= 0 && !expired) {
        expired = true; clearInterval(iv);
        try { await flush(); await api(`${P}/submit`, { method: 'POST', body: {} }); } catch { /* Server gibt ohnehin ab */ }
        done('part.expired.title', 'part.expired.text');
      }
    };
    var iv = setInterval(tick, 1000); tick();
  }
  let idx = -1; // -1 = Startseite, questions.length = Übersicht
  const saveState = h('span', { class: 'savestate muted small' });
  let saveKey = ''; // Schlüssel statt Text, damit der Status nach Sprachwechsel neu übersetzt wird
  const setSave = (k) => { saveKey = k; saveState.textContent = k === '…' ? '…' : k ? t(k) : ''; };
  const pending = new Map();

  let inflight = Promise.resolve();
  async function doSave() {
    await inflight;
    if (!pending.size) return;
    const jobs = [...pending.entries()]; pending.clear();
    setSave('part.save.saving');
    try {
      for (const [qid, response] of jobs) await api(`${P}/answers/${qid}`, { method: 'PUT', body: { response, lang: getLang() } });
      setSave('part.save.saved');
    } catch (e) {
      setSave('part.save.failed');
      toast(t('part.save.toast', { msg: errText(e) }), 'err');
      for (const [qid, r] of jobs) if (!pending.has(qid)) pending.set(qid, r);
      throw e;
    }
  }
  const save = debounce(() => { inflight = doSave().catch(() => {}); }, 500);
  const onAnswer = (q) => (response) => { answers[q.id] = response; pending.set(q.id, response); setSave('…'); save(); };
  const isAnswered = (q) => { const a = answers[q.id]; return a && Object.keys(a).length > 0; };
  async function flush() { await inflight; await doSave(); }

  function go(i) { idx = i; render(); window.scrollTo({ top: 0 }); }

  // Text mit {n}, bei dem die Zahl fett gesetzt wird
  function boldN(key, n) {
    const parts = t(key, { n: '\u0000' }).split('\u0000');
    return parts.flatMap((p, i) => (i < parts.length - 1 ? [p, h('b', {}, n)] : [p]));
  }

  function start() {
    const topics = [...new Set(questions.map((q) => q.topic).filter(Boolean))];
    return h('div', { class: 'card' },
      h('h1', {}, survey.title),
      h('p', { class: 'lead' }, t('part.start.hello', { name: participant.name })),
      survey.description ? h('p', {}, survey.description) : null,
      h('ul', { class: 'facts' },
        h('li', {}, boldN('part.start.tasks', questions.length)),
        h('li', {}, t('part.start.topics', { list: topics.join(' · ') })),
        h('li', {}, t('part.start.autosave')),
        h('li', {}, t('part.start.nograde'))),
      h('button', { class: 'btn primary big', onclick: () => go(Object.keys(answers).length ? firstOpen() : 0) }, Object.keys(answers).length ? t('part.start.resume') : t('part.start.begin')));
  }
  const firstOpen = () => { const i = questions.findIndex((q) => !isAnswered(q)); return i < 0 ? questions.length : i; };

  function progress() {
    const n = questions.filter(isAnswered).length;
    return h('div', { class: 'progress', title: t('part.progress', { n, total: questions.length }) }, h('div', { style: { width: (n / questions.length) * 100 + '%' } }));
  }

  function question() {
    const q = questions[idx];
    return h('div', { class: 'card' },
      h('div', { class: 'qmeta' }, h('span', { class: 'tag' }, q.topic || t('part.task')), h('span', { class: 'muted small' }, t('part.q.of', { n: idx + 1, total: questions.length }))),
      h('h2', { class: 'prompt' }, q.prompt),
      renderQuestion(q, answers[q.id], onAnswer(q)),
      h('div', { class: 'nav' },
        h('button', { class: 'btn', disabled: idx === 0, onclick: () => go(idx - 1) }, arrow('back'), ' ', t('part.back')),
        saveState,
        h('button', { class: 'btn', onclick: () => go(questions.length) }, t('part.overview')),
        h('button', { class: 'btn primary', onclick: () => go(idx + 1) }, idx === questions.length - 1 ? t('part.toOverview') : t('part.next'), ' ', arrow('next'))));
  }

  function overview() {
    const open = questions.filter((q) => !isAnswered(q));
    return h('div', { class: 'card' },
      h('h1', {}, t('part.overview')),
      open.length ? h('p', {}, t(open.length === 1 ? 'part.overview.open.one' : 'part.overview.open.many', { n: open.length })) : h('p', {}, t('part.overview.alldone')),
      h('div', { class: 'grid' }, questions.map((q, i) => h('button', { class: 'cell' + (isAnswered(q) ? ' done' : ''), title: q.prompt, onclick: () => go(i) }, i + 1))),
      h('div', { class: 'nav' },
        h('button', { class: 'btn', onclick: () => go(questions.length - 1) }, arrow('back'), ' ', t('part.back')),
        saveState,
        h('button', { class: 'btn primary big', onclick: submit }, t('part.submit'))));
  }

  async function submit() {
    const open = questions.filter((q) => !isAnswered(q)).length;
    if (!confirm(open ? t('part.submit.confirm.open', { n: open }) : t('part.submit.confirm'))) return;
    try {
      await flush();
      await api(`${P}/submit`, { method: 'POST', body: {} });
      clearInterval(iv);
      location.reload();
    } catch (e) { toast(errText(e), 'err'); }
  }

  function render() {
    setSave(saveKey);
    page = () => {
      const body = idx < 0 ? start() : idx >= questions.length ? overview() : question();
      return h('div', { class: 'p-shell' },
        h('header', { class: 'p-head' }, brand(), idx >= 0 ? progress() : null, timer, h('span', { class: 'who muted small' }, participant.name), langSwitcher(onLang)),
        h('main', { class: 'p-main' }, body));
    };
    paint();
  }
  // Sprachwechsel auf der Aufgabenseite: gleiche Position, Antworten stammen aus dem lokalen Stand
  render();
}
