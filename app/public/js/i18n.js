// Mehrsprachigkeit der Teilnehmer-Oberfläche: Wörterbuch laden, t(), Sprachumschalter.
import { h, api } from './dom.js';

const KEY = 'wk-lang';
const dicts = {}; // Sprache -> { schlüssel: text }
let languages = [{ code: 'de', name: 'Deutsch', rtl: false }];
let lang = 'de';

const store = {
  get() { try { return localStorage.getItem(KEY); } catch { return null; } },
  set(v) { try { localStorage.setItem(KEY, v); } catch { /* privater Modus o. Ä. */ } },
};
const known = (c) => languages.some((l) => l.code === c);

async function loadDict(code) {
  if (dicts[code]) return dicts[code];
  try {
    const d = await api(`/i18n/${encodeURIComponent(code)}`);
    dicts[code] = d?.dict || {};
    if (d && typeof d.rtl === 'boolean') { const l = languages.find((x) => x.code === code); if (l) l.rtl = d.rtl; }
  } catch { dicts[code] = dicts[code] || {}; }
  return dicts[code];
}

function applyDoc() {
  const l = languages.find((x) => x.code === lang);
  document.documentElement.lang = lang;
  document.documentElement.dir = l?.rtl ? 'rtl' : 'ltr';
}

function pick(preferred) {
  const fromUrl = new URLSearchParams(location.search).get('lang');
  for (const c of [preferred, fromUrl, store.get()]) if (c && known(c)) return c;
  for (const b of navigator.languages || [navigator.language]) {
    const c = String(b || '').toLowerCase().split('-')[0];
    if (known(c)) return c;
  }
  return 'de';
}

export async function initI18n(preferred) {
  try {
    const r = await api('/languages');
    if (Array.isArray(r?.languages) && r.languages.length) languages = r.languages;
  } catch { /* nur Deutsch */ }
  if (!known('de')) languages.unshift({ code: 'de', name: 'Deutsch', rtl: false });
  lang = pick(preferred);
  const fromUrl = new URLSearchParams(location.search).get('lang');
  if (fromUrl && fromUrl === lang) store.set(lang);
  await Promise.all([loadDict(lang), lang === 'de' ? null : loadDict('de')]);
  applyDoc();
  return lang;
}

export function t(key, vars) {
  let s = dicts[lang]?.[key] ?? dicts.de?.[key] ?? key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
  return s;
}

export const getLang = () => lang;
export const getLanguages = () => languages;
export const getLocale = () => lang;

export async function setLang(code) {
  if (!known(code)) return lang;
  await Promise.all([loadDict(code), code === 'de' ? null : loadDict('de')]);
  lang = code;
  store.set(code);
  try { // eine ?lang=-Angabe darf die spätere Wahl (z. B. nach Neuladen) nicht überstimmen
    const u = new URL(location.href);
    if (u.searchParams.has('lang')) { u.searchParams.delete('lang'); history.replaceState(null, '', u.pathname + u.search + u.hash); }
  } catch { /* egal */ }
  applyDoc();
  return lang;
}

// <select> mit Eigenbezeichnungen; null, wenn es nur eine Sprache gibt
export function langSwitcher(onChange, extraClass = '') {
  if (languages.length < 2) return null;
  const sel = h('select', {
    class: 'langsw ' + extraClass, 'aria-label': t('lang.label'), title: t('lang.label'),
    onchange: async () => { await setLang(sel.value); await onChange?.(lang); },
  }, languages.map((l) => h('option', { value: l.code, selected: l.code === lang, lang: l.code }, l.name)));
  return sel;
}
