// Admin-Seite "Sprachen": Übersetzungen verwalten, maschinell erzeugen, prüfen und korrigieren.
import { h, api, toast } from './dom.js';

const PROVIDER = { libretranslate: 'LibreTranslate', deepl: 'DeepL', none: 'nicht eingerichtet' };
const GSTATUS = { missing: ['fehlt', 'lv-low'], stale: ['veraltet (Original geändert)', 'lv-mid'], ok: ['übersetzt', 'lv-pending'] };
const KIND_LABEL = { ui: 'Oberfläche', topic: 'Themenbereich', survey: 'Abfrage', question: 'Frage' };
const PAGE_SIZE = 60;

// Button mit Ladezustand: deaktiviert und zeigt "Übersetze …", solange fn läuft.
async function busy(btn, fn) {
  const old = btn.textContent;
  btn.disabled = true; btn.textContent = 'Übersetze …';
  try { return await fn(); } finally { btn.disabled = false; btn.textContent = old; }
}

// Ergebnis von POST auto als Toast und (optional) Meldungsbereich anzeigen.
function showResult(r, box) {
  const msg = `${r.translated} übersetzt, ${r.skipped} übersprungen, ${r.failed} fehlgeschlagen`;
  toast(msg, r.failed ? 'err' : 'ok');
  if (!box) return;
  box.replaceChildren(h('div', { class: 'callout' }, h('b', {}, msg), r.errors?.length ? h('ul', { class: 'lang-errors' }, r.errors.slice(0, 20).map((e) => h('li', {}, e)), r.errors.length > 20 ? h('li', {}, `… und ${r.errors.length - 20} weitere`) : null) : null));
}

// Übersetzungen einer Sprache löschen (nach Rückfrage). kinds leer = alles.
async function wipe(code, name, label, kinds) {
  if (!confirm(`${label} in ${name} wirklich löschen? Das deutsche Original bleibt erhalten. Die Übersetzung kann danach neu erzeugt werden, manuelle Korrekturen gehen verloren.`)) return false;
  try {
    const r = await api(`/translations/${code}${kinds ? `?kinds=${kinds.join(',')}` : ''}`, { method: 'DELETE' });
    toast(`${r.deleted} Einträge gelöscht`, 'ok');
    return true;
  } catch (err) { toast(err.message, 'err'); return false; }
}

const progress = (done, total) => h('span', { class: total && done >= total ? 'lang-done' : '' }, `${done}/${total}`);

// ------------------------------------------------------------------ Übersicht
export async function languagesPage(layout) {
  const st = await api('/translate/status');
  const info = h('div', { class: 'lang-msg' });
  const ok = st.configured && st.reachable;

  const hint = !st.configured
    ? h('div', { class: 'callout' }, h('b', {}, 'Es ist noch kein Übersetzer eingerichtet. '),
      'Lokal starten mit ', h('code', {}, 'docker compose up -d translate'), ' und die Umgebungsvariable ', h('code', {}, 'TRANSLATE_URL'), ' setzen (z. B. ', h('code', {}, 'http://translate:5000'), '), oder alternativ ', h('code', {}, 'DEEPL_API_KEY'), ' hinterlegen. Danach die Anwendung neu starten.')
    : !st.reachable
      ? h('div', { class: 'callout' }, h('b', {}, 'Der Übersetzer ist nicht erreichbar. '),
        'Bitte prüfen, ob der Dienst läuft (', h('code', {}, 'docker compose up -d translate'), '; beim ersten Start lädt er die Sprachmodelle und braucht einige Minuten) und ', h('code', {}, 'TRANSLATE_URL'), ' bzw. ', h('code', {}, 'DEEPL_API_KEY'), ' stimmen.')
      : null;

  const rows = st.languages.map((l) => {
    const unsupported = st.supported && !st.supported.includes(l.code);
    const all = h('button', { class: 'btn small primary', disabled: !ok || unsupported, title: unsupported ? 'Vom Übersetzer nicht unterstützt' : '', onclick: (e) => busy(e.currentTarget, async () => {
      try { const r = await api(`/translations/${l.code}/auto`, { method: 'POST', body: {} }); showResult(r, info); languagesPage(layout); } catch (err) { toast(err.message, 'err'); }
    }) }, 'Alles übersetzen');
    return h('tr', {},
      h('td', {}, h('b', {}, l.name), ' ', h('span', { class: 'tag' }, l.code), l.rtl ? h('span', { class: 'muted small' }, ' (rechts nach links)') : null,
        unsupported ? h('div', { class: 'small warn' }, 'Vom Übersetzer nicht unterstützt – nur manuelle Übersetzung möglich.') : null),
      h('td', {}, progress(l.ui.translated, l.ui.total), l.ui.stale ? h('div', { class: 'small warn' }, `${l.ui.stale} veraltet`) : null),
      h('td', {}, progress(l.content.translated, l.content.total),
        h('div', { class: 'small muted' }, `${l.content.reviewed} geprüft`), l.content.stale ? h('div', { class: 'small warn' }, `${l.content.stale} veraltet`) : null),
      h('td', { class: 'right' }, all, ' ', h('a', { class: 'btn small', href: `#/languages/${l.code}` }, 'Bearbeiten'), ' ',
        h('button', { class: 'btn small danger', onclick: async () => { if (await wipe(l.code, l.name, 'Alle Übersetzungen', null)) languagesPage(layout); } }, 'Löschen')));
  });

  // Sprachen freigeben: Auswahl aus dem ganzen Katalog, wird in der Datenbank gespeichert
  const boxes = (st.available || []).map((l) => {
    const unsupported = st.supported && !st.supported.includes(l.code);
    const cb = h('input', { type: 'checkbox', id: `lang-on-${l.code}`, value: l.code, checked: l.enabled });
    return h('label', { class: 'lang-pick', for: `lang-on-${l.code}` }, cb, ' ', h('b', {}, l.name), ' ', h('span', { class: 'tag' }, l.code),
      unsupported ? h('span', { class: 'small warn' }, ' Übersetzer lädt diese Sprache nicht') : null);
  });
  const manage = h('details', { class: 'card' },
    h('summary', {}, h('b', {}, 'Sprachen freigeben'), h('span', { class: 'muted small' }, ` · ${st.languages.length} aktiv`)),
    h('p', { class: 'muted small' }, 'Hier legst du fest, in welche Sprachen übersetzt wird und welche Teilnehmer wählen können. Abgewählte Sprachen werden nur ausgeblendet, ihre Übersetzungen bleiben gespeichert. ',
      'Der Übersetzer selbst lädt nur die Sprachen aus ', h('code', {}, 'TRANSLATE_LOAD_LANGS'), ' (Standard: wie ', h('code', {}, 'ENABLED_LANGS'), '). Für Sprachen mit Hinweis dort ergänzen und den Container ', h('code', {}, 'translate'), ' neu starten.'),
    h('div', { class: 'lang-picks' }, boxes),
    h('button', { class: 'btn primary', onclick: async (e) => {
      const codes = [...e.currentTarget.parentElement.querySelectorAll('input:checked')].map((i) => i.value);
      try { await api('/languages/enabled', { method: 'PUT', body: { codes } }); toast('Sprachen gespeichert', 'ok'); languagesPage(layout); } catch (err) { toast(err.message, 'err'); }
    } }, 'Speichern'));

  layout('languages',
    h('div', { class: 'pagehead' }, h('h1', {}, 'Sprachen')),
    h('p', { class: 'muted' }, 'Fragen und Oberfläche werden auf Deutsch gepflegt und maschinell in die aktivierten Sprachen übersetzt. Maschinelle Übersetzungen können hier korrigiert und als „geprüft“ markiert werden.'),
    h('div', { class: 'card' },
      h('div', { class: 'row between' }, h('h2', {}, 'Übersetzer'),
        h('span', { class: 'badge ' + (ok ? 'lv-ok' : 'lv-low') }, ok ? 'bereit' : st.configured ? 'nicht erreichbar' : 'nicht eingerichtet')),
      h('p', {}, 'Dienst: ', h('b', {}, PROVIDER[st.provider] || st.provider), st.supported ? h('span', { class: 'muted' }, ` · ${st.supported.length} Sprachen unterstützt`) : null),
      hint),
    info,
    manage,
    h('div', { class: 'card flush scroll' }, st.languages.length ? h('table', { class: 'tbl lang-tbl' },
      h('thead', {}, h('tr', {}, ['Sprache', 'Oberfläche', 'Inhalte', ''].map((t) => h('th', {}, t)))),
      h('tbody', {}, rows)) : h('p', { class: 'muted', style: { padding: '1rem' } }, 'Keine Sprachen aktiviert. Wähle oben unter „Sprachen freigeben“ mindestens eine aus.')));
}

// ------------------------------------------------------------------ Detailansicht
export async function languageDetailPage(layout, code) {
  const [st, data] = await Promise.all([api('/translate/status'), api(`/translations/${encodeURIComponent(code)}`)]);
  const lang = st.languages.find((l) => l.code === code) || { code, name: code, rtl: false };
  const ok = st.configured && st.reachable;
  const unsupported = st.supported && !st.supported.includes(code);
  const canAuto = ok && !unsupported;
  let groups = data.groups;
  let filter = 'all', text = '', shown = PAGE_SIZE;
  const open = new Set();
  const gkey = (g) => `${g.kind}:${g.ref_id}`;
  const info = h('div', { class: 'lang-msg' });
  const list = h('div', { class: 'lang-list' });
  const count = h('span', { class: 'muted small' });

  async function reload() {
    groups = (await api(`/translations/${encodeURIComponent(code)}`)).groups;
    draw();
  }

  const autoBtn = (label, kinds) => h('button', { class: 'btn', disabled: !canAuto, onclick: (e) => busy(e.currentTarget, async () => {
    try { const r = await api(`/translations/${code}/auto`, { method: 'POST', body: { kinds } }); showResult(r, info); await reload(); } catch (err) { toast(err.message, 'err'); }
  }) }, label);

  const matches = (g) => {
    if (filter === 'missing' && g.status !== 'missing') return false;
    if (filter === 'stale' && g.status !== 'stale') return false;
    if (filter === 'unreviewed' && (g.reviewed || g.status === 'missing')) return false;
    if (!text) return true;
    const q = text.toLowerCase();
    return (g.title || '').toLowerCase().includes(q) || g.fields.some((f) => (f.source || '').toLowerCase().includes(q) || (f.text || '').toLowerCase().includes(q));
  };

  function groupEl(g) {
    const [stLabel, stCls] = g.reviewed && g.status !== 'missing' ? ['geprüft', 'lv-ok'] : GSTATUS[g.status];
    const body = h('div', { class: 'lang-body' });
    const el = h('details', { class: 'topicgroup lang-group', open: open.has(gkey(g)) },
      h('summary', {}, h('span', { class: 'tag' }, KIND_LABEL[g.kind] || g.kind), ' ', h('b', {}, g.title), g.subtitle ? h('span', { class: 'muted small' }, ` · ${g.subtitle}`) : null, ' ', h('span', { class: 'badge ' + stCls }, stLabel)),
      body);
    const fill = () => {
      if (body.dataset.filled) return;
      body.dataset.filled = '1';
      const inputs = new Map();
      const fields = g.fields.map((f) => {
        const long = (f.source || '').length > 70 || /\n/.test(f.source || '');
        const input = long
          ? h('textarea', { rows: Math.min(8, Math.max(2, Math.ceil((f.source || '').length / 60))) }, f.text ?? '')
          : h('input', { type: 'text', value: f.text ?? '' });
        input.setAttribute('placeholder', 'noch nicht übersetzt');
        input.setAttribute('aria-label', f.label);
        if (lang.rtl) input.setAttribute('dir', 'rtl');
        inputs.set(f.key, input);
        return h('div', { class: 'lang-field' }, h('div', { class: 'lang-label small muted' }, f.label), h('div', { class: 'lang-src' }, f.source), input);
      });
      const reviewed = h('input', { type: 'checkbox', checked: g.reviewed });
      const act = (fn) => async (e) => { try { await fn(e.currentTarget); } catch (err) { toast(err.message, 'err'); } };
      body.append(...fields, h('div', { class: 'row lang-actions' },
        h('label', { class: 'symopt' }, reviewed, ' Als geprüft markieren'),
        h('button', { class: 'btn primary small', onclick: act(async () => {
          const texts = {};
          for (const [k, i] of inputs) if (i.value.trim()) texts[k] = i.value;
          await api(`/translations/${code}/${g.kind}/${g.ref_id}`, { method: 'PUT', body: { texts, reviewed: reviewed.checked } });
          toast('Gespeichert', 'ok'); await reload();
        }) }, 'Speichern'),
        h('button', { class: 'btn small', disabled: !canAuto, onclick: (e) => busy(e.currentTarget, async () => {
          try {
            if (g.status === 'ok' && !confirm('Vorhandene Übersetzung (auch manuelle Korrekturen) wird überschrieben. Fortfahren?')) return;
            const r = await api(`/translations/${code}/auto`, { method: 'POST', body: { only: { kind: g.kind, ref_id: g.ref_id }, force: true } });
            showResult(r, info); await reload();
          } catch (err) { toast(err.message, 'err'); }
        }) }, 'Neu übersetzen'),
        h('button', { class: 'btn small danger', disabled: g.status === 'missing', onclick: act(async () => {
          if (!confirm('Übersetzung dieser Gruppe verwerfen?')) return;
          await api(`/translations/${code}/${g.kind}/${g.ref_id}`, { method: 'DELETE' });
          toast('Übersetzung verworfen', 'ok'); await reload();
        }) }, 'Verwerfen')));
    };
    el.addEventListener('toggle', () => { if (el.open) { open.add(gkey(g)); fill(); } else open.delete(gkey(g)); });
    if (el.open) fill();
    return el;
  }

  function draw() {
    const f = groups.filter(matches);
    count.textContent = `${f.length} von ${groups.length} Gruppen`;
    list.replaceChildren(...f.slice(0, shown).map(groupEl),
      f.length > shown ? h('button', { class: 'btn', onclick: () => { shown += PAGE_SIZE; draw(); } }, `Weitere anzeigen (${f.length - shown} übrig)`) : null,
      f.length ? null : h('p', { class: 'muted' }, 'Keine passenden Einträge.'));
  }

  const filters = [['all', 'Alle'], ['missing', 'Fehlend'], ['stale', 'Veraltet'], ['unreviewed', 'Ungeprüft']];
  const sel = h('select', { 'aria-label': 'Filter', onchange: (e) => { filter = e.target.value; shown = PAGE_SIZE; draw(); } }, filters.map(([k, l]) => h('option', { value: k }, l)));
  const search = h('input', { type: 'search', placeholder: 'Suchen …', oninput: (e) => { text = e.target.value; shown = PAGE_SIZE; draw(); } });

  layout('languages',
    h('div', { class: 'pagehead' }, h('a', { href: '#/languages', class: 'back' }, '← Sprachen'), h('h1', {}, `${lang.name} `, h('span', { class: 'tag' }, lang.code))),
    !ok ? h('div', { class: 'callout' }, st.configured ? 'Der Übersetzer ist nicht erreichbar – maschinelles Übersetzen ist derzeit nicht möglich, manuelle Eingaben funktionieren weiterhin.' : 'Es ist kein Übersetzer eingerichtet – maschinelles Übersetzen ist nicht möglich, manuelle Eingaben funktionieren weiterhin.') : null,
    unsupported ? h('div', { class: 'callout' }, 'Diese Sprache wird vom Übersetzer nicht unterstützt – nur manuelle Übersetzung möglich.') : null,
    h('div', { class: 'card row' }, autoBtn('Oberfläche übersetzen', ['ui']), autoBtn('Themen & Abfragen übersetzen', ['topic', 'survey']), autoBtn('Fragen übersetzen', ['question'])),
    h('div', { class: 'card row' }, h('span', { class: 'muted small' }, 'Übersetzungen löschen:'),
      ...[['Oberfläche', ['ui']], ['Themen & Abfragen', ['topic', 'survey']], ['Fragen', ['question']], ['Alle', null]].map(([label, kinds]) =>
        h('button', { class: 'btn small danger', onclick: async () => { if (await wipe(code, lang.name, label === 'Alle' ? 'Alle Übersetzungen' : `Die Übersetzungen (${label})`, kinds)) await reload(); } }, label))),
    info,
    h('div', { class: 'card row lang-filter' }, sel, search, count),
    list);
  draw();
}
